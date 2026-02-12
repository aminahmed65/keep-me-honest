import Foundation

@Observable
final class CommitmentStore {
    var commitments: [Commitment] = []

    var activeCommitments: [Commitment] {
        commitments
            .filter { !$0.isDismissed }
            .sorted { $0.capturedAt > $1.capturedAt }
    }

    private let fileURL: URL

    init() {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("KeepMeHonest", isDirectory: true)
        self.fileURL = dir.appendingPathComponent("commitments.json")

        // Ensure directory exists
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        load()
    }

    func add(_ commitment: Commitment) {
        commitments.append(commitment)
        save()
    }

    func dismiss(_ commitment: Commitment) {
        guard let index = commitments.firstIndex(where: { $0.id == commitment.id }) else { return }
        commitments[index].isDismissed = true
        save()
    }

    func delete(_ commitment: Commitment) {
        commitments.removeAll { $0.id == commitment.id }
        save()
    }

    func clearAll() {
        commitments.removeAll()
        save()
    }

    // MARK: - Persistence

    func load() {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        do {
            let data = try Data(contentsOf: fileURL)
            commitments = try JSONDecoder().decode([Commitment].self, from: data)
        } catch {
            print("[CommitmentStore] Failed to load: \(error.localizedDescription)")
        }
    }

    func save() {
        do {
            let data = try JSONEncoder().encode(commitments)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            print("[CommitmentStore] Failed to save: \(error.localizedDescription)")
        }
    }
}
