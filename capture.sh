#!/usr/bin/env bash
# Capture desktop + mobile screenshots of the running app.
# Inputs: CAPTURE_URL, CAPTURE_DIR. Leaves the app running.
# Exit 75 = temporary navigation/browser infra failure, 1 = script/rendering defect.
set -euo pipefail
if [ -z "${CAPTURE_URL:-}" ]; then echo "CAPTURE_URL is required" >&2; exit 1; fi
if [ -z "${CAPTURE_DIR:-}" ]; then echo "CAPTURE_DIR is required" >&2; exit 1; fi
if [ -z "${RUNTIME_DIR:-}" ]; then echo "RUNTIME_DIR is required" >&2; exit 1; fi
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
/usr/bin/time -p node "$RUNTIME_DIR/scripts/default-capture.mjs"
/usr/bin/time -p test -f "$CAPTURE_DIR/final-desktop.png"
/usr/bin/time -p test -f "$CAPTURE_DIR/final-mobile.png"
/usr/bin/time -p ls -la "$CAPTURE_DIR"
