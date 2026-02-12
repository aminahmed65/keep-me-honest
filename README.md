 3: System Audio Capture (The Hard Part)

[ ] Implement ScreenCaptureKit (SCStream) to capture system audio (what other people say in Zoom/Meet).

[ ] Build an audio mixer to combine the AVAudioEngine (Mic) stream and ScreenCaptureKit (System) stream.

[ ] Feed the combined audio buffer into WhisperKit for unified transcription.

[ ] Phase 4: The "Thinking" Pipeline (Z.ai GLM 4.7 on Cerebras)

[ ] Implement a "Context Buffer" to store transcribed text strings.

[ ] Build a timer/threshold logic (e.g., trigger API call every 3-5 minutes or after X words).

[ ] Write the HTTP POST request to the Cerebras API using Z.ai GLM 4.7.

[ ] Configure the prompt to extract commitments and return strictly typed JSON.

[ ] Phase 5: Storage & Triage

[ ] Parse the JSON reProduct Specification: Keep Me Honest (macOS MVP)

0. MVP Development Checklist

Use this checklist to track your progress from "Hello World" to a working prototype.

[ ] Phase 1: The UI Shell

[ ] Initialize macOS Xcode project using SwiftUI.

[ ] Configure as MenuBarExtra (Menu Bar Utility).

[ ] Set LSUIElement to YES in Info.plist to hide the Dock icon.

[ ] Build the basic Popover UI (The "Daily Debrief" list view with "Copy" and "Dismiss" buttons).

[ ] Phase 2: Local Transcription & Mic Capture

[ ] Integrate AVAudioEngine to capture the user's microphone input.

[ ] Integrate WhisperKit to run Whisper locally on the Apple Silicon Neural Engine (NPU).

[ ] Successfully transcribe your own voice in real-time and print to Xcode console.

[ ] Phasesponse in Swift.

[ ] Save extracted tasks to local UserDefaults or a local JSON file.

[ ] Bind the saved tasks to the SwiftUI Popover so the user can review them.

1. Executive Summary & Mission

Mission: To preserve a user's Flow State while guaranteeing their personal integrity and reliability.
Goal: Build a functional, local-only macOS prototype. No user accounts, no cross-platform bloat, no cloud databases. Everything runs locally on the Mac, communicating only with the Cerebras API for intent extraction.

2. The Problem & Core Solution

The Problem: High-performing individuals constantly trade off between deep work and administrative reliability. Current tools (Todoist, Jira) require you to stop doing the work to record the work.
The Solution: "Zero-Click Capture." The app listens passively via system-level hooks for specific "Commitment Triggers" (e.g., "I'll send," "Let me check," "By next week") and silently buffers these commitments into a "Holding Area."

3. User Experience: "The Benevolent Shadow"

The app operates as a shadow, only appearing when you transition out of your flow state.

Invisible during the "Do": The app lives entirely in the Mac menu bar. It has no dock icon. When a meeting is active, the icon subtly changes color to indicate it is "listening."

Trust, Don't Nag: Zero pop-ups. It quietly collects data and presents it only when you click the menu bar icon.

Context is King: The review UI presents the source of truth: "You said 'I'll send that file' to [Josh] at [10:42 AM]."

Low-Guilt Triage: Simple UI to "Copy to Clipboard" (to paste into your actual task manager) or "Dismiss" (if it was a false positive).

4. Technical Architecture: The Native Mac Stack

To achieve the "Invisible" UX, the application avoids intrusive bots and uses native macOS frameworks.

4.1 Bot-less Audio Capture

User Audio: AVAudioEngine captures the default microphone input.

System Audio: ScreenCaptureKit captures audio from other apps (Zoom, Slack, browser) directly from the system output without requiring virtual audio cables.

4.2 Local Transcription Engine

Instead of sending raw audio to the cloud (which is slow and a massive privacy risk), everything is transcribed locally.

WhisperKit (by Argmax): A Swift-native implementation of OpenAI's Whisper model optimized for Apple CoreML. It runs directly on the Mac's Neural Engine, transcribing speech in real-time with virtually zero impact on CPU or battery.

5. AI Processing Pipeline: "Continuous Thinking"

Rather than a rigid cron job, the system uses a Threshold-Based Processing Pipeline powered by Z.ai GLM 4.7 on Cerebras.

5.1 The Pipeline Flow

Local Transcription Buffer: WhisperKit transcribes speech locally and appends text to a running "Context Buffer."

The Trigger Threshold: The app evaluates the buffer. If the buffer reaches ~500 words (or detects a long pause via Voice Activity Detection), it triggers a processing cycle.

Cloud Inference: The buffered transcript chunk is sent to the Cerebras API.

5.2 The LLM Stack: Z.ai GLM 4.7 on Cerebras

Extreme Speed (~1000+ TPS): Cerebras processes tokens at an order of magnitude faster than standard GPUs.

Preserved Thinking (Context Retention): GLM 4.7 retains its internal reasoning context across API calls. It remembers the project context from minute 5 when analyzing a commitment made at minute 45, without having to re-read the whole transcript.

Agentic Structuring: GLM 4.7 is instructed to output strictly typed JSON:

[
  {
    "intent": "code review",
    "assignee": "self",
    "deadline": "tomorrow by 5pm",
    "context_quote": "I'll take a look at that pull request tomorrow before 5."
  }
]


6. Local Storage

The JSON objects returned by the API are parsed natively in Swift and stored in a lightweight local mechanism (UserDefaults or a local SQLite file). These tasks wait silently until the user opens the Menu Bar popover.
