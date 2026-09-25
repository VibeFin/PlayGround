"""Attribute and derived-stat formulas.

All derived numbers flow through `derive()`, so balancing lives in one place.
"""
from __future__ import annotations

ATTRS = ["str", "dex", "con", "int", "wis", "cha"]
ATTR_NAMES = {"str": "Strength", "dex": "Dexterity", "con": "Constitution",
              "int": "Intelligence", "wis": "Wisdom", "cha": "Charisma"}
ELEMENTS = ["physical", "fire", "frost", "lightning", "arcane", "poison", "shadow"]
MAGIC_ELEMENTS = [e for e in ELEMENTS if e != "physical"]
RES_CAP = 75
DODGE_CAP = 60
CRIT_CAP = 75


def attr_mod(value: int) -> int:
    """Tabletop-style modifier: 10-11 -> 0, 12-13 -> +1, 8-9 -> -1."""
    return (value - 10) // 2


def sum_mods(*sources) -> dict:
    out: dict = {}
    for src in sources:
        if not src:
            continue
        for k, v in src.items():
            out[k] = out.get(k, 0) + v
    return out


def scale_mods(mods: dict, factor: float) -> dict:
    return {k: v * factor for k, v in mods.items()}


def derive(attrs: dict, level: int, cls: dict, mods: dict, weapon: dict | None = None,
           offhand: dict | None = None) -> dict:
    """Compute the full derived stat block.

    attrs: final attributes (base + race + allocation). Attribute bonuses from gear
    arrive through `mods` under the attribute keys and are added here.
    """
    a = {k: int(attrs.get(k, 10) + mods.get(k, 0)) for k in ATTRS}
    m = mods.get
    L = level

    hp = cls["hp_base"] + cls["hp_lvl"] * (L - 1) + 3 * (a["con"] - 10) + (L - 1) * max(0, attr_mod(a["con"]))
    hp = (hp + m("max_hp", 0)) * (1 + m("max_hp_pct", 0) / 100)
    mp = cls["mp_base"] + cls["mp_lvl"] * (L - 1) + 2 * (a["int"] - 10) + (a["wis"] - 10)
    mp = (mp + m("max_mp", 0)) * (1 + m("max_mp_pct", 0) / 100)
    sp = cls["sp_base"] + cls["sp_lvl"] * (L - 1) + (a["con"] - 10) + (a["dex"] - 10)
    sp = (sp + m("max_sp", 0)) * (1 + m("max_sp_pct", 0) / 100)

    spell_power = (a["int"] - 10) + L + attr_mod(a["wis"]) + m("spell_power", 0)
    spell_power *= 1 + m("spell_power_pct", 0) / 100
    heal_power = (a["wis"] - 10) + attr_mod(a["int"]) + L + m("heal_power", 0) + m("spell_power", 0) // 2

    weapon = weapon or {"dmg": [1, 3], "scaling": "str", "wtype": "unarmed", "hands": 1}
    scaling = weapon.get("scaling", "str")
    if scaling == "finesse":
        key_attr = max(a["str"], a["dex"])
    elif scaling in a:
        key_attr = a[scaling]
    else:
        key_attr = a["str"]
    phys_power = (key_attr - 10) + L + m("phys_power", 0)
    attack_power = spell_power if weapon.get("magic") else phys_power

    dmg_lo, dmg_hi = weapon.get("dmg", [1, 3])
    # Dual wielding: an off-hand weapon adds 30% of its damage to every weapon hit.
    if offhand and offhand.get("dmg"):
        dmg_lo += round(offhand["dmg"][0] * 0.3)
        dmg_hi += round(offhand["dmg"][1] * 0.3)

    stats = {
        **a,
        "level": L,
        "max_hp": max(10, int(hp)),
        "max_mp": max(0, int(mp)),
        "max_sp": max(10, int(sp)),
        "armor": max(0, int(m("armor", 0) + max(0, attr_mod(a["con"])))),
        "dodge": min(DODGE_CAP, 5 + (a["dex"] - 10) + m("dodge", 0)),
        "crit": min(CRIT_CAP, 5 + (a["dex"] - 10) * 0.5 + m("crit", 0)),
        "crit_dmg": 50 + m("crit_dmg", 0),
        "accuracy": (a["dex"] - 10) * 0.5 + m("accuracy", 0),
        "initiative": 10 + (a["dex"] - 10) + attr_mod(a["wis"]) + m("initiative", 0),
        "phys_power": int(phys_power),
        "spell_power": int(spell_power),
        "heal_power": int(heal_power),
        "attack_power": int(attack_power),
        "mp_regen": max(0, 2 + max(0, attr_mod(a["wis"])) + m("mp_regen", 0)),
        "sp_regen": max(0, 4 + max(0, attr_mod(a["con"])) + m("sp_regen", 0)),
        "perception": attr_mod(a["wis"]) + m("perception", 0),
        "persuade": attr_mod(a["cha"]) + m("persuade", 0),
        "price_mult": max(0.6, 1 - 0.02 * (a["cha"] - 10) + m("price_pct", 0) / 100),
        "xp_mult": 1 + m("xp_pct", 0) / 100,
        "weapon_dmg": [max(1, dmg_lo), max(1, dmg_hi)],
        "weapon_scaling": scaling,
        "weapon_type": weapon.get("wtype", "unarmed"),
        "weapon_ranged": bool(weapon.get("ranged")),
        "weapon_magic": bool(weapon.get("magic")),
        "has_shield": bool(offhand and offhand.get("otype") == "shield"),
    }
    wis_res = max(0, a["wis"] - 10)
    for el in ELEMENTS:
        base = m(f"res_{el}", 0) + m("res_all", 0) + (wis_res if el != "physical" else 0)
        stats[f"res_{el}"] = min(RES_CAP, base)

    # Pass through special-effect keys untouched (on-hit effects, lifesteal, etc.).
    reserved = set(stats) | {"max_hp_pct", "max_mp_pct", "max_sp_pct", "spell_power_pct", "res_all",
                             "price_pct", "xp_pct", "max_hp", "max_mp", "max_sp"}
    for k, v in mods.items():
        if k not in reserved and not k.startswith("res_"):
            stats[k] = v
    return stats


def fmt_stat_value(key: str, value) -> str:
    pct_keys = {"dodge", "crit", "crit_dmg", "xp_pct", "price_pct", "lifesteal_pct", "max_hp_pct", "max_mp_pct",
                "max_sp_pct", "spell_power_pct", "dmg_dealt_pct", "dmg_taken_pct", "cc_resist", "misdirect",
                "potion_pct", "poison_on_hit", "bleed_on_hit", "backstab_pct", "elem_dmg_pct", "poison_dmg_pct",
                "low_hp_dmg_pct", "ranged_dmg_pct", "armor_pen", "armor_pct"}
    v = int(value) if float(value).is_integer() else round(value, 1)
    sign = "+" if v > 0 else ""
    return f"{sign}{v}%" if key in pct_keys or key.startswith("res_") else f"{sign}{v}"


MOD_LABELS = {
    "str": "Strength", "dex": "Dexterity", "con": "Constitution", "int": "Intelligence", "wis": "Wisdom",
    "cha": "Charisma", "max_hp": "Max Health", "max_mp": "Max Mana", "max_sp": "Max Stamina",
    "max_hp_pct": "Max Health", "max_mp_pct": "Max Mana", "max_sp_pct": "Max Stamina",
    "armor": "Armor", "dodge": "Dodge", "crit": "Critical Chance", "crit_dmg": "Critical Damage",
    "accuracy": "Accuracy", "initiative": "Initiative", "phys_power": "Physical Power",
    "spell_power": "Spell Power", "spell_power_pct": "Spell Power", "heal_power": "Healing Power",
    "mp_regen": "Mana Regen", "sp_regen": "Stamina Regen", "res_all": "All Resistances",
    "res_physical": "Physical Resistance", "res_fire": "Fire Resistance", "res_frost": "Frost Resistance",
    "res_lightning": "Lightning Resistance", "res_arcane": "Arcane Resistance", "res_poison": "Poison Resistance",
    "res_shadow": "Shadow Resistance", "on_hit_fire": "Fire Damage on Hit", "on_hit_frost": "Frost Damage on Hit",
    "on_hit_lightning": "Lightning Damage on Hit", "on_hit_arcane": "Arcane Damage on Hit",
    "poison_on_hit": "Poison Chance on Hit", "bleed_on_hit": "Bleed Chance on Hit",
    "lifesteal_pct": "Life Steal", "mp_on_hit": "Mana per Hit", "thorns": "Thorns Damage",
    "start_barrier": "Barrier at Combat Start", "backstab_pct": "Stealth Attack Damage",
    "armor_pen": "Armor Penetration", "cc_resist": "Control Resistance", "persuade": "Persuasion",
    "perception": "Perception", "xp_pct": "Experience Gain", "price_pct": "Prices", "potion_pct": "Potion Healing",
    "dmg_dealt_pct": "Damage Dealt", "elem_dmg_pct": "Elemental Damage", "poison_dmg_pct": "Poison Damage",
    "low_hp_dmg_pct": "Damage Below 50% Health", "ranged_dmg_pct": "Ranged Damage", "misdirect": "Misdirection Chance",
    "crit_vs_marked": "Critical vs Marked",
}


def describe_mods(mods: dict) -> list[str]:
    return [f"{fmt_stat_value(k, v)} {MOD_LABELS.get(k, k)}" for k, v in mods.items() if v]
