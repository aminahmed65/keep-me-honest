# Keep Me Honest - Project Context

## What This Is
A macOS menu bar utility that passively listens during meetings, transcribes speech locally, and uses AI to extract personal commitments ("I'll send that file," "Let me check on that") so users never drop the ball.

## Core Principles
- **Zero-Click Capture**: No manual input. The app listens for "Commitment Triggers" and silently buffers them.
- **Local-First Privacy**: All audio transcription happens on-device via WhisperKit on Apple Silicon Neural Engine. No raw audio leaves the Mac.
- **Invisible UX**: Menu bar only, no dock icon (`LSUIElement = YES`), no pop-ups. Only appears when the user clicks the menu bar icon.
- **Flow State Preservation**: Never interrupt the user. Collect silently, present on demand.

## Technical Stack
- **Language**: Swift, SwiftUI
- **Platform**: macOS only (Apple Silicon required for Neural Engine)
- **UI**: `MenuBarExtra` popover with task list, "Copy to Clipboard" and "Dismiss" actions
- **Mic Capture**: `AVAudioEngine` for user microphone input
- **System Audio Capture**: `ScreenCaptureKit` (`SCStream`) for capturing other participants in Zoom/Meet/Slack
- **Local Transcription**: WhisperKit (by Argmax) — Swift-native Whisper on CoreML/Neural Engine
- **AI Processing**: Z.ai GLM 4.7 on Cerebras API (~1000+ TPS) for commitment extraction
- **Storage**: `UserDefaults` or local JSON/SQLite file — no cloud database

## Architecture Overview
1. **Audio Layer**: AVAudioEngine (mic) + ScreenCaptureKit (system) → mixed audio buffer
2. **Transcription Layer**: Mixed audio → WhisperKit → running text "Context Buffer"
3. **Processing Layer**: When buffer hits ~500 words or detects a pause (VAD), send to Cerebras API
4. **Extraction Layer**: GLM 4.7 returns strictly typed JSON with `intent`, `assignee`, `deadline`, `context_quote`
5. **Storage Layer**: Parsed JSON → local persistence → SwiftUI popover binding

## API Response Format
The Cerebras API must return JSON in this shape:
```json
[
  {
    "intent": "code review",
    "assignee": "self",
    "deadline": "tomorrow by 5pm",
    "context_quote": "I'll take a look at that pull request tomorrow before 5."
  }
]
```

## Development Phases
1. **Phase 1 — UI Shell**: Xcode project, SwiftUI MenuBarExtra, popover with list/copy/dismiss
2. **Phase 2 — Mic & Transcription**: AVAudioEngine + WhisperKit, real-time local transcription
3. **Phase 3 — System Audio**: ScreenCaptureKit capture, audio mixer, combined buffer to WhisperKit
4. **Phase 4 — AI Pipeline**: Context buffer, threshold trigger, Cerebras API calls, commitment extraction
5. **Phase 5 — Storage & Triage**: JSON parsing, local persistence, SwiftUI data binding

## Key Decisions
- No Electron, no cross-platform — native macOS only
- No virtual audio cables — ScreenCaptureKit handles system audio natively
- No cloud storage or user accounts for MVP
- Threshold-based processing (not cron) — trigger on ~500 words or voice pause
- GLM 4.7 chosen for context retention across API calls (remembers earlier transcript context)
