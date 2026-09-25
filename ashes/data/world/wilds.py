"""The open wilds: Greymarch Road (+ Drowned Chapel), the Mistvale (+ Whispering Tower), the Iron Pass,
and the Ashen Scar that leads to the Aether Vault."""

LOCATIONS = {
    # ---------------- Greymarch Road ----------------
    "gm_road": {
        "name": "Greymarch Road", "region": "greymarch", "biome": "road", "travel": "greymarch", "danger": "moderate",
        "desc": "An old paved road running west through marsh and moor, its milestones carved with the sigil of a "
                "long-disbanded order of road-wardens. Fog pools in the ditches. Somewhere out in the marsh, very "
                "faintly, a bell is ringing.",
        "features": [
            {"id": "warden_cairn", "name": "The Warden's Cairn", "hidden": 11,
             "desc": "A mossy cairn off the road, topped with a rusted helm. An inscription: 'HERE STANDS THE LAST WARDEN "
                     "OF GREYMARCH. HE STILL KEEPS THE ROAD.'",
             "actions": [
                 {"label": "Pay your respects", "if": {"quest": ["sq_gm_warden", "not_started"]},
                  "text": "As you bow, cold mist gathers into the shape of an armored man, translucent and weary. 'Traveler. "
                          "The dead walk my road — hungry things, ghouls. I cannot rest while they prey on the living. "
                          "Put four of them down, and I will give you what I carried.'",
                  "effects": [{"start_quest": "sq_gm_warden"}]},
                 {"label": "Tell the Warden the road is safe", "if": {"stage": ["sq_gm_warden", "return"]},
                  "text": "The Warden's shade straightens. 'Then I may rest. Take my blade. It still wants to protect "
                          "travelers — let it protect you.' The mist thins, and he is gone. Where he stood, a sword lies "
                          "across the cairn, gleaming as if newly forged.",
                  "effects": [{"unique": "u_greymarch_blade"}, {"complete_quest": "sq_gm_warden"}]},
             ]},
            {"id": "milestone", "name": "An Old Milestone", "desc": "Carved with distances to places that no longer exist.",
             "actions": [{"label": "Read the milestone", "once": True,
                          "text": "'VALEWATCH 40. EMBERFALL 12. AURUM 3.' There is no Aurum. There is a very large marsh "
                                  "three miles west.",
                          "effects": [{"xp": 10, "lore": "aurum"}]}]},
        ],
        "exits": [{"to": "gm_wallow", "label": "Follow the churned mud to the wallow"},
                  {"to": "dc_nave", "label": "Follow the bell into the marsh"}],
        "random": {"chance": 0.35, "table": ["enc_gm_ghouls", "enc_gm_wolves", "enc_gm_ghouls"]},
        "discover_xp": 25,
    },
    "gm_wallow": {
        "name": "Gnasher's Wallow", "region": "greymarch", "biome": "marsh", "danger": "boss",
        "desc": [{"text": "A trampled clearing of mud and splintered trees. Bones everywhere — cattle, deer, a cart-horse, "
                          "and one very unlucky tax collector's hat. Something enormous sleeps in the mud, snoring like a "
                          "landslide."},
                 {"if": {"flag": "gnasher_defeated"}, "text": "The wallow is quiet. Flies have found Old Gnasher."}],
        "exits": [{"to": "gm_road", "label": "Back to the road"}],
        "encounter": {"id": "enc_gm_gnasher"},
        "discover_xp": 20,
    },
    "dc_nave": {
        "name": "The Drowned Chapel: Nave", "region": "greymarch", "biome": "chapel_drowned", "danger": "high",
        "desc": [{"text": "A stone chapel half-sunk in black marsh water, its pews floating, its windows green with "
                          "algae. Water laps at the altar. The bell above you rings every few minutes — though the "
                          "bell-tower collapsed a century ago and the rope hangs down into the water."},
                 {"if": {"flag": "bellwraith_defeated"}, "text": "The bell is silent. The water is still."}],
        "features": [
            {"id": "chapel_altar", "name": "The Drowned Altar", "desc": "An altar with an empty iron bracket where a bell-clapper once hung as a relic.",
             "actions": [{"label": "Return the bell clapper to the altar", "if": {"has_item": "chapel_bell_clapper"},
                          "text": "You hang the dripping clapper in its bracket. The chapel water drains away with a long "
                                  "sigh, and for a moment you hear a congregation singing, very far away. On the altar, "
                                  "where the water was, lies a ring.",
                          "effects": [{"remove_item": "chapel_bell_clapper", "unique": "u_chapel_bell_ring", "xp": 100,
                                       "achievement": "for_whom", "flag": "chapel_rested"},
                                      {"complete_quest": "xq_chapel"}]}]},
            {"id": "hymnals", "name": "Floating Hymnals", "desc": "Sodden prayer books.",
             "actions": [{"label": "Read a hymnal", "effects": [{"lore": "drowned_hymn"}], "text": "Most pages have washed blank."}]},
        ],
        "exits": [{"to": "gm_road", "label": "Back to the road"}, {"to": "dc_crypt", "label": "Down into the flooded crypt"}],
        "on_enter": [{"once": "q", "effects": [{"start_quest": "xq_chapel"}]}],
        "encounter": {"id": "enc_dc_nave"},
        "discover_xp": 30,
    },
    "dc_crypt": {
        "name": "The Drowned Chapel: Bell Crypt", "region": "greymarch", "biome": "chapel_drowned", "danger": "boss",
        "desc": [{"text": "Waist-deep water, freezing. At the crypt's center, the fallen bell lies on its side, and "
                          "inside it something pale and long-limbed pulls the bell-rope, over and over, singing a hymn "
                          "with no breath in it."},
                 {"if": {"flag": "bellwraith_defeated"}, "text": "The fallen bell lies silent."}],
        "exits": [{"to": "dc_nave", "label": "Back up to the nave"}],
        "encounter": {"id": "enc_dc_bellwraith"},
        "discover_xp": 30,
    },

    # ---------------- Mistvale ----------------
    "mv_mistvale": {
        "name": "The Mistvale", "region": "mistvale", "biome": "forest_mist", "travel": "mistvale", "danger": "moderate",
        "desc": "A deep valley south of Sylvara where the mist never lifts. Pale trees rise out of it like the masts "
                "of sunken ships, strung with webs the size of sails. Things skitter in the white.",
        "npcs": [{"id": "hermit_oona"}],
        "features": [
            {"id": "faint_path", "name": "A Faint Path in the Mist", "hidden": 13,
             "desc": "Barely visible: a path of worn flagstones leading toward a dark shape in the mist.",
             "actions": [{"label": "Follow it", "once": True,
                          "text": "The flagstones lead to the foot of a tower you're sure wasn't there a moment ago.",
                          "effects": [{"flag": "found_tower"}, {"start_quest": "hq_sy_whisper"}]}]},
        ],
        "exits": [{"to": "mv_lair", "label": "Toward the thickest webs"},
                  {"to": "mv_tower", "label": "The tower in the mist",
                   "if": {"any": [{"quest": ["hq_sy_whisper", "started"]}, {"flag": "found_tower"}]},
                   "show_if": {"any": [{"quest": ["hq_sy_whisper", "started"]}, {"flag": "found_tower"}]}}],
        "random": {"chance": 0.35, "table": ["enc_mv_spiders", "enc_mv_wolves"]},
        "discover_xp": 25,
    },
    "mv_lair": {
        "name": "The Widow's Lair", "region": "mistvale", "biome": "forest_mist", "danger": "boss",
        "desc": [{"text": "A hollow in the valley wall, curtained in web so thick it muffles sound. Cocooned shapes hang "
                          "from the ceiling — deer, wolves, one very surprised-looking dwarf, long dead. In the center, "
                          "something grey and vast unfolds too many legs."},
                 {"if": {"flag": "widow_defeated"}, "text": "The webs sag, abandoned."}],
        "features": [
            {"id": "cocoons", "name": "Cocooned Shapes", "desc": "Victims of the Widow.",
             "actions": [{"label": "Cut open the dwarf's cocoon", "once": True, "if": {"flag": "widow_defeated"},
                          "text": "The dwarf had a pack. Inside: rations (inedible), a letter to his mother (heartbreaking), "
                                  "and his savings.",
                          "effects": [{"gold": 90}, {"loot": "chest"}]}]},
        ],
        "exits": [{"to": "mv_mistvale", "label": "Back into the mist"}],
        "encounter": {"id": "enc_mv_widow"},
        "discover_xp": 20,
    },
    "mv_tower": {
        "name": "The Whispering Tower", "region": "mistvale", "biome": "tower_ancient", "danger": "high",
        "desc": [{"text": "A slender tower of pale stone, older than Sylvara, its walls covered in carved stars. The "
                          "stairs spiral up into darkness. The whispering is louder here — many voices, overlapping, "
                          "counting."},
                 {"if": {"flag": "tower_top"},
                  "text": "At the top of the tower, the great star-dial is aligned, and the whispers have fallen silent."}],
        "features": [
            {"id": "star_inscription", "name": "Inscription on the Stair", "desc": "Carved at the base of the stairs.",
             "actions": [{"label": "Read the inscription",
                          "text": "'Count them as we counted: from the smallest light to the greatest. Then the tower will "
                                  "remember what the roots forgot.'"}]},
            {"id": "constellations", "name": "The Carved Constellations", "desc": "Three constellations on the walls.",
             "actions": [{"label": "Count the stars in each constellation",
                          "text": "The LANTERN has three stars. The BOW has five. The ANVIL has seven."}]},
            {"id": "star_dial", "name": "The Great Star-Dial", "if": {"not_flag": "tower_top"},
             "desc": "At the top of the stair: a dial with three rings, each engraved with a constellation.",
             "actions": [
                 {"label": "Align: Lantern, Bow, Anvil",
                  "text": "The rings turn with a sound like a held breath let go. Starlight pours down through the roof "
                          "and paints a map across the floor: stars you have never seen, around a great dark hollow. The "
                          "whispers stop. In the silence, a single voice: 'They sealed it with themselves. Remember us.'",
                  "effects": [{"flag": "tower_top", "item": "star_chart"}, {"item": "whispering_shard"}, {"xp": 150},
                              {"lore": "star_chart"}]},
                 {"label": "Align: Anvil, Bow, Lantern",
                  "text": "The dial locks, then spins back violently. The whispers become shrieks and shapes pour from the walls!",
                  "effects": [{"combat": "enc_mv_tower_guard"}]},
                 {"label": "Align: Bow, Lantern, Anvil",
                  "text": "The dial grinds. Something in the stone disapproves of you, on a personal level.",
                  "effects": [{"damage_pct": 12}]},
             ]},
        ],
        "exits": [{"to": "mv_mistvale", "label": "Back into the mist"}],
        "encounter": {"id": "enc_mv_tower"},
        "discover_xp": 30,
    },

    # ---------------- Iron Pass ----------------
    "ip_ironpass": {
        "name": "The Iron Pass", "region": "ironpass", "biome": "mountain", "travel": "ironpass", "danger": "moderate",
        "desc": [{"text": "A high mountain pass between Kharum-Dûr and the northern lowlands, walled with iron-grey "
                          "cliffs. The wind never stops. Storm-clouds cling to the peaks above, and every so often "
                          "lightning strikes the same crag, again and again."},
                 {"if": {"not_flag": "rockslide_cleared"},
                  "text": "A rockslide has blocked the road. A dwarven caravan waits behind it, its drivers arguing."}],
        "npcs": [{"id": "caravan_master_dunn"}],
        "features": [
            {"id": "rockslide", "name": "The Rockslide", "if": {"not_flag": "rockslide_cleared"}, "desc": "Tons of broken stone across the road.",
             "actions": [
                 {"label": "[Strength] Shift the keystone boulder", "check": {"stat": "str", "dc": 14,
                  "pass": {"text": "You heave, and the whole slide shifts with a roar. The road is clear!",
                           "effects": [{"flag": "rockslide_cleared", "xp": 60, "rep": ["deepwardens", 5]}]},
                  "fail": {"text": "The boulder doesn't move. Your back does something unpleasant.", "effects": [{"damage_pct": 8}]}}},
                 {"label": "Blast it with a Fire Flask", "if": {"has_item": "fire_flask"},
                  "text": "You wedge the flask, light it, and run. BOOM. The slide collapses into gravel. The dwarves cheer.",
                  "effects": [{"remove_item": "fire_flask", "flag": "rockslide_cleared", "xp": 60, "rep": ["deepwardens", 5]}]},
                 {"label": "[Intelligence] Find the slide's weak point", "check": {"stat": "int", "dc": 13,
                  "pass": {"text": "You spot the one stone holding the rest. A few careful taps, and the slide slumps aside.",
                           "effects": [{"flag": "rockslide_cleared", "xp": 60, "rep": ["deepwardens", 5]}]},
                  "fail": {"text": "It looks like... rocks. A lot of rocks."}}},
             ]},
        ],
        "exits": [{"to": "ip_eyrie", "label": "Climb toward the lightning-struck crag"}],
        "random": {"chance": 0.35, "table": ["enc_ip_wolves", "enc_ip_golems"]},
        "discover_xp": 25,
    },
    "ip_eyrie": {
        "name": "The Stormcrow's Eyrie", "region": "ironpass", "biome": "mountain_peak", "danger": "boss",
        "desc": [{"text": "The crag's summit: a nest woven from broken wagon-wheels and lightning-fused branches, "
                          "littered with shiny things. Rain hammers down. Perched on the nest's rim, wings mantled, is a "
                          "crow the size of a house, feathers crackling with blue fire."},
                 {"if": {"flag": "stormcrow_defeated"}, "text": "The storm has broken. The nest is full of shiny things."}],
        "features": [
            {"id": "shiny_hoard", "name": "The Shiny Hoard", "if": {"flag": "stormcrow_defeated"}, "desc": "Everything shiny the Stormcrow ever stole.",
             "actions": [{"label": "Sift through the hoard", "once": True,
                          "text": "Buckles, spoons, a crown (brass), a crown (paper), and some genuinely valuable things.",
                          "effects": [{"gold": 150}, {"loot": "boss"}, {"achievement": "shiny"}]}]},
        ],
        "exits": [{"to": "ip_ironpass", "label": "Climb back down"}],
        "encounter": {"id": "enc_ip_stormcrow"},
        "discover_xp": 20,
    },

    # ---------------- The Ashen Scar ----------------
    "as_ridge": {
        "name": "The Ashen Scar: Ridge", "region": "ashen_scar", "biome": "ash", "travel": "ashen_scar", "danger": "high",
        "desc": "The land ends. Beyond the ridge, a vast grey bowl of ash stretches to the horizon, miles wide, "
                "perfectly silent. Nothing grows. No birds fly over it. The ash moves in slow currents though there is no "
                "wind, and in the currents, sometimes, there are shapes.",
        "exits": [{"to": "as_camp", "label": "Descend toward the abandoned camp"}],
        "on_enter": [{"once": "arrive",
                      "text": "As your boots touch the ash, the three Keystones in your pack begin to hum — together, "
                              "louder than ever, pulling east like a compass.",
                      "effects": [{"achievement": "ashes_to_ashes"}]}],
        "random": {"chance": 0.35, "table": ["enc_as_wraiths"]},
        "encounter": {"id": "enc_as_ridge"},
        "discover_xp": 40,
    },
    "as_camp": {
        "name": "The Ashen Scar: Unbound Camp", "region": "ashen_scar", "biome": "ash", "danger": "high",
        "desc": "An Unbound encampment, recently abandoned: tents half-buried in ash, crates of drained Aether-cores "
                "stacked like firewood — hundreds of them. A command tent stands at the center, its flap tied open.",
        "npcs": [{"id": "deserter_ansel", "if": {"not_flag": "ansel_gone"}}],
        "rest": "camp",
        "features": [
            {"id": "command_tent", "name": "Ilvane's Command Tent", "desc": "Maps, instruments and a writing desk.",
             "actions": [{"label": "Search the desk", "once": True,
                          "text": "Under a paperweight shaped like a broken ring: a leather journal, its pages dense with an "
                                  "elegant, increasingly unsteady hand.",
                          "effects": [{"item": "ashen_journal", "flag": "found_journal"}]}]},
            {"id": "core_crates", "name": "Drained Aether-Cores", "desc": "Hundreds of grey, emptied cores.",
             "actions": [{"label": "Examine the cores", "once": True,
                          "text": "Every core has been drained to grey dust. Ilvane has poured more Aether into this place "
                                  "than all of Valewatch uses in a year. Pour it into what?",
                          "effects": [{"xp": 20, "lore": "drained_cores"}]}]},
        ],
        "exits": [{"to": "as_ridge", "label": "Back up to the ridge"}, {"to": "as_crater", "label": "Deeper into the Scar"}],
        "discover_xp": 30,
    },
    "as_crater": {
        "name": "The Ashen Scar: The Crater", "region": "ashen_scar", "biome": "ash", "danger": "high",
        "desc": "The ash slopes down into a crater. Half-buried shapes jut from its sides — pillars, arches, the tops "
                "of towers. A city lies beneath the ash, and it was not built by any people you know. Knights of ash "
                "stand sentinel along the path, and some of them turn to watch you pass.",
        "exits": [{"to": "as_camp", "label": "Back to the camp"}, {"to": "as_gate", "label": "Down to the crater floor"}],
        "encounter": {"id": "enc_as_crater"},
        "random": {"chance": 0.3, "table": ["enc_as_wraiths", "enc_as_knights"]},
        "discover_xp": 30,
    },
    "as_gate": {
        "name": "The Ashen Scar: The Threshold", "region": "ashen_scar", "biome": "ash", "danger": "high",
        "desc": "At the crater's floor, a staircase of black stone descends into the earth, flanked by two colossal "
                "statues with their faces worn away. Unbound acolytes guard the stair — the last of Ilvane's rearguard.",
        "exits": [{"to": "as_crater", "label": "Back up the crater"},
                  {"to": "av_gate", "label": "Descend the black stair", "if": {"flag": "threshold_cleared"},
                   "locked": "The Unbound rearguard holds the stair."}],
        "encounter": {"id": "enc_as_gate"},
        "discover_xp": 30,
    },
}

ENCOUNTERS = {
    "enc_gm_ghouls": {"title": "Highway Ghouls", "level": [4, 9], "enemies": ["highway_ghoul", "highway_ghoul"]},
    "enc_gm_wolves": {"title": "Dire Wolves", "level": [4, 9], "enemies": ["dire_wolf", "dire_wolf"]},
    "enc_gm_gnasher": {"title": "Old Gnasher", "boss": True, "level": [5, 9],
                       "intro": "Old Gnasher lurches out of the mud, tusks like scythes. (When it lowers its head for a "
                                "Gore Rush, brace yourself with Defend or interrupt it.)",
                       "enemies": ["old_gnasher"],
                       "on_victory": [{"flag": "gnasher_defeated", "unique": "u_gnasher_tusk", "item": "bounty_proof"}]},
    "enc_dc_nave": {"title": "The Drowned Congregation", "level": [6, 10],
                    "intro": "Figures rise from the flooded pews, robes streaming water.",
                    "enemies": ["drowned_acolyte", "drowned_acolyte", "highway_ghoul"]},
    "enc_dc_bellwraith": {"title": "The Bellwraith", "boss": True, "level": [8, 11],
                          "intro": "The Bellwraith turns from its rope. Its hymn stops. That's worse. (The Drowned Toll "
                                   "silences — Defend when it winds up. It calls the drowned when hurt.)",
                          "enemies": ["bellwraith"],
                          "on_victory": [{"flag": "bellwraith_defeated", "item": "chapel_bell_clapper"}]},
    "enc_mv_spiders": {"title": "Mist Spiders", "level": [5, 10], "enemies": ["blight_spider", "blight_spider", "blight_spider"]},
    "enc_mv_wolves": {"title": "Mist Wolves", "level": [5, 10], "enemies": ["dire_wolf", "thorn_wolf"]},
    "enc_mv_widow": {"title": "The Grey Widow", "boss": True, "level": [7, 10],
                     "intro": "The Grey Widow descends on a thread thick as a rope. (She spawns spiderlings — keep them "
                              "down, and carry antidotes.)",
                     "enemies": ["grey_widow", "blight_spider"],
                     "on_victory": [{"flag": "widow_defeated", "unique": "u_widow_silk", "item": "bounty_proof"}]},
    "enc_mv_tower": {"title": "Tower Echoes", "level": [6, 10],
                     "intro": "The whispers take shape: pale echoes of the tower's builders, and they do not want visitors.",
                     "enemies": ["barrow_shade", "barrow_shade", ["lattice_spark", "back"]]},
    "enc_mv_tower_guard": {"title": "The Tower Rejects You", "level": [6, 10],
                           "enemies": ["barrow_shade", "spirit_moth_swarm", ["lattice_spark", "back"]],
                           "on_victory": [{"msg": "The echoes fade. The dial waits, patient as stone."}]},
    "enc_ip_wolves": {"title": "Pass Wolves", "level": [5, 10], "enemies": ["dire_wolf", "dire_wolf", "dire_wolf"]},
    "enc_ip_golems": {"title": "Wandering Golems", "level": [5, 10], "enemies": ["rune_golem", "rune_golem"]},
    "enc_ip_stormcrow": {"title": "The Stormcrow", "boss": True, "level": [8, 11],
                         "intro": "The Stormcrow screams and the sky answers. (It's immune to lightning and weak to "
                                  "frost. Brace for its Thunderdive.)",
                         "enemies": ["stormcrow"],
                         "on_victory": [{"flag": "stormcrow_defeated", "unique": "u_stormcrow_feather", "item": "bounty_proof"}]},
    "enc_as_wraiths": {"title": "Ash Wraiths", "level": [9, 12], "enemies": ["ash_wraith", "ash_wraith"]},
    "enc_as_knights": {"title": "Ashbound Sentinels", "level": [9, 12], "enemies": ["ashbound_knight", "ash_wraith"]},
    "enc_as_ridge": {"title": "The Ash Rises", "level": [9, 12],
                     "intro": "The ash heaves. Shapes pull themselves out of it — wraiths, faces without features, reaching.",
                     "enemies": ["ash_wraith", "ash_wraith", "ash_wraith"]},
    "enc_as_crater": {"title": "The Oathbound", "level": [9, 12],
                      "intro": "Two ashbound knights step off their plinths and raise their blades in salute. Then they attack.",
                      "enemies": ["ashbound_knight", "ashbound_knight", ["lattice_spark", "back"]]},
    "enc_as_gate": {"title": "The Unbound Rearguard", "level": [9, 12],
                    "intro": "'The High Artificer said you'd come,' the lead spellblade says. 'She said to let you through, "
                             "after we'd made sure you were worthy.' She draws her blade. 'Let's make sure.'",
                    "enemies": ["unbound_spellblade", "unbound_spellblade", ["unbound_acolyte", "back"], ["unbound_acolyte", "back"]],
                    "on_victory": [{"flag": "threshold_cleared"}]},
}

SHOPS = {
    "oona_herbs": {"name": "Oona's Remedies", "greeting": "'Roots, mushrooms, and a few things that bite back.'",
                   "stock": ["potion_heal", "potion_heal_greater", "potion_mana", "antidote", "moonpetal_tea", "aether_tincture"],
                   "random": 0, "bases": []},
}

DIALOGUES = {
    "hermit_oona": {
        "name": "Old Oona", "title": "Hermit of the Mistvale",
        "entry": [{"node": "start"}],
        "nodes": {
            "start": {"text": "A tiny old woman in a coat of moss sits on a stump, smoking a pipe that smells of burnt "
                              "honey. 'Oh, a visitor! Don't mind the spiders, they're mostly polite. Mostly.'",
                      "options": [{"text": "What do you sell?", "effects": [{"shop": "oona_herbs"}]},
                                  {"text": "Is there anything strange in the Mistvale?", "goto": "strange"},
                                  {"text": "Farewell."}]},
            "strange": {"text": "'Strange? Dearie, the mist is strange. The spider-queen's strange. And there's a tower "
                                "that's only there when you're looking for it properly.' She taps her nose. 'Look "
                                "carefully. Search, as they say.'", "effects": [{"flag": "oona_hint"}],
                        "options": [{"text": "Thank you.", "goto": "start"}]},
        },
    },
    "caravan_master_dunn": {
        "name": "Caravan-Master Dunn", "title": "Dwarven Freight Company",
        "entry": [{"if": {"flag": "rockslide_cleared"}, "node": "cleared"}, {"node": "start"}],
        "nodes": {
            "start": {"text": "A dwarf with a magnificent orange beard throws up his hands. 'Three days! Three days "
                              "stuck behind this rockslide with a wagon full of perishable cheese! If you can clear the "
                              "road, the Company will pay you handsomely.'",
                      "options": [{"text": "I'll see what I can do."}]},
            "cleared": {"text": "'The road's open! The cheese lives! Here — payment, and a wheel of the good stuff.'",
                        "options": [{"text": "Thank you.", "once": "paid",
                                     "effects": [{"gold": 100, "xp": 40, "item": "dwarven_stout", "qty": 3,
                                                  "achievement": "cheese_rescuer"}]},
                                    {"text": "Safe travels."}]},
        },
    },
    "deserter_ansel": {
        "name": "Ansel", "title": "Unbound Deserter",
        "entry": [{"node": "start"}],
        "nodes": {
            "start": {"text": "A young man in torn Unbound robes huddles by a cold firepit, clutching his knees. He "
                              "flinches when he sees you. 'Don't — please. I'm not with them anymore. Not since we went "
                              "down there. Not since I read the walls.'",
                      "options": [{"text": "What's down there?", "goto": "down"},
                                  {"text": "[Intimidate] Talk, or I'll make you.", "check": {"stat": "intimidate", "dc": 10, "pass": "down", "fail": "clam"}},
                                  {"text": "Get out of here. Go home.", "goto": "home"}]},
            "down": {"text": "'The Vault. It's... it's a tomb, and a machine, and a prayer, all at once. The walls are "
                             "covered in names. Ilvane read them and laughed and laughed, and then she stopped laughing.' "
                             "He shivers. 'There's a Warden — a guardian, all hollow — with pylons that shield it. Break "
                             "the pylons first. And the Lattice: the beams have to meet at the heart. Flame left, Frost "
                             "right, Storm above. She made us memorize it.'",
                     "effects": [{"flag": ["ansel_info", "lattice_hint"], "lore": "ansel_account"}],
                     "options": [{"text": "Thank you. Go home, Ansel.", "goto": "home"}]},
            "clam": {"text": "Ansel curls tighter and won't meet your eye. 'The Lattice,' he mumbles finally. 'Flame "
                             "left. That's all I remember. Please go.'",
                     "effects": [{"flag": "ansel_partial"}], "options": [{"text": "(Leave him.)"}]},
            "home": {"text": "Ansel nods jerkily, gathers a pack, and stumbles west across the ash. 'Thank you,' he calls "
                             "back. 'Don't let her open it. Or — don't let her close it. I don't know anymore.'",
                     "effects": [{"flag": "ansel_gone", "xp": 30}], "options": [{"text": "(Watch him go.)"}]},
        },
    },
}

QUESTS = {
    "sq_gm_warden": {
        "name": "The Last Warden", "type": "side", "region": "Greymarch Road", "level": "5+",
        "summary": "The shade of Greymarch Road's last warden cannot rest while ghouls prey on travelers.",
        "start": "hunt",
        "stages": {
            "hunt": {"desc": "Destroy four Highway Ghouls on the Greymarch Road.",
                     "objectives": [{"id": "ghouls", "text": "Highway Ghouls destroyed", "kill": "highway_ghoul", "count": 4}],
                     "next": "return"},
            "return": {"desc": "Return to the Warden's Cairn on the Greymarch Road.",
                       "objectives": [{"id": "cairn", "text": "Return to the Warden's Cairn", "cond": {"flag": "never"}}], "next": None},
        },
        "rewards": {"xp": 250},
    },
    "xq_chapel": {
        "name": "The Drowned Toll", "type": "exploration", "region": "Greymarch Road", "level": "8+",
        "summary": "A chapel sank into the marsh a century ago. Its bell still rings.",
        "start": "silence",
        "stages": {
            "silence": {"desc": "Find what rings the bell in the flooded crypt beneath the Drowned Chapel.",
                        "objectives": [{"id": "wraith", "text": "Silence the Bellwraith", "cond": {"flag": "bellwraith_defeated"}}],
                        "next": "rest"},
            "rest": {"desc": "The Bellwraith dropped the bell's clapper. Perhaps it belongs on the chapel's altar.",
                     "objectives": [{"id": "altar", "text": "Return the clapper to the altar", "cond": {"flag": "chapel_rested"}}],
                     "next": None},
        },
        "rewards": {"xp": 300, "gold": 80},
    },
}

LORE = {
    "aurum": {"title": "The Lost City of Aurum", "text":
        "Old milestones on the Greymarch Road give distances to 'Aurum', a city that appears on no map. Where Aurum "
        "should be, there is only a marsh. Scholars assume a stonemason's joke. The marsh-folk say the city 'ran dry'."},
    "drowned_hymn": {"title": "The Drowned Hymn", "text":
        "'Toll for the light that we were lent, / toll for the ash when it is spent; / ring, and remember, ring and "
        "repent, / the bell is the debt and the debt is the bell.'"},
    "star_chart": {"title": "The Stargazer's Chart", "text":
        "A chart of stars that shine in no sky you know, clustered around a great dark hollow. Annotations in the tonal "
        "script of the Vaultwrights: 'Here was the Unmade. Here we sealed it. Here we became the seal.' At the margin, "
        "a count — a number so large the scribe gave up and simply wrote 'all of us'."},
    "drained_cores": {"title": "Drained Aether-Cores", "text":
        "Hundreds of Conclave Aether-cores, stolen by the Redcaps, drained to grey dust at Ilvane's Scar encampment. "
        "More Aether than Valewatch uses in a year, poured into something beneath the ash."},
    "ansel_account": {"title": "Ansel's Account", "text":
        "'A tomb, and a machine, and a prayer, all at once. The walls are covered in names.' Break the Warden's pylons "
        "first. The Lattice beams must meet at the heart: Flame left, Frost right, Storm above."},
}
