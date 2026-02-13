import Foundation
import AVFoundation

@Observable
final class AudioManager {
    var hasMicPermission = false
    var hasSystemAudioPermission = false
    var onAudioChunk: (([Float]) -> Void)?
    var onMicChunk: (([Float]) -> Void)?
    var onSystemChunk: (([Float]) -> Void)?

    private let micCapture = MicrophoneCapture()
    private let systemCapture = SystemAudioCapture()
    private let mixer = AudioMixer()
    private var isRunning = false

    private var micAccumulator: [Float] = []
    private var systemAccumulator: [Float] = []
    private let accumulatorLock = NSLock()
    private let chunkSize = 160_000 // ~10 seconds at 16kHz

    init() {
        mixer.onMixedChunk = { [weak self] chunk in
            self?.onAudioChunk?(chunk)
        }

        micCapture.onAudioBuffer = { [weak self] samples in
            guard let self else { return }
            self.mixer.appendMicSamples(samples)

            self.accumulatorLock.lock()
            self.micAccumulator.append(contentsOf: samples)
            if self.micAccumulator.count >= self.chunkSize {
                let chunk = Array(self.micAccumulator.prefix(self.chunkSize))
                self.micAccumulator.removeFirst(self.chunkSize)
                self.accumulatorLock.unlock()
                self.onMicChunk?(chunk)
            } else {
                self.accumulatorLock.unlock()
            }
        }

        systemCapture.onAudioBuffer = { [weak self] samples in
            guard let self else { return }
            self.mixer.appendSystemSamples(samples)

            self.accumulatorLock.lock()
            self.systemAccumulator.append(contentsOf: samples)
            if self.systemAccumulator.count >= self.chunkSize {
                let chunk = Array(self.systemAccumulator.prefix(self.chunkSize))
                self.systemAccumulator.removeFirst(self.chunkSize)
                self.accumulatorLock.unlock()
                self.onSystemChunk?(chunk)
            } else {
                self.accumulatorLock.unlock()
            }
        }

        systemCapture.onError = { [weak self] error in
            print("[AudioManager] System audio capture stopped: \(error.localizedDescription)")
            self?.hasSystemAudioPermission = false
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

        // Flush remaining mic/system accumulators
        accumulatorLock.lock()
        let remainingMic = micAccumulator
        let remainingSystem = systemAccumulator
        micAccumulator.removeAll(keepingCapacity: true)
        systemAccumulator.removeAll(keepingCapacity: true)
        accumulatorLock.unlock()

        if !remainingMic.isEmpty {
            onMicChunk?(remainingMic)
        }
        if !remainingSystem.isEmpty {
            onSystemChunk?(remainingSystem)
        }

        isRunning = false
    }
}
