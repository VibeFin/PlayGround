"""Aggregates every region module into the global content tables used by the engine."""
from . import valewatch, sylvara, kharum, emberfall, wilds, vault

_MODULES = [valewatch, sylvara, kharum, emberfall, wilds, vault]


def _merge(attr: str) -> dict:
    out: dict = {}
    for m in _MODULES:
        for k, v in getattr(m, attr, {}).items():
            if k in out:
                raise ValueError(f"Duplicate {attr} id '{k}' in {m.__name__}")
            out[k] = v
    return out


LOCATIONS = _merge("LOCATIONS")
ENCOUNTERS = _merge("ENCOUNTERS")
SHOPS = _merge("SHOPS")
DIALOGUES = _merge("DIALOGUES")
QUESTS = _merge("QUESTS")
LORE = _merge("LORE")

REGIONS = {
    "valewatch": {"name": "Valewatch", "desc": "A human river-city of guilds and lamplight."},
    "sylvara": {"name": "Sylvara", "desc": "The elven city grown through the boughs of the Heartroot."},
    "kharum": {"name": "Kharum-Dûr", "desc": "The dwarven hold carved into the Anvil Mountains."},
    "emberfall": {"name": "Emberfall Crossing", "desc": "The crossroads town at the heart of the realm."},
    "millbrook": {"name": "Millbrook", "desc": "A farming village with a scarecrow problem."},
    "redcap": {"name": "Redcap Hold", "desc": "A bandit-held hillfort."},
    "greymarch": {"name": "Greymarch Road", "desc": "An old road through marsh and moor."},
    "mistvale": {"name": "The Mistvale", "desc": "A valley of eternal mist and giant spiders."},
    "ironpass": {"name": "The Iron Pass", "desc": "A storm-wracked mountain pass."},
    "ashen_scar": {"name": "The Ashen Scar", "desc": "A dead land of grey ash."},
    "vault": {"name": "The Aether Vault", "desc": "The Vaultwrights' seal beneath the Scar."},
}

_AMBUSH_LOW = ["enc_gm_wolves", "enc_sy_wolves"]
_AMBUSH_MID = ["enc_gm_ghouls", "enc_gm_wolves", "enc_mv_wolves"]

# Fast-travel destinations, usable from any location with a "travel" key once the world is open.
TRAVEL = {
    "valewatch": {"name": "Valewatch", "node": "vw_gate", "region": "valewatch", "days": 2, "level": "1-9",
                  "desc": "The human river-city."},
    "sylvara": {"name": "Sylvara", "node": "sy_gate", "region": "sylvara", "days": 2, "level": "1-9",
                "desc": "The elven tree-city."},
    "kharum": {"name": "Kharum-Dûr", "node": "kd_gate", "region": "kharum", "days": 2, "level": "1-9",
               "desc": "The dwarven mountain hold."},
    "emberfall": {"name": "Emberfall Crossing", "node": "ec_square", "region": "emberfall", "days": 1, "level": "4+",
                  "desc": "The crossroads of the realm.", "ambush": _AMBUSH_LOW},
    "greymarch": {"name": "Greymarch Road", "node": "gm_road", "region": "greymarch", "days": 2, "level": "5-10",
                  "desc": "Marsh road west of the Crossing.", "hidden": True, "ambush": _AMBUSH_MID},
    "millbrook": {"name": "Millbrook", "node": "mb_village", "region": "millbrook", "days": 1, "level": "5-8",
                  "desc": "A farming village.", "hidden": True},
    "redcap": {"name": "Redcap Hold", "node": "rh_gate", "region": "redcap", "days": 1, "level": "6-9",
               "desc": "A bandit hillfort north of the Crossing.", "hidden": True},
    "mistvale": {"name": "The Mistvale", "node": "mv_mistvale", "region": "mistvale", "days": 2, "level": "6-10",
                 "desc": "Misty valley south of Sylvara.", "hidden": True, "ambush": _AMBUSH_MID},
    "ironpass": {"name": "The Iron Pass", "node": "ip_ironpass", "region": "ironpass", "days": 2, "level": "7-11",
                 "desc": "Mountain pass north of Kharum-Dûr.", "hidden": True, "ambush": ["enc_ip_wolves"]},
    "ashen_scar": {"name": "The Ashen Scar", "node": "as_ridge", "region": "ashen_scar", "days": 3, "level": "9-12",
                   "desc": "Where the Keystones point.", "hidden": True, "if": {"flag": "convergence_done"}},
}
