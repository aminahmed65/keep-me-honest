import Foundation
import AppKit
import CoreGraphics

@Observable
final class MeetingDetector {
    var isMeetingActive = false
    var activeMeetingApp: String?
    var autoStartEnabled: Bool {
        didSet { UserDefaults.standard.set(autoStartEnabled, forKey: "auto_start_enabled") }
    }

    var onMeetingStarted: (() -> Void)?
    var onMeetingEnded: (() -> Void)?

    // Known native meeting app bundle identifiers and their display names.
    // Sources:
    //   Zoom: us.zoom.xos (confirmed via Jamf forums, iboostup.com)
    //   Teams classic: com.microsoft.teams; Teams 2.0: com.microsoft.teams2 (Microsoft docs)
    //   Slack: com.tinyspeck.slackmacgap (Slack deploy docs)
    //   FaceTime: com.apple.FaceTime (Apple bundle-id lists)
    //   Discord: com.hnc.Discord (mac-app-bundle-id-list, ungive/discord-music-presence)
    //   Webex: Cisco-Systems.Spark (Shadow plugin / deepwiki)
    //   GoTo: com.logmein.goto (Shadow plugin)
    //   Skype: com.skype.skype (Shadow plugin)
    //   Around: co.teamport.around (Shadow plugin)
    private static let meetingApps: [String: String] = [
        "us.zoom.xos": "Zoom",
        "com.microsoft.teams": "Microsoft Teams",
        "com.microsoft.teams2": "Microsoft Teams",
        "com.tinyspeck.slackmacgap": "Slack",
        "com.apple.FaceTime": "FaceTime",
        "com.hnc.Discord": "Discord",
        "Cisco-Systems.Spark": "Webex",
        "com.logmein.goto": "GoTo",
        "com.skype.skype": "Skype",
        "co.teamport.around": "Around",
    ]

    // Browser bundle IDs — used for detecting browser-based meetings (Google Meet, etc.)
    private static let browsers: Set<String> = [
        "com.google.Chrome",
        "com.apple.Safari",
        "org.mozilla.firefox",
        "com.microsoft.edgemac",
        "com.brave.Browser",
        "company.thebrowser.Browser",  // Arc
    ]

    // Window title patterns that indicate an active browser-based meeting.
    // Pattern format: (substring to search for, display name)
    // Derived from MeetingBar and Shadow plugin research.
    private static let browserMeetingPatterns: [(pattern: String, name: String)] = [
        ("Meet -", "Google Meet"),           // Google Meet: "Meet - abc-defg-hij"
        ("meet.google.com", "Google Meet"),   // Tab title may include URL
        ("| Microsoft Teams", "Microsoft Teams"),  // Teams web client
        ("Zoom", "Zoom"),                     // Zoom web client
    ]

    // Window title patterns for native apps that indicate an active call
    // (vs. just the app being open). Used for apps where running != in meeting.
    private static let nativeCallPatterns: [String: [(pattern: String, name: String)]] = [
        "us.zoom.xos": [
            ("Zoom Meeting", "Zoom"),
            ("Zoom Webinar", "Zoom"),
        ],
        "com.microsoft.teams": [
            ("(Meeting)", "Microsoft Teams"),
        ],
        "com.microsoft.teams2": [
            ("(Meeting)", "Microsoft Teams"),
        ],
        "Cisco-Systems.Spark": [
            ("Cisco Webex", "Webex"),
        ],
        "co.teamport.around": [
            ("Room |", "Around"),
        ],
    ]

    // Apps where just running is a strong enough signal (they only run during calls,
    // or we don't need window-title confirmation).
    private static let presenceOnlyApps: Set<String> = [
        "com.apple.FaceTime",
    ]

    private var workspaceObservers: [NSObjectProtocol] = []
    private var pollTimer: Timer?

    init() {
        // Default to true — the app is designed to only listen during meetings.
        // UserDefaults.bool returns false if the key was never set, so check for that.
        if UserDefaults.standard.object(forKey: "auto_start_enabled") == nil {
            self.autoStartEnabled = true
            UserDefaults.standard.set(true, forKey: "auto_start_enabled")
        } else {
            self.autoStartEnabled = UserDefaults.standard.bool(forKey: "auto_start_enabled")
        }
    }

    func startMonitoring() {
        let launchObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didLaunchApplicationNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            self?.checkForMeeting()
        }

        let terminateObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didTerminateApplicationNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            self?.checkForMeeting()
        }

        workspaceObservers = [launchObserver, terminateObserver]

        // Poll every 5 seconds for window-title changes and browser-based meetings.
        pollTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            self?.checkForMeeting()
        }

        checkForMeeting()
    }

    func stopMonitoring() {
        for observer in workspaceObservers {
            NSWorkspace.shared.notificationCenter.removeObserver(observer)
        }
        workspaceObservers.removeAll()
        pollTimer?.invalidate()
        pollTimer = nil
    }

    // MARK: - Detection Logic

    private func checkForMeeting() {
        let runningApps = NSWorkspace.shared.runningApplications
        let runningBundleIDs = Set(runningApps.compactMap { $0.bundleIdentifier })

        // 1. Check presence-only apps (FaceTime: if running, assume in a call).
        for bundleID in Self.presenceOnlyApps {
            if runningBundleIDs.contains(bundleID), let name = Self.meetingApps[bundleID] {
                updateMeetingState(active: true, app: name)
                return
            }
        }

        // 2. Check native meeting apps using window titles for call confirmation.
        let windowList = getWindowList()

        for (bundleID, patterns) in Self.nativeCallPatterns {
            guard runningBundleIDs.contains(bundleID) else { continue }

            // Find windows belonging to this bundle ID.
            let appWindows = windowList.filter { ($0.bundleID ?? "") == bundleID || $0.ownerName == (Self.meetingApps[bundleID] ?? "") }

            for window in appWindows {
                guard let title = window.title, !title.isEmpty else { continue }
                for p in patterns {
                    if title.contains(p.pattern) {
                        updateMeetingState(active: true, app: p.name)
                        return
                    }
                }
            }
        }

        // 3. Check browser windows for web-based meeting titles (Google Meet, Teams web, etc.)
        let browserBundleIDs = Self.browsers.intersection(runningBundleIDs)
        if !browserBundleIDs.isEmpty {
            let browserWindows = windowList.filter { w in
                guard let bid = w.bundleID else { return false }
                return browserBundleIDs.contains(bid)
            }

            for window in browserWindows {
                guard let title = window.title, !title.isEmpty else { continue }
                for p in Self.browserMeetingPatterns {
                    if title.localizedCaseInsensitiveContains(p.pattern) {
                        updateMeetingState(active: true, app: p.name)
                        return
                    }
                }
            }
        }

        // No meeting detected.
        updateMeetingState(active: false, app: nil)
    }

    private func updateMeetingState(active: Bool, app: String?) {
        let wasActive = isMeetingActive
        isMeetingActive = active
        activeMeetingApp = app

        if active && !wasActive {
            if autoStartEnabled { onMeetingStarted?() }
        } else if !active && wasActive {
            if autoStartEnabled { onMeetingEnded?() }
        }
    }

    // MARK: - Window List via CGWindowListCopyWindowInfo

    private struct WindowInfo {
        let ownerName: String?
        let title: String?
        let bundleID: String?
    }

    private func getWindowList() -> [WindowInfo] {
        // CGWindowListCopyWindowInfo requires Screen Recording permission to access
        // kCGWindowName. Without it, titles will be nil — native app detection still
        // works via NSWorkspace, but browser-based meeting detection needs it.
        guard let windowInfoList = CGWindowListCopyWindowInfo(
            [.optionOnScreenOnly, .excludeDesktopElements],
            kCGNullWindowID
        ) as? [[String: Any]] else {
            return []
        }

        // Build a PID-to-bundleID lookup from running applications for reliability.
        var pidToBundleID: [Int32: String] = [:]
        for app in NSWorkspace.shared.runningApplications {
            if let bid = app.bundleIdentifier {
                pidToBundleID[app.processIdentifier] = bid
            }
        }

        return windowInfoList.compactMap { info in
            let ownerName = info[kCGWindowOwnerName as String] as? String
            let title = info[kCGWindowName as String] as? String
            let pid = info[kCGWindowOwnerPID as String] as? Int32
            let bundleID = pid.flatMap { pidToBundleID[$0] }
            return WindowInfo(ownerName: ownerName, title: title, bundleID: bundleID)
        }
    }
}
