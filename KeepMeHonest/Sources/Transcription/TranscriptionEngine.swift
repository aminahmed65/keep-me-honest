import Foundation
import WhisperKit

enum ModelState {
    case notLoaded
    case loading(progress: Double)
    case ready
    case error(String)
}

final class TranscriptionEngine {
    private var whisperKit: WhisperKit?
    private(set) var modelState: ModelState = .notLoaded

    func setup() async throws {
        modelState = .loading(progress: 0)

        do {
            let config = WhisperKitConfig(
                model: "base.en",
                verbose: false,
                prewarm: true
            )
            let kit = try await WhisperKit(config)
            self.whisperKit = kit
            modelState = .ready
        } catch {
            modelState = .error(error.localizedDescription)
            throw error
        }
    }

    func transcribe(audioBuffer: [Float]) async throws -> String {
        guard let whisperKit else {
            throw TranscriptionError.modelNotLoaded
        }

        let result = try await whisperKit.transcribe(
            audioArray: audioBuffer
        )

        // WhisperKit returns an array of TranscriptionResult
        let text = result
            .compactMap(\.text)
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        return text
    }

    enum TranscriptionError: LocalizedError {
        case modelNotLoaded

        var errorDescription: String? {
            switch self {
            case .modelNotLoaded:
                return "Whisper model is not loaded. Please wait for initialization."
            }
        }
    }
}
