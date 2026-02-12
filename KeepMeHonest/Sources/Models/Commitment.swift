import Foundation

struct Commitment: Identifiable, Codable, Equatable {
    let id: UUID
    let intent: String
    let assignee: String
    let deadline: String
    let contextQuote: String
    let capturedAt: Date
    var isDismissed: Bool

    init(
        id: UUID = UUID(),
        intent: String,
        assignee: String,
        deadline: String,
        contextQuote: String,
        capturedAt: Date = Date(),
        isDismissed: Bool = false
    ) {
        self.id = id
        self.intent = intent
        self.assignee = assignee
        self.deadline = deadline
        self.contextQuote = contextQuote
        self.capturedAt = capturedAt
        self.isDismissed = isDismissed
    }

    var formattedText: String {
        "[ ] \(intent) (assigned to: \(assignee), deadline: \(deadline)) - \"\(contextQuote)\""
    }
}
