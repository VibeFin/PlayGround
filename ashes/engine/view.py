"""Build the JSON view-model consumed by the browser UI."""
from __future__ import annotations

from ..data.races import RACES, RACIAL_ABILITIES
from ..data.classes import CLASSES
from ..data.skills import SKILL_TREES, TIER_LEVEL, TIER_POINTS
from ..data.world import REGIONS, SHOPS
from ..data.dialogue import DIALOGUES
from ..data.achievements import ACHIEVEMENTS
from ..data.factions import FACTIONS
from ..data.lore import LORE
from ..data import items as ItemData
from .character import get_ability, xp_for_level, creation_points, starting_attrs, CREATION_MAX_ATTR, MAX_LEVEL
from .stats import describe_mods, ATTRS, ATTR_NAMES, ELEMENTS
from . import dialogue as Dlg
from . import rules


def item_view(item: dict | None, game=None) -> dict | None:
    if not item:
        return None
    v = {"uid": item["uid"], "id": item["id"], "name": item["name"], "rarity": item.get("rarity", "common"),
         "kind": item["kind"], "slot": item.get("slot"), "qty": item.get("qty", 1), "value": item.get("value", 0),
         "level": item.get("level"), "mods": describe_mods(item.get("mods", {})), "flavor": item.get("flavor", ""),
         "desc": item.get("desc", "")}
    if item.get("dmg"):
        el = "arcane" if item.get("magic") else "physical"
        v["dmg"] = f"{item['dmg'][0]}-{item['dmg'][1]} {el}"
        v["hands"] = item.get("hands", 1)
        v["wtype"] = item.get("wtype")
        v["ranged"] = item.get("ranged", False)
    if item.get("weight"):
        v["weight"] = item["weight"]
    if item.get("read"):
        v["readable"] = True
    if item["kind"] == "consumable":
        cdef = ItemData.CONSUMABLES[item["id"]]
        v["use"] = cdef["use"]
        v["target"] = cdef.get("target", "self")
    if game is not None and item["kind"] in ("weapon", "armor", "offhand", "jewelry"):
        v["slot_name"] = ItemData.SLOT_NAMES.get(item["slot"], item["slot"].title()) if item["slot"] != "ring" else "Ring"
    return v


def ability_view(aid: str, unit=None, combat=None) -> dict:
    ab = get_ability(aid)
    v = {"id": aid, "name": ab["name"], "desc": ab.get("desc", ""), "cost": ab.get("cost", {}),
         "cooldown": ab.get("cooldown", 0), "target": ab.get("target", "enemy"), "range": ab.get("range", "weapon"),
         "tags": ab.get("tags", []), "once": ab.get("once_per_combat", False)}
    if combat is not None and unit is not None:
        ok, why = combat.ability_status(unit, aid)
        v["usable"] = ok
        v["why"] = why
        v["cd_left"] = unit.cooldowns.get(aid, 0)
        v["targets"] = [u.uid for u in combat.valid_targets(unit, aid)] if v["target"] == "enemy" else []
    return v


def player_view(game) -> dict:
    p = game.player
    s = p.stats
    nxt = xp_for_level(p.level + 1) if p.level < MAX_LEVEL else p.xp
    return {
        "name": p.name, "race": p.race, "race_name": RACES[p.race]["name"], "cls": p.cls,
        "cls_name": CLASSES[p.cls]["name"], "level": p.level, "xp": p.xp, "xp_next": nxt,
        "xp_prev": xp_for_level(p.level), "hp": p.hp, "max_hp": s["max_hp"], "mp": p.mp, "max_mp": s["max_mp"],
        "sp": p.sp, "max_sp": s["max_sp"], "gold": p.gold, "attr_points": p.attr_points,
        "skill_points": p.skill_points, "day": game.day, "act": game.act,
        "attrs": {a: {"name": ATTR_NAMES[a], "base": p.attrs[a], "total": s[a]} for a in ATTRS},
        "stats": {
            "Armor": s["armor"], "Dodge": f"{s['dodge']:.0f}%", "Critical": f"{s['crit']:.0f}%",
            "Crit Damage": f"+{s['crit_dmg']:.0f}%", "Accuracy": f"{s['accuracy']:.0f}",
            "Initiative": s["initiative"], "Physical Power": s["phys_power"], "Spell Power": s["spell_power"],
            "Healing Power": s["heal_power"], "Weapon Damage": f"{s['weapon_dmg'][0]}-{s['weapon_dmg'][1]}",
            "Mana Regen": f"{s['mp_regen']}/turn", "Stamina Regen": f"{s['sp_regen']}/turn",
            "Perception": f"{s['perception']:+d}", "Persuasion": f"{s['persuade']:+d}",
            "Prices": f"{int(round(s['price_mult'] * 100))}%",
        },
        "resists": {e: s[f"res_{e}"] for e in ELEMENTS},
        "traits": RACES[p.race]["traits"], "weakness": RACES[p.race]["weakness"],
        "class_trait": CLASSES[p.cls].get("trait"),
        "racial": {"name": RACIAL_ABILITIES[RACES[p.race]["ability"]]["name"],
                   "desc": RACIAL_ABILITIES[RACES[p.race]["ability"]]["desc"]},
        "abilities": [ability_view(a) for a in p.ability_ids()],
    }


def skills_view(game) -> dict:
    p = game.player
    tree = SKILL_TREES[CLASSES[p.cls]["tree"]]
    branches = []
    for bid, b in tree["branches"].items():
        nodes = []
        for nid, n in tree["nodes"].items():
            if n["branch"] != bid:
                continue
            ok, why = p.can_learn(nid)
            desc = n.get("desc") or n.get("ability", {}).get("desc", "")
            nodes.append({"id": nid, "name": n["name"], "tier": n["tier"], "type": n["type"], "desc": desc,
                          "rank": p.skills.get(nid, 0), "max_rank": n["max_rank"], "can_learn": ok, "why": why,
                          "req_level": TIER_LEVEL[n["tier"]], "req_points": TIER_POINTS[n["tier"]],
                          "cost": n.get("ability", {}).get("cost", {}), "cooldown": n.get("ability", {}).get("cooldown", 0)})
        nodes.sort(key=lambda x: x["tier"])
        branches.append({"id": bid, "name": b["name"], "desc": b["desc"], "points": p.branch_points(bid),
                         "nodes": nodes})
    return {"branches": branches, "points": p.skill_points, "respec_cost": p.respec_cost(),
            "can_respec": bool(game.location and game.node().get("respec"))}


def location_view(game) -> dict:
    node = game.node()
    exits = []
    for ex in node.get("exits", []):
        if ex.get("hide_if") and rules.check(game, ex["hide_if"]):
            continue
        if ex.get("show_if") and not rules.check(game, ex["show_if"]):
            continue
        ok = rules.check(game, ex.get("if"))
        exits.append({"to": ex["to"], "label": game.fmt(ex.get("label", ex["to"])), "locked": not ok,
                      "locked_text": game.fmt(ex.get("locked", "")) if not ok else "",
                      "visited": ex["to"] in game.visited})
    npcs = []
    for n in game.visible_npcs():
        d = DIALOGUES[n["id"]]
        npcs.append({"id": n["id"], "name": d["name"], "title": d.get("title", ""),
                     "marker": _npc_marker(game, n["id"])})
    feats = []
    for f in game.visible_features():
        acts = [{"index": i, "label": game.fmt(a["label"])} for i, a in game.feature_actions(f)]
        if not acts and f.get("hide_when_done"):
            continue
        fdesc = f.get("desc", "")
        if isinstance(fdesc, list):
            fdesc = " ".join(v["text"] for v in fdesc if rules.check(game, v.get("if")))
        feats.append({"id": f["id"], "name": game.fmt(f["name"]), "desc": game.fmt(fdesc), "actions": acts})
    desc = node["desc"]
    if isinstance(desc, list):
        desc = "\n\n".join(v["text"] for v in desc if rules.check(game, v.get("if")))
    shop = node.get("shop")
    has_hidden = any(f.get("hidden") and rules.check(game, f.get("if"))
                     and f"found:{game.location}:{f['id']}" not in game.flags for f in node.get("features", []))
    searched = f"searched:{game.location}:{game.player.level}" in game.flags
    return {
        "id": game.location, "name": node["name"], "region": node.get("region"),
        "region_name": REGIONS.get(node.get("region"), {}).get("name", ""), "biome": node.get("biome", "city"),
        "desc": game.fmt(desc), "exits": exits, "npcs": npcs, "features": feats,
        "rest": node.get("rest"), "rest_cost": game.inn_cost() if node.get("rest") == "inn" else 0,
        "shop": shop, "shop_name": SHOPS[shop]["name"] if shop else None,
        "travel": game.travel_options(), "can_travel": bool(node.get("travel")),
        "world_open": "world_open" in game.flags,
        "can_search": not searched,
        "searchable_hint": has_hidden and not searched and game.player.stats["perception"] >= 3,
        "respec": bool(node.get("respec")), "scene_text": game.scene_text, "danger": node.get("danger"),
        "prev_location": game.prev_location, "scene_pos": game.scene_pos,
    }


def _npc_marker(game, npc_id: str) -> str | None:
    """'!' for a quest to offer, '?' for a quest turn-in or story beat; hidden quests never show markers."""
    d = DIALOGUES[npc_id]
    for m in d.get("markers", []):
        if rules.check(game, m.get("if")):
            return m.get("marker", "!")
    return None


def combat_view(game) -> dict:
    cb = game.combat
    v = cb.snapshot()
    p = cb.player
    v["abilities"] = [ability_view(a, p, cb) for a in p.abilities]
    v["attack_targets"] = [u.uid for u in cb.valid_targets(p, None)]
    v["all_enemy_targets"] = [u.uid for u in cb.enemies_of(p)]
    v["consumables"] = [item_view(it) for it in game.player.inventory
                        if it["kind"] == "consumable" and ItemData.CONSUMABLES[it["id"]]["use"] != "field"]
    v["result"] = game.combat_result
    v["player_uid"] = p.uid
    v["my_turn"] = cb.state == "ongoing" and cb.current() is p
    return v


def shop_view(game) -> dict:
    sh = SHOPS[game.shop]
    stock = [{"index": i, "item": item_view(it, game), "price": game.buy_price(it), "rep": bool(it.get("rep_item"))}
             for i, it in enumerate(game.shop_stock[game.shop])]
    sell = [{"uid": it["uid"], "item": item_view(it, game), "price": game.sell_price(it)}
            for it in game.player.inventory if it["kind"] != "key"]
    return {"id": game.shop, "name": sh["name"], "greeting": game.fmt(sh.get("greeting", "")), "stock": stock,
            "sell": sell}


def creation_view() -> dict:
    from ..data.races import RACIAL_ABILITIES as RA
    races = {}
    for rid, r in RACES.items():
        races[rid] = {"name": r["name"], "blurb": r["blurb"], "home": r["home_name"], "attr_mods": r["attr_mods"],
                      "traits": r["traits"], "weakness": r["weakness"], "points": creation_points(rid),
                      "ability": {"name": RA[r["ability"]]["name"], "desc": RA[r["ability"]]["desc"]}}
    classes = {}
    for cid, c in CLASSES.items():
        tree = SKILL_TREES[c["tree"]]
        classes[cid] = {"name": c["name"], "blurb": c["blurb"], "base_attrs": c["base_attrs"],
                        "branches": [{"name": b["name"], "desc": b["desc"]} for b in tree["branches"].values()],
                        "abilities": [ability_view(a) for a in c["abilities"]], "trait": c.get("trait"),
                        "hp": c["hp_base"], "mp": c["mp_base"], "sp": c["sp_base"]}
    start = {f"{r}:{c}": starting_attrs(r, c) for r in RACES for c in CLASSES}
    return {"races": races, "classes": classes, "start_attrs": start, "max_attr": CREATION_MAX_ATTR,
            "attr_names": ATTR_NAMES}


def debug_view(game) -> dict:
    from ..data.world import LOCATIONS, ENCOUNTERS
    from ..data.quests import QUESTS
    return {
        "locations": [{"id": k, "name": v["name"], "region": v.get("region")} for k, v in LOCATIONS.items()],
        "encounters": sorted(ENCOUNTERS),
        "quests": {q: {"state": game.quests.state(q), "stage": game.quests.stage(q)} for q in QUESTS},
        "flags": sorted(game.flags),
        "counters": dict(game.counters),
        "location": game.location, "prev_location": game.prev_location, "scene_pos": game.scene_pos,
        "cleared": sorted(game.cleared),
    }


def build_view(game, saves=None) -> dict:
    v = {"mode": game.mode, "settings": game.settings, "notifications": game.notifications, "dev": game.dev}
    game.notifications = []
    if game.dev:
        v["debug"] = debug_view(game)
    if saves is not None:
        v["saves"] = saves.list()
    if game.mode == "create":
        v["creation"] = creation_view()
    if not game.player:
        return v
    p = game.player
    v["player"] = player_view(game)
    v["messages"] = game.messages[-50:]
    v["inventory"] = {
        "equipment": {s: item_view(p.equipment[s], game) for s in ItemData.SLOTS},
        "slot_names": ItemData.SLOT_NAMES,
        "items": [item_view(it, game) for it in p.inventory],
    }
    v["skills"] = skills_view(game)
    v["quests"] = game.quests.view()
    v["achievements"] = {
        "unlocked": len(game.achievements), "total": len(ACHIEVEMENTS),
        "list": [{"id": aid, "name": a["name"] if (aid in game.achievements or not a.get("secret")) else "???",
                  "desc": game.fmt(a["desc"]) if (aid in game.achievements or not a.get("secret")) else "A secret achievement.",
                  "unlocked": aid in game.achievements, "order": game.achievements.get(aid, 0),
                  "category": a.get("category", "misc")}
                 for aid, a in ACHIEVEMENTS.items()],
    }
    v["journal"] = [{"id": lid, "title": LORE[lid]["title"], "text": game.fmt(LORE[lid]["text"])} for lid in game.lore]
    v["reputation"] = [{"id": f, "name": d["name"], "desc": d["desc"], "value": game.reputation.get(f, 0),
                        "tier": game.rep_tier(f)} for f, d in FACTIONS.items()
                       if game.reputation.get(f, 0) != 0 or f"met_faction:{f}" in game.flags]
    v["counters"] = {k: game.counters.get(k, 0) for k in ("kills", "bosses", "crits", "deaths", "quests_completed",
                                                          "places", "secrets", "gold_earned", "max_hit")}
    if game.location:
        v["location"] = location_view(game)
    if game.mode == "dialogue" and game.dialogue:
        v["dialogue"] = Dlg.view(game, game.dialogue)
    if game.mode == "combat" and game.combat:
        v["combat"] = combat_view(game)
    if game.mode == "defeat" and game.combat:
        v["combat"] = combat_view(game)
    if game.mode == "shop" and game.shop:
        v["shop"] = shop_view(game)
    if game.mode == "ending" and game.ending:
        v["ending"] = {"title": game.ending["title"], "text": game.fmt(game.ending["text"]),
                       "epilogue": [game.fmt(t) for t in game.ending.get("epilogue", [])],
                       "banner": game.ending.get("banner", "ASHES OF AETHER — ACT II")}
    tq = game.quests.tracked
    if tq:
        tracked = next((q for q in v["quests"] if q["id"] == tq), None)
        v["tracked"] = tracked
    return v
