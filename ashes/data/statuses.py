"""Status effect definitions.

Fields:
  kind        buff | debuff | special
  mods        stat modifiers applied while active (multiplied by stacks if stack_mods)
  dot         {"element": ...} damage each turn start = potency * stacks
  hot         heal each turn start = potency
  skip_turn   unit loses its turn
  break_on_damage   status removed when unit takes damage
  max_stacks  stacking limit (default 1: re-application refreshes)
  cc          crowd control (resisted by cc_resist)
"""

STATUSES = {
    # --- damage over time -------------------------------------------------
    "burn": {"name": "Burning", "kind": "debuff", "dot": {"element": "fire"},
             "desc": "Takes fire damage each turn."},
    "poison": {"name": "Poisoned", "kind": "debuff", "dot": {"element": "poison"}, "max_stacks": 6,
               "desc": "Takes poison damage each turn per stack."},
    "bleed": {"name": "Bleeding", "kind": "debuff", "dot": {"element": "physical", "ignore_armor": True},
              "max_stacks": 3, "desc": "Takes physical damage each turn per stack, ignoring armor."},
    "regen": {"name": "Regenerating", "kind": "buff", "hot": True, "desc": "Heals each turn."},

    # --- crowd control ----------------------------------------------------
    "stunned": {"name": "Stunned", "kind": "debuff", "skip_turn": True, "cc": True,
                "desc": "Loses the next turn. Interrupts charging."},
    "frozen": {"name": "Frozen", "kind": "debuff", "skip_turn": True, "cc": True, "element": "frost",
               "mods": {"dodge": -100}, "desc": "Encased in ice: loses turns and cannot dodge. Fire thaws it."},
    "sleep": {"name": "Asleep", "kind": "debuff", "skip_turn": True, "cc": True, "break_on_damage": True,
              "desc": "Loses turns until damaged."},
    "confused": {"name": "Confused", "kind": "debuff", "cc": True,
                 "desc": "50% chance to attack a random target, friend or foe."},
    "provoked": {"name": "Provoked", "kind": "debuff",
                 "desc": "Must use basic attacks against the provoker. Interrupts charging."},
    "silenced": {"name": "Silenced", "kind": "debuff", "desc": "Cannot cast spells."},

    # --- debuffs ----------------------------------------------------------
    "chilled": {"name": "Chilled", "kind": "debuff", "element": "frost", "mods": {"initiative": -6, "dodge": -10},
                "desc": "Slowed: -6 initiative, -10% dodge."},
    "shocked": {"name": "Shocked", "kind": "debuff", "element": "lightning",
                "mods": {"res_lightning": -25, "accuracy": -10},
                "desc": "-25 lightning resistance, -10 accuracy."},
    "weakened": {"name": "Weakened", "kind": "debuff", "mods": {"dmg_dealt_pct": -25},
                 "desc": "Deals 25% less damage."},
    "vulnerable": {"name": "Vulnerable", "kind": "debuff", "mods": {"dmg_taken_pct": 25},
                   "desc": "Takes 25% more damage."},
    "armor_break": {"name": "Armor Broken", "kind": "debuff", "mods": {"armor_pct": -50},
                    "desc": "Armor reduced by half."},
    "blinded": {"name": "Blinded", "kind": "debuff", "mods": {"accuracy": -45},
                "desc": "Attacks are far more likely to miss."},
    "marked": {"name": "Marked", "kind": "debuff", "mods": {"dmg_taken_pct": 20, "dodge": -15},
               "desc": "Hunted: takes 20% more damage and has -15% dodge."},
    "hexed": {"name": "Hexed", "kind": "debuff",
              "mods": {"res_all": -20, "dmg_dealt_pct": -15},
              "desc": "-20 all resistances, deals 15% less damage."},
    "death_mark": {"name": "Death Mark", "kind": "debuff", "mods": {"dmg_taken_pct": 30},
                   "desc": "Marked for death: takes 30% more damage."},

    # --- buffs ------------------------------------------------------------
    "guarded": {"name": "Guarded", "kind": "buff", "mods": {"dmg_taken_pct": -50},
                "desc": "Defending: takes 50% less damage."},
    "stoneskin": {"name": "Stoneskin", "kind": "buff", "mods": {"dmg_taken_pct": -40},
                  "desc": "Takes 40% less damage."},
    "fortified": {"name": "Fortified", "kind": "buff", "mods": {"armor_pct": 60, "cc_resist": 50},
                  "desc": "+60% armor, resists crowd control."},
    "empowered": {"name": "Empowered", "kind": "buff", "mods": {"dmg_dealt_pct": 25},
                  "desc": "Deals 25% more damage."},
    "hasted": {"name": "Hasted", "kind": "buff", "mods": {"initiative": 8, "dodge": 5},
               "desc": "+8 initiative, +5% dodge."},
    "evasive": {"name": "Evasive", "kind": "buff", "mods": {"dodge": 40}, "desc": "+40% dodge."},
    "focused": {"name": "Focused", "kind": "buff", "mods": {"crit": 100}, "desc": "Next attacks are critical hits."},
    "unstoppable": {"name": "Unstoppable", "kind": "buff", "mods": {"cc_resist": 100},
                    "desc": "Immune to crowd control."},
    "inspired": {"name": "Inspired", "kind": "buff", "mods": {"dmg_dealt_pct": 15, "accuracy": 10},
                 "desc": "+15% damage, +10 accuracy."},
    "counter_stance": {"name": "Riposte", "kind": "buff", "mods": {"dodge": 15},
                       "desc": "Counter-attacks every melee attack. +15% dodge."},
    "mana_shield": {"name": "Mana Shield", "kind": "buff",
                    "desc": "Half of incoming damage is paid with mana instead."},
    "trap_set": {"name": "Snare Trap", "kind": "buff",
                 "desc": "The next enemy to strike you in melee is hurt and stunned."},
    "stealthed": {"name": "Stealthed", "kind": "buff",
                  "desc": "Hidden: enemies may lose track of you. Your next attack is a devastating strike from the shadows."},

    # --- stacking resources -----------------------------------------------
    "fury": {"name": "Fury", "kind": "special", "max_stacks": 5, "stack_mods": True,
             "mods": {"dmg_dealt_pct": 4}, "permanent": True, "desc": "+4% damage per stack. Fuels Berserker abilities."},
    "flow": {"name": "Flow", "kind": "special", "max_stacks": 5, "stack_mods": True,
             "mods": {"dmg_dealt_pct": 6}, "permanent": True, "desc": "+6% damage per stack from varied techniques."},
    "mirror_images": {"name": "Mirror Images", "kind": "buff", "max_stacks": 5, "permanent": True,
                      "desc": "Each image absorbs one attack aimed at you."},
    "heat": {"name": "Heat", "kind": "special", "max_stacks": 5, "permanent": True, "stack_mods": True,
             "mods": {"dmg_dealt_pct": 8}, "desc": "Rising heat. Frost damage vents it."},

    # --- boss / special ---------------------------------------------------
    "charging": {"name": "Charging", "kind": "special",
                 "desc": "Gathering power for a devastating attack next turn. Stun, provoke or counterspell to interrupt."},
    "attuned_fire": {"name": "Fire Attunement", "kind": "buff", "mods": {"res_fire": 200},
                     "desc": "Immune to fire."},
    "attuned_frost": {"name": "Frost Attunement", "kind": "buff", "mods": {"res_frost": 200},
                      "desc": "Immune to frost."},
    "attuned_lightning": {"name": "Storm Attunement", "kind": "buff", "mods": {"res_lightning": 200},
                          "desc": "Immune to lightning."},
    "shrouded": {"name": "Shrouded", "kind": "buff", "mods": {"dmg_taken_pct": -100}, "permanent": True,
                 "desc": "Invulnerable while its anchors stand."},
    "overheated": {"name": "Overheated", "kind": "debuff", "mods": {"armor_pct": -80, "dmg_taken_pct": 25},
                   "desc": "Plating vented: armor collapses and damage taken increases."},
    "plated": {"name": "Aegis Plating", "kind": "buff", "mods": {"dmg_taken_pct": -60}, "permanent": True,
               "desc": "Ancient plating absorbs most damage."},
    "blade_stance": {"name": "Blade Stance", "kind": "buff", "mods": {"dodge": 45, "res_all": -20},
                     "permanent": True, "desc": "Dodges most weapon attacks; weak to spells."},
    "spell_stance": {"name": "Spell Stance", "kind": "buff", "mods": {"res_all": 60, "armor_pct": -50, "dodge": -20},
                     "permanent": True, "desc": "Resists spells; armor weakened."},
    "unbound": {"name": "Unbound", "kind": "debuff", "mods": {"dmg_taken_pct": 30, "dmg_dealt_pct": 30},
                "permanent": True, "desc": "The Aether rejects her: takes and deals 30% more damage."},
}

DEBUFF_CC = {k for k, v in STATUSES.items() if v.get("cc")}
