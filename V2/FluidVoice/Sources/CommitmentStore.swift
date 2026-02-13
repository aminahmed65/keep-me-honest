import Foundation
import os.log

class CommitmentStore: ObservableObject {
    static let shared = CommitmentStore()

    @Published var commitments: [Commitment] = []

    private let fileURL: URL

    private init() {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let appDir = appSupport.appendingPathComponent("FluidVoice", isDirectory: true)
        try? FileManager.default.createDirectory(at: appDir, withIntermediateDirectories: true)
        self.fileURL = appDir.appendingPathComponent("commitments.json")
        load()
    }

    func add(_ extracted: [ExtractedCommitment]) {
        let new = extracted.map { e in
            Commitment(
                promise: e.promise,
                assignedTo: e.assignedTo == "unknown" ? nil : e.assignedTo,
                deadline: e.deadline == "none" ? nil : e.deadline,
                contextQuote: e.contextQuote
            )
        }
        commitments.insert(contentsOf: new, at: 0)
        save()
        Logger.commitments.infoDev("Added \(new.count) commitment(s). Total: \(commitments.count)")
    }

    func toggleDone(_ id: UUID) {
        if let idx = commitments.firstIndex(where: { $0.id == id }) {
            commitments[idx].isDone.toggle()
            save()
        }
    }

    func dismiss(_ id: UUID) {
        commitments.removeAll { $0.id == id }
        save()
    }

    func clearAll() {
        commitments.removeAll()
        save()
    }

    var activeCount: Int {
        commitments.filter { !$0.isDone }.count
    }

    // MARK: - Persistence

    private func save() {
        do {
            let data = try JSONEncoder().encode(commitments)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            Logger.commitments.errorDev("Failed to save commitments: \(error.localizedDescription)")
        }
    }

    private func load() {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        do {
            let data = try Data(contentsOf: fileURL)
            commitments = try JSONDecoder().decode([Commitment].self, from: data)
            Logger.commitments.infoDev("Loaded \(commitments.count) commitment(s) from disk")
        } catch {
            Logger.commitments.errorDev("Failed to load commitments: \(error.localizedDescription)")
        }
    }
}
