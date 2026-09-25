#!/usr/bin/env bash
# Serve the kart-game (Three.js Mario Kart clone) static build.
# Writes deployment-output.json, installs deps, builds when needed,
# then serves the built directory in the foreground on $PORT (default 3000).
set -euo pipefail
cd "$(dirname "$0")/kart-game"
PORT="${PORT:-3000}"
export PORT
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
if /usr/bin/time -p test ! -d node_modules/.bin; then
  if /usr/bin/time -p test -f package-lock.json; then
    /usr/bin/time -p npm ci --no-audit --no-fund
  else
    /usr/bin/time -p npm install --no-audit --no-fund
  fi
fi
if /usr/bin/time -p test ! -f dist/index.html; then
  /usr/bin/time -p npm run build
elif [ -n "$(find src index.html vite.config.js package.json -newer dist/index.html -print -quit 2>/dev/null)" ]; then
  /usr/bin/time -p npm run build
else
  echo "dist up to date; skipping build"
fi
/usr/bin/time -p mkdir -p "$WEB_DIR"
/usr/bin/time -p printf '{"project":"/home/runner/work/PlayGround/PlayGround","directory":"%s"}' "$PWD/dist" > "$WEB_DIR/deployment-output.json"
/usr/bin/time -p cat "$WEB_DIR/deployment-output.json"
echo
export DIST_DIR="$PWD/dist"
echo "serving $DIST_DIR on port $PORT"
/usr/bin/time -p cat > "$WEB_DIR/static-server.mjs" <<'EOF'
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
const root = resolve(process.env.DIST_DIR || process.cwd());
const port = Number(process.env.PORT || 3000);
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.map': 'application/json' };
const server = createServer((req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    const url = new URL(req.url, 'http://localhost');
    let path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (path !== root && !path.startsWith(root + '/')) { res.writeHead(404); res.end(); return; }
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
    if (!existsSync(path)) {
      if (!extname(path)) path = join(root, 'index.html');
      else { res.writeHead(404); res.end('Not found'); return; }
    }
    res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    const content = readFileSync(path);
    if (req.method === 'HEAD') { res.end(); return; }
    res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(port, '0.0.0.0', () => console.log(`serving ${root} on ${port}`));
EOF
/usr/bin/time -p node --check "$WEB_DIR/static-server.mjs"
exec node "$WEB_DIR/static-server.mjs"
