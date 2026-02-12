import SwiftUI

@main
struct KeepMeHonestApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        MenuBarExtra {
            ContentView()
                .environment(appState)
        } label: {
            Label(
                "Keep Me Honest",
                systemImage: appState.isListening ? "waveform.circle.fill" : "waveform.circle"
            )
        }
        .menuBarExtraStyle(.window)
    }
}
