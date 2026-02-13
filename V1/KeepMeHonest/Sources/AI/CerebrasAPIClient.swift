import Foundation

final class CerebrasAPIClient {
    var apiKey: String
    private let endpoint = URL(string: "https://api.cerebras.ai/v1/chat/completions")!
    private let session: URLSession

    init(apiKey: String = "") {
        self.apiKey = apiKey
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: config)
    }

    func extractCommitments(from transcript: String) async throws -> [Commitment] {
        guard !apiKey.isEmpty else {
            throw APIError.missingAPIKey
        }

        let prompt = CommitmentExtractor.buildPrompt(for: transcript)

        let body: [String: Any] = [
            "model": "zai-glm-4.7",
            "messages": [
                ["role": "system", "content": prompt.system],
                ["role": "user", "content": prompt.user]
            ],
            "temperature": 0.1
        ]

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, _) = try await performRequest(request)

        // Parse the OpenAI-compatible response: choices[0].message.content
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let firstChoice = choices.first,
              let message = firstChoice["message"] as? [String: Any],
              let content = message["content"] as? String else {
            throw APIError.unexpectedResponseFormat
        }

        return try CommitmentExtractor.parseResponse(content)
    }

    private func performRequest(_ request: URLRequest, retries: Int = 3) async throws -> (Data, HTTPURLResponse) {
        var lastError: Error = APIError.invalidResponse
        for attempt in 0..<retries {
            do {
                let (data, response) = try await session.data(for: request)
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw APIError.invalidResponse
                }

                if httpResponse.statusCode == 200 {
                    return (data, httpResponse)
                }

                if httpResponse.statusCode == 429 {
                    // Check for Retry-After header
                    let retryAfter: Double
                    if let retryHeader = httpResponse.value(forHTTPHeaderField: "Retry-After"),
                       let seconds = Double(retryHeader) {
                        retryAfter = seconds
                    } else {
                        retryAfter = pow(2.0, Double(attempt))
                    }
                    if attempt < retries - 1 {
                        try await Task.sleep(nanoseconds: UInt64(retryAfter * 1_000_000_000))
                        continue
                    }
                    throw APIError.rateLimited
                }

                // Non-429 HTTP errors: don't retry (auth errors, bad requests, etc.)
                let body = String(data: data, encoding: .utf8) ?? "no body"
                throw APIError.httpError(statusCode: httpResponse.statusCode, body: body)

            } catch let error as APIError {
                // Don't retry non-retryable API errors
                switch error {
                case .rateLimited:
                    lastError = error
                    // Already handled above with sleep+continue; if we get here it's the last attempt
                    continue
                case .httpError:
                    throw error
                default:
                    lastError = error
                }
            } catch {
                // Network errors: retry with exponential backoff
                lastError = APIError.networkError(error)
                if attempt < retries - 1 {
                    let delay = pow(2.0, Double(attempt)) // 1s, 2s, 4s
                    try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                }
            }
        }
        throw lastError
    }

    enum APIError: LocalizedError {
        case missingAPIKey
        case networkError(Error)
        case invalidResponse
        case rateLimited
        case httpError(statusCode: Int, body: String)
        case unexpectedResponseFormat

        var errorDescription: String? {
            switch self {
            case .missingAPIKey:
                return "Cerebras API key is not set. Add it in settings."
            case .networkError(let error):
                return "Network error: \(error.localizedDescription)"
            case .invalidResponse:
                return "Received an invalid response from the API."
            case .rateLimited:
                return "API rate limit reached. Will retry shortly."
            case .httpError(let code, let body):
                return "API error (HTTP \(code)): \(body)"
            case .unexpectedResponseFormat:
                return "Unexpected API response format."
            }
        }
    }
}
