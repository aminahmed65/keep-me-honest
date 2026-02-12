import Foundation

@Observable
final class TranscriptionManager {
    var currentTranscript = ""
    var wordCount: Int { currentTranscript.split(separator: " ").count }
    var isModelLoaded = false
    var modelLoadingError: String?
    var onNewSegment: ((String) -> Void)?

    private let engine = TranscriptionEngine()
    private var processingTask: Task<Void, Never>?
    private var isActive = false

    func startProcessing(audioSource: AudioManager) {
        guard !isActive else { return }
        isActive = true

        // Load the model if needed
        processingTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await self.engine.setup()
                await MainActor.run { self.isModelLoaded = true }
            } catch {
                await MainActor.run {
                    self.modelLoadingError = error.localizedDescription
                }
                return
            }
        }

        // Connect to audio chunks
        audioSource.onAudioChunk = { [weak self] audioBuffer in
            guard let self, self.isActive else { return }
            Task { [weak self] in
                await self?.processAudioChunk(audioBuffer)
            }
        }
    }

    func stopProcessing() {
        isActive = false
        processingTask?.cancel()
        processingTask = nil
    }

    func resetTranscript() {
        currentTranscript = ""
    }

    private func processAudioChunk(_ audioBuffer: [Float]) async {
        guard isActive, isModelLoaded else { return }

        do {
            let text = try await engine.transcribe(audioBuffer: audioBuffer)
            guard !text.isEmpty else { return }

            await MainActor.run { [weak self] in
                guard let self else { return }
                if !self.currentTranscript.isEmpty {
                    self.currentTranscript += " "
                }
                self.currentTranscript += text
                self.onNewSegment?(text)
            }
        } catch {
            print("[TranscriptionManager] Transcription error: \(error.localizedDescription)")
        }
    }
}
