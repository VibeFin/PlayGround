import json
import os
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

from helpers import tempdir
from ashes.server import Session, make_handler, MAX_BODY


class SessionTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempdir()
        self.s = Session(self.dir, seed=3)

    def create(self):
        self.s.act({"action": "new_game"})
        return self.s.act({"action": "create", "name": "Ser Test", "race": "elf", "cls": "fighter"})

    def test_title_state(self):
        v = self.s.state()
        self.assertEqual(v["mode"], "title")
        self.assertEqual(v["saves"], [])
        v = self.s.act({"action": "new_game"})
        self.assertEqual(len(v["creation"]["races"]), 3)
        self.assertEqual(len(v["creation"]["classes"]), 3)

    def test_errors_come_back_in_the_view(self):
        self.assertIn("error", self.s.act({"action": "nonsense"}))
        self.assertIn("error", self.s.act({"action": "move", "to": "x"}))
        self.assertIn("error", self.s.act(["not", "a", "dict"]))
        self.assertIn("error", self.s.act({"action": 5}))
        v = self.create()
        self.assertNotIn("error", v)
        self.assertEqual(v["mode"], "combat")
        v = self.s.act({"action": "combat", "kind": "attack", "target": {"bad": 1}})
        self.assertEqual(v["mode"], "combat")

    def test_internal_errors_do_not_kill_the_session(self):
        self.create()
        original = self.s.game.act_rest
        self.s.game.act_rest = lambda: 1 / 0
        try:
            import contextlib
            import io
            with contextlib.redirect_stderr(io.StringIO()):
                v = self.s.act({"action": "rest"})
        finally:
            self.s.game.act_rest = original
        self.assertIn("internal error", v["error"])
        self.assertEqual(self.s.state()["mode"], v["mode"])

    def test_settings_persist_across_sessions(self):
        self.s.act({"action": "settings", "difficulty": "hard", "text_scale": 1.25, "anim": False, "autosave": False})
        with open(os.path.join(self.dir, "settings.json")) as f:
            stored = json.load(f)
        self.assertEqual((stored["difficulty"], stored["text_scale"], stored["anim"], stored["autosave"]),
                         ("hard", 1.25, False, False))
        s2 = Session(self.dir)
        self.assertEqual(s2.state()["saves"], [], "the settings file is not a save slot")
        self.assertIn("error", s2.act({"action": "load", "slot": "settings"}))
        self.assertEqual(s2.state()["settings"]["difficulty"], "hard")
        self.assertEqual(s2.state()["settings"]["text_scale"], 1.25)

    def test_corrupt_settings_file_is_ignored(self):
        with open(os.path.join(self.dir, "settings.json"), "w") as f:
            f.write("{{{")
        self.assertEqual(Session(self.dir).state()["settings"]["difficulty"], "normal")

    def test_view_shapes_by_mode(self):
        v = self.create()
        cb = v["combat"]
        self.assertTrue(cb["my_turn"])
        self.assertTrue(cb["attack_targets"])
        self.assertTrue(cb["abilities"])
        while self.s.game.mode == "combat" and self.s.game.combat.state == "ongoing":
            self.s.game.combat.player.hp = 999
            v = self.s.act({"action": "combat", "kind": "attack"})
        self.assertEqual(v["combat"]["result"]["state"], "victory")
        v = self.s.act({"action": "combat_done"})
        for key in ("player", "location", "inventory", "skills", "quests", "achievements", "journal", "reputation"):
            self.assertIn(key, v, key)
        self.assertTrue(any(n["type"] == "achievement" for n in v["notifications"]) or v["achievements"])
        json.dumps(v)


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.session = Session(tempdir(), seed=1)
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(cls.session))
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def get(self, path):
        with urllib.request.urlopen(self.base + path, timeout=5) as r:
            return r.status, r.headers.get("Content-Type", ""), r.read()

    def post(self, body: bytes):
        req = urllib.request.Request(self.base + "/api/action", data=body, method="POST",
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    def test_serves_the_ui(self):
        status, ctype, body = self.get("/")
        self.assertEqual(status, 200)
        self.assertIn("text/html", ctype)
        self.assertIn(b"/js/app.js", body)
        status, ctype, _ = self.get("/js/app.js")
        self.assertIn("javascript", ctype)
        status, ctype, _ = self.get("/css/style.css")
        self.assertIn("text/css", ctype)

    def test_static_files_cannot_escape_web_dir(self):
        for path in ("/../ashes/server.py", "/%2e%2e/ashes/server.py", "/js/../../run.py", "/missing.js"):
            with self.assertRaises(urllib.error.HTTPError) as cm:
                self.get(path)
            self.assertEqual(cm.exception.code, 404, path)

    def test_api_round_trip(self):
        status, ctype, body = self.get("/api/state")
        self.assertEqual(status, 200)
        self.assertIn("mode", json.loads(body))
        status, v = self.post(json.dumps({"action": "new_game"}).encode())
        self.assertEqual((status, v["mode"]), (200, "create"))

    def test_bad_requests(self):
        self.assertEqual(self.post(b"not json")[0], 400)
        status, v = self.post(b"x" * (MAX_BODY + 1))
        self.assertEqual(status, 413)
        status, v = self.post(json.dumps({"action": "bogus"}).encode())
        self.assertEqual(status, 200)
        self.assertIn("error", v)


if __name__ == "__main__":
    unittest.main()
