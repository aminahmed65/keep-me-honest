import Foundation

enum CommitmentExtractor {
    static let systemPrompt = """
        You are analyzing a meeting transcript to extract personal commitments and action items.

        Rules:
        - Only extract clear commitments, promises, or volunteered action items
        - The "assignee" should be "self" if the speaker is committing to do something, or the person's name if someone else committed
        - For "deadline", extract any mentioned timeline. Use "unspecified" if none given
        - The "context_quote" should be the near-exact words from the transcript
        - Return ONLY a JSON array, no markdown, no explanation

        JSON format: [{"intent": "...", "assignee": "...", "deadline": "...", "context_quote": "..."}]
        If no commitments found, return: []
        """

    static func buildPrompt(for transcript: String) -> (system: String, user: String) {
        (system: systemPrompt, user: "Transcript:\n\(transcript)")
    }

    static func parseResponse(_ responseText: String) throws -> [Commitment] {
        // Strip markdown code fences if present
        var cleaned = responseText.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.hasPrefix("```json") {
            cleaned = String(cleaned.dropFirst(7))
        } else if cleaned.hasPrefix("```") {
            cleaned = String(cleaned.dropFirst(3))
        }
        if cleaned.hasSuffix("```") {
            cleaned = String(cleaned.dropLast(3))
        }
        cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !cleaned.isEmpty else { return [] }
        // Handle literal empty array
        if cleaned == "[]" { return [] }

        guard let data = cleaned.data(using: .utf8) else {
            throw ExtractionError.invalidJSON
        }

        // Decode from API's snake_case JSON into Commitment structs
        let raw: [[String: String]]
        do {
            raw = try JSONDecoder().decode([[String: String]].self, from: data)
        } catch {
            throw ExtractionError.decodingFailed(error)
        }

        return raw.compactMap { dict in
            guard let intent = dict["intent"],
                  let assignee = dict["assignee"],
                  let deadline = dict["deadline"],
                  let contextQuote = dict["context_quote"] else {
                return nil
            }
            return Commitment(
                intent: intent,
                assignee: assignee,
                deadline: deadline,
                contextQuote: contextQuote
            )
        }
    }

    enum ExtractionError: LocalizedError {
        case invalidJSON
        case decodingFailed(Error)

        var errorDescription: String? {
            switch self {
            case .invalidJSON:
                return "The AI response was not valid JSON."
            case .decodingFailed(let error):
                return "Failed to decode commitments: \(error.localizedDescription)"
            }
        }
    }
}
