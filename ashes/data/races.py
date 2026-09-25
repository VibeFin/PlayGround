"""Playable races. Each race has attribute modifiers, passive traits (stat mods),
a once-per-combat racial ability, a weakness, and a homeland start node."""

RACES = {
    "human": {
        "name": "Human",
        "home": "valewatch",
        "home_name": "Valewatch",
        "start_node": "vw_rivergate",
        "blurb": "Restless, ambitious and everywhere. Humans built Valewatch on a river of living Aether "
                 "and have been arguing about who owns it ever since.",
        "attr_mods": {"str": 1, "con": 1, "cha": 1},
        "bonus_creation_points": 2,
        "bonus_skill_points": 1,
        "traits": [
            {"name": "Versatile", "desc": "+2 extra attribute points at creation and +1 skill point at level 1.",
             "mods": {}},
            {"name": "Ambitious", "desc": "+10% experience from all sources.", "mods": {"xp_pct": 10}},
            {"name": "Silver Tongue", "desc": "Merchants give 10% better prices; +1 to persuasion checks.",
             "mods": {"price_pct": -10, "persuade": 1}},
        ],
        "weakness": {"name": "Aether-Dull",
                     "desc": "Humans lack innate resistances; -10 arcane resistance and -1 mana regeneration.",
                     "mods": {"res_arcane": -10, "mp_regen": -1}},
        "ability": "rally",
    },
    "elf": {
        "name": "Elf",
        "home": "sylvara",
        "home_name": "Sylvara",
        "start_node": "sy_terrace",
        "blurb": "Long-lived keepers of the ley-lines. Sylvara grows skyward through trees older than "
                 "most kingdoms, and the elves remember when the roots first drank the Aether.",
        "attr_mods": {"dex": 2, "int": 1, "wis": 1, "con": -2},
        "bonus_creation_points": 0,
        "bonus_skill_points": 0,
        "traits": [
            {"name": "Ley-Sight", "desc": "+8% spell power and +3 perception; you notice hidden Aether traces.",
             "mods": {"spell_power_pct": 8, "perception": 3}},
            {"name": "Fey Grace", "desc": "+5% dodge and +2 initiative.", "mods": {"dodge": 5, "initiative": 2}},
            {"name": "Old Blood", "desc": "+20 arcane and +10 frost resistance.",
             "mods": {"res_arcane": 20, "res_frost": 10}},
        ],
        "weakness": {"name": "Slender Frame", "desc": "-5% maximum health and -10 poison resistance.",
                     "mods": {"max_hp_pct": -5, "res_poison": -10}},
        "ability": "aether_step",
    },
    "dwarf": {
        "name": "Dwarf",
        "home": "kharum",
        "home_name": "Kharum-Dur",
        "start_node": "kd_forgehall",
        "blurb": "Stubborn, patient and very hard to kill. Kharum-Dur is a city carved through a mountain "
                 "range, and the dwarves have dug deeper than anyone. Lately, something has started digging back.",
        "attr_mods": {"con": 2, "str": 1, "wis": 1, "dex": -1, "cha": -1},
        "bonus_creation_points": 0,
        "bonus_skill_points": 0,
        "traits": [
            {"name": "Stoneblood", "desc": "+30 poison and +15 fire resistance.",
             "mods": {"res_poison": 30, "res_fire": 15}},
            {"name": "Deep Endurance", "desc": "+15% maximum stamina; potions heal 25% more.",
             "mods": {"max_sp_pct": 15, "potion_pct": 25}},
            {"name": "Stubborn", "desc": "25% chance to shrug off stuns, freezes and confusion.",
             "mods": {"cc_resist": 25}},
        ],
        "weakness": {"name": "Heavy-Footed & Earthbound",
                     "desc": "-3 initiative, -3% dodge and -10% maximum mana.",
                     "mods": {"initiative": -3, "dodge": -3, "max_mp_pct": -10}},
        "ability": "stoneskin",
    },
}

# Racial abilities (once per combat). Defined here so the race file is self-contained;
# the ability registry merges them.
RACIAL_ABILITIES = {
    "rally": {
        "name": "Rally", "desc": "Once per combat: heal 20% of max health and remove one harmful effect.",
        "cost": {}, "cooldown": 0, "once_per_combat": True, "target": "self",
        "effects": [{"type": "heal", "pct_max": 20}, {"type": "cleanse", "count": 1}],
        "tags": ["racial"],
    },
    "aether_step": {
        "name": "Aether Step", "desc": "Once per combat: step through the ley. Gain Evasive for 2 turns and restore 12 mana.",
        "cost": {}, "cooldown": 0, "once_per_combat": True, "target": "self",
        "effects": [{"type": "status", "status": "evasive", "duration": 2, "to": "self"},
                    {"type": "restore", "mp": 12}],
        "tags": ["racial"],
    },
    "stoneskin": {
        "name": "Stoneskin", "desc": "Once per combat: your skin turns to granite. Take 40% less damage for 3 turns.",
        "cost": {}, "cooldown": 0, "once_per_combat": True, "target": "self",
        "effects": [{"type": "status", "status": "stoneskin", "duration": 3, "to": "self"}],
        "tags": ["racial"],
    },
}
