"""3D-client state held by the engine: avatar position, save v2 migration, and developer-only actions."""
import json
import os
import unittest

from helpers import new_game, started_game, tempdir
from ashes.engine.game import Game, GameError, POS_LIMIT
from ashes.engine.save import SaveManager, CURRENT_VERSION
from ashes.engine.view import build_view


def d(g, **a):
    g.dispatch(a)


class PositionTests(unittest.TestCase):
    def test_set_position_is_stored_and_clamped(self):
        g = started_game("dwarf", "fighter")
        d(g, action="set_position", x=3.5, z=-2, yaw=7.0)
        pos = build_view(g, None)["location"]["scene_pos"]
        self.assertEqual((pos["loc"], pos["x"], pos["z"]), (g.location, 3.5, -2.0))
        self.assertLess(abs(pos["yaw"]), 3.15)
        d(g, action="set_position", x=10 ** 9, z=-10 ** 9)
        self.assertEqual((g.scene_pos["x"], g.scene_pos["z"]), (POS_LIMIT, -POS_LIMIT))

    def test_bad_positions_are_player_errors(self):
        g = started_game("dwarf", "fighter")
        for bad in ("north", None, True, [], float("nan"), float("inf")):
            with self.subTest(bad=bad), self.assertRaises(GameError):
                d(g, action="set_position", x=bad, z=0)
        with self.assertRaises(GameError):
            d(g, action="set_position", x=0)

    def test_position_needs_a_scene(self):
        g = Game(seed=1)
        with self.assertRaises(GameError):
            d(g, action="set_position", x=0, z=0)

    def test_position_resets_when_changing_room(self):
        g = started_game("dwarf", "fighter")
        d(g, action="set_position", x=1, z=1)
        d(g, action="move", to="kd_market")
        self.assertIsNone(g.scene_pos)
        loc = build_view(g, None)["location"]
        self.assertEqual(loc["prev_location"], "kd_forgehall")

    def test_position_does_not_touch_progression(self):
        g = started_game("dwarf", "fighter")
        before = (dict(g.counters), set(g.flags), g.player.xp, g.day)
        for i in range(20):
            d(g, action="set_position", x=i, z=-i, yaw=0.1 * i)
        self.assertEqual(before, (dict(g.counters), set(g.flags), g.player.xp, g.day))


class SaveV2Tests(unittest.TestCase):
    def setUp(self):
        self.dir = tempdir()

    def test_position_survives_save_and_fresh_process(self):
        g = started_game("dwarf", "fighter", save_dir=self.dir)
        d(g, action="set_position", x=-4.25, z=6.5, yaw=1.2)
        d(g, action="save", slot="slot1")
        g2 = Game(seed=9, save_manager=SaveManager(self.dir))
        d(g2, action="load", slot="slot1")
        self.assertEqual(g2.scene_pos, {"loc": g.location, "x": -4.25, "z": 6.5, "yaw": 1.2})
        with open(os.path.join(self.dir, "slot1.json")) as f:
            self.assertEqual(json.load(f)["version"], CURRENT_VERSION)

    def test_v1_save_migrates_without_losing_progress(self):
        g = started_game("dwarf", "fighter", save_dir=self.dir)
        d(g, action="interact", feature="twelve_anvils")
        data = g.to_dict()
        data["version"] = 1
        data.pop("scene_pos")
        with open(os.path.join(self.dir, "old.json"), "w") as f:
            json.dump(data, f)
        g2 = Game(seed=2, save_manager=SaveManager(self.dir))
        d(g2, action="load", slot="old")
        self.assertIsNone(g2.scene_pos)
        self.assertEqual((g2.player.level, g2.player.xp, g2.location), (g.player.level, g.player.xp, g.location))
        self.assertIn("saw_thirteenth_plinth", g2.flags)
        self.assertEqual(g2.quests.to_dict(), g.quests.to_dict())

    def test_stale_or_garbage_positions_are_ignored_on_load(self):
        g = started_game("dwarf", "fighter", save_dir=self.dir)
        for bad in ({"loc": "kd_market", "x": 1, "z": 1, "yaw": 0}, {"loc": g.location, "x": "a"},
                    {"loc": g.location, "x": 1e12, "z": 0, "yaw": 0}, "nope", 5):
            with self.subTest(bad=bad):
                data = g.to_dict()
                data["scene_pos"] = bad
                with open(os.path.join(self.dir, "odd.json"), "w") as f:
                    json.dump(data, f)
                g2 = Game(seed=2, save_manager=SaveManager(self.dir))
                d(g2, action="load", slot="odd")
                self.assertIsNone(g2.scene_pos)


class DevActionTests(unittest.TestCase):
    DEV = [("debug_teleport", {"to": "kd_runehall"}), ("debug_encounter", {"enc": "enc_kd_shaft"}),
           ("debug_level", {"level": 5}), ("debug_xp", {"amount": 100}), ("debug_flag", {"flag": "x"}),
           ("debug_quest", {"quest": "mq_kd_intro"}), ("debug_heal", {}), ("debug_reset_location", {}),
           ("debug_end_combat", {}), ("debug_teleport", {"to": "kd_market", "peaceful": 1})]

    def test_debug_actions_are_unknown_without_dev_mode(self):
        g = started_game("dwarf", "fighter")
        for name, params in self.DEV:
            with self.subTest(action=name), self.assertRaises(GameError) as cm:
                d(g, action=name, **params)
            self.assertIn("Unknown action", str(cm.exception))
        self.assertNotIn("debug", build_view(g, None))
        self.assertFalse(build_view(g, None)["dev"])

    def dev_game(self):
        g = Game(seed=3, settings={"autosave": False}, dev=True)
        d(g, action="new_game")
        d(g, action="create", name="Dev", race="dwarf", cls="fighter")
        from helpers import win_combat
        if g.mode == "combat":
            win_combat(g)
        while g.mode == "dialogue":
            d(g, action="leave")
        return g

    def test_dev_teleport_level_and_encounter(self):
        g = self.dev_game()
        d(g, action="debug_teleport", to="kd_runehall")
        self.assertEqual(g.location, "kd_runehall")
        d(g, action="debug_level", level=6)
        self.assertEqual(g.player.level, 6)
        d(g, action="debug_encounter", enc="enc_kd_shaft")
        self.assertEqual(g.mode, "combat")
        with self.assertRaises(GameError):
            d(g, action="debug_teleport", to="kd_market")
        self.assertIn("debug", build_view(g, None))

    def test_dev_reset_location_replays_one_shot_interactions(self):
        g = self.dev_game()
        d(g, action="interact", feature="twelve_anvils")
        with self.assertRaises(GameError):
            d(g, action="interact", feature="twelve_anvils")
        d(g, action="debug_reset_location")
        while g.mode == "combat":
            from helpers import win_combat
            win_combat(g)
        while g.mode == "dialogue":
            d(g, action="leave")
        d(g, action="interact", feature="twelve_anvils")

    def test_dev_quest_and_flags(self):
        g = self.dev_game()
        d(g, action="debug_quest", quest="mq_kd_intro", stage="investigate")
        self.assertEqual(g.quests.stage("mq_kd_intro"), "investigate")
        d(g, action="debug_flag", flag="dev_marker")
        self.assertIn("dev_marker", g.flags)
        d(g, action="debug_flag", flag="dev_marker", on=0)
        self.assertNotIn("dev_marker", g.flags)
        with self.assertRaises(GameError):
            d(g, action="debug_quest", quest="nope")


if __name__ == "__main__":
    unittest.main()
