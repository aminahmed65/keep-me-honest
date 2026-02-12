import Foundation
import AVFoundation

@Observable
final class AudioManager {
    var hasMicPermission = false
    var hasSystemAudioPermission = false
    var onAudioChunk: (([Float]) -> Void)?

    private let micCapture = MicrophoneCapture()
    private let systemCapture = SystemAudioCapture()
    private let mixer = AudioMixer()
    private var isRunning = false

    init() {
        mixer.onMixedChunk = { [weak self] chunk in
            self?.onAudioChunk?(chunk)
        }

        micCapture.onAudioBuffer = { [weak self] samples in
            self?.mixer.appendMicSamples(samples)
        }

        systemCapture.onAudioBuffer = { [weak self] samples in
            self?.mixer.appendSystemSamples(samples)
        }
    }

    func start() async throws {
        guard !isRunning else { return }

        // Request microphone permission
        hasMicPermission = await micCapture.requestPermission()

        var micStarted = false
        var systemStarted = false

        // Start microphone capture — required
        if hasMicPermission {
            do {
                try micCapture.start()
                micStarted = true
            } catch {
                // Mic failed but we can continue with system audio only
            }
        }

        // Start system audio capture — optional
        do {
            try await systemCapture.start()
            hasSystemAudioPermission = true
            systemStarted = true
        } catch {
            hasSystemAudioPermission = false
            // System audio not available, continue with mic only
        }

        // At least one source must be active
        guard micStarted || systemStarted else {
            throw AudioCaptureError.microphonePermissionDenied
        }

        isRunning = true
    }

    func stop() {
        guard isRunning else { return }
        micCapture.stop()
        systemCapture.stop()
        mixer.flushRemaining()
        mixer.reset()
        isRunning = false
    }
}
