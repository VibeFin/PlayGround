"""Enemy (and summon) decision making.

Each enemy lists abilities with weights and optional conditions:
    {"id": "mend", "weight": 5, "if": {"ally_hp_below": 0.5}}
The AI filters usable options, then picks by weight. Targeting profiles:
    random | lowest_hp | player | weakest_armor | summons_first
"""
from __future__ import annotations

from ..data.enemies import ENEMY_ABILITIES

SPELL_TAGS = {"spell"}


def _cond_ok(combat, unit, cond: dict) -> bool:
    if not cond:
        return True
    if "self_hp_below" in cond and not unit.hp_frac() < cond["self_hp_below"]:
        return False
    if "self_hp_above" in cond and not unit.hp_frac() > cond["self_hp_above"]:
        return False
    if "ally_hp_below" in cond:
        allies = [a for a in combat.allies_of(unit) if not a.is_object]
        if not any(a.hp_frac() < cond["ally_hp_below"] for a in allies):
            return False
    if "round_mod" in cond:
        n, r = cond["round_mod"]
        if combat.round % n != r:
            return False
    if "round_gte" in cond and combat.round < cond["round_gte"]:
        return False
    if "not_self_status" in cond and unit.has(cond["not_self_status"]):
        return False
    if "self_status" in cond and not unit.has(cond["self_status"]):
        return False
    if "self_stacks_gte" in cond:
        sid, n = cond["self_stacks_gte"]
        if unit.stacks(sid) < n:
            return False
    if "summons_below" in cond:
        eid, n = cond["summons_below"]
        if sum(1 for u in combat.living(unit.side) if u.enemy_id == eid) >= n:
            return False
    if "allies_alive_below" in cond:
        if len([a for a in combat.allies_of(unit) if not a.is_object]) >= cond["allies_alive_below"]:
            return False
    if "foe_without_status" in cond:
        if all(f.has(cond["foe_without_status"]) for f in combat.enemies_of(unit)):
            return False
    if "phase" in cond and unit.phase != cond["phase"]:
        return False
    if "boss_alive" in cond:
        if not any(u.alive and u.enemy_id == cond["boss_alive"] for u in combat.units):
            return False
    return True


def _usable(combat, unit, opt) -> bool:
    aid = opt["id"]
    ab = ENEMY_ABILITIES[aid]
    if unit.cooldowns.get(aid):
        return False
    if unit.has("silenced") and SPELL_TAGS & set(ab.get("tags", [])):
        return False
    if ab.get("once_per_combat") and aid in unit.used_once:
        return False
    return _cond_ok(combat, unit, opt.get("if", {}))


def pick_target(combat, unit, profile: str | None = None, ab: dict | None = None):
    t = (ab or {}).get("target", "enemy")
    if t in ("self", "all_allies", "all_enemies", "front_enemies", "random_enemies"):
        return None
    if t == "ally":
        allies = [a for a in combat.allies_of(unit) if not a.is_object and a.max_hp > 0]
        boss = [a for a in allies if a.is_boss]
        pref = (ab or {}).get("ally_pref", "lowest")
        if pref == "boss" and boss:
            return boss[0]
        return min(allies, key=lambda a: a.hp_frac()) if allies else unit
    foes = combat.enemies_of(unit)
    if not foes:
        return None
    melee = (ab or {}).get("range", unit.attack.get("range", "melee")) == "melee" if ab else \
        unit.attack.get("range", "melee") == "melee"
    if unit.side == "player":
        foes = combat.reachable(unit, melee) or foes
        # Summons prefer real threats over objects unless objects are all that remain.
        real = [f for f in foes if not f.is_object]
        foes = real or foes
    profile = profile or unit.ai.get("targeting", "random")
    rng = combat.rng
    if profile == "lowest_hp":
        return min(foes, key=lambda f: f.hp)
    if profile == "player":
        pl = [f for f in foes if f.is_player]
        return pl[0] if pl else rng.choice(foes)
    if profile == "summons_first":
        s = [f for f in foes if f.summon]
        return rng.choice(s) if s else rng.choice(foes)
    if profile == "weakest_armor":
        return min(foes, key=lambda f: f.armor())
    # random, but weighted toward the player (the real threat)
    pl = [f for f in foes if f.is_player]
    if pl and rng.random() < 0.65:
        return pl[0]
    return rng.choice(foes)


def choose_action(combat, unit):
    rng = combat.rng
    # Released charge takes priority.
    ch = unit.get_status("charging")
    if ch:
        aid = ch["data"]["ability"]
        tgt = combat.find(ch["data"].get("target") or "")
        return ("release", aid, tgt)

    if unit.is_object and not unit.ai.get("abilities"):
        return ("skip", f"{unit.name} hums ominously.")

    if unit.has("provoked"):
        src = combat.find(unit.get_status("provoked")["data"].get("source") or "")
        if src and src.alive:
            return ("attack", src)

    if unit.has("confused") and rng.random() < 0.5:
        others = [u for u in combat.living() if u is not unit and not u.is_object]
        if others:
            tgt = rng.choice(others)
            combat.say(f"{unit.name} lashes out in confusion!", "status")
            return ("attack", tgt)

    options = [o for o in unit.ai.get("abilities", []) if _usable(combat, unit, o)]
    # Weighted pick among abilities plus an implicit basic attack.
    basic_w = 0 if unit.is_object else unit.ai.get("basic_weight", 3)
    total = sum(o.get("weight", 1) for o in options) + basic_w
    choice = None
    if total > 0:
        roll = rng.random() * total
        acc = 0
        for o in options:
            acc += o.get("weight", 1)
            if roll < acc:
                choice = o
                break
    if choice is None:
        if unit.is_object:
            return ("skip", f"{unit.name} hums ominously.")
        tgt = pick_target(combat, unit)
        if tgt is None:
            return ("skip", f"{unit.name} hesitates.")
        if tgt.is_player and tgt.has("stealthed") and rng.random() < 0.5:
            return ("skip", f"{unit.name} searches the shadows for you but finds nothing.")
        return ("attack", tgt)

    aid = choice["id"]
    ab = ENEMY_ABILITIES[aid]
    tgt = pick_target(combat, unit, choice.get("targeting"), ab)
    if ab.get("target", "enemy") == "enemy":
        if tgt is None:
            return ("skip", f"{unit.name} hesitates.")
        if tgt.is_player and tgt.has("stealthed") and rng.random() < 0.5:
            return ("skip", f"{unit.name} searches the shadows for you but finds nothing.")
    if ab.get("charge"):
        # cooldown starts when released; mark to avoid re-selecting mid-charge
        return ("charge", aid, tgt)
    return ("ability", aid, tgt)
