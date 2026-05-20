# Xiaoqinglong 90-Second Demo Script

Goal: Showcase the seamless flow from voice command to local execution and dashboard monitoring.

## 0:00 - Setup (The "Bridge" is Live)
- Screen 1: Terminal running `npm run start:bridge` (Show MCP logs connecting).
- Screen 2: Browser open at `http://127.0.0.1:43174` (Mission Control Dashboard).
- Speaker: "Meet Xiaoqinglong, your local-first macOS AI operator."

## 0:15 - Basic Action (Voice to App)
- Action: Speak to Xiaozhi: "Open Apple Music and play some jazz."
- Visual: 
  - Terminal shows: `[MCP] Received: Open Music...`
  - Dashboard: Action "Open Music" appears in the log.
  - MacOS: Music app opens and starts playing.

## 0:35 - Complex Thought (LobeHub Brain)
- Action: Speak to Xiaozhi: "Check my system storage and tell me if I should clean up."
- Visual:
  - Terminal shows: `[Bridge] Dispatching to LobeHub Agent: storage-check`
  - Dashboard: Shows a "Lobe Task" being created and executed.
  - Final Voice/Text response: "You have 15GB left, consider clearing Downloads."

## 1:00 - Mission Control (The Dashboard)
- Visual: Hover over the Dashboard UI.
  - Point out the "Watchdog" status (Green).
  - Show the list of recent tasks.
  - Demonstrate a "Manual Inject" (Click a button in UI to trigger a desktop tool without voice).

## 1:20 - Privacy & Safety (Conclusion)
- Speaker: "Everything stays local. No cloud logs, no hidden syncing. Just you and your macOS."
- Final Shot: The Xiaoqinglong logo and GitHub URL.

## 1:30 - END
