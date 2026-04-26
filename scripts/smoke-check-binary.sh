#!/usr/bin/env bash
set -euo pipefail

binary="${1:-./dist/server}"
timeout_seconds="${2:-5}"

set +e
out=$(printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"ci","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  | timeout "$timeout_seconds" "$binary")
status=$?
set -e

if [ "$status" -ne 0 ] && [ "$status" -ne 124 ]; then
  echo "$out"
  exit "$status"
fi

echo "$out"
echo "$out" | grep -q '"protocolVersion":"2025-06-18"'
