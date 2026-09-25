"""Developer tool: Monte-Carlo win rates for encounters, using the bot's combat policy.

    PYTHONPATH=. python3 tools/simfight.py enc_sy_hollow enc_vw_works --level 2 [--n 200] [--race elf]
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tests"))
from bot import Bot  # noqa: E402


def prepared_bot(race, cls, level, seed, gear=True):
    b = Bot(race, cls, seed=seed)
    b.run(max_steps=10, goal=lambda g: g.player is not None)
    from ashes.engine.character import xp_for_level
    g = b.g
    g.mode, g.combat, g.pending_combat, g.dialogue, g.pending_dialogue = "explore", None, None, None, None
    p = g.player
    if level > 1:
        p.gain_xp(int((xp_for_level(level) - p.xp) / p.stats["xp_mult"]) + 1)
    if gear:
        # Roughly what a player owns by this level: the best of a handful of ordinary drops.
        from ashes.engine import items as I
        for _ in range(12):
            b.g.give_item(I.generate_equipment(level, b.g.rng, quality="minion"))
        weapons = {"fighter": ["longsword"], "mage": ["staff"],
                   "rogue": ["shortbow"] if b.ranger else ["dagger", "dagger"]}[cls]
        for w in weapons:
            b.g.give_item(I.generate_equipment(level, b.g.rng, rarity="uncommon", base=w))
        b.g.give_item(I.make_item("potion_heal_minor" if level < 5 else "potion_heal", qty=3))
        b.g.give_item(I.make_item("antidote", qty=2))
    b.upkeep()
    p.restore_full()
    return b


def sim(enc, race, cls, level, n, spec=None):
    wins = hp_left = rounds = 0
    seeds = range(n) if spec is None else [spec + 3 * i for i in range(n)]
    for seed in seeds:
        b = prepared_bot(race, cls, level, seed)
        g = b.g
        g.mode = "explore"
        g.start_combat(enc)
        steps = 0
        while g.mode == "combat" and g.combat and g.combat.state == "ongoing" and steps < 300:
            b.fight()
            steps += 1
        if g.combat_result and g.combat_result.get("state") == "victory":
            wins += 1
            hp_left += g.combat.player.hp / g.combat.player.max_hp
        rounds += g.combat.round
    return wins / n, (hp_left / wins if wins else 0), rounds / n


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("encounters", nargs="+")
    ap.add_argument("--level", type=int, default=2)
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--race", default=None)
    ap.add_argument("--cls", default=None)
    ap.add_argument("--spec", type=int, default=None, help="skill branch index (0-2) the bot specializes in")
    a = ap.parse_args()
    races = [a.race] if a.race else ["human", "elf", "dwarf"]
    classes = [a.cls] if a.cls else ["fighter", "mage", "rogue"]
    from ashes.data.world import ENCOUNTERS
    for enc in a.encounters:
        if enc not in ENCOUNTERS:
            print("unknown encounter", enc)
            continue
        for r in races:
            for c in classes:
                w, h, rd = sim(enc, r, c, a.level, a.n, a.spec)
                sp = "" if a.spec is None else f"s{a.spec}"
                print(f"{enc:22} L{a.level:<2} {r:6} {c:8}{sp:3} win={w:5.0%} hp_left={h:4.0%} rounds={rd:4.1f}")
