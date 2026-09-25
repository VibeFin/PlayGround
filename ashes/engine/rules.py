"""Declarative condition / effect language shared by dialogue, quests, world
features, encounters and achievements.

Conditions are dicts (all keys must hold) or lists (all items must hold):
    {"flag": "x"}  {"not_flag": "x"}  {"race": "elf"}  {"cls": "mage"}
    {"level_gte": 5}  {"has_item": "id"} / {"has_item": ["id", 3]}  {"gold_gte": 50}
    {"quest": ["qid", "active"|"completed"|"failed"|"not_started"|"started"]}
    {"stage": ["qid", "stage_id"]}  {"rep_gte": ["faction", 10]}  {"rep_lt": [...]}
    {"attr_gte": ["cha", 14]}  {"visited": "node"}  {"counter_gte": ["kills", 10]}
    {"achievement": "id"}  {"skill": "node_id"}  {"any": [...]}  {"not": {...}}
    {"native": true}  (player's homeland is the current region)
    {"home": "valewatch"} {"act": 2} {"equipped": "item_id"} {"branch_gte": ["berserker", 5]}
Effects are lists of dicts; see `apply_effects`.
"""
from __future__ import annotations

from ..data.races import RACES


def check(game, cond) -> bool:
    if cond is None or cond == {} or cond == []:
        return True
    if isinstance(cond, list):
        return all(check(game, c) for c in cond)
    p = game.player
    for key, val in cond.items():
        if key == "flag":
            if val not in game.flags:
                return False
        elif key == "not_flag":
            if val in game.flags:
                return False
        elif key == "flags":
            if not all(f in game.flags for f in val):
                return False
        elif key == "race":
            if p.race != val and not (isinstance(val, list) and p.race in val):
                return False
        elif key == "not_race":
            if p.race == val:
                return False
        elif key == "cls":
            if p.cls != val and not (isinstance(val, list) and p.cls in val):
                return False
        elif key == "home":
            if RACES[p.race]["home"] != val:
                return False
        elif key == "not_home":
            if RACES[p.race]["home"] == val:
                return False
        elif key == "native":
            region = game.current_region()
            if (RACES[p.race]["home"] == region) != bool(val):
                return False
        elif key == "level_gte":
            if p.level < val:
                return False
        elif key == "level_lt":
            if p.level >= val:
                return False
        elif key == "has_item":
            iid, n = (val, 1) if isinstance(val, str) else val
            if game.item_count(iid) < n:
                return False
        elif key == "items":
            if not all(game.item_count(i) > 0 for i in val):
                return False
        elif key == "not_has_item":
            if game.item_count(val) > 0:
                return False
        elif key == "equipped":
            if not any(it and it["id"] == val for it in p.equipment.values()):
                return False
        elif key == "gold_gte":
            if p.gold < val:
                return False
        elif key == "quest":
            qid, state = val
            if not game.quests.is_state(qid, state):
                return False
        elif key == "stage":
            qid, stage = val
            if game.quests.stage(qid) != stage:
                return False
        elif key == "stage_in":
            qid, stages = val
            if game.quests.stage(qid) not in stages:
                return False
        elif key == "rep_gte":
            f, n = val
            if game.reputation.get(f, 0) < n:
                return False
        elif key == "rep_lt":
            f, n = val
            if game.reputation.get(f, 0) >= n:
                return False
        elif key == "attr_gte":
            a, n = val
            if p.stats[a] < n:
                return False
        elif key == "visited":
            if val not in game.visited:
                return False
        elif key == "counter_gte":
            c, n = val
            if game.counters.get(c, 0) < n:
                return False
        elif key == "achievement":
            if val not in game.achievements:
                return False
        elif key == "skill":
            if val not in p.skills:
                return False
        elif key == "branch_gte":
            b, n = val
            if p.branch_points(b) < n:
                return False
        elif key == "act":
            if game.act < val:
                return False
        elif key == "any":
            if not any(check(game, c) for c in val):
                return False
        elif key == "not":
            if check(game, val):
                return False
        elif key == "chance":
            if game.rng.random() >= val:
                return False
        elif key == "lore":
            if val not in game.lore:
                return False
        elif key == "mode":
            if game.mode != val:
                return False
        else:
            raise KeyError(f"Unknown condition key: {key}")
    return True


def apply_effects(game, effects, ctx: dict | None = None) -> None:
    """Apply a list of effects to the game state."""
    if not effects:
        return
    ctx = ctx or {}
    for eff in effects:
        if "if" in eff and not check(game, eff["if"]):
            continue
        for key, val in eff.items():
            if key == "if":
                continue
            _apply_one(game, key, val, eff, ctx)


def _apply_one(game, key, val, eff, ctx):
    from . import items as I
    if key == "flag":
        for f in (val if isinstance(val, list) else [val]):
            game.set_flag(f)
    elif key == "unflag":
        for f in (val if isinstance(val, list) else [val]):
            game.flags.discard(f)
    elif key == "xp":
        game.award_xp(val, eff.get("reason", "experience"))
    elif key == "gold":
        game.change_gold(val)
    elif key == "item":
        qty = eff.get("qty", 1)
        rarity = eff.get("rarity", "common")
        game.give_item(I.make_item(val, qty=qty, rarity=rarity, rng=game.rng))
    elif key == "random_item":
        level = game.player.level + val.get("level_bonus", 0)
        game.give_item(I.generate_equipment(level, game.rng, val.get("quality", "chest"), rarity=val.get("rarity"),
                                            base=val.get("base")))
    elif key == "loot":
        gold, items = I.roll_loot(game.player.level, val, game.rng, (5 * game.player.level, 15 * game.player.level))
        if gold:
            game.change_gold(gold)
        for it in items:
            game.give_item(it)
    elif key == "remove_item":
        qty = eff.get("qty", 1)
        game.remove_item(val, qty)
    elif key == "start_quest":
        game.quests.start(val)
    elif key == "set_stage":
        qid, stage = val
        game.quests.set_stage(qid, stage)
    elif key == "complete_quest":
        game.quests.complete(val)
    elif key == "fail_quest":
        game.quests.fail(val)
    elif key == "rep":
        f, n = val
        game.change_rep(f, n)
    elif key == "achievement":
        game.unlock_achievement(val)
    elif key == "combat":
        game.queue_combat(val)
    elif key == "dialogue":
        game.queue_dialogue(val)
    elif key == "travel":
        game.queue_move(val)
    elif key == "msg":
        game.message(game.fmt(val), eff.get("kind", "story"))
    elif key == "heal_full":
        game.player.restore_full()
    elif key == "damage_pct":
        p = game.player
        dmg = max(1, int(p.stats["max_hp"] * val / 100))
        p.hp = max(1, p.hp - dmg)
        game.message(f"You take {dmg} damage.", "bad")
    elif key == "counter":
        name, n = (val, 1) if isinstance(val, str) else val
        game.counters[name] = game.counters.get(name, 0) + n
    elif key == "lore":
        game.add_lore(val)
    elif key == "discover":
        for t in (val if isinstance(val, list) else [val]):
            game.discover(t)
    elif key == "open_world":
        game.set_flag("world_open")
    elif key == "shop":
        game.queue_shop(val)
    elif key == "ending":
        game.queue_ending(val)
    elif key == "rest":
        game.rest(free=True)
    elif key == "attr_point":
        game.player.attr_points += val
        game.message(f"You gain {val} attribute point{'s' if val > 1 else ''}!", "good")
    elif key == "skill_point":
        game.player.skill_points += val
        game.message(f"You gain {val} skill point{'s' if val > 1 else ''}!", "good")
    elif key == "unique":
        game.give_item(I.make_unique(val))
    elif key in ("reason", "qty", "rarity", "kind"):
        pass
    else:
        raise KeyError(f"Unknown effect key: {key}")
