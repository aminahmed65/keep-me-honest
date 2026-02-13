import Foundation

final class AudioMixer: @unchecked Sendable {
    var onMixedChunk: (([Float]) -> Void)?

    private let lock = NSLock()
    private var micBuffer: [Float] = []
    private var systemBuffer: [Float] = []
    private var mixedAccumulator: [Float] = []

    /// Number of samples per output chunk (default ~10 seconds at 16kHz)
    var chunkSize: Int = 160_000

    func appendMicSamples(_ samples: [Float]) {
        lock.lock()
        micBuffer.append(contentsOf: samples)
        let ready = min(micBuffer.count, max(systemBuffer.count, samples.count))
        mixAvailableSamples(minimumCount: ready)
        lock.unlock()
    }

    func appendSystemSamples(_ samples: [Float]) {
        lock.lock()
        systemBuffer.append(contentsOf: samples)
        let ready = min(systemBuffer.count, max(micBuffer.count, samples.count))
        mixAvailableSamples(minimumCount: ready)
        lock.unlock()
    }

    /// Mix whatever overlapping samples are available from both buffers.
    /// If one source has more samples, its excess samples pass through unmodified.
    private func mixAvailableSamples(minimumCount: Int) {
        let micCount = micBuffer.count
        let sysCount = systemBuffer.count
        let count = max(micCount, sysCount)

        guard count >= minimumCount, count > 0 else { return }

        var mixed = [Float](repeating: 0, count: count)

        let overlapCount = min(micCount, sysCount)

        // Average overlapping region
        for i in 0..<overlapCount {
            mixed[i] = (micBuffer[i] + systemBuffer[i]) * 0.5
        }

        // Remainder from whichever is longer
        if micCount > sysCount {
            for i in overlapCount..<micCount {
                mixed[i] = micBuffer[i]
            }
        } else if sysCount > micCount {
            for i in overlapCount..<sysCount {
                mixed[i] = systemBuffer[i]
            }
        }

        micBuffer.removeAll(keepingCapacity: true)
        systemBuffer.removeAll(keepingCapacity: true)

        mixedAccumulator.append(contentsOf: mixed)
        flushChunksIfNeeded()
    }

    private func flushChunksIfNeeded() {
        while mixedAccumulator.count >= chunkSize {
            let chunk = Array(mixedAccumulator.prefix(chunkSize))
            mixedAccumulator.removeFirst(chunkSize)
            onMixedChunk?(chunk)
        }
    }

    /// Flush any remaining accumulated audio (e.g., on stop)
    func flushRemaining() {
        lock.lock()
        // Mix any leftover buffered samples
        let micCount = micBuffer.count
        let sysCount = systemBuffer.count
        if micCount > 0 || sysCount > 0 {
            let count = max(micCount, sysCount)
            var mixed = [Float](repeating: 0, count: count)
            let overlapCount = min(micCount, sysCount)
            for i in 0..<overlapCount {
                mixed[i] = (micBuffer[i] + systemBuffer[i]) * 0.5
            }
            if micCount > sysCount {
                for i in overlapCount..<micCount { mixed[i] = micBuffer[i] }
            } else if sysCount > micCount {
                for i in overlapCount..<sysCount { mixed[i] = systemBuffer[i] }
            }
            micBuffer.removeAll(keepingCapacity: true)
            systemBuffer.removeAll(keepingCapacity: true)
            mixedAccumulator.append(contentsOf: mixed)
        }

        if !mixedAccumulator.isEmpty {
            let chunk = mixedAccumulator
            mixedAccumulator.removeAll(keepingCapacity: true)
            lock.unlock()
            onMixedChunk?(chunk)
            return
        }
        lock.unlock()
    }

    func reset() {
        lock.lock()
        micBuffer.removeAll()
        systemBuffer.removeAll()
        mixedAccumulator.removeAll()
        lock.unlock()
    }
}
