import SwiftUI

struct ContentView: View {
    @Environment(AppState.self) private var appState

    @State private var showSettings = false

    var body: some View {
        VStack(spacing: 0) {
            headerSection
            Divider()
            commitmentSection
            Divider()
            footerSection
        }
        .frame(width: 380, height: 500)
    }

    // MARK: - Header

    private var headerSection: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Keep Me Honest")
                    .font(.headline)
                statusLabel
            }

            Spacer()

            Button {
                Task {
                    if appState.isListening {
                        appState.stopListening()
                    } else {
                        await appState.startListening()
                    }
                }
            } label: {
                Image(systemName: appState.isListening ? "stop.circle.fill" : "play.circle.fill")
                    .font(.title2)
                    .foregroundStyle(appState.isListening ? .red : .green)
            }
            .buttonStyle(.plain)
            .help(appState.isListening ? "Stop listening" : "Start listening")

            Button {
                showSettings.toggle()
            } label: {
                Image(systemName: "gearshape")
                    .font(.title3)
            }
            .buttonStyle(.plain)
            .help("Settings")
        }
        .padding()
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environment(appState)
        }
    }

    @ViewBuilder
    private var statusLabel: some View {
        if let error = appState.errorMessage {
            Label(error, systemImage: "exclamationmark.triangle")
                .font(.caption)
                .foregroundStyle(.red)
                .lineLimit(1)
        } else if appState.isProcessing {
            Label("Processing transcript...", systemImage: "brain")
                .font(.caption)
                .foregroundStyle(.orange)
        } else if appState.isListening {
            Label("Listening", systemImage: "waveform")
                .font(.caption)
                .foregroundStyle(.green)
        } else {
            Label("Idle", systemImage: "moon.zzz")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Commitment List

    private var commitmentSection: some View {
        Group {
            if appState.commitmentStore.activeCommitments.isEmpty {
                emptyState
            } else {
                CommitmentListView()
                    .environment(appState)
            }
        }
        .frame(maxHeight: .infinity)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "checkmark.seal")
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text("No commitments yet")
                .font(.title3)
                .foregroundStyle(.secondary)
            Text("Start listening during a meeting and\nyour commitments will appear here.")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Footer

    private var footerSection: some View {
        HStack {
            if let lastProcessed = appState.lastProcessedAt {
                Text("Last processed: \(lastProcessed, style: .relative) ago")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button("Quit") {
                NSApplication.shared.terminate(nil)
            }
            .font(.caption)
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }
}
