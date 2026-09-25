"""Shared fixtures for the test-suite (stdlib unittest; pytest also discovers these)."""
from __future__ import annotations

import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from ashes.engine.game import Game  # noqa: E402
from ashes.engine.save import SaveManager  # noqa: E402

RACES = ("human", "elf", "dwarf")
CLASSES = ("fighter", "mage", "rogue")
COMBOS = [(r, c) for r in RACES for c in CLASSES]


def new_game(race="human", cls="fighter", seed=1, save_dir: str | None = None, **settings) -> Game:
    """A game with a freshly created character standing in their homeland (tutorial fight pending)."""
    saves = SaveManager(save_dir) if save_dir else None
    g = Game(seed=seed, settings={"autosave": False, **settings}, save_manager=saves)
    g.dispatch({"action": "new_game"})
    g.dispatch({"action": "create", "name": "Tester", "race": race, "cls": cls})
    return g


def win_combat(g: Game, max_turns: int = 400):
    """Finish the current fight by attacking with an unkillable player, then leave the result screen."""
    assert g.mode == "combat", g.mode
    p = g.combat.player
    for _ in range(max_turns):
        if g.combat.state != "ongoing":
            break
        p.hp = p.max_hp
        g.dispatch({"action": "combat", "kind": "attack"})
    assert g.combat.state == "victory", g.combat.state
    g.dispatch({"action": "combat_done"})


def started_game(race="human", cls="fighter", seed=1, save_dir=None, **settings) -> Game:
    """A game past the opening tutorial fight, in explore mode."""
    g = new_game(race, cls, seed, save_dir, **settings)
    if g.mode == "combat":
        win_combat(g)
    while g.mode == "dialogue":
        g.dispatch({"action": "leave"})
    assert g.mode == "explore", g.mode
    return g


def tempdir() -> str:
    return tempfile.mkdtemp(prefix="aoa_test_")
