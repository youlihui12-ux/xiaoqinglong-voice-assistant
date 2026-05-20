# macOS Setup Notes

1. Install Node.js 18 or newer.
2. Install or enable the Xiaozhi desktop MCP connection.
3. Install LobeHub CLI and confirm `lobe connect status` reports connected.
4. Copy `.env.example` to `.env` and fill local values.
5. Start `npm run start:frontdoor`, `npm run start:panel`, and `npm run start:bridge`.

For long-running local use, create LaunchAgent plist files that call the npm scripts or shell scripts in this repository. Keep those plist files machine-specific and do not commit secrets.
