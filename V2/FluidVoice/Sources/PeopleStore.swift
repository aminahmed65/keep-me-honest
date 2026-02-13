import Foundation
import os.log

class PeopleStore: ObservableObject {
    static let shared = PeopleStore()

    @Published var people: [Person] = []

    private let fileURL: URL

    private init() {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let appDir = appSupport.appendingPathComponent("FluidVoice", isDirectory: true)
        try? FileManager.default.createDirectory(at: appDir, withIntermediateDirectories: true)
        self.fileURL = appDir.appendingPathComponent("people.json")
        load()
        migrateFromUserDefaults()
    }

    // MARK: - Computed

    var names: [String] {
        people.map { $0.name }
    }

    var enrichedNames: [String] {
        people.map { person in
            if person.role.isEmpty {
                return person.name
            }
            return "\(person.name) (\(person.role))"
        }
    }

    // MARK: - CRUD

    func add(name: String, role: String = "", notes: String = "") {
        let person = Person(name: name, role: role, notes: notes)
        people.append(person)
        save()
    }

    func remove(id: UUID) {
        people.removeAll { $0.id == id }
        save()
    }

    func update(_ person: Person) {
        if let idx = people.firstIndex(where: { $0.id == person.id }) {
            people[idx] = person
            save()
        }
    }

    // MARK: - Persistence

    private func save() {
        do {
            let data = try JSONEncoder().encode(people)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            Logger.app.errorDev("Failed to save people: \(error.localizedDescription)")
        }
    }

    private func load() {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        do {
            let data = try Data(contentsOf: fileURL)
            people = try JSONDecoder().decode([Person].self, from: data)
            Logger.app.infoDev("Loaded \(people.count) person(s) from disk")
        } catch {
            Logger.app.errorDev("Failed to load people: \(error.localizedDescription)")
        }
    }

    // MARK: - Migration

    private func migrateFromUserDefaults() {
        guard people.isEmpty else { return }
        let raw = UserDefaults.standard.string(forKey: "peopleNames") ?? ""
        let names = raw.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        guard !names.isEmpty else { return }
        for name in names {
            people.append(Person(name: name))
        }
        save()
        UserDefaults.standard.removeObject(forKey: "peopleNames")
        Logger.app.infoDev("Migrated \(names.count) people from UserDefaults to PeopleStore")
    }
}
