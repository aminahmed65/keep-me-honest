import SwiftUI

struct CommitmentRowView: View {
    @Environment(AppState.self) private var appState
    let commitment: Commitment

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Intent as title
            Text(commitment.intent)
                .font(.system(.body, weight: .semibold))
                .lineLimit(2)

            // Metadata row
            HStack(spacing: 8) {
                Label(commitment.assignee, systemImage: "person")
                Label(commitment.deadline, systemImage: "clock")
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            // Context quote
            Text("\"\(commitment.contextQuote)\"")
                .font(.caption)
                .italic()
                .foregroundStyle(.secondary)
                .lineLimit(3)

            // Bottom row: timestamp + actions
            HStack {
                Text(commitment.capturedAt, style: .relative)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)

                Spacer()

                Button {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(commitment.formattedText, forType: .string)
                } label: {
                    Image(systemName: "doc.on.clipboard")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("Copy to clipboard")

                Button {
                    appState.commitmentStore.dismiss(commitment)
                } label: {
                    Image(systemName: "xmark.circle")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("Dismiss")
            }
        }
        .padding(10)
        .background(.background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}
