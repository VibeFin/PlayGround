import random
import unittest

import helpers  # noqa: F401
from ashes.engine.character import Character
from ashes.engine.combat import Combat, CombatError, unit_from_character, unit_from_enemy


def make_fight(cls="fighter", enemies=(("cave_crawler", "front"),), seed=1, **kw):
    ch = Character.create("Tester", "human", cls)
    p = unit_from_character(ch)
    foes = [unit_from_enemy(eid, row=row) for eid, row in enemies]
    c = Combat(p, foes, random.Random(seed), **kw)
    return c, p, foes


def to_player_turn(c: Combat):
    c.start()
    assert c.current() is c.player or c.state != "ongoing"


class RulesTests(unittest.TestCase):
    def test_barrier_is_capped_at_forty_percent(self):
        c, p, _ = make_fight()
        c.add_barrier(p, 10 ** 6)
        self.assertEqual(p.barrier, int(p.max_hp * 0.4))
        c.add_barrier(p, 50)
        self.assertEqual(p.barrier, int(p.max_hp * 0.4))

    def test_barrier_absorbs_before_health(self):
        c, p, _ = make_fight()
        p.barrier = 10
        hp = p.hp
        c.apply_damage(p, 15, None, "test", "physical")
        self.assertEqual(p.barrier, 0)
        self.assertEqual(p.hp, hp - 5)

    def test_melee_cannot_reach_back_row_while_front_stands(self):
        c, p, (front, back) = make_fight("fighter", (("cave_crawler", "front"), ("crawler_spitter", "back")))
        self.assertEqual(c.valid_targets(p, None), [front])
        c.start()
        if c.state == "ongoing" and c.current() is p:
            with self.assertRaises(CombatError):
                c._resolve_target(p, None, back.uid)
        front.hp = 0
        self.assertIn(back, c.valid_targets(p, None))

    def test_ranged_attacks_reach_back_row(self):
        ch = Character.create("Tester", "elf", "rogue")
        from ashes.engine import items as I
        bow = I.make_item("t1_shortbow")
        I.inv_add(ch.inventory, bow)
        ch.equip(bow["uid"])
        p = unit_from_character(ch)
        front, back = unit_from_enemy("cave_crawler", row="front"), unit_from_enemy("crawler_spitter", row="back")
        c = Combat(p, [front, back], random.Random(1))
        self.assertEqual(set(c.valid_targets(p, None)), {front, back})

    def test_misdirection_redirects_single_target_attacks(self):
        c, p, (a, b) = make_fight("rogue", (("cave_crawler", "front"), ("cave_crawler", "front")))
        p.base["misdirect"] = 100
        hp = p.hp
        a.base["accuracy"] = 999
        c.deal_damage(a, p, {"type": "damage", "source": "weapon"}, {"name": "Bite", "range": "melee"})
        self.assertEqual(p.hp, hp)
        self.assertLess(b.hp, b.max_hp)

    def test_stunned_units_lose_their_turn(self):
        c, p, (foe,) = make_fight()
        foe.base["cc_resist"] = 0
        c.add_status(foe, "stunned", 1, p)
        self.assertTrue(foe.has("stunned"))
        self.assertFalse(c.begin_turn(foe))

    def test_full_resistance_means_immunity(self):
        c, p, (foe,) = make_fight()
        foe.base["res_fire"] = 150
        hp = foe.hp
        c.deal_damage(p, foe, {"type": "damage", "source": "spell", "base": [50, 50], "element": "fire"},
                      {"name": "Firebolt", "range": "ranged"})
        self.assertEqual(foe.hp, hp)

    def test_immunity_blocks_elemental_statuses(self):
        c, p, (foe,) = make_fight()
        foe.base["res_frost"] = 150
        foe.base["res_fire"] = 150
        for sid in ("chilled", "frozen", "burn"):
            c.add_status(foe, sid, 2, p, potency=5)
            self.assertFalse(foe.has(sid), sid)
        c.add_status(foe, "shocked", 2, p)
        self.assertTrue(foe.has("shocked"))

    def test_difficulty_scales_damage_taken(self):
        dealt = {}
        for diff in ("story", "normal", "hard"):
            c, p, (foe,) = make_fight(difficulty=diff, seed=5)
            p.base["dodge"] = 0
            foe.base["accuracy"] = 999
            foe.base["crit"] = 0
            p.base["armor"] = 0
            hp = p.hp
            c.deal_damage(foe, p, {"type": "damage", "source": "spell", "base": [20, 20], "scale": 0},
                          {"name": "Zap", "range": "ranged"})
            dealt[diff] = hp - p.hp
        self.assertLess(dealt["story"], dealt["normal"])
        self.assertLess(dealt["normal"], dealt["hard"])

    def test_boss_fights_forbid_flee(self):
        c, p, _ = make_fight(flee_allowed=False)
        to_player_turn(c)
        with self.assertRaises(CombatError):
            c.player_act("flee")

    def test_not_your_turn_and_unknown_ability_are_errors(self):
        c, p, _ = make_fight()
        to_player_turn(c)
        with self.assertRaises(CombatError):
            c.player_act("ability", ability="fireball")

    def test_a_fight_can_be_won(self):
        c, p, foes = make_fight(enemies=(("cave_crawler", "front"), ("cave_crawler", "front")))
        to_player_turn(c)
        for _ in range(200):
            if c.state != "ongoing":
                break
            p.hp = p.max_hp
            c.player_act("attack")
        self.assertEqual(c.state, "victory")
        self.assertEqual(len(c.defeated), 2)

    def test_abilities_spend_resources_and_start_cooldowns(self):
        c, p, _ = make_fight("mage")
        to_player_turn(c)
        from ashes.engine.character import get_ability
        aid = next(a for a in p.abilities if get_ability(a).get("cost", {}).get("mp") and get_ability(a).get("cooldown"))
        mp = p.mp
        c.player_act("ability", ability=aid)
        if c.state == "ongoing":
            self.assertLess(p.mp, mp + p.stat("mp_regen") * 2)
            self.assertIn(aid, p.cooldowns)


if __name__ == "__main__":
    unittest.main()
