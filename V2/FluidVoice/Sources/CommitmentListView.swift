import SwiftUI

struct CommitmentListView: View {
    @ObservedObject var store: CommitmentStore
    @State private var hoveredId: UUID?

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Promises")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.primary)

                if store.activeCount > 0 {
                    Text("\(store.activeCount)")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Color.orange))
                }

                Spacer()

                if !store.commitments.isEmpty {
                    Menu {
                        Button("Copy All") { copyAll() }
                        Divider()
                        Button("Clear Done") { clearDone() }
                        Button("Clear All", role: .destructive) { store.clearAll() }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.system(size: 14))
                            .foregroundColor(.secondary)
                    }
                    .menuStyle(.borderlessButton)
                    .frame(width: 20)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            Divider()

            if store.commitments.isEmpty {
                emptyState
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(store.commitments) { commitment in
                            commitmentRow(commitment)
                            Divider().padding(.horizontal, 16)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 8) {
            Spacer()
            Image(systemName: "checkmark.seal")
                .font(.system(size: 28))
                .foregroundColor(.secondary.opacity(0.5))
            Text("No promises yet")
                .font(.system(size: 13))
                .foregroundColor(.secondary)
            Text("Speak naturally — promises you make\nwill appear here automatically.")
                .font(.system(size: 11))
                .foregroundColor(.secondary.opacity(0.7))
                .multilineTextAlignment(.center)
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding()
    }

    // MARK: - Row

    private func commitmentRow(_ commitment: Commitment) -> some View {
        HStack(alignment: .top, spacing: 10) {
            // Checkbox
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    store.toggleDone(commitment.id)
                }
            } label: {
                Image(systemName: commitment.isDone ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 18))
                    .foregroundColor(commitment.isDone ? .green : .secondary.opacity(0.5))
            }
            .buttonStyle(.plain)
            .padding(.top, 2)

            // Content
            VStack(alignment: .leading, spacing: 4) {
                Text(commitment.promise)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(commitment.isDone ? .secondary : .primary)
                    .strikethrough(commitment.isDone)

                HStack(spacing: 8) {
                    if let assignedTo = commitment.assignedTo, !assignedTo.isEmpty {
                        Label(assignedTo, systemImage: "person")
                            .font(.system(size: 10))
                            .foregroundColor(.secondary)
                    }

                    if let deadline = commitment.deadline, !deadline.isEmpty {
                        Label(deadline, systemImage: "clock")
                            .font(.system(size: 10))
                            .foregroundColor(.orange)
                    }
                }

                Text("\"\(commitment.contextQuote)\"")
                    .font(.system(size: 10, weight: .regular))
                    .foregroundColor(.secondary.opacity(0.7))
                    .italic()
                    .lineLimit(2)
            }

            Spacer()

            // Dismiss button (on hover)
            if hoveredId == commitment.id {
                Button {
                    withAnimation { store.dismiss(commitment.id) }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary.opacity(0.5))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(hoveredId == commitment.id ? Color.primary.opacity(0.03) : Color.clear)
        .onHover { isHovered in
            hoveredId = isHovered ? commitment.id : nil
        }
    }

    // MARK: - Actions

    private func copyAll() {
        let text = store.commitments
            .filter { !$0.isDone }
            .enumerated()
            .map { idx, c in
                var line = "- [ ] \(c.promise)"
                if let d = c.deadline, !d.isEmpty { line += " (by \(d))" }
                return line
            }
            .joined(separator: "\n")

        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }

    private func clearDone() {
        withAnimation {
            store.commitments.removeAll { $0.isDone }
        }
    }
}
