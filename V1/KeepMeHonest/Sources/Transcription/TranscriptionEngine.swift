import Foundation

enum ModelState {
    case notLoaded
    case loading(progress: Double)
    case ready
    case error(String)
}

final class TranscriptionEngine {
    private let serverURL = URL(string: "http://localhost:8787")!
    private(set) var modelState: ModelState = .notLoaded

    func setup() async throws {
        modelState = .loading(progress: 0)

        let healthURL = serverURL.appendingPathComponent("health")
        do {
            let (data, response) = try await URLSession.shared.data(from: healthURL)
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                throw TranscriptionError.serverUnavailable
            }
            let result = try JSONDecoder().decode(HealthResponse.self, from: data)
            if result.status == "ready" {
                modelState = .ready
            } else {
                let msg = "Server not ready: \(result.status)"
                modelState = .error(msg)
                throw TranscriptionError.serverNotReady(result.status)
            }
        } catch let error as TranscriptionError {
            modelState = .error(error.localizedDescription)
            throw error
        } catch {
            modelState = .error(error.localizedDescription)
            throw TranscriptionError.serverUnavailable
        }
    }

    func transcribe(audioBuffer: [Float]) async throws -> String {
        guard case .ready = modelState else {
            throw TranscriptionError.modelNotLoaded
        }

        let rawData = audioBuffer.withUnsafeBytes { Data($0) }
        let base64Audio = rawData.base64EncodedString()

        let url = serverURL.appendingPathComponent("transcribe")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(TranscribeRequest(audio: base64Audio))

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw TranscriptionError.transcriptionFailed
        }

        let result = try JSONDecoder().decode(TranscribeResponse.self, from: data)
        return result.text
    }

    // MARK: - Codable Models

    private struct HealthResponse: Decodable {
        let status: String
    }

    private struct TranscribeRequest: Encodable {
        let audio: String
    }

    private struct TranscribeResponse: Decodable {
        let text: String
    }

    enum TranscriptionError: LocalizedError {
        case modelNotLoaded
        case serverUnavailable
        case serverNotReady(String)
        case transcriptionFailed

        var errorDescription: String? {
            switch self {
            case .modelNotLoaded:
                return "Transcription model is not loaded."
            case .serverUnavailable:
                return "Transcription server is not running. Start it with: cd transcription-server && ./start.sh"
            case .serverNotReady(let status):
                return "Transcription server not ready: \(status)"
            case .transcriptionFailed:
                return "Transcription request failed."
            }
        }
    }
}
