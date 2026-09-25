"""Valewatch — the Human homeland. A cosmopolitan trade city on a river of living Aether.

Intro arc (Humans: main quest; others: side quest): The Dimming Locks.
Keystone arc (everyone): The Sunken Archive.
"""

NATIVE = {"home": "valewatch"}

LOCATIONS = {
    "vw_rivergate": {
        "name": "Rivergate Locks", "region": "valewatch", "biome": "city_river",
        "desc": [
            {"text": "The great Rivergate Locks rise in tiers of pale stone, each gate haloed in the blue shimmer of "
                     "the Aether that lifts barges from one level of the river to the next. Gulls wheel over "
                     "stalls selling hot eel pies. Watch-lanterns burn in iron cages along the quay."},
            {"if": {"not_flag": "vw_intro_done"},
             "text": "The lowest lock is dark. Its Aether-shimmer flickers and dies, flickers and dies, like a "
                     "candle in a draught. Dockhands mutter and keep their distance."},
            {"if": {"flag": "vw_intro_done"},
             "text": "The lowest lock hums steadily again, though the keepers still check its core twice an hour."},
        ],
        "npcs": [{"id": "captain_hesk"}, {"id": "lockmistress_pell"}],
        "features": [
            {"id": "failing_lock", "name": "The Failing Aether-Lock",
             "desc": "A lock-gate the height of three houses. Its core housing hangs open.",
             "actions": [
                 {"label": "Examine the core housing", "if": {"stage": ["mq_vw_intro", "investigate"], "not_flag": "vw_clue_lock"},
                  "text": "Inside the housing, the aether-core — a fist-sized crystal that should glow like a small moon — is "
                          "grey and cracked, as though something drank it dry. Scratched into the housing's brass is a "
                          "tiny sigil: a ring, broken at the top. You pry the dead core loose.",
                  "effects": [{"flag": "vw_clue_lock", "item": "dud_core", "xp": 25}]},
                 {"label": "Admire the engineering", "once": True,
                  "text": "Four hundred years old and still (mostly) working. The masons' marks along the base read "
                          "'Built by Valewatch, Paid For By Valewatch, Complain To Valewatch.'",
                  "effects": [{"xp": 5}]},
             ]},
            {"id": "cat_rivergate", "name": "A Suspiciously Smug Cat", "if": {"stage": ["sq_vw_cat", "catch"], "not_flag": "cat_rg"},
             "desc": "A grey tabby wearing a tiny glowing collar sits atop a mooring post, judging you.",
             "actions": [
                 {"label": "Grab it", "check": {"stat": "dex", "dc": 11,
                                                "pass": {"text": "You scoop the cat up. It permits this, with visible resentment.",
                                                         "effects": [{"flag": "cat_rg", "counter": "cats_caught"}]},
                                                "fail": {"text": "The cat flows away like liquid and reappears on the next post. Try again."}}},
                 {"label": "Offer it a bit of eel pie", "if": {"gold_gte": 1},
                  "text": "You buy a slice of eel pie (1 gold). The cat accepts the tribute and allows itself to be carried.",
                  "effects": [{"gold": -1, "flag": "cat_rg", "counter": "cats_caught"}]},
             ]},
        ],
        "exits": [{"to": "vw_market", "label": "Lantern Market"},
                  {"to": "vw_docks", "label": "Canal Docks"},
                  {"to": "vw_gate", "label": "Greymarch Gate (city exit)"}],
        "on_enter": [
            {"once": "intro", "if": NATIVE,
             "text": "You arrive at the Rivergate Locks just as the lowest lock gutters out. A grain barge lurches, "
                     "its bow slamming into the dark gate. Water churns — and something long and slick coils up out "
                     "of the lock-basin. Beside it, a tide of glowing canal rats boils over the quay.",
             "effects": [{"start_quest": "mq_vw_intro"}]},
        ],
        "encounter": {"id": "enc_vw_tutorial", "if": NATIVE},
    },
    "vw_market": {
        "name": "Lantern Market", "region": "valewatch", "biome": "city",
        "desc": "Canvas awnings in a hundred colors crowd a square paved with river-stone. Floating Aether-lanterns bob "
                "overhead, each one licensed, taxed, and stamped by the Conclave. Hawkers sell spice from the south, "
                "silk from Sylvara, and dwarven steel from the mountains — at prices that suggest it walked here.",
        "npcs": [{"id": "pemberton"}, {"id": "street_urchin"}],
        "shop": "vw_provisions",
        "features": [
            {"id": "notice_board", "name": "Market Notice Board",
             "desc": "Layers of posters, each nailed over the last.",
             "actions": [{"label": "Read the notices",
                          "text": "MISSING: Lock-keepers J. Harrow, M. Fenn, T. Brisk. Reward for information — Rivergate Watch.\n"
                                  "LOST: One (1) familiar, feline, possibly several. Answers to 'Mister Whiskers'. See Apprentice Tobbin, Guild Row.\n"
                                  "WANTED: Brannoc 'the Lamp-Eater'. For questioning. Do not approach. Seriously.\n"
                                  "NOTICE: The Lantern Conclave reminds citizens that unlicensed spellcasting is a civic offense."}]},
            {"id": "cat_market", "name": "A Cat in the Fish Stall", "if": {"stage": ["sq_vw_cat", "catch"], "not_flag": "cat_mk"},
             "desc": "A second identical grey tabby is methodically stealing an entire salmon.",
             "actions": [
                 {"label": "Wrestle it away from the salmon", "check": {"stat": "str", "dc": 10,
                                                                         "pass": {"text": "You extract cat from salmon. The fishmonger applauds.",
                                                                                  "effects": [{"flag": "cat_mk", "counter": "cats_caught"}]},
                                                                         "fail": {"text": "The cat is stronger than it looks. The salmon is winning too."}}},
                 {"label": "Pay the fishmonger for the salmon (5 gold)", "if": {"gold_gte": 5},
                  "text": "You buy the salmon. The cat follows you, and the salmon, anywhere.",
                  "effects": [{"gold": -5, "flag": "cat_mk", "counter": "cats_caught"}]},
             ]},
        ],
        "exits": [{"to": "vw_rivergate", "label": "Rivergate Locks"},
                  {"to": "vw_guildrow", "label": "Guild Row"},
                  {"to": "vw_docks", "label": "Canal Docks"}],
        "discover_xp": 10,
    },
    "vw_guildrow": {
        "name": "Guild Row", "region": "valewatch", "biome": "city_arcane",
        "desc": "Tall townhouses of blue-veined marble line Guild Row, home to the city's chartered guilds. At its head "
                "stands the Lantern Conclave, a domed hall crowned with a lantern of pure Aether that has not gone out "
                "in three centuries. Apprentices hurry by with armloads of scrolls and singed eyebrows.",
        "npcs": [{"id": "magister_oriel"}, {"id": "apprentice_tobbin"}, {"id": "registrar_quill"}],
        "shop": "vw_conclave",
        "respec": True,
        "features": [
            {"id": "conclave_library", "name": "Conclave Reading Room",
             "desc": "Public shelves, chained books, and a librarian who has perfected the art of the silent glare.",
             "actions": [
                 {"label": "Read 'A Primer on the Aether'", "effects": [{"lore": "aether_primer"}],
                  "text": "You read the primer."},
                 {"label": "Read 'The Ballad of Aldous Wick'", "effects": [{"lore": "ballad_wick"}],
                  "text": "A thin, water-stained songbook."},
                 {"label": "Read 'Founding of the Conclave'", "effects": [{"lore": "conclave_founding"}],
                  "text": "A dry civic history with one very interesting footnote."},
             ]},
            {"id": "archive_stair", "name": "The Archive Stair",
             "desc": "A spiral stair behind a bronze door, descending beneath the Conclave into the dark.",
             "actions": [
                 {"label": "Descend into the Sunken Archive", "if": {"quest": ["mq_ks_valewatch", "active"]},
                  "effects": [{"travel": "vw_sa_stacks"}]},
                 {"label": "Try the door", "if": {"not": {"quest": ["mq_ks_valewatch", "active"]}},
                  "text": "The bronze door is sealed with Conclave wards. A plaque reads: 'Archive — By Order Of The Magisterium Only.'"},
             ]},
        ],
        "exits": [{"to": "vw_market", "label": "Lantern Market"}],
        "discover_xp": 10,
    },
    "vw_docks": {
        "name": "Canal Docks", "region": "valewatch", "biome": "city_river",
        "desc": "Warehouses lean over the black water like drunks over a bar. Rope, tar, and fish. The Rusty Oar tavern "
                "spills lamplight and bad singing onto the boardwalk. Beneath the quay, a rusted grate opens onto the "
                "Undercroft — the city's forgotten tunnels.",
        "npcs": [{"id": "tam_two_coins"}, {"id": "nessa"}, {"id": "old_marrow", "if": {"not_flag": "marrow_gone"}}],
        "rest": "inn", "shop": "vw_lanterns_shop",
        "features": [
            {"id": "canal_rat_friendly", "name": "A Very Large Rat",
             "desc": "A canal rat the size of a terrier, sunning itself on a crate. It glows faintly.",
             "actions": [{"label": "Try to pet it", "once": True,
                          "text": "You extend a hand. The rat considers it, sniffs it, and bites it. Then, satisfied, it "
                                  "allows exactly one pat before waddling off. You feel you have made a friend. Or a "
                                  "mortal enemy. With rats it is hard to tell.",
                          "effects": [{"damage_pct": 3, "achievement": "friend_to_vermin"}]}]},
            {"id": "cat_docks", "name": "A Cat Up the Rigging", "if": {"stage": ["sq_vw_cat", "catch"], "not_flag": "cat_dk"},
             "desc": "A third grey tabby yowls from the top of a ship's mast.",
             "actions": [
                 {"label": "Climb after it", "check": {"stat": "dex", "dc": 12,
                                                       "pass": {"text": "You climb, grab, and descend with a furious cat down your shirt.",
                                                                "effects": [{"flag": "cat_dk", "counter": "cats_caught"}]},
                                                       "fail": {"text": "You slip halfway up and land in a coil of rope. The cat laughs. You're sure of it.",
                                                                "effects": [{"damage_pct": 5}]}}},
                 {"label": "Coax it down with gentle words", "check": {"stat": "cha", "dc": 12,
                                                                       "pass": {"text": "The cat descends, purring, and settles in your arms.",
                                                                                "effects": [{"flag": "cat_dk", "counter": "cats_caught"}]},
                                                                       "fail": {"text": "The cat regards your gentle words with contempt."}}},
             ]},
            {"id": "undercroft_grate", "name": "Undercroft Grate",
             "desc": "A rusted grate. The smell from below could strip paint.",
             "actions": [
                 {"label": "Descend into the Undercroft", "if": {"flag": "vw_undercroft_open"},
                  "effects": [{"travel": "vw_uc_tunnels"}]},
                 {"label": "Rattle the grate", "if": {"not_flag": "vw_undercroft_open"},
                  "text": "It's chained shut with a Watch lock. You'll need a reason — and a key — to go down there."},
             ]},
        ],
        "exits": [{"to": "vw_rivergate", "label": "Rivergate Locks"}, {"to": "vw_market", "label": "Lantern Market"}],
        "discover_xp": 10,
    },
    "vw_gate": {
        "name": "Greymarch Gate", "region": "valewatch", "biome": "city_gate", "travel": "valewatch",
        "desc": [{"text": "The city's eastern gate opens onto the Greymarch Road, which winds through farmland toward "
                          "Emberfall Crossing and the wider world. Merchant wagons queue beneath a Watch tower."},
                 {"if": {"not_flag": "world_open"},
                  "text": "A Watch sergeant eyes you. 'Captain Hesk's orders — nobody on her books leaves the city till "
                          "the lock business is done.' (Complete your homeland's story to travel freely.)"}],
        "npcs": [{"id": "gate_sergeant"}],
        "exits": [{"to": "vw_rivergate", "label": "Rivergate Locks"}],
        "discover_xp": 10,
    },

    # ---------------- The Undercroft (intro dungeon) ----------------
    "vw_uc_tunnels": {
        "name": "Undercroft: Overflow Tunnels", "region": "valewatch", "biome": "sewer", "danger": "moderate",
        "desc": "Brick tunnels sweat in the dark. Overflow channels carry the river's runoff, and the water here glows a "
                "sickly blue where Aether has leaked into it. Something splashes ahead.",
        "features": [
            {"id": "singing_drain", "name": "A Drain That Hums",
             "if": {"quest": ["hq_vw_ballad", "active"]},
             "desc": "Water gurgles through an old drain in a pattern that sounds — impossibly — like the melody of the Lamplighter's Ballad.",
             "actions": [{"label": "Reach into the singing drain", "once": True,
                          "text": "Behind a loose brick, wrapped in oilcloth, you find an old lamplighter's amulet and a "
                                  "note in faded ink: 'For whoever keeps the lights next. — A. Wick.'",
                          "effects": [{"unique": "u_lamplighter_oath", "flag": "wick_found", "lore": "wick_note"}]}]},
            {"id": "tunnel_supplies", "name": "Watch Supply Crate",
             "desc": "A crate stenciled RIVERGATE WATCH — PROPERTY OF.",
             "actions": [{"label": "Open it", "once": True, "text": "Supplies left by a Watch patrol that never came back.",
                          "effects": [{"item": "potion_heal_minor", "qty": 2}, {"item": "antidote"}]}]},
        ],
        "exits": [{"to": "vw_docks", "label": "Climb back to the Docks"},
                  {"to": "vw_uc_cistern", "label": "Deeper: toward lamplight"}],
        "encounter": {"id": "enc_vw_tunnels"},
        "random": {"chance": 0.3, "table": ["enc_vw_rats"]},
        "discover_xp": 20,
    },
    "vw_uc_cistern": {
        "name": "Undercroft: Smugglers' Cistern", "region": "valewatch", "biome": "sewer", "danger": "moderate",
        "desc": "A vast vaulted cistern where the Drowned Lanterns stash their goods. Crates marked with drowned-lantern "
                "sigils float on rafts tied between the pillars. Stolen aether-cores are stacked like cordwood.",
        "features": [
            {"id": "smuggled_crates", "name": "Smuggled Crates",
             "desc": "Crates of contraband.",
             "actions": [{"label": "Search the crates", "once": True, "text": "Among the contraband:",
                          "effects": [{"loot": "chest"}, {"item": "siphon_part"}]}]},
            {"id": "loose_brick", "name": "A Loose Brick", "hidden": 13,
             "desc": "One brick in the pillar sits slightly proud of the rest.",
             "actions": [{"label": "Pry it out", "once": True,
                          "text": "A smuggler's personal stash! Someone is going to be very upset.",
                          "effects": [{"gold": 40}, {"item": "potion_heal"}, {"random_item": {"quality": "chest", "rarity": "rare"}}]}]},
        ],
        "exits": [{"to": "vw_uc_tunnels", "label": "Back to the Overflow Tunnels"},
                  {"to": "vw_uc_works", "label": "Toward the droning machinery"}],
        "encounter": {"id": "enc_vw_cistern"},
        "rest": None,
        "discover_xp": 20,
    },
    "vw_uc_works": {
        "name": "Undercroft: The Siphon Works", "region": "valewatch", "biome": "sewer_machine", "danger": "high",
        "desc": [{"text": "Copper pipes snake along the walls into a humming engine built from stolen lock-parts. It "
                          "drinks Aether from the river-lines through a web of cables that run up toward the city above."},
                 {"if": {"not_flag": "vw_keepers_found"},
                  "text": "Chained to the engine, pale and exhausted, are three people in lock-keeper's blue. They are "
                          "being used to tune it — only a trained keeper can calibrate a lock-core."},
                 {"if": {"flag": "vw_keepers_found"},
                  "text": "The engine is silent now. The keepers have gone up to the surface."}],
        "features": [
            {"id": "siphon_engine", "name": "The Siphon Engine",
             "desc": "Three valves — red, blue and brass — control its flow. The keepers are shouting conflicting advice.",
             "if": {"not_flag": "vw_engine_off"},
             "actions": [
                 {"label": "Ask the keepers how to shut it down safely",
                  "text": "Mira Fenn gasps: 'Brass first to cut the draw, then blue to vent — NEVER red first, it'll "
                          "overload!' Old Jory: 'She's right. Probably. Don't quote me.'",
                  "effects": [{"flag": "vw_valve_hint"}]},
                 {"label": "Turn brass, then blue, then red",
                  "text": "The engine sighs, shudders, and winds down with a long mechanical groan. The Aether in the "
                          "pipes drains harmlessly back into the river-lines. The keepers cheer weakly.",
                  "effects": [{"flag": ["vw_engine_off", "vw_keepers_found"], "xp": 60}]},
                 {"label": "Turn red first (it looks important)",
                  "text": "The engine SHRIEKS. A burst of raw Aether scorches you — and shakes loose an Aether Leech "
                          "that was nesting in the pipes!",
                  "effects": [{"damage_pct": 20, "combat": "enc_vw_leech"}]},
                 {"label": "Smash the engine", "check": {"stat": "str", "dc": 14,
                                                         "pass": {"text": "You bring the whole thing down in a shower of sparks and copper. Crude, but effective.",
                                                                  "effects": [{"flag": ["vw_engine_off", "vw_keepers_found"], "xp": 40}]},
                                                         "fail": {"text": "You hit it. It hits back — with a jolt of lightning.",
                                                                  "effects": [{"damage_pct": 15}]}}},
             ]},
            {"id": "keepers", "name": "The Lock-Keepers", "if": {"flag": "vw_engine_off", "not_flag": "vw_keepers_freed"},
             "desc": "Jory, Mira and Tollan, freed from their chains, rubbing their wrists.",
             "actions": [{"label": "Help them to safety",
                          "text": "'Brannoc,' Mira spits. 'The Lamp-Eater. He's in the old pump-house past the sluice. He "
                                  "had us calibrate that monster to feed his gauntlet — and something else. He kept "
                                  "talking about a buyer. A woman with a broken-ring seal.' They limp toward the surface.",
                          "effects": [{"flag": "vw_keepers_freed", "xp": 40, "rep": ["watch", 10]}]}]},
        ],
        "exits": [{"to": "vw_uc_cistern", "label": "Back to the Cistern"},
                  {"to": "vw_uc_den", "label": "Past the sluice: the old pump-house", "if": {"flag": "vw_engine_off"},
                   "locked": "The sluice is flooded with raw Aether while the engine runs. Shut it down first."}],
        "encounter": {"id": "enc_vw_works"},
        "discover_xp": 20,
    },
    "vw_uc_den": {
        "name": "Undercroft: Brannoc's Den", "region": "valewatch", "biome": "sewer_machine", "danger": "boss",
        "desc": [{"text": "An old pump-house turned throne room: a chair built from lock-gears, carpets looted from "
                          "merchant barges, and two humming copper coils feeding a thick cable into the gauntlet of the "
                          "man who rises to meet you."},
                 {"if": {"flag": "vw_brannoc_defeated"},
                  "text": "The coils are dark. The gear-throne sits empty, a monument to a very specific kind of ego."}],
        "features": [
            {"id": "brannoc_desk", "name": "Brannoc's Desk", "if": {"flag": "vw_brannoc_defeated"},
             "desc": "Ledgers, maps of the lock network, and a strongbox.",
             "actions": [{"label": "Search the desk", "once": True,
                          "text": "Brannoc's ledgers show payments from 'I.M.' — enormous sums, in Consortium scrip.",
                          "effects": [{"gold": 60}, {"item": "potion_heal", "qty": 2}, {"lore": "brannoc_ledger"}]}]},
        ],
        "exits": [{"to": "vw_uc_works", "label": "Back to the Siphon Works"},
                  {"to": "vw_docks", "label": "Climb the maintenance ladder to the Docks", "if": {"flag": "vw_brannoc_defeated"},
                   "locked": "Brannoc stands in the way."}],
        "encounter": {"id": "enc_vw_brannoc"},
        "discover_xp": 20,
    },

    # ---------------- The Sunken Archive (keystone dungeon) ----------------
    "vw_sa_stacks": {
        "name": "Sunken Archive: Flooded Stacks", "region": "valewatch", "biome": "archive", "danger": "high",
        "desc": "Shelves thirty feet tall stand knee-deep in black water. Books float past like drowned birds. The "
                "wards here should hum like a choir; instead they sputter and whine, starved of the Aether the locks "
                "used to send them. Fresh bootprints in the silt lead deeper.",
        "features": [
            {"id": "floating_journal", "name": "A Floating Journal", "desc": "Recently dropped. Still mostly dry.",
             "actions": [{"label": "Read it", "once": True, "effects": [{"lore": "vessa_journal"}], "text": "An Unbound agent's field notes."}]},
            {"id": "stack_chest", "name": "Archivist's Lockbox", "hidden": 12, "desc": "Wedged high on a shelf.",
             "actions": [{"label": "Climb up and open it", "once": True, "text": "Inside, carefully preserved:",
                          "effects": [{"loot": "chest"}, {"item": "potion_mana"}]}]},
        ],
        "exits": [{"to": "vw_guildrow", "label": "Climb back up to Guild Row"},
                  {"to": "vw_sa_wards", "label": "Wade deeper"}],
        "encounter": {"id": "enc_sa_stacks"},
        "random": {"chance": 0.25, "table": ["enc_sa_mites"]},
        "discover_xp": 30,
    },
    "vw_sa_wards": {
        "name": "Sunken Archive: Hall of Echoing Wards", "region": "valewatch", "biome": "archive", "danger": "high",
        "desc": "A circular hall whose walls are carved with ward-words in High Valic. A sealed door of blue glass bars "
                "the way. Three ward-sigils glow faintly beside it: a FLAME, a WAVE and an EYE. An inscription above "
                "reads: 'As the river rose: first it saw, then it drowned the fire.'",
        "features": [
            {"id": "ward_door", "name": "The Glass Ward-Door", "if": {"not_flag": "sa_door_open"},
             "desc": "Press the sigils in the right order.",
             "actions": [
                 {"label": "Press: Flame, Wave, Eye", "text": "The sigils flare red. The ward-armor along the walls lurches to life!",
                  "effects": [{"combat": "enc_sa_ward_trap"}]},
                 {"label": "Press: Eye, Wave, Flame",
                  "text": "Each sigil chimes a clear note. The glass door melts into mist. ('First it saw — the eye. Then it drowned — the wave. The fire — last.')",
                  "effects": [{"flag": "sa_door_open", "xp": 80}]},
                 {"label": "Press: Wave, Flame, Eye", "text": "Wrong. The ward-armor lurches to life!",
                  "effects": [{"combat": "enc_sa_ward_trap"}]},
                 {"label": "[Lore] Study the ward-words", "check": {"stat": "lore", "dc": 12,
                                                                    "pass": {"text": "The High Valic is a riddle of sequence: the eye opens, the wave rises, the flame is drowned. Eye, Wave, Flame."},
                                                                    "fail": {"text": "Archaic grammar. You're fairly sure one of these words means 'soup'."}}},
             ]},
        ],
        "exits": [{"to": "vw_sa_stacks", "label": "Back to the Flooded Stacks"},
                  {"to": "vw_sa_reliquary", "label": "Through the ward-door", "if": {"flag": "sa_door_open"},
                   "locked": "The glass ward-door is sealed."}],
        "encounter": {"id": "enc_sa_wards"},
        "discover_xp": 30,
    },
    "vw_sa_reliquary": {
        "name": "Sunken Archive: The Reliquary", "region": "valewatch", "biome": "archive", "danger": "high",
        "desc": "Dry at last. Glass cases line a long gallery, displaying artifacts of the Conclave's founding. Several "
                "cases have been smashed. At the gallery's center, one pedestal remains untouched: a heavily warded "
                "plinth bearing a small silver circlet, surrounded by three layers of shimmering wards, two warning "
                "plaques, and a hand-painted sign reading PLEASE DO NOT TOUCH THE EXHIBIT.",
        "features": [
            {"id": "warded_pedestal", "name": "The Warded Pedestal", "if": {"not_flag": "pedestal_taken"},
             "desc": "The plaques read: 'DANGER — ACTIVE WARDS' and 'NO, REALLY.'",
             "actions": [
                 {"label": "Read the plaques carefully",
                  "text": "'The Curator's Circlet. Removal will trigger the Curator's Grief. The Magisterium accepts no "
                          "liability for dismemberment, drowning, or embarrassment.'"},
                 {"label": "Take the circlet anyway",
                  "text": "You reach through three layers of wards, which make an escalating series of disapproving noises, "
                          "and lift the circlet. Every ward in the room turns to face you.",
                  "effects": [{"flag": "pedestal_taken", "achievement": "do_not_touch", "combat": "enc_sa_curator"}]},
             ]},
            {"id": "reliquary_tablets", "name": "Founders' Tablet",
             "desc": "A bronze tablet recounting the founding of the first lock.",
             "actions": [{"label": "Read the tablet", "effects": [{"lore": "founders_tablet"}], "text": "You read the tablet."}]},
        ],
        "exits": [{"to": "vw_sa_wards", "label": "Back to the Hall of Wards"},
                  {"to": "vw_sa_vault", "label": "The Founders' Vault"}],
        "encounter": {"id": "enc_sa_reliquary"},
        "discover_xp": 30,
    },
    "vw_sa_vault": {
        "name": "Sunken Archive: The Founders' Vault", "region": "valewatch", "biome": "archive", "danger": "boss",
        "desc": [{"text": "A round chamber beneath the very bed of the river; you can hear it rushing overhead. In the "
                          "center, a ring of blue stone floats above a basin of still water, singing a single held note."},
                 {"if": {"not_flag": "vessa_defeated"},
                  "text": "A woman in a duelist's coat stands before it, one hand raised to take it. She turns, and smiles."}],
        "exits": [{"to": "vw_sa_reliquary", "label": "Back to the Reliquary"},
                  {"to": "vw_guildrow", "label": "Take the Founders' lift to Guild Row", "if": {"flag": "vessa_defeated"},
                   "locked": "Vessa bars the way."}],
        "encounter": {"id": "enc_sa_vessa"},
        "discover_xp": 30,
    },
}

ENCOUNTERS = {
    "enc_vw_tutorial": {"title": "Chaos at the Rivergate", "flee": False, "level": [1, 1],
                        "intro": "Glowing rats swarm the quay as the lock fails! Use Attack or your abilities on the "
                                 "enemies. Watch your health, mana and stamina.",
                        "enemies": ["canal_rat", "canal_rat"],
                        "on_victory": [{"flag": "vw_tutorial_done"}]},
    "enc_vw_rats": {"title": "Vermin", "level": [1, 5], "enemies": ["canal_rat", "canal_rat", "canal_rat"]},
    "enc_vw_tunnels": {"title": "Overflow Tunnels", "level": [1, 5],
                       "intro": "A canal lurker rises from the glowing water, rats at its flanks.",
                       "enemies": ["canal_lurker", "canal_rat"]},
    "enc_vw_cistern": {"title": "Smugglers' Cistern", "level": [2, 6],
                       "intro": "'Lamp-Eater said nobody comes down here,' a thug growls. 'Guess he was wrong.'",
                       "enemies": ["dockside_thug", "lantern_cutpurse", ["lantern_hexer", "back"]]},
    "enc_vw_works": {"title": "The Siphon Works", "level": [2, 6],
                     "intro": "Engine-minders drop their tools and draw steel.",
                     "enemies": ["dockside_thug", "dockside_thug", "aether_leech"]},
    "enc_vw_leech": {"title": "Aether Overload", "level": [2, 6], "enemies": ["aether_leech", "aether_leech"],
                     "on_victory": [{"msg": "The engine is still running. You'll have to try the valves again."}]},
    "enc_vw_brannoc": {"title": "Brannoc the Lamp-Eater", "boss": True, "level": [4, 7],
                       "intro": "'You broke my engine.' Brannoc flexes his gauntlet; the coils behind him flare. "
                                "'I'll just drink YOU instead.' (His Siphon Coils heal and shield him — destroy them. "
                                "When he charges his gauntlet, Defend or interrupt!)",
                       "enemies": ["brannoc", "siphon_coil", "siphon_coil"],
                       "on_victory": [{"flag": "vw_brannoc_defeated", "unique": "u_siphon_gauntlet"},
                                      {"item": "unbound_letter_vw"}],
                       "after_dialogue": "brannoc_defeated"},
    "enc_sa_mites": {"title": "Rustling Pages", "level": [5, 9], "enemies": ["book_mite_swarm", "book_mite_swarm"]},
    "enc_sa_stacks": {"title": "The Flooded Stacks", "level": [5, 9],
                      "intro": "The water stirs. A drowned scribe lifts its ink-stained face from the shallows, and the "
                               "shelves erupt with mites.",
                      "enemies": ["book_mite_swarm", "book_mite_swarm", ["drowned_scribe", "back"]]},
    "enc_sa_wards": {"title": "Echoing Wards", "level": [5, 9],
                     "intro": "Unbound agents are here, trying to crack the ward-door. They turn on you.",
                     "enemies": ["unbound_spellblade", ["unbound_acolyte", "back"]]},
    "enc_sa_ward_trap": {"title": "The Wards Awaken", "level": [5, 9], "enemies": ["ward_sentinel", "ward_sentinel"],
                         "on_victory": [{"msg": "The ward-armor collapses. The door remains sealed; the sigils reset."}]},
    "enc_sa_reliquary": {"title": "Looters in the Reliquary", "level": [5, 9],
                         "intro": "Unbound looters are smashing cases. 'The Crane said no witnesses,' one mutters.",
                         "enemies": ["unbound_spellblade", "unbound_spellblade", ["unbound_acolyte", "back"]]},
    "enc_sa_curator": {"title": "The Curator's Grief", "level": [6, 10],
                       "intro": "The wards coalesce into armored figures and a drowned, weeping curator.",
                       "enemies": ["ward_sentinel", ["drowned_scribe", "back"]],
                       "on_victory": [{"unique": "u_curator_crown",
                                       "msg": "The Curator's Grief subsides. The circlet is yours. You feel mildly judged."}]},
    "enc_sa_vessa": {"title": "Vessa Crane", "boss": True, "level": [7, 10],
                     "intro": "'Ilvane said someone would come. I hoped it would be someone interesting.' Vessa draws "
                              "her rapier. (Blade Stance: she dodges weapons but spells hurt her. Spell Stance: she "
                              "resists magic but her guard is open to steel. She shifts every other round.)",
                     "enemies": ["vessa_crane"],
                     "on_victory": [{"flag": "vessa_defeated", "item": "keystone_valewatch", "unique": "u_vessa_blade"}],
                     "after_dialogue": "vessa_defeated"},
}

SHOPS = {
    "vw_provisions": {"name": "Pemberton's Provisions", "greeting": "'Everything a hero needs! Most of it even works!'",
                      "stock": ["potion_heal_minor", "potion_heal", "potion_mana_minor", "tonic_stamina", "antidote",
                                "fire_flask", "smoke_bomb"],
                      "random": 5, "bases": ["longsword", "axe", "mace", "dagger", "shortbow", "medium_chest",
                                             "heavy_chest", "medium_feet", "heavy_head", "shield"]},
    "vw_conclave": {"name": "Conclave Arcanum", "greeting": "'Licensed, certified, and only occasionally explosive.'",
                    "stock": ["potion_mana_minor", "potion_mana", "aether_tincture"],
                    "random": 5, "bases": ["staff", "wand", "tome", "light_chest", "light_head", "light_hands",
                                           "light_legs", "light_feet", "amulet", "ring"],
                    "rep_stock": [{"faction": "conclave", "min": 10, "items": ["t2_staff", "t2_amulet"], "rarity": "rare"},
                                  {"faction": "conclave", "min": 25, "items": ["t3_tome", "t3_ring"], "rarity": "epic"}]},
    "vw_lanterns_shop": {"name": "Nessa's 'Imports'", "greeting": "'Don't ask where it's from. Do ask how much.'",
                         "stock": ["smoke_bomb", "fire_flask", "antidote", "potion_heal"],
                         "random": 3, "bases": ["dagger", "rapier", "shortbow", "medium_hands", "medium_head"],
                         "rep_stock": [{"faction": "lanterns", "min": 10, "items": ["t2_dagger", "t2_medium_chest"], "rarity": "rare"},
                                       {"faction": "lanterns", "min": 25, "items": ["t3_rapier"], "rarity": "epic"}]},
}

DIALOGUES = {
    "captain_hesk": {
        "name": "Captain Hesk", "title": "Watch-Captain of Rivergate",
        "markers": [{"if": {"stage": ["mq_vw_intro", "hesk"]}, "marker": "!"},
                    {"if": {"stage": ["mq_vw_intro", "report"]}, "marker": "?"},
                    {"if": {"quest": ["mq_vw_intro", "not_started"], "flag": "world_open"}, "marker": "!"}],
        "entry": [
            {"if": {"stage": ["mq_vw_intro", "hesk"]}, "node": "intro"},
            {"if": {"stage": ["mq_vw_intro", "report"]}, "node": "report"},
            {"if": {"quest": ["mq_vw_intro", "not_started"], "flag": "world_open"}, "node": "outsider"},
            {"if": {"quest": ["mq_vw_intro", "active"]}, "node": "progress"},
            {"node": "idle"},
        ],
        "nodes": {
            "intro": {"text": "A broad woman with a burn scar across one cheek and a lantern-badge polished to a mirror "
                              "shine looks you over as dockhands haul the barge clear. 'You handled those rats like you'd "
                              "done it before, {name}. Good. I need people who don't panic.' She jerks a thumb at the dead "
                              "lock. 'Third failure this month. And three of my lock-keepers have walked off their posts and "
                              "never come home. Nobody walks off a Rivergate post. Not with a pension like ours.'",
                      "options": [
                          {"text": "What exactly is failing?", "goto": "locks"},
                          {"text": "Who are the missing keepers?", "goto": "keepers"},
                          {"text": "[Persuade] I'll help. For a fee.", "check": {"stat": "persuade", "dc": 12, "pass": "fee_yes", "fail": "fee_no"},
                           "once": "fee"},
                          {"text": "I'll find them.", "goto": "accept"},
                      ]},
            "locks": {"text": "'Aether-locks lift the barges on a cushion of living Aether drawn from the river-lines. "
                              "The keepers tend the cores; the Conclave certifies them. They don't just *die*. Something is "
                              "drinking them.'",
                      "options": [{"text": "Go on.", "goto": "intro_back"}]},
            "keepers": {"text": "'Jory Harrow. Mira Fenn. Tollan Brisk. Sixty years on the locks between them. Mira's "
                                "husband is at my door every morning with the same question, and I'm running out of ways "
                                "to say I don't know.'",
                        "options": [{"text": "I understand.", "goto": "intro_back"}]},
            "intro_back": {"text": "Hesk waits, arms folded.",
                           "options": [{"text": "What's in it for me?", "check": {"stat": "persuade", "dc": 12, "pass": "fee_yes", "fail": "fee_no"}, "once": "fee"},
                                       {"text": "I'll find them.", "goto": "accept"}]},
            "fee_yes": {"text": "Hesk snorts, but digs out a purse. 'Mercenary. Fine. Half now. Don't make me regret it.'",
                        "effects": [{"gold": 30}], "options": [{"text": "Pleasure doing business.", "goto": "accept"}]},
            "fee_no": {"text": "'You'll be paid what the Watch pays, which is gratitude and the occasional pie. Take it or "
                               "leave it.'", "options": [{"text": "...I'll take it.", "goto": "accept"}]},
            "accept": {"text": "'Start with the lock itself — have a look at the core housing. Then take what you find to "
                               "Magister Oriel at the Lantern Conclave on Guild Row; she owes me. And if you want to know "
                               "what moves under this city, the Rusty Oar on the docks is where the rats drink. Ask for Tam "
                               "Two-Coins.' She presses a heavy iron key into your palm. 'Undercroft key. You'll want it "
                               "eventually. Everyone does, then they regret it.'",
                       "effects": [{"flag": "talked_hesk_intro"}],
                       "options": [{"text": "I'm on it."}]},
            "outsider": {"text": "Captain Hesk sizes you up. 'A {race}, this far from home? Then you've heard the rumors. "
                                 "Our locks are dying and my lock-keepers are vanishing. The Watch is stretched thin and "
                                 "I'm not proud. You want coin and a city's gratitude, I've got a job.'",
                         "options": [{"text": "Tell me everything.", "effects": [{"start_quest": "mq_vw_intro"},
                                                                                  {"set_stage": ["mq_vw_intro", "investigate"]}],
                                      "goto": "accept"},
                                     {"text": "Not right now."}]},
            "progress": {"text": [{"text": "'Any word?' Hesk asks."},
                                  {"if": {"stage": ["mq_vw_intro", "investigate"]},
                                   "text": "'Check the lock's core housing, see Oriel on Guild Row, and find Tam at the Rusty Oar.'"},
                                  {"if": {"stage_in": ["mq_vw_intro", ["undercroft", "brannoc"]]},
                                   "text": "'The Undercroft, then. The grate's on the docks. Take potions. Take two.'"}],
                         "options": [{"text": "I'll keep at it."}]},
            "report": {"text": [{"text": "Hesk listens to your account without interrupting once. When you finish, she lets "
                                         "out a long breath. 'The keepers are home. Mira's husband cried on my desk. You did "
                                         "good, {name}.'"},
                                {"if": {"flag": "brannoc_arrested"}, "text": "'And Brannoc in my cells. I may frame that.'"},
                                {"if": {"flag": "brannoc_freed"}, "text": "'Brannoc slipped away, you say.' Her eyes narrow. 'Hm.'"},
                                {"if": {"flag": "brannoc_killed"}, "text": "'Brannoc's dead. Can't say I'll mourn. Can't say I'd have done it.'"},
                                {"text": "'But that letter — that broken ring. Brannoc was a symptom. Take it to Oriel. And "
                                         "if this goes beyond my city... well. You've earned the right to walk out that gate "
                                         "whenever you like.'"}],
                       "effects": [{"flag": "vw_intro_reported"}],
                       "options": [{"text": "Thank you, Captain."}]},
            "idle": {"text": [{"text": "'Keep your head down and your purse closer.'"},
                              {"if": {"flag": "vw_intro_done"}, "text": "'The locks hold. Thanks to you. Don't let it go to your head.'"}],
                     "options": [{"text": "Any news, Captain?", "goto": "news"}, {"text": "Farewell."}]},
            "news": {"text": [{"text": "'The Greymarch Road's been rough. Redcaps hitting caravans, and something big in the "
                                       "hedgerows east of the city. Farmers call it Old Gnasher. The Adventurers' Guild in "
                                       "Emberfall posts bounties for that sort of thing.'",
                               "effects": []}],
                     "effects": [{"discover": "greymarch"}],
                     "options": [{"text": "Good to know."}]},
        },
    },
    "lockmistress_pell": {
        "name": "Lockmistress Pell", "title": "Keeper of the Rivergate",
        "entry": [{"if": {"flag": "vw_intro_done"}, "node": "after"}, {"node": "start"}],
        "nodes": {
            "start": {"text": "A wiry woman in grease-stained keeper's blue kicks the lock housing. 'Four hundred years "
                              "this lock ran. FOUR HUNDRED. And now the cores die in a week. That's not wear. That's "
                              "theft.'",
                      "options": [{"text": "Theft? Of what?", "goto": "theft"}, {"text": "Good luck with it."}]},
            "theft": {"text": "'Of the Aether, what else? Someone's tapping the lines upstream of the cores and drinking "
                              "them. Only a trained keeper could rig that without blowing themselves up.' Her face falls. "
                              "'...Which is maybe why my keepers are missing.'",
                      "options": [{"text": "I'll find them.", "effects": [{"xp": 10}]}]},
            "after": {"text": "'Lock's singing again. Listen to her.' The lock hums a low, contented note. Pell pats it "
                              "like a horse. 'That's my girl.'",
                      "options": [{"text": "She sounds happy."}]},
        },
    },
    "magister_oriel": {
        "name": "Magister Oriel", "title": "Magister of the Lantern Conclave",
        "markers": [{"if": {"stage": ["mq_vw_intro", "investigate"], "not_flag": "vw_clue_oriel"}, "marker": "?"},
                    {"if": {"quest": ["mq_ks_valewatch", "not_started"], "flag": "world_open"}, "marker": "!"}],
        "entry": [
            {"if": {"stage": ["mq_vw_intro", "investigate"], "not_flag": "vw_clue_oriel", "has_item": "dud_core"}, "node": "core"},
            {"if": {"stage": ["mq_vw_intro", "investigate"], "not_flag": "vw_clue_oriel"}, "node": "nocore"},
            {"if": {"quest": ["mq_ks_valewatch", "not_started"], "flag": "world_open"}, "node": "keystone"},
            {"if": {"quest": ["mq_ks_valewatch", "active"]}, "node": "archive_progress"},
            {"node": "idle"},
        ],
        "nodes": {
            "nocore": {"text": "A tall woman with ink-stained fingers and spectacles pushed into silver hair looks up from "
                               "a mountain of paperwork. 'Hesk sent you? Then bring me evidence, not rumors. A dead core, "
                               "ideally. I cannot analyze gossip.'",
                       "options": [{"text": "I'll find one."}]},
            "core": {"text": "Oriel turns the grey core over in her hands, then holds a tuning-crystal to it. It shrieks. "
                             "'Drained. Not burned out — *drained*, through a siphon. Crude work, but effective.' She "
                             "frowns at the broken-ring sigil. 'I've seen this mark once before. On the correspondence of a "
                             "colleague who left the Conclave under... unpleasant circumstances. Ilvane Morrow.'",
                     "effects": [{"flag": "vw_clue_oriel", "xp": 25, "remove_item": "dud_core"}],
                     "options": [{"text": "Who is Ilvane Morrow?", "goto": "ilvane"},
                                 {"text": "Where would someone hide a siphon?", "goto": "where"}]},
            "ilvane": {"text": "'The most brilliant Artificer this Conclave ever produced. She argued that the Aether is "
                               "not a natural force at all, but a *restriction* — a cage around some deeper, freer magic. "
                               "She wanted to break it open to find out. The Magisterium expelled her. That was eleven years "
                               "ago.' Oriel rubs her eyes. 'I hoped she'd gone somewhere quiet to be wrong.'",
                       "options": [{"text": "Where would someone hide a siphon?", "goto": "where"}]},
            "where": {"text": "'Somewhere with access to the river-lines and no one asking questions. The Undercroft, "
                              "beneath the docks. Hesk will have a key. And for pity's sake, bring the keepers home.'",
                      "options": [{"text": "I will."}]},
            "keystone": {"text": [{"text": "Oriel is pacing. 'Good — you. I need someone I can trust, and that is a short "
                                           "list these days.'"},
                                  {"if": {"has_item": "unbound_letter_vw"},
                                   "text": "She taps Brannoc's letter. 'The Lamp-Eater wasn't just stealing Aether. He was "
                                           "starving the Archive wards beneath this hall — they draw on the lock network.'"},
                                  {"text": "'Beneath the Conclave lies the Sunken Archive. And in its deepest vault, the "
                                           "stone the first lock was built around: a ring of blue stone that sings. We call it "
                                           "the Keystone. The old texts call it one of three. Sylvara has reported their "
                                           "Moonwell guttering; Kharum-Dur, a hum in the deep. Three rings, three crises. And "
                                           "our Archive wards failed this morning. Someone is inside.'"}],
                         "options": [{"text": "I'll go down and stop them.", "effects": [{"start_quest": "mq_ks_valewatch"}],
                                      "goto": "keystone_go"},
                                     {"text": "What do the old texts say about three rings?", "goto": "three"}]},
            "three": {"text": "'Scraps. \"Three keys to the vault of the ashen choir.\" Children's rhymes, I thought. I am "
                              "revising a great many opinions this week.'",
                      "effects": [{"lore": "three_rings"}],
                      "options": [{"text": "I'll go down into the Archive.", "effects": [{"start_quest": "mq_ks_valewatch"}], "goto": "keystone_go"}]},
            "keystone_go": {"text": "'The Archive Stair is here on Guild Row. The wards will be sputtering. Mind the "
                                    "pedestals; the Founders were not trusting people.'",
                            "options": [{"text": "Understood."}]},
            "archive_progress": {"text": [{"text": "'The Archive Stair is right there on Guild Row. Hurry.'"},
                                          {"if": {"has_item": "keystone_valewatch"},
                                           "text": "Oriel stares at the Keystone in your hands. It hums. 'Keep it. Whatever "
                                                   "this is, it is bigger than the Conclave. Find the other two.'"}],
                                 "options": [{"text": "I will."}]},
            "idle": {"text": [{"text": "'Magister Oriel. Busy. Always busy. What is it?'"}],
                     "options": [{"text": "Tell me about the Aether.", "goto": "aether"},
                                 {"text": "Nothing, Magister."}]},
            "aether": {"text": "'It is everywhere, it powers everything, and nobody knows where it comes from. The official "
                               "Conclave position is that it is \"a natural emanation of the world.\" The unofficial position "
                               "is that we have been drinking from a well for a thousand years without ever looking down it.'",
                       "effects": [{"lore": "aether_primer"}],
                       "options": [{"text": "Thank you."}]},
        },
    },
    "tam_two_coins": {
        "name": "Tam Two-Coins", "title": "Information Broker",
        "markers": [{"if": {"stage": ["mq_vw_intro", "investigate"], "not_flag": "vw_clue_tam"}, "marker": "?"}],
        "entry": [{"if": {"stage": ["mq_vw_intro", "investigate"], "not_flag": "vw_clue_tam"}, "node": "start"},
                  {"node": "idle"}],
        "nodes": {
            "start": {"text": "A thin man with a coin walking across his knuckles grins at you over his ale. 'Tam Two-Coins. "
                              "One coin for what I know, one coin for forgetting you asked. You're Hesk's new pet. Asking "
                              "about keepers.'",
                      "options": [
                          {"text": "Pay him (10 gold).", "if": {"gold_gte": 10}, "effects": [{"gold": -10}], "goto": "talk"},
                          {"text": "[Intimidate] Talk, or talk to the Watch.", "check": {"stat": "intimidate", "dc": 13, "pass": "talk", "fail": "scared_no"}},
                          {"text": "[Persuade] Hesk will remember who helped.", "check": {"stat": "persuade", "dc": 12, "pass": "talk", "fail": "persuade_no"}},
                      ]},
            "scared_no": {"text": "'Ooh, scary. Ten gold, friend.'",
                          "options": [{"text": "Pay him (10 gold).", "if": {"gold_gte": 10}, "effects": [{"gold": -10}], "goto": "talk"},
                                      {"text": "Fine. I'll be back."}]},
            "persuade_no": {"text": "'Hesk remembers everyone. That's the problem. Ten gold.'",
                            "options": [{"text": "Pay him (10 gold).", "if": {"gold_gte": 10}, "effects": [{"gold": -10}], "goto": "talk"},
                                        {"text": "Later."}]},
            "talk": {"text": "Tam leans in. 'The Drowned Lanterns have been moving lock-cores through the Undercroft for "
                             "weeks. Brannoc — the Lamp-Eater — got himself a new toy, a gauntlet that drinks Aether, and a "
                             "new buyer with deep pockets. He's built something down there. Big. Humming. And there's "
                             "people chained to it, if my rats are right.'",
                     "effects": [{"flag": "vw_clue_tam", "xp": 25}],
                     "options": [{"text": "Thanks, Tam."}]},
            "idle": {"text": "'Buying or selling, friend? Information, I mean. Everything else is Nessa's business.'",
                     "options": [{"text": "What's the word around town?", "goto": "rumor"}, {"text": "Nothing."}]},
            "rumor": {"text": "'Word is there's a chapel drowned in a bog off the Greymarch Road where you can still hear the "
                              "bell at night. Word is the Redcaps have a fort in the hills. And word is, some dead poet left a "
                              "treasure under this very city — but everyone says that about every city.'",
                      "effects": [{"discover": "greymarch"}],
                      "options": [{"text": "Interesting."}]},
        },
    },
    "brannoc_defeated": {
        "name": "Brannoc the Lamp-Eater", "title": "Defeated",
        "entry": [{"node": "start"}],
        "nodes": {
            "start": {"text": "Brannoc slumps against his gear-throne, gauntlet sparking and dead. 'Enough. Enough! You win.' "
                              "He spits blood. 'You think I'm the problem? I'm a middleman. The woman with the broken ring — "
                              "she wanted the locks starved so the Archive wards would fail. She's after something under "
                              "the Conclave. I just sold her the dark.'",
                      "options": [
                          {"text": "You're going to the Watch cells.", "goto": "arrest"},
                          {"text": "Tell me everything and you can walk.", "goto": "deal"},
                          {"text": "People suffered for your 'middleman' work. [Kill him]", "goto": "kill"},
                      ]},
            "arrest": {"text": "Brannoc laughs weakly as you bind his wrists. 'Hesk's going to be insufferable.' He's right.",
                       "effects": [{"flag": ["brannoc_arrested", "vw_brannoc_resolved"], "rep": ["watch", 15]},
                                   {"rep": ["lanterns", -10]}],
                       "options": [{"text": "Move."}]},
            "deal": {"text": "'Her name's Morrow. Ilvane Morrow. Her crane-woman — Vessa — paid me in Consortium scrip. "
                             "They've got people in Sylvara and under the dwarf mountain too, all hunting the same kind of "
                             "stone.' He limps toward a hidden hatch. 'The Lanterns won't forget this. Neither will I.'",
                     "effects": [{"flag": ["brannoc_freed", "vw_brannoc_resolved"], "rep": ["lanterns", 15], "lore": "brannoc_confession"},
                                 {"rep": ["watch", -5], "achievement": "honor_among_thieves"}],
                     "options": [{"text": "Don't make me regret this."}]},
            "kill": {"text": "It is quick. The Undercroft is quiet afterward, save for the drip of water and the hum of the "
                             "city far above.",
                     "effects": [{"flag": ["brannoc_killed", "vw_brannoc_resolved"], "rep": ["lanterns", -20], "achievement": "lights_out"}],
                     "options": [{"text": "[Leave]"}]},
        },
    },
    "vessa_defeated": {
        "name": "Vessa Crane", "title": "Unbound Spellblade",
        "entry": [{"node": "start"}],
        "nodes": {
            "start": {"text": "Vessa kneels in the shallow water, rapier broken. She laughs, which seems to hurt. 'Well "
                              "fought. You have no idea what you're protecting, you know. That ring isn't a key to a door. "
                              "It's a key to a *cage*. Ilvane will open it with or without your little stones.' She "
                              "shimmers. 'She's already at the Scar.' And she is gone — only an illusion remains, fading.",
                      "effects": [{"lore": "vessa_last_words"}],
                      "options": [{"text": "(Take the Keystone.)"}]},
        },
    },
    "pemberton": {
        "name": "Pemberton", "title": "Provisioner",
        "entry": [{"if": {"stage": ["fq_vw_package", "deliver"], "has_item": "smuggled_package"}, "node": "package"},
                  {"node": "start"}],
        "nodes": {
            "start": {"text": "A round man in a waistcoat that has seen better decades beams at you. 'Welcome, welcome! "
                              "Potions, blades, bombs! Fair prices, mostly!'",
                      "options": [{"text": "Show me your wares.", "effects": [{"shop": "vw_provisions"}]},
                                  {"text": "Just browsing."}]},
            "package": {"text": "Pemberton's smile freezes when he sees the package. 'Ah. Yes. Nessa's... imports. Just pop "
                                "that under the counter, there's a good fellow.'",
                        "options": [{"text": "Hand it over.", "effects": [{"remove_item": "smuggled_package", "flag": "package_delivered"}],
                                     "goto": "paid"},
                                    {"text": "Show me your wares first.", "effects": [{"shop": "vw_provisions"}]}]},
            "paid": {"text": "He counts coins into your hand without meeting your eyes. 'Lovely doing business. Never happened.'",
                     "effects": [{"gold": 40}], "options": [{"text": "Never happened."}]},
        },
    },
    "street_urchin": {
        "name": "Pip", "title": "Street Urchin",
        "entry": [{"node": "start"}],
        "nodes": {
            "start": {"text": "A grubby child with an Aether-lantern tied to a stick grins up at you. 'Oi! You an adventurer? "
                              "You look like an adventurer. You got that look. Like you're about to poke something you "
                              "shouldn't.'",
                      "options": [{"text": "Here's a coin, kid.", "if": {"gold_gte": 1}, "effects": [{"gold": -1, "counter": "kindness"}], "goto": "coin"},
                                  {"text": "What do you know about this city?", "goto": "know"},
                                  {"text": "Shoo."}]},
            "coin": {"text": "'Ta! Here's a secret for free: the Conclave librarian keeps a book about a dead lamplighter. "
                             "Old Wick. My gran says he hid something under the Rivergate. Nobody believes her. Nobody "
                             "believes grans.'", "options": [{"text": "Thanks, Pip."}]},
            "know": {"text": "'The lanterns in the market float 'cause of the Aether. The locks lift boats 'cause of the Aether. "
                             "My gran's knee stopped hurting 'cause of the Aether. Everything's the Aether.' Pip frowns. 'So "
                             "what happens if it stops?'", "options": [{"text": "...Good question."}]},
        },
    },
    "apprentice_tobbin": {
        "name": "Apprentice Tobbin", "title": "Conclave Apprentice (Third Year, Probationary)",
        "markers": [{"if": {"quest": ["sq_vw_cat", "not_started"]}, "marker": "!"},
                    {"if": {"stage": ["sq_vw_cat", "return"]}, "marker": "?"}],
        "entry": [{"if": {"quest": ["sq_vw_cat", "not_started"]}, "node": "start"},
                  {"if": {"stage": ["sq_vw_cat", "return"]}, "node": "return"},
                  {"if": {"quest": ["sq_vw_cat", "active"]}, "node": "waiting"},
                  {"node": "done"}],
        "nodes": {
            "start": {"text": "A young human in singed apprentice robes is pulling at his hair. 'It was a simple familiar "
                              "summoning! One cat! Mister Whiskers! And then I sneezed during the binding, and now there are... "
                              "several Mister Whiskers. Loose. In the city. If the Registrar finds out I'll be scrubbing "
                              "cauldrons until I'm ninety.'",
                      "options": [{"text": "I'll round up your cats.", "effects": [{"start_quest": "sq_vw_cat"}], "goto": "where"},
                                  {"text": "How many is 'several'?", "goto": "several"},
                                  {"text": "Not my problem."}]},
            "several": {"text": "'Three. Probably three. Four at most. They all look identical and they're all very smug. "
                                "The collars glow, at least.'",
                        "options": [{"text": "Fine. I'll find them.", "effects": [{"start_quest": "sq_vw_cat"}], "goto": "where"}]},
            "where": {"text": "'Thank you! Try the market — they love the fish stalls — the docks, and the Rivergate. Just "
                              "bring them back here and I'll recombine them. Probably.'",
                      "options": [{"text": "Probably?"}]},
            "waiting": {"text": "'Any luck? The market, the docks, the Rivergate!'", "options": [{"text": "Working on it."}]},
            "return": {"text": "Three identical cats glare at Tobbin from your arms. He chants something, sneezes, and they "
                               "fold into one very large, very smug cat. 'MISTER WHISKERS!' The cat looks at you. Then at "
                               "Tobbin. Then back at you. It seems to be deciding something.",
                       "options": [
                           {"text": "Give Mister Whiskers back to Tobbin.",
                            "effects": [{"complete_quest": "sq_vw_cat", "gold": 50, "rep": ["conclave", 5]}], "goto": "thanks"},
                           {"text": "[Charisma] The cat clearly prefers me.",
                            "check": {"stat": "cha", "dc": 13, "pass": "keep", "fail": "keep_fail"}},
                       ]},
            "thanks": {"text": "'You've saved my career! Here — my whole stipend. Well, most of it.' Mister Whiskers purrs.",
                       "options": [{"text": "Take care of him."}]},
            "keep": {"text": "Mister Whiskers leaps onto your shoulder and settles there like a furry stole. Tobbin sighs. "
                             "'...Honestly? He never liked me. Keep the collar lit, it helps with the static.'",
                     "effects": [{"flag": "has_cat", "item": "cat_collar", "achievement": "cat_of_many_lives"},
                                 {"complete_quest": "sq_vw_cat"}],
                     "options": [{"text": "Welcome aboard, Mister Whiskers."}]},
            "keep_fail": {"text": "Mister Whiskers bites you and leaps into Tobbin's arms. 'Ah. Well. Thank you anyway!'",
                          "effects": [{"complete_quest": "sq_vw_cat", "gold": 50}], "options": [{"text": "Ow."}]},
            "done": {"text": [{"text": "'Mister Whiskers is doing wonderfully. There's only one of him now. I check hourly.'",
                               "if": {"not_flag": "has_cat"}},
                              {"text": "Tobbin eyes the cat on your shoulder. 'He looks happy. Happier. It's fine. I'm fine.'",
                               "if": {"flag": "has_cat"}}],
                     "options": [{"text": "Good."}]},
        },
    },
    "registrar_quill": {
        "name": "Registrar Quill", "title": "Registrar of Licensed Magic",
        "markers": [{"if": {"quest": ["fq_vw_writ", "not_started"], "level_gte": 2}, "marker": "!"},
                    {"if": {"stage": ["fq_vw_writ", "return"]}, "marker": "?"}],
        "entry": [{"if": {"quest": ["fq_vw_writ", "not_started"], "level_gte": 2}, "node": "start"},
                  {"if": {"stage": ["fq_vw_writ", "return"]}, "node": "return"},
                  {"node": "idle"}],
        "nodes": {
            "start": {"text": "A pinched man behind a tall desk looks down his nose at you. 'You. You look underemployed. "
                              "The Conclave requires a writ served on an unlicensed practitioner on the docks — one \"Old "
                              "Marrow\", who has been selling unregistered healing charms. Serve it, and the Conclave will "
                              "consider you a friend. We have so few.'",
                      "options": [{"text": "I'll serve it.", "effects": [{"start_quest": "fq_vw_writ", "item": "conclave_writ", "flag": "met_faction:conclave"}]},
                                  {"text": "Healing charms? That sounds harmless.", "goto": "harmless"},
                                  {"text": "No thanks."}]},
            "harmless": {"text": "'Unlicensed healing is how one gets unlicensed plagues. Rules exist for reasons. Most of "
                                 "the reasons are fees, but some of them are plagues.'",
                         "options": [{"text": "Fine, I'll serve it.", "effects": [{"start_quest": "fq_vw_writ", "item": "conclave_writ", "flag": "met_faction:conclave"}]},
                                     {"text": "No thanks."}]},
            "return": {"text": [{"if": {"flag": "marrow_served"}, "text": "'Served? Excellent. Order is maintained. The Conclave thanks you.'"},
                                {"if": {"flag": "marrow_warned"}, "text": "'She'd vanished? How very convenient for her. Hm.'"},
                                {"if": {"flag": "marrow_license"}, "text": "'You want me to... license her. Hm.' He reviews Marrow's charms with a practiced eye."}],
                       "options": [
                           {"text": "She's a menace. Well done, the rules.", "if": {"flag": "marrow_served"},
                            "effects": [{"complete_quest": "fq_vw_writ", "rep": ["conclave", 15], "gold": 40}]},
                           {"text": "Must have just missed her.", "if": {"flag": "marrow_warned"},
                            "effects": [{"complete_quest": "fq_vw_writ", "rep": ["conclave", -5]}]},
                           {"text": "[Persuade] Her charms work. License her, and the Conclave gets its fees.",
                            "if": {"flag": "marrow_license"},
                            "check": {"stat": "persuade", "dc": 13, "pass": "license_yes", "fail": "license_no"}},
                       ]},
            "license_yes": {"text": "Quill sniffs. '...Fees. Yes. Very well. A provisional license.' He stamps a form so hard the "
                                    "desk jumps. 'Everyone wins. I hate it.'",
                            "effects": [{"complete_quest": "fq_vw_writ", "rep": ["conclave", 15], "gold": 40, "xp": 60,
                                         "flag": "marrow_licensed"}],
                            "options": [{"text": "Thank you, Registrar."}]},
            "license_no": {"text": "'Absolutely not. Serve the writ or don't come back.'",
                           "effects": [{"unflag": "marrow_license"}], "options": [{"text": "..."}]},
            "idle": {"text": "'Unless you are here to register a spell, I am extremely busy.'",
                     "options": [{"text": "Leave."}]},
        },
    },
    "old_marrow": {
        "name": "Old Marrow", "title": "Hedge-Witch",
        "entry": [{"if": {"stage": ["fq_vw_writ", "serve"]}, "node": "writ"}, {"node": "start"}],
        "nodes": {
            "start": {"text": "An old woman with a basket of knotted-string charms peers up at you. 'Charm for luck, dearie? "
                              "Charm for a bad knee? Charm for a cough? Two copper, and they work — which is more than the "
                              "Conclave can say for its taxes.'",
                      "options": [{"text": "Buy a charm (5 gold).", "if": {"gold_gte": 5}, "effects": [{"gold": -5, "item": "potion_heal_minor"}], "goto": "bought"},
                                  {"text": "Just passing."}]},
            "bought": {"text": "'There you are. Drink it, don't wear it. Common mistake.'", "options": [{"text": "Thanks."}]},
            "writ": {"text": "Marrow sees the Conclave seal on the writ and her shoulders sag. 'So they've finally sent "
                             "someone. Well. I suppose you'll be taking me in.'",
                     "options": [
                         {"text": "Serve the writ.", "effects": [{"flag": ["marrow_served", "marrow_gone"], "remove_item": "conclave_writ"},
                                                                  {"set_stage": ["fq_vw_writ", "return"]}], "goto": "served"},
                         {"text": "Run. I'll say I couldn't find you.",
                          "effects": [{"flag": ["marrow_warned", "marrow_gone"], "remove_item": "conclave_writ", "rep": ["lanterns", 5]},
                                      {"item": "potion_heal", "qty": 2}, {"set_stage": ["fq_vw_writ", "return"]}], "goto": "warned"},
                         {"text": "Let me try to get you licensed instead.",
                          "effects": [{"flag": "marrow_license"}, {"set_stage": ["fq_vw_writ", "return"]}], "goto": "license"},
                     ]},
            "served": {"text": "She takes the writ with trembling hands. 'I'll go quietly. Who'll mend the dockhands' cuts now, "
                               "I wonder.'", "options": [{"text": "[Leave]"}]},
            "warned": {"text": "'Bless you.' She presses two vials into your hands and is gone into the fog. 'Real ones. Not "
                               "the two-copper kind.'", "options": [{"text": "Good luck."}]},
            "license": {"text": "'Licensed? Me?' She cackles. 'Well, you can try, dearie. Quill hasn't smiled since the "
                                "Founding.'", "options": [{"text": "We'll see."}]},
        },
    },
    "nessa": {
        "name": "Nessa", "title": "Drowned Lantern Fence",
        "markers": [{"if": {"quest": ["fq_vw_package", "not_started"], "level_gte": 2}, "marker": "!"},
                    {"if": {"stage": ["fq_vw_package", "return"]}, "marker": "?"}],
        "entry": [{"if": {"quest": ["fq_vw_package", "not_started"], "level_gte": 2, "rep_gte": ["lanterns", -10]}, "node": "start"},
                  {"if": {"stage": ["fq_vw_package", "return"]}, "node": "return"},
                  {"node": "idle"}],
        "nodes": {
            "start": {"text": "A woman in a sea-green coat flips a knife idly. 'You've got honest eyes. That's useful. I've "
                              "got a package that needs to reach Pemberton in the market, and every Watch patrol knows my "
                              "face. Forty gold, and a friend in the Drowned Lanterns. Don't open it.'",
                      "options": [{"text": "Deal.", "effects": [{"start_quest": "fq_vw_package", "item": "smuggled_package", "flag": "met_faction:lanterns"}]},
                                  {"text": "What's in it?", "goto": "what"},
                                  {"text": "Let me see your wares.", "effects": [{"shop": "vw_lanterns_shop"}]},
                                  {"text": "No."}]},
            "what": {"text": "'Things that are none of your business. That's why it's wrapped.'",
                     "options": [{"text": "Fine. Deal.", "effects": [{"start_quest": "fq_vw_package", "item": "smuggled_package", "flag": "met_faction:lanterns"}]},
                                 {"text": "No."}]},
            "return": {"text": [{"text": "Nessa raises an eyebrow."},
                                {"if": {"flag": "package_opened"}, "text": "'The wrapping's been retied. Badly.' Her knife stops spinning."}],
                       "options": [{"text": "Delivered, as promised.", "if": {"flag": "package_delivered"},
                                    "effects": [{"complete_quest": "fq_vw_package", "rep": ["lanterns", 15]}]}]},
            "idle": {"text": "'Buying?'", "options": [{"text": "Show me.", "effects": [{"shop": "vw_lanterns_shop"}]},
                                                         {"text": "Not today."}]},
        },
    },
    "gate_sergeant": {
        "name": "Sergeant Brask", "title": "Gate Watch",
        "entry": [{"if": {"flag": "world_open"}, "node": "open"}, {"node": "closed"}],
        "nodes": {
            "closed": {"text": "'Captain's orders. You're on her books till the lock business is sorted. After that, the "
                               "whole world's yours. Mind the Redcaps.'", "options": [{"text": "Understood."}]},
            "open": {"text": "'Off into the wide world? Greymarch Road runs east to Emberfall Crossing — the heart of the "
                             "realm, they say. From there you can reach Sylvara and the dwarf-holds. Watch for Old Gnasher.'",
                     "effects": [{"discover": "greymarch"}],
                     "options": [{"text": "Thanks, Sergeant."}]},
        },
    },
}

# Package can be opened from inventory via a hidden feature in the Docks.
LOCATIONS["vw_market"]["features"].append(
    {"id": "package_temptation", "name": "Nessa's Package (in your pack)",
     "if": {"has_item": "smuggled_package", "not_flag": "package_opened"},
     "desc": "It's ticking. Faintly. You could just... peek.",
     "actions": [{"label": "Peek inside the package",
                  "check": {"stat": "dex", "dc": 12,
                            "pass": {"text": "You slip the knots and peek: a stolen Conclave focus-crystal, nestled in straw — "
                                             "and a very ordinary pocket-watch, which explains the ticking. You retie it "
                                             "perfectly. Nobody will ever know.",
                                     "effects": [{"achievement": "curiosity"}]},
                            "fail": {"text": "You peek: a stolen Conclave focus-crystal and a ticking pocket-watch. Retying "
                                             "the knots proves beyond you. It looks... handled.",
                                     "effects": [{"flag": "package_opened", "achievement": "curiosity"}]}}}]})

QUESTS = {
    "mq_vw_intro": {
        "name": "The Dimming Locks", "type": "main", "native_region": "valewatch", "region": "Valewatch", "level": "1-4",
        "summary": "Valewatch's Aether-locks are failing and lock-keepers are vanishing.",
        "start": "arrive",
        "stages": {
            "arrive": {"desc": "The Rivergate lock has failed and vermin are pouring out. Survive!",
                       "objectives": [{"id": "fight", "text": "Fight off the creatures at the lock", "cond": {"flag": "vw_tutorial_done"}}],
                       "on_complete": [{"xp": 20}], "next": "hesk"},
            "hesk": {"desc": "Captain Hesk of the Rivergate Watch wants a word.",
                     "objectives": [{"id": "talk", "text": "Speak with Captain Hesk at the Rivergate", "cond": {"flag": "talked_hesk_intro"}}],
                     "next": "investigate"},
            "investigate": {"desc": "Three lock-keepers have vanished and the locks are being drained. Hesk suggested "
                                    "examining the failed lock, consulting Magister Oriel, and finding Tam Two-Coins.",
                            "objectives": [
                                {"id": "lock", "text": "Examine the failed lock at the Rivergate", "cond": {"flag": "vw_clue_lock"}},
                                {"id": "oriel", "text": "Consult Magister Oriel on Guild Row (bring evidence)", "cond": {"flag": "vw_clue_oriel"}},
                                {"id": "tam", "text": "Find Tam Two-Coins in the Canal Docks", "cond": {"flag": "vw_clue_tam"}}],
                            "on_complete": [{"flag": "vw_undercroft_open", "xp": 50,
                                             "msg": "The clues all point below: the Undercroft, beneath the Canal Docks."}],
                            "next": "undercroft"},
            "undercroft": {"desc": "The Drowned Lanterns have built a siphon engine in the Undercroft. Find the missing "
                                   "lock-keepers. (Enter through the grate on the Canal Docks.)",
                           "objectives": [{"id": "keepers", "text": "Free the lock-keepers in the Siphon Works", "cond": {"flag": "vw_keepers_freed"}}],
                           "next": "brannoc"},
            "brannoc": {"desc": "The keepers named Brannoc the Lamp-Eater. He lairs in the old pump-house past the sluice.",
                        "objectives": [{"id": "boss", "text": "Defeat Brannoc the Lamp-Eater", "cond": {"flag": "vw_brannoc_defeated"}}],
                        "next": "choice"},
            "choice": {"desc": "Brannoc is beaten. Decide his fate.",
                       "objectives": [{"id": "fate", "text": "Decide Brannoc's fate", "cond": {"flag": "vw_brannoc_resolved"}}],
                       "next": "report"},
            "report": {"desc": "Report back to Captain Hesk at the Rivergate.",
                       "objectives": [{"id": "hesk", "text": "Report to Captain Hesk", "cond": {"flag": "vw_intro_reported"}}],
                       "next": None},
        },
        "rewards": {"xp": 200, "gold": 80, "rep": {"watch": 10}},
        "on_complete": [{"flag": "vw_intro_done"},
                        {"if": NATIVE, "open_world": True, "start_quest": "mq_keystones"},
                        {"if": NATIVE, "msg": "The Greymarch Gate is open to you. The world awaits — but Magister Oriel "
                                              "will want to see Brannoc's letter first."}],
    },
    "mq_ks_valewatch": {
        "name": "The Sunken Archive", "type": "main", "region": "Valewatch", "level": "5-9",
        "summary": "Unbound agents have broken into the Sunken Archive beneath the Lantern Conclave to steal the Valewatch Keystone.",
        "start": "descend",
        "stages": {
            "descend": {"desc": "Descend the Archive Stair on Guild Row and stop whoever has broken in.",
                        "objectives": [{"id": "wards", "text": "Pass the Hall of Echoing Wards", "cond": {"flag": "sa_door_open"}}],
                        "next": "vault"},
            "vault": {"desc": "The ward-door is open. The Founders' Vault lies beyond the Reliquary.",
                      "objectives": [{"id": "vessa", "text": "Stop the intruder in the Founders' Vault", "cond": {"flag": "vessa_defeated"}},
                                     {"id": "stone", "text": "Claim the Valewatch Keystone", "cond": {"has_item": "keystone_valewatch"}}],
                      "next": None},
        },
        "rewards": {"xp": 400, "gold": 120, "rep": {"conclave": 20}},
        "on_complete": [{"achievement": "first_keystone"}],
    },
    "sq_vw_cat": {
        "name": "Mister Whiskers (All of Him)", "type": "side", "region": "Valewatch", "level": "1+",
        "summary": "Apprentice Tobbin's familiar has split into several identical, smug cats.",
        "start": "catch",
        "stages": {
            "catch": {"desc": "Find the duplicated cats: try the Lantern Market, the Canal Docks and the Rivergate Locks.",
                      "objectives": [{"id": "cats", "text": "Catch the cats (market, docks, Rivergate)", "cond": {"counter_gte": ["cats_caught", 3]}}],
                      "next": "return"},
            "return": {"desc": "Return the cats to Apprentice Tobbin on Guild Row.",
                       "objectives": [{"id": "tobbin", "text": "Return to Tobbin", "cond": {"flag": "never"}}],
                       "next": None},
        },
        "rewards": {"xp": 120},
    },
    "fq_vw_writ": {
        "name": "Unlicensed Magic", "type": "faction", "region": "Valewatch", "level": "2+",
        "summary": "The Lantern Conclave wants a writ served on Old Marrow, an unlicensed hedge-witch on the docks.",
        "start": "serve",
        "stages": {
            "serve": {"desc": "Find Old Marrow on the Canal Docks and deal with the writ.",
                      "objectives": [{"id": "marrow", "text": "Deal with Old Marrow", "cond": {"any": [{"flag": "marrow_served"}, {"flag": "marrow_warned"}, {"flag": "marrow_license"}]}}],
                      "next": "return"},
            "return": {"desc": "Return to Registrar Quill on Guild Row.",
                       "objectives": [{"id": "quill", "text": "Report to Registrar Quill", "cond": {"flag": "never"}}], "next": None},
        },
        "rewards": {"xp": 100},
    },
    "fq_vw_package": {
        "name": "A Delicate Delivery", "type": "faction", "region": "Valewatch", "level": "2+",
        "summary": "Nessa of the Drowned Lanterns needs a package delivered to Pemberton in the Lantern Market.",
        "start": "deliver",
        "stages": {
            "deliver": {"desc": "Deliver Nessa's package to Pemberton in the Lantern Market. Don't open it.",
                        "objectives": [{"id": "deliver", "text": "Deliver the package to Pemberton", "cond": {"flag": "package_delivered"}}],
                        "next": "return"},
            "return": {"desc": "Tell Nessa the job is done.",
                       "objectives": [{"id": "nessa", "text": "Return to Nessa on the Canal Docks", "cond": {"flag": "never"}}], "next": None},
        },
        "rewards": {"xp": 100, "gold": 20},
    },
    "hq_vw_ballad": {
        "name": "The Lamplighter's Ballad", "type": "hidden", "region": "Valewatch", "level": "1+",
        "summary": "An old ballad hints that Aldous Wick, the last lamplighter, hid something where the water sings.",
        "start": "search",
        "stages": {
            "search": {"desc": "'Where the water sings beneath the gate, the last light waits.' The ballad of Aldous Wick "
                               "suggests something hidden beneath the Rivergate — perhaps in the Undercroft's overflow tunnels.",
                       "objectives": [{"id": "find", "text": "Find where the water sings", "cond": {"flag": "wick_found"}}],
                       "next": None},
        },
        "rewards": {"xp": 150},
        "on_complete": [{"achievement": "last_light"}],
    },
}

LORE = {
    "aether_primer": {"title": "A Primer on the Aether", "text":
        "The Aether is the luminous substrate through which all magic flows. It rises from the deep places of the world "
        "along ley-lines and river-lines, and may be drawn, shaped and spent by any trained practitioner. It is "
        "inexhaustible. (A later hand has written in the margin: 'Citation needed.')"},
    "ballad_wick": {"title": "The Ballad of Aldous Wick", "text":
        "Aldous Wick, the last lamplighter of Valewatch, lit the city's oil lamps for forty years until the Aether-lanterns "
        "made him obsolete. The ballad ends:\n\n'He laid his oath where the water sings,\nbeneath the gate where the river "
        "springs;\nwhen the new lights fail, as all lights do,\nthe last light waits for someone true.'",
        "effects": [{"start_quest": "hq_vw_ballad"}]},
    "conclave_founding": {"title": "The Founding of the Conclave", "text":
        "The Lantern Conclave was founded four hundred years ago by the Seven Founders, who built the first Aether-lock "
        "over 'a singing stone found in the riverbed.' Footnote 14: 'The stone was sealed beneath the Conclave in the "
        "Archive, per the Founders' final instruction: KEEP IT SAFE. NEVER ASK WHAT IT UNLOCKS.'"},
    "wick_note": {"title": "Wick's Note", "text":
        "'For whoever keeps the lights next. I kept the lamps because I didn't trust the new lights. Not because they "
        "were magic — because nobody could tell me where the magic came from. A light you don't understand is just a "
        "darkness that hasn't happened yet. — A. Wick.'"},
    "brannoc_ledger": {"title": "Brannoc's Ledger", "text":
        "Payments from 'I.M.' via the Morrow Consortium: 400 crowns for 'lock-starving', 250 for 'keeper rental', and a "
        "note: 'Archive wards draw on lock network. Starve locks → starve wards → Crane goes in.'"},
    "brannoc_confession": {"title": "Brannoc's Confession", "text":
        "Brannoc named his buyer: Ilvane Morrow, through her lieutenant Vessa Crane. The Unbound have agents in Sylvara "
        "and beneath Kharum-Dur, all hunting 'the same kind of stone'."},
    "unbound_letter_vw": {"title": "Sealed Letter to Brannoc", "text":
        "'B. — Keep the locks starved until the solstice. The Archive wards must be weak when my Crane descends. Your "
        "gauntlet is a loan; do not become attached to it. The Aether is a cage, and I am nearly finished picking the "
        "lock. — I.M.' Sealed with a broken ring."},
    "vessa_journal": {"title": "Field Notes of V. Crane", "text":
        "'Day 9. The wards are sputtering, as Ilvane promised. The Archive is flooded to the knees. I. says the stone "
        "will 'answer to its sisters' — one in Sylvara, one under the dwarf mountain. When all three sing together, the "
        "Vault opens. I asked what's in the Vault. She said \"the truth.\" She says that a lot.'"},
    "founders_tablet": {"title": "The Founders' Tablet", "text":
        "'Here the Seven raised the first lock upon the Singing Stone, which we did not make and do not understand. It "
        "hummed with a power that was not ours. We borrowed it. Let those who come after remember: it was BORROWED.'"},
    "vessa_last_words": {"title": "Vessa's Warning", "text":
        "'That ring isn't a key to a door. It's a key to a cage. Ilvane will open it with or without your stones. She's "
        "already at the Scar.'"},
    "three_rings": {"title": "Three Keys to the Vault", "text":
        "A children's counting rhyme, found in Valewatch, Sylvara and Kharum-Dur alike:\n'One for the river, one for the "
        "root,\none for the mountain's deepest boot.\nThree keys turning, three rings sing —\nopen the vault of the ashen "
        "king.'"},
}
