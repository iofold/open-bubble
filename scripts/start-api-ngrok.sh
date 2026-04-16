#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
api_dir="$repo_root/apps/api"

if [ ! -x "$api_dir/node_modules/.bin/tsx" ]; then
  (
    cd "$api_dir"
    npm ci
  )
fi

(
  cd "$api_dir"
  npm run dev:ngrok
)
