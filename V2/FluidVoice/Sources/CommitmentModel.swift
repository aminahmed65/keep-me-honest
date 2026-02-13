import Foundation

struct Commitment: Codable, Identifiable {
    let id: UUID
    var promise: String
    var assignedTo: String?
    var deadline: String?
    var contextQuote: String
    var isDone: Bool
    let createdAt: Date

    init(promise: String, assignedTo: String? = nil, deadline: String? = nil, contextQuote: String) {
        self.id = UUID()
        self.promise = promise
        self.assignedTo = assignedTo
        self.deadline = deadline
        self.contextQuote = contextQuote
        self.isDone = false
        self.createdAt = Date()
    }
}

/// Wrapper for structured output from the AI (promises + summary)
struct ExtractionResult: Codable {
    let promises: [ExtractedCommitment]
    let summary: String
}

/// The JSON shape we expect back from the AI (structured output guarantees all fields)
struct ExtractedCommitment: Codable {
    let promise: String
    let assignedTo: String   // "unknown" when not identified
    let deadline: String     // "none" when not specified
    let contextQuote: String

    enum CodingKeys: String, CodingKey {
        case promise
        case assignedTo = "assigned_to"
        case deadline
        case contextQuote = "context_quote"
    }
}
