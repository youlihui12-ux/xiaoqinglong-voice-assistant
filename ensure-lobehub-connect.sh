#!/bin/zsh
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
LOBE="${LOBE_CLI_PATH:-$HOME/Library/Application Support/LobeHub/bin/lobe}"
STATUS="$($LOBE connect status 2>&1 || true)"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $STATUS"
if echo "$STATUS" | grep -Eiq "Connection[[:space:]]*:[[:space:]]*connected|\\bCONNECTED\\b"; then
  exit 0
fi
exec "$LOBE" connect --daemon
