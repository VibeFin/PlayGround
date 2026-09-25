"""Journal entries: region lore merged with a few world-wide entries (readable items, etc.)."""
from .world import LORE as _REGION_LORE

_WORLD_LORE = {
    "poem_draft": {"title": "Faelar's Poem (Draft 212)", "text":
        "'O Vaelith, your hair is like moonlight,\nand your eyes are like two eyes,\nand when you shoot your bow in "
        "moonlight\nmy heart, it also flies.\nMoonlight! Moonlight! Moonlight!'\n\n(There are four more verses. They "
        "are worse.)"},
    "ilvane_journal": {"title": "Ilvane's Journal", "text":
        "'Day 1. The Conclave calls it heresy to ask where the Aether comes from. That is exactly why I must ask.'\n\n"
        "'Day 40. The Keystones are real. Three rings. The Vaultwrights made them as needles, not keys — needles for "
        "a loom. What were they weaving?'\n\n'Day 113. I have been inside. I have read the walls. They are NAMES. "
        "Millions of names, and under every name the same word: GIVEN. The Aether is not a force. It is PEOPLE. We "
        "have been burning people in our lamps for a thousand years.'\n\n'Day 114. They claim they did it to cage "
        "something they called the Unmade. How convenient, that the only proof of the monster is the word of the "
        "jailers. I will cut the threads and let them go. If there is a monster, we will face it ourselves. If there "
        "is not, we will have freed an entire people from a thousand years of servitude to our convenience.'\n\n"
        "'Day 130. Someone is gathering the rings. Good. Let them bring them to me.'"},
}

LORE = {**_REGION_LORE, **_WORLD_LORE}
