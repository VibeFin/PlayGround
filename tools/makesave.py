"""Developer tool: let the bot play until a milestone flag is set, then write a save for manual QA.

    PYTHONPATH=. python3 tools/makesave.py <data_dir> <slot> <flag> [race cls] [--seed N]

Example: a save standing in the Aether Vault just before the final choice:
    PYTHONPATH=. python3 tools/makesave.py saves slot5 vault_truth dwarf mage
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tests"))
from bot import Bot  # noqa: E402
from ashes.engine.save import SaveManager  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("slot")
    ap.add_argument("flag")
    ap.add_argument("race", nargs="?", default="human")
    ap.add_argument("cls", nargs="?", default="fighter")
    ap.add_argument("--seed", type=int, default=3)
    a = ap.parse_args()
    b = Bot(a.race, a.cls, seed=a.seed)
    b.run(goal=lambda g: a.flag in g.flags and g.mode == "explore")
    g = b.g
    SaveManager(a.data_dir).save(g, a.slot)
    print(f"Saved {a.slot}: level {g.player.level} at {g.location} (flag {a.flag})")
