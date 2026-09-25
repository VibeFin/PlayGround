"""Branching dialogue with conditions, effects and attribute checks.

Dialogue definition (ashes/data/dialogue/*):
    {"name", "title", "entry": [{"if": cond, "node": id}, ...],
     "nodes": {id: {"text": str | [{"if": cond, "text": str}, ...], "effects": [...],
                    "options": [{"text", "if", "effects", "goto", "once", "tag",
                                 "check": {"stat": "cha"|"persuade"|"perception"|..., "dc": n,
                                           "pass": node, "fail": node}}]}}}
An option with no goto ends the conversation.
"""
from __future__ import annotations

from ..data.dialogue import DIALOGUES
from .stats import attr_mod, ATTRS, ATTR_NAMES
from . import rules

CHECK_NAMES = {"persuade": "Persuade", "perception": "Perception", "intimidate": "Intimidate",
               "lore": "Lore", "deceive": "Deceive", **ATTR_NAMES}


def check_bonus(game, stat: str) -> int:
    s = game.player.stats
    if stat in ATTRS:
        return attr_mod(s[stat])
    if stat == "persuade":
        return s["persuade"]
    if stat == "perception":
        return s["perception"]
    if stat == "intimidate":
        return max(attr_mod(s["str"]), attr_mod(s["cha"]))
    if stat == "deceive":
        return max(attr_mod(s["cha"]), attr_mod(s["dex"])) + int(s.get("persuade", 0) - attr_mod(s["cha"]))
    if stat == "lore":
        return max(attr_mod(s["int"]), attr_mod(s["wis"]))
    return 0


def check_chance(game, stat: str, dc: int) -> int:
    """Chance (%) to succeed a d20 + bonus >= dc roll."""
    need = dc - check_bonus(game, stat)
    return max(5, min(95, (21 - need) * 5))


class DialogueState:
    def __init__(self, npc_id: str, node: str, required: bool = False):
        self.npc_id = npc_id
        self.node = node
        # Required conversations (the aftermath of a story fight) settle outcomes, so they can't be walked away from.
        self.required = required
        self.last_result: str | None = None
        self.history: list[dict] = []


def entry_node(game, npc_id: str) -> str:
    d = DIALOGUES[npc_id]
    for e in d["entry"]:
        if rules.check(game, e.get("if")):
            return e["node"]
    raise ValueError(f"No valid entry for {npc_id}")


def node_text(game, npc_id: str, node_id: str) -> str:
    node = DIALOGUES[npc_id]["nodes"][node_id]
    t = node["text"]
    if isinstance(t, list):
        parts = [v["text"] for v in t if rules.check(game, v.get("if"))]
        t = "\n\n".join(parts)
    return game.fmt(t)


def visible_options(game, npc_id: str, node_id: str) -> list[tuple[int, dict]]:
    node = DIALOGUES[npc_id]["nodes"][node_id]
    out = []
    for i, opt in enumerate(node.get("options", [])):
        if opt.get("once") and f"opt:{npc_id}:{opt['once']}" in game.flags:
            continue
        if not rules.check(game, opt.get("if")):
            continue
        out.append((i, opt))
    if not out:
        out.append((-1, {"text": "[Leave]"}))
    return out


def enter_node(game, state: DialogueState, node_id: str):
    state.node = node_id
    node = DIALOGUES[state.npc_id]["nodes"][node_id]
    rules.apply_effects(game, node.get("effects", []))


def choose(game, state: DialogueState, index: int) -> bool:
    """Apply an option. Returns True if the conversation continues."""
    npc = state.npc_id
    opts = dict(visible_options(game, npc, state.node))
    if index not in opts:
        raise ValueError("That option is not available.")
    opt = opts[index]
    state.history.append({"speaker": "you", "text": game.fmt(opt["text"])})
    state.last_result = None
    if index == -1:
        return False
    if opt.get("once"):
        game.flags.add(f"opt:{npc}:{opt['once']}")
    rules.apply_effects(game, opt.get("effects", []))
    goto = opt.get("goto")
    chk = opt.get("check")
    if chk:
        bonus = check_bonus(game, chk["stat"])
        roll = game.rng.randint(1, 20)
        total = roll + bonus
        ok = total >= chk["dc"]
        name = CHECK_NAMES.get(chk["stat"], chk["stat"])
        state.last_result = f"[{name} check: rolled {roll} {'+' if bonus >= 0 else '-'} {abs(bonus)} = {total} vs DC {chk['dc']} — {'SUCCESS' if ok else 'FAILURE'}]"
        game.counters["checks_passed" if ok else "checks_failed"] = \
            game.counters.get("checks_passed" if ok else "checks_failed", 0) + 1
        goto = chk["pass"] if ok else chk["fail"]
    if goto:
        if game.pending_combat or game.pending_move or game.mode != "dialogue":
            # An effect has pulled the player out of the conversation.
            return False
        enter_node(game, state, goto)
        return True
    return False


def view(game, state: DialogueState) -> dict:
    d = DIALOGUES[state.npc_id]
    opts = []
    for i, opt in visible_options(game, state.npc_id, state.node):
        label = game.fmt(opt["text"])
        tag = opt.get("tag")
        chk = opt.get("check")
        if chk:
            tag = f"{CHECK_NAMES.get(chk['stat'], chk['stat'])} {check_chance(game, chk['stat'], chk['dc'])}%"
        opts.append({"index": i, "text": label, "tag": tag})
    return {"npc": state.npc_id, "name": d["name"], "title": d.get("title", ""),
            "portrait": d.get("portrait", d["name"][0]), "text": node_text(game, state.npc_id, state.node),
            "result": state.last_result, "options": opts, "required": state.required}
