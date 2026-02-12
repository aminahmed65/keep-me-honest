import ScreenCaptureKit
import CoreMedia
import AVFoundation

final class SystemAudioCapture: NSObject, SCStreamOutput {
    var onAudioBuffer: (([Float]) -> Void)?

    private var stream: SCStream?
    private var isRunning = false

    func start() async throws {
        guard !isRunning else { return }

        let availableContent: SCShareableContent
        do {
            availableContent = try await SCShareableContent.excludingDesktopWindows(
                false, onScreenWindowsOnly: false
            )
        } catch {
            throw AudioCaptureError.screenRecordingPermissionDenied
        }

        guard let display = availableContent.displays.first else {
            throw AudioCaptureError.noContentAvailable
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])

        let config = SCStreamConfiguration()
        config.sampleRate = 16000
        config.channelCount = 1
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        // Minimize video overhead since we only need audio
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)

        let stream = SCStream(filter: filter, configuration: config, delegate: nil)
        try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: .global(qos: .userInteractive))
        try await stream.startCapture()

        self.stream = stream
        isRunning = true
    }

    func stop() {
        guard isRunning, let stream else { return }
        Task {
            try? await stream.stopCapture()
        }
        self.stream = nil
        isRunning = false
    }

    // MARK: - SCStreamOutput

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }
        guard let samples = extractFloatSamples(from: sampleBuffer) else { return }
        if !samples.isEmpty {
            onAudioBuffer?(samples)
        }
    }

    private func extractFloatSamples(from sampleBuffer: CMSampleBuffer) -> [Float]? {
        guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { return nil }

        var length = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        let status = CMBlockBufferGetDataPointer(blockBuffer, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &length, dataPointerOut: &dataPointer)
        guard status == kCMBlockBufferNoErr, let dataPointer else { return nil }

        guard let formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc)
        else { return nil }

        let format = asbd.pointee

        // Handle Float32 native format
        if format.mFormatFlags & kAudioFormatFlagIsFloat != 0 && format.mBitsPerChannel == 32 {
            let floatCount = length / MemoryLayout<Float>.size
            let floatPointer = UnsafeRawPointer(dataPointer).bindMemory(to: Float.self, capacity: floatCount)
            return Array(UnsafeBufferPointer(start: floatPointer, count: floatCount))
        }

        // Handle Int16 format — convert to Float32
        if format.mBitsPerChannel == 16 && format.mFormatFlags & kAudioFormatFlagIsSignedInteger != 0 {
            let int16Count = length / MemoryLayout<Int16>.size
            let int16Pointer = UnsafeRawPointer(dataPointer).bindMemory(to: Int16.self, capacity: int16Count)
            let int16Buffer = UnsafeBufferPointer(start: int16Pointer, count: int16Count)
            return int16Buffer.map { Float($0) / Float(Int16.max) }
        }

        return nil
    }
}
