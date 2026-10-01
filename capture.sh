#!/usr/bin/env bash
set -euo pipefail
timed() {
  TIMEFORMAT="[timing] $*: %3R seconds"
  time "$@"
}
timed cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export PROJECT_DIR="$PWD"
if [[ -z "${CAPTURE_URL:-}" || -z "${CAPTURE_DIR:-}" ]]; then
  printf '%s\n' 'CAPTURE_URL and CAPTURE_DIR are required.' >&2
  exit 1
fi
timed node scripts/capture.mjs
