"""End-to-end: an autonomous bot finishes Act I with every race/class combination.

Set ASHES_QUICK=1 to run a single combo (useful while iterating).
"""
import os
import unittest

from helpers import COMBOS
from bot import Bot
from ashes.engine.view import build_view

MILESTONES = ["world_open", "keystone_valewatch", "keystone_sylvara", "keystone_kharum", "convergence_done",
              "vault_opened", "vault_truth", "act_two"]


class PlaythroughTests(unittest.TestCase):
    def run_combo(self, race, cls, seed):
        bot = Bot(race, cls, seed=seed)
        seen = {}
        orig = bot.tick

        def tick():
            orig()
            for m in MILESTONES:
                if m not in seen and (m in bot.g.flags or bot.g.item_count(m)):
                    seen[m] = bot.g.player.level
        bot.tick = tick
        bot.run(max_steps=40000)
        g = bot.g
        self.assertEqual(g.mode, "ending")
        self.assertEqual(g.act, 2)
        linear = [m for m in seen if not m.startswith("keystone_")]  # keystones may be done in any order
        self.assertEqual(linear, [m for m in MILESTONES if m in linear])
        self.assertTrue(set(MILESTONES) <= set(seen), set(MILESTONES) - set(seen))
        self.assertLessEqual(seen["world_open"], 7, "the world should open in the early levels")
        self.assertTrue(10 <= seen["vault_opened"] <= 14, seen)
        self.assertIn("ACT II", build_view(g, None)["ending"]["banner"])
        g.dispatch({"action": "continue"})
        self.assertEqual(g.mode, "explore", "the world stays playable after the finale")
        self.assertGreater(len(g.achievements), 20)
        return seen

    def test_all_combinations_complete_act_one(self):
        combos = COMBOS[:1] if os.environ.get("ASHES_QUICK") else COMBOS
        for i, (race, cls) in enumerate(combos):
            with self.subTest(race=race, cls=cls):
                self.run_combo(race, cls, seed=3 + i % 3)


if __name__ == "__main__":
    unittest.main()
