"""Emberfall Crossing — the crossroads town at the heart of the realm, plus Millbrook and Redcap Hold.

Hosts the Convergence (mq_keystones), the Adventurers' Guild bounties and several side quests.
"""

LOCATIONS = {
    "ec_square": {
        "name": "Emberfall Crossing", "region": "emberfall", "biome": "town", "travel": "emberfall",
        "desc": [
            {"text": "Four great roads meet at Emberfall Crossing, and so does everyone who travels them. Human "
                     "caravans, elven couriers and dwarven freight-wagons crowd a square built around the Ember — a "
                     "shard of Aether-crystal the size of a house, fallen from the sky before anyone kept records, "
                     "still warm to the touch."},
            {"if": {"not_flag": "convergence_done"},
             "text": "The Ember pulses irregularly these days. The townsfolk have started pretending not to notice."},
            {"if": {"flag": "convergence_done", "not_flag": "act_two"},
             "text": "The Ember flickers, and every flicker seems to point east — toward the Ashen Scar."},
            {"if": {"flag": "act_two"},
             "text": "The Ember glows steadily now, but it is noticeably smaller than you remember."},
        ],
        "npcs": [{"id": "crier_pim"}, {"id": "ember_pilgrim"}],
        "features": [
            {"id": "the_ember", "name": "The Ember", "desc": "A fallen shard of Aether-crystal.",
             "actions": [{"label": "Touch the Ember", "once": True,
                          "text": "Warmth floods your hand — and for a heartbeat, you hear voices. Thousands of them, very "
                                  "far away, all speaking at once. Then nothing.",
                          "effects": [{"xp": 25, "flag": "touched_ember"}]},
                         {"label": "Toss a coin to the Ember (1 gold)", "if": {"gold_gte": 1},
                          "text": "The coin clinks against the crystal and falls in the offering-bowl. Somewhere, a priest "
                                  "is very slightly richer.",
                          "effects": [{"gold": -1, "counter": "ember_coins"}]}]},
        ],
        "exits": [{"to": "ec_lodestar", "label": "The Lodestar Inn"}, {"to": "ec_guild", "label": "Adventurers' Guild"},
                  {"to": "ec_market", "label": "The Crossing Market"}],
        "on_enter": [{"once": "arrive",
                      "text": "You step into Emberfall Crossing. After your homeland, the noise is astonishing: a hundred "
                              "voices, a dozen languages, and in the middle of it all, a fallen star.",
                      "effects": [{"achievement": "wider_world"}]}],
        "discover_xp": 25,
    },
    "ec_lodestar": {
        "name": "The Lodestar Inn", "region": "emberfall", "biome": "tavern",
        "desc": "The largest inn in the realm, three stories of oak and gossip built around a hearth wide enough to roast "
                "an ox. Travellers from every land share its long tables. In a quiet corner, beneath a tapestry of the "
                "four roads, a scholar in patched robes has surrounded himself with maps.",
        "npcs": [{"id": "sage_corvin"}, {"id": "innkeep_marta"}, {"id": "bard_linnet"}],
        "rest": "inn", "shop": "ec_inn",
        "exits": [{"to": "ec_square", "label": "Back to the square"}],
        "discover_xp": 10,
    },
    "ec_guild": {
        "name": "The Adventurers' Guild", "region": "emberfall", "biome": "guildhall",
        "desc": "A converted grain hall hung with trophies — antlers, tusks, a stuffed something with too many eyes. A "
                "bounty board dominates one wall. At the counter, a grizzled half-retired adventurer checks names in a "
                "book with the air of someone who has seen every kind of fool and expects more.",
        "npcs": [{"id": "guildmaster_varka"}],
        "respec": True,
        "features": [
            {"id": "bounty_board", "name": "Bounty Board", "desc": "Notices of dangerous beasts and wanted outlaws.",
             "actions": [
                 {"label": "Take the bounty: Old Gnasher (Greymarch Road)", "if": {"quest": ["bq_gnasher", "not_started"]},
                  "effects": [{"start_quest": "bq_gnasher", "discover": "greymarch", "flag": "met_faction:guild"}],
                  "text": "'WANTED: OLD GNASHER. Boar. Enormous. Has eaten three fences, a cart, and a tax collector. 150 gold.'"},
                 {"label": "Take the bounty: The Harvest Lord (Millbrook)", "if": {"quest": ["bq_harvest", "not_started"]},
                  "effects": [{"start_quest": "bq_harvest", "discover": "millbrook", "flag": "met_faction:guild"}],
                  "text": "'HELP WANTED — MILLBROOK. Our scarecrows are walking. Please. We are farmers. — Reeve Tolly.'"},
                 {"label": "Take the bounty: Mott, the Red Cap (Redcap Hold)", "if": {"quest": ["bq_redcap", "not_started"], "level_gte": 5},
                  "effects": [{"start_quest": "bq_redcap", "discover": "redcap", "flag": "met_faction:guild"}],
                  "text": "'WANTED: MOTT, WARLORD OF THE REDCAPS, for 31 caravan raids. 250 gold. Last seen: the old hillfort north of the Crossing.'"},
                 {"label": "Take the bounty: The Grey Widow (Mistvale)", "if": {"quest": ["bq_widow", "not_started"], "level_gte": 6},
                  "effects": [{"start_quest": "bq_widow", "discover": "mistvale", "flag": "met_faction:guild"}],
                  "text": "'WANTED: THE GREY WIDOW. Spider-queen of the Mistvale. Aether-bloated. 300 gold. Bring antivenom.'"},
                 {"label": "Take the bounty: The Stormcrow (Iron Pass)", "if": {"quest": ["bq_stormcrow", "not_started"], "level_gte": 7},
                  "effects": [{"start_quest": "bq_stormcrow", "discover": "ironpass", "flag": "met_faction:guild"}],
                  "text": "'WANTED: THE STORMCROW. Iron Pass. Throws lightning. Do NOT fight it in the rain. 350 gold.'"},
                 {"label": "Read the other notices",
                  "text": "'LOST: one (1) sense of wonder. Last seen in the Aether-trade. Reward: negotiable.' 'Adventurers "
                          "wanted for rat extermination, Valewatch, pay in cheese.' 'WHOEVER KEEPS STEALING THE BOUNTY "
                          "PINS: we know it's you, Derrick.'"},
             ]},
        ],
        "exits": [{"to": "ec_square", "label": "Back to the square"}],
        "discover_xp": 10,
    },
    "ec_market": {
        "name": "The Crossing Market", "region": "emberfall", "biome": "town",
        "desc": "Canvas awnings in every color shade stalls selling goods from all three homelands and beyond. A dwarven "
                "armorer argues prices with an elven fletcher while a human spice merchant sells to both.",
        "npcs": [{"id": "merchant_orsolo"}, {"id": "shady_figure", "if": {"not_flag": "shady_resolved"}}],
        "shop": "ec_emporium",
        "exits": [{"to": "ec_square", "label": "Back to the square"}],
        "discover_xp": 10,
    },

    # ---------------- Millbrook ----------------
    "mb_village": {
        "name": "Millbrook", "region": "millbrook", "biome": "village", "travel": "millbrook",
        "desc": [{"text": "A farming village of thatched cottages and a creaking watermill. The fields around it are "
                          "golden, overgrown, and full of scarecrows. Too many scarecrows. Some of them are closer than "
                          "they were a moment ago."},
                 {"if": {"flag": "harvest_lord_defeated"},
                  "text": "The scarecrows lie in the fields where they fell, just straw again. Farmers are cautiously "
                          "harvesting, with torches handy."}],
        "npcs": [{"id": "reeve_tolly"}],
        "rest": "inn",
        "exits": [{"to": "mb_fields", "label": "Out into the fields"}],
        "discover_xp": 20,
    },
    "mb_fields": {
        "name": "Millbrook: The Walking Fields", "region": "millbrook", "biome": "farmland", "danger": "moderate",
        "desc": "Wheat stands head-high and whispers without wind. The soil glitters faintly — Aether, leaking up from "
                "somewhere below, soaking into everything. Scarecrows turn their sackcloth heads to follow you.",
        "features": [
            {"id": "leak", "name": "A Glittering Sinkhole", "desc": "Aether seeps from a crack in the earth.",
             "actions": [{"label": "Examine the sinkhole", "once": True,
                          "text": "Below the soil lies old stonework — a buried conduit, carved with three interlocking "
                                  "rings. It's cracked, and Aether leaks from it like water from a broken pipe.",
                          "effects": [{"lore": "millbrook_conduit", "xp": 30}]}]},
        ],
        "exits": [{"to": "mb_village", "label": "Back to the village"}, {"to": "mb_barn", "label": "The great barn"}],
        "encounter": {"id": "enc_mb_fields"},
        "random": {"chance": 0.35, "table": ["enc_mb_scarecrows"]},
        "discover_xp": 20,
    },
    "mb_barn": {
        "name": "Millbrook: The Great Barn", "region": "millbrook", "biome": "farmland", "danger": "boss",
        "desc": [{"text": "The great barn's doors hang open. Inside, straw and wicker and bundled wheat have been woven "
                          "into a colossal figure — twenty feet tall, crowned with a scythe-blade, eyes burning with "
                          "Aether. The Harvest Lord."},
                 {"if": {"flag": "harvest_lord_defeated"}, "text": "The barn smells of smoke and straw. The Harvest Lord is ash."}],
        "exits": [{"to": "mb_fields", "label": "Back to the fields"}],
        "encounter": {"id": "enc_mb_harvest"},
        "discover_xp": 20,
    },

    # ---------------- Redcap Hold ----------------
    "rh_gate": {
        "name": "Redcap Hold: The Broken Gate", "region": "redcap", "biome": "hillfort", "travel": "redcap",
        "danger": "moderate",
        "desc": "An old hillfort on a bald hill north of the Crossing, its walls patched with stolen wagon-boards. Red "
                "rags flutter from spears along the ramparts. The gate hangs half off its hinges.",
        "exits": [{"to": "rh_yard", "label": "Through the gate"}],
        "encounter": {"id": "enc_rh_gate"},
        "discover_xp": 25,
    },
    "rh_yard": {
        "name": "Redcap Hold: The Yard", "region": "redcap", "biome": "hillfort", "danger": "high",
        "desc": "Stolen wagons, broken crates, and a cookfire made of someone's furniture. Plunder is piled everywhere: "
                "bolts of silk, crates of Conclave-stamped Aether-cores, and one very confused goat.",
        "features": [
            {"id": "plunder", "name": "Plunder Pile", "desc": "Stolen caravan goods.",
             "actions": [{"label": "Search the plunder", "once": True, "text": "Stolen goods. Finders keepers.",
                          "effects": [{"loot": "chest"}, {"gold": 40}]}]},
            {"id": "goat", "name": "A Confused Goat", "desc": "It is wearing a tiny red cap.",
             "actions": [{"label": "Free the goat", "once": True,
                          "text": "You untie the goat. It regards you with deep suspicion, eats your map's corner, and "
                                  "wanders off toward freedom. You feel you've done something good.",
                          "effects": [{"achievement": "goat_liberator", "xp": 10}]}]},
        ],
        "exits": [{"to": "rh_gate", "label": "Back to the gate"}, {"to": "rh_hall", "label": "The feasting hall"}],
        "encounter": {"id": "enc_rh_yard"},
        "discover_xp": 25,
    },
    "rh_hall": {
        "name": "Redcap Hold: Mott's Hall", "region": "redcap", "biome": "hillfort", "danger": "boss",
        "desc": [{"text": "A long feasting hall with a throne built of stolen wagon-wheels. On it sprawls Mott: huge, "
                          "scarred, wearing a cap dyed a deep, unsettling red."},
                 {"if": {"flag": "mott_defeated"}, "text": "The wagon-wheel throne is empty. Mott's ledger lies open on the table."}],
        "exits": [{"to": "rh_yard", "label": "Back to the yard"}],
        "encounter": {"id": "enc_rh_mott"},
        "discover_xp": 25,
    },
}

ENCOUNTERS = {
    "enc_mb_scarecrows": {"title": "Walking Scarecrows", "level": [4, 8], "enemies": ["scarecrow", "scarecrow", "scarecrow"]},
    "enc_mb_fields": {"title": "The Walking Fields", "level": [4, 8],
                      "intro": "The scarecrows stop pretending. Scythes rise from the wheat.",
                      "enemies": ["scarecrow", "scarecrow", "dire_wolf"]},
    "enc_mb_harvest": {"title": "The Harvest Lord", "boss": True, "level": [5, 9],
                       "intro": "The Harvest Lord unfolds to its full, creaking height. (It keeps raising scarecrows — "
                                "and all of them burn.)",
                       "enemies": ["harvest_lord", "scarecrow"],
                       "on_victory": [{"flag": "harvest_lord_defeated", "item": "scarecrow_heart"}]},
    "enc_rh_gate": {"title": "Redcap Sentries", "level": [5, 9],
                    "intro": "'Oi! We're closed! Permanently! For YOU!'",
                    "enemies": ["bandit_cutthroat", "bandit_cutthroat", ["bandit_archer", "back"]]},
    "enc_rh_yard": {"title": "The Yard", "level": [5, 9],
                    "intro": "A Redcap Brute cracks its knuckles. Several of them, actually.",
                    "enemies": ["redcap_brute", "bandit_cutthroat", ["bandit_archer", "back"]]},
    "enc_rh_mott": {"title": "Mott, the Red Cap", "boss": True, "level": [6, 10],
                    "intro": "'Thirty-one caravans,' Mott rumbles, standing. 'You'll make thirty-two.' (He calls "
                             "reinforcements when wounded and frenzies near death.)",
                    "enemies": ["redcap_mott", ["bandit_archer", "back"]],
                    "on_victory": [{"flag": "mott_defeated", "unique": "u_redcap", "item": "redcap_ledger"}]},
}

SHOPS = {
    "ec_inn": {"name": "Lodestar Larder", "greeting": "'Hot food, cold ale, and potions that mostly work!'",
               "stock": ["potion_heal", "potion_heal_greater", "potion_mana", "potion_mana_greater", "tonic_stamina",
                         "antidote", "dwarven_stout", "moonpetal_tea"],
               "random": 0, "bases": []},
    "ec_emporium": {"name": "Orsolo's Emporium", "greeting": "'Goods from every road! Prices from every century!'",
                    "stock": ["potion_heal", "potion_heal_greater", "potion_mana", "potion_mana_greater", "antidote",
                              "fire_flask", "frost_bomb", "smoke_bomb", "elixir_might", "elixir_ironhide", "aether_tincture"],
                    "random": 8, "quality": "shop_good",
                    "bases": ["longsword", "axe", "mace", "greatsword", "greataxe", "warhammer", "dagger", "rapier", "shortbow",
                              "longbow", "staff", "wand", "shield", "tome", "light_chest", "medium_chest", "heavy_chest",
                              "light_head", "medium_head", "heavy_head", "amulet", "ring"],
                    "rep_stock": [{"faction": "guild", "min": 10, "items": ["t3_longsword", "t3_longbow", "t3_wand"], "rarity": "rare"},
                                  {"faction": "guild", "min": 25, "items": ["t3_heavy_chest", "t3_medium_chest", "t3_light_chest"], "rarity": "epic"}]},
}

DIALOGUES = {
    "sage_corvin": {
        "name": "Corvin Ashby", "title": "Chronicler of the Crossing",
        "markers": [{"if": {"stage": ["mq_keystones", "emberfall"]}, "marker": "!"},
                    {"if": {"stage": ["mq_keystones", "convergence"]}, "marker": "?"}],
        "entry": [
            {"if": {"stage": ["mq_keystones", "emberfall"]}, "node": "meet"},
            {"if": {"stage": ["mq_keystones", "convergence"]}, "node": "convergence"},
            {"if": {"quest": ["mq_keystones", "active"]}, "node": "progress"},
            {"if": {"flag": "act_two"}, "node": "act_two"},
            {"if": {"quest": ["mq_vault", "active"]}, "node": "vault"},
            {"node": "idle"},
        ],
        "nodes": {
            "meet": {"text": "The scholar looks up from his maps, spectacles askew, and his eyes go straight to the weapon "
                             "at your side and the road-dust on your boots. 'Ah. You're the one from {home}. Word travels "
                             "fast at a crossroads.' He clears a chair. 'Sit, please. I think you and I have been "
                             "chasing the same shadow from opposite ends.'",
                     "options": [{"text": "Who are you?", "goto": "who"},
                                 {"text": "What shadow?", "goto": "shadow"}]},
            "who": {"text": "'Corvin Ashby. I chronicle the Aether — its moods, its failures. Thirty years ago a spell "
                            "failed once a season. Now it's weekly. Nobody wants to hear it, which is how you know it's "
                            "true.'", "options": [{"text": "What shadow?", "goto": "shadow"}]},
            "shadow": {"text": "He spreads three letters across the table. One from Valewatch, one from Sylvara, one from "
                               "Kharum-Dûr. All signed with a broken ring. 'The Unbound. Led by Ilvane Morrow, who was "
                               "High Artificer of the Conclave until they expelled her for heresy. In the same month, "
                               "she struck all three homelands — and in each, she went after an ancient ring.'",
                       "options": [{"text": "The Keystones.", "goto": "keystones"}]},
            "keystones": {"text": "'Keystones, yes. The Vaultwrights — the people who were here before any of us — made "
                                  "three and hid one in each land. Together, they open something. Ilvane calls it the "
                                  "Vault. She believes the Aether is a cage, and the Vault is where the lock is kept.' He "
                                  "taps each homeland on the map. 'The Conclave's Magister Oriel in Valewatch, Keeper "
                                  "Thessaly in Sylvara, Runekeeper Halvar in Kharum-Dûr. Each is trying to recover their "
                                  "keystone. Help them. Bring me all three rings before Ilvane gets them, and we'll find this "
                                  "Vault first.'",
                          "effects": [{"flag": "met_corvin", "lore": "corvin_keystones",
                                       "discover": ["valewatch", "sylvara", "kharum"]}],
                          "options": [{"text": "I'll find the Keystones."},
                                      {"text": "And if Ilvane is right about the Aether?", "goto": "right"}]},
            "right": {"text": "Corvin is quiet for a moment. 'Then I'd very much like to know before she does anything "
                              "about it. Wouldn't you?'", "options": [{"text": "Fair point."}]},
            "progress": {"text": [{"text": "'Any luck with the Keystones?'"},
                                  {"if": {"not_has_item": "keystone_valewatch"}, "text": "'Magister Oriel is at the Conclave Spire in Valewatch's Guild Row.'"},
                                  {"if": {"not_has_item": "keystone_sylvara"}, "text": "'Keeper Thessaly tends the Moonwell on Sylvara's Heartroot Terrace.'"},
                                  {"if": {"not_has_item": "keystone_kharum"}, "text": "'Runekeeper Halvar keeps the Runehall in Kharum-Dûr.'"}],
                         "options": [{"text": "I'm working on it."}]},
            "convergence": {"text": "You set the three Keystones on the table: blue stone, living wood, black metal. They "
                                    "hum, together, a chord that makes the candle flames lean toward them. Corvin stares. "
                                    "Around the inn, conversations stop. 'Look,' he whispers, and holds up a map. The "
                                    "rings' light falls across it in three beams that meet at a single point, far to the "
                                    "east. 'The Ashen Scar.'",
                            "options": [{"text": "What's there?", "goto": "scar"}]},
            "scar": {"text": "'Nothing grows there. Nothing has for a thousand years. The ground is grey ash, miles of it, "
                             "and legend says it's where the Aether first poured into the world.' He looks up. 'Ilvane "
                             "will know where you are the moment you step onto that ash. She's been waiting for someone "
                             "to gather the rings for her. You'll be walking into her hands.'",
                     "options": [{"text": "Then I'll walk in ready.", "goto": "go"},
                                 {"text": "Why not just destroy the rings?", "goto": "destroy"}]},
            "destroy": {"text": "'Believe me, I've considered it. But the Aether is failing either way. If the Vault holds "
                                "the answer, I want someone at that door who isn't Ilvane Morrow.'",
                        "options": [{"text": "Then I'll go.", "goto": "go"}]},
            "go": {"text": "Corvin grips your hand. 'The Scar is east, past the Crossing. Rest first. Buy potions. And, "
                           "{name} — whatever you find in there, write it down. Someone should remember.'",
                   "effects": [{"flag": "convergence_done", "discover": "ashen_scar"}],
                   "options": [{"text": "I'll remember."}]},
            "vault": {"text": "'The Ashen Scar lies east. Be careful. And bring back something I can write down.'",
                      "options": [{"text": "I will."}]},
            "act_two": {"text": "Corvin has filled three new notebooks. 'The Vaultwrights. The Unmade. The ash.' He looks "
                                "older. 'I've been chronicling the Aether for thirty years and I never once asked where it "
                                "came from. There's more down there, isn't there? More vaults.' He smiles thinly. 'I'll "
                                "need someone to go and look.'",
                        "options": [{"text": "When you're ready."}]},
            "idle": {"text": "'Maps, maps, maps. The world keeps changing shape on me.'", "options": [{"text": "Farewell."}]},
        },
    },
    "guildmaster_varka": {
        "name": "Guildmaster Varka", "title": "Adventurers' Guild",
        "markers": [{"if": {"any": [{"stage": ["bq_gnasher", "return"]}, {"stage": ["bq_harvest", "return"]},
                                    {"stage": ["bq_redcap", "return"]}, {"stage": ["bq_widow", "return"]},
                                    {"stage": ["bq_stormcrow", "return"]}]}, "marker": "?"}],
        "entry": [{"node": "start"}],
        "nodes": {
            "start": {"text": [{"text": "A weathered woman with a prosthetic leg of carved oak looks you over. 'Another "
                                        "hero. Board's on the wall. Bring proof, get paid. Die, and we'll put your name on "
                                        "the plaque.' She nods at a very long plaque."},
                               {"if": {"rep_gte": ["guild", 25]}, "text": "'You're one of the good ones. Don't let it go to your head.'"}],
                      "options": [
                          {"text": "I've dealt with Old Gnasher.", "if": {"stage": ["bq_gnasher", "return"]},
                           "effects": [{"complete_quest": "bq_gnasher"}], "goto": "paid"},
                          {"text": "Millbrook's scarecrows are straw again.", "if": {"stage": ["bq_harvest", "return"]},
                           "effects": [{"complete_quest": "bq_harvest"}], "goto": "paid"},
                          {"text": "Mott won't be raiding anyone.", "if": {"stage": ["bq_redcap", "return"]},
                           "effects": [{"complete_quest": "bq_redcap"}], "goto": "paid_redcap"},
                          {"text": "The Grey Widow is dead.", "if": {"stage": ["bq_widow", "return"]},
                           "effects": [{"complete_quest": "bq_widow"}], "goto": "paid"},
                          {"text": "The Stormcrow is grounded.", "if": {"stage": ["bq_stormcrow", "return"]},
                           "effects": [{"complete_quest": "bq_stormcrow"}], "goto": "paid"},
                          {"text": "Tell me about yourself.", "goto": "about", "once": "about"},
                          {"text": "Farewell."},
                      ]},
            "paid": {"text": "Varka checks your trophy, grunts, and counts out coin. 'Clean work. The Guild remembers.'",
                     "effects": [{"counter": "bounties"}],
                     "options": [{"text": "Anything else?", "goto": "start"}, {"text": "Farewell."}]},
            "paid_redcap": {"text": "Varka reads Mott's ledger and her face hardens. 'These payments... the Morrow "
                                    "Consortium paid the Redcaps to hit Conclave caravans. Aether-core shipments. Your "
                                    "Ilvane's been stockpiling.' She pockets the ledger. 'Thank you. Truly.'",
                            "effects": [{"counter": "bounties", "remove_item": "redcap_ledger", "lore": "redcap_ledger"}],
                            "options": [{"text": "Anything else?", "goto": "start"}, {"text": "Farewell."}]},
            "about": {"text": "'Thirty years on the roads. Lost the leg to a wyvern, the eye to a card game, and my husband "
                              "to a very charming sorceress, who I'm told is very happy.' She shrugs. 'Now I run the "
                              "Guild. Pays better, fewer wyverns.'", "options": [{"text": "Ha. Anything else?", "goto": "start"}]},
        },
    },
    "crier_pim": {
        "name": "Pim the Crier", "title": "Town Crier",
        "entry": [{"node": "start"}],
        "nodes": {
            "start": {"text": [{"text": "A boy with an enormous voice and a slightly smaller hat. 'HEAR YE! HEAR YE! News "
                                        "from all four roads, a copper a rumor, first one free!'"}],
                      "options": [
                          {"text": "What's the news?", "goto": "news"},
                          {"text": "Anything strange lately?", "goto": "strange"},
                          {"text": "Goodbye."}]},
            "news": {"text": [{"if": {"not_flag": "convergence_done"},
                               "text": "'Trouble in all three homelands at once! Valewatch lamps went dark, Sylvara's forest "
                                       "went feral, Kharum-Dûr's mountain SHOOK! Coincidence? The Crier thinks NOT!'"},
                              {"if": {"flag": "convergence_done", "not_flag": "act_two"},
                               "text": "'Strange lights over the Ashen Scar! Pilgrims say the ash is MOVING!'"},
                              {"if": {"flag": "act_two"},
                               "text": "'HEAR YE! Spells are working again! Mostly! The Conclave says everything is FINE! "
                                       "The Crier notes they said that last time!'"}],
                     "options": [{"text": "Anything else?", "goto": "start"}]},
            "strange": {"text": "'Scarecrows walking in Millbrook, half a day west! Bandits in red caps up at the old "
                                "hillfort! And an old chapel on the Greymarch Road that rings its bell though it sank into "
                                "the marsh a hundred years ago!'",
                        "effects": [{"discover": ["millbrook", "greymarch"]}],
                        "options": [{"text": "Thanks, Pim.", "goto": "start"}]},
        },
    },
    "ember_pilgrim": {
        "name": "Sister Halwen", "title": "Pilgrim of the Ember",
        "entry": [{"node": "start"}],
        "nodes": {
            "start": {"text": "An elderly pilgrim in ash-grey robes sits by the Ember. 'The Ember is a piece of the sky "
                              "that fell to warm us. Or so we say.' She smiles. 'My order's oldest prayer is not a prayer "
                              "of thanks. It is an apology. None of us remember what for.'",
                      "effects": [{"lore": "ember_prayer"}],
                      "options": [{"text": "An apology?", "goto": "apology"}, {"text": "Farewell."}]},
            "apology": {"text": "'\"Forgive us the light we borrow; forgive us the warmth we spend; forgive us, who were "
                                "given the ash, and called it a gift.\"' She shrugs. 'Pilgrims. We like to be gloomy.'",
                        "options": [{"text": "(Leave.)"}]},
        },
    },
    "innkeep_marta": {
        "name": "Marta", "title": "Innkeeper of the Lodestar",
        "entry": [{"node": "start"}],
        "nodes": {"start": {"text": "'Welcome to the Lodestar! Bed, bath, or beer?'",
                            "options": [{"text": "Show me what you sell.", "effects": [{"shop": "ec_inn"}]},
                                        {"text": "Heard any gossip?", "goto": "gossip"},
                                        {"text": "Nothing, thanks."}]},
                  "gossip": {"text": "'Linnet the bard's been trying to finish a ballad about \"the hero of the Crossing\" "
                                     "for a month. Might be you, if you give her material. And don't drink with dwarves. "
                                     "That's just general advice.'", "options": [{"text": "Noted."}]}},
    },
    "bard_linnet": {
        "name": "Linnet", "title": "Bard",
        "entry": [{"if": {"flag": "act_two"}, "node": "act_two"}, {"if": {"level_gte": 8}, "node": "famous"}, {"node": "start"}],
        "nodes": {
            "start": {"text": "A bard with a lute and a quill behind each ear. 'Stories! I need stories! Do something "
                              "heroic nearby, would you?'",
                      "options": [{"text": "[Charisma] Tell her of your deeds.", "once": "tale",
                                   "check": {"stat": "cha", "dc": 11, "pass": "tale_good", "fail": "tale_bad"}},
                                  {"text": "Maybe later."}]},
            "tale_good": {"text": "Linnet scribbles furiously. 'Oh, that's GOOD. I'm rhyming \"{name}\" with... hm. I'll "
                                  "work on it.' She tosses you a coin. 'Royalties.'",
                          "effects": [{"gold": 10, "xp": 20, "flag": "linnet_tale"}], "options": [{"text": "Glad to help."}]},
            "tale_bad": {"text": "Linnet listens politely. 'That's... a lot of detail about inventory management.' She "
                                 "does not write anything down.", "options": [{"text": "(Leave, dignity intact-ish.)"}]},
            "famous": {"text": "'It's YOU! I've written six verses about you! Want to hear them?'",
                       "options": [{"text": "Absolutely.", "goto": "verses"}, {"text": "Absolutely not."}]},
            "verses": {"text": "'\"From {home} came a {race} bold, with {class}ly arts and nerves of gold...\"' It goes on. "
                               "It's not bad. The rhyme for your name is a crime against language.",
                       "effects": [{"achievement": "legend_in_verse"}], "options": [{"text": "Beautiful."}]},
            "act_two": {"text": "'I'm calling it \"The Ashes of Aether\". Too gloomy? It's a working title.'",
                        "effects": [{"achievement": "legend_in_verse"}], "options": [{"text": "It's perfect."}]},
        },
    },
    "merchant_orsolo": {
        "name": "Orsolo", "title": "Merchant Prince (Self-Appointed)",
        "entry": [{"node": "start"}],
        "nodes": {"start": {"text": "'Welcome, welcome! Everything is for sale! Except the goat. Long story.'",
                            "options": [{"text": "Let me browse.", "effects": [{"shop": "ec_emporium"}]}, {"text": "Later."}]}},
    },
    "shady_figure": {
        "name": "A Hooded Stranger", "title": "",
        "entry": [{"node": "start"}],
        "nodes": {
            "start": {"text": "A hooded figure beckons from between two stalls. 'Psst. You look like someone who wants "
                              "something special. A genuine Aether-charged amulet, only 150 gold. Guaranteed to work. "
                              "Usually.'",
                      "options": [
                          {"text": "Deal. (150 gold)", "if": {"gold_gte": 150}, "goto": "buy",
                           "effects": [{"gold": -150}]},
                          {"text": "[Perception] Look closer at the amulet.", "check": {"stat": "perception", "dc": 13, "pass": "fake", "fail": "no"}},
                          {"text": "No thanks."}]},
            "buy": {"text": "The stranger hands you the amulet and vanishes into the crowd. The amulet's 'Aether-charge' "
                            "is a painted glass bead. The chain turns your neck green.",
                    "effects": [{"flag": "shady_resolved", "achievement": "sucker", "random_item": {"quality": "trash", "base": "amulet", "rarity": "common"}}],
                    "options": [{"text": "(Sigh.)"}]},
            "fake": {"text": "The 'Aether-charge' is a painted bead. You raise an eyebrow; the stranger raises both hands. "
                             "'All right, all right! Here, take this for your silence. It's real, I swear.'",
                     "effects": [{"flag": "shady_resolved", "random_item": {"quality": "chest", "base": "ring"}}],
                     "options": [{"text": "Scram."}]},
            "no": {"text": "'Your loss, friend.' The stranger melts into the crowd.", "options": [{"text": "(Leave.)"}]},
        },
    },
    "reeve_tolly": {
        "name": "Reeve Tolly", "title": "Reeve of Millbrook",
        "markers": [{"if": {"quest": ["bq_harvest", "not_started"]}, "marker": "!"}],
        "entry": [{"if": {"flag": "harvest_lord_defeated"}, "node": "done"}, {"node": "start"}],
        "nodes": {
            "start": {"text": "A stout man clutching a pitchfork like a lifeline. 'You're from the Guild? Oh, thank the "
                              "harvest. The scarecrows. They WALK. It started when the soil began glittering. There's a "
                              "big one in the great barn. It... organizes them.'",
                      "effects": [{"start_quest": "bq_harvest", "flag": "met_faction:guild"}],
                      "options": [{"text": "I'll deal with it."}]},
            "done": {"text": "'You burned it! The Harvest Lord! Here — we've little coin, but have my best pie. And "
                             "my gratitude. And another pie.'",
                     "options": [{"text": "Thank you, Reeve.", "once": "pie", "effects": [{"item": "potion_heal", "qty": 2}, {"xp": 40}]},
                                 {"text": "(Leave.)"}]},
        },
    },
}

QUESTS = {
    "mq_keystones": {
        "name": "Threads of the Aether", "type": "main", "region": "The Realm", "level": "4-10",
        "summary": "The Unbound struck all three homelands at once. At Emberfall Crossing, the threads come together.",
        "start": "emberfall",
        "stages": {
            "emberfall": {"desc": "The attacks on the homelands were connected. Travel to Emberfall Crossing — the "
                                  "crossroads of the realm — and seek out the chronicler Corvin Ashby at the Lodestar Inn.",
                          "objectives": [{"id": "corvin", "text": "Meet Corvin Ashby at the Lodestar Inn, Emberfall Crossing",
                                          "cond": {"flag": "met_corvin"}}],
                          "next": "gather"},
            "gather": {"desc": "Ilvane Morrow's Unbound hunt three ancient Keystones, one in each homeland. Help Magister "
                               "Oriel (Valewatch), Keeper Thessaly (Sylvara) and Runekeeper Halvar (Kharum-Dûr) recover "
                               "them, then bring all three to Corvin.",
                       "objectives": [{"id": "vw", "text": "Recover the Valewatch Keystone", "cond": {"has_item": "keystone_valewatch"}},
                                      {"id": "sy", "text": "Recover the Sylvaran Keystone", "cond": {"has_item": "keystone_sylvara"}},
                                      {"id": "kd", "text": "Recover the Kharum Keystone", "cond": {"has_item": "keystone_kharum"}}],
                       "on_complete": [{"msg": "All three Keystones hum together in your pack. Corvin will want to see this."}],
                       "next": "convergence"},
            "convergence": {"desc": "Bring the three Keystones to Corvin Ashby at the Lodestar Inn.",
                            "objectives": [{"id": "corvin", "text": "Show the Keystones to Corvin", "cond": {"flag": "convergence_done"}}],
                            "next": None},
        },
        "rewards": {"xp": 500, "gold": 150},
        "on_complete": [{"start_quest": "mq_vault", "achievement": "convergence"}],
    },
    "bq_gnasher": {
        "name": "Bounty: Old Gnasher", "type": "faction", "region": "Greymarch Road", "level": "5+",
        "summary": "A boar the size of a hay cart terrorizes the Greymarch Road.",
        "start": "hunt",
        "stages": {"hunt": {"desc": "Hunt Old Gnasher in the Gnasher's Wallow off the Greymarch Road.",
                            "objectives": [{"id": "kill", "text": "Slay Old Gnasher", "kill": "old_gnasher"}], "next": "return"},
                   "return": {"desc": "Return to Guildmaster Varka in Emberfall Crossing for payment.",
                              "objectives": [{"id": "ret", "text": "Collect the bounty from Varka", "cond": {"flag": "never"}}], "next": None}},
        "rewards": {"xp": 200, "gold": 150, "rep": {"guild": 10}},
    },
    "bq_harvest": {
        "name": "Bounty: The Harvest Lord", "type": "faction", "region": "Millbrook", "level": "5+",
        "summary": "Millbrook's scarecrows walk, led by something in the great barn.",
        "start": "hunt",
        "stages": {"hunt": {"desc": "Travel to Millbrook and destroy the Harvest Lord in the great barn.",
                            "objectives": [{"id": "kill", "text": "Destroy the Harvest Lord", "kill": "harvest_lord"}], "next": "return"},
                   "return": {"desc": "Return to Guildmaster Varka in Emberfall Crossing for payment.",
                              "objectives": [{"id": "ret", "text": "Collect the bounty from Varka", "cond": {"flag": "never"}}], "next": None}},
        "rewards": {"xp": 200, "gold": 120, "rep": {"guild": 10}},
    },
    "bq_redcap": {
        "name": "Bounty: Mott, the Red Cap", "type": "faction", "region": "Redcap Hold", "level": "6+",
        "summary": "The Redcap bandits have raided thirty-one caravans.",
        "start": "hunt",
        "stages": {"hunt": {"desc": "Storm Redcap Hold, north of the Crossing, and defeat Mott.",
                            "objectives": [{"id": "kill", "text": "Defeat Mott", "kill": "redcap_mott"}], "next": "return"},
                   "return": {"desc": "Return to Guildmaster Varka with proof.",
                              "objectives": [{"id": "ret", "text": "Collect the bounty from Varka", "cond": {"flag": "never"}}], "next": None}},
        "rewards": {"xp": 260, "gold": 250, "rep": {"guild": 15}},
    },
    "bq_widow": {
        "name": "Bounty: The Grey Widow", "type": "faction", "region": "Mistvale", "level": "7+",
        "summary": "An Aether-bloated spider-queen haunts the Mistvale.",
        "start": "hunt",
        "stages": {"hunt": {"desc": "Find the Grey Widow's lair in the Mistvale and destroy her.",
                            "objectives": [{"id": "kill", "text": "Slay the Grey Widow", "kill": "grey_widow"}], "next": "return"},
                   "return": {"desc": "Return to Guildmaster Varka for payment.",
                              "objectives": [{"id": "ret", "text": "Collect the bounty from Varka", "cond": {"flag": "never"}}], "next": None}},
        "rewards": {"xp": 300, "gold": 300, "rep": {"guild": 15}},
    },
    "bq_stormcrow": {
        "name": "Bounty: The Stormcrow", "type": "faction", "region": "Iron Pass", "level": "8+",
        "summary": "A lightning-throwing crow the size of a house nests at the Iron Pass.",
        "start": "hunt",
        "stages": {"hunt": {"desc": "Climb to the Stormcrow's eyrie above the Iron Pass and bring it down.",
                            "objectives": [{"id": "kill", "text": "Slay the Stormcrow", "kill": "stormcrow"}], "next": "return"},
                   "return": {"desc": "Return to Guildmaster Varka for payment.",
                              "objectives": [{"id": "ret", "text": "Collect the bounty from Varka", "cond": {"flag": "never"}}], "next": None}},
        "rewards": {"xp": 350, "gold": 350, "rep": {"guild": 20}},
    },
}

LORE = {
    "corvin_keystones": {"title": "The Three Keystones", "text":
        "Three rings, made by the Vaultwrights, hidden one to a land: a ring of blue stone beneath Valewatch, a ring of "
        "living heartwood in Sylvara's Moonwell, a ring of black metal in Kharum-Dûr's Ninth Deep. Together, Corvin "
        "believes, they open the Vault."},
    "millbrook_conduit": {"title": "The Millbrook Conduit", "text":
        "Buried beneath Millbrook's fields: an ancient conduit carved with three interlocking rings, cracked and "
        "leaking Aether into the soil. Someone once built channels to carry the Aether across the world, like water. "
        "They are breaking."},
    "redcap_ledger": {"title": "Mott's Ledger", "text":
        "Payments from the Morrow Consortium to the Redcaps, for raids on Conclave caravans carrying Aether-cores. The "
        "cores were delivered to 'the Scar'. Ilvane has been stockpiling Aether for months."},
    "ember_prayer": {"title": "The Pilgrims' Apology", "text":
        "'Forgive us the light we borrow; forgive us the warmth we spend; forgive us, who were given the ash, and "
        "called it a gift.'"},
}
