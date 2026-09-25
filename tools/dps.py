"""Developer tool: average player damage per round against a boss, by class and specialization."""
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tests"))
sys.path.insert(0, os.path.dirname(__file__))
from simfight import prepared_bot  # noqa: E402

HIT = re.compile(r"^Your (.+?) hits .+? for (\d+)")
enc, level = sys.argv[1], int(sys.argv[2])
for cls in ("fighter", "mage", "rogue"):
    for spec in range(3):
        tot = rounds = 0
        per_ability = {}
        for i in range(12):
            b = prepared_bot("human", cls, level, spec + 3 * i)
            g = b.g
            g.start_combat(enc)
            steps = 0
            while g.mode == "combat" and g.combat.state == "ongoing" and steps < 200:
                b.fight()
                steps += 1
            for line in g.combat.log:
                m = HIT.match(line["t"])
                if m:
                    tot += int(m.group(2))
                    per_ability[m.group(1)] = per_ability.get(m.group(1), 0) + int(m.group(2))
            rounds += g.combat.round
        top = sorted(per_ability.items(), key=lambda kv: -kv[1])[:4]
        print(f"{cls:8} s{spec} dmg/round={tot / rounds:5.1f}  top={[(k, v // 12) for k, v in top]}")
