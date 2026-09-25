"""Act I endings. Epilogue lines may be plain strings or {"if": condition, "text": ...}."""

_EPILOGUE_COMMON = [
    # Valewatch
    {"if": {"flag": "brannoc_arrested"}, "text": "In Valewatch, Brannoc the Lamp-Eater stood trial and was sentenced to "
     "relight every lamp in the Lower Wards by hand. He is, by all accounts, extremely good at it."},
    {"if": {"flag": "brannoc_freed"}, "text": "In Valewatch, the Drowned Lanterns grew quietly richer. Brannoc sends you a "
     "crate of stolen Aether-cores every midwinter, with a card that says 'no hard feelings'."},
    {"if": {"flag": "brannoc_killed"}, "text": "In Valewatch, the Lamp-Eater's name became a story told to frighten "
     "smugglers. The Lower Wards' lamps burned a little brighter without him."},
    {"if": {"flag": "has_cat"}, "text": "Mister Whiskers continues to exist in several places at once. He is fed in all of them."},
    # Sylvara
    {"if": {"flag": "caelith_exposed"}, "text": "In Sylvara, Loremaster Caelith answered to the Circle, and spent his "
     "sentence copying the Archive's oldest scrolls. He found three more mentions of the ashen choir. He told no one."},
    {"if": {"flag": "caelith_fled"}, "text": "Somewhere beyond Sylvara, an elf with a satchel of books is still reading. "
     "Travelers speak of a hermit scholar who asks everyone the same question: 'Where do you think the light comes from?'"},
    {"if": {"flag": "caelith_redeemed"}, "text": "In Sylvara, Loremaster Caelith was given a new title — Warden of the "
     "Roots — and charged with learning everything the Archive knows about the Vaultwrights. It is more than anyone thought."},
    {"if": {"flag": "poem_happy"}, "text": "Faelar and Vaelith were bonded beneath the Heartroot. The ceremony poem "
     "rhymed 'moonlight' with 'moonlight' exactly once, which everyone agreed was growth."},
    {"if": {"any": [{"flag": "seed_moonwell"}, {"flag": "seed_lowbough"}]}, "text": "The heartseed you found grew "
     "into a silver sapling. In five hundred years, someone will stand in its shade and never know your name."},
    # Kharum
    {"if": {"flag": "borrin_exposed"}, "text": "In Kharum-Dûr, Guildmaster Borrin's trial lasted nine days. He was "
     "sentenced to work the deep galleries he sold. He complains constantly, and has become an excellent miner."},
    {"if": {"flag": "borrin_amends"}, "text": "In Kharum-Dûr, Borrin spent his fortune resealing the galleries and "
     "caring for the families hurt by the tremors. He is poorer, and — though he would never admit it — happier."},
    {"if": {"flag": "borrin_blackmailed"}, "text": "In Kharum-Dûr, Borrin remains Guildmaster, and flinches every time "
     "he hears your name."},
    {"if": {"flag": "grast_captured"}, "text": "Grast Ironhand was sentenced by the Thanes to forge at the Thirteenth "
     "Anvil's empty plinth. He has asked, repeatedly, to be allowed to read the Vault's walls himself."},
    {"if": {"flag": "grast_spared"}, "text": "Grast Ironhand vanished into the deep roads. Miners claim to hear a rig's "
     "pistons, far below, heading toward the Ashen Scar."},
    # Ilvane
    {"if": {"flag": "ilvane_spared"}, "text": "Ilvane Morrow was taken to Valewatch for trial. The Conclave held it "
     "behind closed doors. Its verdict has not been made public. Neither has anything she said."},
    {"if": {"flag": "ilvane_redeemed"}, "text": "Ilvane Morrow never left the Vault. She sits at the edge of the "
     "weave, threads of light running through her fingers, learning the names one by one."},
    {"if": {"flag": "ilvane_killed"}, "text": "Ilvane Morrow was buried at the edge of the Ashen Scar. Her grave has no "
     "name on it. Someone keeps leaving a single drained Aether-core there, like a flower."},
    # Achievements-flavoured flourishes
    {"if": {"flag": "chapel_rested"}, "text": "On the Greymarch Road, the drowned bell rings no more."},
    {"if": {"flag": "linnet_tale"}, "text": "Linnet the bard finished her ballad. Your name still does not rhyme with anything."},
]

ENDINGS = {
    "seal": {
        "title": "The Mended Seal",
        "text": "You reach into the weave. The threads are warm, and they know you: the Keystones hum far above, and "
                "you pull the weave tight around the dark, stitch by stitch, until the gaps close and the thing at "
                "the center stills.\n\nAcross the realm, every lamp dims at once, for one heartbeat. When they "
                "brighten again, they are a little less bright than they were. Spells take a little more effort. The "
                "Conclave calls it a 'regrettable fluctuation'. You know better.\n\nThe Vaultwrights are safe, and "
                "the world is safe, and magic is a little rarer, a little more precious. Somewhere very deep, a "
                "million voices sigh, and the sound is almost like thanks.\n\nBut as you climb out of the Vault, the "
                "Archivist's words follow you: we never knew as much as you believe. The weave will thin again. "
                "Every spell still spends them. And the star chart in your memory shows other hollows, other seals, "
                "far across the world.",
        "epilogue": _EPILOGUE_COMMON + [
            "The Conclave rewrote its charter within the year. The first line now reads: 'Spend nothing you cannot repay.'",
        ],
    },
    "shard": {
        "title": "The Bearer of the Heart",
        "text": "You reach into the Heart and close your hand around a single shard of light. It is heavy as a "
                "mountain and light as ash. When you draw it out, the weave shivers — and holds. Barely. The shard "
                "pulses against your chest, whispering in a million voices.\n\nThe Aether flickers across the realm "
                "and steadies, uneasy. You feel it now, everywhere: every lamp, every spell, every forge, a thread "
                "running back to the shard around your neck. You are not its master. You are its witness.\n\n"
                "Perhaps that was always the missing piece: someone to remember. The Vaultwrights gave themselves "
                "away so completely that no one was left to watch the seal. Now someone is.\n\nThe shard whispers "
                "of other places. Other hollows in the dark. Other seals, thinning.",
        "epilogue": _EPILOGUE_COMMON + [
            "Mages across the realm report that their spells now sometimes whisper a name as they are cast. The "
            "Conclave has forbidden discussion of the phenomenon, which has made it extremely popular.",
        ],
    },
    "unbind": {
        "title": "The Loosened Weave",
        "text": "You loosen the weave. Not all the way — Ilvane wanted to cut it, and you do not — but you ease "
                "the knots, and the light pours out.\n\nAcross the realm, every lamp flares like a sunrise. Spells "
                "that failed for years roar back to life. Forges burn white. The Moonwell overflows. For a season, "
                "the world is drunk on magic, and the people call it a miracle.\n\nIn the Heart, the darkness at the "
                "center opens one eye.\n\nIt does not move. Not yet. But the weave is thinner now, and you can feel "
                "the million voices within it straining, holding, remembering what they are holding. You have "
                "bought the world a golden age. You do not know the price. Neither, you suspect, does anyone.",
        "epilogue": _EPILOGUE_COMMON + [
            "The Conclave declared a new Age of Wonders. Aether-lamps now burn in every village. In quiet hours, "
            "some people swear they can hear singing inside the light, and that the song is getting quieter.",
        ],
    },
}
