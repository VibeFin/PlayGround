"""The Aether Vault — the Act I finale dungeon beneath the Ashen Scar."""

_KEYSTONES = ["keystone_valewatch", "keystone_sylvara", "keystone_kharum"]
_LATTICE_OK = {"flag": "lat_left_flame", "flags": ["lat_right_frost", "lat_up_storm"]}


def _emitter(pos: str, label: str) -> dict:
    """A Lattice emitter feature that can be attuned to one of three elements."""
    elems = [("flame", "Flame"), ("frost", "Frost"), ("storm", "Storm")]
    flags = [f"lat_{pos}_{e}" for e, _ in elems]
    desc = [{"if": {"flag": f"lat_{pos}_{e}"}, "text": f"The {label} emitter burns with {name}."} for e, name in elems]
    desc.append({"if": {"not": {"any": [{"flag": f} for f in flags]}}, "text": f"The {label} emitter is dark."})
    return {
        "id": f"emitter_{pos}", "name": f"{label.title()} Emitter", "if": {"not_flag": "lattice_solved"}, "desc": desc,
        "actions": [{"label": f"Attune to {name}", "if": {"not_flag": f"lat_{pos}_{e}"},
                     "text": f"The {label} emitter hums and takes on the colour of {name.lower()}.",
                     "effects": [{"unflag": flags}, {"flag": f"lat_{pos}_{e}"}]} for e, name in elems],
    }


LOCATIONS = {
    "av_gate": {
        "name": "Aether Vault: The Door of Three Rings", "region": "vault", "biome": "vault", "danger": "high",
        "desc": [{"text": "At the bottom of the black stair, a door. It is perfectly round, a hundred feet across, made of "
                          "something that is not stone and not metal, and it is breathing: a slow pulse of light "
                          "passes across its surface every few seconds. Three hollows are set into it, each the size of a "
                          "shield boss. One of blue stone. One of living wood. One of black metal."},
                 {"if": {"flag": "vault_opened"}, "text": "The great door stands open, the three Keystones glowing in its hollows."}],
        "features": [
            {"id": "three_hollows", "name": "The Three Hollows", "if": {"not_flag": "vault_opened"},
             "desc": "Each hollow is shaped to receive one of the Keystones.",
             "actions": [
                 {"label": "Set the three Keystones into the door",
                  "if": {"items": _KEYSTONES},
                  "text": "You set the rings into their hollows: stone, wood, metal. The door's pulse quickens, then "
                          "syncs with your heartbeat. For one terrible moment you feel as though the door is looking "
                          "at you. Then it rolls aside, silent as snowfall, and warm air breathes out of the dark, "
                          "carrying a sound like very distant singing.",
                  "effects": [{"remove_item": "keystone_valewatch"}, {"remove_item": "keystone_sylvara"},
                              {"remove_item": "keystone_kharum"}, {"flag": "vault_opened", "xp": 150}]},
                 {"label": "Examine the hollows", "if": {"not": {"items": _KEYSTONES}},
                  "text": "You'll need all three Keystones to open this door."},
             ]},
        ],
        "exits": [{"to": "as_gate", "label": "Back up the black stair"},
                  {"to": "av_choirs", "label": "Enter the Vault", "if": {"flag": "vault_opened"}, "locked": "The door is sealed."}],
        "on_enter": [{"once": "voice",
                      "text": "A voice echoes up from beyond the door — a woman's, calm, amused, magnified by the stone. "
                              "'Ah. The one who gathered my rings. Come in, {name}. I've been waiting for someone to "
                              "carry them the last mile. Mind the Warden. It's very old, and it's never liked me.'"}],
        "discover_xp": 50,
    },
    "av_choirs": {
        "name": "Aether Vault: Hall of Choirs", "region": "vault", "biome": "vault", "danger": "high",
        "desc": "A hall so long its far end is lost in pale light. Every inch of its walls, floor to vaulted ceiling "
                "hundreds of feet above, is carved with names in the tonal script of the Vaultwrights — millions of "
                "them, packed so tight they look like texture. Beneath each name, the same small symbol, repeated. The "
                "air hums with a faint chord, as if the names were singing under their breath.",
        "features": [
            {"id": "wall_of_names", "name": "The Wall of Names", "desc": "Millions of names.",
             "actions": [{"label": "Read the names", "effects": [{"lore": "vault_names"}],
                          "text": "You can't read the tonal script — but the symbol beneath each name is the same one that "
                                  "is carved into every Aether-core in the realm. The Conclave calls it 'the spark'."},
                         {"label": "Look for a name you recognize", "once": True,
                          "text": "Absurd — but after a long time, you find a name that, rendered in the tonal script, "
                                  "sounds exactly like yours. It's probably a coincidence. It's DEFINITELY a coincidence.",
                          "effects": [{"achievement": "name_on_the_wall", "xp": 20}]}]},
        ],
        "exits": [{"to": "av_gate", "label": "Back to the Door"}, {"to": "av_lattice", "label": "Onward, toward humming light"}],
        "encounter": {"id": "enc_av_choirs"},
        "random": {"chance": 0.25, "table": ["enc_av_patrol"]},
        "discover_xp": 50,
    },
    "av_lattice": {
        "name": "Aether Vault: The Lattice Chamber", "region": "vault", "biome": "vault_lattice", "danger": "high",
        "desc": [{"text": "A spherical chamber, and in its center, suspended in nothing, a knot of light — a heart of "
                          "tangled threads, pulsing. Three great crystal emitters point at it: one to its left, one to "
                          "its right, one directly above. Beyond the heart, a sealed archway. An inscription circles "
                          "the chamber's equator."},
                 {"if": {"flag": "lattice_solved"}, "text": "Three beams of light meet in the heart, and the archway beyond stands open."}],
        "features": [
            {"id": "lattice_inscription", "name": "The Circling Inscription", "desc": "Tonal script, running all the way around the chamber.",
             "actions": [{"label": "[Lore] Decipher the inscription", "check": {"stat": "lore", "dc": 13,
                          "pass": {"text": "'The sun sets at the heart's left hand. The winter keeps its right. And the storm is "
                                           "always overhead.' — Flame left, Frost right, Storm above.",
                                   "effects": [{"flag": "lattice_hint"}]},
                          "fail": {"text": "The script swims before your eyes. You catch 'left', 'winter', and what might be 'sandwich'."}}}]},
            _emitter("left", "left"),
            _emitter("right", "right"),
            _emitter("up", "upper"),
            {"id": "lattice_heart", "name": "The Heart of Threads", "if": {"not_flag": "lattice_solved"},
             "desc": "Channel the emitters into the heart once they're attuned.",
             "actions": [
                 {"label": "Channel the beams into the heart", "if": _LATTICE_OK,
                  "text": "Flame, frost and storm lance into the heart and braid together. The knot of light brightens, "
                          "steadies, and sings one clear note. The archway beyond grinds open.",
                  "effects": [{"flag": "lattice_solved", "xp": 150}]},
                 {"label": "Channel the beams into the heart", "if": {"not": _LATTICE_OK},
                  "text": "The beams collide wrongly. The heart spits loose sparks of raw Aether — and they come for you!",
                  "effects": [{"damage_pct": 10}, {"combat": "enc_av_sparks"}]},
             ]},
        ],
        "exits": [{"to": "av_choirs", "label": "Back to the Hall of Choirs"},
                  {"to": "av_crucible", "label": "Through the archway", "if": {"flag": "lattice_solved"},
                   "locked": "The archway is sealed. The Lattice must be aligned."}],
        "encounter": {"id": "enc_av_lattice"},
        "discover_xp": 50,
    },
    "av_crucible": {
        "name": "Aether Vault: The Crucible", "region": "vault", "biome": "vault", "danger": "boss",
        "desc": [{"text": "A vast circular arena with a floor of glass, and beneath the glass, far below, a slow river of "
                          "light. Three pylons stand around the chamber, humming. In the center, a figure forty feet tall, "
                          "made of armor plates with nothing inside them, rises from one knee. Where its heart should be "
                          "there is only a hollow, and in the hollow, an eye opens."},
                 {"if": {"flag": "warden_defeated"},
                  "text": "The Hollow Warden lies in pieces across the glass. Its eye is closed."}],
        "exits": [{"to": "av_lattice", "label": "Back to the Lattice Chamber"},
                  {"to": "av_archive", "label": "The stair beyond the Warden", "if": {"flag": "warden_defeated"},
                   "locked": "The Hollow Warden stands in the way."}],
        "encounter": {"id": "enc_av_warden"},
        "discover_xp": 50,
    },
    "av_archive": {
        "name": "Aether Vault: The Archive of Ash", "region": "vault", "biome": "vault_archive", "danger": None,
        "desc": "A quiet chamber, round and small, lined with shelves of ash — books, once, now perfectly preserved in "
                "grey. A bench. A dry fountain. It is the only room in the Vault that feels like it was built for "
                "people to sit in. The air is still and safe. In the center of the room, a figure of pale light sits "
                "on the fountain's rim, waiting.",
        "npcs": [{"id": "the_archivist"}],
        "rest": "sanctuary",
        "features": [
            {"id": "ash_books", "name": "Books of Ash", "desc": "They crumble if you touch them. Some are open.",
             "actions": [{"label": "Read an open book", "once": True, "effects": [{"lore": "book_of_ash"}, {"xp": 30}],
                          "text": "The page is legible, just, before it falls apart."}]},
        ],
        "exits": [{"to": "av_crucible", "label": "Back to the Crucible"},
                  {"to": "av_heart", "label": "Down to the Heart of the Vault", "if": {"flag": "vault_truth"},
                   "locked": "A wall of pale light bars the way. The figure by the fountain watches you."}],
        "discover_xp": 50,
    },
    "av_heart": {
        "name": "Aether Vault: The Heart", "region": "vault", "biome": "vault_heart", "danger": "boss",
        "desc": [{"text": "The bottom of the world. A chamber without walls, only threads of light in every direction, "
                          "billions of them, woven into a sphere around a point of perfect darkness. The threads are "
                          "thinning; you can see through them in places. Through the gaps, the darkness looks back."},
                 {"if": {"not_flag": "ilvane_defeated"},
                  "text": "Standing at the edge of the weave, staff raised, threads of Aether wound around her arms like "
                          "chains, is a tall woman in ash-grey robes: Ilvane Morrow."},
                 {"if": {"flag": "ilvane_defeated", "not_flag": "act_two"},
                  "text": "Ilvane is beaten. The weave shudders around the dark. It is waiting for someone to decide."},
                 {"if": {"flag": "act_two"},
                  "text": "The Heart is quiet. The weave holds, for now, around the dark at the center of everything."}],
        "npcs": [{"id": "ilvane_after", "if": {"flag": "act_two", "not_flag": "ilvane_killed"}}],
        "exits": [{"to": "av_archive", "label": "Back up to the Archive of Ash"}],
        "encounter": {"id": "enc_av_ilvane"},
        "discover_xp": 80,
    },
}

ENCOUNTERS = {
    "enc_av_patrol": {"title": "Vault Patrol", "level": [10, 12], "enemies": ["vault_sentinel", ["lattice_spark", "back"]]},
    "enc_av_choirs": {"title": "The Singing Dead", "level": [10, 12],
                      "intro": "The chord in the air sours. Ash lifts off the carved names and takes shape.",
                      "enemies": ["ash_wraith", "ashbound_knight", ["lattice_spark", "back"]]},
    "enc_av_lattice": {"title": "Lattice Guardians", "level": [10, 12],
                       "intro": "A Vault Sentinel turns its blank face toward you. 'MALFUNCTION DETECTED.'",
                       "enemies": ["vault_sentinel", "vault_sentinel", ["lattice_spark", "back"]]},
    "enc_av_sparks": {"title": "Loose Sparks", "level": [10, 12],
                      "enemies": [["lattice_spark", "back"], ["lattice_spark", "back"], "ash_wraith"],
                      "on_victory": [{"msg": "The sparks dissipate. The emitters wait to be attuned properly."}]},
    "enc_av_warden": {"title": "The Hollow Warden", "boss": True, "level": [10, 12],
                      "intro": "'INTRUSION. THE SEAL MUST NOT BE TOUCHED.' The pylons flare, wrapping the Warden in light. "
                               "(Destroy the three Resonance Pylons — they shield the Warden every turn. Defend or "
                               "interrupt its Aether Lance.)",
                      "enemies": ["hollow_warden", ["warden_pylon", "back"], ["warden_pylon", "back"], ["warden_pylon", "back"]],
                      "on_victory": [{"flag": "warden_defeated", "unique": "u_warden_lens"}]},
    "enc_av_ilvane": {"title": "Ilvane Morrow, the Unbound", "boss": True, "level": [11, 13], "flee": False,
                      "intro": "Ilvane turns. Her eyes are bright with Aether and tears. 'You read the walls. Good. Then "
                               "you know what we are burning every time we light a lamp. I'm going to cut the threads, "
                               "{name}. I'm going to let them GO.' The weave flares around her. (She's attuned to one "
                               "element at a time and changes every other round — check her status. She will summon "
                               "Aether Conduits; destroy them. When she becomes Unbound, she hits harder but takes more "
                               "damage.)",
                      "enemies": ["ilvane_morrow"],
                      "on_victory": [{"flag": "ilvane_defeated", "unique": "u_unbound_staff"}],
                      "after_dialogue": "ilvane_fallen"},
}

SHOPS = {}

DIALOGUES = {
    "the_archivist": {
        "name": "The Archivist", "title": "Echo of the Vaultwrights",
        "markers": [{"if": {"not_flag": "vault_truth"}, "marker": "!"}],
        "entry": [{"if": {"flag": "vault_truth"}, "node": "after"}, {"node": "start"}],
        "nodes": {
            "start": {"text": "The figure of light looks up. It has a face, roughly — as if someone described a face to a "
                              "candle. Its voice is many voices, speaking in careful unison. 'You carried the rings. You "
                              "stopped the Warden, which was only doing what we asked. And you are not her.' It tilts "
                              "its head. 'Ask.'",
                      "options": [{"text": "What is this place?", "goto": "place"},
                                  {"text": "What are you?", "goto": "what"}]},
            "what": {"text": "'An echo. A note left in the Archive, in case someone came who needed telling. We are what "
                             "remains of the ones you call Vaultwrights, in the same way that a footprint is what "
                             "remains of a walk.'", "options": [{"text": "What is this place?", "goto": "place"}]},
            "place": {"text": "'A seal. A lock. A tomb. A prayer. All are true.' The light dims. 'Long ago — longer than "
                              "your oldest songs — something came into this world from outside it. We called it the "
                              "Unmade, because it unmade things: forests, rivers, cities, names. It did not hate. It "
                              "did not want. It simply ended what it touched.'",
                      "options": [{"text": "How did you stop it?", "goto": "how"}]},
            "how": {"text": "'We could not destroy it. We tried everything we were. So, in the end, we gave everything we "
                            "were.' The many voices falter, then steady. 'We burned ourselves. All of us. Every Vaultwright "
                            "who lived, by choice, in one night. Our souls became ash, and the ash became threads, and "
                            "the threads became a weave around the Unmade. A cage made of people.'",
                    "options": [{"text": "The Aether.", "goto": "aether"}]},
            "aether": {"text": "'Yes. The weave leaks — it was always going to. The light that seeps from it warms your "
                               "world, grows your trees, answers your spells. You call it the Aether. You built lamps and "
                               "forges and schools on it.' A pause. 'Every spell you cast spends a little of us. We did "
                               "not mind, at first. We are glad you were warm. But you have been spending faster, and "
                               "the weave has grown thin.'",
                       "options": [{"text": "Ilvane thinks the Aether is a cage.", "goto": "ilvane"},
                                   {"text": "How long until it fails?", "goto": "long"}]},
            "long": {"text": "'We do not know.' It says it simply. 'We never knew as much as you believe. We did not know "
                             "what the Unmade was. We did not know whether it could die, or sleep, or dream. We only knew "
                             "that it must not be. Everything you think you understand about the Aether rests on the "
                             "guesses of frightened people, a very long time ago.'",
                     "effects": [{"flag": "archivist_uncertain"}],
                     "options": [{"text": "Ilvane thinks the Aether is a cage.", "goto": "ilvane"}]},
            "ilvane": {"text": "'She is half right, which is the most dangerous way to be right. It IS a cage — but not "
                               "around you. She read our names and she grieved for us, and that is kind of her. She "
                               "believes the Unmade is a story we told to excuse our cage. She wants to cut the threads "
                               "and set us free.' The light flickers. 'We do not want to be free. We want to be finished. "
                               "There is a difference. Go down, rings-bearer. She is at the Heart. Decide for yourself.'",
                       "effects": [{"flag": "vault_truth", "lore": "vault_truth", "xp": 200, "achievement": "the_truth"}],
                       "options": [{"text": "I'll stop her."}, {"text": "I'll decide when I get there."}]},
            "after": {"text": "'The Heart is below. Rest here, if you need to. This room was built for that.'",
                      "options": [{"text": "Tell me again what the Aether is.", "goto": "aether"}, {"text": "(Leave.)"}]},
        },
    },
    "ilvane_fallen": {
        "name": "Ilvane Morrow", "title": "The Unbound",
        "entry": [{"node": "start"}],
        "nodes": {
            "start": {"text": "Ilvane is on her knees at the edge of the weave, her staff broken, the threads unwinding "
                              "from her arms. The chamber trembles; through a gap in the weave, the darkness at the center "
                              "shifts, like something turning in its sleep. 'Did you feel that?' she whispers. 'That was "
                              "real, wasn't it. I thought — I was so sure it was a story.' She laughs, and it breaks. 'I "
                              "read a million names, {name}. I wanted to let them go.'",
                      "options": [
                          {"text": "It's over, Ilvane. You'll stand trial before the Conclave.",
                           "effects": [{"flag": "ilvane_spared"}], "goto": "spared"},
                          {"text": "[Persuade] Then help me. You know the weave better than anyone alive.",
                           "if": {"flag": "vault_truth"},
                           "check": {"stat": "persuade", "dc": 14, "pass": "redeemed", "fail": "redeem_fail"}},
                          {"text": "You nearly unmade the world. (Strike her down.)",
                           "effects": [{"flag": "ilvane_killed"}], "goto": "killed"},
                      ]},
            "spared": {"text": "Ilvane bows her head. 'A trial. Of course. The Conclave will want to ask me what I found, "
                               "and then they will want very badly for no one else to know.' She looks at the weave. "
                               "'Whatever you do next — do it knowing what they are.'",
                       "options": [{"text": "(Turn to the Heart.)", "goto": "heart"}]},
            "redeemed": {"text": "Ilvane stares at you for a long moment. Then she wipes her eyes with the heel of her hand, "
                                 "and something of the High Artificer comes back into her face. 'Help. Yes. If the weave "
                                 "can be mended, I can show you how. And if it can't—' She looks at the dark. 'Then "
                                 "someone who understands it had better be here when it fails.'",
                         "effects": [{"flag": "ilvane_redeemed", "achievement": "second_chances", "xp": 150}],
                         "options": [{"text": "(Turn to the Heart.)", "goto": "heart"}]},
            "redeem_fail": {"text": "'Help you?' Ilvane laughs bitterly. 'I've done enough helping.' She turns her face away.",
                            "options": [{"text": "Then you'll stand trial.", "effects": [{"flag": "ilvane_spared"}], "goto": "spared"},
                                        {"text": "(Strike her down.)", "effects": [{"flag": "ilvane_killed"}], "goto": "killed"}]},
            "killed": {"text": "It is quick. Ilvane Morrow, once High Artificer of the Conclave, falls at the edge of the "
                               "weave she tried to cut. As she dies, a single thread of Aether unwinds from her wrist and "
                               "drifts back into the weave, as if returning home.",
                       "options": [{"text": "(Turn to the Heart.)", "goto": "heart"}]},
            "heart": {"text": [{"text": "You stand at the edge of the Heart. The weave is thinning, the dark within is "
                                        "stirring, and the Keystones — still in the great door far above — hum in your "
                                        "bones. You understand, suddenly and completely, that the rings were never keys. "
                                        "They were needles. Someone could reach into the weave now, and choose."},
                               {"if": {"flag": "ilvane_redeemed"},
                                "text": "Ilvane stands beside you. 'Whatever you choose,' she says quietly, 'I'll hold the threads steady.'"}],
                      "options": [
                          {"text": "Mend the seal. Pull the weave tight around the Unmade, even if it dims the Aether.",
                           "effects": [{"ending": "seal"}]},
                          {"text": "Take a shard of the Heart. Carry the power — and the responsibility — out into the world.",
                           "effects": [{"unique": "u_heart_shard"}, {"ending": "shard"}]},
                          {"text": "Let the Aether flow freely. Loosen the weave so that magic floods back into the world.",
                           "effects": [{"ending": "unbind"}]},
                      ]},
        },
    },
    "ilvane_after": {
        "name": "Ilvane Morrow", "title": "Former High Artificer",
        "entry": [{"if": {"flag": "ilvane_redeemed"}, "node": "redeemed"}, {"node": "prisoner"}],
        "nodes": {
            "redeemed": {"text": "Ilvane sits cross-legged at the edge of the weave, threads of light running through her "
                                 "fingers like a loom. 'I found another name I recognized today,' she says without looking "
                                 "up. 'There are other Vaults, {name}. The star chart in the Mistvale tower shows at least "
                                 "two more. Someone will have to go and look.'",
                         "options": [{"text": "Someday."}]},
            "prisoner": {"text": "Ilvane sits under guard of two very nervous Conclave wardens, waiting for transport to "
                                 "Valewatch. 'Come to gloat? No. You're not the type.' She looks at the weave. 'Every spell. "
                                 "Remember that.'", "options": [{"text": "I will."}]},
        },
    },
}

QUESTS = {
    "mq_vault": {
        "name": "The Aether Vault", "type": "main", "region": "The Ashen Scar", "level": "9-12",
        "summary": "The three Keystones point to the Ashen Scar, where Ilvane Morrow waits at the door of the Vault.",
        "start": "scar",
        "stages": {
            "scar": {"desc": "Travel east to the Ashen Scar and find the entrance to the Vault. Prepare well — there "
                             "may be no turning back.",
                     "objectives": [{"id": "threshold", "text": "Reach the Threshold at the crater's floor", "cond": {"visited": "as_gate"}},
                                    {"id": "journal", "text": "(Optional) Search Ilvane's abandoned camp", "cond": {"flag": "found_journal"}, "optional": True}],
                     "next": "door"},
            "door": {"desc": "Defeat the Unbound rearguard and open the Door of Three Rings with the Keystones.",
                     "objectives": [{"id": "rear", "text": "Defeat the Unbound rearguard", "cond": {"flag": "threshold_cleared"}},
                                    {"id": "door", "text": "Open the Door of Three Rings", "cond": {"flag": "vault_opened"}}],
                     "next": "lattice"},
            "lattice": {"desc": "Explore the Vault. The way forward lies through the Lattice Chamber.",
                        "objectives": [{"id": "lattice", "text": "Align the Lattice", "cond": {"flag": "lattice_solved"}}],
                        "next": "warden"},
            "warden": {"desc": "The Hollow Warden guards the Crucible.",
                       "objectives": [{"id": "warden", "text": "Defeat the Hollow Warden", "cond": {"flag": "warden_defeated"}}],
                       "next": "truth"},
            "truth": {"desc": "Beyond the Crucible lies a quiet room, and someone waiting to be asked.",
                      "objectives": [{"id": "truth", "text": "Speak with the Archivist in the Archive of Ash", "cond": {"flag": "vault_truth"}}],
                      "next": "ilvane"},
            "ilvane": {"desc": "Ilvane Morrow is at the Heart of the Vault, preparing to cut the threads of the weave. Stop her.",
                       "objectives": [{"id": "ilvane", "text": "Confront Ilvane Morrow at the Heart", "cond": {"flag": "ilvane_defeated"}}],
                       "next": "choice"},
            "choice": {"desc": "The weave is thinning. Decide its fate.",
                       "objectives": [{"id": "choice", "text": "Choose the fate of the Aether", "cond": {"flag": "act_two"}}],
                       "next": None},
        },
        "rewards": {"xp": 1000, "gold": 300},
    },
}

LORE = {
    "vault_names": {"title": "The Wall of Names", "text":
        "Millions of names in the tonal script of the Vaultwrights. Beneath each, the same symbol — the one carved on "
        "every Aether-core in the realm. The Conclave calls it 'the spark'. It may be better translated 'given'."},
    "book_of_ash": {"title": "A Book of Ash", "text":
        "'...the vote was not close. The children asked if it would hurt. We told them the truth: we did not know. We "
        "know so little. We know only that it must not be, and that we are enough, together, to make it not be. "
        "Tomorrow we become the light. Let whoever comes after us be warm.'"},
    "vault_truth": {"title": "The Truth of the Aether", "text":
        "The Aether is not a natural force. It is the ash of the Vaultwrights, who burned their own souls to weave a "
        "seal around the Unmade — a thing from outside the world that ended what it touched. The weave leaks, and the "
        "leaking light is what the world calls magic. Every spell spends a little of them. The weave is thinning. And "
        "even the Vaultwrights never truly understood what they sealed away."},
}
