import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Settings")
                .font(.title2)
                .fontWeight(.semibold)

            // API Key
            VStack(alignment: .leading, spacing: 4) {
                Text("Cerebras API Key")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                @Bindable var state = appState
                SecureField("Enter your API key", text: $state.apiKey)
                    .textFieldStyle(.roundedBorder)
            }

            // Buffer Threshold
            VStack(alignment: .leading, spacing: 4) {
                Text("Buffer Threshold: \(appState.bufferThreshold) words")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                @Bindable var state = appState
                Slider(
                    value: Binding(
                        get: { Double(state.bufferThreshold) },
                        set: { state.bufferThreshold = Int($0) }
                    ),
                    in: 300...1000,
                    step: 50
                )
            }

            // Permissions status
            VStack(alignment: .leading, spacing: 4) {
                Text("Permissions")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Label(
                    appState.audioManager.hasMicPermission ? "Microphone: Granted" : "Microphone: Not granted",
                    systemImage: appState.audioManager.hasMicPermission ? "checkmark.circle.fill" : "xmark.circle"
                )
                .font(.caption)
                .foregroundStyle(appState.audioManager.hasMicPermission ? .green : .orange)

                Label(
                    appState.audioManager.hasSystemAudioPermission ? "System Audio: Granted" : "System Audio: Not granted",
                    systemImage: appState.audioManager.hasSystemAudioPermission ? "checkmark.circle.fill" : "xmark.circle"
                )
                .font(.caption)
                .foregroundStyle(appState.audioManager.hasSystemAudioPermission ? .green : .orange)
            }

            Spacer()

            // About
            VStack(alignment: .leading, spacing: 2) {
                Text("Keep Me Honest v1.0.0")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                Text("Local-first meeting commitment tracker")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            HStack {
                Spacer()
                Button("Done") {
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 340, height: 380)
    }
}
