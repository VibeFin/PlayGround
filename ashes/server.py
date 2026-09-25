"""Local HTTP server: serves the browser UI from web/ and exposes a tiny JSON API.

    GET  /api/state            -> full view-model for the current game
    POST /api/action {action}  -> dispatch one action, returns the new view-model

The server hosts a single game session (this is a single-player game running on
localhost). Player-facing errors come back as `"error"` in the view-model; any
unexpected exception is logged and reported without killing the server.
"""
from __future__ import annotations

import json
import mimetypes
import os
import sys
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from .engine.game import Game, GameError
from .engine.save import SaveManager
from .engine.view import build_view

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DIR = os.path.join(ROOT, "web")
DEFAULT_DATA_DIR = os.path.join(ROOT, "saves")
MAX_BODY = 64 * 1024
UI_SETTINGS = ("text_scale", "anim", "quality", "mute", "invert_y", "cam_speed")


class Session:
    def __init__(self, data_dir: str = DEFAULT_DATA_DIR, seed: int | None = None, dev: bool = False):
        self.data_dir = data_dir
        os.makedirs(data_dir, exist_ok=True)
        self.settings_path = os.path.join(data_dir, "settings.json")
        self.saves = SaveManager(data_dir)
        self.game = Game(seed=seed, settings=self._load_settings(), save_manager=self.saves, dev=dev)
        self.lock = threading.Lock()

    def _load_settings(self) -> dict:
        try:
            with open(self.settings_path, encoding="utf-8") as f:
                data = json.load(f)
            return {k: v for k, v in data.items() if k in ("difficulty", "autosave") + UI_SETTINGS}
        except (OSError, ValueError):
            return {}

    def _store_settings(self):
        try:
            tmp = self.settings_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.game.settings, f, indent=1)
            os.replace(tmp, self.settings_path)
        except OSError as e:
            print(f"[ashes] could not write settings: {e}", file=sys.stderr)

    def state(self) -> dict:
        with self.lock:
            return build_view(self.game, self.saves)

    def act(self, action: dict) -> dict:
        with self.lock:
            error = None
            try:
                if not isinstance(action, dict) or not isinstance(action.get("action"), str):
                    raise GameError("Malformed action.")
                if action["action"] == "settings":
                    # UI-only preferences ride along with engine settings so they persist together.
                    for k in UI_SETTINGS:
                        if k in action:
                            self.game.settings[k] = action.pop(k)
                self.game.dispatch(action)
                if action["action"] == "settings":
                    self._store_settings()
            except GameError as e:
                error = str(e)
            except TypeError as e:
                error = f"Invalid action parameters: {e}"
            except Exception:
                traceback.print_exc()
                error = "Something went wrong in the Aether (an internal error). The game state was kept; " \
                        "see the terminal for details."
            v = build_view(self.game, self.saves)
            if error:
                v["error"] = error
            return v


def make_handler(session: Session):
    class Handler(BaseHTTPRequestHandler):
        server_version = "AshesOfAether/1.0"

        def log_message(self, fmt, *args):
            if os.environ.get("ASHES_HTTP_LOG"):
                super().log_message(fmt, *args)

        def _send(self, code: int, body: bytes, ctype: str, cache: str = "no-store"):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", cache)
            self.end_headers()
            self.wfile.write(body)

        def _json(self, obj, code=200):
            self._send(code, json.dumps(obj).encode("utf-8"), "application/json; charset=utf-8")

        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/api/state":
                return self._json(session.state())
            if path == "/":
                path = "/index.html"
            full = os.path.normpath(os.path.join(WEB_DIR, path.lstrip("/")))
            if not full.startswith(WEB_DIR + os.sep) or not os.path.isfile(full):
                return self._send(404, b"Not found", "text/plain")
            ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
            if ctype.startswith("text/") or ctype in ("application/javascript",):
                ctype += "; charset=utf-8"
            # The vendored engine is large and versioned by directory; everything else must reload on edit.
            cache = "public, max-age=86400" if path.startswith("/vendor/") else "no-store"
            with open(full, "rb") as f:
                self._send(200, f.read(), ctype, cache)

        def do_POST(self):
            if urlparse(self.path).path != "/api/action":
                return self._send(404, b"Not found", "text/plain")
            try:
                n = int(self.headers.get("Content-Length", 0))
                if n > MAX_BODY:
                    return self._json({"error": "Request too large."}, 413)
                action = json.loads(self.rfile.read(n) or b"{}")
            except (ValueError, TypeError):
                return self._json({"error": "Invalid JSON."}, 400)
            self._json(session.act(action))

    return Handler


def serve(host: str = "127.0.0.1", port: int = 8765, data_dir: str = DEFAULT_DATA_DIR, open_browser: bool = True,
          seed: int | None = None, dev: bool = False):
    session = Session(data_dir, seed=seed, dev=dev)
    httpd = None
    for p in range(port, port + 20):
        try:
            httpd = ThreadingHTTPServer((host, p), make_handler(session))
            break
        except OSError:
            continue
    if httpd is None:
        raise SystemExit(f"No free port found in {port}-{port + 19}.")
    url = f"http://{host}:{httpd.server_address[1]}/"
    print(f"Ashes of Aether is running at {url}\nSaves: {data_dir}\n"
          f"{'Developer tools enabled (press ` in game).' + chr(10) if dev else ''}Press Ctrl+C to quit.", flush=True)
    if open_browser:
        import webbrowser
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nFarewell, traveller.")
    finally:
        httpd.server_close()
