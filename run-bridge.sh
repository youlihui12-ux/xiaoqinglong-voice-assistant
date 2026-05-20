#!/bin/zsh
set -eu
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

BRIDGE_DIR="${XIAOQINGLONG_BRIDGE_DIR:-$(cd "$(dirname "$0")" && pwd)}"
ENV_FILE="$BRIDGE_DIR/.env"
TOOLS_FILE="$BRIDGE_DIR/desktop-tools.js"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

if [ -z "${XIAOZHI_MCP_WS:-}" ]; then
  echo "Missing XIAOZHI_MCP_WS" >&2
  exit 1
fi

MCP_EXE_BIN="${MCP_EXE_BIN:-}"
if [ -n "$MCP_EXE_BIN" ] && [ -x "$MCP_EXE_BIN" ]; then
  exec "$MCP_EXE_BIN" \
    --ws "$XIAOZHI_MCP_WS" \
    --mcp-js "$TOOLS_FILE" \
    --server-name xiaozhi-desktop-bridge
fi

exec /usr/bin/env npx --yes mcp_exe \
  --ws "$XIAOZHI_MCP_WS" \
  --mcp-js "$TOOLS_FILE" \
  --server-name xiaozhi-desktop-bridge
