"""Sylvara — the Elven homeland. A vertical city grown through colossal trees along the ley-lines.

Intro arc (Elves: main quest; others: side quest): The Withering Canopy.
Keystone arc (everyone): The Weeping Barrow.
"""

NATIVE = {"home": "sylvara"}

LOCATIONS = {
    "sy_terrace": {
        "name": "Heartroot Terrace", "region": "sylvara", "biome": "forest_city",
        "desc": [
            {"text": "A great platform of living wood cradled in the branches of the Heartroot, a tree so vast its crown is "
                     "lost in cloud. Bridges of woven silverbark radiate outward to the other boughs. At the terrace's "
                     "center, the Moonwell — a pool of liquid light fed by the ley-lines — casts shifting silver patterns "
                     "across everything."},
            {"if": {"not_flag": "sy_intro_done"},
             "text": "Tonight the Moonwell gutters. Its light pulses weakly, and the wisps that should dance above it are "
                     "circling low, agitated, sparking."},
            {"if": {"flag": "sy_intro_done"},
             "text": "The Moonwell's light is steady again, if a shade dimmer than the elders remember."},
        ],
        "npcs": [{"id": "warden_ilyra"}, {"id": "keeper_thessaly"}],
        "features": [
            {"id": "moonwell", "name": "The Moonwell", "desc": "A pool of liquid ley-light.",
             "actions": [
                 {"label": "Study the Moonwell's flow", "if": {"stage": ["mq_sy_intro", "investigate"], "not_flag": "sy_clue_well"},
                  "text": "You kneel and let your senses sink into the light. The ley-flow isn't weak — it's *reversed*, "
                          "being pulled outward along the eastern root toward the Thornwild. Something out there is "
                          "drinking from the well.",
                  "effects": [{"flag": "sy_clue_well", "xp": 25}]},
                 {"label": "Drink from the Moonwell", "once": True,
                  "text": "It tastes of cold stars and old songs. You feel briefly, profoundly, a very small part of something very large.",
                  "effects": [{"heal_full": True, "xp": 10}]},
             ]},
        ],
        "exits": [{"to": "sy_lowbough", "label": "Lowbough Market"}, {"to": "sy_highbough", "label": "Highbough Archive"},
                  {"to": "sy_gate", "label": "The Rootgate (city exit)"}],
        "on_enter": [{"once": "intro", "if": NATIVE,
                      "text": "The Moonwell Ceremony has barely begun when the light stutters. The wisps above the pool "
                              "shriek — a sound like glass breaking — and dive at the crowd. Elders scatter. The wisps come "
                              "for you.",
                      "effects": [{"start_quest": "mq_sy_intro"}]}],
        "encounter": {"id": "enc_sy_tutorial", "if": NATIVE},
    },
    "sy_lowbough": {
        "name": "Lowbough Market", "region": "sylvara", "biome": "forest_city",
        "desc": "Merchants trade from hollows grown into the trunk itself, their stalls lit by jars of captive fireflies. "
                "The air smells of moonpetal tea and resin. A ring of carved ley-stones stands in a small grove at the "
                "market's heart, their channels meant to glow with a steady silver light.",
        "npcs": [{"id": "faelar"}, {"id": "lowbough_merchant"}],
        "shop": "sy_market", "rest": "inn",
        "features": [
            {"id": "ley_stones", "name": "The Lowbough Ley-Stones", "desc": "Standing stones etched with ley-channels.",
             "actions": [{"label": "Examine the ley-stones", "if": {"stage": ["mq_sy_intro", "investigate"], "not_flag": "sy_clue_stones"},
                          "text": "The channels are dark. Caught in one groove you find a curl of bright metal — silver, "
                                  "scored with a tiny broken-ring sigil. Not elven work. Someone has been driving spikes into "
                                  "the ley-lines to tap them.",
                          "effects": [{"flag": "sy_clue_stones", "xp": 25}]}]},
            {"id": "whispering_knot", "name": "An Old Knot in the Bark",
             "desc": "A knot in the Heartroot's bark shaped uncannily like a listening ear.",
             "actions": [{"label": "Put your ear to it", "once": True,
                          "text": "For a long moment, nothing. Then — faint as moth-wings — a whisper in a language older "
                                  "than elvish: '...the tower where the stars are counted... it remembers what the roots "
                                  "forgot...' The whisper stops. The knot is just a knot.",
                          "effects": [{"start_quest": "hq_sy_whisper", "discover": "mistvale"}]}]},
        ],
        "exits": [{"to": "sy_terrace", "label": "Heartroot Terrace"}, {"to": "sy_nursery", "label": "The Seed Nursery"}],
        "discover_xp": 10,
    },
    "sy_highbough": {
        "name": "Highbough Archive", "region": "sylvara", "biome": "forest_arcane",
        "desc": "High in the canopy, the Archive of Sylvara spirals up a hollow bough. Scrolls rest in niches of living wood "
                "that slowly grow to fit them. Mentors of the Circle teach young mages in alcoves open to the wind.",
        "npcs": [{"id": "loremaster_caelith", "if": {"not_flag": "caelith_gone"}}, {"id": "warden_sorrel"}],
        "respec": True,
        "features": [
            {"id": "sy_scrolls", "name": "Archive Scrolls", "desc": "Scrolls of Sylvaran history.",
             "actions": [{"label": "Read 'The Drinking of the Roots'", "effects": [{"lore": "roots_drinking"}], "text": "An old scroll."},
                         {"label": "Read 'On the Matriarchs'", "effects": [{"lore": "matriarchs"}], "text": "A funerary text."}]},
        ],
        "exits": [{"to": "sy_terrace", "label": "Heartroot Terrace"}],
        "discover_xp": 10,
    },
    "sy_nursery": {
        "name": "The Seed Nursery", "region": "sylvara", "biome": "forest_city",
        "desc": "A sheltered bough where the gardeners of Sylvara coax new trees from seed with song and Aether. Tiny "
                "saplings glow in rows of clay pots, each labeled in careful script.",
        "npcs": [{"id": "gardener_wren"}],
        "exits": [{"to": "sy_lowbough", "label": "Lowbough Market"}],
        "discover_xp": 10,
    },
    "sy_gate": {
        "name": "The Rootgate", "region": "sylvara", "biome": "forest", "travel": "sylvara",
        "desc": [{"text": "Where the Heartroot's roots meet the forest floor, an arch of living wood marks the edge of the "
                          "city. Beyond lie the tangled Thornwild to the east and the misty paths of the Mistvale to the south."},
                 {"if": {"not_flag": "world_open"},
                  "text": "Warden-sentries watch the paths. 'None leave while the Moonwell is sick,' one says. (Complete your "
                          "homeland's story to travel freely.)"}],
        "npcs": [{"id": "vaelith"}],
        "exits": [{"to": "sy_terrace", "label": "Heartroot Terrace"},
                  {"to": "sy_tw_path", "label": "East into the Thornwild", "if": {"flag": "sy_thornwild_open"},
                   "locked": "The Thornwild path is closed by order of the Wardens."},
                  {"to": "sy_wb_mouth", "label": "South to the Weeping Barrow",
                   "if": {"quest": ["mq_ks_sylvara", "active"]}, "show_if": {"quest": ["mq_ks_sylvara", "started"]},
                   "locked": "You have no reason to disturb the barrows."}],
        "discover_xp": 10,
    },

    # ---------------- The Thornwild (intro dungeon) ----------------
    "sy_tw_path": {
        "name": "Thornwild: Bramble Path", "region": "sylvara", "biome": "forest_dark", "danger": "moderate",
        "desc": "The forest closes in. Brambles thick as a wrist twist across the path, and the ley-line beneath your feet "
                "pulses, faint and wrong, dragging eastward like a current.",
        "features": [
            {"id": "hunters_cache", "name": "Warden's Cache", "hidden": 11, "desc": "A hollow stump with a Warden's mark.",
             "actions": [{"label": "Open the cache", "once": True, "text": "Supplies for Wardens on patrol.",
                          "effects": [{"item": "potion_heal_minor", "qty": 2}, {"item": "moonpetal_tea", "qty": 2}]}]},
        ],
        "exits": [{"to": "sy_gate", "label": "Back to the Rootgate"}, {"to": "sy_tw_hollow", "label": "Deeper, toward the flickering lights"}],
        "encounter": {"id": "enc_sy_path"},
        "random": {"chance": 0.3, "table": ["enc_sy_wolves"]},
        "discover_xp": 20,
    },
    "sy_tw_hollow": {
        "name": "Thornwild: Wisp Hollow", "region": "sylvara", "biome": "forest_dark", "danger": "moderate",
        "desc": "A sunken glade where wisps are born from pooled ley-light. Tonight the pool is nearly dry and the wisps "
                "are feral, darting and snapping. Webs glisten between the trees. At the center, a single seed glows "
                "among the roots like a dropped star.",
        "features": [
            {"id": "heartseed_spot", "name": "A Glowing Seed", "if": {"not_has_item": "heartseed", "not_flag": "heartseed_taken"},
             "desc": "A heartseed — the seed of a future Heartroot. Rare beyond price.",
             "actions": [{"label": "Take the heartseed", "effects": [{"item": "heartseed", "flag": "heartseed_taken", "xp": 20}],
                          "text": "The seed is warm, and pulses gently, like a heartbeat."}]},
        ],
        "exits": [{"to": "sy_tw_path", "label": "Back to the Bramble Path"}, {"to": "sy_tw_tap", "label": "Follow the dragging ley-line"}],
        "encounter": {"id": "enc_sy_hollow"},
        "random": {"chance": 0.3, "table": ["enc_sy_wisps", "enc_sy_spiders"]},
        "discover_xp": 20,
    },
    "sy_tw_tap": {
        "name": "Thornwild: The Tap Site", "region": "sylvara", "biome": "forest_dark", "danger": "high",
        "desc": [{"text": "A clearing where three ancient ley-stones — carved with a MOON, a STAR, and a ROOT — stand around a "
                          "silver spike driven deep into the earth. Cables run from the spike into a crate-mounted "
                          "condenser, bottling ley-light into glass flasks."},
                 {"if": {"flag": "sy_ley_restored"},
                  "text": "The spike lies on its side. The ley-stones glow in proper sequence, and the current flows home "
                          "toward the Moonwell."}],
        "features": [
            {"id": "ley_puzzle", "name": "The Three Ley-Stones", "if": {"not_flag": "sy_ley_restored"},
             "desc": "To reverse the flow, the stones must be attuned in the correct order after the spike is pulled.",
             "actions": [
                 {"label": "Attune: Moon, Star, Root",
                  "text": "Moonrise, starwake, rootdrink. The stones chime in sequence and the spike shudders loose. Silver "
                          "light rushes back along the ley-line toward home.",
                  "effects": [{"flag": "sy_ley_restored", "item": "ley_spike", "xp": 80}]},
                 {"label": "Attune: Root, Moon, Star",
                  "text": "The stones flare angrily; the ley-backlash lashes you and the spike drinks deeper.",
                  "effects": [{"damage_pct": 15}]},
                 {"label": "Attune: Star, Root, Moon",
                  "text": "The stones flare angrily; the ley-backlash lashes you.",
                  "effects": [{"damage_pct": 15}]},
                 {"label": "[Lore] Read the stones' carvings", "check": {"stat": "lore", "dc": 11,
                  "pass": {"text": "Old ley-craft follows the night: the moon rises, the stars wake, and at dawn the roots drink. Moon, Star, Root."},
                  "fail": {"text": "The carvings are worn. You're fairly sure one is a moon. Or a very round owl."}}},
             ]},
            {"id": "tapper_crates", "name": "Unbound Supply Crates", "desc": "Crates, flasks and a leather satchel.",
             "actions": [{"label": "Search the satchel", "once": True,
                          "text": "Beneath the flasks: a bundle of letters bound in green ribbon — addressed, in an elegant "
                                  "hand, to Loremaster Caelith.",
                          "effects": [{"item": "unbound_letter_sy", "flag": "sy_letters_found", "loot": "chest"}]}]},
        ],
        "exits": [{"to": "sy_tw_hollow", "label": "Back to Wisp Hollow"},
                  {"to": "sy_tw_heart", "label": "Toward the stench of rot", "if": {"flag": "sy_ley_restored"},
                   "locked": "The ley-backlash from the spike makes the path east impassable."}],
        "encounter": {"id": "enc_sy_tap"},
        "discover_xp": 20,
    },
    "sy_tw_heart": {
        "name": "Thornwild: Heart of Rot", "region": "sylvara", "biome": "forest_rot", "danger": "boss",
        "desc": [{"text": "At the Thornwild's heart stood a heart-oak, one of the old guardian trees. The first spike "
                          "was driven into its roots. Now it is a Rotbloom: bark split and weeping, branches heavy with "
                          "sickly pods, and saplings of rot sprouting at its feet."},
                 {"if": {"flag": "sy_rotbloom_defeated"},
                  "text": "The Rotbloom is still. Already, green shoots push up through its fallen bark."}],
        "features": [
            {"id": "cleansed_heart", "name": "The Cleansed Heartwood", "if": {"flag": "sy_rotbloom_defeated"},
             "desc": "Where the rot has burned away, pale living heartwood gleams.",
             "actions": [{"label": "Take a length of heartwood", "once": True,
                          "text": "The wood bends itself into your hands, as if it wants to be something new.",
                          "effects": [{"if": {"cls": "mage"}, "unique": "u_rotbloom_staff"},
                                      {"if": {"not": {"cls": "mage"}}, "unique": "u_thornheart_bow"}]}]},
        ],
        "exits": [{"to": "sy_tw_tap", "label": "Back to the Tap Site"}],
        "encounter": {"id": "enc_sy_rotbloom"},
        "discover_xp": 20,
    },

    # ---------------- The Weeping Barrow (keystone dungeon) ----------------
    "sy_wb_mouth": {
        "name": "Weeping Barrow: The Mouth", "region": "sylvara", "biome": "barrow", "danger": "high",
        "desc": "A hill of white stone in the misty southern wood, its entrance carved as a weeping face. Water runs "
                "from the stone eyes. Inside, the air is cold and smells of old flowers. Somewhere deep below, someone "
                "is singing — no, *crying* — in a voice that makes the bones ache.",
        "exits": [{"to": "sy_gate", "label": "Return to the Rootgate"}, {"to": "sy_wb_ossuary", "label": "Descend"}],
        "encounter": {"id": "enc_wb_mouth"},
        "random": {"chance": 0.25, "table": ["enc_wb_shades"]},
        "discover_xp": 30,
    },
    "sy_wb_ossuary": {
        "name": "Weeping Barrow: Ossuary of Songs", "region": "sylvara", "biome": "barrow", "danger": "high",
        "desc": "Niches line the walls, each holding the bones of an elf and a small stone carved with the song they were "
                "buried with. Many niches have been disturbed. The bones are gone; only the song-stones remain, "
                "humming discordantly.",
        "features": [
            {"id": "song_stones", "name": "Song-Stones", "desc": "Stones carved with funeral songs.",
             "actions": [{"label": "Read the song-stones", "effects": [{"lore": "song_stones"}], "text": "The stones hum as you read."},
                         {"label": "Return the scattered song-stones to their niches", "once": True,
                          "text": "One by one, you set the song-stones back. The discordant hum softens into a quiet chord. "
                                  "You feel watched — but kindly.",
                          "effects": [{"xp": 50, "flag": "barrow_respected"}]}]},
            {"id": "ossuary_offering", "name": "Offering Bowl", "hidden": 13, "desc": "A bowl of old coins and silver leaves.",
             "actions": [{"label": "Take the offerings", "once": True,
                          "text": "You take them. The humming stops. That's probably fine.",
                          "effects": [{"gold": 80, "flag": "barrow_robbed"}]},
                         {"label": "Leave an offering (10 gold)", "once": True, "if": {"gold_gte": 10},
                          "text": "You add ten gold. A faint warmth settles over you.",
                          "effects": [{"gold": -10, "flag": "barrow_respected", "item": "potion_heal"}]}]},
        ],
        "exits": [{"to": "sy_wb_mouth", "label": "Back to the Mouth"}, {"to": "sy_wb_mothhall", "label": "Follow the weeping"}],
        "encounter": {"id": "enc_wb_ossuary"},
        "discover_xp": 30,
    },
    "sy_wb_mothhall": {
        "name": "Weeping Barrow: Moth-Lit Hall", "region": "sylvara", "biome": "barrow", "danger": "high",
        "desc": "A long hall lit by thousands of pale moths clinging to the ceiling. A door of carved bone at the far end "
                "bears three lines of an unfinished lament, and a space for a fourth. Beside it, a mural shows the first "
                "Matriarch planting a seed that becomes the Heartroot.",
        "features": [
            {"id": "lament_door", "name": "The Lament Door", "if": {"not_flag": "wb_door_open"},
             "desc": "'The root drinks deep, the branch grows high,\nthe leaf lets go, and so must I —\nbut what we plant will...' "
                     "The last line is missing.",
             "actions": [
                 {"label": "Sing: '...outlast the sky.'",
                  "text": "Your voice echoes down the hall. The moths rise in a silver cloud and the bone door swings open.",
                  "effects": [{"flag": "wb_door_open", "xp": 80}]},
                 {"label": "Sing: '...never die.'",
                  "text": "The moths shriek. Wrong — the lament is about letting go, not holding on. They descend!",
                  "effects": [{"combat": "enc_wb_moths"}]},
                 {"label": "Sing: '...grow up high.'",
                  "text": "The moths seem... embarrassed for you. They descend!",
                  "effects": [{"combat": "enc_wb_moths"}]},
                 {"label": "[Wisdom] Contemplate the mural", "check": {"stat": "wis", "dc": 12,
                  "pass": {"text": "The Matriarch plants the seed and lets it go; the tree outgrows her, outgrows the sky itself. The last line must be '...outlast the sky.'"},
                  "fail": {"text": "It's a very nice mural. There is a squirrel in the corner you find distracting."}}},
             ]},
        ],
        "exits": [{"to": "sy_wb_ossuary", "label": "Back to the Ossuary"},
                  {"to": "sy_wb_crypt", "label": "Through the bone door", "if": {"flag": "wb_door_open"},
                   "locked": "The bone door will not open."}],
        "encounter": {"id": "enc_wb_mothhall"},
        "discover_xp": 30,
    },
    "sy_wb_crypt": {
        "name": "Weeping Barrow: Matriarch's Crypt", "region": "sylvara", "biome": "barrow", "danger": "boss",
        "desc": [{"text": "A domed crypt where the first Matriarch's sarcophagus lies open. Above it, her spirit hangs in "
                          "the air, bound by two silver chains anchored to the floor, weeping endlessly. Before her stands "
                          "an elf in a crown of brambles, holding a ring of living heartwood that pulses with stolen light."},
                 {"if": {"flag": "naerys_defeated"},
                  "text": "The crypt is quiet. The Matriarch's sarcophagus is closed, and someone has laid fresh flowers on it."}],
        "exits": [{"to": "sy_wb_mothhall", "label": "Back to the Moth-Lit Hall"},
                  {"to": "sy_gate", "label": "Take the root-passage back to the Rootgate", "if": {"flag": "naerys_defeated"},
                   "locked": "Naerys bars the way."}],
        "encounter": {"id": "enc_wb_naerys"},
        "discover_xp": 30,
    },
}

ENCOUNTERS = {
    "enc_sy_tutorial": {"title": "The Moonwell Falters", "flee": False, "level": [1, 1],
                        "intro": "Feral wisps dive at you! Use Attack or your abilities. Watch your health, mana and stamina.",
                        "enemies": ["feral_wisp", "feral_wisp"], "on_victory": [{"flag": "sy_tutorial_done"}]},
    "enc_sy_wolves": {"title": "Thornbacks", "level": [1, 5], "enemies": ["thorn_wolf", "thorn_wolf"]},
    "enc_sy_wisps": {"title": "Feral Wisps", "level": [1, 5], "enemies": ["feral_wisp", "feral_wisp", "feral_wisp"]},
    "enc_sy_spiders": {"title": "Blight Spiders", "level": [1, 5], "enemies": ["blight_spider", "blight_spider"]},
    "enc_sy_path": {"title": "The Bramble Path", "level": [1, 5],
                    "intro": "Thornback wolves melt out of the brambles, circling.",
                    "enemies": ["thorn_wolf", "thorn_wolf", "feral_wisp"]},
    "enc_sy_hollow": {"title": "Wisp Hollow", "level": [2, 5],
                      "intro": "The feral wisps and their spider-hunters turn on you.",
                      "enemies": ["blight_spider", "blight_spider", ["corrupted_dryad", "back"]]},
    "enc_sy_tap": {"title": "The Tap Site", "level": [2, 6],
                   "intro": "Hooded figures look up from the condenser. 'The Loremaster said no one would come.'",
                   "enemies": ["thorn_wolf", ["unbound_tapper", "back"], ["unbound_tapper", "back"]]},
    "enc_sy_rotbloom": {"title": "The Rotbloom", "boss": True, "level": [4, 7],
                        "intro": "The Rotbloom groans awake, pods swelling. (Its Rot Saplings heal it — kill them, ideally "
                                 "with fire. When it charges a Spore Burst, Defend or interrupt!)",
                        "enemies": ["rotbloom", "rot_sapling"],
                        "on_victory": [{"flag": "sy_rotbloom_defeated"}]},
    "enc_wb_shades": {"title": "Restless Shades", "level": [5, 9], "enemies": ["barrow_shade", "barrow_shade"]},
    "enc_wb_mouth": {"title": "The Barrow Mouth", "level": [5, 9],
                     "intro": "Shades rise from the cold stone, their faces twisted in grief that is not their own.",
                     "enemies": ["barrow_shade", "barrow_shade", ["bone_archer", "back"]]},
    "enc_wb_ossuary": {"title": "The Stolen Dead", "level": [5, 9],
                       "intro": "The missing bones have been assembled into archers, bound by thorny vines.",
                       "enemies": ["barrow_shade", ["bone_archer", "back"], ["bone_archer", "back"]]},
    "enc_wb_mothhall": {"title": "Moth-Lit Hall", "level": [5, 9],
                        "intro": "A Thornbound Warden, rooted to guard the hall, tears itself free of the floor.",
                        "enemies": ["thornbound_warden", "spirit_moth_swarm"]},
    "enc_wb_moths": {"title": "The Moths Descend", "level": [5, 9],
                     "enemies": ["spirit_moth_swarm", "spirit_moth_swarm"],
                     "on_victory": [{"msg": "The moths settle back onto the ceiling. The door remains closed."}]},
    "enc_wb_naerys": {"title": "Thorn-Speaker Naerys", "boss": True, "level": [7, 10],
                      "intro": "'Grandmother weeps because she is caged in death,' Naerys says. 'Just as we are caged in the "
                               "Aether. I will teach her to scream instead.' (The Matriarch is invulnerable while bound — "
                               "break both Anchor Chains to free her! Naerys stays in the back row.)",
                      "enemies": ["bound_matriarch", "anchor_chain", "anchor_chain", ["naerys", "back"]],
                      "on_victory": [{"flag": "naerys_defeated", "item": "keystone_sylvara", "unique": "u_naerys_crown"}],
                      "after_dialogue": "naerys_defeated"},
}

SHOPS = {
    "sy_market": {"name": "Lowbough Traders", "greeting": "'Moonpetal tea, silverbark bows, and silk that remembers the moon.'",
                  "stock": ["potion_heal_minor", "potion_heal", "potion_mana_minor", "potion_mana", "moonpetal_tea",
                            "antidote", "frost_bomb"],
                  "random": 5, "bases": ["shortbow", "longbow", "rapier", "dagger", "staff", "medium_chest", "medium_legs",
                                         "light_chest", "light_hands", "medium_head", "ring"],
                  "rep_stock": [{"faction": "circle", "min": 10, "items": ["t2_longbow", "t2_light_head"], "rarity": "rare"},
                                {"faction": "circle", "min": 25, "items": ["t3_staff", "t3_medium_chest"], "rarity": "epic"}]},
}

DIALOGUES = {
    "warden_ilyra": {
        "name": "Warden-Commander Ilyra", "title": "Commander of the Heartroot Wardens",
        "markers": [{"if": {"stage": ["mq_sy_intro", "ilyra"]}, "marker": "!"},
                    {"if": {"stage": ["mq_sy_intro", "report"]}, "marker": "?"},
                    {"if": {"quest": ["mq_sy_intro", "not_started"], "flag": "world_open"}, "marker": "!"}],
        "entry": [
            {"if": {"stage": ["mq_sy_intro", "ilyra"]}, "node": "intro"},
            {"if": {"stage": ["mq_sy_intro", "report"]}, "node": "report"},
            {"if": {"quest": ["mq_sy_intro", "not_started"], "flag": "world_open"}, "node": "outsider"},
            {"if": {"quest": ["mq_sy_intro", "active"]}, "node": "progress"},
            {"node": "idle"},
        ],
        "nodes": {
            "intro": {"text": "An elf in bark-plate armor lowers her bow, eyes on the guttering Moonwell. 'Wisps don't "
                              "attack. Not in three thousand years of records.' She turns to you. '{name}. You kept your head. "
                              "The Moonwell is dying and I have too few Wardens and too many elders demanding answers. Find "
                              "out why.'",
                      "options": [{"text": "Where do I start?", "goto": "start"},
                                  {"text": "Why me?", "goto": "why"}]},
            "why": {"text": "'Because the Wardens are guarding the terrace, the elders are arguing, and you are standing "
                            "here with a weapon and no obvious plans.' A ghost of a smile. 'Also, you're good.'",
                    "options": [{"text": "Where do I start?", "goto": "start"}]},
            "start": {"text": "'Keeper Thessaly can read the Moonwell's flow — study it yourself if she allows. The ley-stones "
                              "in Lowbough have been dark for days. And Loremaster Caelith in the Highbough Archive knows "
                              "more about ley-craft than anyone living.' Her jaw tightens. 'He has been... quiet, lately.'",
                      "effects": [{"flag": "talked_ilyra_intro"}],
                      "options": [{"text": "I'll find the cause."}]},
            "outsider": {"text": "'A {race} in Sylvara. We do not see many.' Ilyra studies you. 'Our Moonwell sickens and the "
                                 "forest turns feral. If you have come to help, I will not refuse you. If you have come to "
                                 "gawk, the market is that way.'",
                         "options": [{"text": "I'll help. Tell me what's happening.",
                                      "effects": [{"start_quest": "mq_sy_intro"}, {"set_stage": ["mq_sy_intro", "investigate"]}],
                                      "goto": "start"},
                                     {"text": "Just visiting."}]},
            "progress": {"text": [{"text": "'Report, {name}.'"},
                                  {"if": {"stage": ["mq_sy_intro", "investigate"]},
                                   "text": "'The Moonwell, the Lowbough stones, and Caelith. Go.'"},
                                  {"if": {"stage_in": ["mq_sy_intro", ["thornwild", "rotbloom"]]},
                                   "text": "'The Thornwild is open to you. The Rootgate is below. Be careful — the forest remembers grudges.'"},
                                  {"if": {"stage": ["mq_sy_intro", "confront"]},
                                   "text": "'Caelith.' She says it like a curse. 'Deal with him. However you judge best.'"}],
                         "options": [{"text": "Understood."}]},
            "report": {"text": [{"text": "Ilyra hears you out, then looks at the Moonwell. It pulses stronger now. 'The flow "
                                         "returns. The heart-oak is freed. You have done Sylvara a great service.'"},
                                {"if": {"flag": "caelith_exposed"}, "text": "'And Caelith will answer to the Circle. As he should.'"},
                                {"if": {"flag": "caelith_fled"}, "text": "'You let Caelith go.' A long silence. 'Mercy is also an elven tradition. An old one.'"},
                                {"if": {"flag": "caelith_redeemed"}, "text": "'Caelith... working with us. I will believe it when I see it. But I will watch.'"},
                                {"text": "'But the letters mention a woman named Ilvane, and a Vault. This is larger than one "
                                         "forest. Keeper Thessaly wishes to speak with you — and the Rootgate is open to you now.'"}],
                       "effects": [{"flag": "sy_intro_reported"}],
                       "options": [{"text": "Thank you, Commander."}]},
            "idle": {"text": "'The forest is watching, {name}. So am I.'",
                     "options": [{"text": "Any news?", "goto": "news"}, {"text": "Farewell."}]},
            "news": {"text": "'Travellers from the Mistvale speak of a spider-queen grown fat on Aether — the Grey Widow. And "
                             "of a tower in the mist that no map shows. The Adventurers' Guild in Emberfall pays for such "
                             "tales, I hear.'", "effects": [{"discover": "mistvale"}],
                     "options": [{"text": "Thank you."}]},
        },
    },
    "keeper_thessaly": {
        "name": "Keeper Thessaly", "title": "Keeper of the Moonwell",
        "markers": [{"if": {"quest": ["mq_ks_sylvara", "not_started"], "flag": "world_open"}, "marker": "!"}],
        "entry": [
            {"if": {"quest": ["mq_ks_sylvara", "not_started"], "flag": "world_open"}, "node": "keystone"},
            {"if": {"quest": ["mq_ks_sylvara", "active"]}, "node": "progress"},
            {"if": {"stage": ["mq_sy_intro", "investigate"]}, "node": "hint"},
            {"node": "idle"},
        ],
        "nodes": {
            "hint": {"text": "An ancient elf with silver-white eyes sits at the Moonwell's edge, one hand trailing in the "
                             "light. 'Look for yourself, child. The well will tell you what it tells me.' She hums. 'And "
                             "remember the old ley-song: the moon rises, the stars wake, the roots drink at dawn.'",
                     "effects": [{"flag": "ley_song_hint"}],
                     "options": [{"text": "Thank you, Keeper."}]},
            "keystone": {"text": [{"text": "Thessaly's silver eyes find you. 'The flow returns, but the heart of the well is "
                                           "empty. Three nights ago, in the chaos of the wisps, someone took the Heartseed "
                                           "Ring from the Moonwell's cradle — a ring of living heartwood older than Sylvara."},
                                  {"text": "It was Naerys. Thorn-Speaker Naerys, once of our Circle. She has fled to the "
                                           "Weeping Barrow, where the first Matriarchs sleep. She means to bind their spirits "
                                           "with it. I have seen it in the well.'"}],
                         "options": [{"text": "I'll retrieve the ring.", "effects": [{"start_quest": "mq_ks_sylvara"}], "goto": "go"},
                                     {"text": "What is the ring, truly?", "goto": "truly"}]},
            "truly": {"text": "'The first Matriarch planted the Heartroot around it. We called it a gift from the Aether. I "
                              "am beginning to think it was a *lock*. And the tree grew around it to hold it shut.'",
                      "effects": [{"lore": "three_rings"}],
                      "options": [{"text": "I'll get it back.", "effects": [{"start_quest": "mq_ks_sylvara"}], "goto": "go"}]},
            "go": {"text": "'Take the southern path from the Rootgate. And be gentle with the dead, child. They did not ask "
                           "to be woken.'", "options": [{"text": "I will."}]},
            "progress": {"text": [{"text": "'The Weeping Barrow lies south of the Rootgate.'"},
                                  {"if": {"has_item": "keystone_sylvara"},
                                   "text": "Thessaly touches the ring in your hand and weeps silver tears. 'Carry it. The well "
                                           "says it must go with you — toward something old.'"}],
                         "options": [{"text": "I understand."}]},
            "idle": {"text": "'The well sings, child. Listen.'", "options": [{"text": "(Listen.)", "effects": [{"counter": "listened"}]},
                                                                          {"text": "Farewell."}]},
        },
    },
    "loremaster_caelith": {
        "name": "Loremaster Caelith", "title": "Keeper of the Highbough Archive",
        "markers": [{"if": {"stage": ["mq_sy_intro", "investigate"], "not_flag": "sy_clue_caelith"}, "marker": "?"},
                    {"if": {"stage": ["mq_sy_intro", "confront"]}, "marker": "!"}],
        "entry": [
            {"if": {"stage": ["mq_sy_intro", "investigate"], "not_flag": "sy_clue_caelith"}, "node": "question"},
            {"if": {"stage": ["mq_sy_intro", "confront"]}, "node": "confront"},
            {"if": {"flag": "caelith_redeemed"}, "node": "redeemed"},
            {"node": "idle"},
        ],
        "nodes": {
            "question": {"text": "A silver-haired elf with ink-stained sleeves closes a book a little too quickly. 'The "
                                 "Moonwell? A natural fluctuation. It happens every few centuries. The records are clear. "
                                 "There is nothing to investigate.'",
                         "options": [
                             {"text": "[Perception] Watch his hands as he talks.", "check": {"stat": "perception", "dc": 12, "pass": "caught", "fail": "missed"}},
                             {"text": "[Lore] Which records? Name them.", "check": {"stat": "lore", "dc": 13, "pass": "caught", "fail": "missed"}},
                             {"text": "I see. Thank you, Loremaster.", "goto": "missed"},
                         ]},
            "caught": {"text": "His fingers keep returning to a green ribbon tucked into his sleeve — the kind used to bind "
                               "letters. And there are no records of 'natural fluctuations'. He's lying, and badly. When you "
                               "press, he snaps: 'The Thornwild is dangerous. Stay out of it.' Which tells you exactly where "
                               "to go.",
                       "effects": [{"flag": ["sy_clue_caelith", "caelith_suspect"], "xp": 40}],
                       "options": [{"text": "We'll talk again, Loremaster."}]},
            "missed": {"text": "'Now, if you'll excuse me, I have a great deal of reading.' He turns away. Something about the "
                               "conversation nags at you. He never once looked at the Moonwell, and he mentioned the "
                               "Thornwild twice without being asked.",
                       "effects": [{"flag": "sy_clue_caelith", "xp": 15}],
                       "options": [{"text": "(Leave.)"}]},
            "confront": {"text": "Caelith sees the green-ribboned letters in your hand and sits down heavily. 'Ah.' A long "
                                 "silence. 'She told me the Aether was a cage. That our roots have been drinking from a "
                                 "prison, and that if we could see past it, we would find magic that needs no well, no "
                                 "ley-line, no *permission*. I have spent four centuries studying a door, {name}. She "
                                 "offered me the key.'",
                         "options": [
                             {"text": "You nearly killed the Moonwell. You'll answer to the Circle.", "goto": "expose"},
                             {"text": "Go. Leave Sylvara and never come back.", "goto": "flee"},
                             {"text": "[Persuade] Help us stop her, and make this right.",
                              "check": {"stat": "persuade", "dc": 14, "pass": "redeem", "fail": "redeem_fail"}},
                         ]},
            "expose": {"text": "He does not resist. The Wardens take him quietly. At the Archive door, he looks back. 'When "
                               "you find her Vault, look at the walls. Read what's written there before you judge her.'",
                       "effects": [{"flag": ["caelith_exposed", "sy_caelith_resolved", "caelith_gone"], "rep": ["circle", 15]}],
                       "options": [{"text": "(Let them take him.)"}]},
            "flee": {"text": "Caelith gathers a single satchel of books. 'Mercy. Hm. She would call it weakness.' He pauses. "
                             "'I don't.' By morning, he is gone.",
                     "effects": [{"flag": ["caelith_fled", "sy_caelith_resolved", "caelith_gone"]}],
                     "options": [{"text": "(Let him go.)"}]},
            "redeem": {"text": "Caelith stares at you a long time. Then he pulls a folded map from inside a book. 'Her "
                               "correspondence came through a relay in the Mistvale. And she mentioned a Vault beneath a "
                               "place she called the Scar. I will help you, {name}. Gods help me, I will help you.'",
                       "effects": [{"flag": ["caelith_redeemed", "sy_caelith_resolved"], "rep": ["circle", 5], "xp": 80, "lore": "caelith_map"}],
                       "options": [{"text": "Welcome back, Loremaster."}]},
            "redeem_fail": {"text": "'Make it right? There is no *right*, only what she will do with or without me.' He turns "
                                    "away. You'll have to decide.",
                            "options": [{"text": "Then answer to the Circle.", "goto": "expose"},
                                        {"text": "Then go.", "goto": "flee"}]},
            "redeemed": {"text": "'I am cross-referencing every mention of the \"ashen choir\" in the Archive. There are more "
                                 "than there should be.'", "options": [{"text": "Keep at it."}]},
            "idle": {"text": "'Yes? The Archive is open to scholars. Try not to breathe on anything.'",
                     "options": [{"text": "Farewell."}]},
        },
    },
    "naerys_defeated": {
        "name": "Thorn-Speaker Naerys", "title": "Defeated",
        "entry": [{"if": {"counter_gte": ["freed_matriarch", 1]}, "node": "freed"}, {"node": "start"}],
        "nodes": {
            "freed": {"text": "Naerys lies tangled in her own brambles. The freed Matriarch bends over her, and for a moment "
                              "the old spirit's face is only sad. 'Child,' she whispers, 'the dead are not a cage. We are a "
                              "*choice*.' Then she turns to you, touches your brow — cool as moonlight — and fades into "
                              "peace. Naerys says nothing. She is weeping.",
                      "effects": [{"achievement": "unchained", "xp": 100}],
                      "options": [{"text": "(Take the Heartseed Ring.)"}]},
            "start": {"text": "Naerys falls to her knees, her bramble crown askew. 'You don't understand. None of you do. The "
                              "Aether was *made*. Made to hold something. Ilvane has seen the walls of the Vault. We are all "
                              "living inside a lock.' She laughs bitterly as the Wardens' horns sound in the distance.",
                      "effects": [{"lore": "naerys_words"}],
                      "options": [{"text": "(Take the Heartseed Ring.)"}]},
        },
    },
    "faelar": {
        "name": "Faelar Dawnquill", "title": "Poet (Aspiring)",
        "markers": [{"if": {"quest": ["sq_sy_poet", "not_started"]}, "marker": "!"}],
        "entry": [{"if": {"quest": ["sq_sy_poet", "not_started"]}, "node": "start"},
                  {"if": {"quest": ["sq_sy_poet", "active"]}, "node": "active"},
                  {"node": "done"}],
        "nodes": {
            "start": {"text": "A young elf with ink on his nose and despair in his eyes clutches a sheaf of crossed-out "
                              "paper. 'Vaelith. The archer at the Rootgate. I have loved her for sixty years and I have "
                              "not said a word. Tonight I will give her a poem. But every poem I write is... well. Read.'",
                      "options": [{"text": "Let me see it.", "effects": [{"start_quest": "sq_sy_poet", "item": "poem_draft"}], "goto": "read"},
                                  {"text": "Sixty years? Just talk to her.", "effects": [{"start_quest": "sq_sy_poet"}], "goto": "talk"}]},
            "read": {"text": "You read it. It rhymes 'moonlight' with 'moonlight' four times, and includes the line 'your "
                             "eyes are like two eyes'. Faelar watches you hopefully.",
                     "options": [
                         {"text": "[Intelligence] Let me help you rewrite it.", "check": {"stat": "int", "dc": 12, "pass": "rewrite", "fail": "rewrite_fail"}},
                         {"text": "[Charisma] Forget the paper. Tell her how you feel.", "check": {"stat": "cha", "dc": 11, "pass": "courage", "fail": "courage_fail"}},
                         {"text": "It's... perfect. Deliver it exactly as written.", "effects": [{"flag": "poem_terrible"}], "goto": "terrible"},
                     ]},
            "talk": {"text": "'Talk? With my *mouth*? Without *meter*?' He looks faint. 'Read the poem first. Please.'",
                     "effects": [{"item": "poem_draft"}],
                     "options": [{"text": "Fine. (Read the poem.)", "goto": "read"}]},
            "rewrite": {"text": "Together you strike 'two eyes' and find a line about starlight on a drawn bowstring. It's "
                                "actually lovely. Faelar weeps a little. 'I'll take it to her now!'",
                        "effects": [{"flag": "poem_good", "remove_item": "poem_draft"}, {"set_stage": ["sq_sy_poet", "outcome"]}],
                        "options": [{"text": "Good luck."}]},
            "rewrite_fail": {"text": "Your rewrite somehow makes it worse. It now rhymes 'moonlight' with 'Vaelith' which does "
                                     "not rhyme. Faelar seems delighted anyway.",
                             "options": [{"text": "[Charisma] Just talk to her instead.", "check": {"stat": "cha", "dc": 11, "pass": "courage", "fail": "courage_fail"}},
                                         {"text": "Deliver it as it is.", "effects": [{"flag": "poem_terrible"}], "goto": "terrible"}]},
            "courage": {"text": "Faelar takes a shaky breath, folds the poem into his pocket, and walks toward the Rootgate "
                                "with the posture of a man going to war. 'No poem. Just... me.'",
                        "effects": [{"flag": "poem_courage", "remove_item": "poem_draft"}, {"set_stage": ["sq_sy_poet", "outcome"]}],
                        "options": [{"text": "Go get her."}]},
            "courage_fail": {"text": "'I can't! Not without words! Please — just take her the poem for me?'",
                             "options": [{"text": "Fine. I'll deliver it.", "effects": [{"flag": "poem_terrible"}], "goto": "terrible"}]},
            "terrible": {"text": "'You'll deliver it? You're a true friend!' He presses the poem on you. 'She's at the Rootgate.'",
                         "effects": [{"set_stage": ["sq_sy_poet", "deliver"]}], "options": [{"text": "(Oh no.)"}]},
            "active": {"text": "'Has she read it? Did she swoon? Is swooning still done?'", "options": [{"text": "Working on it."}]},
            "done": {"text": [{"if": {"flag": "poem_happy"}, "text": "Faelar is humming. Constantly. It's adorable and exhausting."},
                              {"if": {"not_flag": "poem_happy"}, "text": "'She said I should \"take up archery instead\". I think that's encouraging?'"}],
                     "options": [{"text": "Good for you."}]},
        },
    },
    "vaelith": {
        "name": "Vaelith", "title": "Rootgate Archer",
        "entry": [{"if": {"stage": ["sq_sy_poet", "deliver"]}, "node": "deliver"},
                  {"if": {"stage": ["sq_sy_poet", "outcome"]}, "node": "outcome"},
                  {"node": "idle"}],
        "nodes": {
            "deliver": {"text": "A sharp-eyed archer lowers her bow. 'A letter? From... Faelar?' She reads it. She reads it "
                                "again. Her mouth twitches. 'He rhymed moonlight with moonlight. Four times.' A pause. 'He's "
                                "been writing these for sixty years, you know. He thinks I don't notice him at the market "
                                "every morning pretending to buy tea.'",
                        "options": [{"text": "So... is that a yes?", "effects": [{"flag": "poem_happy", "remove_item": "poem_draft", "achievement": "moonlight_moonlight"},
                                                                                  {"complete_quest": "sq_sy_poet"}], "goto": "yes"}]},
            "yes": {"text": "'Tell him if he wants an answer, he can ask me himself. With his mouth.' She is smiling. 'And "
                            "give him this — he'll need it for all the poems he's about to write.' She hands you an elegant quill.",
                    "effects": [{"unique": "u_poets_quill"}],
                    "options": [{"text": "I'll tell him."}]},
            "outcome": {"text": [{"if": {"flag": "poem_courage"}, "text": "Vaelith is blushing furiously. Faelar stands beside her, "
                                                                          "stammering, and she is holding his hand. 'He *talked*. Out loud.' She looks at you. 'Was this you?'"},
                                 {"if": {"flag": "poem_good"}, "text": "Vaelith holds a poem to her chest. 'Starlight on a drawn "
                                                                        "bowstring,' she murmurs. Faelar is hiding behind a tree nearby, very badly."}],
                        "options": [{"text": "Just a little nudge.", "effects": [{"flag": "poem_happy"}, {"complete_quest": "sq_sy_poet"},
                                                                                {"unique": "u_poets_quill"}]}]},
            "idle": {"text": "'Keep your eyes on the treeline. Things come out of the Thornwild these days.'",
                     "options": [{"text": "I will."}]},
        },
    },
    "gardener_wren": {
        "name": "Gardener Wren", "title": "Tender of the Seed Nursery",
        "markers": [{"if": {"quest": ["sq_sy_seed", "not_started"]}, "marker": "!"},
                    {"if": {"stage": ["sq_sy_seed", "find"], "has_item": "heartseed"}, "marker": "?"}],
        "entry": [{"if": {"quest": ["sq_sy_seed", "not_started"]}, "node": "start"},
                  {"if": {"stage": ["sq_sy_seed", "find"], "has_item": "heartseed"}, "node": "have"},
                  {"if": {"quest": ["sq_sy_seed", "active"]}, "node": "waiting"},
                  {"node": "done"}],
        "nodes": {
            "start": {"text": "A small elf with soil to her elbows looks up from a sapling. 'The Heartroot has not dropped a "
                              "heartseed in two hundred years. But the ley-surges lately... the old stories say a seed will "
                              "fall where the wisps are born. Wisp Hollow, in the Thornwild. If one's there, and it's left "
                              "in that sick soil, it'll rot.'",
                      "options": [{"text": "I'll look for it.", "effects": [{"start_quest": "sq_sy_seed"}]},
                                  {"text": "Not now."}]},
            "have": {"text": "Wren's hands shake as you show her the heartseed. 'Oh. Oh, it's *real*. Where should it be "
                             "planted? It's your find — you should choose.'",
                     "options": [
                         {"text": "Beside the Moonwell, for the Circle.",
                          "effects": [{"remove_item": "heartseed", "rep": ["circle", 20], "flag": "seed_moonwell"},
                                      {"complete_quest": "sq_sy_seed"}], "goto": "planted"},
                         {"text": "In the Lowbough, where everyone can see it grow.",
                          "effects": [{"remove_item": "heartseed", "flag": "seed_lowbough", "item": "potion_heal", "qty": 3},
                                      {"complete_quest": "sq_sy_seed"}], "goto": "planted"},
                         {"text": "Actually, a merchant would pay a fortune for this.",
                          "effects": [{"remove_item": "heartseed", "gold": 300, "rep": ["circle", -15], "flag": "seed_sold",
                                       "achievement": "capitalism"}, {"complete_quest": "sq_sy_seed"}], "goto": "sold"},
                     ]},
            "planted": {"text": "Wren sings the seed into the soil. Within the hour, a silver shoot breaks the surface. 'In "
                                "five hundred years, someone will stand in its shade and never know your name. Isn't that "
                                "wonderful?'", "options": [{"text": "It is."}]},
            "sold": {"text": "Wren stares at you. 'You... sold it.' She turns back to her saplings and does not speak to you again.",
                     "options": [{"text": "(Count your gold.)"}]},
            "waiting": {"text": "'Wisp Hollow, in the Thornwild. Please hurry.'", "options": [{"text": "I will."}]},
            "done": {"text": [{"if": {"flag": "seed_sold"}, "text": "Wren does not look up."},
                              {"if": {"not_flag": "seed_sold"}, "text": "'It's grown a whole finger's width! Come see!'"}],
                     "options": [{"text": "(Leave.)"}]},
        },
    },
    "warden_sorrel": {
        "name": "Warden Sorrel", "title": "Circle of the Heartroot",
        "markers": [{"if": {"quest": ["fq_sy_wisps", "not_started"], "level_gte": 2}, "marker": "!"}],
        "entry": [{"if": {"quest": ["fq_sy_wisps", "not_started"], "level_gte": 2}, "node": "start"},
                  {"if": {"stage": ["fq_sy_wisps", "return"]}, "node": "return"},
                  {"if": {"quest": ["fq_sy_wisps", "active"]}, "node": "waiting"},
                  {"node": "idle"}],
        "nodes": {
            "start": {"text": "A soft-spoken elf in Circle green. 'The feral spirits are not evil. They are sick. But a sick "
                              "wolf still bites. The Circle asks: lay six of the corrupted spirits to rest — wisps, shades, "
                              "whatever you find — and we will count you among our friends.'",
                      "options": [{"text": "I'll do it.", "effects": [{"start_quest": "fq_sy_wisps", "flag": "met_faction:circle"}]},
                                  {"text": "Not now."}]},
            "waiting": {"text": "'Every spirit you lay to rest is one less that suffers.'", "options": [{"text": "Understood."}]},
            "return": {"text": "Sorrel bows deeply. 'The Circle remembers kindness. Wear this — it was grown from the Moonwell's "
                               "own silver.'",
                       "options": [{"text": "Thank you.", "effects": [{"complete_quest": "fq_sy_wisps", "unique": "u_moonwell_circlet"}]}]},
            "idle": {"text": "'Walk softly, friend.'", "options": [{"text": "Farewell."}]},
        },
    },
    "lowbough_merchant": {
        "name": "Ysolde", "title": "Lowbough Trader",
        "entry": [{"node": "start"}],
        "nodes": {"start": {"text": "'Silverbark bows, moon-silk, tea that makes you remember your dreams. Browse!'",
                            "options": [{"text": "Show me.", "effects": [{"shop": "sy_market"}]}, {"text": "Later."}]}},
    },
}

QUESTS = {
    "mq_sy_intro": {
        "name": "The Withering Canopy", "type": "main", "native_region": "sylvara", "region": "Sylvara", "level": "1-4",
        "summary": "The Moonwell of Sylvara is dying and the forest's spirits have turned feral.",
        "start": "arrive",
        "stages": {
            "arrive": {"desc": "The Moonwell falters and the wisps attack!",
                       "objectives": [{"id": "fight", "text": "Fend off the feral wisps", "cond": {"flag": "sy_tutorial_done"}}],
                       "on_complete": [{"xp": 20}], "next": "ilyra"},
            "ilyra": {"desc": "Warden-Commander Ilyra wants to speak with you.",
                      "objectives": [{"id": "talk", "text": "Speak with Warden-Commander Ilyra", "cond": {"flag": "talked_ilyra_intro"}}],
                      "next": "investigate"},
            "investigate": {"desc": "Discover why the Moonwell is failing. Ilyra suggested studying the Moonwell, examining "
                                    "the Lowbough ley-stones, and questioning Loremaster Caelith.",
                            "objectives": [
                                {"id": "well", "text": "Study the Moonwell's flow (Heartroot Terrace)", "cond": {"flag": "sy_clue_well"}},
                                {"id": "stones", "text": "Examine the ley-stones (Lowbough Market)", "cond": {"flag": "sy_clue_stones"}},
                                {"id": "caelith", "text": "Question Loremaster Caelith (Highbough Archive)", "cond": {"flag": "sy_clue_caelith"}}],
                            "on_complete": [{"flag": "sy_thornwild_open", "xp": 50,
                                             "msg": "The ley-flow is being dragged east, into the Thornwild. The Rootgate path is open."}],
                            "next": "thornwild"},
            "thornwild": {"desc": "Follow the drained ley-line into the Thornwild and find where it's being tapped.",
                          "objectives": [{"id": "tap", "text": "Restore the ley-flow at the Tap Site", "cond": {"flag": "sy_ley_restored"}}],
                          "next": "rotbloom"},
            "rotbloom": {"desc": "The first spike corrupted a heart-oak into a Rotbloom. Destroy it at the Heart of Rot.",
                         "objectives": [{"id": "boss", "text": "Defeat the Rotbloom", "cond": {"flag": "sy_rotbloom_defeated"}}],
                         "next": [{"if": {"flag": "sy_letters_found"}, "goto": "confront"}, {"goto": "letters"}]},
            "letters": {"desc": "The Unbound tappers must have left something behind at the Tap Site.",
                        "objectives": [{"id": "letters", "text": "Search the Unbound supply crates at the Tap Site", "cond": {"flag": "sy_letters_found"}}],
                        "next": "confront"},
            "confront": {"desc": "The letters prove Loremaster Caelith aided the Unbound. Confront him in the Highbough Archive.",
                         "objectives": [{"id": "caelith", "text": "Confront Loremaster Caelith", "cond": {"flag": "sy_caelith_resolved"}}],
                         "next": "report"},
            "report": {"desc": "Report to Warden-Commander Ilyra on the Heartroot Terrace.",
                       "objectives": [{"id": "ilyra", "text": "Report to Ilyra", "cond": {"flag": "sy_intro_reported"}}],
                       "next": None},
        },
        "rewards": {"xp": 200, "gold": 60, "rep": {"circle": 15}},
        "on_complete": [{"flag": "sy_intro_done"},
                        {"if": NATIVE, "open_world": True, "start_quest": "mq_keystones"},
                        {"if": NATIVE, "msg": "The Rootgate is open to you. Keeper Thessaly wishes to speak with you before you go."}],
    },
    "mq_ks_sylvara": {
        "name": "The Weeping Barrow", "type": "main", "region": "Sylvara", "level": "5-9",
        "summary": "Thorn-Speaker Naerys stole the Heartseed Ring — the Sylvaran Keystone — and fled to the Weeping Barrow.",
        "start": "descend",
        "stages": {
            "descend": {"desc": "Travel south from the Rootgate to the Weeping Barrow and find a way to the Matriarch's Crypt.",
                        "objectives": [{"id": "door", "text": "Open the Lament Door", "cond": {"flag": "wb_door_open"}}],
                        "next": "crypt"},
            "crypt": {"desc": "Naerys is in the Matriarch's Crypt, binding the dead.",
                      "objectives": [{"id": "naerys", "text": "Stop Thorn-Speaker Naerys", "cond": {"flag": "naerys_defeated"}},
                                     {"id": "stone", "text": "Claim the Sylvaran Keystone", "cond": {"has_item": "keystone_sylvara"}}],
                      "next": None},
        },
        "rewards": {"xp": 400, "gold": 100, "rep": {"circle": 20}},
        "on_complete": [{"achievement": "first_keystone"}],
    },
    "sq_sy_poet": {
        "name": "Verses for Vaelith", "type": "side", "region": "Sylvara", "level": "1+",
        "summary": "Faelar the poet has loved the archer Vaelith for sixty years and has never said a word.",
        "start": "help",
        "stages": {
            "help": {"desc": "Help Faelar with his poem.", "objectives": [{"id": "help", "text": "Help Faelar", "cond": {"flag": "never"}}], "next": None},
            "deliver": {"desc": "Deliver Faelar's poem to Vaelith at the Rootgate. (It is very bad.)",
                        "objectives": [{"id": "deliver", "text": "Give the poem to Vaelith", "cond": {"flag": "poem_happy"}}], "next": None},
            "outcome": {"desc": "Check on Faelar and Vaelith at the Rootgate.",
                        "objectives": [{"id": "check", "text": "Visit Vaelith at the Rootgate", "cond": {"flag": "poem_happy"}}], "next": None},
        },
        "rewards": {"xp": 120},
    },
    "sq_sy_seed": {
        "name": "Seeds of Tomorrow", "type": "side", "region": "Sylvara", "level": "1+",
        "summary": "Gardener Wren believes a heartseed may have fallen in Wisp Hollow.",
        "start": "find",
        "stages": {"find": {"desc": "Find the heartseed in Wisp Hollow (Thornwild) and bring it to Wren in the Seed Nursery.",
                            "objectives": [{"id": "seed", "text": "Bring the heartseed to Wren", "cond": {"flag": "never"}}], "next": None}},
        "rewards": {"xp": 150},
    },
    "fq_sy_wisps": {
        "name": "Rest for the Restless", "type": "faction", "region": "Sylvara", "level": "2+",
        "summary": "The Circle of the Heartroot asks you to lay six corrupted spirits to rest.",
        "start": "hunt",
        "stages": {
            "hunt": {"desc": "Lay six corrupted spirits to rest (wisps, shades and other spirits).",
                     "objectives": [{"id": "spirits", "text": "Corrupted spirits laid to rest", "kill": "tag:spirit", "count": 6}],
                     "next": "return"},
            "return": {"desc": "Return to Warden Sorrel in the Highbough Archive.",
                       "objectives": [{"id": "sorrel", "text": "Return to Warden Sorrel", "cond": {"flag": "never"}}], "next": None},
        },
        "rewards": {"xp": 150, "rep": {"circle": 15}},
    },
    "hq_sy_whisper": {
        "name": "Whispers in the Bark", "type": "hidden", "region": "Mistvale", "level": "6+",
        "summary": "An ancient whisper spoke of 'the tower where the stars are counted.'",
        "start": "seek",
        "stages": {
            "seek": {"desc": "'The tower where the stars are counted... it remembers what the roots forgot.' Somewhere in the "
                             "Mistvale, south of Sylvara, a tower waits.",
                     "objectives": [{"id": "tower", "text": "Find the tower in the Mistvale", "cond": {"visited": "mv_tower"}}],
                     "next": "climb"},
            "climb": {"desc": "Climb the Whispering Tower.",
                      "objectives": [{"id": "top", "text": "Reach the top of the tower", "cond": {"flag": "tower_top"}}],
                      "next": None},
        },
        "rewards": {"xp": 300},
        "on_complete": [{"achievement": "stargazer"}],
    },
}

LORE = {
    "roots_drinking": {"title": "The Drinking of the Roots", "text":
        "'When the first Matriarch came to this place, the land was grey and silent. She planted a seed around a ring "
        "of light she found in the earth, and the Heartroot drank from it and grew, and the ley-lines woke. We have "
        "always said the ring was a gift. The oldest version of this text uses a different word. It is usually "
        "translated as \"gift\". It can also mean \"bandage\".'"},
    "matriarchs": {"title": "On the Matriarchs", "text":
        "The first Matriarchs of Sylvara are interred in the Weeping Barrow, each buried with the song she sang in "
        "life. It is said their spirits keep the ley-lines steady. It is forbidden to wake them."},
    "unbound_letter_sy": {"title": "Caelith's Correspondence", "text":
        "'Dearest C. — The spike will do no lasting harm; the well will recover in a century, which to you is a long "
        "weekend. We need the flow to locate the Heartseed Ring. Naerys will do the rest. You asked what the Aether "
        "really is. Come to the Vault and read the walls with me. You will never look at a Moonwell the same way. — I.M.'"},
    "caelith_map": {"title": "Caelith's Map", "text":
        "A map showing a relay point in the Mistvale and, far to the center of the realm, a blank region labeled in "
        "Ilvane's hand: 'The Scar — Vault entrance?'"},
    "song_stones": {"title": "Song-Stones of the Barrow", "text":
        "Each stone bears a funeral song. The oldest reads: 'We gave the light to the roots, and the roots held it "
        "fast; we do not know what it was holding, but we know it must not wake.'"},
    "naerys_words": {"title": "Naerys's Claim", "text":
        "'The Aether was MADE. Made to hold something. Ilvane has seen the walls of the Vault. We are all living "
        "inside a lock.'"},
}
