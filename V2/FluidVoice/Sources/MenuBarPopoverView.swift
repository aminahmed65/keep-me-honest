import SwiftUI

struct MenuBarPopoverView: View {
    @ObservedObject var store: CommitmentStore
    var onOpenSettings: () -> Void
    var onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            CommitmentListView(store: store)
                .frame(maxHeight: .infinity)

            Divider()

            // Footer
            HStack {
                Button {
                    onOpenSettings()
                    onDismiss()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "gearshape")
                            .font(.system(size: 12))
                        Text("Settings...")
                            .font(.system(size: 12))
                    }
                }
                .buttonStyle(.plain)
                .foregroundColor(.secondary)

                Spacer()

                Button {
                    NSApplication.shared.terminate(nil)
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "power")
                            .font(.system(size: 12))
                        Text("Quit")
                            .font(.system(size: 12))
                    }
                }
                .buttonStyle(.plain)
                .foregroundColor(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .frame(width: 380, height: 450)
    }
}
