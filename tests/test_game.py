import json
import os
import random
import unittest

from helpers import started_game, new_game, win_combat, tempdir, COMBOS
from ashes.engine.game import Game, GameError
from ashes.engine.view import build_view
from ashes.engine.save import SaveManager
from ashes.data.world import LOCATIONS, ENCOUNTERS
from ashes.data.races import RACES


def d(g, **a):
    g.dispatch(a)
    return g


class FlowTests(unittest.TestCase):
    def test_every_combo_starts_in_its_homeland_with_a_tutorial(self):
        for race, cls in COMBOS:
            g = new_game(race, cls)
            self.assertEqual(LOCATIONS[g.location]["region"], RACES[race]["home"] if "home" in RACES[race]
                             else LOCATIONS[RACES[race]["start_node"]]["region"])
            self.assertEqual(g.mode, "combat", (race, cls))
            self.assertTrue(g.quests.active(), (race, cls))
            win_combat(g)
            self.assertIn("first_steps", g.achievements)

    def test_invalid_moves_are_player_errors(self):
        g = started_game("dwarf")
        with self.assertRaises(GameError):
            d(g, action="move", to="av_heart")
        exit_to = LOCATIONS[g.location]["exits"][0]["to"]
        d(g, action="move", to=exit_to)
        self.assertEqual(g.location, exit_to)

    def test_unknown_action(self):
        g = started_game()
        with self.assertRaises(GameError):
            d(g, action="teleport")

    def test_search_once_per_level(self):
        g = started_game("elf")
        d(g, action="search")
        with self.assertRaises(GameError):
            d(g, action="search")
        g.award_xp(10 ** 4)
        d(g, action="search")

    def test_inn_rest_costs_gold_or_sends_you_to_the_stables(self):
        g = started_game("dwarf")
        g.location = "kd_brewery"
        g.player.gold, g.player.hp = 500, 1
        day = g.day
        d(g, action="rest")
        self.assertEqual(g.player.hp, g.player.stats["max_hp"])
        self.assertEqual(g.player.gold, 500 - g.inn_cost())
        self.assertEqual(g.day, day + 1)
        g.player.gold = 0
        d(g, action="rest")
        self.assertEqual(g.counters["stable_nights"], 1)
        with self.assertRaises(GameError):
            g.location = "kd_forgehall"
            d(g, action="rest")

    def test_shop_buy_and_sell(self):
        g = started_game("dwarf")
        g.location = "kd_market"
        shop = LOCATIONS["kd_market"]["shop"]
        d(g, action="shop", shop=shop)
        self.assertEqual(g.mode, "shop")
        g.player.gold = 10 ** 5
        stock = g.shop_stock[shop]
        price = g.buy_price(stock[0])
        n = len(g.player.inventory)
        d(g, action="buy", index=0)
        self.assertEqual(g.player.gold, 10 ** 5 - price)
        self.assertGreaterEqual(len(g.player.inventory), n)
        with self.assertRaises(GameError):
            d(g, action="buy", index=9999)
        item = next(it for it in g.player.inventory if it["kind"] != "key")
        gold = g.player.gold
        d(g, action="sell", uid=item["uid"])
        self.assertGreater(g.player.gold, gold)
        g.player.gold = 0
        with self.assertRaises(GameError):
            d(g, action="buy", index=0)
        d(g, action="leave")
        self.assertEqual(g.mode, "explore")

    def test_defeat_and_respawn(self):
        g = started_game("human", "mage")
        g.player.gold = 100
        g.start_combat("enc_kd_tutorial")
        cb = g.combat
        for u in cb.living("enemy"):
            u.base["weapon_dmg"] = [9999, 9999]
            u.base["accuracy"] = 999
        cb.player.hp = 1
        cb.player.barrier = 0
        for _ in range(20):
            if g.mode != "combat":
                break
            d(g, action="combat", kind="defend")
        self.assertEqual(g.mode, "defeat")
        d(g, action="respawn")
        self.assertEqual(g.mode, "explore")
        self.assertEqual(g.player.gold, 90)
        self.assertEqual(g.player.hp, g.player.stats["max_hp"])
        self.assertEqual(g.location, g.last_rest_node)

    def test_travel_requires_open_world(self):
        g = started_game("human")
        node = next(k for k, v in LOCATIONS.items() if v.get("travel") and v.get("region") == g.current_region())
        g.location = node
        self.assertEqual(g.travel_options(), [])
        g.flags.add("world_open")
        opts = g.travel_options()
        self.assertTrue(opts)
        day = g.day
        d(g, action="travel", dest=opts[0]["id"])
        self.assertGreater(g.day, day)
        with self.assertRaises(GameError):
            d(g, action="travel", dest="nowhere")

    def test_ending_leads_to_act_two_and_world_stays_open(self):
        g = started_game("elf", "rogue")
        g.start_ending("seal")
        self.assertEqual(g.mode, "ending")
        self.assertIn("act_two", g.flags)
        self.assertEqual(g.act, 2)
        self.assertIn("ACT II", build_view(g, None)["ending"]["banner"])
        d(g, action="continue")
        self.assertEqual(g.mode, "explore")

    def test_story_aftermath_dialogues_cannot_be_skipped(self):
        from bot import Bot
        b = Bot("dwarf", "mage", seed=3)
        b.run(goal=lambda g: g.mode == "combat" and "ilvane_defeated" in g.flags)
        g = b.g
        loot = [it["name"] for it in build_view(g, None)["combat"]["result"]["items"]]
        self.assertIn("Morrow's Unbinding", loot, "encounter rewards belong on the victory card")
        d(g, action="combat_done")
        self.assertEqual((g.mode, g.dialogue.npc_id), ("dialogue", "ilvane_fallen"))
        self.assertTrue(build_view(g, None)["dialogue"]["required"])
        with self.assertRaises(GameError):
            d(g, action="leave")
        self.assertEqual(g.mode, "dialogue")
        for _ in range(10):
            if g.mode != "dialogue":
                break
            d(g, action="choose", index=build_view(g, None)["dialogue"]["options"][0]["index"])
        self.assertEqual(g.mode, "ending")

    def test_ordinary_conversations_can_be_left(self):
        g = started_game("dwarf")
        npc = LOCATIONS[g.location]["npcs"][0]["id"]
        d(g, action="talk", npc=npc)
        self.assertFalse(build_view(g, None)["dialogue"]["required"])
        d(g, action="leave")
        self.assertEqual(g.mode, "explore")

    def test_combat_victory_awards_xp_and_loot_screen(self):
        g = new_game("human", "fighter")
        xp = g.player.xp
        cb = g.combat
        while cb.state == "ongoing":
            cb.player.hp = cb.player.max_hp
            d(g, action="combat", kind="attack")
        self.assertEqual(g.combat_result["state"], "victory")
        self.assertGreater(g.player.xp, xp)
        with self.assertRaises(GameError):
            d(g, action="combat", kind="attack")
        d(g, action="combat_done")


class SaveTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempdir()

    def test_round_trip(self):
        g = started_game("dwarf", "rogue", save_dir=self.dir)
        g.player.gold = 777
        g.flags.add("custom_flag")
        d(g, action="save", slot="slot1")
        before = g.to_dict()
        g.player.gold = 1
        d(g, action="load", slot="slot1")
        after = g.to_dict()
        before.pop("messages"), after.pop("messages")
        self.assertEqual(before, after)
        self.assertEqual(g.player.gold, 777)
        meta = SaveManager(self.dir).list()[0]
        self.assertEqual((meta["slot"], meta["race"], meta["cls"]), ("slot1", "Dwarf", "Rogue"))

    def test_save_survives_a_fresh_process(self):
        g = started_game("elf", "mage", save_dir=self.dir)
        g.player.gain_xp(3000)
        d(g, action="save", slot="slot2")
        g2 = Game(seed=9, save_manager=SaveManager(self.dir))
        d(g2, action="load", slot="slot2")
        self.assertEqual(g2.player.level, g.player.level)
        self.assertEqual(g2.location, g.location)
        self.assertEqual(g2.mode, "explore")

    def test_corrupt_save_falls_back_to_backup(self):
        g = started_game(save_dir=self.dir)
        d(g, action="save", slot="slot1")
        g.player.gold = 4242
        d(g, action="save", slot="slot1")
        with open(os.path.join(self.dir, "slot1.json"), "w") as f:
            f.write("{ not json")
        d(g, action="load", slot="slot1")
        self.assertNotEqual(g.player.gold, 4242)
        self.assertTrue(any(s.get("corrupt") for s in SaveManager(self.dir).list()))

    def test_bad_slots_and_bad_files_are_player_errors(self):
        g = started_game(save_dir=self.dir)
        for bad in ("../escape", "", "a" * 40, "slot 1"):
            with self.assertRaises(GameError):
                d(g, action="save", slot=bad)
        with self.assertRaises(GameError):
            d(g, action="load", slot="slot5")
        with open(os.path.join(self.dir, "slot3.json"), "w") as f:
            f.write("{ broken")
        with self.assertRaises(GameError):
            d(g, action="load", slot="slot3")
        with open(os.path.join(self.dir, "slot4.json"), "w") as f:
            json.dump({"version": 999, "player": {}, "location": "x"}, f)
        with self.assertRaises(GameError):
            d(g, action="load", slot="slot4")
        self.assertEqual(g.mode, "explore")

    def test_unknown_content_ids_are_dropped_on_load(self):
        g = started_game(save_dir=self.dir)
        data = g.to_dict()
        data["location"] = "removed_place"
        data["lore"].append("removed_lore")
        data["player"]["skills"]["removed_skill"] = 1
        g.load_dict(data)
        self.assertEqual(g.location, RACES["human"]["start_node"])
        self.assertNotIn("removed_lore", g.lore)

    def test_no_saving_in_combat(self):
        g = new_game(save_dir=self.dir)
        with self.assertRaises(GameError):
            d(g, action="save", slot="slot1")

    def test_autosave_on_rest(self):
        g = started_game("dwarf", save_dir=self.dir, autosave=True)
        g.location = "kd_brewery"
        g.player.gold = 100
        d(g, action="rest")
        self.assertTrue(os.path.exists(os.path.join(self.dir, "auto.json")))


class RobustnessTests(unittest.TestCase):
    ACTIONS = ["move", "talk", "choose", "leave", "interact", "search", "rest", "travel", "combat", "combat_done",
               "respawn", "equip", "unequip", "use_item", "drop", "learn", "spend_attr", "respec", "track", "shop",
               "buy", "sell", "continue", "settings", "save", "load", "title", "new_game", "create", "bogus",
               "set_position", "debug_teleport", "debug_level"]

    def random_action(self, g, rng):
        kind = rng.choice(self.ACTIONS)
        junk = rng.choice([None, "", "zzz", -1, 10 ** 9, [], {}, 3.5])
        a = {"action": kind}
        node = LOCATIONS.get(g.location or "", {})
        inv = g.player.inventory if g.player else []
        uid = rng.choice(inv)["uid"] if inv and rng.random() < 0.7 else junk
        pick = {
            "move": lambda: {"to": rng.choice([e["to"] for e in node.get("exits", [])] or [junk])},
            "talk": lambda: {"npc": rng.choice([n["id"] for n in node.get("npcs", [])] or [junk])},
            "choose": lambda: {"index": rng.choice([0, 1, 2, junk])},
            "interact": lambda: {"feature": rng.choice([f["id"] for f in node.get("features", [])] or [junk]),
                                 "index": rng.choice([0, 1, junk])},
            "travel": lambda: {"dest": junk},
            "combat": lambda: {"kind": rng.choice(["attack", "defend", "ability", "item", "flee", junk]),
                               "ability": rng.choice((g.combat.player.abilities if g.combat else []) + [junk]),
                               "target": rng.choice([u.uid for u in g.combat.units] + [junk]) if g.combat else junk,
                               "item": uid},
            "equip": lambda: {"uid": uid, "slot": rng.choice([None, "ring2", "off_hand", junk])},
            "unequip": lambda: {"slot": rng.choice(["main_hand", "head", junk])},
            "use_item": lambda: {"uid": uid}, "drop": lambda: {"uid": uid}, "sell": lambda: {"uid": uid},
            "learn": lambda: {"node": junk}, "spend_attr": lambda: {"attr": rng.choice(["str", junk])},
            "track": lambda: {"quest": junk}, "shop": lambda: {"shop": node.get("shop") or junk},
            "buy": lambda: {"index": rng.choice([0, junk])}, "settings": lambda: {"difficulty": junk},
            "save": lambda: {"slot": rng.choice(["slot1", junk])}, "load": lambda: {"slot": rng.choice(["slot1", junk])},
            "create": lambda: {"name": junk, "race": rng.choice(["elf", junk]), "cls": "mage"},
            "set_position": lambda: {"x": rng.choice([1.5, -3, junk]), "z": rng.choice([0, junk]),
                                     "yaw": rng.choice([0.5, junk])},
            "debug_teleport": lambda: {"to": "kd_market"}, "debug_level": lambda: {"level": 12},
        }.get(kind)
        if pick:
            a.update(pick())
        if rng.random() < 0.05:
            a["unexpected"] = junk
        return a

    def test_random_actions_never_crash_the_engine(self):
        save_dir = tempdir()
        for seed in range(6):
            rng = random.Random(seed)
            race, cls = COMBOS[seed % len(COMBOS)]
            g = started_game(race, cls, seed=seed, save_dir=save_dir)
            for step in range(700):
                a = self.random_action(g, rng)
                try:
                    g.dispatch(a)
                except GameError:
                    pass
                except Exception as e:  # pragma: no cover - failure path
                    self.fail(f"seed {seed} step {step}: {a} raised {type(e).__name__}: {e}")
                json.dumps(build_view(g, g.saves))
                if g.mode == "title" and rng.random() < 0.5:
                    g = started_game(race, cls, seed=seed + step, save_dir=save_dir)

    def test_random_actions_mid_campaign(self):
        from bot import Bot
        save_dir = tempdir()
        for i, (race, cls) in enumerate(COMBOS):
            bot = Bot(race, cls, seed=i)
            bot.run(max_steps=10 ** 6, goal=lambda g, n=300 + 250 * i: bot.steps >= n)
            g = bot.g
            g.saves = SaveManager(save_dir)
            rng = random.Random(i)
            for step in range(400):
                a = self.random_action(g, rng) if rng.random() < 0.6 else None
                try:
                    if a is None:
                        bot.tick()
                    else:
                        g.dispatch(a)
                except GameError:
                    pass
                except Exception as e:  # pragma: no cover - failure path
                    self.fail(f"{race} {cls} step {step}: {a} raised {type(e).__name__}: {e}")
                json.dumps(build_view(g, g.saves))
                if g.mode in ("title", "create"):
                    break


if __name__ == "__main__":
    unittest.main()
