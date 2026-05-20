# Changelog

## v0.1.1 - Launchd Upgrade Compatibility

### Added

- Task terminal reports now fire for completed and blocked tasks, and can optionally trigger macOS local speech and system notifications in addition to the existing LobeHub notification topic.

### Fixed

- Services started by launchd now read `.env` and the legacy `doubao-asr-frontdoor.env` consistently.
- Mission Control, the MCP desktop tools, and the Lobe dispatch worker now share the same local LobeHub Agent ID and CLI path.
- `npm run doctor` recognizes legacy upgraded installs while keeping `.env` as the override source.

## v0.1.0 - Local AI Operator Bridge

First public release of Xiaoqinglong Voice Assistant.

### Added

- Xiaozhi MCP WebSocket bridge for voice-to-local-command workflows.
- LobeHub Local Device dispatch path for using a LobeHub Agent as the reasoning brain.
- macOS desktop tool execution layer for safe local actions.
- Mission Control dashboard on `127.0.0.1:43174`.
- Mission Control API and health endpoints on `127.0.0.1:43173`.
- Local readiness checker: `npm run doctor`.
- Smoke test entrypoint: `node scripts/smoke-test.js`.
- GitHub CI across Node.js 18, 20, and 22.
- OSSF Scorecard supply-chain security workflow.
- Issue templates, PR template, launch copy, demo script, release checklist, and roadmap.

### Safety

- Open-source package excludes local `.env`, private Agent IDs, personal logs, runtime task queues, screenshots, and machine-specific paths.
- Defaults keep local services bound to `127.0.0.1`.
- High-risk local operations are designed to go through explicit local configuration and approval boundaries.

### Known Limits

- This release is a bridge and operator control surface, not a packaged macOS app.
- Users must provide their own Xiaozhi MCP endpoint, Doubao ASR key, LobeHub Agent ID, and local token.
- Voice response back to Xiaozhi hardware TTS is not included in this release; macOS local speech and notifications can be enabled for completion reports.
