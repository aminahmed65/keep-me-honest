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

            // Only allow manual control during an active meeting
            if appState.meetingDetector.isMeetingActive {
                Button {
                    Task {
                        if appState.isListening {
                            appState.stopListening()
                        } else {
                            await appState.startListening()
                        }
                    }
                } label: {
                    Image(systemName: appState.isListening ? "pause.circle.fill" : "play.circle.fill")
                        .font(.title2)
                        .foregroundStyle(appState.isListening ? .orange : .green)
                }
                .buttonStyle(.plain)
                .help(appState.isListening ? "Pause listening" : "Resume listening")
            }

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
                .lineLimit(2)
        } else if appState.isProcessing {
            Label("Processing transcript...", systemImage: "brain")
                .font(.caption)
                .foregroundStyle(.orange)
        } else if appState.isListening {
            if let meetingApp = appState.meetingDetector.activeMeetingApp {
                Label("Listening — \(meetingApp)", systemImage: "waveform")
                    .font(.caption)
                    .foregroundStyle(.green)
            } else {
                Label("Listening", systemImage: "waveform")
                    .font(.caption)
                    .foregroundStyle(.green)
            }
        } else if appState.meetingDetector.isMeetingActive,
                  let meetingApp = appState.meetingDetector.activeMeetingApp {
            Label("\(meetingApp) detected — paused", systemImage: "video")
                .font(.caption)
                .foregroundStyle(.blue)
        } else {
            Label("Waiting for a meeting...", systemImage: "video.slash")
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
            Text("Join a meeting and your\ncommitments will appear here automatically.")
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
