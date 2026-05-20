# Architecture

```mermaid
flowchart LR
  User["User voice"] --> Xiaozhi["Xiaozhi voice console"]
  Xiaozhi --> Bridge["run-bridge.sh / mcp_exe"]
  Bridge --> Tools["desktop-tools.js"]
  Tools --> Queue["xiaoqinglong-ai-tasks.json"]
  Tools --> Lobe["LobeHub CLI Agent"]
  Frontdoor["doubao-asr-frontdoor.js"] --> Mission["Mission Control API"]
  Mission --> Panel["control-panel"]
  Watchdog["ensure-lobehub-connect.sh"] --> Lobe
```

The control panel is intentionally read-mostly. Destructive process control is not enabled by default; users should wire launchd or another supervisor explicitly for their own machine.
