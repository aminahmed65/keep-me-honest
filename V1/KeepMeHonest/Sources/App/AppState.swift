import Foundation
import SwiftUI

@Observable
final class AppState {
    private static let defaultAPIKey = "csk-k8tjfmpvh92x6tkkhceykmvnx2vnvt4ffcjh53rpdvkkc3f9"

    var isListening = false
    var isProcessing = false
    var lastProcessedAt: Date?
    var errorMessage: String?
    var apiKey: String {
        didSet { KeychainHelper.save(key: "cerebras_api_key", value: apiKey) }
    }
    let commitmentStore = CommitmentStore()
    let audioManager = AudioManager()
    let transcriptionManager = TranscriptionManager()
    let aiManager = AIManager()
    let meetingDetector = MeetingDetector()

    init() {
        // Migrate any existing UserDefaults key to Keychain
        if let legacyKey = UserDefaults.standard.string(forKey: "cerebras_api_key"), !legacyKey.isEmpty {
            if KeychainHelper.load(key: "cerebras_api_key") == nil {
                KeychainHelper.save(key: "cerebras_api_key", value: legacyKey)
            }
            UserDefaults.standard.removeObject(forKey: "cerebras_api_key")
        }

        // Load from Keychain, fall back to hardcoded default
        if let saved = KeychainHelper.load(key: "cerebras_api_key"), !saved.isEmpty {
            self.apiKey = saved
        } else {
            self.apiKey = Self.defaultAPIKey
            KeychainHelper.save(key: "cerebras_api_key", value: Self.defaultAPIKey)
        }

        // Wire up meeting auto-detection
        meetingDetector.onMeetingStarted = { [weak self] in
            guard let self, !self.isListening else { return }
            Task { await self.startListening() }
        }
        meetingDetector.onMeetingEnded = { [weak self] in
            guard let self, self.isListening else { return }
            self.stopListening()
        }
        meetingDetector.startMonitoring()
    }

    /// Start listening. Only allowed when a meeting is active.
    func startListening() async {
        guard !isListening else { return }
        guard meetingDetector.isMeetingActive else {
            errorMessage = "No meeting detected. Listening starts automatically when you join a meeting."
            return
        }
        errorMessage = nil

        do {
            try await audioManager.start()
            transcriptionManager.startProcessing(audioSource: audioManager)
            aiManager.configure(apiKey: apiKey)
            aiManager.onError = { [weak self] message in
                self?.errorMessage = message
            }
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
        errorMessage = nil
    }
}
