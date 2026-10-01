#!/usr/bin/env bash
set -euo pipefail
URL="${CAPTURE_URL:?CAPTURE_URL is required}"
OUT="${CAPTURE_DIR:?CAPTURE_DIR is required}"
SESSION="capture-$RANDOM-$$"
OPENED=false
cleanup(){ if [[ "$OPENED" == true ]]; then /usr/bin/time -p playwright-cli -s="$SESSION" close >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT
/usr/bin/time -p mkdir -p "$OUT"
if ! /usr/bin/time -p playwright-cli -s="$SESSION" open "$URL"; then
  echo 'Browser launch or navigation failed temporarily.' >&2
  exit 75
fi
OPENED=true
/usr/bin/time -p sleep 3
if ! /usr/bin/time -p playwright-cli -s="$SESSION" eval 'document.readyState === "complete" && document.body.dataset.rendered === "true" && document.querySelector("canvas")?.width > 0'; then
  echo 'The page did not reach its rendered state.' >&2
  exit 1
fi
/usr/bin/time -p playwright-cli -s="$SESSION" screenshot --filename="$OUT/final-desktop.png"
/usr/bin/time -p playwright-cli -s="$SESSION" resize 390 844
/usr/bin/time -p sleep 2
/usr/bin/time -p playwright-cli -s="$SESSION" screenshot --filename="$OUT/final-mobile.png"
[[ -s "$OUT/final-desktop.png" && -s "$OUT/final-mobile.png" ]] || { echo 'Screenshot output is missing.' >&2; exit 1; }
