import Foundation
import os.log

class CommitmentExtractionService {
    static let shared = CommitmentExtractionService()

    private static let keychainService = "com.fluidvoice.app"
    private static let keychainAccount = "openrouter-api-key"

    private func buildSystemPrompt() -> String {
        var prompt = """
        You analyze speech transcripts to find promises and commitments the speaker made.

        IMPORTANT — This is spoken conversation, not written text. People repeat themselves, rephrase, and elaborate on the same commitment. You must understand the INTENT, not just pattern-match on phrases.

        DEDUPLICATION RULE: If someone says "I can get that to you next week" and then follows up with "I'll send you the full Google document tomorrow", that is ONE promise (send the document) — the first statement was a vague reference to the same thing they then clarified. Always merge related statements into a single promise. Use the most specific version as the promise description, and combine the context into one quote.

        For each distinct promise found, extract:
        - "promise": Short actionable description (use the most specific/concrete version)
        - "assigned_to": Who it was promised to (use their name if mentioned, or "unknown")
        - "deadline": The most specific deadline mentioned (or "none")
        - "context_quote": The key phrase(s) from the transcript that capture the commitment

        What counts as a promise:
        - Concrete commitments: "I'll send you X", "I'll get that done", "I can do that by Friday"
        - Taking ownership: "Let me take care of that", "I'll handle it"
        - Delivery commitments: "I'll get back to you", "You'll have it by Monday"

        What does NOT count:
        - Vague maybes: "I might look into it", "maybe I'll check"
        - Questions: "Should I send that?", "Want me to handle it?"
        - Past tense: "I already sent it", "I took care of that"
        - Other people's promises: "John said he'd do it"
        - Social pleasantries: "I'll talk to you later", "have a great weekend"
        - Filler/hedging that gets clarified: if someone says "I can probably get that to you" then immediately clarifies with a concrete promise, only count the concrete one

        Think about what the speaker actually committed to DO, not how many times they referenced it. Fewer, accurate promises are better than many duplicates.

        Always respond with the JSON schema provided. If no promises found, return an empty promises array with a summary explaining why.
        """

        let people = PeopleStore.shared.enrichedNames
        if !people.isEmpty {
            prompt += "\n\nPeople you commonly talk to: \(people.joined(separator: ", ")). Use these exact name spellings when attributing promises."
        }

        return prompt
    }

    private static let responseFormat: [String: Any] = [
        "type": "json_schema",
        "json_schema": [
            "name": "promise_extraction",
            "strict": true,
            "schema": [
                "type": "object",
                "properties": [
                    "promises": [
                        "type": "array",
                        "items": [
                            "type": "object",
                            "properties": [
                                "promise": ["type": "string", "description": "What was promised"],
                                "assigned_to": ["type": "string", "description": "Who it was promised to"],
                                "deadline": ["type": "string", "description": "When, or 'none'"],
                                "context_quote": ["type": "string", "description": "Exact words from transcript"]
                            ],
                            "required": ["promise", "assigned_to", "deadline", "context_quote"],
                            "additionalProperties": false
                        ]
                    ],
                    "summary": [
                        "type": "string",
                        "description": "Brief natural language summary of findings"
                    ]
                ],
                "required": ["promises", "summary"],
                "additionalProperties": false
            ]
        ]
    ]

    private init() {}

    var hasAPIKey: Bool {
        KeychainService.shared.getQuietly(
            service: Self.keychainService,
            account: Self.keychainAccount
        ) != nil
    }

    func saveAPIKey(_ key: String) {
        KeychainService.shared.saveQuietly(
            key,
            service: Self.keychainService,
            account: Self.keychainAccount
        )
    }

    func getAPIKey() -> String? {
        KeychainService.shared.getQuietly(
            service: Self.keychainService,
            account: Self.keychainAccount
        )
    }

    // MARK: - Extraction

    func extract(from transcript: String) async throws -> [ExtractedCommitment] {
        guard let apiKey = getAPIKey(), !apiKey.isEmpty else {
            Logger.commitments.warningDev("No OpenRouter API key configured — skipping extraction")
            return []
        }

        guard !transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return []
        }

        Logger.commitments.infoDev("Sending transcript to OpenRouter for commitment extraction (\(transcript.count) chars)")

        let url = URL(string: "https://openrouter.ai/api/v1/chat/completions")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("KeepMeHonest", forHTTPHeaderField: "X-Title")

        let body: [String: Any] = [
            "model": "google/gemini-3-flash-preview",
            "messages": [
                ["role": "system", "content": buildSystemPrompt()],
                ["role": "user", "content": "Analyze this transcript for promises:\n\n\(transcript)"]
            ],
            "response_format": Self.responseFormat,
            "temperature": 0.1
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ExtractionError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            let errorBody = String(data: data, encoding: .utf8) ?? "unknown"
            Logger.commitments.errorDev("OpenRouter API error \(httpResponse.statusCode): \(errorBody)")
            throw ExtractionError.apiError(statusCode: httpResponse.statusCode, body: errorBody)
        }

        // Parse OpenAI-compatible response
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard let choices = json?["choices"] as? [[String: Any]],
              let message = choices.first?["message"] as? [String: Any],
              let content = message["content"] as? String else {
            throw ExtractionError.invalidResponse
        }

        Logger.commitments.infoDev("OpenRouter response: \(content.prefix(200))")

        // Structured output returns clean JSON — no fence stripping needed
        guard let jsonData = content.data(using: .utf8) else {
            throw ExtractionError.parseError
        }

        let result = try JSONDecoder().decode(ExtractionResult.self, from: jsonData)
        Logger.commitments.infoDev("Extracted \(result.promises.count) promise(s): \(result.summary)")
        return result.promises
    }
}

enum ExtractionError: Error, LocalizedError {
    case noAPIKey
    case invalidResponse
    case apiError(statusCode: Int, body: String)
    case parseError

    var errorDescription: String? {
        switch self {
        case .noAPIKey: return "No OpenRouter API key configured"
        case .invalidResponse: return "Invalid response from OpenRouter"
        case .apiError(let code, let body): return "API error \(code): \(body)"
        case .parseError: return "Failed to parse commitment JSON"
        }
    }
}
