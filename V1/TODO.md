# Keep Me Honest — Project Roadmap & TODO

> Comprehensive feature roadmap based on competitor analysis (Otter.ai, Fireflies.ai, Granola, Krisp, tl;dv, Jamie), Apple platform capabilities, and community best practices.
>
> **Priority Key:** P0 = Must-have for usable MVP | P1 = High-value, next release | P2 = Nice-to-have, future
> **Effort Key:** Small = <1 day | Medium = 1-3 days | Large = 3+ days

---

## Audio & Transcription

### Streaming & Real-Time
- [ ] **P0 | Medium** — Implement true streaming transcription with WhisperKit's `--stream` mode instead of batch-processing accumulated audio buffers. Currently `TranscriptionEngine.transcribe()` works on full buffers; switch to WhisperKit's built-in streaming pipeline for lower latency. See [WhisperKit streaming docs](https://github.com/argmaxinc/WhisperKit).
- [ ] **P0 | Medium** — Improve Voice Activity Detection (VAD) to trigger AI processing on speech pauses instead of only word-count threshold. WhisperKit includes built-in VAD — use it to detect end-of-utterance and flush the `ContextBuffer` intelligently.
- [ ] **P1 | Small** — Add configurable audio buffer size in `MicrophoneCapture` (currently hardcoded to 4096 frames). Larger buffers reduce CPU overhead; smaller buffers reduce latency.
- [ ] **P1 | Medium** — Implement audio level metering (RMS/peak) and display a live waveform or level indicator in the popover UI to give the user confidence that audio is being captured.

### Noise & Quality
- [ ] **P0 | Medium** — Enable `AVAudioEngine` voice processing I/O for echo cancellation. Currently the audio engine uses the default input node without `setVoiceProcessingEnabled(true)`. Krisp's key differentiator is noise-cleaned transcripts producing better notes.
- [ ] **P1 | Large** — Investigate noise suppression using Apple's `AVAudioUnitEffect` or a dedicated library. Krisp demonstrates that two-way noise cancellation dramatically improves transcript quality. Consider [RNNoise](https://github.com/xiph/rnnoise) via a CoreAudio AU plugin.
- [ ] **P2 | Small** — Add input gain control slider in settings to handle quiet microphones or overly loud environments.

### Model Selection & Multi-Language
- [ ] **P1 | Medium** — Add WhisperKit model selector in settings (tiny.en, base.en, small.en, medium.en, large-v3). Currently hardcoded to `base.en`. Larger models give better accuracy at the cost of speed/memory. The medium model is the sweet spot for most setups per [WhisperKit benchmarks](https://www.argmaxinc.com/blog/whisperkit).
- [ ] **P1 | Medium** — Pre-download and bundle WhisperKit models using `WhisperKitConfig(modelFolder:)` to avoid first-run download delay. See [WhisperKit README](https://github.com/argmaxinc/WhisperKit#readme).
- [ ] **P2 | Large** — Support multi-language transcription using WhisperKit's non-English models (base, small, medium, large-v3). Competitors like Jamie and tl;dv support 30-100+ languages. This requires language detection or a user-selectable language setting.
- [ ] **P2 | Medium** — Implement automatic language detection per segment using WhisperKit's language detection feature, similar to tl;dv's automatic language detection.

### Speaker Identification
- [ ] **P1 | Large** — Implement speaker diarization to distinguish "me" from "others". Currently all audio is mixed together and the AI must infer who is speaking from context alone. Options: separate mic (self) and system audio (others) transcription streams, or use a diarization model. WhisperX offers word-level diarization — see [whisperX](https://github.com/m-bain/whisperX).
- [ ] **P1 | Medium** — Label transcription segments with source (mic vs. system audio) before sending to AI. The `AudioMixer` currently combines both streams — instead, maintain parallel buffers with `[MIC]` and `[SYS]` prefixes.
- [ ] **P2 | Large** — Train or integrate a speaker embedding model to recognize recurring speakers across meetings (like Otter.ai's speaker recognition with 95% accuracy).

### System Audio
- [ ] **P0 | Small** — Add `SCStreamDelegate` to `SystemAudioCapture` for error detection and auto-recovery (e.g., stream interrupted when app quits). Currently `delegate: nil` in `SCStream` init.
- [ ] **P1 | Small** — Implement `captureMicrophone` property on `SCStreamConfiguration` (available in newer ScreenCaptureKit) to capture mic directly through SCStream instead of running a separate `AVAudioEngine`. This simplifies the architecture.
- [ ] **P1 | Medium** — Auto-detect which meeting app is running (Zoom, Google Meet, Teams, Slack) and filter ScreenCaptureKit to capture only that app's audio window. This avoids capturing unrelated system sounds (music, notifications).

---

## AI Pipeline

### Prompt Engineering
- [ ] **P0 | Small** — Improve the system prompt in `CommitmentExtractor` with few-shot examples and edge case handling. Current prompt is minimal — add examples of commitments vs. non-commitments (e.g., "I might look into it" is NOT a commitment, "I'll send that by Friday" IS).
- [ ] **P0 | Small** — Add confidence scoring to extracted commitments. Have the AI return a `confidence: "high"|"medium"|"low"` field so the UI can highlight uncertain items differently.
- [ ] **P1 | Small** — Support extracting decisions and key discussion points in addition to commitments. Competitors like Fireflies, Otter, and Granola all extract broader meeting insights — decisions made, questions raised, topics discussed.
- [ ] **P1 | Small** — Add meeting summary generation. After a session ends, produce a 3-5 bullet summary of the meeting using the accumulated transcript. Granola and tl;dv both offer this.

### Context Window & Processing
- [ ] **P0 | Medium** — Implement sliding window context overlap in `ContextBuffer.consume()`. Currently keeps last 50 words — increase to ~100 words and include speaker labels for better cross-chunk coherence.
- [ ] **P0 | Small** — Add API retry logic with exponential backoff in `CerebrasAPIClient`. Currently a 429 rate limit or network error just throws — should retry 3x with 1s/2s/4s delays while preserving the transcript buffer.
- [ ] **P1 | Medium** — Implement commitment deduplication. The AI might extract the same commitment from overlapping context windows. Compare new commitments against recent ones using fuzzy matching on `intent` + `context_quote`.
- [ ] **P1 | Small** — Add request/response logging for debugging AI extraction quality. Log transcript sent, raw API response, and parsed commitments to a debug file.

### Multi-Model & Fallback
- [ ] **P1 | Large** — Support configurable LLM provider (not just Cerebras). Add OpenAI, Anthropic, and Groq as backend options with an API-compatible client interface. Different users will have different API keys.
- [ ] **P2 | Large** — Implement local LLM fallback using [MLX Swift](https://github.com/ml-explore/mlx-swift) for on-device commitment extraction when offline or API is down. Apple's MLX framework is optimized for Apple Silicon and has Swift bindings. See [WWDC25 session on MLX](https://developer.apple.com/videos/play/wwdc2025/298/).
- [ ] **P2 | Medium** — Implement [AnyLanguageModel](https://huggingface.co/blog/anylanguagemodel) Swift package for a unified interface across local and remote LLMs.

---

## UX & Design

### Onboarding & First Run
- [ ] **P0 | Medium** — Add first-run onboarding flow: welcome screen, permission requests (mic + screen recording), API key entry, model download progress. Currently the user has to discover settings on their own.
- [ ] **P0 | Small** — Add clear permission status indicators in settings showing whether mic and screen recording permissions are granted, with deep links to System Settings > Privacy.
- [ ] **P1 | Small** — Show WhisperKit model download progress during first launch. Currently `ModelState.loading(progress:)` exists but isn't surfaced in the UI.

### Keyboard Shortcuts & Navigation
- [ ] **P1 | Small** — Add global keyboard shortcut to toggle listening (e.g., `Cmd+Shift+L`). Use [KeyboardShortcuts](https://github.com/sindresorhus/KeyboardShortcuts) by Sindre Sorhus for user-customizable global hotkeys in SwiftUI.
- [ ] **P1 | Small** — Add keyboard shortcut to open/close the popover (e.g., `Cmd+Shift+K`).
- [ ] **P2 | Small** — Add keyboard navigation within the commitment list (arrow keys, Enter to copy, Delete to dismiss).

### Notifications & Reminders
- [ ] **P1 | Medium** — Send macOS notification when new commitments are extracted (opt-in). Keep it non-intrusive — a subtle notification with the commitment text. This is important for users who don't check the menu bar icon frequently.
- [ ] **P1 | Medium** — Add deadline-based reminders. Parse extracted deadlines into actual dates (e.g., "tomorrow by 5pm" -> Date) and schedule `UNUserNotification` alerts before the deadline. GReminders and Fellow both offer automated deadline reminders.
- [ ] **P2 | Small** — Add a "snooze" action on commitments to be reminded later.

### Meeting Sessions
- [ ] **P1 | Large** — Group commitments by meeting session (start/stop creates a session). Currently all commitments are a flat list — session grouping allows users to see "what came from the Monday standup" vs. "the client call."
- [ ] **P1 | Medium** — Add meeting session history view with session name, date, duration, commitment count, and full transcript. tl;dv and Granola both offer meeting history browsing.
- [ ] **P2 | Medium** — Auto-name meeting sessions based on calendar events (if calendar access is granted). Granola does this — it matches the meeting time to a calendar event and uses that as the session title.

### Search & Filtering
- [ ] **P1 | Medium** — Add search/filter in the commitment list. Filter by assignee, deadline status (overdue/upcoming/unspecified), or keyword. Fireflies offers transcript search across all meetings.
- [ ] **P2 | Small** — Add sort options: by date captured, by deadline, by assignee, by status (active/dismissed).

### UI Polish
- [ ] **P1 | Small** — Add "Copy All" button to copy all active commitments as a formatted list to clipboard (Markdown or plain text).
- [ ] **P1 | Small** — Add undo for dismiss/delete actions. Currently dismissing is immediate with no way back (without editing the JSON file).
- [ ] **P2 | Small** — Support light/dark mode theming with accent color customization.
- [ ] **P2 | Small** — Add right-click context menu on the menu bar icon for quick actions (toggle listening, quit, open settings). MenuBarExtra doesn't support right-click natively — needs `NSStatusItem` workaround.
- [ ] **P2 | Medium** — Add a "transcript viewer" tab that shows the running transcription in real-time, like Krisp's live transcription view.

---

## Integrations

### Apple Ecosystem
- [ ] **P1 | Medium** — Export commitments to Apple Reminders via [EventKit](https://developer.apple.com/documentation/eventkit). Create reminders with due dates parsed from the commitment's `deadline` field. Requires `NSRemindersUsageDescription` in Info.plist and `requestFullAccessToReminders()`.
- [ ] **P1 | Medium** — Calendar integration via EventKit: detect active calendar events and auto-start listening when a meeting begins. Auto-stop when the meeting ends. Use `EKEventStore` to query for events overlapping the current time.
- [ ] **P2 | Small** — Export to Apple Notes for users who prefer that workflow.
- [ ] **P2 | Medium** — Implement macOS Share Sheet extension so users can share commitment lists to any app that supports the share sheet.

### Task Managers
- [ ] **P1 | Medium** — Todoist integration via [REST API v2](https://developer.todoist.com/rest/v2/). Create tasks from commitments with due dates and project selection. Simple HTTP POST with API token.
- [ ] **P1 | Medium** — Things 3 integration via [Things URL Scheme](https://culturedcode.com/things/support/articles/2803573/). Things supports `things:///add?title=...&when=...&notes=...` deep links — zero API key needed.
- [ ] **P2 | Medium** — Linear integration via [Linear API](https://developers.linear.app/) for engineering teams. Create issues from commitments.
- [ ] **P2 | Medium** — Notion integration via [Notion API](https://developers.notion.com/). Append commitments to a database. Granola already offers one-click Notion sharing.

### Communication
- [ ] **P1 | Small** — Slack webhook integration: post commitment summaries to a Slack channel after each meeting session. Uses simple [incoming webhooks](https://api.slack.com/messaging/webhooks) — just an HTTP POST with JSON payload.
- [ ] **P2 | Medium** — Generate follow-up email drafts from commitments. Create a mailto: link or copy formatted email text. Motion and Fireflies both auto-generate follow-up emails.

### Automation
- [ ] **P2 | Medium** — Shortcuts.app integration using App Intents framework. Expose "Get Active Commitments", "Start Listening", "Stop Listening" as Siri Shortcuts actions.
- [ ] **P2 | Large** — Zapier/Make webhook: send commitment data to a configurable webhook URL so users can build their own automations. Granola uses Zapier to connect to thousands of apps.

---

## Performance

### Memory & CPU
- [ ] **P0 | Medium** — Profile and optimize memory usage during long meetings. WhisperKit models consume significant RAM (base.en ~150MB, large-v3 ~3GB). Add memory warnings and consider unloading the model during idle periods.
- [ ] **P0 | Small** — Cap the `ContextBuffer` to prevent unbounded memory growth during very long meetings. Currently the buffer grows indefinitely until consumed.
- [ ] **P1 | Medium** — Implement audio buffer ring buffer instead of appending to growing arrays in `MicrophoneCapture` and `SystemAudioCapture`. Use a fixed-size circular buffer to reduce GC pressure.
- [ ] **P1 | Small** — Use `DispatchQueue` QoS appropriately: audio capture on `.userInteractive`, transcription on `.userInitiated`, AI API calls on `.utility`. Currently system audio uses `.global(qos: .userInteractive)` which is correct, but verify all paths.

### Battery
- [ ] **P1 | Medium** — Add battery-aware processing: reduce transcription frequency or use a smaller model when on battery power. macOS reduces CPU performance on battery — detect with `IOPowerSources` and adapt.
- [ ] **P1 | Small** — Minimize video overhead in `SystemAudioCapture`: currently captures 2x2 video frames at 1 FPS — verify this is the absolute minimum. Consider if `SCStreamConfiguration` allows audio-only mode in newer macOS versions.
- [ ] **P2 | Small** — Add idle detection: stop transcription processing after N seconds of silence (VAD-based) and resume when speech is detected.

### Model Management
- [ ] **P1 | Medium** — Implement model preloading at app launch. Currently the model loads on first `startListening()` — preload it in the background during `AppState.init()` so the first listen is instant.
- [ ] **P1 | Small** — Add model cache management in settings: show downloaded model sizes, allow deleting unused models.
- [ ] **P2 | Medium** — Implement lazy model unloading: free WhisperKit memory after 5 minutes of idle to reduce footprint when the app is running but not actively listening.

---

## System Robustness

### Recovery & Resilience
- [ ] **P0 | Medium** — Handle sleep/wake cycle properly. Register for `NSWorkspace.willSleepNotification` and `didWakeNotification`. On sleep: stop audio engines gracefully. On wake: restart if was previously listening. Currently neither `AVAudioEngine` nor `SCStream` handles this — both will silently fail after wake. See [Apple QA1340](https://developer.apple.com/library/archive/qa/qa1340/_index.html).
- [ ] **P0 | Medium** — Handle audio device hot-swap (headphones plugged/unplugged, Bluetooth connect/disconnect). Listen for `AVAudioSession.routeChangeNotification` and restart the audio engine with the new device. The current code will crash or produce silence on device change.
- [ ] **P0 | Small** — Add crash recovery for commitment data. Currently `CommitmentStore` writes atomically (`.atomic`), which is good — but add a backup file and recovery mechanism in case the primary JSON is corrupted.
- [ ] **P1 | Small** — Handle `AVAudioEngine` error -10877 (format mismatch) gracefully. This occurs when the audio format changes unexpectedly — catch it, reconfigure the converter, and restart.

### Permissions
- [ ] **P0 | Small** — Add explicit permission checks before starting audio capture. Currently `MicrophoneCapture.requestPermission()` exists but the app doesn't verify the result before proceeding.
- [ ] **P1 | Small** — Detect and handle revoked permissions gracefully. If the user revokes mic or screen recording permission while the app is running, show a clear error and guide them to re-enable.

### Security
- [ ] **P0 | Small** — Move API key storage from `UserDefaults` to macOS Keychain using `Security.framework`. `UserDefaults` stores in plaintext plist files — Keychain encrypts at rest. Use `SecItemAdd`/`SecItemCopyMatching`.
- [ ] **P1 | Small** — Add App Transport Security exception review. Ensure all API calls use HTTPS (currently Cerebras endpoint does). Audit for any HTTP fallbacks.
- [ ] **P2 | Medium** — Implement transcript data encryption at rest. The `commitments.json` file in Application Support contains meeting content — encrypt it with a key derived from the Keychain.

---

## Testing & Quality

### Unit Tests
- [ ] **P1 | Medium** — Add unit tests for `CommitmentExtractor.parseResponse()` with edge cases: empty array, malformed JSON, missing fields, markdown-wrapped responses, unicode characters.
- [ ] **P1 | Small** — Add unit tests for `ContextBuffer`: threshold detection, consume/reset behavior, overlap preservation.
- [ ] **P1 | Small** — Add unit tests for `CommitmentStore`: add, dismiss, delete, clearAll, persistence round-trip.
- [ ] **P1 | Medium** — Add unit tests for `CerebrasAPIClient` with mocked `URLProtocol` responses: success, 429 rate limit, network error, malformed response.

### Integration & UI Tests
- [ ] **P2 | Medium** — Add XCUITest for the main popover flow: open popover, verify empty state, verify commitment appears after mock insertion, test copy/dismiss actions.
- [ ] **P2 | Large** — Create mock audio test harness: pre-recorded audio files fed through the transcription pipeline to verify end-to-end extraction without a live microphone.
- [ ] **P2 | Medium** — Add snapshot tests for SwiftUI views using [swift-snapshot-testing](https://github.com/pointfreeco/swift-snapshot-testing).

### CI/CD
- [ ] **P2 | Medium** — Set up GitHub Actions CI with `xcodebuild test` for automated testing on push/PR.
- [ ] **P2 | Small** — Add SwiftLint configuration for consistent code style.

---

## Distribution & Packaging

### Code Signing & Notarization
- [ ] **P1 | Medium** — Set up Apple Developer ID code signing for distribution outside the App Store. Required for Gatekeeper to allow installation. See [Apple Developer ID docs](https://developer.apple.com/developer-id/).
- [ ] **P1 | Medium** — Implement notarization workflow using `xcrun notarytool submit` and `xcrun stapler staple`. Required since macOS Catalina for non-App Store apps. See [Apple notarization docs](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).
- [ ] **P1 | Small** — Create DMG installer using `hdiutil create` with a background image and Applications shortcut.

### Auto-Update
- [ ] **P1 | Large** — Integrate [Sparkle](https://sparkle-project.org/) framework for auto-updates. Use `SPUStandardUpdaterController` for automatic update checks. Sign updates with EdDSA keys (generated by `generate_appcast`). Supports delta updates for large apps. See [Sparkle documentation](https://sparkle-project.org/documentation/).
- [ ] **P2 | Small** — Add "Check for Updates" menu item in the app footer.
- [ ] **P2 | Medium** — Set up appcast XML hosting (GitHub Releases or S3) for Sparkle update feed.

### Packaging
- [ ] **P2 | Medium** — Create Homebrew Cask formula for `brew install --cask keep-me-honest` distribution.
- [ ] **P2 | Small** — Add version number display in settings view (read from `CFBundleShortVersionString`).

---

## Competitor Feature Comparison

| Feature | Otter.ai | Fireflies | Granola | Krisp | tl;dv | Keep Me Honest |
|---|---|---|---|---|---|---|
| Real-time transcription | Yes | Yes | Yes | Yes | Yes | Yes (basic) |
| Speaker identification | Yes (95%) | Yes | No | No | Yes | No (planned) |
| Action item extraction | Yes | Yes | Yes | Yes | Yes | Yes |
| Meeting summary | Yes | Yes | Yes | Yes | Yes | No (planned) |
| Noise cancellation | No | No | No | Yes (core) | No | No (planned) |
| Bot-free operation | No (bot joins) | No (bot joins) | Yes | Yes | No (bot joins) | Yes |
| On-device processing | No | No | Partial | Partial | No | Yes (core) |
| Multi-language | Yes | Yes | Limited | 16 langs | 30+ langs | English only |
| Calendar auto-start | Yes | Yes | Yes | No | Yes | No (planned) |
| Task manager export | Limited | Yes (Linear, Asana) | Yes (Notion) | No | Yes (5000+ via Zapier) | No (planned) |
| Meeting search | Yes | Yes | Yes | No | Yes | No (planned) |
| AI chat about meetings | Yes | Yes | Yes | No | Yes | No (future) |
| Privacy/local-first | No | No | Partial | Partial | No | Yes (core differentiator) |

---

## References & Resources

- [WhisperKit by Argmax](https://github.com/argmaxinc/WhisperKit) — On-device speech recognition for Apple Silicon
- [ScreenCaptureKit documentation](https://developer.apple.com/documentation/screencapturekit/) — Apple's API for screen and audio capture
- [KeyboardShortcuts](https://github.com/sindresorhus/KeyboardShortcuts) — User-customizable global hotkeys for macOS
- [Sparkle framework](https://sparkle-project.org/) — Auto-update framework for macOS apps
- [MLX Swift](https://github.com/ml-explore/mlx-swift) — Apple's ML framework with Swift bindings
- [AnyLanguageModel](https://huggingface.co/blog/anylanguagemodel) — Unified Swift API for local and remote LLMs
- [EventKit](https://developer.apple.com/documentation/eventkit) — Apple Reminders and Calendar integration
- [Azayaka](https://github.com/Mnpn/Azayaka) — Reference menu bar app using ScreenCaptureKit for audio recording
- [swift-snapshot-testing](https://github.com/pointfreeco/swift-snapshot-testing) — Snapshot testing for SwiftUI views
- [Apple QA1340 - Sleep/Wake notifications](https://developer.apple.com/library/archive/qa/qa1340/_index.html)
- [Cerebras API](https://docs.cerebras.ai/) — High-speed inference API
- [Things URL Scheme](https://culturedcode.com/things/support/articles/2803573/) — Deep link integration for Things 3
- [Todoist REST API v2](https://developer.todoist.com/rest/v2/) — Task creation API
- [Notion API](https://developers.notion.com/) — Database and page creation
- [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks) — Post messages to Slack channels
