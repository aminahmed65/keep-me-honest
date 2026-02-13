import Foundation

final class ContextBuffer: @unchecked Sendable {
    private let lock = NSLock()
    private var buffer: [String] = []

    func append(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        lock.lock()
        buffer.append(trimmed)
        lock.unlock()
    }

    /// Returns the full buffer content and resets, keeping the last 50 words for context overlap.
    func consume() -> String {
        lock.lock()
        defer { lock.unlock() }

        let fullText = buffer.joined(separator: " ")
        let words = fullText.split(separator: " ")

        // Reset buffer, keeping last 50 words for context continuity
        let overlapCount = min(50, words.count)
        let overlapWords = words.suffix(overlapCount)
        let overlap = overlapWords.joined(separator: " ")

        buffer = overlap.isEmpty ? [] : [overlap]

        return fullText
    }

    func reset() {
        lock.lock()
        buffer.removeAll()
        lock.unlock()
    }
}
