import AppKit
import SwiftUI

class CommitmentWindowManager {
    static let shared = CommitmentWindowManager()
    private var window: NSWindow?

    private init() {}

    @MainActor func showCommitmentWindow() {
        if let existingWindow = window, existingWindow.isVisible {
            NSApp.activate(ignoringOtherApps: true)
            existingWindow.makeKeyAndOrderFront(nil)
            return
        }

        let contentView = CommitmentListView(store: CommitmentStore.shared)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 380, height: 500),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Promises — Keep Me Honest"
        window.level = .normal
        window.isReleasedWhenClosed = false
        window.contentView = NSHostingView(rootView: contentView)
        window.center()

        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)

        self.window = window
    }
}
