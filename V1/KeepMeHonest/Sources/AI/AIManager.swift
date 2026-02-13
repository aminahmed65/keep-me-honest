import Foundation

@Observable
final class AIManager {
    var isProcessing = false

    private let contextBuffer = ContextBuffer()
    private let apiClient = CerebrasAPIClient()
    private var onCommitments: (([Commitment]) -> Void)?
    var onError: ((String) -> Void)?
    private var isMonitoring = false
    private var processingTask: Task<Void, Never>?
    private var timer: Timer?

    func configure(apiKey: String) {
        apiClient.apiKey = apiKey
    }

    func startMonitoring(
        transcriptionSource: TranscriptionManager,
        onCommitments: @escaping ([Commitment]) -> Void
    ) {
        self.onCommitments = onCommitments
        isMonitoring = true

        transcriptionSource.onNewSegment = { [weak self] text in
            guard let self, self.isMonitoring else { return }
            self.contextBuffer.append(text)
        }

        // Process buffer every 30 seconds
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.timer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
                self?.processBuffer()
            }
        }
    }

    func stopMonitoring() {
        isMonitoring = false
        onCommitments = nil
        timer?.invalidate()
        timer = nil
        processingTask?.cancel()
        processingTask = nil
        contextBuffer.reset()
    }

    private func processBuffer() {
        // Don't fire multiple API calls simultaneously
        guard !isProcessing else { return }

        let transcript = contextBuffer.consume()
        guard !transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        processingTask = Task { [weak self] in
            guard let self else { return }
            self.isProcessing = true
            defer { self.isProcessing = false }

            do {
                let commitments = try await self.apiClient.extractCommitments(from: transcript)
                if !commitments.isEmpty {
                    await MainActor.run {
                        self.onCommitments?(commitments)
                    }
                }
            } catch {
                print("[AIManager] Extraction failed: \(error.localizedDescription)")
                // Re-append transcript so it's not lost after all retries failed
                self.contextBuffer.append(transcript)
                await MainActor.run {
                    self.onError?(error.localizedDescription)
                }
            }
        }
    }
}
