# Xiaoqinglong Roadmap

## v0.1: Base Bridge (Current)
- [x] Xiaozhi MCP WebSocket bridge.
- [x] LobeHub Local Device CLI integration.
- [x] Basic desktop tools (Open App, Media Control).
- [x] Mission Control dashboard (Port 43174).
- [x] Health check and watchdog system.
- [x] Open-source readiness (Doctor script, CI, Docs).
- [x] Immediate completed/blocked task reports through LobeHub notification, with optional macOS speech and system notification.
- [x] Hardware TTS downlink foundation: local-only gateway delivery plus durable outbox when the device gateway is not connected.

## v0.2: Desktop Operations & Safety
- [ ] **Rich Toolset:** Add more native macOS tools (System Settings, Finder operations, Calendar/Reminders).
- [ ] **Approval Workflow:** Refine the high-risk action approval UI in Mission Control.
- [ ] **Config Manager:** Web-based `.env` and allowlist editor.
- [ ] **Multi-Agent Support:** Dispatch different voice intents to specialized LobeHub Agents.
- [ ] **Better Logging:** Structured local log viewer in the dashboard.

## v0.3: Advanced Intelligence & Context
- [ ] **Context Injection:** Support injecting active window title and simple OCR context into LobeHub.
- [ ] **Task Chaining:** Support multi-step task queues with intermediate status updates.
- [ ] **Plugin System:** Easy way to add new MCP tools without editing core files.
- [ ] **Hardware Voice Feedback:** Add the ESP32-facing TTS gateway that converts queued reports into `tts start` + audio frames + `tts stop`.
- [ ] **Mobile Remote:** PWA optimization for Mission Control on mobile.
