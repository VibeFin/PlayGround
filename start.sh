#!/usr/bin/env bash
# Summer Cycle: install deps (pnpm-only repo), build when needed, publish
# deployment-output.json, then serve dist/ in the foreground on $PORT.
set -euo pipefail
cd "$(dirname "$0")"
PROJECT_ROOT="$PWD"
PORT="${PORT:-3000}"
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"

echo "[start] project=$PROJECT_ROOT port=$PORT web_dir=$WEB_DIR"

/usr/bin/time -p command -v pnpm >/dev/null || /usr/bin/time -p corepack enable
/usr/bin/time -p pnpm --version

if [[ ! -f node_modules/.modules.yaml ]] || [[ pnpm-lock.yaml -nt node_modules/.modules.yaml ]]; then
  /usr/bin/time -p pnpm install --frozen-lockfile
else
  echo "[start] dependencies up to date, skipping install"
fi

NEED_BUILD=0
if [[ ! -f dist/index.html ]]; then
  NEED_BUILD=1
else
  FOUND="$(/usr/bin/time -p find src index.html package.json pnpm-lock.yaml vite.config.ts -newer dist/index.html -print -quit 2>/dev/null || true)"
  [[ -n "$FOUND" ]] && NEED_BUILD=1
fi
if [[ "$NEED_BUILD" == 1 ]]; then
  /usr/bin/time -p pnpm build
else
  echo "[start] dist/ up to date, skipping build"
fi
/usr/bin/time -p test -f dist/index.html

/usr/bin/time -p mkdir -p "$WEB_DIR"
/usr/bin/time -p bash -c "printf '%s' '{\"project\":\"$PROJECT_ROOT\",\"directory\":\"$PROJECT_ROOT/dist\"}' >\"$WEB_DIR/deployment-output.json\""
/usr/bin/time -p cat "$WEB_DIR/deployment-output.json"
echo ""

echo "[start] serving $PROJECT_ROOT/dist on 127.0.0.1:$PORT (foreground)"
exec /usr/bin/time -p ./node_modules/.bin/vite preview --host 127.0.0.1 --port "$PORT" --strictPort
