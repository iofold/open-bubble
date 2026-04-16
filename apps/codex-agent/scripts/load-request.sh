#!/usr/bin/env bash
set -euo pipefail

if [ -n "${OPEN_BUBBLE_CONTEXT_REQUEST:-}" ]; then
  printf '%s\n' "$OPEN_BUBBLE_CONTEXT_REQUEST"
  exit 0
fi

if [ -n "${OPEN_BUBBLE_CONTEXT_REQUEST_FILE:-}" ]; then
  cat "$OPEN_BUBBLE_CONTEXT_REQUEST_FILE"
  exit 0
fi

if [ -f requests/latest.json ]; then
  cat requests/latest.json
  exit 0
fi

echo "No context request found. Set OPEN_BUBBLE_CONTEXT_REQUEST or OPEN_BUBBLE_CONTEXT_REQUEST_FILE." >&2
exit 66
