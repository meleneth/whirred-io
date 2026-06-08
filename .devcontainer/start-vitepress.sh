#!/usr/bin/env sh
set -eu

cd /workspaces/whirred-io

if command -v pgrep >/dev/null 2>&1 && pgrep -f "vitepress dev docs" >/dev/null 2>&1; then
  echo "VitePress dev server is already running."
  exit 0
fi

log_file="/tmp/whirred-io-vitepress.log"
if command -v setsid >/dev/null 2>&1; then
  setsid npm run docs:dev > "$log_file" 2>&1 &
else
  nohup npm run docs:dev > "$log_file" 2>&1 &
fi

echo "VitePress dev server starting on http://localhost:5173"
echo "Logs: $log_file"
