#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
/usr/bin/time -p pwd
PROJECT_ROOT="$(pwd)"
/usr/bin/time -p /usr/bin/printf 'project root: %s\n' "$PROJECT_ROOT"
PORT="${PORT:-3000}"
export PORT
/usr/bin/time -p /usr/bin/printf 'using PORT=%s\n' "$PORT"
/usr/bin/time -p test -d dist
if /usr/bin/time -p test -f package.json; then
  if /usr/bin/time -p test -f package-lock.json; then
    /usr/bin/time -p npm ci --no-audit --no-fund
  else
    /usr/bin/time -p npm install --no-audit --no-fund
  fi
  if /usr/bin/time -p node -e "process.exit(require('./package.json').scripts && require('./package.json').scripts.build ? 0 : 1)"; then
    /usr/bin/time -p npm run build
  fi
fi
/usr/bin/time -p test -f dist/index.html
/usr/bin/time -p realpath dist
ABS_DIST="$(realpath dist)"
/usr/bin/time -p /usr/bin/printf 'built directory: %s\n' "$ABS_DIST"
WEB_DIR="${OPENCODE_WEB_DIR:?OPENCODE_WEB_DIR must be set}"
/usr/bin/time -p mkdir -p "$WEB_DIR"
/usr/bin/time -p node -e "const fs=require('fs');const path=require('path');const web=process.env.OPENCODE_WEB_DIR;const dir=process.argv[1];const project=process.cwd();fs.writeFileSync(path.join(web,'deployment-output.json'),JSON.stringify({project,directory:dir}))" "$ABS_DIST"
/usr/bin/time -p cat "$WEB_DIR/deployment-output.json"
/usr/bin/time -p /usr/bin/printf '\nserving %s on port %s\n' "$ABS_DIST" "$PORT"
/usr/bin/time -p python3 -m http.server "$PORT" --directory "$ABS_DIST"
