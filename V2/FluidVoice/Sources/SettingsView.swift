import SwiftUI
import SwiftData
import AVFoundation
import ServiceManagement
import HotKey
import os.log

enum SettingsSection: String, CaseIterable {
    case general = "General"
    case promises = "Promises"
    case people = "People"
    case vocabulary = "Vocabulary"
    case history = "History"

    var icon: String {
        switch self {
        case .general: return "gearshape.fill"
        case .promises: return "checkmark.seal.fill"
        case .people: return "person.2.fill"
        case .vocabulary: return "book.fill"
        case .history: return "clock.fill"
        }
    }

    var description: String {
        switch self {
        case .general: return "Configure microphone, hotkeys, and basic preferences"
        case .promises: return "Extract promises and commitments from your speech"
        case .people: return "People you regularly talk to — helps attribute promises accurately"
        case .vocabulary: return "Manage local vocabulary corrections for better accuracy"
        case .history: return "View and manage transcription history settings"
        }
    }
}

// Parakeet-only SettingsView with macOS sidebar pattern
struct SettingsView: View {
    @AppStorage("selectedMicrophone") private var selectedMicrophone = ""
    @AppStorage("globalHotkey") private var globalHotkey = "Right Option"
    @AppStorage("startAtLogin") private var startAtLogin = true
    @AppStorage("autoBoostMicrophoneVolume") private var autoBoostMicrophoneVolume = true
    @AppStorage("transcriptionHistoryEnabled") private var transcriptionHistoryEnabled = false
    @AppStorage("transcriptionRetentionPeriod") private var transcriptionRetentionPeriodRaw = RetentionPeriod.oneMonth.rawValue

    @State private var selectedSection: SettingsSection = .general
    @State private var availableMicrophones: [AVCaptureDevice] = []
    @State private var isRecordingHotkey = false
    @State private var recordedModifiers: NSEvent.ModifierFlags = []
    @State private var recordedKey: Key?
    @AppStorage("hasDismissedFnKeyHint") private var hasDismissedFnKeyHint = false
    @AppStorage("commitmentExtractionEnabled") private var commitmentExtractionEnabled = true
    @State private var openRouterAPIKey: String = ""
    @ObservedObject private var peopleStore = PeopleStore.shared
    @State private var isAddingPerson = false
    @State private var newPersonName = ""
    @State private var newPersonRole = ""
    @State private var newPersonNotes = ""

    var body: some View {
        HSplitView {
            // Sidebar
            sidebar
                .frame(minWidth: 200, maxWidth: 250)

            // Content area
            contentArea
                .frame(minWidth: 450)
        }
        .tint(Color(red: 0.3, green: 0.3, blue: 0.3))
        .onAppear {
            loadAvailableMicrophones()
        }
    }

    // MARK: - Sidebar
    private var sidebar: some View {
        VStack(spacing: 0) {
            // FluidVoice logo section - direct image without VStack
            Group {
                if let logoPath = Bundle.main.path(forResource: "Assets.xcassets/FluidVoiceLogo.imageset/FluidVoiceIcon", ofType: "png"),
                   let logoImage = NSImage(contentsOfFile: logoPath) {
                    Image(nsImage: logoImage)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(maxWidth: .infinity, maxHeight: 120)
                } else {
                    // Fallback: Use gear icon like header originally had
                    Image(systemName: "gearshape.fill")
                        .frame(width: 24, height: 16)
                        .foregroundColor(.secondary)
                }
            }
            .foregroundColor(.primary)
            .padding(.bottom, 20)

            ForEach(SettingsSection.allCases, id: \.self) { section in
                SidebarRow(
                    section: section,
                    isSelected: selectedSection == section
                ) {
                    selectedSection = section
                }
            }

            Spacer()
        }
        .padding(.vertical, 12)
        .background(Color.clear)
    }

    // MARK: - Content Area
    private var contentArea: some View {
        VStack(spacing: 0) {
            // Header
            contentHeader
                .padding(.horizontal, 32)
                .padding(.top, 40)
                .padding(.bottom, 20)

            // Content
            ScrollView {
                VStack(spacing: 24) {
                    switch selectedSection {
                    case .general:
                        generalContent
                    case .promises:
                        promisesContent
                    case .people:
                        peopleContent
                    case .vocabulary:
                        vocabularyContent
                    case .history:
                        historyContent
                    }
                }
                .padding(.horizontal, 32)
                .padding(.bottom, 24)
            }
        }
        .background(Color(NSColor.windowBackgroundColor))
    }

    private var contentHeader: some View {
        VStack(spacing: 12) {
            SettingsCard {
                VStack(spacing: 8) {
                    // Section icon - no background
                    Image(systemName: selectedSection.icon)
                        .font(.system(size: 28, weight: .medium))
                        .foregroundColor(.primary)
                        .frame(height: 36)

                    // Centered title and description like Bartender
                    VStack(spacing: 4) {
                        Text(selectedSection.rawValue)
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(.primary)

                        Text(selectedSection.description)
                            .font(.system(size: 12, weight: .regular))
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 24)
                .padding(.horizontal, 16)
            }
        }
        .padding(.bottom, 12)
    }

    // MARK: - Content Sections
    private var generalContent: some View {
        VStack(spacing: 12) {
            // Audio Settings Group
            SettingsCard {
                VStack(spacing: 0) {
                    SettingsRow("Microphone") {
                        Picker("", selection: $selectedMicrophone) {
                            Text("System Default").tag("")
                            ForEach(availableMicrophones, id: \.uniqueID) { device in
                                Text(device.localizedName).tag(device.uniqueID)
                            }
                        }
                        .pickerStyle(.menu)
                        .frame(maxWidth: 250)
                    }

                    Divider()
                        .padding(.horizontal, 16)

                    SettingsRow("Auto-boost microphone volume", infoText: "Auto-boost helps with quiet microphones like built-in MacBook mics. Disable for professional audio gear.") {
                        Toggle("", isOn: $autoBoostMicrophoneVolume)
                            .toggleStyle(SwitchToggleStyle(tint: Color.gray))
                    }
                }
            }

            // Hotkey Settings Group
            SettingsCard {
                VStack(alignment: .leading, spacing: 0) {
                    BartenderSettingsRow("Global Hotkey") {
                        HStack {
                            if isRecordingHotkey {
                                HotKeyRecorderView(
                                    isRecording: $isRecordingHotkey,
                                    recordedModifiers: $recordedModifiers,
                                    recordedKey: $recordedKey,
                                    onComplete: { newHotkey in
                                        globalHotkey = newHotkey
                                        updateGlobalHotkey(newHotkey)
                                    }
                                )
                            } else {
                                Text(globalHotkey)
                                    .foregroundColor(.secondary)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Color.secondary.opacity(0.1))
                                    .cornerRadius(4)

                                Button("Change") {
                                    isRecordingHotkey = true
                                    recordedModifiers = []
                                    recordedKey = nil
                                }
                                .buttonStyle(.bordered)
                            }
                        }
                    }

                    // Fn key warning (only when Fn is selected and not configured)
                    if globalHotkey == "Fn" && !isFnKeySetToDoNothing() {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "info.circle")
                                .foregroundColor(.secondary)
                                .font(.system(size: 14))

                            VStack(alignment: .leading, spacing: 4) {
                                Text("macOS System Setting Required")
                                    .font(.caption)
                                    .fontWeight(.semibold)
                                    .foregroundColor(.primary)

                                Text("System Settings → Keyboard → \"Press 🌐 key to\" should be set to \"Do Nothing\" to avoid conflicts with FluidVoice.")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .padding(10)
                        .background(Color.secondary.opacity(0.1))
                        .cornerRadius(6)
                        .padding(.leading, 16)
                        .padding(.bottom, 8)
                    }

                    // Fn key recommendation (always show when Fn is NOT selected and not dismissed)
                    if globalHotkey != "Fn" && !hasDismissedFnKeyHint {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "info.circle")
                                .foregroundColor(.secondary)
                                .font(.system(size: 12))

                            VStack(alignment: .leading, spacing: 2) {
                                Text("Fn key is another great option if you prefer left-hand")
                                    .font(.caption)
                                    .foregroundColor(.secondary)

                                Text("Just set System Settings → Keyboard → \"Press 🌐 key to\" → \"Do Nothing\" first.")
                                    .font(.caption)
                                    .foregroundColor(.secondary.opacity(0.8))
                                    .fixedSize(horizontal: false, vertical: true)
                            }

                            Spacer()

                            // Dismiss button
                            Button(action: {
                                hasDismissedFnKeyHint = true
                            }) {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 14))
                                    .foregroundColor(.secondary.opacity(0.5))
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 6)
                        .padding(.bottom, 14)
                    }
                }
            }

            // General Settings Group
            SettingsCard {
                BartenderSettingsRow("Start at login") {
                    Toggle("", isOn: $startAtLogin)
                        .toggleStyle(SwitchToggleStyle(tint: Color.gray))
                        .onChange(of: startAtLogin) { oldValue, newValue in
                            updateLoginItem(enabled: newValue)
                        }
                }
            }

            // Help & Diagnostics
            SettingsCard {
                VStack(spacing: 0) {
                    BartenderSettingsRow("Help & Setup Guide") {
                        Button("Open") {
                            WelcomeWindow.showWelcomeDialog()
                        }
                        .buttonStyle(.bordered)
                    }

                    Divider()
                        .padding(.horizontal, 16)

                    BartenderSettingsRow("Crash Logs") {
                        Button("Show in Finder") {
                            CrashReporter.shared.showCrashLogsInFinder()
                        }
                        .buttonStyle(.bordered)
                    }

                    Divider()
                        .padding(.horizontal, 16)

                    BartenderSettingsRow("History") {
                        Button("Open") {
                            HistoryWindowManager.shared.showHistoryWindow()
                        }
                        .buttonStyle(.bordered)
                    }
                }
            }
        }
    }

    private var promisesContent: some View {
        VStack(spacing: 12) {
            SettingsCard {
                VStack(spacing: 0) {
                    SettingsRow("Enable promise extraction", infoText: "After each transcription, AI analyzes your speech for promises and commitments.") {
                        Toggle("", isOn: $commitmentExtractionEnabled)
                            .toggleStyle(SwitchToggleStyle(tint: Color.gray))
                    }
                }
            }

            SettingsCard {
                VStack(spacing: 0) {
                    SettingsRow("OpenRouter API Key") {
                        HStack(spacing: 8) {
                            SecureField("sk-or-...", text: $openRouterAPIKey)
                                .textFieldStyle(.roundedBorder)
                                .frame(maxWidth: 220)
                                .onSubmit { saveAPIKey() }

                            if CommitmentExtractionService.shared.hasAPIKey {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.green)
                                    .font(.system(size: 14))
                            }
                        }
                    }

                    if !openRouterAPIKey.isEmpty {
                        HStack {
                            Spacer()
                            Button("Save Key") { saveAPIKey() }
                                .buttonStyle(.bordered)
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 10)
                    }
                }
            }

            SettingsCard {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("How it works")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.primary)
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)

                    VStack(alignment: .leading, spacing: 6) {
                        Text("1. You speak naturally using push-to-talk")
                        Text("2. Speech is transcribed locally via Parakeet")
                        Text("3. Transcript is sent to Gemini Flash via OpenRouter")
                        Text("4. Promises you made appear in your to-do list")
                    }
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                }
            }
        }
        .onAppear {
            openRouterAPIKey = CommitmentExtractionService.shared.getAPIKey() ?? ""
        }
    }

    private var peopleContent: some View {
        VStack(spacing: 12) {
            if peopleStore.people.isEmpty && !isAddingPerson {
                SettingsCard {
                    VStack(spacing: 8) {
                        Image(systemName: "person.2")
                            .font(.system(size: 28))
                            .foregroundColor(.secondary.opacity(0.5))
                        Text("No people added yet")
                            .font(.system(size: 13))
                            .foregroundColor(.secondary)
                        Text("Add people you regularly talk to.\nThis helps the AI attribute promises correctly.")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary.opacity(0.7))
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                }
            }

            ForEach(peopleStore.people) { person in
                SettingsCard {
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(person.name)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.primary)
                            if !person.role.isEmpty {
                                Text(person.role)
                                    .font(.system(size: 11))
                                    .foregroundColor(.secondary)
                            }
                            if !person.notes.isEmpty {
                                Text(person.notes)
                                    .font(.system(size: 10))
                                    .foregroundColor(.secondary.opacity(0.7))
                                    .lineLimit(2)
                            }
                        }

                        Spacer()

                        Button {
                            peopleStore.remove(id: person.id)
                        } label: {
                            Image(systemName: "trash")
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                }
            }

            if isAddingPerson {
                SettingsCard {
                    VStack(spacing: 10) {
                        TextField("Name", text: $newPersonName)
                            .textFieldStyle(.roundedBorder)
                        TextField("Role / Relationship (optional)", text: $newPersonRole)
                            .textFieldStyle(.roundedBorder)
                        TextField("Notes (optional)", text: $newPersonNotes)
                            .textFieldStyle(.roundedBorder)

                        HStack {
                            Button("Cancel") {
                                isAddingPerson = false
                                newPersonName = ""
                                newPersonRole = ""
                                newPersonNotes = ""
                            }
                            .buttonStyle(.bordered)

                            Spacer()

                            Button("Save") {
                                let name = newPersonName.trimmingCharacters(in: .whitespaces)
                                guard !name.isEmpty else { return }
                                peopleStore.add(
                                    name: name,
                                    role: newPersonRole.trimmingCharacters(in: .whitespaces),
                                    notes: newPersonNotes.trimmingCharacters(in: .whitespaces)
                                )
                                isAddingPerson = false
                                newPersonName = ""
                                newPersonRole = ""
                                newPersonNotes = ""
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(Color(red: 0.3, green: 0.3, blue: 0.3))
                            .disabled(newPersonName.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                    }
                    .padding(16)
                }
            } else {
                Button {
                    isAddingPerson = true
                } label: {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 14))
                        Text("Add Person")
                            .font(.system(size: 13, weight: .medium))
                    }
                }
                .buttonStyle(.plain)
                .foregroundColor(.secondary)
            }
        }
    }

    private var vocabularyContent: some View {
        VStack(spacing: 12) {
            // Vocabulary Management
            SettingsCard {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Vocabulary Management")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.primary)
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)

                    Text("Local vocabulary corrections are stored in ~/.config/fluidvoice/vocabulary.jsonc")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 16)

                    HStack {
                        Spacer()
                        Button("Open Vocabulary File") {
                            openVocabularyFile()
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                }
            }

            // Coming Soon Features
            SettingsCard {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Coming Soon")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.primary)
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)

                    VStack(alignment: .leading, spacing: 6) {
                        Text("• In-app vocabulary editor")
                        Text("• Import/export vocabulary lists")
                        Text("• Context-aware corrections")
                    }
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                }
            }
        }
    }

    private var historyContent: some View {
        VStack(spacing: 12) {
            // History Settings
            SettingsCard {
                VStack(spacing: 0) {
                    SettingsRow("Save transcription history") {
                        Toggle("", isOn: $transcriptionHistoryEnabled)
                            .toggleStyle(SwitchToggleStyle(tint: Color.gray))
                    }

                    if transcriptionHistoryEnabled {
                        Divider()
                            .padding(.horizontal, 16)

                        SettingsRow("Keep history for") {
                            Picker("Retention Period", selection: $transcriptionRetentionPeriodRaw) {
                                ForEach(RetentionPeriod.allCases, id: \.self) { period in
                                    Text(period.displayName).tag(period.rawValue)
                                }
                            }
                            .pickerStyle(.menu)
                            .frame(maxWidth: 200)
                        }

                        Divider()
                            .padding(.horizontal, 16)

                        SettingsRow("Manage history") {
                            Button("View History...") {
                                showHistoryWindow()
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Helper Functions
    private func loadAvailableMicrophones() {
        Task {
            let devices = AVCaptureDevice.DiscoverySession(
                deviceTypes: [.microphone],
                mediaType: .audio,
                position: .unspecified
            ).devices

            await MainActor.run {
                self.availableMicrophones = devices
            }
        }
    }

    private func isFnKeySetToDoNothing() -> Bool {
        // Check macOS Fn key setting (com.apple.HIToolbox AppleFnUsageType)
        // 0 = Do Nothing, 1 = Change Input Source, 2 = Show Emoji & Symbols, etc.
        let fnUsageType = UserDefaults(suiteName: "com.apple.HIToolbox")?.integer(forKey: "AppleFnUsageType") ?? -1
        return fnUsageType == 0
    }

    private func updateGlobalHotkey(_ hotkey: String) {
        // Send notification to update HotKeyManager
        NotificationCenter.default.post(
            name: .updateGlobalHotkey,
            object: hotkey
        )
    }

    private func updateLoginItem(enabled: Bool) {
        // Implementation would update login item
        // This connects to the existing ServiceManagement code
    }

    private func saveAPIKey() {
        CommitmentExtractionService.shared.saveAPIKey(openRouterAPIKey)
        Logger.settings.infoDev("OpenRouter API key saved")
    }

    private func openVocabularyFile() {
        let homeURL = FileManager.default.homeDirectoryForCurrentUser
        let configURL = homeURL.appendingPathComponent(".config/fluidvoice/vocabulary.jsonc")
        NSWorkspace.shared.open(configURL)
    }

    private func showHistoryWindow() {
        // Implementation would show history window
        // This connects to the existing HistoryWindowManager
    }
}

// MARK: - Bartender-style Components
struct BartenderSettingsCard<Content: View>: View {
    let content: Content
    @Environment(\.colorScheme) private var colorScheme

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(
                        colorScheme == .dark
                            ? Color.white.opacity(0.015)  // Dark Mode: sehr subtil heller
                            : Color.black.opacity(0.02)   // Light Mode: sehr subtil dunkler
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color(NSColor.separatorColor).opacity(0.7), lineWidth: 1)
            )
    }
}

struct BartenderSettingsRow<Content: View>: View {
    let title: String
    let content: Content

    init(_ title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        HStack {
            Text(title)
                .font(.system(size: 13))
                .foregroundColor(.primary)

            Spacer()

            content
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}

// MARK: - Supporting Views
struct SidebarRow: View {
    let section: SettingsSection
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: section.icon)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(isSelected ? .white : .secondary)
                    .frame(width: 20)

                Text(section.rawValue)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(isSelected ? .white : .primary)

                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(
                isSelected ? Color(red: 0.3, green: 0.3, blue: 0.3) : Color.clear
            )
            .cornerRadius(6)
            .padding(.horizontal, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}


// MARK: - HotKey Recorder (Simplified version)
struct HotKeyRecorderView: View {
    @Binding var isRecording: Bool
    @Binding var recordedModifiers: NSEvent.ModifierFlags
    @Binding var recordedKey: Key?
    let onComplete: (String) -> Void

    @State private var displayText = "Press keys..."
    @State private var eventMonitor: Any?

    // Modifier key mapping (keyCode -> name)
    private let modifierKeyNames: [UInt16: String] = [
        63: "Fn",
        61: "Right Option",
        58: "Left Option",
        54: "Right Command",
        55: "Left Command",
        60: "Right Shift",
        56: "Left Shift",
        62: "Right Control",
        59: "Left Control"
    ]

    var body: some View {
        HStack {
            Text(displayText)
                .foregroundColor(.primary)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.black.opacity(0.1))
                .cornerRadius(4)

            Button("Cancel") {
                stopRecording()
            }
            .buttonStyle(.bordered)
        }
        .onAppear {
            startRecording()
        }
        .onDisappear {
            stopRecording()
        }
    }

    private func startRecording() {
        eventMonitor = NSEvent.addLocalMonitorForEvents(matching: [.flagsChanged]) { event in
            // Only accept single modifier keys (no key combinations)
            if event.type == .flagsChanged {
                if let modifierName = modifierKeyNames[event.keyCode] {
                    displayText = modifierName
                    // Complete after short delay to show the key
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        onComplete(modifierName)
                        stopRecording()
                    }
                    return nil // Consume event
                }
            }

            return event
        }
    }

    private func stopRecording() {
        if let monitor = eventMonitor {
            NSEvent.removeMonitor(monitor)
            eventMonitor = nil
        }
        isRecording = false
    }
}

// MARK: - Sidebar Glass Effect
struct SidebarGlass: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    func body(content: Content) -> some View {
        content
            // Dark sidebar background with subtle transparency
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(
                        isDark
                            ? Color.black.opacity(0.3)
                            : Color.black.opacity(0.1)
                    )
            )

            // Top highlight for depth
            .overlay(alignment: .top) {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color.white.opacity(isDark ? 0.15 : 0.25),
                                .clear
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(height: 6)
                    .blur(radius: 0.5)
            }

            // Subtle border
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(
                        Color.white.opacity(isDark ? 0.08 : 0.12),
                        lineWidth: 0.5
                    )
            )

            // Add material blur effect
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .opacity(0.8)
            )

            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

extension View {
    func sidebarGlass() -> some View {
        modifier(SidebarGlass())
    }
}

#Preview {
    SettingsView()
        .frame(width: 800, height: 600)
}