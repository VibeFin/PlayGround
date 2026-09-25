#!/usr/bin/env bash
# Ashes of Aether — project launcher.
# Serves the game (static web/ UI + Python JSON API) in the foreground on PORT (default 3000).
set -euo pipefail
cd "$(dirname "$0")"

/usr/bin/time -p python3 --version
/usr/bin/time -p test -f web/index.html

PORT="${PORT:-3000}"
export PORT
export PROJECT_ROOT="$PWD"
export STATIC_DIR="$PWD/web"
export OUT_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
/usr/bin/time -p mkdir -p "$OUT_DIR"
/usr/bin/time -p python3 -c "import json,os; out=os.environ['OUT_DIR']; proj=os.environ['PROJECT_ROOT']; d=os.environ['STATIC_DIR']; assert os.path.isfile(os.path.join(d,'index.html')),'missing web/index.html'; os.makedirs(out,exist_ok=True); open(os.path.join(out,'deployment-output.json'),'w').write(json.dumps({'project':proj,'directory':d})); print(json.dumps({'project':proj,'directory':d}))"
/usr/bin/time -p cat "$OUT_DIR/deployment-output.json"
echo "Starting Ashes of Aether on http://127.0.0.1:$PORT/ (static: $STATIC_DIR)"
/usr/bin/time -p python3 run.py --host 127.0.0.1 --port "$PORT" --no-browser
