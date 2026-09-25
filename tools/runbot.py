"""Developer tool: run the playthrough bot for one or all race/class combos and print a pacing report.

    PYTHONPATH=. python3 tools/runbot.py [race cls] [--seed N] [--difficulty hard] [--verbose]
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tests"))
from bot import Bot, StuckError  # noqa: E402

MILESTONES = ["world_open", "met_corvin", "keystone_valewatch", "keystone_sylvara", "keystone_kharum",
              "convergence_done", "vault_opened", "vault_truth", "act_two"]


def run(race, cls, seed, difficulty, verbose):
    t = time.time()
    b = Bot(race, cls, seed=seed, difficulty=difficulty, verbose=verbose)
    seen = {}
    orig = b.tick

    def tick():
        orig()
        for m in MILESTONES:
            if m not in seen and (m in b.g.flags or b.g.item_count(m)):
                seen[m] = b.g.player.level
    b.tick = tick
    ok = True
    try:
        b.run(max_steps=40000)
    except StuckError as e:
        ok = False
        print("STUCK", race, cls, e)
    deaths = sum(b.deaths_here.values())
    print(f"{'DONE ' if ok else 'FAIL '} {race:6} {cls:8} steps={b.steps:5} lvl={b.g.player.level:2} deaths={deaths:2} "
          f"ach={len(b.g.achievements):3} {time.time() - t:5.1f}s  " + " ".join(f"{k.split('_')[-1][:6]}:{v}" for k, v in seen.items()))
    if deaths:
        print("      deaths at", b.deaths_here)
    return ok


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("combo", nargs="*")
    ap.add_argument("--seed", type=int, default=3)
    ap.add_argument("--difficulty", default="normal")
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()
    combos = [tuple(a.combo)] if a.combo else [(r, c) for r in ("human", "elf", "dwarf") for c in ("fighter", "mage", "rogue")]
    results = [run(r, c, a.seed, a.difficulty, a.verbose) for r, c in combos]
    sys.exit(0 if all(results) else 1)
