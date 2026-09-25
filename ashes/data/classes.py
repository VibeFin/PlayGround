"""Playable classes: base attribute templates, resource growth, starting kit and
base abilities. Skill trees live in ashes/data/skills/."""

CLASSES = {
    "fighter": {
        "name": "Fighter",
        "blurb": "Masters of steel and endurance. Fighters hold the line, break it, or dance through it.",
        "base_attrs": {"str": 15, "dex": 11, "con": 14, "int": 8, "wis": 10, "cha": 10},
        "hp_base": 34, "hp_lvl": 9,
        "mp_base": 10, "mp_lvl": 1,
        "sp_base": 40, "sp_lvl": 4,
        "abilities": ["power_strike", "sunder"],
        "start_items": ["t1_longsword", "t1_shield", "t1_heavy_chest", "t1_heavy_legs",
                        "t1_medium_feet"],
        "start_consumables": [("potion_heal_minor", 3), ("tonic_stamina", 1)],
        "start_bag": ["t1_greataxe"],
        "tree": "fighter",
        "trait": {"name": "Field Medic", "desc": "Years of patching yourself up: potions heal 15% more.",
                  "mods": {"potion_pct": 15}},
    },
    "mage": {
        "name": "Mage",
        "blurb": "Scholars of the Aether who shape it into fire, force, and restoration.",
        "base_attrs": {"str": 8, "dex": 11, "con": 11, "int": 16, "wis": 13, "cha": 10},
        "hp_base": 26, "hp_lvl": 6,
        "mp_base": 32, "mp_lvl": 6,
        "sp_base": 18, "sp_lvl": 2,
        "abilities": ["firebolt", "arcane_ward"],
        "start_items": ["t1_staff", "t1_light_chest", "t1_light_head", "t1_light_feet"],
        "start_consumables": [("potion_heal_minor", 2), ("potion_mana_minor", 3)],
        "start_bag": ["t1_wand"],
        "tree": "mage",
        "trait": {"name": "Aether-Tuned", "desc": "You breathe the weave: +1 mana regeneration per turn.",
                  "mods": {"mp_regen": 1}},
    },
    "rogue": {
        "name": "Rogue",
        "blurb": "Knives in the dark, arrows from the trees, and a smile that is definitely lying.",
        "base_attrs": {"str": 10, "dex": 16, "con": 12, "int": 10, "wis": 10, "cha": 12},
        "hp_base": 30, "hp_lvl": 8,
        "mp_base": 14, "mp_lvl": 2,
        "sp_base": 36, "sp_lvl": 4,
        "abilities": ["twin_strike", "dirty_trick"],
        "start_items": ["t1_dagger", "t1_dagger", "t1_medium_chest", "t1_medium_hands", "t1_medium_feet"],
        "start_consumables": [("potion_heal_minor", 3), ("fire_flask", 1)],
        "start_bag": ["t1_shortbow"],
        "tree": "rogue",
        "trait": {"name": "Opportunist", "desc": "You always find the gap in the armor, and never stand where the "
                                                  "blow lands: +30% armor penetration, +10% damage dealt, +8% dodge.",
                  "mods": {"armor_pen": 30, "dmg_dealt_pct": 10, "dodge": 8}},
    },
}

BASE_ABILITIES = {
    "power_strike": {
        "name": "Power Strike", "desc": "A heavy blow dealing 160% weapon damage.",
        "cost": {"sp": 10}, "cooldown": 0, "target": "enemy", "range": "weapon",
        "effects": [{"type": "damage", "source": "weapon", "mult": 1.6}], "tags": ["attack", "physical"],
    },
    "sunder": {
        "name": "Sunder", "desc": "Strike at armor seams: 90% weapon damage and Armor Break for 3 turns.",
        "cost": {"sp": 12}, "cooldown": 3, "target": "enemy", "range": "weapon",
        "effects": [{"type": "damage", "source": "weapon", "mult": 0.9},
                    {"type": "status", "status": "armor_break", "duration": 3}],
        "tags": ["attack", "physical"],
    },
    "firebolt": {
        "name": "Firebolt", "desc": "Hurl fire (6-10 + 80% spell power). 30% chance to Burn.",
        "cost": {"mp": 6}, "cooldown": 0, "target": "enemy", "range": "ranged",
        "effects": [{"type": "damage", "source": "spell", "element": "fire", "base": [6, 10], "scale": 0.8},
                    {"type": "status", "status": "burn", "duration": 3, "chance": 0.3, "potency_scale": 0.25}],
        "tags": ["spell", "fire"],
    },
    "arcane_ward": {
        "name": "Arcane Ward", "desc": "Gain a Barrier absorbing 10 + 100% spell power damage.",
        "cost": {"mp": 8}, "cooldown": 3, "target": "self",
        "effects": [{"type": "barrier", "base": 10, "scale": 1.0}], "tags": ["spell", "arcane"],
    },
    "twin_strike": {
        "name": "Twin Strike", "desc": "Two quick strikes, each dealing 80% weapon damage.",
        "cost": {"sp": 10}, "cooldown": 0, "target": "enemy", "range": "weapon",
        "effects": [{"type": "damage", "source": "weapon", "mult": 0.8, "hits": 2}], "tags": ["attack", "physical"],
    },
    "dirty_trick": {
        "name": "Dirty Trick", "desc": "Sand in the eyes: 50% weapon damage and Blind for 2 turns.",
        "cost": {"sp": 12}, "cooldown": 3, "target": "enemy", "range": "melee",
        "effects": [{"type": "damage", "source": "weapon", "mult": 0.5},
                    {"type": "status", "status": "blinded", "duration": 2}],
        "tags": ["attack", "physical"],
    },
}
