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

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            if httpResponse.statusCode == 429 {
                throw APIError.rateLimited
            }
            let body = String(data: data, encoding: .utf8) ?? "no body"
            throw APIError.httpError(statusCode: httpResponse.statusCode, body: body)
        }

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
