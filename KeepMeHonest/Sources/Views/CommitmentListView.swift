import SwiftUI

struct CommitmentListView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(appState.commitmentStore.activeCommitments) { commitment in
                        CommitmentRowView(commitment: commitment)
                            .environment(appState)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }

            Divider()

            actionBar
        }
    }

    private var actionBar: some View {
        HStack(spacing: 12) {
            Text("\(appState.commitmentStore.activeCommitments.count) items")
                .font(.caption)
                .foregroundStyle(.secondary)

            Spacer()

            Button {
                copyAll()
            } label: {
                Label("Copy All", systemImage: "doc.on.doc")
                    .font(.caption)
            }
            .buttonStyle(.bordered)
            .disabled(appState.commitmentStore.activeCommitments.isEmpty)

            Button {
                appState.commitmentStore.clearAll()
            } label: {
                Label("Clear All", systemImage: "trash")
                    .font(.caption)
            }
            .buttonStyle(.bordered)
            .disabled(appState.commitmentStore.activeCommitments.isEmpty)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private func copyAll() {
        let text = appState.commitmentStore.activeCommitments
            .map(\.formattedText)
            .joined(separator: "\n")
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }
}
