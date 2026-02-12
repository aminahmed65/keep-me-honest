import Foundation
import SwiftUI

@Observable
final class AppState {
    var isListening = false
    var isProcessing = false
    var lastProcessedAt: Date?
    var errorMessage: String?
    var apiKey: String {
        didSet { UserDefaults.standard.set(apiKey, forKey: "cerebras_api_key") }
    }
    var bufferThreshold: Int {
        didSet { UserDefaults.standard.set(bufferThreshold, forKey: "buffer_threshold") }
    }

    let commitmentStore = CommitmentStore()
    let audioManager = AudioManager()
    let transcriptionManager = TranscriptionManager()
    let aiManager = AIManager()

    init() {
        self.apiKey = UserDefaults.standard.string(forKey: "cerebras_api_key") ?? ""
        self.bufferThreshold = UserDefaults.standard.integer(forKey: "buffer_threshold")
        if bufferThreshold == 0 { bufferThreshold = 500 }
    }

    func startListening() async {
        guard !isListening else { return }
        errorMessage = nil

        do {
            try await audioManager.start()
            transcriptionManager.startProcessing(audioSource: audioManager)
            aiManager.configure(apiKey: apiKey, threshold: bufferThreshold)
            aiManager.startMonitoring(transcriptionSource: transcriptionManager) { [weak self] commitments in
                guard let self else { return }
                for commitment in commitments {
                    self.commitmentStore.add(commitment)
                }
                self.lastProcessedAt = Date()
            }
            isListening = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func stopListening() {
        audioManager.stop()
        transcriptionManager.stopProcessing()
        aiManager.stopMonitoring()
        isListening = false
    }
}
