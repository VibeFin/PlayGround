"""Turn-based tactical combat engine.

Model
-----
* Units live on two sides ("player", "enemy"). Enemy units occupy a front or back
  row; melee attacks can only reach the enemy front row while it has living,
  non-object units in it.
* Every round, units act in initiative order (initiative stat + d6).
* Start of a unit's turn: resource regen, damage/heal over time, stun/freeze checks.
  End of a unit's turn: status durations and cooldowns tick down (except ones
  applied during this same turn, tracked via `fresh` / `cd_fresh`).
* Abilities are data-driven lists of effects (see ashes/data/skills/*).
* Telegraphed enemy abilities ("charge": True) spend a turn charging and fire on
  the next turn unless interrupted by stun, provoke or an "interrupt" effect.
"""
from __future__ import annotations

import random

from ..data.statuses import STATUSES
from ..data.enemies import ENEMIES, ENEMY_ABILITIES
from .character import Character, get_ability
from .stats import ELEMENTS, RES_CAP

SPELL_TAGS = {"spell"}
ELEMENTAL = {"fire", "frost", "lightning"}
DIFFICULTY = {
    "story": {"to_player": 0.6, "from_player": 1.25, "xp": 1.0},
    "normal": {"to_player": 1.0, "from_player": 1.0, "xp": 1.0},
    "hard": {"to_player": 1.3, "from_player": 0.9, "xp": 1.15},
}


class CombatError(ValueError):
    pass


class Unit:
    _counter = 0

    def __init__(self, name: str, side: str, level: int, base: dict, abilities: list, *, row="front",
                 is_player=False, enemy_id=None, tags=(), is_boss=False, is_object=False, ai=None,
                 triggers=(), flags=(), xp=0, gold=(0, 0), loot="minion", attack=None, phases=(),
                 on_death=(), summon=False, desc=""):
        Unit._counter += 1
        self.uid = f"u{Unit._counter}"
        self.name = name
        self.side = side
        self.level = level
        self.base = base
        self.hp = base["max_hp"]
        self.mp = base.get("max_mp", 0)
        self.sp = base.get("max_sp", 0)
        self.barrier = 0
        self.abilities = list(abilities)
        self.row = row
        self.is_player = is_player
        self.enemy_id = enemy_id
        self.tags = set(tags)
        self.is_boss = is_boss
        self.is_object = is_object
        self.ai = ai or {}
        self.triggers = list(triggers)
        self.flags = set(flags)
        self.xp = xp
        self.gold = gold
        self.loot = loot
        self.attack = attack or {"name": "Attack", "range": "melee"}
        self.phases = list(phases)
        self.phase = 1
        self.on_death = list(on_death)
        self.summon = summon
        self.desc = desc
        self.statuses: list[dict] = []
        self.cooldowns: dict[str, int] = {}
        self.cd_fresh: set[str] = set()
        self.used_once: set[str] = set()
        self.trigger_once: set[str] = set()
        self.last_action = None
        self.summoner = None

    # --------------------------------------------------------------- stats
    @property
    def alive(self) -> bool:
        return self.hp > 0

    @property
    def max_hp(self) -> int:
        return self.base["max_hp"]

    def stat(self, key: str) -> float:
        v = self.base.get(key, 0)
        for s in self.statuses:
            sd = STATUSES[s["id"]]
            mods = sd.get("mods")
            if not mods:
                continue
            mult = s["stacks"] if sd.get("stack_mods") else 1
            v += mods.get(key, 0) * mult
            if key.startswith("res_") and key != "res_all":
                v += mods.get("res_all", 0) * mult
        return v

    def armor(self) -> float:
        return max(0.0, self.base.get("armor", 0) * (1 + self.stat("armor_pct") / 100))

    def dodge(self) -> float:
        return max(0.0, min(75.0, self.stat("dodge")))

    def res(self, element: str) -> float:
        v = self.stat(f"res_{element}")
        # Status-granted immunities (attunements, etc.) may exceed the gear cap.
        base_cap = RES_CAP
        return v if v > 100 else min(base_cap, v)

    def has(self, sid: str) -> bool:
        return any(s["id"] == sid for s in self.statuses)

    def get_status(self, sid: str):
        for s in self.statuses:
            if s["id"] == sid:
                return s
        return None

    def stacks(self, sid: str) -> int:
        s = self.get_status(sid)
        return s["stacks"] if s else 0

    def remove_status(self, sid: str) -> bool:
        before = len(self.statuses)
        self.statuses = [s for s in self.statuses if s["id"] != sid]
        return len(self.statuses) != before

    def hp_frac(self) -> float:
        return self.hp / max(1, self.max_hp)

    def snapshot(self) -> dict:
        return {
            "uid": self.uid, "name": self.name, "side": self.side, "row": self.row, "level": self.level,
            "hp": self.hp, "max_hp": self.max_hp, "mp": self.mp, "max_mp": self.base.get("max_mp", 0),
            "sp": self.sp, "max_sp": self.base.get("max_sp", 0), "barrier": self.barrier,
            "alive": self.alive, "is_player": self.is_player, "is_boss": self.is_boss, "is_object": self.is_object,
            "summon": self.summon, "desc": self.desc, "enemy_id": self.enemy_id,
            "statuses": [{"id": s["id"], "name": STATUSES[s["id"]]["name"], "turns": s["turns"],
                          "stacks": s["stacks"], "kind": STATUSES[s["id"]]["kind"],
                          "permanent": bool(STATUSES[s["id"]].get("permanent")),
                          "desc": STATUSES[s["id"]]["desc"],
                          "charging": ENEMY_ABILITIES.get(s.get("data", {}).get("ability"), {}).get("name")
                          if s["id"] == "charging" else None}
                         for s in self.statuses],
            "resists": {e: int(self.res(e)) for e in ELEMENTS if int(self.res(e)) != 0},
            "tags": sorted(self.tags),
        }


# ------------------------------------------------------------------ builders

def unit_from_character(ch: Character) -> Unit:
    s = dict(ch.stats)
    u = Unit(ch.name, "player", ch.level, s, ch.ability_ids(), is_player=True, triggers=ch.triggers(),
             flags=ch.skill_flags())
    u.hp, u.mp, u.sp = ch.hp, ch.mp, ch.sp
    u.attack = {"name": "Attack", "range": "ranged" if s["weapon_ranged"] else "melee"}
    return u


def scaled_enemy_stats(edef: dict, level: int) -> dict:
    d = level - edef["level"]
    hp = edef["hp"] * (1 + 0.16 * d)
    dmg_mult = 1 + 0.11 * d
    base = {
        "max_hp": max(1, int(hp)),
        "max_mp": 999, "max_sp": 999,
        "armor": max(0, int(edef.get("armor", 0) * (1 + 0.1 * d))),
        "dodge": edef.get("dodge", 5),
        "crit": edef.get("crit", 5),
        "crit_dmg": edef.get("crit_dmg", 50),
        "accuracy": edef.get("acc", 0) + d,
        "initiative": edef.get("init", 10),
        "weapon_dmg": [max(1, round(edef["dmg"][0] * dmg_mult)), max(1, round(edef["dmg"][1] * dmg_mult))],
        "attack_power": 0,
        "spell_power": max(0, edef.get("spell_power", edef["level"] * 2) + 2 * d),
        "heal_power": max(0, edef.get("spell_power", edef["level"] * 2) + 2 * d),
        "cc_resist": edef.get("cc_resist", 50 if edef.get("boss") else 0),
        "weapon_ranged": edef.get("attack", {}).get("range") == "ranged",
        "weapon_magic": edef.get("attack", {}).get("element", "physical") != "physical",
        "attack_element": edef.get("attack", {}).get("element", "physical"),
        "mp_regen": 0, "sp_regen": 0,
    }
    for el in ELEMENTS:
        base[f"res_{el}"] = edef.get("res", {}).get(el, 0)
    for k, v in edef.get("mods", {}).items():
        base[k] = base.get(k, 0) + v
    return base


def unit_from_enemy(eid: str, level: int | None = None, side: str = "enemy", row: str | None = None) -> Unit:
    edef = ENEMIES[eid]
    lvl = level if level is not None else edef["level"]
    base = scaled_enemy_stats(edef, lvl)
    xp = int(edef.get("xp", 0) * (1 + 0.15 * (lvl - edef["level"])))
    u = Unit(edef["name"], side, lvl, base, [a["id"] for a in edef.get("abilities", [])],
             row=row or edef.get("row", "front"), enemy_id=eid, tags=edef.get("tags", []),
             is_boss=edef.get("boss", False), is_object=edef.get("object", False),
             ai={"abilities": edef.get("abilities", []), "targeting": edef.get("targeting", "random")},
             xp=xp, gold=tuple(edef.get("gold", (0, 0))), loot=edef.get("loot", "minion"),
             attack=edef.get("attack"), phases=edef.get("phases", []), on_death=edef.get("on_death", []),
             summon=edef.get("summon", False), desc=edef.get("desc", ""))
    for st in edef.get("start_statuses", []):
        u.statuses.append({"id": st, "turns": 99, "stacks": 1, "potency": 0, "fresh": False, "data": {}})
    return u


# ------------------------------------------------------------------ combat

class Combat:
    def __init__(self, player: Unit, enemies: list[Unit], rng: random.Random | None = None,
                 flee_allowed: bool = True, difficulty: str = "normal", title: str = "", intro: str = ""):
        self.rng = rng or random.Random()
        self.units: list[Unit] = [player] + enemies
        self.player = player
        self.round = 0
        self.order: list[str] = []
        self.turn_idx = 0
        self.log: list[dict] = []
        self.state = "ongoing"
        self.flee_allowed = flee_allowed
        self.escape_guaranteed = False
        self.diff = DIFFICULTY.get(difficulty, DIFFICULTY["normal"])
        self.title = title
        self.intro = intro
        self.turn_started = False
        self.defeated: list[Unit] = []
        self.events: list[tuple] = []  # (event, data) for achievements/quests
        # Presentation feed for the 3D client: what happened, in order. Never read back by the rules.
        self.feed: list[dict] = []
        self._seq = 0
        self.player_ability_uses: dict[str, int] = {}
        self.max_hit = 0
        self.player_damage_taken = 0
        self.player_used_items = 0
        self._current_actor: Unit | None = None

    # --------------------------------------------------------------- helpers
    def say(self, text: str, kind: str = "info"):
        self.log.append({"t": text, "k": kind})

    FEED_KEEP = 400

    def emit(self, etype: str, **data):
        self._seq += 1
        data = {k: (v.uid if isinstance(v, Unit) else v) for k, v in data.items()}
        self.feed.append({"seq": self._seq, "type": etype, **data})
        if len(self.feed) > self.FEED_KEEP:
            del self.feed[:len(self.feed) - self.FEED_KEEP]

    def _drop(self, unit: Unit, source: Unit | None = None):
        """Units removed without a killing blow (dismissed summons, fleeing minions) still need a death event."""
        unit.hp = 0
        self.emit("death", target=unit, source=source, hp=0, silent=True)

    def living(self, side: str | None = None) -> list[Unit]:
        return [u for u in self.units if u.alive and (side is None or u.side == side)]

    def enemies_of(self, unit: Unit) -> list[Unit]:
        return self.living("enemy" if unit.side == "player" else "player")

    def allies_of(self, unit: Unit) -> list[Unit]:
        return self.living(unit.side)

    def find(self, uid: str) -> Unit | None:
        for u in self.units:
            if u.uid == uid:
                return u
        return None

    def current(self) -> Unit | None:
        if self.turn_idx < len(self.order):
            return self.find(self.order[self.turn_idx])
        return None

    def reachable(self, attacker: Unit, melee: bool) -> list[Unit]:
        foes = self.enemies_of(attacker)
        if not melee or attacker.side == "enemy":
            return foes
        front = [u for u in foes if u.row == "front"]
        if not front:
            return foes
        # Boss mechanisms (pylons, coils, conduits) are always in reach: the fight's hint tells you to smash them.
        return front + [u for u in foes if u.row != "front" and u.is_object]

    # --------------------------------------------------------------- flow
    def start(self):
        if self.intro:
            self.say(self.intro, "story")
        for u in self.living():
            if u.base.get("start_barrier"):
                u.barrier += int(u.base["start_barrier"])
            self.fire_triggers(u, "combat_start", {})
        self.new_round()
        self.advance()

    def new_round(self):
        self.round += 1
        alive = self.living()
        rolls = {u.uid: u.stat("initiative") + self.rng.randint(0, 6) for u in alive}
        # Players win initiative ties.
        alive.sort(key=lambda u: (rolls[u.uid], u.is_player), reverse=True)
        self.order = [u.uid for u in alive]
        self.turn_idx = 0
        self.turn_started = False
        self.say(f"— Round {self.round} —", "round")
        self.emit("round", n=self.round)

    def check_end(self) -> bool:
        if self.state != "ongoing":
            return True
        if not self.player.alive:
            self.state = "defeat"
            self.say("You have fallen...", "bad")
            self.emit("end", state="defeat")
            return True
        foes = [u for u in self.living("enemy") if not u.is_object]
        if not foes:
            self.state = "victory"
            for u in self.living("enemy"):
                self._drop(u)
            self.say("Victory!", "good")
            self.emit("end", state="victory")
            return True
        return False

    def advance(self):
        """Run turns until the player must act or combat ends."""
        guard = 0
        while not self.check_end():
            guard += 1
            if guard > 500:
                raise RuntimeError("Combat loop guard tripped")
            if self.turn_idx >= len(self.order):
                self.new_round()
                continue
            unit = self.current()
            if unit is None or not unit.alive:
                self.turn_idx += 1
                self.turn_started = False
                continue
            if not self.turn_started:
                self.turn_started = True
                can_act = self.begin_turn(unit)
                if self.check_end():
                    return
                if not can_act or not unit.alive:
                    self.end_turn(unit)
                    continue
            if unit.is_player:
                return
            self.ai_turn(unit)
            if self.check_end():
                return
            self.end_turn(unit)

    def begin_turn(self, unit: Unit) -> bool:
        self._current_actor = unit
        self.emit("turn", actor=unit)
        # resources
        if unit.is_player:
            unit.mp = min(unit.base["max_mp"], unit.mp + int(unit.stat("mp_regen")))
            unit.sp = min(unit.base["max_sp"], unit.sp + int(unit.stat("sp_regen")))
        # damage / healing over time
        for s in list(unit.statuses):
            sd = STATUSES[s["id"]]
            if sd.get("dot"):
                el = sd["dot"]["element"]
                raw = s["potency"] * s["stacks"]
                res = 0 if sd["dot"].get("ignore_armor") and el == "physical" else unit.res(el)
                amt = 0 if res >= 100 else max(1, round(raw * (1 - res / 100) * self._diff_mult(None, unit)))
                self.apply_damage(unit, amt, None, f"{sd['name']}", el, dot=True)
                if not unit.alive:
                    return False
            elif sd.get("hot"):
                self.heal(unit, s["potency"], quiet=False, label=sd["name"])
        if not unit.alive:
            return False
        for sid in ("stunned", "frozen", "sleep"):
            if unit.has(sid):
                self.say(f"{unit.name} is {STATUSES[sid]['name'].lower()} and cannot act.", "status")
                self.emit("skip", actor=unit, status=sid)
                return False
        return True

    def end_turn(self, unit: Unit):
        for s in list(unit.statuses):
            if s.get("fresh"):
                s["fresh"] = False
                continue
            if STATUSES[s["id"]].get("permanent"):
                continue
            s["turns"] -= 1
            if s["turns"] <= 0:
                unit.statuses.remove(s)
                self.emit("status_off", target=unit, status=s["id"])
                on_exp = STATUSES[s["id"]].get("on_expire")
                if s["id"] == "overheated" and unit.alive and unit.enemy_id and \
                        "plated" in ENEMIES[unit.enemy_id].get("start_statuses", []):
                    self.add_status(unit, "plated", 99, unit, force=True)
                    self.say(f"{unit.name}'s plating seals shut again.", "status")
                elif on_exp:
                    pass
        for aid in list(unit.cooldowns):
            if aid in unit.cd_fresh:
                continue
            unit.cooldowns[aid] -= 1
            if unit.cooldowns[aid] <= 0:
                del unit.cooldowns[aid]
        unit.cd_fresh.clear()
        self.turn_idx += 1
        self.turn_started = False
        self._current_actor = None

    # --------------------------------------------------------------- player API
    def ability_status(self, unit: Unit, aid: str) -> tuple[bool, str]:
        ab = get_ability(aid)
        if ab.get("once_per_combat") and aid in unit.used_once:
            return False, "Already used this combat"
        if unit.cooldowns.get(aid):
            return False, f"Cooldown {unit.cooldowns[aid]}"
        cost = ab.get("cost", {})
        if unit.mp < cost.get("mp", 0):
            return False, "Not enough mana"
        if unit.sp < cost.get("sp", 0):
            return False, "Not enough stamina"
        if unit.has("silenced") and SPELL_TAGS & set(ab.get("tags", [])):
            return False, "Silenced"
        if unit.has("provoked"):
            return False, "Provoked: basic attacks only"
        req = ab.get("requires_weapon")
        if req and unit.base.get("weapon_type") not in req:
            return False, f"Requires a {'/'.join(req)}"
        return True, ""

    def valid_targets(self, unit: Unit, aid: str | None) -> list[Unit]:
        if aid is None:
            melee = not unit.base.get("weapon_ranged")
            return self.reachable(unit, melee)
        ab = get_ability(aid)
        t = ab.get("target", "enemy")
        if t == "enemy":
            return self.reachable(unit, self._is_melee(unit, ab, {}))
        return []

    def player_act(self, kind: str, ability: str | None = None, target: str | None = None,
                   item: dict | None = None, item_effects: list | None = None):
        """Execute a player action. `item` with `item_effects` for consumables (inventory handled by Game)."""
        if self.state != "ongoing":
            raise CombatError("Combat is over.")
        unit = self.current()
        if unit is not self.player:
            raise CombatError("It is not your turn.")
        p = self.player
        if p.has("provoked") and kind not in ("attack", "defend", "item"):
            raise CombatError("You are provoked and can only attack.")

        if kind == "flee":
            if not self.flee_allowed:
                raise CombatError("There is no escape from this fight!")
            foes = self.living("enemy")
            avg_init = sum(f.stat("initiative") for f in foes) / max(1, len(foes))
            chance = max(20, min(90, 50 + (p.stat("initiative") - avg_init) * 3))
            if self.escape_guaranteed or self.rng.random() * 100 < chance:
                self.state = "fled"
                self.say("You escape!", "info")
                self.emit("flee", actor=p, ok=True)
                self.emit("end", state="fled")
                return
            self.say("You fail to escape!", "bad")
            self.emit("flee", actor=p, ok=False)
            self.end_turn(p)
            self.advance()
            return

        if p.has("confused") and kind in ("attack", "ability") and self.rng.random() < 0.4:
            self.say("You stagger in confusion and lose your action!", "status")
            self.emit("skip", actor=p, status="confused")
            self.end_turn(p)
            self.advance()
            return

        if kind == "attack":
            tgt = self._resolve_target(p, None, target)
            if p.has("provoked"):
                prov = p.get_status("provoked")
                src = self.find(prov["data"].get("source", ""))
                if src and src.alive:
                    tgt = src
            self.basic_attack(p, tgt)
            self._flow(p, "attack")
        elif kind == "ability":
            if ability not in p.abilities:
                raise CombatError("You don't know that ability.")
            ok, why = self.ability_status(p, ability)
            if not ok:
                raise CombatError(why)
            ab = get_ability(ability)
            tgt = self._resolve_target(p, ability, target) if ab.get("target", "enemy") == "enemy" else None
            self.use_ability(p, ability, tgt)
            self.player_ability_uses[ability] = self.player_ability_uses.get(ability, 0) + 1
            self._flow(p, ability)
        elif kind == "defend":
            self.emit("defend", actor=p)
            self.add_status(p, "guarded", 1, p)
            gain_sp = int(p.base["max_sp"] * 0.25)
            gain_mp = int(p.base["max_mp"] * 0.08)
            p.sp = min(p.base["max_sp"], p.sp + gain_sp)
            p.mp = min(p.base["max_mp"], p.mp + gain_mp)
            p.remove_status("flow")
            self.say(f"You brace yourself (+{gain_sp} stamina, +{gain_mp} mana).", "info")
            p.last_action = "defend"
        elif kind == "item":
            if not item_effects:
                raise CombatError("Nothing to use.")
            tgt = None
            if item and item.get("target") == "enemy":
                tgt = self._resolve_target(p, None, target, force_ranged=True)
            self.say(f"You use {item['name'] if item else 'an item'}.", "info")
            self.emit("item", actor=p, name=item["name"] if item else "item", target=tgt,
                      element=next((e.get("element") for e in item_effects if e.get("element")), None))
            self.player_used_items += 1
            self.run_effects(p, item_effects, tgt, {"name": item["name"] if item else "item",
                                                    "target": item.get("target", "self") if item else "self"})
        else:
            raise CombatError(f"Unknown action {kind}")
        if self.check_end():
            return
        self.end_turn(p)
        self.advance()

    def _resolve_target(self, unit, aid, target_uid, force_ranged=False) -> Unit:
        if force_ranged:
            options = self.enemies_of(unit)
        else:
            options = self.valid_targets(unit, aid)
        if not options:
            raise CombatError("No valid targets.")
        if target_uid:
            for u in options:
                if u.uid == target_uid:
                    return u
            tgt = self.find(target_uid)
            if tgt and tgt.alive and tgt.side == "enemy":
                raise CombatError(f"{tgt.name} is in the back row. Defeat the front row or use a ranged attack.")
            raise CombatError("Invalid target.")
        return options[0]

    def _flow(self, unit: Unit, action: str):
        if "combat_flow" in unit.flags and action != unit.last_action and unit.last_action not in (None,):
            if action != "attack":
                self.add_stacks(unit, "flow", 1)
        unit.last_action = action

    # --------------------------------------------------------------- actions
    def _is_melee(self, unit: Unit, ab: dict, eff: dict) -> bool:
        if eff.get("force_ranged"):
            return False
        rng_ = ab.get("range", "weapon")
        if rng_ in ("melee", "reach"):
            return True
        if rng_ == "weapon":
            return not unit.base.get("weapon_ranged")
        return False

    def basic_attack(self, unit: Unit, target: Unit, mult: float = 1.0, is_counter: bool = False):
        if unit.is_player:
            eff = {"type": "damage", "source": "weapon", "mult": mult}
            ab = {"name": "Attack", "range": "weapon"}
        else:
            atk = unit.attack or {}
            eff = {"type": "damage", "source": "weapon", "mult": mult * atk.get("mult", 1.0),
                   "element": atk.get("element", "physical")}
            ab = {"name": atk.get("name", "Attack"), "range": atk.get("range", "melee")}
        element = eff.get("element") or ("arcane" if unit.base.get("weapon_magic") and unit.is_player
                                          else unit.base.get("attack_element", "physical"))
        self.emit("act", actor=unit, ability=None, name=ab["name"], target=target, melee=self._is_melee(unit, ab, eff),
                  element=element, counter=is_counter, targeting="enemy", tags=[])
        self.deal_damage(unit, target, eff, ab, is_counter=is_counter)

    def _emit_ability(self, unit: Unit, aid: str, ab: dict, target: Unit | None, released: bool = False):
        first = next((e for e in ab.get("effects", []) if e.get("type") == "damage"), {})
        element = first.get("element") or ("physical" if first.get("source", "weapon") == "weapon" else None)
        if not element:
            element = next((e.get("element") for e in ab.get("effects", []) if e.get("element")), None)
        self.emit("act", actor=unit, ability=aid, name=ab.get("name", aid), target=target,
                  melee=self._is_melee(unit, ab, first), element=element or "arcane",
                  targeting=ab.get("target", "enemy"), tags=list(ab.get("tags", [])), released=released,
                  damaging=bool(first))

    def use_ability(self, unit: Unit, aid: str, target: Unit | None):
        ab = get_ability(aid)
        self._emit_ability(unit, aid, ab, target)
        cost = ab.get("cost", {})
        unit.mp -= cost.get("mp", 0)
        unit.sp -= cost.get("sp", 0)
        if ab.get("cooldown"):
            unit.cooldowns[aid] = ab["cooldown"]
            unit.cd_fresh.add(aid)
        if ab.get("once_per_combat"):
            unit.used_once.add(aid)
        verb = "casts" if SPELL_TAGS & set(ab.get("tags", [])) else "uses"
        who = "You" if unit.is_player else unit.name
        self.say(f"{who} {verb if not unit.is_player else verb[:-1]} {ab['name']}!", "ability")
        self.run_effects(unit, ab["effects"], target, ab, aid=aid)

    def _targets_for(self, unit: Unit, ab: dict, target: Unit | None) -> list[Unit]:
        t = ab.get("target", "enemy")
        foes = self.enemies_of(unit)
        if t == "enemy":
            return [target] if target else []
        if t == "all_enemies":
            return foes
        if t == "front_enemies":
            front = [u for u in foes if u.row == "front"]
            return front or foes
        if t == "random_enemies":
            n = ab.get("count", 1)
            if ab.get("repeat"):
                return [self.rng.choice(foes) for _ in range(n)] if foes else []
            pool = list(foes)
            self.rng.shuffle(pool)
            return pool[:n]
        if t == "self":
            return [unit]
        if t in ("all_allies", "allies"):
            return self.allies_of(unit)
        if t == "ally":
            return [target] if target else [unit]
        return [target] if target else []

    def run_effects(self, unit: Unit, effects: list, target: Unit | None, ab: dict, aid: str | None = None):
        primary = self._targets_for(unit, ab, target)
        killed_any = False
        for eff in effects:
            et = eff["type"]
            to = eff.get("to")
            if to == "self":
                tlist = [unit]
            elif to == "allies":
                tlist = self.allies_of(unit)
            elif to == "all_enemies":
                tlist = self.enemies_of(unit)
            elif to == "random_other_enemy":
                others = [u for u in self.enemies_of(unit) if u not in primary]
                tlist = [self.rng.choice(others)] if others else []
            elif et in ("heal", "barrier", "restore", "gain_stacks", "summon", "survive", "reduce_cooldowns",
                        "flag_escape", "cleanse") and not to:
                t = ab.get("target", "self")
                if t in ("all_allies", "allies"):
                    tlist = self.allies_of(unit)
                elif t == "ally":
                    tlist = primary
                else:
                    tlist = [unit]
            else:
                tlist = primary
            for tg in tlist:
                if tg is None:
                    continue
                if et == "damage":
                    if not tg.alive:
                        continue
                    res = self.deal_damage(unit, tg, eff, ab)
                    if res and res.get("killed"):
                        killed_any = True
                elif et == "status":
                    if not tg.alive:
                        continue
                    chance = eff.get("chance", 1.0)
                    if eff.get("chance_if_shield") and unit.base.get("has_shield"):
                        chance = eff["chance_if_shield"]
                    if self.rng.random() > chance:
                        continue
                    potency = eff.get("potency", 0) + self._power(unit, eff) * eff.get("potency_scale", 0)
                    if eff["status"] == "poison":
                        potency *= 1 + unit.stat("poison_dmg_pct") / 100
                    self.add_status(tg, eff["status"], eff.get("duration", 2), unit,
                                    stacks=eff.get("stacks", 1), potency=potency)
                elif et == "heal":
                    amt = eff.get("base", 0) + unit.stat("heal_power") * eff.get("scale", 0)
                    amt += tg.max_hp * eff.get("pct_max", 0) / 100
                    if eff.get("potion"):
                        amt *= 1 + unit.stat("potion_pct") / 100
                    self.heal(tg, int(amt))
                elif et == "barrier":
                    amt = eff.get("base", 0) + unit.stat("spell_power") * eff.get("scale", 0)
                    amt += tg.max_hp * eff.get("pct_max", 0) / 100
                    self.add_barrier(tg, amt)
                elif et == "restore":
                    self.restore(tg, eff)
                elif et == "cleanse":
                    self.cleanse(tg, eff.get("count", 0), eff.get("statuses"))
                elif et == "cleanse_target":
                    for sid in eff.get("statuses", []):
                        if tg.remove_status(sid):
                            self.say(f"{tg.name} is exposed ({STATUSES[sid]['name']} removed).", "status")
                elif et == "interrupt":
                    self.interrupt(tg)
                elif et == "gain_stacks":
                    n = eff.get("n", 1)
                    if eff.get("cha_bonus"):
                        cha = unit.base.get("cha", 10)
                        n += (1 if cha >= 14 else 0) + (1 if cha >= 18 else 0)
                    self.add_stacks(tg, eff["status"], n)
                elif et == "summon":
                    self.summon(unit, eff["unit"], eff.get("count", 1), eff.get("max", 1))
                elif et == "reduce_cooldowns":
                    for k in list(tg.cooldowns):
                        tg.cooldowns[k] -= eff.get("n", 1)
                        if tg.cooldowns[k] <= 0:
                            del tg.cooldowns[k]
                elif et == "remove_status":
                    for sid in eff.get("statuses", []):
                        tg.remove_status(sid)
                elif et == "self_damage_pct":
                    self.apply_damage(unit, int(unit.max_hp * eff["pct"] / 100), None, "recoil", "physical")
                elif et == "flag_escape":
                    self.escape_guaranteed = True
                elif et == "restore_drain":
                    if tg is not unit and tg.alive:
                        drained = min(tg.mp, eff.get("mp", 0))
                        tg.mp -= drained
                        if drained and tg.is_player:
                            self.say(f"{unit.name} drains {drained} of your mana!", "status")
                elif et == "counter":
                    pass
                elif et == "swap_status":
                    unit.remove_status(eff["remove"])
                    self.add_status(unit, eff["add"], 99, unit, force=True)
                    self.say(f"{unit.name} shifts into {STATUSES[eff['add']]['name']}!", "status")
                elif et == "cycle_attunement":
                    self.cycle_attunement(unit)
                elif et == "vent_heat":
                    unit.remove_status("heat")
                    unit.remove_status("plated")
                    self.add_status(unit, "overheated", 2, unit, force=True)
                    self.say(f"{unit.name} vents scalding steam — its plating is exposed!", "status")
                elif et == "log":
                    self.say(eff["text"], eff.get("kind", "story"))
        if aid and killed_any and any(e.get("on_kill_refund") for e in effects if e["type"] == "damage"):
            ab_ = get_ability(aid)
            unit.sp = min(unit.base.get("max_sp", 0), unit.sp + ab_.get("cost", {}).get("sp", 0))
            unit.cooldowns.pop(aid, None)
            self.say("The kill refreshes you!", "buff")

    def _power(self, unit: Unit, eff: dict) -> float:
        src = eff.get("power", "spell" if unit.base.get("weapon_magic") or not unit.is_player else "attack")
        if src == "spell":
            return unit.stat("spell_power")
        return max(unit.stat("attack_power"), unit.stat("phys_power"))

    # --------------------------------------------------------------- damage
    def _diff_mult(self, attacker: Unit | None, defender: Unit) -> float:
        if defender.side == "player":
            return self.diff["to_player"]
        if attacker is not None and attacker.side == "player":
            return self.diff["from_player"]
        return 1.0

    def _check_cond(self, cond: dict, unit: Unit, target: Unit) -> bool:
        if "target_hp_below" in cond and not target.hp_frac() < cond["target_hp_below"]:
            return False
        if "target_status" in cond and not target.has(cond["target_status"]):
            return False
        if "target_status_any" in cond and not any(target.has(s) for s in cond["target_status_any"]):
            return False
        if "self_status" in cond and not unit.has(cond["self_status"]):
            return False
        return True

    def deal_damage(self, attacker: Unit, defender: Unit, eff: dict, ab: dict, is_counter: bool = False) -> dict:
        rng = self.rng
        hits = eff.get("hits", 1)
        total = {"amount": 0, "killed": False, "crit": False}
        melee = self._is_melee(attacker, ab, eff)
        single = ab.get("target", "enemy") == "enemy"
        if (single and not is_counter and defender.is_player and attacker.side != defender.side
                and defender.stat("misdirect") > 0 and rng.random() * 100 < defender.stat("misdirect")):
            decoys = [u for u in self.living(attacker.side) if u is not attacker and not u.is_object]
            if decoys:
                defender = rng.choice(decoys)
                self.say(f"Misdirection! {attacker.name} is fooled and strikes {defender.name} instead.", "buff")
                self.emit("misdirect", actor=attacker, target=defender)
        for _ in range(hits):
            if not defender.alive:
                break
            src = eff.get("source", "weapon")
            dodgeable = False
            if src == "weapon":
                lo, hi = attacker.base.get("weapon_dmg", [1, 3])
                power_scale = 0.3 if attacker.base.get("weapon_magic") else 0.5
                raw = rng.randint(lo, hi) + attacker.stat("attack_power") * power_scale
                raw *= eff.get("mult", 1.0)
                element = eff.get("element") or ("arcane" if attacker.base.get("weapon_magic") and attacker.is_player
                                                 else attacker.base.get("attack_element", "physical"))
                dodgeable = element == "physical"
                if attacker.base.get("weapon_ranged") and attacker.stat("ranged_dmg_pct"):
                    raw *= 1 + attacker.stat("ranged_dmg_pct") / 100
            elif src == "spell":
                lo, hi = eff.get("base", [1, 3])
                raw = (rng.randint(lo, hi) + attacker.stat("spell_power") * eff.get("scale", 1.0)) * eff.get("mult", 1.0)
                element = eff.get("element", "arcane")
                mb = eff.get("mana_burst")
                if mb:
                    spent = int(attacker.mp * mb["pct"])
                    attacker.mp -= spent
                    raw += spent * mb["mult"]
                    self.say(f"{attacker.name} pours {spent} mana into the spell!", "ability")
            else:  # flat (thrown items)
                lo, hi = eff.get("base", [1, 3])
                raw = rng.randint(lo, hi) * (1 + 0.12 * (attacker.level - 1))
                element = eff.get("element", "physical")
                dodgeable = False

            auto_crit = False
            crit_extra = 0
            for b in eff.get("bonuses", []):
                if self._check_cond(b["if"], attacker, defender):
                    raw *= b.get("mult", 1.0)
                    if b.get("auto_crit"):
                        auto_crit = True
                        crit_extra += attacker.stat("backstab_pct")
            pss = eff.get("per_self_stack")
            if pss:
                n = attacker.stacks(pss["status"])
                raw *= 1 + pss["mult"] * n
                if pss.get("consume") and n:
                    attacker.remove_status(pss["status"])
            pts = eff.get("per_target_stack")
            if pts:
                n = defender.stacks(pts["status"])
                raw *= 1 + pts["mult"] * n
                if pts.get("consume") and n:
                    defender.remove_status(pts["status"])

            # dodge / illusions
            if dodgeable and not is_counter:
                miss = defender.dodge() - attacker.stat("accuracy") - eff.get("accuracy", 0)
                miss = max(0.0, min(80.0, miss))
                if defender.has("frozen") or defender.has("stunned") or defender.has("sleep"):
                    miss = 0
                if rng.random() * 100 < miss:
                    self.say(f"{defender.name} dodges {self._poss(attacker)} {ab.get('name', 'attack')}!", "miss")
                    self.emit("miss", target=defender, source=attacker, reason="dodge")
                    self.fire_triggers(defender, "dodge", {"attacker": attacker})
                    self.events.append(("dodge", {"unit": defender}))
                    continue
            elif not dodgeable and attacker.stat("accuracy") < -20 and rng.random() < 0.3:
                self.say(f"{attacker.name}'s blinded strike goes wide!", "miss")
                self.emit("miss", target=defender, source=attacker, reason="wide")
                continue
            if single and defender.has("mirror_images") and attacker.side != defender.side:
                n = defender.stacks("mirror_images")
                if rng.random() < n / (n + 1):
                    st = defender.get_status("mirror_images")
                    st["stacks"] -= 1
                    if st["stacks"] <= 0:
                        defender.remove_status("mirror_images")
                    self.say(f"{self._poss(attacker).capitalize()} attack shatters a mirror image!", "miss")
                    self.emit("miss", target=defender, source=attacker, reason="mirror")
                    continue

            # crit
            crit_chance = attacker.stat("crit") + eff.get("crit_bonus", 0)
            if defender.has("marked"):
                crit_chance += attacker.stat("crit_vs_marked")
            crit = auto_crit or rng.random() * 100 < crit_chance
            if crit:
                raw *= 1 + (attacker.stat("crit_dmg") + crit_extra) / 100
                if attacker.has("focused"):
                    pass
            # multipliers
            mult = 1 + attacker.stat("dmg_dealt_pct") / 100
            if element in ELEMENTAL:
                mult += attacker.stat("elem_dmg_pct") / 100
            if attacker.hp_frac() < 0.5:
                mult += attacker.stat("low_hp_dmg_pct") / 100
            mult *= 1 + defender.stat("dmg_taken_pct") / 100
            raw *= max(0.0, mult)
            # mitigation
            if element == "physical" and not eff.get("ignore_armor"):
                armor = defender.armor() * (1 - attacker.stat("armor_pen") / 100)
                dr = armor / (armor + 40 + 8 * attacker.level)
                raw *= 1 - min(0.75, dr)
            res = defender.res(element)
            immune = res >= 100
            raw *= 1 - min(res, 100) / 100
            raw *= self._diff_mult(attacker, defender)
            amount = 0 if immune or raw <= 0 and defender.stat("dmg_taken_pct") <= -100 else max(1, round(raw))
            if defender.stat("dmg_taken_pct") <= -100:
                amount = 0
            label = ab.get("name", "attack")
            killed = self.apply_damage(defender, amount, attacker, label, element, crit=crit, immune=immune)
            total["amount"] += amount
            total["crit"] = total["crit"] or crit
            if attacker.is_player:
                self.max_hit = max(self.max_hit, amount)
                if crit:
                    self.events.append(("crit", {"amount": amount}))
            if attacker.has("stealthed"):
                attacker.remove_status("stealthed")
            if attacker.has("focused") and crit and STATUSES["focused"]:
                pass
            # post-hit
            if amount > 0 or not immune:
                self.fire_triggers(attacker, "hit", {"target": defender, "melee": melee})
                if crit:
                    self.fire_triggers(attacker, "crit", {"target": defender})
                if src == "weapon" and defender.alive:
                    self._on_hit_effects(attacker, defender, amount)
                if attacker.stat("lifesteal_pct") and amount > 0:
                    self.heal(attacker, int(amount * attacker.stat("lifesteal_pct") / 100), quiet=True)
                if element == "frost" and defender.has("heat"):
                    st = defender.get_status("heat")
                    st["stacks"] -= 2
                    if st["stacks"] <= 0:
                        defender.remove_status("heat")
                    self.say(f"The frost vents {self._poss(defender)} heat!", "status")
            if killed:
                total["killed"] = True
                break
            if melee and attacker.alive and defender.alive and attacker.side != defender.side:
                if defender.stat("thorns"):
                    self.apply_damage(attacker, int(defender.stat("thorns")), defender, "thorns", "physical")
                if defender.has("trap_set") and not is_counter:
                    defender.remove_status("trap_set")
                    self.say(f"{attacker.name} blunders into a snare trap!", "ability")
                    self.deal_damage(defender, attacker, {"type": "damage", "source": "weapon", "mult": 1.2,
                                                          "force_ranged": True}, {"name": "Snare Trap"},
                                     is_counter=True)
                    if attacker.alive:
                        self.add_status(attacker, "stunned", 1, defender)
                if not is_counter and attacker.alive:
                    self.fire_triggers(defender, "taken_melee", {"attacker": attacker})
                    if defender.has("counter_stance") and attacker.alive and defender.alive:
                        self.say(f"{defender.name} ripostes!", "ability")
                        self.basic_attack(defender, attacker, 0.8, is_counter=True)
            if not attacker.alive:
                break
        return total

    def _on_hit_effects(self, attacker: Unit, defender: Unit, amount: int):
        for el in ("fire", "frost", "lightning", "arcane"):
            v = attacker.stat(f"on_hit_{el}")
            if v and defender.alive:
                res = defender.res(el)
                dmg = 0 if res >= 100 else max(1, round(v * (1 - res / 100) * self._diff_mult(attacker, defender)))
                self.apply_damage(defender, dmg, attacker, f"{el} enchantment", el, quiet=True)
        if defender.alive and attacker.stat("poison_on_hit") and self.rng.random() * 100 < attacker.stat("poison_on_hit"):
            self.add_status(defender, "poison", 3, attacker, potency=2 + attacker.level * 0.6)
        if defender.alive and attacker.stat("bleed_on_hit") and self.rng.random() * 100 < attacker.stat("bleed_on_hit"):
            self.add_status(defender, "bleed", 3, attacker, potency=2 + attacker.level * 0.6)
        if attacker.stat("mp_on_hit"):
            attacker.mp = min(attacker.base.get("max_mp", 0), attacker.mp + int(attacker.stat("mp_on_hit")))

    def _poss(self, u: Unit) -> str:
        return "your" if u.is_player else f"{u.name}'s"

    BARRIER_CAP = 0.4

    def add_barrier(self, unit: Unit, amount: float):
        """Barriers stack, but never past 40% of max health, so repeated shielding can't make a unit unkillable."""
        cap = int(unit.max_hp * self.BARRIER_CAP)
        new = max(unit.barrier, min(cap, unit.barrier + int(amount)))
        gained = new - unit.barrier
        unit.barrier = new
        if gained > 0:
            self.say(f"{unit.name} gains a {gained}-point barrier.", "buff")
            self.emit("barrier", target=unit, amount=gained, barrier=unit.barrier)
        elif amount > 0:
            self.say(f"{unit.name}'s barrier is already at full strength.", "buff")

    def apply_damage(self, unit: Unit, amount: int, source: Unit | None, label: str, element: str,
                     crit=False, dot=False, immune=False, quiet=False) -> bool:
        """Subtract damage through barrier/mana shield. Returns True if the unit died."""
        if immune:
            self.say(f"{unit.name} is immune to {element}!", "miss")
            self.emit("miss", target=unit, source=source, reason="immune", element=element)
            return False
        if amount <= 0:
            self.say(f"{unit.name} is unharmed by {label}.", "miss")
            self.emit("miss", target=unit, source=source, reason="unharmed", element=element)
            return False
        absorbed = 0
        if unit.barrier > 0:
            absorbed = min(unit.barrier, amount)
            unit.barrier -= absorbed
            amount -= absorbed
        if amount > 0 and unit.has("mana_shield") and unit.mp > 0:
            to_mana = min(unit.mp, amount // 2)
            unit.mp -= to_mana
            amount -= to_mana
            absorbed += to_mana
        unit.hp -= amount
        self.emit("damage", target=unit, source=source, amount=amount, absorbed=absorbed, element=element, crit=crit,
                  dot=dot, label=label, hp=max(0, unit.hp), barrier=unit.barrier)
        if unit.is_player:
            self.player_damage_taken += amount
        who = "You" if unit.is_player else unit.name
        extra = f" ({absorbed} absorbed)" if absorbed else ""
        crit_s = " CRITICAL!" if crit else ""
        el = "" if element == "physical" else f" {element}"
        kind = "crit" if crit else ("dmg_player" if unit.is_player else "dmg")
        if dot or source is None:
            self.say(f"{label}: {who} take{'s' if not unit.is_player else ''} {amount}{el} damage{extra}.", kind)
        else:
            src_poss = "Your" if source.is_player else f"{source.name}'s"
            obj = "you" if unit.is_player else unit.name
            self.say(f"{src_poss} {label} hits {obj} for {amount}{el} damage{extra}.{crit_s}", kind)
        if unit.has("sleep") and amount > 0:
            unit.remove_status("sleep")
            self.say(f"{unit.name} wakes up!", "status")
        if element == "fire" and unit.has("frozen"):
            unit.remove_status("frozen")
            self.say(f"The flames thaw {unit.name}.", "status")
        if unit.hp <= 0:
            if self.fire_triggers(unit, "lethal", {}):
                return False
            self.kill(unit, source)
            return True
        self.check_phases(unit)
        return False

    def heal(self, unit: Unit, amount: int, quiet=False, label=""):
        if amount <= 0 or not unit.alive:
            return
        before = unit.hp
        unit.hp = min(unit.max_hp, unit.hp + amount)
        if unit.hp > before:
            self.emit("heal", target=unit, amount=unit.hp - before, hp=unit.hp, label=label)
        if not quiet and unit.hp > before:
            who = "You" if unit.is_player else unit.name
            self.say(f"{label + ': ' if label else ''}{who} recover{'s' if not unit.is_player else ''} {unit.hp - before} health.", "heal")

    def restore(self, unit: Unit, eff: dict):
        pct = eff.get("pct", 0)
        mp = eff.get("mp", 0) + unit.base.get("max_mp", 0) * pct / 100
        sp = eff.get("sp", 0) + unit.base.get("max_sp", 0) * pct / 100
        if mp:
            unit.mp = min(unit.base.get("max_mp", 0), unit.mp + int(mp))
        if sp:
            unit.sp = min(unit.base.get("max_sp", 0), unit.sp + int(sp))
        if unit.is_player and (mp or sp):
            parts = []
            if mp:
                parts.append(f"{int(mp)} mana")
            if sp:
                parts.append(f"{int(sp)} stamina")
            self.say(f"You restore {' and '.join(parts)}.", "heal")

    def cleanse(self, unit: Unit, count: int, statuses=None):
        removed = []
        for s in list(unit.statuses):
            sd = STATUSES[s["id"]]
            if statuses is not None:
                if s["id"] in statuses:
                    unit.statuses.remove(s)
                    removed.append(sd["name"])
                    self.emit("status_off", target=unit, status=s["id"])
            elif sd["kind"] == "debuff" and len(removed) < count:
                unit.statuses.remove(s)
                removed.append(sd["name"])
                self.emit("status_off", target=unit, status=s["id"])
        if removed:
            self.say(f"{unit.name} is cleansed of {', '.join(removed)}.", "buff")

    def interrupt(self, unit: Unit):
        if unit.remove_status("charging"):
            self.say(f"{unit.name}'s attack is INTERRUPTED!", "good")
            self.emit("interrupt", target=unit)
            self.events.append(("interrupt", {"unit": unit}))

    def kill(self, unit: Unit, source: Unit | None):
        unit.hp = 0
        who = "You fall" if unit.is_player else f"{unit.name} is defeated"
        if unit.is_object:
            who = f"{unit.name} is destroyed"
        self.say(f"{who}!", "kill")
        self.emit("death", target=unit, source=source, hp=0)
        if unit.has("death_mark") and source and source.is_player:
            self.add_status(source, "stealthed", 2, source)
            source.sp = min(source.base["max_sp"], source.sp + 20)
            self.say("Death Mark claimed: you slip back into the shadows.", "buff")
        unit.statuses = []
        unit.barrier = 0
        if unit.side == "enemy":
            self.defeated.append(unit)
            self.events.append(("kill", {"unit": unit}))
            if source is not None:
                self.fire_triggers(source, "kill", {"target": unit})
        for od in unit.on_death:
            self._on_death_effect(unit, od)
        if unit.summon is False:
            # dismiss summons bound to this unit
            for u in self.units:
                if u.summoner is unit and u.alive:
                    self._drop(u, unit)
                    self.say(f"{u.name} fades away.", "info")

    def _on_death_effect(self, unit: Unit, od: dict):
        if od["type"] == "convert":
            if any(u.alive and u.enemy_id == od.get("unless_alive") for u in self.units):
                return
            for u in self.units:
                if u.alive and u.enemy_id == od["unit"]:
                    u.side = "player" if u.side == "enemy" else "enemy"
                    u.remove_status("shrouded")
                    u.ai = {"abilities": ENEMIES[u.enemy_id].get("freed_abilities", u.ai.get("abilities", [])),
                            "targeting": "random"}
                    u.abilities = [a["id"] for a in u.ai["abilities"]]
                    u.summon = True
                    self.say(od.get("text", f"{u.name} turns against its masters!"), "story")
                    self.events.append(("convert", {"unit": u}))
                    self.emit("convert", target=u, side=u.side)
        elif od["type"] == "unshroud":
            if any(u.alive and u.enemy_id == unit.enemy_id for u in self.units):
                return
            for u in self.units:
                if u.alive and u.enemy_id == od["unit"]:
                    u.remove_status("shrouded")
                    self.say(od.get("text", f"{u.name} is exposed!"), "story")
        elif od["type"] == "dismiss_all":
            others = [u for u in self.living(unit.side)]
            if others:
                self.say(od.get("text", "The remaining foes scatter."), "story")
            for u in others:
                self._drop(u, unit)
        elif od["type"] == "log":
            self.say(od["text"], "story")

    # --------------------------------------------------------------- statuses
    def add_status(self, unit: Unit, sid: str, duration: int, source: Unit | None, stacks: int = 1,
                   potency: float = 0, force: bool = False):
        sd = STATUSES[sid]
        if not unit.alive:
            return
        element = sd.get("element") or (sd.get("dot") or {}).get("element")
        if element and element != "physical" and unit.res(element) >= 100 and not force:
            self.say(f"{unit.name} is immune to {sd['name'].lower()}.", "miss")
            self.emit("miss", target=unit, source=source, reason="immune", status=sid)
            return
        if sd.get("cc") and not force:
            resist = unit.stat("cc_resist")
            if resist and self.rng.random() * 100 < resist:
                self.say(f"{unit.name} resists being {sd['name'].lower()}!", "miss")
                self.emit("miss", target=unit, source=source, reason="resist", status=sid)
                return
        existing = unit.get_status(sid)
        fresh = unit is self._current_actor
        maxs = sd.get("max_stacks", 1)
        if existing:
            existing["turns"] = max(existing["turns"], duration)
            existing["potency"] = max(existing["potency"], potency)
            if maxs > 1:
                existing["stacks"] = min(maxs, existing["stacks"] + stacks)
            if fresh:
                existing["fresh"] = True
        else:
            unit.statuses.append({"id": sid, "turns": duration, "stacks": min(maxs, stacks), "potency": potency,
                                  "fresh": fresh, "data": {"source": source.uid if source else None}})
        self.emit("status_on", target=unit, source=source, status=sid, kind=sd["kind"],
                  stacks=unit.stacks(sid), element=element)
        who = "You are" if unit.is_player else f"{unit.name} is"
        if sid not in ("fury", "flow", "heat"):
            self.say(f"{who} {sd['name']}.", "status" if sd["kind"] == "debuff" else "buff")
        if sid in ("stunned", "provoked", "frozen", "sleep"):
            self.interrupt(unit)
        if unit.is_player is False and source is not None and source.is_player and sd["kind"] == "debuff":
            self.events.append(("debuff", {"status": sid, "unit": unit}))

    def add_stacks(self, unit: Unit, sid: str, n: int):
        sd = STATUSES[sid]
        st = unit.get_status(sid)
        if st:
            st["stacks"] = min(sd.get("max_stacks", 1), st["stacks"] + n)
        else:
            unit.statuses.append({"id": sid, "turns": 99, "stacks": min(sd.get("max_stacks", 1), n),
                                  "potency": 0, "fresh": False, "data": {}})
        if unit.is_player and sid in ("fury", "flow", "mirror_images"):
            self.say(f"{sd['name']}: {unit.stacks(sid)}.", "buff")

    def cycle_attunement(self, unit: Unit):
        order = ["attuned_fire", "attuned_frost", "attuned_lightning"]
        cur = next((s for s in order if unit.has(s)), None)
        nxt = order[(order.index(cur) + 1) % 3] if cur else order[0]
        if cur:
            unit.remove_status(cur)
        self.add_status(unit, nxt, 99, unit, force=True)
        unit.get_status(nxt)["turns"] = 99
        self.say(f"{unit.name}'s aura shifts — now immune to {nxt.split('_')[1]}!", "status")

    # --------------------------------------------------------------- triggers
    def fire_triggers(self, unit: Unit, event: str, ctx: dict) -> bool:
        """Fire passive triggers. Returns True if a 'survive' effect prevented death."""
        survived = False
        for trig in unit.triggers:
            if trig["on"] != event:
                continue
            key = trig.get("source", "") + event
            if trig.get("once_per_combat") and key in unit.trigger_once:
                continue
            if self.rng.random() > trig.get("chance", 1.0):
                continue
            if trig.get("once_per_combat"):
                unit.trigger_once.add(key)
            for eff in trig["effects"]:
                et = eff["type"]
                if et == "survive":
                    unit.hp = 1
                    survived = True
                    self.say(f"{'You refuse' if unit.is_player else unit.name + ' refuses'} to fall!", "good")
                    self.events.append(("survive", {}))
                    self.emit("survive", target=unit, hp=1)
                elif et == "counter":
                    atk = ctx.get("attacker")
                    if atk and atk.alive and unit.alive:
                        self.say(f"{'You retaliate' if unit.is_player else unit.name + ' retaliates'}!", "ability")
                        self.basic_attack(unit, atk, eff.get("mult", 0.8), is_counter=True)
                elif et == "status":
                    tgt = unit if eff.get("to") == "self" else ctx.get("target")
                    if tgt and tgt.alive:
                        pot = eff.get("potency", 0) + self._power(unit, eff) * eff.get("potency_scale", 0)
                        if eff["status"] == "poison":
                            pot *= 1 + unit.stat("poison_dmg_pct") / 100
                        self.add_status(tgt, eff["status"], eff.get("duration", 2), unit,
                                        stacks=eff.get("stacks", 1), potency=pot)
                elif et == "gain_stacks":
                    self.add_stacks(unit, eff["status"], eff.get("n", 1))
                elif et == "restore":
                    self.restore(unit, eff)
                elif et == "barrier":
                    amt = unit.max_hp * eff.get("pct_max", 0) / 100 + eff.get("base", 0)
                    self.add_barrier(unit, amt)
                elif et == "reduce_cooldowns":
                    for k in list(unit.cooldowns):
                        unit.cooldowns[k] -= eff.get("n", 1)
                        if unit.cooldowns[k] <= 0:
                            del unit.cooldowns[k]
        return survived

    # --------------------------------------------------------------- phases / summons
    def check_phases(self, unit: Unit):
        for ph in unit.phases:
            if unit.phase >= ph["phase"]:
                continue
            if unit.hp_frac() <= ph["hp_below"]:
                unit.phase = ph["phase"]
                self.emit("phase", target=unit, phase=ph["phase"], text=ph.get("text", ""))
                if ph.get("text"):
                    self.say(ph["text"], "story")
                for sid in ph.get("remove_statuses", []):
                    unit.remove_status(sid)
                for sid in ph.get("add_statuses", []):
                    self.add_status(unit, sid, 99, unit, force=True)
                for s in ph.get("summon", []):
                    self.summon(unit, s["unit"], s.get("count", 1), s.get("max", 3), row=s.get("row"))
                if ph.get("barrier_pct"):
                    unit.barrier += int(unit.max_hp * ph["barrier_pct"] / 100)
                if ph.get("abilities"):
                    unit.ai["abilities"] = ph["abilities"]
                    unit.abilities = [a["id"] for a in ph["abilities"]]
                if ph.get("remove_units"):
                    for u in self.units:
                        if u.alive and u.enemy_id in ph["remove_units"]:
                            self._drop(u, unit)
                            self.say(f"{u.name} collapses.", "info")
                unit.remove_status("charging")
                self.events.append(("phase", {"unit": unit, "phase": ph["phase"]}))

    def summon(self, owner: Unit, eid: str, count: int = 1, max_n: int = 1, row: str | None = None):
        existing = [u for u in self.units if u.alive and u.enemy_id == eid and u.side == owner.side]
        for _ in range(count):
            if len(existing) >= max_n:
                if owner.is_player:
                    self.say("Your summon is already present.", "info")
                break
            lvl = owner.level
            u = unit_from_enemy(eid, lvl, side=owner.side, row=row)
            if owner.is_player:
                sp = owner.stat("spell_power")
                u.base["spell_power"] = sp
                u.base["heal_power"] = owner.stat("heal_power")
                u.base["max_hp"] = int(u.base["max_hp"] + sp * 1.5)
                u.hp = u.base["max_hp"]
            u.summoner = owner
            u.summon = True
            u.xp = 0
            u.gold = (0, 0)
            u.loot = None
            self.units.append(u)
            existing.append(u)
            self.say(f"{u.name} appears!", "ability")
            self.emit("summon", target=u, owner=owner, enemy_id=eid, side=u.side, row=u.row)

    # --------------------------------------------------------------- AI
    def ai_turn(self, unit: Unit):
        from .ai import choose_action
        action = choose_action(self, unit)
        kind = action[0]
        if kind == "skip":
            self.say(action[1], "status")
            return
        if kind == "release":
            aid, target = action[1], action[2]
            unit.remove_status("charging")
            ab = ENEMY_ABILITIES[aid]
            self.say(f"{unit.name} unleashes {ab['name']}!", "ability")
            if target is None or not target.alive:
                opts = self.enemies_of(unit)
                target = opts[0] if opts else None
            self._emit_ability(unit, aid, ab, target, released=True)
            self.run_effects(unit, ab["effects"], target, ab, aid=aid)
            if ab.get("cooldown"):
                unit.cooldowns[aid] = ab["cooldown"]
                unit.cd_fresh.add(aid)
            return
        if kind == "charge":
            aid, target = action[1], action[2]
            ab = ENEMY_ABILITIES[aid]
            unit.statuses.append({"id": "charging", "turns": 2, "stacks": 1, "potency": 0, "fresh": True,
                                  "data": {"ability": aid, "target": target.uid if target else None}})
            self.say(ab.get("charge_text", f"{unit.name} begins charging {ab['name']}!"), "warn")
            self.emit("charge", actor=unit, ability=aid, name=ab["name"], target=target)
            return
        if kind == "attack":
            target = action[1]
            self.basic_attack(unit, target)
            return
        if kind == "ability":
            aid, target = action[1], action[2]
            self.use_ability(unit, aid, target)

    # --------------------------------------------------------------- view
    def snapshot(self) -> dict:
        cur = self.current()
        order = [self.find(uid) for uid in self.order[self.turn_idx:]]
        return {
            "round": self.round, "state": self.state, "title": self.title,
            "units": [u.snapshot() for u in self.units if u.alive or not u.summon],
            "current": cur.uid if cur else None,
            "order": [{"uid": u.uid, "name": u.name, "side": u.side} for u in order if u and u.alive],
            "log": self.log[-60:], "flee_allowed": self.flee_allowed,
            "feed": self.feed[-160:], "feed_seq": self._seq,
        }
