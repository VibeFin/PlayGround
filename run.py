#!/usr/bin/env python3
"""Launch Ashes of Aether: starts a local server and opens the game in your browser."""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ashes.server import DEFAULT_DATA_DIR, serve  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Ashes of Aether — a turn-based fantasy RPG.")
    ap.add_argument("--port", type=int, default=8765, help="first port to try (default 8765)")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--no-browser", action="store_true", help="don't open a browser tab automatically")
    ap.add_argument("--data-dir", default=os.environ.get("ASHES_DATA_DIR", DEFAULT_DATA_DIR),
                    help="where saves and settings are stored")
    ap.add_argument("--seed", type=int, default=None, help="fixed RNG seed (for testing)")
    ap.add_argument("--dev", action="store_true", default=bool(os.environ.get("ASHES_DEV")),
                    help="enable developer tools (teleport, spawn fights, state inspector)")
    a = ap.parse_args()
    serve(a.host, a.port, a.data_dir, open_browser=not a.no_browser, seed=a.seed, dev=a.dev)
