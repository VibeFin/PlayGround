#!/usr/bin/env bash
set -euo pipefail
timed() {
  TIMEFORMAT="[timing] $*: %3R seconds"
  time "$@"
}
timed cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export PROJECT_DIR="$PWD"
export PORT="${PORT:-3000}"
export OPENCODE_WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
if [[ -f package-lock.json ]]; then
  timed npm ci --include=dev --no-audit --no-fund
else
  timed npm install --include=dev --no-audit --no-fund
fi
# Complete the build before listening; do not delete/rewrite the served bundle
# underneath public preview requests with an in-process build watcher.
timed npm run build
timed node scripts/start-server.mjs
