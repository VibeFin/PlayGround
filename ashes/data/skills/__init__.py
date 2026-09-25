from . import fighter, mage, rogue

# Tier gating: character level required and points already invested in the branch.
TIER_LEVEL = {1: 1, 2: 3, 3: 5, 4: 7, 5: 9}
TIER_POINTS = {1: 0, 2: 1, 3: 3, 4: 5, 5: 7}

SKILL_TREES = {
    "fighter": {"branches": fighter.BRANCHES, "nodes": {n["id"]: n for n in fighter.NODES}},
    "mage": {"branches": mage.BRANCHES, "nodes": {n["id"]: n for n in mage.NODES}},
    "rogue": {"branches": rogue.BRANCHES, "nodes": {n["id"]: n for n in rogue.NODES}},
}

SKILL_NODES = {nid: node for tree in SKILL_TREES.values() for nid, node in tree["nodes"].items()}
