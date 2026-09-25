import unittest

from helpers import COMBOS
from ashes.engine.validate import validate
from ashes.engine.character import (Character, CreationError, creation_points, starting_attrs, xp_for_level,
                                    CREATION_MAX_ATTR, MAX_LEVEL)
from ashes.engine import items as I
from ashes.data.races import RACES
from ashes.data.classes import CLASSES
from ashes.data.skills import SKILL_TREES, TIER_LEVEL


class ContentTests(unittest.TestCase):
    def test_content_validates(self):
        self.assertEqual(validate(), [])

    def test_every_class_has_three_specializations(self):
        for cid, c in CLASSES.items():
            branches = {n["branch"] for n in SKILL_TREES[c["tree"]]["nodes"].values()}
            self.assertEqual(len(branches), 3, cid)

    def test_every_race_has_strengths_and_a_weakness(self):
        for rid, r in RACES.items():
            self.assertGreaterEqual(len(r["traits"]), 2, rid)
            self.assertTrue(r["weakness"]["mods"], rid)


class CreationTests(unittest.TestCase):
    def test_all_nine_combinations_are_valid(self):
        for race, cls in COMBOS:
            ch = Character.create("Hero", race, cls)
            s = ch.stats
            self.assertGreater(s["max_hp"], 0, (race, cls))
            self.assertEqual(ch.hp, s["max_hp"])
            self.assertIsNotNone(ch.equipment["main_hand"], (race, cls))
            self.assertIn(RACES[race]["ability"], ch.ability_ids())

    def test_racial_attribute_mods_apply(self):
        for race, cls in COMBOS:
            base = dict(CLASSES[cls]["base_attrs"])
            attrs = starting_attrs(race, cls)
            for k, v in RACES[race]["attr_mods"].items():
                self.assertEqual(attrs[k], base[k] + v)

    def test_allocation_rules(self):
        pts = creation_points("human")
        ch = Character.create("A", "human", "fighter", {"str": 1})
        self.assertEqual(ch.attr_points, pts - 1, "unspent creation points carry over")
        with self.assertRaises(CreationError):
            Character.create("A", "human", "fighter", {"str": pts + 1})
        with self.assertRaises(CreationError):
            Character.create("A", "human", "fighter", {"str": -1})
        with self.assertRaises(CreationError):
            Character.create("A", "human", "fighter", {"luck": 1})
        with self.assertRaises(CreationError):
            Character.create("   ", "human", "fighter")
        with self.assertRaises(CreationError):
            Character.create("A", "orc", "fighter")
        base = starting_attrs("elf", "mage")["int"]
        if base + pts > CREATION_MAX_ATTR:
            with self.assertRaises(CreationError):
                Character.create("A", "elf", "mage", {"int": pts})

    def test_name_is_trimmed_and_capped(self):
        self.assertEqual(Character.create("  " + "x" * 40, "dwarf", "rogue").name, "x" * 24)

    def test_racial_traits_differ(self):
        elf = Character.create("A", "elf", "mage").stats
        dwarf = Character.create("A", "dwarf", "mage").stats
        self.assertGreater(dwarf["res_poison"], elf["res_poison"])
        self.assertGreater(elf["res_arcane"], dwarf["res_arcane"])


class ProgressionTests(unittest.TestCase):
    def test_leveling_grants_points_and_restores(self):
        ch = Character.create("A", "human", "fighter")
        ch.hp = 1
        sp0, ap0 = ch.skill_points, ch.attr_points
        gained, levels = ch.gain_xp(xp_for_level(2))
        self.assertEqual(levels, [2])
        self.assertEqual(ch.skill_points, sp0 + 1)
        self.assertEqual(ch.attr_points, ap0 + 2)
        self.assertEqual(ch.hp, ch.stats["max_hp"])

    def test_bonus_skill_point_at_level_four_and_level_cap(self):
        ch = Character.create("A", "dwarf", "fighter")
        sp0 = ch.skill_points
        ch.gain_xp(xp_for_level(4) + 1)
        self.assertEqual(ch.level, 4)
        self.assertEqual(ch.skill_points, sp0 + 4)
        ch.gain_xp(10 ** 7)
        self.assertEqual(ch.level, MAX_LEVEL)

    def test_spending_attributes_raises_derived_stats(self):
        ch = Character.create("A", "human", "fighter", {})
        hp0 = ch.stats["max_hp"]
        while ch.attr_points:
            ch.spend_attr("con")
        self.assertGreater(ch.stats["max_hp"], hp0)
        with self.assertRaises(ValueError):
            ch.spend_attr("con")

    def test_skill_gating_by_level_and_branch(self):
        ch = Character.create("A", "human", "mage")
        nodes = SKILL_TREES[CLASSES["mage"]["tree"]]["nodes"]
        deep = next(n for n, d in nodes.items() if TIER_LEVEL[d["tier"]] > 1)
        ok, why = ch.can_learn(deep)
        self.assertFalse(ok)
        self.assertIn("level", why.lower())
        other = SKILL_TREES[CLASSES["fighter"]["tree"]]["nodes"]
        ok, why = ch.can_learn(next(iter(other)))
        self.assertFalse(ok)
        first = next(n for n, d in nodes.items() if d["tier"] == 1)
        ch.learn(first)
        self.assertEqual(ch.skills[first], 1)

    def test_respec_refunds_everything(self):
        ch = Character.create("A", "human", "rogue")
        ch.gain_xp(xp_for_level(5))
        nodes = SKILL_TREES[CLASSES["rogue"]["tree"]]["nodes"]
        spent = 0
        for nid, d in nodes.items():
            while d["tier"] == 1 and ch.can_learn(nid)[0]:
                ch.learn(nid)
                spent += 1
        total = ch.skill_points + spent
        self.assertGreater(spent, 0)
        self.assertEqual(ch.respec(), spent)
        self.assertEqual(ch.skill_points, total)
        self.assertEqual(ch.skills, {})


class EquipmentTests(unittest.TestCase):
    def test_two_hander_clears_off_hand_and_rings_fill_both_slots(self):
        ch = Character.create("A", "human", "fighter")
        shield = ch.equipment["off_hand"]
        self.assertIsNotNone(shield)
        great = I.make_item("t1_greatsword")
        I.inv_add(ch.inventory, great)
        ch.equip(great["uid"])
        self.assertIs(ch.equipment["main_hand"], great)
        self.assertIsNone(ch.equipment["off_hand"])
        self.assertIn(shield, ch.inventory)

        r1, r2 = I.make_item("t1_ring"), I.make_item("t1_ring")
        for r in (r1, r2):
            I.inv_add(ch.inventory, r)
            ch.equip(r["uid"])
        self.assertIs(ch.equipment["ring1"], r1)
        self.assertIs(ch.equipment["ring2"], r2)

    def test_wrong_slot_and_non_equipment_are_rejected(self):
        ch = Character.create("A", "human", "fighter")
        helm = I.make_item("t1_heavy_head")
        I.inv_add(ch.inventory, helm)
        with self.assertRaises(ValueError):
            ch.equip(helm["uid"], "chest")
        pot = next(it for it in ch.inventory if it["kind"] == "consumable")
        with self.assertRaises(ValueError):
            ch.equip(pot["uid"])

    def test_rogue_dual_wields_daggers(self):
        ch = Character.create("A", "elf", "rogue")
        d = I.make_item("t1_dagger")
        I.inv_add(ch.inventory, d)
        if ch.equipment["off_hand"] is None:
            ch.equip(d["uid"])
            self.assertIs(ch.equipment["off_hand"], d)

    def test_gear_changes_stats(self):
        ch = Character.create("A", "human", "fighter")
        armor0 = ch.stats["armor"]
        helm = I.make_item("t3_heavy_head")
        I.inv_add(ch.inventory, helm)
        ch.equip(helm["uid"])
        self.assertGreater(ch.stats["armor"], armor0)

    def test_serialization_round_trip(self):
        ch = Character.create("A", "dwarf", "mage")
        ch.gain_xp(xp_for_level(3))
        back = Character.from_dict(ch.to_dict())
        self.assertEqual(back.to_dict(), ch.to_dict())
        self.assertEqual(back.stats, ch.stats)


if __name__ == "__main__":
    unittest.main()
