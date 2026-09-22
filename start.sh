#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# MiloAgent — Autonomous AI Growth Agent (https://github.com/SoCloseSociety/MiloAgent)
# Vendored under ./milo-agent. Serves FastAPI web dashboard on $PORT.
export MILO_WEB_USER="${MILO_WEB_USER:-admin}"
export MILO_WEB_PASS="${MILO_WEB_PASS:-milo-demo-123}"
PORT="${PORT:-${APP_PORT:-3000}}"
export PORT
if [[ ! -x milo-agent/.venv/bin/python ]]; then
  /usr/bin/time -p python3 -m venv milo-agent/.venv
  /usr/bin/time -p milo-agent/.venv/bin/pip install --upgrade pip
  /usr/bin/time -p milo-agent/.venv/bin/pip install -r milo-agent/requirements.txt
  # passlib 1.7.4 is incompatible with bcrypt>=4.2 (ValueError: 72 bytes)
  /usr/bin/time -p milo-agent/.venv/bin/pip install "bcrypt==4.0.1"
fi
exec /usr/bin/time -p milo-agent/.venv/bin/python milo-agent/miloagent.py run --web --web-port "$PORT"
