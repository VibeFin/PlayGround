"""Developer tool: tally where a bot playthrough earns its XP."""
import collections
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tests"))
from bot import Bot  # noqa: E402

race, cls = (sys.argv[1], sys.argv[2]) if len(sys.argv) > 2 else ("human", "fighter")
b = Bot(race, cls, seed=3)
tally, byreg = collections.Counter(), collections.Counter()
orig = b.g.award_xp


def aw(amount, reason=""):
    before = b.g.player.xp
    orig(amount, reason)
    got = b.g.player.xp - before
    r = "combat-random" if reason == "combat" and b.g.combat_ctx.get("random") else (reason.split(" ")[0] or "effect")
    tally[r] += got
    byreg[b.g.location.split("_")[0]] += got


b.g.award_xp = aw
b.run(max_steps=40000)
print(tally.most_common())
print(byreg.most_common())
print("total", sum(tally.values()), "level", b.g.player.level)
