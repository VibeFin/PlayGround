"""Item construction, procedural loot generation and inventory helpers.

Items are plain JSON-serializable dicts so they survive save/load untouched.
"""
from __future__ import annotations

import random
import uuid

from ..data import items as D

STACKABLE_KINDS = {"consumable", "key"}


def new_uid() -> str:
    return uuid.uuid4().hex[:10]


def _scale(mods: dict, tier: int) -> dict:
    mult = D.TIER_MULT[tier]
    out = {}
    for k, v in mods.items():
        if k in D.NON_SCALING or v < 0:
            out[k] = v
        else:
            out[k] = max(1, round(v * mult))
    return out


def _value(tier: int, rarity: str, base: int = 20) -> int:
    return int(base * D.TIER_MULT[tier] ** 1.5 * D.RARITY_VALUE[rarity])


def parse_equip_id(item_id: str):
    """'t2_greataxe' -> (2, 'greataxe'); 't1_heavy_chest' -> (1, 'heavy_chest')."""
    if len(item_id) > 3 and item_id[0] == "t" and item_id[1].isdigit() and item_id[2] == "_":
        return int(item_id[1]), item_id[3:]
    return None, None


def make_item(item_id: str, qty: int = 1, rarity: str = "common", affix_ids=None, rng=None) -> dict:
    """Create an item instance from any known id (equipment, consumable, key item, unique)."""
    if item_id in D.CONSUMABLES:
        c = D.CONSUMABLES[item_id]
        return {"uid": new_uid(), "id": item_id, "kind": "consumable", "name": c["name"], "rarity": "common",
                "qty": qty, "value": c["value"], "desc": c["desc"]}
    if item_id in D.KEY_ITEMS:
        k = D.KEY_ITEMS[item_id]
        return {"uid": new_uid(), "id": item_id, "kind": "key", "name": k["name"], "rarity": "quest",
                "qty": qty, "value": 0, "desc": k["desc"], "read": k.get("read")}
    if item_id in D.UNIQUES:
        return make_unique(item_id)
    tier, base = parse_equip_id(item_id)
    if tier is None:
        raise KeyError(f"Unknown item id: {item_id}")
    item = _make_base(tier, base)
    if affix_ids is None and D.RARITY_AFFIXES.get(rarity, 0) and rng is not None:
        affix_ids = roll_affixes(item, rarity, rng)
    apply_affixes(item, affix_ids or [], rarity)
    return item


def _make_base(tier: int, base: str) -> dict:
    lvl = D.TIER_LEVEL[tier]
    if base in D.WEAPONS:
        w = D.WEAPONS[base]
        mult = D.TIER_MULT[tier]
        return {"uid": new_uid(), "id": f"t{tier}_{base}", "kind": "weapon", "base": base,
                "name": f"{D.MATERIALS[w['mat']][tier]} {w['name']}", "slot": "main_hand",
                "hands": w["hands"], "dmg": [round(w["dmg"][0] * mult), round(w["dmg"][1] * mult)],
                "scaling": w["scaling"], "wtype": w["wtype"], "ranged": w.get("ranged", False),
                "magic": w.get("magic", False), "mods": _scale(w["mods"], tier), "tier": tier, "level": lvl,
                "rarity": "common", "affixes": [], "value": _value(tier, "common", 25)}
    if base in D.OFFHANDS:
        o = D.OFFHANDS[base]
        return {"uid": new_uid(), "id": f"t{tier}_{base}", "kind": "offhand", "base": base, "otype": o["otype"],
                "name": f"{D.MATERIALS[o['mat']][tier]} {o['name']}" if base == "shield" else
                f"{['', 'Novice', 'Adept', 'Master', 'Aetheric'][tier]} {o['name']}",
                "slot": "off_hand", "mods": _scale(o["mods"], tier), "tier": tier, "level": lvl,
                "rarity": "common", "affixes": [], "value": _value(tier, "common", 20)}
    if base in D.JEWELRY:
        j = D.JEWELRY[base]
        return {"uid": new_uid(), "id": f"t{tier}_{base}", "kind": "jewelry", "base": base,
                "name": f"{D.MATERIALS['jewel'][tier]} {j['name']}", "slot": j["slot"],
                "mods": _scale(j["mods"], tier), "tier": tier, "level": lvl, "rarity": "common",
                "affixes": [], "value": _value(tier, "common", 30)}
    weight, _, slot = base.partition("_")
    if weight in D.ARMOR_BASE and slot in D.ARMOR_BASE[weight]:
        return {"uid": new_uid(), "id": f"t{tier}_{base}", "kind": "armor", "base": base, "weight": weight,
                "name": f"{D.MATERIALS[weight][tier]} {D.ARMOR_SLOT_NAMES[weight][slot]}", "slot": slot,
                "mods": _scale(D.ARMOR_BASE[weight][slot], tier), "tier": tier, "level": lvl,
                "rarity": "common", "affixes": [], "value": _value(tier, "common", 18)}
    raise KeyError(f"Unknown equipment base: {base}")


def make_unique(uid_key: str) -> dict:
    u = D.UNIQUES[uid_key]
    tier = u["tier"]
    item = {"uid": new_uid(), "id": uid_key, "name": u["name"], "rarity": "legendary", "tier": tier,
            "level": D.TIER_LEVEL[tier], "flavor": u.get("flavor", ""), "affixes": [],
            "value": _value(tier, "legendary", 25)}
    if "base" in u:
        base = _make_base(tier, u["base"])
        for k in ("kind", "slot", "hands", "dmg", "scaling", "wtype", "ranged", "magic", "otype", "base"):
            if k in base:
                item[k] = base[k]
        mods = dict(base["mods"])
        for k, v in u["mods"].items():
            mods[k] = mods.get(k, 0) + v
        item["mods"] = mods
    else:
        item["slot"] = u["slot"]
        item["kind"] = "jewelry" if u["slot"] in ("amulet", "ring") else "armor"
        if "armor_weight" in u:
            item["weight"] = u["armor_weight"]
        item["mods"] = dict(u["mods"])
    return item


def item_category(item: dict) -> set:
    cats = {"any"}
    kind = item.get("kind")
    if kind == "weapon":
        cats.add("weapon")
    elif kind == "offhand":
        cats.add("offhand")
    elif kind == "jewelry":
        cats.add("jewelry")
    elif kind == "armor":
        cats.add("armor")
        cats.add(item["slot"])
    return cats


def roll_affixes(item: dict, rarity: str, rng: random.Random) -> list:
    n = D.RARITY_AFFIXES.get(rarity, 0)
    cats = item_category(item)
    pool = [aid for aid, a in D.AFFIXES.items() if cats & set(a["cats"])]
    chosen, used_pos = [], {"prefix": 0, "suffix": 0}
    rng.shuffle(pool)
    for aid in pool:
        if len(chosen) >= n:
            break
        pos = D.AFFIXES[aid]["pos"]
        if used_pos[pos] >= 2:
            continue
        chosen.append(aid)
        used_pos[pos] += 1
    return chosen


def apply_affixes(item: dict, affix_ids: list, rarity: str) -> None:
    tier = item.get("tier", 1)
    prefix = suffix = None
    for aid in affix_ids:
        a = D.AFFIXES[aid]
        for k, v in _scale(a["mods"], tier).items():
            item["mods"][k] = item["mods"].get(k, 0) + v
        if a["pos"] == "prefix" and prefix is None:
            prefix = a["name"]
        elif a["pos"] == "suffix" and suffix is None:
            suffix = a["name"]
    if rarity == "epic":
        # Epic items get a flat quality bonus on their primary stat.
        if item.get("dmg"):
            item["dmg"] = [round(item["dmg"][0] * 1.15), round(item["dmg"][1] * 1.15)]
        if "armor" in item["mods"]:
            item["mods"]["armor"] = round(item["mods"]["armor"] * 1.2)
    item["affixes"] = list(affix_ids)
    item["rarity"] = rarity
    name = item["name"]
    if prefix:
        name = f"{prefix} {name}"
    if suffix:
        name = f"{name} {suffix}"
    item["name"] = name
    item["value"] = int(item["value"] * D.RARITY_VALUE[rarity])


RARITY_WEIGHTS = {
    "minion": {"common": 60, "uncommon": 30, "rare": 9, "epic": 1},
    "elite": {"common": 25, "uncommon": 45, "rare": 25, "epic": 5},
    "boss": {"common": 0, "uncommon": 20, "rare": 55, "epic": 25},
    "chest": {"common": 30, "uncommon": 40, "rare": 25, "epic": 5},
    "shop": {"common": 55, "uncommon": 35, "rare": 10, "epic": 0},
    "shop_good": {"common": 25, "uncommon": 45, "rare": 27, "epic": 3},
    "trash": {"common": 100, "uncommon": 0, "rare": 0, "epic": 0},
}


def tier_for_level(level: int) -> int:
    if level >= 10:
        return 4
    if level >= 7:
        return 3
    if level >= 4:
        return 2
    return 1


EQUIP_BASES = (list(D.WEAPONS) + list(D.OFFHANDS) + list(D.JEWELRY) +
               [f"{w}_{s}" for w in D.ARMOR_BASE for s in D.ARMOR_BASE[w]])


def generate_equipment(level: int, rng: random.Random, quality: str = "minion", rarity: str | None = None,
                       base: str | None = None) -> dict:
    tier = tier_for_level(level)
    if rarity is None:
        weights = RARITY_WEIGHTS[quality]
        rarity = rng.choices(list(weights), weights=list(weights.values()))[0]
    base = base or rng.choice(EQUIP_BASES)
    return make_item(f"t{tier}_{base}", rarity=rarity, rng=rng)


def consumable_for_level(level: int, rng: random.Random) -> str:
    if level >= 8:
        pool = ["potion_heal_greater", "potion_heal", "potion_mana", "tonic_stamina", "frost_bomb", "elixir_might",
                "elixir_ironhide", "antidote"]
    elif level >= 4:
        pool = ["potion_heal", "potion_heal_minor", "potion_mana", "potion_mana_minor", "tonic_stamina",
                "fire_flask", "antidote", "smoke_bomb"]
    else:
        pool = ["potion_heal_minor", "potion_heal_minor", "potion_mana_minor", "tonic_stamina", "antidote",
                "fire_flask"]
    return rng.choice(pool)


def roll_loot(level: int, quality: str, rng: random.Random, gold_range=(0, 0)) -> tuple[int, list]:
    """Return (gold, [items]) for a defeated enemy or opened chest."""
    gold = rng.randint(*gold_range) if gold_range[1] else 0
    items = []
    equip_chance = {"minion": 0.12, "elite": 0.45, "boss": 1.0, "chest": 0.8}.get(quality, 0.1)
    if rng.random() < equip_chance:
        items.append(generate_equipment(level, rng, quality))
    if quality == "boss" and rng.random() < 0.5:
        items.append(generate_equipment(level, rng, "elite"))
    cons_chance = {"minion": 0.18, "elite": 0.4, "boss": 1.0, "chest": 0.7}.get(quality, 0.15)
    if rng.random() < cons_chance:
        items.append(make_item(consumable_for_level(level, rng)))
    return gold, items


# ---------------------------------------------------------------- inventory

def inv_add(inventory: list, item: dict) -> dict:
    if item["kind"] in STACKABLE_KINDS:
        for it in inventory:
            if it["id"] == item["id"]:
                it["qty"] = it.get("qty", 1) + item.get("qty", 1)
                return it
    inventory.append(item)
    return item


def inv_count(inventory: list, item_id: str) -> int:
    return sum(it.get("qty", 1) for it in inventory if it["id"] == item_id)


def inv_find(inventory: list, uid: str) -> dict | None:
    for it in inventory:
        if it["uid"] == uid:
            return it
    return None


def inv_remove(inventory: list, item_id: str | None = None, qty: int = 1, uid: str | None = None) -> int:
    """Remove up to qty items by id (or a specific uid). Returns number removed."""
    removed = 0
    for it in list(inventory):
        if removed >= qty:
            break
        if (uid and it["uid"] == uid) or (not uid and it["id"] == item_id):
            have = it.get("qty", 1)
            take = min(have, qty - removed)
            if have - take <= 0:
                inventory.remove(it)
            else:
                it["qty"] = have - take
            removed += take
    return removed


def sell_value(item: dict) -> int:
    if item.get("kind") == "key":
        return 0
    return max(1, item.get("value", 1) // 3)
