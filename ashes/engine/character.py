"""Player character: creation rules, progression, skills and equipment."""
from __future__ import annotations

from ..data.races import RACES, RACIAL_ABILITIES
from ..data.classes import CLASSES, BASE_ABILITIES
from ..data.skills import SKILL_TREES, SKILL_NODES, TIER_LEVEL, TIER_POINTS
from ..data import items as ItemData
from . import items as I
from .stats import ATTRS, derive, sum_mods, scale_mods

CREATION_POINTS = 4
CREATION_MAX_ATTR = 18
MAX_LEVEL = 15
# Cumulative XP required to reach each level (index = level).
XP_TABLE = [0, 0, 150, 400, 750, 1250, 1900, 2750, 3800, 5100, 6700, 8600, 10800, 13500, 16800, 20500]
BONUS_SKILL_LEVELS = {4, 8, 12}
ATTR_POINTS_PER_LEVEL = 2


class CreationError(ValueError):
    pass


def xp_for_level(level: int) -> int:
    return XP_TABLE[min(level, MAX_LEVEL)]


def creation_points(race: str) -> int:
    return CREATION_POINTS + RACES[race].get("bonus_creation_points", 0)


def starting_attrs(race: str, cls: str) -> dict:
    base = dict(CLASSES[cls]["base_attrs"])
    for k, v in RACES[race]["attr_mods"].items():
        base[k] += v
    return base


class Character:
    def __init__(self, name: str, race: str, cls: str, attrs: dict):
        self.name = name
        self.race = race
        self.cls = cls
        self.attrs = dict(attrs)
        self.level = 1
        self.xp = 0
        self.attr_points = 0
        self.skill_points = 1 + RACES[race].get("bonus_skill_points", 0)
        self.skills: dict[str, int] = {}
        self.equipment: dict[str, dict | None] = {s: None for s in ItemData.SLOTS}
        self.inventory: list[dict] = []
        self.gold = 25
        self.hp = self.mp = self.sp = 0
        self._stats_cache = None

    # ------------------------------------------------------------ creation
    @classmethod
    def create(cls, name: str, race: str, klass: str, allocation: dict | None = None) -> "Character":
        name = (name or "").strip()[:24]
        if not name:
            raise CreationError("Your character needs a name.")
        if race not in RACES:
            raise CreationError(f"Unknown race: {race}")
        if klass not in CLASSES:
            raise CreationError(f"Unknown class: {klass}")
        allocation = allocation or {}
        attrs = starting_attrs(race, klass)
        total = 0
        for k, v in allocation.items():
            if k not in ATTRS:
                raise CreationError(f"Unknown attribute: {k}")
            v = int(v)
            if v < 0:
                raise CreationError("Attribute allocation cannot be negative.")
            attrs[k] += v
            total += v
            if attrs[k] > CREATION_MAX_ATTR:
                raise CreationError(f"{k.upper()} cannot exceed {CREATION_MAX_ATTR} at creation.")
        pts = creation_points(race)
        if total > pts:
            raise CreationError(f"You only have {pts} points to allocate.")
        ch = cls(name, race, klass, attrs)
        ch.attr_points = pts - total  # unspent creation points carry over
        cdef = CLASSES[klass]
        for item_id in cdef["start_items"]:
            it = I.make_item(item_id)
            slot = ch._target_slot(it)
            if slot and ch.equipment.get(slot) is None:
                ch.equipment[slot] = it
            else:
                I.inv_add(ch.inventory, it)
        for item_id in cdef.get("start_bag", []):
            I.inv_add(ch.inventory, I.make_item(item_id))
        for item_id, qty in cdef["start_consumables"]:
            I.inv_add(ch.inventory, I.make_item(item_id, qty=qty))
        ch.restore_full()
        return ch

    # ------------------------------------------------------------ stats
    def invalidate(self):
        self._stats_cache = None

    def gear_mods(self) -> dict:
        return sum_mods(*[it.get("mods", {}) for it in self.equipment.values() if it])

    def passive_mods(self) -> dict:
        mods = {}
        for nid, rank in self.skills.items():
            node = SKILL_NODES[nid]
            if node.get("mods_per_rank"):
                mods = sum_mods(mods, scale_mods(node["mods_per_rank"], rank))
        return mods

    def race_mods(self) -> dict:
        r = RACES[self.race]
        return sum_mods(*[t["mods"] for t in r["traits"]], r["weakness"]["mods"])

    def class_mods(self) -> dict:
        return dict(CLASSES[self.cls].get("trait", {}).get("mods", {}))

    def all_mods(self) -> dict:
        return sum_mods(self.race_mods(), self.class_mods(), self.gear_mods(), self.passive_mods())

    @property
    def stats(self) -> dict:
        if self._stats_cache is None:
            weapon = self.equipment.get("main_hand")
            off = self.equipment.get("off_hand")
            self._stats_cache = derive(self.attrs, self.level, CLASSES[self.cls], self.all_mods(), weapon,
                                       off if off and off.get("kind") == "weapon" else off)
        return self._stats_cache

    def restore_full(self):
        self.invalidate()
        s = self.stats
        self.hp, self.mp, self.sp = s["max_hp"], s["max_mp"], s["max_sp"]

    def clamp_resources(self):
        s = self.stats
        self.hp = max(0, min(self.hp, s["max_hp"]))
        self.mp = max(0, min(self.mp, s["max_mp"]))
        self.sp = max(0, min(self.sp, s["max_sp"]))

    # ------------------------------------------------------------ abilities
    def ability_ids(self) -> list[str]:
        ids = list(CLASSES[self.cls]["abilities"])
        for nid in self.skills:
            if SKILL_NODES[nid]["type"] == "active":
                ids.append(nid)
        ids.append(RACES[self.race]["ability"])
        return ids

    def triggers(self) -> list[dict]:
        out = []
        for nid, rank in self.skills.items():
            for trig in SKILL_NODES[nid].get("triggers", []):
                t = dict(trig)
                if "chance_by_rank" in t:
                    t["chance"] = t["chance_by_rank"][min(rank, len(t["chance_by_rank"])) - 1]
                t["source"] = nid
                out.append(t)
        return out

    def skill_flags(self) -> set:
        flags = set()
        for nid in self.skills:
            flags.update(SKILL_NODES[nid].get("flags", []))
        return flags

    # ------------------------------------------------------------ progression
    def gain_xp(self, amount: int) -> tuple[int, list[int]]:
        """Add XP (after racial multipliers). Returns (xp gained, list of new levels reached)."""
        gained = int(round(amount * self.stats["xp_mult"]))
        self.xp += gained
        levels = []
        while self.level < MAX_LEVEL and self.xp >= xp_for_level(self.level + 1):
            self.level += 1
            self.attr_points += ATTR_POINTS_PER_LEVEL
            self.skill_points += 1 + (1 if self.level in BONUS_SKILL_LEVELS else 0)
            levels.append(self.level)
        if levels:
            self.restore_full()
        return gained, levels

    def spend_attr(self, attr: str) -> None:
        if attr not in ATTRS:
            raise ValueError("Unknown attribute.")
        if self.attr_points <= 0:
            raise ValueError("No attribute points available.")
        before = self.stats
        self.attrs[attr] += 1
        self.attr_points -= 1
        self.invalidate()
        after = self.stats
        # Keep current resources proportional to new maxima (gain the difference).
        self.hp += after["max_hp"] - before["max_hp"]
        self.mp += after["max_mp"] - before["max_mp"]
        self.sp += after["max_sp"] - before["max_sp"]
        self.clamp_resources()

    def branch_points(self, branch: str) -> int:
        tree = SKILL_TREES[CLASSES[self.cls]["tree"]]["nodes"]
        return sum(r for nid, r in self.skills.items() if nid in tree and tree[nid]["branch"] == branch)

    def can_learn(self, node_id: str) -> tuple[bool, str]:
        tree = SKILL_TREES[CLASSES[self.cls]["tree"]]["nodes"]
        if node_id not in tree:
            return False, "That skill does not belong to your class."
        node = tree[node_id]
        rank = self.skills.get(node_id, 0)
        if rank >= node["max_rank"]:
            return False, "Already at maximum rank."
        if self.skill_points <= 0:
            return False, "No skill points available."
        tier = node["tier"]
        if self.level < TIER_LEVEL[tier]:
            return False, f"Requires level {TIER_LEVEL[tier]}."
        if self.branch_points(node["branch"]) < TIER_POINTS[tier]:
            return False, f"Requires {TIER_POINTS[tier]} points invested in {node['branch'].title()}."
        return True, ""

    def learn(self, node_id: str) -> None:
        ok, why = self.can_learn(node_id)
        if not ok:
            raise ValueError(why)
        before = self.stats
        self.skills[node_id] = self.skills.get(node_id, 0) + 1
        self.skill_points -= 1
        self.invalidate()
        after = self.stats
        self.hp += max(0, after["max_hp"] - before["max_hp"])
        self.mp += max(0, after["max_mp"] - before["max_mp"])
        self.sp += max(0, after["max_sp"] - before["max_sp"])
        self.clamp_resources()

    def respec_cost(self) -> int:
        return 50 * self.level

    def respec(self) -> int:
        refunded = sum(self.skills.values())
        self.skills = {}
        self.skill_points += refunded
        self.invalidate()
        self.clamp_resources()
        return refunded

    # ------------------------------------------------------------ equipment
    def _target_slot(self, item: dict) -> str | None:
        slot = item.get("slot")
        if slot == "ring":
            if self.equipment["ring1"] is None:
                return "ring1"
            return "ring2" if self.equipment["ring2"] is None else "ring1"
        if item.get("kind") == "weapon" and item.get("hands") == 1:
            mh = self.equipment["main_hand"]
            # A second one-handed melee weapon goes to the off hand (dual wield).
            if mh is not None and mh.get("hands") == 1 and not item.get("magic") and not mh.get("magic") \
                    and self.equipment["off_hand"] is None:
                return "off_hand"
        return slot

    def equip(self, uid: str, slot: str | None = None) -> list[dict]:
        """Equip an inventory item. Returns list of items moved back to the bag."""
        item = I.inv_find(self.inventory, uid)
        if not item:
            raise ValueError("Item not found in inventory.")
        if item["kind"] not in ("weapon", "armor", "offhand", "jewelry"):
            raise ValueError("That item cannot be equipped.")
        target = slot or self._target_slot(item)
        if target == "off_hand" and item["kind"] == "weapon":
            if item.get("hands") != 1 or item.get("magic"):
                raise ValueError("Only one-handed weapons can be held in the off hand.")
        elif item["slot"] == "ring":
            if target not in ("ring1", "ring2"):
                target = "ring1"
        elif target != item["slot"]:
            raise ValueError("That item does not fit that slot.")
        displaced = []
        self.inventory.remove(item)

        def unequip_to_bag(s):
            cur = self.equipment.get(s)
            if cur:
                self.equipment[s] = None
                self.inventory.append(cur)
                displaced.append(cur)

        unequip_to_bag(target)
        if item.get("hands") == 2:
            unequip_to_bag("off_hand")
        if target == "off_hand":
            mh = self.equipment.get("main_hand")
            if mh and mh.get("hands") == 2:
                unequip_to_bag("main_hand")
        self.equipment[target] = item
        self.invalidate()
        self.clamp_resources()
        return displaced

    def unequip(self, slot: str) -> dict:
        item = self.equipment.get(slot)
        if not item:
            raise ValueError("Nothing equipped there.")
        self.equipment[slot] = None
        self.inventory.append(item)
        self.invalidate()
        self.clamp_resources()
        return item

    # ------------------------------------------------------------ serialization
    def to_dict(self) -> dict:
        return {"name": self.name, "race": self.race, "cls": self.cls, "attrs": self.attrs,
                "level": self.level, "xp": self.xp, "attr_points": self.attr_points,
                "skill_points": self.skill_points, "skills": self.skills, "equipment": self.equipment,
                "inventory": self.inventory, "gold": self.gold, "hp": self.hp, "mp": self.mp, "sp": self.sp}

    @classmethod
    def from_dict(cls, d: dict) -> "Character":
        if d["race"] not in RACES or d["cls"] not in CLASSES:
            raise ValueError("Save references an unknown race or class.")
        ch = cls(d["name"], d["race"], d["cls"], d["attrs"])
        ch.level = int(d["level"])
        ch.xp = int(d["xp"])
        ch.attr_points = int(d["attr_points"])
        ch.skill_points = int(d["skill_points"])
        ch.skills = {k: int(v) for k, v in d["skills"].items() if k in SKILL_NODES}
        ch.equipment = {s: d["equipment"].get(s) for s in ItemData.SLOTS}
        ch.inventory = list(d["inventory"])
        ch.gold = int(d["gold"])
        ch.hp, ch.mp, ch.sp = int(d["hp"]), int(d["mp"]), int(d["sp"])
        ch.clamp_resources()
        return ch


def get_ability(aid: str) -> dict:
    if aid in BASE_ABILITIES:
        return BASE_ABILITIES[aid]
    if aid in RACIAL_ABILITIES:
        return RACIAL_ABILITIES[aid]
    if aid in SKILL_NODES:
        return SKILL_NODES[aid]["ability"]
    from ..data.enemies import ENEMY_ABILITIES
    return ENEMY_ABILITIES[aid]
