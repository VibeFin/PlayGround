"""The 3D client's milestone flow, driven through the same HTTP session boundary and the same actions
the browser's interaction layer sends (talk / choose / move / interact / combat / set_position / save).

Launch -> Dwarf Fighter -> Forgehall (tutorial fight, XP, achievement) -> Durga -> The Ninth Deep advances ->
market -> galleries -> examine the breach -> a real random fight -> save with position -> fresh session
reload -> continue playing. The authored layout is checked along the way so every step the test takes
through the engine is also reachable in the 3D scene.
"""
import json
import os
import unittest

from helpers import tempdir
from ashes.server import Session

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, "web", "world", "kharum.json"), encoding="utf-8") as f:
    LAYOUT = json.load(f)["locations"]


class Client:
    """Mimics web/js/app.js: every call returns the full view, errors come back inside it."""

    def __init__(self, data_dir, seed=11):
        self.s = Session(data_dir, seed=seed)
        self.v = self.s.state()
        self.feed_seen = 0

    def act(self, action, **params):
        self.v = self.s.act({"action": action, **params})
        self.assert_ok()
        return self.v

    def assert_ok(self):
        if "error" in self.v:
            raise AssertionError(f"engine refused: {self.v['error']}")

    def obj_done(self, text):
        return next(o["done"] for o in self.v["tracked"]["objectives"] if o["text"].startswith(text))

    def walk_through(self, to):
        loc = self.v["location"]
        exit_ = next((e for e in loc["exits"] if e["to"] == to), None)
        assert exit_ is not None and not exit_.get("locked"), f"no open exit {loc['id']} -> {to}"
        assert to in LAYOUT[loc["id"]]["exits"], f"{loc['id']} has no 3D doorway to {to}"
        return self.act("move", to=to)

    def fight(self, test):
        """Attack until the fight ends, checking the presentation feed against the state as a client would."""
        for _ in range(120):
            cb = self.v["combat"]
            new = [e for e in cb["feed"] if e["seq"] > self.feed_seen]
            test.assertEqual([e["seq"] for e in new], sorted(e["seq"] for e in new))
            self.feed_seen = cb["feed_seq"]
            if cb["result"]:
                return cb["result"]
            test.assertTrue(cb["my_turn"])
            self.s.game.combat.player.hp = self.s.game.combat.player.max_hp
            self.act("combat", kind="attack", target=cb["attack_targets"][0])
        test.fail("fight did not end")


class MilestoneFlow(unittest.TestCase):
    def test_nineteen_step_milestone(self):
        data = tempdir()
        c = Client(data)
        self.assertEqual(c.v["mode"], "title")

        c.act("new_game")
        c.act("create", name="Thrain", race="dwarf", cls="fighter")
        loc = c.v["location"]
        self.assertEqual(loc["id"], "kd_forgehall")
        self.assertIn("kd_forgehall", LAYOUT)
        features = {f["id"] for f in loc["features"]}
        self.assertLessEqual({"furnace", "twelve_anvils"}, features)
        self.assertLessEqual(features, set(LAYOUT["kd_forgehall"]["features"]))

        # The hold is attacked on arrival: the tutorial fight plays through the event feed.
        self.assertEqual(c.v["mode"], "combat")
        xp0 = c.v["player"]["xp"]
        res = c.fight(self)
        self.assertEqual(res["state"], "victory")
        c.act("combat_done")
        self.assertGreater(c.v["player"]["xp"], xp0)
        unlocked = {a["id"] for a in c.v["achievements"]["list"] if a["unlocked"]}
        self.assertIn("first_steps", unlocked)
        while c.v["mode"] == "dialogue":
            c.act("leave")
        self.assertEqual(c.v["mode"], "explore")

        # Walk to Durga (position sync) and talk to her.
        durga = next(n for n in c.v["location"]["npcs"] if n["id"] == "foreman_durga")
        self.assertIn(durga["id"], LAYOUT["kd_forgehall"]["npcs"])
        x, z, _ = LAYOUT["kd_forgehall"]["npcs"]["foreman_durga"]
        c.act("set_position", x=x + 1.5, z=z, yaw=-1.57)
        c.act("talk", npc="foreman_durga")
        self.assertEqual(c.v["mode"], "dialogue")
        stage_before = c.s.game.quests.stage("mq_kd_intro")
        for _ in range(10):
            if c.v["mode"] != "dialogue":
                break
            c.act("choose", index=len(c.v["dialogue"]["options"]) - 1)
        self.assertEqual(c.v["mode"], "explore")
        self.assertNotEqual(c.s.game.quests.stage("mq_kd_intro"), stage_before)
        self.assertEqual(c.v["tracked"]["id"], "mq_kd_intro")
        self.assertFalse(c.obj_done("Investigate the Lower Galleries"))

        # Another area, through real doorways.
        c.walk_through("kd_market")
        self.assertEqual(c.v["location"]["prev_location"], "kd_forgehall")
        self.assertIsNone(c.v["location"]["scene_pos"])
        c.walk_through("kd_galleries")
        c.act("interact", feature="breach")
        self.assertTrue(c.obj_done("Investigate the Lower Galleries"))

        # A real fight: the galleries' random encounters, rolled by walking in and out.
        for _ in range(40):
            if c.v["mode"] == "combat":
                break
            c.walk_through("kd_market" if c.v["location"]["id"] == "kd_galleries" else "kd_galleries")
        self.assertEqual(c.v["mode"], "combat")
        xp1 = c.v["player"]["xp"]
        self.assertEqual(c.fight(self)["state"], "victory")
        c.act("combat_done")
        self.assertGreater(c.v["player"]["xp"], xp1)

        # Save exactly where the avatar stands (the client sends set_position right before save).
        c.act("set_position", x=-5.6, z=-3.5, yaw=1.5708)
        c.act("save", slot="slot1")
        snapshot = (c.v["location"]["id"], c.v["player"]["xp"], c.v["player"]["gold"],
                    [o["done"] for o in c.v["tracked"]["objectives"]])

        # Reload in a fresh process and carry on.
        c2 = Client(data, seed=99)
        c2.act("load", slot="slot1")
        self.assertEqual((c2.v["location"]["id"], c2.v["player"]["xp"], c2.v["player"]["gold"],
                          [o["done"] for o in c2.v["tracked"]["objectives"]]), snapshot)
        pos = c2.v["location"]["scene_pos"]
        self.assertEqual((pos["x"], pos["z"], pos["yaw"]), (-5.6, -3.5, 1.5708))
        if c2.v["location"]["id"] != "kd_market":
            c2.walk_through("kd_market")
        if c2.v["mode"] == "combat":
            c2.fight(self)
            c2.act("combat_done")
        c2.act("talk", npc="guildmaster_borrin")
        for _ in range(10):
            if c2.v["mode"] != "dialogue":
                break
            c2.act("choose", index=0)
        self.assertTrue(c2.obj_done("Question Guildmaster Borrin"))


class DevPeacefulAndAbandon(unittest.TestCase):
    def test_dev_tour_helpers(self):
        s = Session(tempdir(), seed=5, dev=True)
        s.act({"action": "new_game"})
        s.act({"action": "create", "name": "Dev", "race": "dwarf", "cls": "fighter"})
        self.assertEqual(s.game.mode, "combat")
        v = s.act({"action": "debug_end_combat"})
        self.assertNotIn("error", v)
        self.assertEqual(v["mode"], "explore")
        self.assertIn("error", s.act({"action": "debug_end_combat"}))
        # enc_kd_shaft is the shaft's arrival fight; a peaceful teleport skips it without clearing it.
        v = s.act({"action": "debug_teleport", "to": "kd_nd_shaft", "peaceful": 1})
        self.assertEqual((v["mode"], v["location"]["id"]), ("explore", "kd_nd_shaft"))
        self.assertNotIn("enc_kd_shaft", s.game.cleared)
        s.act({"action": "debug_teleport", "to": "kd_galleries", "peaceful": 1})
        v = s.act({"action": "debug_teleport", "to": "kd_nd_shaft"})
        self.assertEqual(v["mode"], "combat")


if __name__ == "__main__":
    unittest.main()
