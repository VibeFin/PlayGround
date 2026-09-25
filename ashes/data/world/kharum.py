"""Kharum-Dûr — the Dwarven hold. Forges driven by bottled Aether, carved deep into the Anvil Mountains.

Intro arc (Dwarves: main quest; others: side quest): The Ninth Deep.
Keystone arc (everyone): The Hum Below.
"""

NATIVE = {"home": "kharum"}

LOCATIONS = {
    "kd_forgehall": {
        "name": "The Great Forgehall", "region": "kharum", "biome": "dwarf_hall",
        "desc": [
            {"text": "A cavern the size of a cathedral, carved from the living rock of the Anvil Mountains. Twelve great "
                     "anvils ring the Aether-furnace at its center: a column of caged blue fire that has burned for nine "
                     "hundred years. Hammers ring from every side. The air tastes of iron and soot and something sharper, "
                     "like the moment before lightning."},
            {"if": {"not_flag": "kd_intro_done"},
             "text": "Today the furnace flickers. Every few minutes the floor shudders, and dust sifts from the vaults high "
                     "above. The smiths keep hammering, because they are dwarves, but they glance at the ceiling between blows."},
            {"if": {"flag": "kd_intro_done"},
             "text": "The furnace burns steady again, and the tremors have stopped. The smiths sing while they work."},
        ],
        "npcs": [{"id": "foreman_durga"}],
        "features": [
            {"id": "twelve_anvils", "name": "The Twelve Anvils", "desc": "Each anvil is named for a founding clan.",
             "actions": [{"label": "Count the anvils", "once": True,
                          "text": "Twelve anvils. Twelve names carved in their bases. But there are thirteen plinths in the "
                                  "floor. The thirteenth is bare, polished smooth, and nobody will meet your eye when you ask.",
                          "effects": [{"flag": "saw_thirteenth_plinth", "xp": 10}]}]},
            {"id": "furnace", "name": "The Aether-Furnace", "desc": "Nine centuries of caged blue fire.",
             "actions": [{"label": "Warm your hands", "text": "It's pleasant. Unnervingly, it's pleasant in a way that feels "
                                                              "personal, as if the fire is glad you came.",
                          "effects": [{"counter": "warmed_hands"}]}]},
        ],
        "exits": [{"to": "kd_market", "label": "Stonecutter's Market"}, {"to": "kd_runehall", "label": "The Runehall"},
                  {"to": "kd_brewery", "label": "Olga's Brewery"}, {"to": "kd_gate", "label": "The Deepgate (hold exit)"}],
        "on_enter": [{"once": "intro", "if": NATIVE,
                      "text": "It's your first day as a sworn journeyman of the Forgehall. You barely have time to lift a "
                              "hammer before the floor heaves. Rock splits beside the furnace, and out of the crack pour "
                              "cave crawlers — dozens of legs, drill-bit jaws — driven up from somewhere deep.",
                      "effects": [{"start_quest": "mq_kd_intro"}]}],
        "encounter": {"id": "enc_kd_tutorial", "if": NATIVE},
    },
    "kd_market": {
        "name": "Stonecutter's Market", "region": "kharum", "biome": "dwarf_hall",
        "desc": "A long gallery of stalls cut into the rock, lit by Aether-lamps in iron cages. Smiths sell blades beside "
                "grocers selling mushroom bread. At the far end stands the Delvers' Guild counting-house, its door "
                "flanked by two very bored guards.",
        "npcs": [{"id": "guildmaster_borrin", "if": {"not_flag": "borrin_gone"}}, {"id": "smith_hilde"}, {"id": "captain_ruk"}],
        "shop": "kd_smithy",
        "features": [
            {"id": "guild_notices", "name": "Delvers' Guild Notices", "desc": "Contracts and warnings.",
             "actions": [{"label": "Read the notices", "text":
                          "'BY ORDER OF GUILDMASTER BORRIN: Excavation of the lower galleries is licensed to the MORROW "
                          "CONSORTIUM, surface contractors. Delvers are NOT to interfere.' Beneath it, someone has "
                          "scratched: 'Nine Deep sealed for a reason, you greedy old fool.'"}]},
        ],
        "exits": [{"to": "kd_forgehall", "label": "The Great Forgehall"}, {"to": "kd_galleries", "label": "The Lower Galleries"}],
        "discover_xp": 10,
    },
    "kd_runehall": {
        "name": "The Runehall", "region": "kharum", "biome": "dwarf_arcane",
        "desc": "A circular hall where runekeepers carve the wards that keep Kharum-Dûr's tunnels from collapsing and its "
                "furnaces from exploding. Thousands of rune-stones hang from chains, softly glowing — though many "
                "tonight have gone dark.",
        "npcs": [{"id": "runekeeper_halvar"}],
        "respec": True,
        "features": [
            {"id": "failing_runes", "name": "Dimming Rune-Stones", "desc": "Ward-stones, flickering.",
             "actions": [{"label": "Examine the dying runes", "if": {"stage": ["mq_kd_intro", "investigate"], "not_flag": "kd_clue_runes"},
                          "text": "The runes aren't failing on their own. Every dark stone was keyed to the deep galleries. "
                                  "Something down there is pulling the Aether out of the wards, the way a drain pulls water.",
                          "effects": [{"flag": "kd_clue_runes", "xp": 25}]}]},
            {"id": "old_inscription", "name": "A Worn Inscription", "hidden": 14,
             "desc": "Low on the wall, half-hidden by chains, an inscription in an archaic dialect.",
             "actions": [{"label": "Decipher the inscription", "once": True,
                          "text": "'The thirteenth hammer rests where the thirteenth anvil sleeps: in the foundry that was "
                                  "abandoned, beneath the fire that was forgotten.'",
                          "effects": [{"start_quest": "hq_kd_anvil"}]}]},
            {"id": "rune_books", "name": "Runekeepers' Records", "desc": "Heavy iron-bound ledgers.",
             "actions": [{"label": "Read 'The Sealing of the Ninth Deep'", "effects": [{"lore": "ninth_deep"}], "text": "An old record."},
                         {"label": "Read 'Of Tone and Stone'", "effects": [{"lore": "tone_and_stone"}], "text": "A treatise."}]},
        ],
        "exits": [{"to": "kd_forgehall", "label": "The Great Forgehall"}],
        "discover_xp": 10,
    },
    "kd_brewery": {
        "name": "Olga's Brewery", "region": "kharum", "biome": "dwarf_hall",
        "desc": "Copper vats the size of houses bubble contentedly. The smell could strip paint. A tavern corner offers "
                "stone benches, very large tankards, and beds in the back for those who can no longer find the door.",
        "npcs": [{"id": "brewmaster_olga"}],
        "rest": "inn", "shop": "kd_tavern",
        "features": [
            {"id": "stout_tap", "name": "The Ninefold Tap", "desc": "A tap for the house stout.",
             "actions": [{"label": "Drink a tankard (2 gold)", "if": {"gold_gte": 2},
                          "text": "It tastes like a mine collapse, in a good way.",
                          "effects": [{"gold": -2, "counter": "stouts"}]}]},
        ],
        "exits": [{"to": "kd_forgehall", "label": "The Great Forgehall"}],
        "discover_xp": 10,
    },
    "kd_galleries": {
        "name": "The Lower Galleries", "region": "kharum", "biome": "mine", "danger": "low",
        "desc": [{"text": "Old mine galleries, shored with iron beams. Rail-carts sit abandoned on their tracks. The deeper "
                          "you go, the stronger the tremors — and the warmer the rock."},
                 {"if": {"stage": ["mq_kd_intro", "investigate"]},
                  "text": "At the gallery's end, fresh rubble spills from a breach in a wall marked with old warning-runes."}],
        "features": [
            {"id": "breach", "name": "The Breach", "desc": "A tunnel blasted through a warded wall.",
             "actions": [{"label": "Examine the breach", "if": {"stage": ["mq_kd_intro", "investigate"], "not_flag": "kd_clue_breach"},
                          "text": "Blasting-charge scorch marks, surface-made. The warning runes on the wall read 'NINTH DEEP "
                                  "— SEALED BY ORDER OF THE THANES'. Someone blasted straight through them, and something "
                                  "deeper answered: the tremors come from below.",
                          "effects": [{"flag": "kd_clue_breach", "xp": 25}]}]},
            {"id": "cask_spot", "name": "A Suspicious Pile of Sacks", "hidden": 10,
             "if": {"quest": ["sq_kd_cask", "active"], "not_has_item": "lost_cask", "not_flag": "cask_found"},
             "desc": "Someone has hidden something under sacks. Something cask-shaped.",
             "actions": [{"label": "Uncover it", "text": "The legendary Ninefold Cask! Someone stashed it here to 'age'. Or to steal it.",
                          "effects": [{"item": "lost_cask", "flag": "cask_found"}]}]},
            {"id": "ore_vein", "name": "A Glittering Vein", "hidden": 12, "desc": "Raw runestone in the rock.",
             "actions": [{"label": "Pry out the runestone", "once": True, "text": "It comes free with a satisfying crack.",
                          "effects": [{"item": "rune_stone_raw"}, {"gold": 25}]}]},
        ],
        "exits": [{"to": "kd_market", "label": "Back to the market"},
                  {"to": "kd_nd_shaft", "label": "Through the breach, down into the Ninth Deep", "if": {"flag": "kd_deep_open"},
                   "locked": "The Guild guards won't let you near the breach without cause."}],
        "random": {"chance": 0.35, "table": ["enc_kd_crawlers", "enc_kd_diggers"]},
        "discover_xp": 15,
    },
    "kd_gate": {
        "name": "The Deepgate", "region": "kharum", "biome": "mountain", "travel": "kharum",
        "desc": [{"text": "The great bronze doors of Kharum-Dûr open onto a windswept mountain terrace. Switchback roads "
                          "descend toward the Iron Pass and, far below, the lowlands of the Emberfall Crossing."},
                 {"if": {"not_flag": "world_open"},
                  "text": "The doors are barred. 'The Thanes have sealed the hold until the tremors are explained,' a "
                          "guard says. (Complete your homeland's story to travel freely.)"}],
        "npcs": [{"id": "gate_warden_brokk"}],
        "exits": [{"to": "kd_forgehall", "label": "The Great Forgehall"},
                  {"to": "kd_hb_foundry", "label": "The old foundry road — to the Hum Below",
                   "if": {"quest": ["mq_ks_kharum", "active"]}, "show_if": {"quest": ["mq_ks_kharum", "started"]},
                   "locked": "The foundry road is collapsed and abandoned."}],
        "discover_xp": 10,
    },

    # ---------------- The Ninth Deep (intro dungeon) ----------------
    "kd_nd_shaft": {
        "name": "Ninth Deep: The Shaft", "region": "kharum", "biome": "mine_deep", "danger": "moderate",
        "desc": "A spiral shaft descends into the dark, cut by hands that weren't dwarven: the steps are too tall, the "
                "carvings too smooth. The walls are laced with veins of metal that hum faintly, a low note you feel in "
                "your teeth.",
        "exits": [{"to": "kd_galleries", "label": "Back up to the galleries"}, {"to": "kd_nd_camp", "label": "Down, toward lamplight"}],
        "encounter": {"id": "enc_kd_shaft"},
        "random": {"chance": 0.3, "table": ["enc_kd_crawlers"]},
        "discover_xp": 20,
    },
    "kd_nd_camp": {
        "name": "Ninth Deep: Excavators' Camp", "region": "kharum", "biome": "mine_deep", "danger": "moderate",
        "desc": [{"text": "The Consortium's dig camp: tents, crates of blasting charges, a cook-fire gone cold. A mural "
                          "covers the far wall, older than anything in Kharum-Dûr. It shows a mountain, a smith, and a "
                          "sky full of lines, each figure singing."}],
        "features": [
            {"id": "camp_mural", "name": "The Singing Mural", "desc": "Three figures: a mountain, a smith, the sky.",
             "actions": [{"label": "Study the mural", "text":
                          "An inscription beneath, in an ancient tonal script: 'First the mountain spoke, and the smith "
                          "answered; last of all, the sky.' Stone, then Iron, then Aether.",
                          "effects": [{"flag": "tone_hint", "lore": "singing_mural"}]}]},
            {"id": "foreman_tent", "name": "The Foreman's Tent", "desc": "A tent with a locked strongbox.",
             "actions": [{"label": "Search the tent", "once": True,
                          "text": "Among blasting schedules you find a dig ledger stamped with the sigil of the Morrow "
                                  "Consortium — and a tuning rod, humming with a clear note.",
                          "effects": [{"item": "unbound_letter_kd"}, {"item": "tone_rod"}, {"flag": "kd_papers_found"}]},
                         {"label": "[Strength] Force the strongbox", "once": True,
                          "check": {"stat": "str", "dc": 12, "retry": False,
                                    "pass": {"text": "The lid tears open: Consortium payroll.", "effects": [{"gold": 60}]},
                                    "fail": {"text": "The lid bends. So does your pride. The mechanism jams for good."}}},
                         {"label": "[Dexterity] Pick the strongbox lock", "once": True,
                          "check": {"stat": "dex", "dc": 12, "retry": False,
                                    "pass": {"text": "Click. Consortium payroll.", "effects": [{"gold": 60}]},
                                    "fail": {"text": "The pick snaps off in the lock."}}}]},
        ],
        "exits": [{"to": "kd_nd_shaft", "label": "Back up the shaft"}, {"to": "kd_nd_gate", "label": "Toward the humming"}],
        "encounter": {"id": "enc_kd_camp"},
        "discover_xp": 20,
    },
    "kd_nd_gate": {
        "name": "Ninth Deep: The Sealed Gate", "region": "kharum", "biome": "mine_deep", "danger": "high",
        "desc": [{"text": "A circular door of black metal, twenty feet across, set into the rock. Three bronze bells hang "
                          "before it, each engraved: a MOUNTAIN, an ANVIL, and a STAR. The door is scored with blast "
                          "marks. It did not open for the Consortium."},
                 {"if": {"flag": "kd_gate_open"}, "text": "The great door stands open, its tones still ringing faintly."}],
        "features": [
            {"id": "tone_bells", "name": "The Three Bells", "if": {"not_flag": "kd_gate_open"},
             "desc": "Strike the bells in the right order to open the door. A tone rod would ring them true.",
             "actions": [
                 {"label": "Strike: Mountain, Anvil, Star", "if": {"has_item": "tone_rod"},
                  "text": "Stone. Iron. Aether. The three notes braid into a chord, and the black door rolls aside with a "
                          "sigh of air that hasn't moved in a thousand years.",
                  "effects": [{"flag": "kd_gate_open", "xp": 80}]},
                 {"label": "Strike: Star, Anvil, Mountain", "if": {"has_item": "tone_rod"},
                  "text": "A discordant shriek. The veins in the walls flare, and something clicks awake in the dark.",
                  "effects": [{"combat": "enc_kd_bell_guard"}]},
                 {"label": "Strike: Anvil, Mountain, Star", "if": {"has_item": "tone_rod"},
                  "text": "The bells clang flatly. Dust falls. The door does not move, but it seems to be judging you.",
                  "effects": [{"damage_pct": 10}]},
                 {"label": "Strike the bells with your weapon", "if": {"not_has_item": "tone_rod"},
                  "text": "The notes come out muddy and wrong. You'll need something that rings true — the excavators "
                          "must have brought something."},
             ]},
        ],
        "exits": [{"to": "kd_nd_camp", "label": "Back to the camp"},
                  {"to": "kd_nd_chamber", "label": "Through the black door", "if": {"flag": "kd_gate_open"},
                   "locked": "The black door is sealed."}],
        "encounter": {"id": "enc_kd_gate"},
        "discover_xp": 20,
    },
    "kd_nd_chamber": {
        "name": "Ninth Deep: Chamber of the Sentinel", "region": "kharum", "biome": "vault_ancient", "danger": "boss",
        "desc": [{"text": "A domed chamber lined with the same humming veins, converging on an empty cradle of black "
                          "metal. Before it kneels a figure of iron plates and blue fire, three times a dwarf's height: "
                          "a Sentinel, waking."},
                 {"if": {"flag": "kd_sentinel_defeated"},
                  "text": "The Sentinel lies in pieces. The cradle it guarded is empty — its contents taken long before you "
                          "came. Fresh boot-prints lead to a side tunnel, recently dug."}],
        "features": [
            {"id": "sentinel_wreck", "name": "The Sentinel's Remains", "if": {"flag": "kd_sentinel_defeated"},
             "desc": "Plates of pre-dwarven armor and a still-ticking core.",
             "actions": [{"label": "Salvage the wreck", "once": True,
                          "text": "You pry loose what the old machine can spare.",
                          "effects": [{"if": {"cls": "mage"}, "unique": "u_sentinel_core"},
                                      {"if": {"not": {"cls": "mage"}}, "unique": "u_sentinel_aegis"}]}]},
            {"id": "empty_cradle", "name": "The Empty Cradle", "if": {"flag": "kd_sentinel_defeated"},
             "desc": "Shaped to hold a ring.",
             "actions": [{"label": "Examine the cradle", "once": True,
                          "text": "The cradle is shaped for a ring the size of a shield boss. Etched around it, tones instead "
                                  "of runes. Someone reached this chamber by a different tunnel and took it — without waking "
                                  "the Sentinel. Someone who knew exactly what they were doing.",
                          "effects": [{"flag": "saw_empty_cradle", "lore": "empty_cradle"}]}]},
        ],
        "exits": [{"to": "kd_nd_gate", "label": "Back to the Sealed Gate"}],
        "encounter": {"id": "enc_kd_sentinel"},
        "discover_xp": 20,
    },

    # ---------------- The Hum Below (keystone dungeon) ----------------
    "kd_hb_foundry": {
        "name": "Hum Below: The Abandoned Foundry", "region": "kharum", "biome": "foundry", "danger": "high",
        "desc": "Kharum-Dûr's first foundry, abandoned three centuries ago after a furnace disaster. It should be cold. "
                "It isn't. The furnaces roar again, fed by bundled Aether-cores, and the whole place thrums with a deep "
                "mechanical hum.",
        "features": [
            {"id": "forgotten_fire", "name": "A Cold Furnace", "hidden": 12,
             "desc": "One furnace, sealed with rubble, the only cold thing in the foundry. Beneath it, a thirteenth anvil.",
             "actions": [{"label": "Dig beneath the forgotten fire", "if": {"quest": ["hq_kd_anvil", "active"]}, "once": True,
                          "text": "Under the rubble, on an anvil scarred by a thousand strikes and blessed by no clan, lies a "
                                  "hammer. It is warm. It has been waiting.",
                          "effects": [{"unique": "u_thirteenth_hammer", "flag": "found_thirteenth_hammer"},
                                      {"complete_quest": "hq_kd_anvil"}]},
                         {"label": "Examine the anvil", "if": {"not": {"quest": ["hq_kd_anvil", "started"]}},
                          "text": "An anvil with no clan-mark. The rubble around it looks deliberately placed."}]},
        ],
        "exits": [{"to": "kd_gate", "label": "Back up the foundry road"}, {"to": "kd_hb_hall", "label": "Into the assembly hall"}],
        "encounter": {"id": "enc_hb_foundry"},
        "random": {"chance": 0.25, "table": ["enc_hb_drones"]},
        "discover_xp": 30,
    },
    "kd_hb_hall": {
        "name": "Hum Below: Assembly Hall", "region": "kharum", "biome": "foundry", "danger": "high",
        "desc": "Half-built war machines hang from chains: brass arms, iron legs, furnace-bellies. The Consortium "
                "wasn't just digging. They were building an army. Pressure valves hiss along the walls and a catwalk "
                "crosses above a pit of molten slag.",
        "features": [
            {"id": "pressure_valves", "name": "Pressure Valves", "desc": "A bank of valves controlling the heart-furnace below.",
             "actions": [
                 {"label": "[Intelligence] Bleed the pressure from the heart-furnace", "once": True,
                  "check": {"stat": "int", "dc": 13, "retry": False,
                            "pass": {"text": "You vent the pressure carefully. Far below, the great furnace coughs and "
                                             "sputters. Whatever it powers will run hot — and short.",
                                     "effects": [{"flag": "rig_weakened", "xp": 60}]},
                            "fail": {"text": "Steam scalds your hands. The valve sticks. You've made it worse, if anything.",
                                     "effects": [{"damage_pct": 15}]}}},
                 {"label": "[Strength] Wrench the master valve shut", "once": True,
                  "check": {"stat": "str", "dc": 14, "retry": False,
                            "pass": {"text": "Metal groans, then gives. The furnace's roar drops to a mutter.",
                                     "effects": [{"flag": "rig_weakened", "xp": 60}]},
                            "fail": {"text": "The valve doesn't budge. It is possible the valve is stronger than you."}}},
             ]},
            {"id": "hb_crates", "name": "Consortium Crates", "desc": "Supplies.",
             "actions": [{"label": "Loot the crates", "once": True, "text": "Tools, rations, and something useful.",
                          "effects": [{"loot": "chest"}, {"item": "elixir_ironhide"}]}]},
        ],
        "exits": [{"to": "kd_hb_foundry", "label": "Back to the foundry"}, {"to": "kd_hb_heart", "label": "Down to the heart-furnace"}],
        "encounter": {"id": "enc_hb_hall"},
        "discover_xp": 30,
    },
    "kd_hb_heart": {
        "name": "Hum Below: The Heart-Furnace", "region": "kharum", "biome": "foundry", "danger": "boss",
        "desc": [{"text": "At the bottom of the foundry, a furnace the size of a house blazes, and at its core, set like "
                          "a jewel, a ring of black metal etched with tones: the Kharum Keystone. Before it stands a war-rig "
                          "of iron and brass, twelve feet tall, piloted by a scarred dwarf with one mechanical arm."},
                 {"if": {"flag": "grast_defeated"},
                  "text": "The furnace has gone quiet. The Colossus Rig lies on its side, its heart cracked open."}],
        "exits": [{"to": "kd_hb_hall", "label": "Back to the assembly hall"},
                  {"to": "kd_gate", "label": "Take the freight lift up to the Deepgate", "if": {"flag": "grast_defeated"},
                   "locked": "Grast's rig blocks the lift."}],
        "encounter": {"id": "enc_hb_grast"},
        "discover_xp": 30,
    },
}

ENCOUNTERS = {
    "enc_kd_tutorial": {"title": "Crawlers in the Forgehall", "flee": False, "level": [1, 1],
                        "intro": "Cave crawlers boil out of the crack! Use Attack or your abilities. Watch your health, mana and stamina.",
                        "enemies": ["cave_crawler", "cave_crawler"], "on_victory": [{"flag": "kd_tutorial_done"}]},
    "enc_kd_crawlers": {"title": "Crawler Nest", "level": [1, 5], "enemies": ["cave_crawler", "cave_crawler", ["crawler_spitter", "back"]]},
    "enc_kd_diggers": {"title": "Consortium Diggers", "level": [1, 5], "enemies": ["unbound_excavator", ["excavator_blaster", "back"]]},
    "enc_kd_shaft": {"title": "The Shaft", "level": [1, 5],
                     "intro": "Crawlers nest in the shaft, and they're hungry.",
                     "enemies": ["cave_crawler", "cave_crawler", ["crawler_spitter", "back"]]},
    "enc_kd_camp": {"title": "The Excavators' Camp", "level": [2, 6],
                    "intro": "'Oi! Guild said no dwarves down here!' The excavators grab their picks.",
                    "enemies": ["unbound_excavator", "unbound_excavator", ["excavator_blaster", "back"]]},
    "enc_kd_gate": {"title": "The Gate Guardian", "level": [2, 6],
                    "intro": "A Rune Golem, part of the old defenses, grinds out of an alcove.",
                    "enemies": ["rune_golem", ["crawler_spitter", "back"]]},
    "enc_kd_bell_guard": {"title": "Discordant Tones", "level": [2, 6],
                          "enemies": ["rune_golem", "rune_golem"],
                          "on_victory": [{"msg": "The golems crumble. The bells hang silent, waiting for the right order."}]},
    "enc_kd_sentinel": {"title": "The Ironbound Sentinel", "boss": True, "level": [4, 7],
                        "intro": "'INTRUDER. THE CRADLE IS SEALED.' The Sentinel's Aegis Plating shrugs off most damage. "
                                 "(When it charges Core Blast, Defend or interrupt — afterwards it must vent its plating, "
                                 "and that's your window. It's weak to lightning.)",
                        "enemies": ["ironbound_sentinel"],
                        "on_victory": [{"flag": "kd_sentinel_defeated"}]},
    "enc_hb_drones": {"title": "Patrol Drones", "level": [5, 9], "enemies": ["clockwork_spider", ["forge_drone", "back"]]},
    "enc_hb_foundry": {"title": "The Foundry Floor", "level": [5, 9],
                       "intro": "Magma slugs slither out of the furnaces, followed by a clattering clockwork spider.",
                       "enemies": ["magma_slug", "clockwork_spider", ["forge_drone", "back"]]},
    "enc_hb_hall": {"title": "The Assembly Hall", "level": [5, 9],
                    "intro": "A renegade foreman bellows orders at his crew. 'Grast said no interruptions!'",
                    "enemies": ["unbound_foreman", "unbound_excavator", ["excavator_blaster", "back"]]},
    "enc_hb_grast": {"title": "Grast Ironhand", "boss": True, "level": [7, 10],
                     "intro": "'Twelve anvils,' Grast growls through the rig's speaking-horn. 'Twelve clans. And the Thanes "
                              "sealed the Deep because they were AFRAID of what we'd learn. Ilvane isn't afraid.' (Heat builds "
                              "as the rig stokes its furnace — at five stacks it will MELTDOWN. Frost damage vents heat!)",
                     "enemies": ["grast_rig"],
                     "on_victory": [{"flag": "grast_defeated", "item": "keystone_kharum", "unique": "u_rig_core"}],
                     "after_dialogue": "grast_defeated"},
}

SHOPS = {
    "kd_smithy": {"name": "Hilde's Smithy", "greeting": "'Steel. Good steel. Don't touch the red-hot bits.'",
                  "stock": ["potion_heal_minor", "potion_heal", "tonic_stamina", "antidote", "fire_flask"],
                  "random": 6, "bases": ["longsword", "axe", "mace", "greatsword", "greataxe", "warhammer", "shield",
                                         "heavy_chest", "heavy_head", "heavy_legs", "heavy_hands", "heavy_feet"],
                  "rep_stock": [{"faction": "deepwardens", "min": 10, "items": ["t2_warhammer", "t2_heavy_chest"], "rarity": "rare"},
                                {"faction": "deepwardens", "min": 25, "items": ["t3_greataxe", "t3_shield"], "rarity": "epic"}]},
    "kd_tavern": {"name": "Olga's Taproom", "greeting": "'Drink or leave. Or drink AND leave, I'm not fussy.'",
                  "stock": ["dwarven_stout", "potion_heal_minor", "potion_mana_minor", "elixir_ironhide", "tonic_stamina"],
                  "random": 0, "bases": []},
}

DIALOGUES = {
    "foreman_durga": {
        "name": "Foreman Durga", "title": "Forgehall Foreman",
        "markers": [{"if": {"stage": ["mq_kd_intro", "durga"]}, "marker": "!"},
                    {"if": {"stage": ["mq_kd_intro", "report"]}, "marker": "?"},
                    {"if": {"quest": ["mq_kd_intro", "not_started"], "flag": "world_open"}, "marker": "!"}],
        "entry": [
            {"if": {"stage": ["mq_kd_intro", "durga"]}, "node": "intro"},
            {"if": {"stage": ["mq_kd_intro", "report"]}, "node": "report"},
            {"if": {"quest": ["mq_kd_intro", "not_started"], "flag": "world_open"}, "node": "outsider"},
            {"if": {"quest": ["mq_kd_intro", "active"]}, "node": "progress"},
            {"node": "idle"},
        ],
        "nodes": {
            "intro": {"text": "A broad dwarf with a braided grey beard and a hammer she clearly uses for more than smithing "
                              "kicks a dead crawler aside. 'First day, and you're already killing things in my Forgehall. "
                              "Good. Crawlers don't come up from the deep galleries. Not ever. And the furnace is sick, "
                              "and the floor won't stop shaking.' She points her hammer at you. 'Find out why. I'm not "
                              "asking the Guild, because the Guild is the problem.'",
                      "options": [{"text": "Why is the Guild the problem?", "goto": "guild"},
                                  {"text": "Where do I start?", "goto": "start"}]},
            "guild": {"text": "'Guildmaster Borrin sold the lower galleries to some surface outfit. The Morrow Consortium. "
                              "Coin-counters with blasting powder. Since they started digging — this.' She gestures at the "
                              "cracked floor. 'Borrin won't talk to me. Might talk to you.'",
                      "options": [{"text": "Where do I start?", "goto": "start"}]},
            "start": {"text": "'Runekeeper Halvar says the wards are dimming — look at the runes yourself. Check the Lower "
                              "Galleries past the market; the tremors come from there. And lean on Borrin. He's hiding "
                              "something.'",
                      "effects": [{"flag": "talked_durga_intro"}],
                      "options": [{"text": "Consider it done."}]},
            "outsider": {"text": "Durga eyes you. 'A {race}. In the Forgehall. You'll want to mind your elbows, the anvils "
                                 "don't care who you are.' The floor shudders. 'We've tremors, a sick furnace, and a "
                                 "Guildmaster up to his beard in surface money. You look like you can swing something. Want work?'",
                         "options": [{"text": "I'll help. What's going on?",
                                      "effects": [{"start_quest": "mq_kd_intro"}, {"set_stage": ["mq_kd_intro", "investigate"]}],
                                      "goto": "guild"},
                                     {"text": "Not today."}]},
            "progress": {"text": [{"text": "'Well?'"},
                                  {"if": {"stage": ["mq_kd_intro", "investigate"]},
                                   "text": "'Runehall, Lower Galleries, Borrin. Get to it.'"},
                                  {"if": {"stage_in": ["mq_kd_intro", ["deep", "sentinel", "papers"]]},
                                   "text": "'The Ninth Deep.' She spits. 'Sealed for a thousand years. Mind yourself down there.'"},
                                  {"if": {"stage": ["mq_kd_intro", "confront"]},
                                   "text": "'Borrin's in the market, counting other people's money. Go have a word.'"}],
                         "options": [{"text": "On it."}]},
            "report": {"text": [{"text": "Durga listens, hammer resting on her shoulder. The furnace behind her burns steady "
                                         "for the first time in weeks. 'A Sentinel. In the Ninth Deep. And an empty cradle.' "
                                         "She's quiet a long moment."},
                                {"if": {"flag": "borrin_exposed"}, "text": "'Borrin's before the Thanes. Good. Let them sort him.'"},
                                {"if": {"flag": "borrin_blackmailed"}, "text": "'Borrin's been very generous lately. Suspiciously. I'll not ask.'"},
                                {"if": {"flag": "borrin_amends"}, "text": "'Borrin's paying to reseal the galleries out of his own vault. Never thought I'd see it.'"},
                                {"text": "'That ledger names a woman: Ilvane Morrow. And a Vault. Whatever was in that cradle, "
                                         "she wants it. Runekeeper Halvar will want to hear this. The Deepgate's open to you "
                                         "now — the Thanes owe you that much.'"}],
                       "effects": [{"flag": "kd_intro_reported"}],
                       "options": [{"text": "Thank you, Foreman."}]},
            "idle": {"text": "'Back to work. The anvils don't strike themselves. Well. One does. Don't ask.'",
                     "options": [{"text": "Any news?", "goto": "news"}, {"text": "Farewell."}]},
            "news": {"text": "'Miners say something big nests up at the Iron Pass — a crow that throws lightning. And bandits "
                             "in red caps have been hitting caravans near Emberfall.'",
                     "effects": [{"discover": "ironpass"}], "options": [{"text": "Thanks."}]},
        },
    },
    "runekeeper_halvar": {
        "name": "Runekeeper Halvar", "title": "Keeper of the Runehall",
        "markers": [{"if": {"quest": ["mq_ks_kharum", "not_started"], "flag": "world_open"}, "marker": "!"}],
        "entry": [
            {"if": {"quest": ["mq_ks_kharum", "not_started"], "flag": "world_open"}, "node": "keystone"},
            {"if": {"quest": ["mq_ks_kharum", "active"]}, "node": "progress"},
            {"if": {"stage": ["mq_kd_intro", "investigate"]}, "node": "hint"},
            {"node": "idle"},
        ],
        "nodes": {
            "hint": {"text": "An ancient dwarf with rune-tattooed hands squints at a dark stone. 'The deep-keyed wards are "
                             "draining. Look for yourself, if you like. And if you go below — the Ninth Deep's doors "
                             "answer to tone, not runes. Our ancestors didn't carve them. We only sealed them.'",
                     "options": [{"text": "Who carved them?", "goto": "who"}, {"text": "Thank you."}]},
            "who": {"text": "'The ones before. The Thanes' histories call them the Vaultwrights, when they call them "
                            "anything. Mostly they don't.'", "effects": [{"lore": "ninth_deep"}],
                    "options": [{"text": "I see."}]},
            "keystone": {"text": [{"text": "Halvar is waiting for you, a ledger open before him. 'The empty cradle. I've "
                                           "found it in the oldest records: the Tone-Ring, sealed in the Deep so no hand "
                                           "would wield it. It was taken by Grast Ironhand.'"},
                                  {"text": "'Grast was a Forgehall master. Brilliant. Bitter. Exiled for the Colossus "
                                           "experiments. The Consortium tunneled for him, and now he's in the old foundry — "
                                           "the Hum Below — building something with the Ring at its heart.'"}],
                         "options": [{"text": "I'll get the Ring back.", "effects": [{"start_quest": "mq_ks_kharum"}], "goto": "go"},
                                     {"text": "What does the Ring do?", "goto": "ring"}]},
            "ring": {"text": "'Honestly? The records say it doesn't DO anything. It HOLDS. The Vaultwrights made three, and "
                             "the Deep was built around ours like a vault around a key.' He closes the ledger. 'Or like a "
                             "tomb around a lock.'", "effects": [{"lore": "three_rings"}],
                     "options": [{"text": "I'll get it back.", "effects": [{"start_quest": "mq_ks_kharum"}], "goto": "go"}]},
            "go": {"text": "'Take the old foundry road from the Deepgate. It's been collapsed for centuries, but Grast's "
                           "people cleared it. And take frost-flasks if you have them. That foundry runs hot.'",
                   "options": [{"text": "Understood."}]},
            "progress": {"text": [{"text": "'The Hum Below lies down the foundry road from the Deepgate.'"},
                                  {"if": {"has_item": "keystone_kharum"},
                                   "text": "Halvar touches the Ring with trembling fingers. 'Three rings. One Vault. Take it where "
                                           "it needs to go, {name}. The mountain trusts you.'"}],
                         "options": [{"text": "I will."}]},
            "idle": {"text": "'Runes are just stubbornness written down. Remember that.'",
                     "options": [{"text": "Farewell."}]},
        },
    },
    "guildmaster_borrin": {
        "name": "Guildmaster Borrin", "title": "Master of the Delvers' Guild",
        "markers": [{"if": {"stage": ["mq_kd_intro", "investigate"], "not_flag": "kd_clue_borrin"}, "marker": "?"},
                    {"if": {"stage": ["mq_kd_intro", "confront"]}, "marker": "!"}],
        "entry": [
            {"if": {"stage": ["mq_kd_intro", "investigate"], "not_flag": "kd_clue_borrin"}, "node": "question"},
            {"if": {"stage": ["mq_kd_intro", "confront"]}, "node": "confront"},
            {"node": "idle"},
        ],
        "nodes": {
            "question": {"text": "A rotund dwarf in a fur-trimmed coat, rings on every finger, doesn't look up from his "
                                 "counting. 'The Consortium's dig is entirely legal and entirely profitable. The tremors are "
                                 "geological. Next.'",
                         "options": [
                             {"text": "[Intimidate] Slam your hand on his ledger.", "check": {"stat": "intimidate", "dc": 12, "pass": "cracked", "fail": "stonewall"}},
                             {"text": "[Perception] Read his ledger upside-down.", "check": {"stat": "perception", "dc": 12, "pass": "read", "fail": "stonewall"}},
                             {"text": "[Persuade] The Forgehall's in danger, Guildmaster.", "check": {"stat": "persuade", "dc": 13, "pass": "cracked", "fail": "stonewall"}},
                         ]},
            "cracked": {"text": "Borrin's jaw works. 'Fine! They asked to dig in the old galleries. Only the old galleries! "
                                "If they went further, that's not on my head.' He mops his brow. 'They paid in advance. In "
                                "gold. A LOT of gold.'",
                        "effects": [{"flag": "kd_clue_borrin", "xp": 40}], "options": [{"text": "We'll talk again."}]},
            "read": {"text": "Upside-down, his ledger shows a payment from the 'Morrow Consortium' for 'access — Ninth Deep "
                             "(unofficial)'. The number has a lot of zeroes. Borrin snaps the ledger shut.",
                     "effects": [{"flag": "kd_clue_borrin", "xp": 40}], "options": [{"text": "Interesting reading."}]},
            "stonewall": {"text": "'Geological!' Borrin says firmly, and waves at his guards. You're escorted out. On the way, "
                                  "one guard mutters: 'He's been sleeping in the counting-house. Won't go near the galleries. "
                                  "Make of that what you will.'",
                          "effects": [{"flag": "kd_clue_borrin", "xp": 15}], "options": [{"text": "(Leave.)"}]},
            "confront": {"text": "You drop the Consortium ledger on Borrin's desk. His face goes the color of old porridge. "
                                 "'They told me it was a survey. A SURVEY. I didn't know they'd blast the Ninth Deep. I "
                                 "didn't know about the Sentinel.' He looks at the ledger, then at you. 'What happens now?'",
                         "options": [
                             {"text": "Now you answer to the Thanes.", "goto": "expose"},
                             {"text": "Now you pay me to forget this.", "goto": "blackmail"},
                             {"text": "[Persuade] Now you make it right. With your own gold.",
                              "check": {"stat": "persuade", "dc": 13, "pass": "amends", "fail": "amends_fail"}},
                         ]},
            "expose": {"text": "The Thanes' guards come for Borrin at dawn. He goes quietly, which surprises everyone. The "
                               "Delvers' Guild elects a new master before lunch, which surprises nobody.",
                       "effects": [{"flag": ["borrin_exposed", "kd_borrin_resolved", "borrin_gone"], "rep": ["deepwardens", 15]}],
                       "options": [{"text": "(Justice.)"}]},
            "blackmail": {"text": "Borrin stares at you, then slowly counts out a heavy purse. 'You're a true dwarf, "
                                  "{name},' he says sourly. You're not sure it's a compliment.",
                          "effects": [{"flag": ["borrin_blackmailed", "kd_borrin_resolved"], "gold": 200, "rep": ["deepwardens", -10],
                                       "achievement": "creative_accounting"}],
                          "options": [{"text": "(Pocket the gold.)"}]},
            "amends": {"text": "Borrin sags. 'Right. Right. I'll pay to reseal the galleries. And compensate the Forgehall. "
                               "And... the families of the delvers hurt in the tremors.' He swallows. 'All of it. Out of my "
                               "own vault.' He presses a ring into your hand. 'That was my grandfather's. He'd be ashamed of "
                               "me. Maybe you can make him less so.'",
                       "effects": [{"flag": ["borrin_amends", "kd_borrin_resolved"], "rep": ["deepwardens", 10], "xp": 80,
                                    "unique": "u_ring_ninth_deep"}],
                       "options": [{"text": "Make it right, Borrin."}]},
            "amends_fail": {"text": "'Make it right? With MY gold?' He laughs, a little hysterically. You'll have to choose.",
                            "options": [{"text": "Then answer to the Thanes.", "goto": "expose"},
                                        {"text": "Then pay me instead.", "goto": "blackmail"}]},
            "idle": {"text": [{"if": {"flag": "borrin_amends"}, "text": "'Resealing's going well. Very expensive. Very, very expensive.'"},
                              {"if": {"not_flag": "borrin_amends"}, "text": "'The Guild is closed for business. To you specifically.'"}],
                     "options": [{"text": "(Leave.)"}]},
        },
    },
    "grast_defeated": {
        "name": "Grast Ironhand", "title": "Defeated",
        "entry": [{"node": "start"}],
        "nodes": {
            "start": {"text": "Grast drags himself from the wreckage, his mechanical arm sparking. 'Nine hundred years we've "
                              "burned the Aether in our forges and never once asked what it WAS.' He coughs soot. 'Ilvane "
                              "asked. She went to the Vault and read the walls. She came back and couldn't stop shaking. Go "
                              "on, then. Take your Ring. Put it back in its box. See if that helps.'",
                      "options": [
                          {"text": "You're coming back to face the Thanes.",
                           "effects": [{"flag": "grast_captured", "rep": ["deepwardens", 10]}], "goto": "captured"},
                          {"text": "Go. Leave the mountain.", "effects": [{"flag": "grast_spared"}], "goto": "spared"},
                          {"text": "What did she read on those walls?", "goto": "walls"},
                      ]},
            "walls": {"text": "'Names.' Grast's eyes are distant. 'She said the walls were covered in names. Millions. And "
                              "under every name, the same word, over and over. She wouldn't tell me what it meant.'",
                      "effects": [{"lore": "grast_words"}],
                      "options": [{"text": "You're coming back to face the Thanes.",
                                   "effects": [{"flag": "grast_captured", "rep": ["deepwardens", 10]}], "goto": "captured"},
                                  {"text": "Go. Leave the mountain.", "effects": [{"flag": "grast_spared"}], "goto": "spared"}]},
            "captured": {"text": "Grast doesn't resist. 'The Thanes. Hah. Tell them the Thirteenth Anvil says hello.'",
                         "options": [{"text": "(Take the Kharum Keystone.)"}]},
            "spared": {"text": "Grast limps into the dark tunnels. 'You'll understand,' he calls back. 'When you get there.'",
                       "options": [{"text": "(Take the Kharum Keystone.)"}]},
        },
    },
    "brewmaster_olga": {
        "name": "Brewmaster Olga", "title": "Proprietor, Olga's Brewery",
        "markers": [{"if": {"quest": ["sq_kd_cask", "not_started"]}, "marker": "!"},
                    {"if": {"quest": ["sq_kd_cask", "active"], "has_item": "lost_cask"}, "marker": "?"}],
        "entry": [{"if": {"quest": ["sq_kd_cask", "not_started"]}, "node": "start"},
                  {"if": {"quest": ["sq_kd_cask", "active"], "has_item": "lost_cask"}, "node": "have"},
                  {"if": {"quest": ["sq_kd_cask", "active"]}, "node": "waiting"},
                  {"node": "idle"}],
        "nodes": {
            "start": {"text": "A dwarf with forearms like hams and a voice like a rockslide. 'Someone's nicked my Ninefold "
                              "Cask! Nine generations of stout, aged in that barrel. Tapped once a century! And some "
                              "light-fingered GALLERY RAT has run off with it.' She glares at you as though you might be "
                              "the rat. 'Find it. I'll make it worth your while.'",
                      "options": [{"text": "I'll find your cask.", "effects": [{"start_quest": "sq_kd_cask"}]},
                                  {"text": "Not now."}]},
            "waiting": {"text": "'Try the Lower Galleries. Thieves love a dark corner. And search properly, mind — eyes open!'",
                        "options": [{"text": "Will do."}]},
            "have": {"text": "Olga's eyes fill with tears. 'My CASK.' She hugs it. Then she hugs you, which is like being "
                             "hugged by a landslide. 'I promised a reward. Coin, or... a single cup from the cask itself. "
                             "Only nine living dwarves have tasted it.'",
                     "options": [
                         {"text": "I'll take the coin.",
                          "effects": [{"remove_item": "lost_cask", "gold": 120}, {"complete_quest": "sq_kd_cask"}], "goto": "coin"},
                         {"text": "Pour me a cup.",
                          "effects": [{"remove_item": "lost_cask", "attr_point": 1, "achievement": "ninefold"},
                                      {"complete_quest": "sq_kd_cask"}], "goto": "drink"},
                     ]},
            "coin": {"text": "'Sensible. Boring, but sensible.' She counts it out.", "options": [{"text": "Cheers."}]},
            "drink": {"text": "It tastes of stone, and smoke, and nine hundred years of stubbornness. For a moment you can "
                              "hear your ancestors cheering. Or possibly that's your ears ringing. You feel permanently, "
                              "noticeably tougher. (+1 attribute point)",
                      "options": [{"text": "*hic*"}]},
            "idle": {"text": "'Drink or leave!'", "options": [{"text": "Show me what you've got.", "effects": [{"shop": "kd_tavern"}]},
                                                            {"text": "Leave."}]},
        },
    },
    "captain_ruk": {
        "name": "Captain Ruk", "title": "Deepwardens",
        "markers": [{"if": {"quest": ["fq_kd_deepwardens", "not_started"], "level_gte": 2}, "marker": "!"}],
        "entry": [{"if": {"quest": ["fq_kd_deepwardens", "not_started"], "level_gte": 2}, "node": "start"},
                  {"if": {"stage": ["fq_kd_deepwardens", "return"]}, "node": "return"},
                  {"if": {"quest": ["fq_kd_deepwardens", "active"]}, "node": "waiting"},
                  {"node": "idle"}],
        "nodes": {
            "start": {"text": "A one-eyed dwarf in battered plate. 'Deepwardens. We hold the tunnels so the rest of the "
                              "hold can sleep. Since those surface fools started blasting, the crawlers are breeding like "
                              "rabbits. Kill six. Prove you can hold a tunnel, and you'll have friends in the Deep.'",
                      "options": [{"text": "Six crawlers. Done.", "effects": [{"start_quest": "fq_kd_deepwardens", "flag": "met_faction:deepwardens"}]},
                                  {"text": "Not now."}]},
            "waiting": {"text": "'Galleries, shaft, anywhere dark. They're not hard to find. They find YOU.'",
                        "options": [{"text": "Right."}]},
            "return": {"text": "Ruk grunts, which from him is effusive. 'Good work. Here — Deepwarden issue. We don't give "
                               "these to surface folk. Or most dwarves.'",
                       "options": [{"text": "Thank you, Captain.",
                                    "effects": [{"complete_quest": "fq_kd_deepwardens", "unique": "u_deepdelver_boots"}]}]},
            "idle": {"text": "'Hold the line.'", "options": [{"text": "Farewell."}]},
        },
    },
    "smith_hilde": {
        "name": "Hilde", "title": "Smith",
        "entry": [{"node": "start"}],
        "nodes": {"start": {"text": "'Steel. Good steel. Buy some.'",
                            "options": [{"text": "Show me.", "effects": [{"shop": "kd_smithy"}]},
                                        {"text": "[Lore] Ask about the thirteenth plinth.", "if": {"flag": "saw_thirteenth_plinth"}, "once": "plinth",
                                         "goto": "plinth"},
                                        {"text": "Later."}]},
                  "plinth": {"text": "Hilde lowers her voice. 'There were thirteen clans once. The thirteenth forged something "
                                     "they shouldn't have, and the Thanes struck them from the records. The Runekeepers keep "
                                     "the old inscriptions, if you look close enough. Low, where nobody looks.'",
                             "effects": [{"xp": 15}],
                             "options": [{"text": "Thank you."}]}},
    },
    "gate_warden_brokk": {
        "name": "Gate-Warden Brokk", "title": "Keeper of the Deepgate",
        "entry": [{"if": {"flag": "world_open"}, "node": "open"}, {"node": "closed"}],
        "nodes": {
            "closed": {"text": "'Gate's sealed till the Thanes say otherwise. Nobody in, nobody out, nobody arguing with me.'",
                       "options": [{"text": "Fine."}]},
            "open": {"text": "'Road's open. Iron Pass north, Emberfall south. Mind the crows up the pass. One of 'em throws "
                             "lightning.'", "options": [{"text": "Thanks, Brokk."}]},
        },
    },
}

QUESTS = {
    "mq_kd_intro": {
        "name": "The Ninth Deep", "type": "main", "native_region": "kharum", "region": "Kharum-Dûr", "level": "1-4",
        "summary": "Tremors shake Kharum-Dûr, the Aether-furnace falters, and crawlers boil up from the deep.",
        "start": "arrive",
        "stages": {
            "arrive": {"desc": "Crawlers erupt into the Forgehall!",
                       "objectives": [{"id": "fight", "text": "Fight off the cave crawlers", "cond": {"flag": "kd_tutorial_done"}}],
                       "on_complete": [{"xp": 20}], "next": "durga"},
            "durga": {"desc": "Foreman Durga wants a word.",
                      "objectives": [{"id": "talk", "text": "Speak with Foreman Durga", "cond": {"flag": "talked_durga_intro"}}],
                      "next": "investigate"},
            "investigate": {"desc": "Find the cause of the tremors. Durga suggested examining the Runehall's failing wards, "
                                    "checking the Lower Galleries, and pressing Guildmaster Borrin.",
                            "objectives": [
                                {"id": "runes", "text": "Examine the dying runes (Runehall)", "cond": {"flag": "kd_clue_runes"}},
                                {"id": "breach", "text": "Investigate the Lower Galleries", "cond": {"flag": "kd_clue_breach"}},
                                {"id": "borrin", "text": "Question Guildmaster Borrin (Stonecutter's Market)", "cond": {"flag": "kd_clue_borrin"}}],
                            "on_complete": [{"flag": "kd_deep_open", "xp": 50,
                                             "msg": "The Consortium blasted into the sealed Ninth Deep. Durga has cleared you to go down after them."}],
                            "next": "deep"},
            "deep": {"desc": "Descend through the breach into the Ninth Deep and open the Sealed Gate.",
                     "objectives": [{"id": "gate", "text": "Open the Sealed Gate", "cond": {"flag": "kd_gate_open"}}],
                     "next": "sentinel"},
            "sentinel": {"desc": "Something guards the chamber beyond the Sealed Gate.",
                         "objectives": [{"id": "boss", "text": "Defeat the Ironbound Sentinel", "cond": {"flag": "kd_sentinel_defeated"}}],
                         "next": [{"if": {"flag": "kd_papers_found"}, "goto": "confront"}, {"goto": "papers"}]},
            "papers": {"desc": "Proof of the Consortium's deal must be somewhere in their camp.",
                       "objectives": [{"id": "papers", "text": "Search the Foreman's Tent at the Excavators' Camp", "cond": {"flag": "kd_papers_found"}}],
                       "next": "confront"},
            "confront": {"desc": "The Consortium ledger proves Borrin sold the Ninth Deep. Confront him in the Stonecutter's Market.",
                         "objectives": [{"id": "borrin", "text": "Confront Guildmaster Borrin", "cond": {"flag": "kd_borrin_resolved"}}],
                         "next": "report"},
            "report": {"desc": "Report to Foreman Durga in the Great Forgehall.",
                       "objectives": [{"id": "durga", "text": "Report to Durga", "cond": {"flag": "kd_intro_reported"}}],
                       "next": None},
        },
        "rewards": {"xp": 200, "gold": 60, "rep": {"deepwardens": 15}},
        "on_complete": [{"flag": "kd_intro_done"},
                        {"if": NATIVE, "open_world": True, "start_quest": "mq_keystones"},
                        {"if": NATIVE, "msg": "The Deepgate is open to you. Runekeeper Halvar wishes to speak with you before you go."}],
    },
    "mq_ks_kharum": {
        "name": "The Hum Below", "type": "main", "region": "Kharum-Dûr", "level": "5-9",
        "summary": "Grast Ironhand stole the Tone-Ring — the Kharum Keystone — and is using it to power a war machine.",
        "start": "descend",
        "stages": {
            "descend": {"desc": "Take the old foundry road from the Deepgate into the Hum Below and find Grast.",
                        "objectives": [{"id": "grast", "text": "Defeat Grast Ironhand", "cond": {"flag": "grast_defeated"}},
                                       {"id": "valves", "text": "(Optional) Sabotage the heart-furnace's pressure valves",
                                        "cond": {"flag": "rig_weakened"}, "optional": True},
                                       {"id": "stone", "text": "Claim the Kharum Keystone", "cond": {"has_item": "keystone_kharum"}}],
                        "next": None},
        },
        "rewards": {"xp": 400, "gold": 100, "rep": {"deepwardens": 20}},
        "on_complete": [{"achievement": "first_keystone"}],
    },
    "sq_kd_cask": {
        "name": "The Ninefold Cask", "type": "side", "region": "Kharum-Dûr", "level": "1+",
        "summary": "Brewmaster Olga's legendary cask has been stolen.",
        "start": "find",
        "stages": {"find": {"desc": "Search the Lower Galleries for the Ninefold Cask (search carefully!) and return it to Olga.",
                            "objectives": [{"id": "cask", "text": "Find the Ninefold Cask", "cond": {"has_item": "lost_cask"}},
                                           {"id": "return", "text": "Return it to Olga", "cond": {"flag": "never"}}],
                            "next": None}},
        "rewards": {"xp": 120},
    },
    "fq_kd_deepwardens": {
        "name": "Hold the Tunnels", "type": "faction", "region": "Kharum-Dûr", "level": "2+",
        "summary": "Captain Ruk of the Deepwardens wants six crawlers dead.",
        "start": "hunt",
        "stages": {
            "hunt": {"desc": "Kill six cave crawlers in the tunnels around Kharum-Dûr.",
                     "objectives": [{"id": "crawlers", "text": "Crawlers slain", "kill": "tag:crawler", "count": 6}],
                     "next": "return"},
            "return": {"desc": "Return to Captain Ruk in the Stonecutter's Market.",
                       "objectives": [{"id": "ruk", "text": "Return to Captain Ruk", "cond": {"flag": "never"}}], "next": None},
        },
        "rewards": {"xp": 150, "rep": {"deepwardens": 15}},
    },
    "hq_kd_anvil": {
        "name": "The Thirteenth Anvil", "type": "hidden", "region": "Kharum-Dûr", "level": "5+",
        "summary": "'The thirteenth hammer rests where the thirteenth anvil sleeps.'",
        "start": "seek",
        "stages": {"seek": {"desc": "'...in the foundry that was abandoned, beneath the fire that was forgotten.' Kharum-Dûr's "
                                    "abandoned foundry lies down the old foundry road — the Hum Below.",
                            "objectives": [{"id": "hammer", "text": "Find the Thirteenth Hammer", "cond": {"flag": "found_thirteenth_hammer"}}],
                            "next": None}},
        "rewards": {"xp": 300},
        "on_complete": [{"achievement": "thirteenth"}],
    },
}

LORE = {
    "ninth_deep": {"title": "The Sealing of the Ninth Deep", "text":
        "'In the ninth year of the Founding, delvers broke into halls not carved by dwarven hands. The walls sang. Three "
        "delvers went mad; one came back speaking a language of tones. By order of the Thanes, the Ninth Deep was "
        "sealed, its maps burned, its name struck from the songs. Let no dwarf open what the mountain has closed.'"},
    "tone_and_stone": {"title": "Of Tone and Stone", "text":
        "A treatise arguing that the oldest doors in Kharum-Dûr respond to sound rather than runes, and that 'the "
        "ancients sang their locks shut, in the order of creation: first the mountain, then the maker, last the sky.'"},
    "singing_mural": {"title": "The Singing Mural", "text":
        "'First the mountain spoke, and the smith answered; last of all, the sky.' Stone, Iron, Aether."},
    "unbound_letter_kd": {"title": "The Consortium Ledger", "text":
        "Payments to Guildmaster Borrin for 'survey access'. Blasting schedules. A final note in an elegant hand: "
        "'Grast has secured the Tone-Ring via the western tunnel. Leave the Sentinel sleeping. Seal the camp and "
        "withdraw. The Vault awaits. — I.M.'"},
    "empty_cradle": {"title": "The Empty Cradle", "text":
        "A cradle of black metal shaped for a ring the size of a shield boss, etched with tones instead of runes. Taken "
        "by someone who knew how not to wake the guardian."},
    "grast_words": {"title": "What Grast Said", "text":
        "'She said the walls were covered in names. Millions. And under every name, the same word, over and over.'"},
}
