"""Game orchestrator: owns all mutable state and exposes a single `dispatch`
entry point used by both the HTTP server and the test-suite."""
from __future__ import annotations

import inspect
import math
import random

from ..data.races import RACES
from ..data.classes import CLASSES
from ..data.world import LOCATIONS, ENCOUNTERS, TRAVEL, SHOPS, REGIONS
from ..data.dialogue import DIALOGUES
from ..data.achievements import ACHIEVEMENTS
from ..data.factions import FACTIONS
from ..data.lore import LORE
from ..data import items as ItemData
from . import items as I
from . import rules
from . import dialogue as Dlg
from .character import Character, CreationError
from .combat import Combat, CombatError, unit_from_character, unit_from_enemy, DIFFICULTY
from .quests import QuestLog

VERSION = 2
POS_LIMIT = 500.0
# Content XP values are authored on a generous scale; this maps a full Act I run onto levels 1-12.
XP_SCALE = 0.5
NO_PLAYER_ACTIONS = {"new_game", "title", "create", "load", "delete_save", "settings"}
RANDOM_ENCOUNTERS = {e for loc in LOCATIONS.values() for e in loc.get("random", {}).get("table", [])} | \
                    {e for t in TRAVEL.values() for e in t.get("ambush", [])}


class GameError(ValueError):
    """A player-facing error (invalid action); shown as a message, never a crash."""


def _valid_pos(pos, loc: str) -> dict | None:
    """A saved avatar position is only meaningful in the room it was recorded in."""
    if not isinstance(pos, dict) or pos.get("loc") != loc:
        return None
    try:
        vals = {k: float(pos.get(k, 0.0)) for k in ("x", "z", "yaw")}
    except (TypeError, ValueError):
        return None
    if not all(math.isfinite(v) and abs(v) <= POS_LIMIT for v in vals.values()):
        return None
    return {"loc": loc, **vals}


class Game:
    def __init__(self, seed: int | None = None, settings: dict | None = None, save_manager=None, dev: bool = False):
        self.rng = random.Random(seed)
        self.settings = {"difficulty": "normal", "autosave": True}
        if settings:
            self.settings.update(settings)
        self.saves = save_manager
        self.dev = dev
        self.reset()

    def reset(self):
        self.mode = "title"
        self.player: Character | None = None
        self.location: str | None = None
        self.prev_location: str | None = None
        self.flags: set[str] = set()
        self.counters: dict[str, int] = {}
        self.visited: set[str] = set()
        self.cleared: set[str] = set()
        self.quests = QuestLog(self)
        self.achievements: dict[str, int] = {}
        self.reputation: dict[str, int] = {f: 0 for f in FACTIONS}
        self.lore: list[str] = []
        self.day = 1
        self.act = 1
        self.dialogue: Dlg.DialogueState | None = None
        self.combat: Combat | None = None
        self.combat_ctx: dict = {}
        self.combat_result: dict | None = None
        self.shop: str | None = None
        self.shop_stock: dict[str, list] = {}
        self.messages: list[dict] = []
        self.notifications: list[dict] = []
        self.last_rest_node: str | None = None
        self.pending_combat = None
        self.pending_dialogue = None
        self.pending_dialogue_required = False
        self.pending_move = None
        self.pending_shop = None
        self.pending_ending = None
        self.ending: dict | None = None
        self.scene_text: str | None = None
        # Where the 3D avatar stands inside the current location. Presentation only: no rule reads it.
        self.scene_pos: dict | None = None
        self._suppress_autosave = False
        self._received: list | None = None

    # ================================================================ helpers
    def fmt(self, text: str) -> str:
        if not text or not self.player:
            return text or ""
        p = self.player
        r = RACES[p.race]
        return (text.replace("{name}", p.name).replace("{race}", r["name"].lower()).replace("{Race}", r["name"])
                .replace("{class}", CLASSES[p.cls]["name"].lower()).replace("{Class}", CLASSES[p.cls]["name"])
                .replace("{home}", r["home_name"]))

    def message(self, text: str, kind: str = "info"):
        self.messages.append({"t": text, "k": kind, "day": self.day})
        self.messages = self.messages[-120:]

    def notify(self, ntype: str, title: str, text: str = ""):
        self.notifications.append({"type": ntype, "title": title, "text": text})

    def set_flag(self, f: str):
        self.flags.add(f)

    def current_region(self) -> str | None:
        if not self.location:
            return None
        return LOCATIONS[self.location].get("region")

    def item_count(self, iid: str) -> int:
        n = I.inv_count(self.player.inventory, iid)
        n += sum(1 for it in self.player.equipment.values() if it and it["id"] == iid)
        return n

    def give_item(self, item: dict):
        I.inv_add(self.player.inventory, item)
        if self._received is not None:
            self._received.append(item)
        qty = f" x{item['qty']}" if item.get("qty", 1) > 1 else ""
        self.message(f"Received: {item['name']}{qty}", "loot" if item.get("rarity") not in ("common", "quest") else
                     f"loot_{item['rarity']}")
        if item.get("rarity") == "legendary":
            self.counters["legendaries"] = self.counters.get("legendaries", 0) + 1
            self.notify("item", "Legendary Item!", item["name"])
        if item.get("rarity") == "epic":
            self.counters["epics"] = self.counters.get("epics", 0) + 1
        if len(self.player.inventory) >= 60:
            self.flags.add("hoarder")

    def remove_item(self, iid: str, qty: int = 1):
        removed = I.inv_remove(self.player.inventory, iid, qty)
        if removed < qty:
            for slot, it in self.player.equipment.items():
                if it and it["id"] == iid and removed < qty:
                    self.player.equipment[slot] = None
                    removed += 1
            self.player.invalidate()

    def change_gold(self, n: int):
        self.player.gold = max(0, self.player.gold + n)
        if n > 0:
            self.counters["gold_earned"] = self.counters.get("gold_earned", 0) + n
            self.message(f"+{n} gold", "gold")
        elif n < 0:
            self.message(f"{n} gold", "gold")

    def change_rep(self, faction: str, n: int):
        before = self.rep_tier(faction)
        self.reputation[faction] = max(-100, min(100, self.reputation.get(faction, 0) + n))
        name = FACTIONS[faction]["name"]
        self.message(f"Reputation with {name} {'increased' if n > 0 else 'decreased'} ({n:+d}).", "rep")
        after = self.rep_tier(faction)
        if after != before:
            self.notify("rep", f"{name}: {after}", "")

    def rep_tier(self, faction: str) -> str:
        v = self.reputation.get(faction, 0)
        if v <= -25:
            return "Hostile"
        if v < 10:
            return "Neutral"
        if v < 25:
            return "Friendly"
        if v < 50:
            return "Honored"
        return "Exalted"

    def award_xp(self, amount: int, reason: str = ""):
        if amount <= 0 or not self.player:
            return
        amount = max(1, int(amount * XP_SCALE * DIFFICULTY[self.settings.get("difficulty", "normal")]["xp"]))
        gained, levels = self.player.gain_xp(amount)
        self.message(f"+{gained} XP{(' (' + reason + ')') if reason else ''}", "xp")
        for lv in levels:
            self.message(f"LEVEL UP! You are now level {lv}.", "level")
            extra = " (+1 bonus skill point!)" if lv in (4, 8, 12) else ""
            self.notify("level", f"Level {lv}!",
                        f"+2 attribute points, +1 skill point{extra}. Health, mana and stamina restored.")
        return gained

    def add_lore(self, lid: str):
        if lid in self.lore:
            return
        self.lore.append(lid)
        self.counters["lore_found"] = len(self.lore)
        entry = LORE[lid]
        self.message(f"Journal updated: {entry['title']}", "lore")
        rules.apply_effects(self, entry.get("effects", []))

    def discover(self, dest: str):
        key = f"discovered:{dest}"
        if key not in self.flags:
            self.flags.add(key)
            self.message(f"New location discovered: {TRAVEL[dest]['name']}", "quest")
            self.notify("discover", "Location Discovered", TRAVEL[dest]["name"])

    def unlock_achievement(self, aid: str):
        if aid in self.achievements:
            return
        a = ACHIEVEMENTS[aid]
        self.achievements[aid] = len(self.achievements) + 1
        self.notify("achievement", a["name"], self.fmt(a["desc"]))
        self.message(f"NEW ACHIEVEMENT: {a['name']}", "achievement")

    def check_achievements(self):
        if not self.player:
            return
        for aid, a in ACHIEVEMENTS.items():
            if aid in self.achievements or "cond" not in a:
                continue
            if rules.check(self, a["cond"]):
                self.unlock_achievement(aid)

    def autosave(self, reason: str = ""):
        if self._suppress_autosave or not self.saves or not self.settings.get("autosave", True):
            return
        if self.mode not in ("explore", "shop") or self.player is None:
            return
        try:
            self.saves.save(self, "auto")
        except Exception as e:  # never let autosave break play
            self.message(f"Autosave failed: {e}", "bad")

    # ================================================================ queues
    def queue_combat(self, enc_id: str):
        self.pending_combat = enc_id

    def queue_dialogue(self, npc: str, required: bool = False):
        self.pending_dialogue = npc
        self.pending_dialogue_required = required

    def queue_move(self, node: str):
        self.pending_move = node

    def queue_shop(self, shop: str):
        self.pending_shop = shop

    def queue_ending(self, choice: str):
        self.pending_ending = choice

    def _resolve_pending(self):
        for _ in range(10):
            if self.pending_combat and self.mode != "combat":
                enc = self.pending_combat
                self.pending_combat = None
                self.dialogue = None
                self.start_combat(enc)
                return
            if self.mode == "combat":
                return
            if self.pending_ending:
                choice = self.pending_ending
                self.pending_ending = None
                self.dialogue = None
                self.start_ending(choice)
                return
            if self.pending_move:
                node = self.pending_move
                self.pending_move = None
                self.dialogue = None
                self.mode = "explore"
                self.enter(node)
                continue
            if self.pending_dialogue:
                npc, required = self.pending_dialogue, self.pending_dialogue_required
                self.pending_dialogue, self.pending_dialogue_required = None, False
                self.open_dialogue(npc, required)
                continue
            if self.pending_shop:
                sid = self.pending_shop
                self.pending_shop = None
                self.dialogue = None
                self.open_shop(sid)
                continue
            return

    # ================================================================ dispatch
    def dispatch(self, action: dict) -> None:
        kind = action.get("action")
        handler = getattr(self, f"act_{kind}", None) if isinstance(kind, str) else None
        if handler is None or (kind.startswith("debug_") and not self.dev):
            raise GameError(f"Unknown action: {kind}")
        if self.player is None and kind not in NO_PLAYER_ACTIONS:
            raise GameError("Start or load a game first.")
        handler(**self._checked_params(handler, {k: v for k, v in action.items() if k != "action"}))
        self._resolve_pending()
        if self.player and self.mode != "title":
            self.quests.update()
            self._resolve_pending()
            self.check_achievements()

    @staticmethod
    def _checked_params(handler, params: dict) -> dict:
        """Validate client-supplied parameters against the handler's annotations (strings, via
        `from __future__ import annotations`), so malformed input is a player error, never a crash."""
        sig = inspect.signature(handler)
        if any(p.kind is p.VAR_KEYWORD for p in sig.parameters.values()):
            return params
        out = {}
        for name, value in params.items():
            p = sig.parameters.get(name)
            if p is None:
                raise GameError(f"Unexpected parameter: {name}")
            ann = str(p.annotation)
            if value is None and ("None" in ann or p.default is None):
                out[name] = None
            elif ann.startswith("int"):
                try:
                    if isinstance(value, bool):
                        raise ValueError
                    out[name] = int(value)
                except (TypeError, ValueError):
                    raise GameError(f"'{name}' must be a number.")
            elif ann.startswith("float"):
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                    raise GameError(f"'{name}' must be a number.")
                out[name] = float(value)
            elif ann.startswith("str") and not isinstance(value, str):
                raise GameError(f"'{name}' must be text.")
            elif ann.startswith("dict") and not isinstance(value, dict):
                raise GameError(f"'{name}' must be an object.")
            else:
                out[name] = value
        missing = [n for n, p in sig.parameters.items() if p.default is p.empty and n not in out]
        if missing:
            raise GameError(f"Missing parameter: {', '.join(missing)}")
        return out

    # ---------------------------------------------------------------- title / creation
    def act_new_game(self):
        self.reset()
        self.mode = "create"

    def act_title(self):
        self.reset()

    def act_create(self, name: str, race: str, cls: str, alloc: dict | None = None):
        if self.mode != "create":
            raise GameError("Not creating a character right now.")
        try:
            self.player = Character.create(name, race, cls, alloc or {})
        except CreationError as e:
            raise GameError(str(e))
        r = RACES[race]
        self.mode = "explore"
        self.message(f"{self.player.name} the {r['name']} {CLASSES[cls]['name']} begins their tale in {r['home_name']}.",
                     "story")
        self.last_rest_node = r["start_node"]
        self._suppress_autosave = True
        self.enter(r["start_node"])
        self._suppress_autosave = False
        self.check_achievements()

    # ---------------------------------------------------------------- navigation
    def _require(self, mode: str):
        if self.mode != mode:
            raise GameError(f"You can't do that right now ({self.mode}).")

    def node(self, nid: str | None = None) -> dict:
        return LOCATIONS[nid or self.location]

    def enter(self, nid: str):
        if nid not in LOCATIONS:
            raise GameError(f"Unknown location {nid}")
        old_region = self.current_region()
        self.prev_location = self.location
        self.location = nid
        self.scene_pos = None
        node = LOCATIONS[nid]
        first = nid not in self.visited
        self.visited.add(nid)
        self.counters["steps"] = self.counters.get("steps", 0) + 1
        self.scene_text = None
        if first:
            self.counters["places"] = len(self.visited)
            if node.get("discover_xp"):
                self.award_xp(node["discover_xp"], f"discovered {node['name']}")
        region = node.get("region")
        if region and region != old_region:
            self.flags.add(f"region:{region}")
        for i, oe in enumerate(node.get("on_enter", [])):
            key = f"enter:{nid}:{oe.get('once', i)}"
            if oe.get("once") is not False and key in self.flags:
                continue
            if not rules.check(self, oe.get("if")):
                continue
            if oe.get("once") is not False:
                self.flags.add(key)
            if oe.get("text"):
                self.message(self.fmt(oe["text"]), "story")
            rules.apply_effects(self, oe.get("effects", []))
        enc = node.get("encounter")
        if enc and enc["id"] not in self.cleared and rules.check(self, enc.get("if")):
            self.queue_combat(enc["id"])
        elif not first and node.get("random") and not self.pending_combat and not self.pending_dialogue:
            rnd = node["random"]
            if rules.check(self, rnd.get("if")) and self.rng.random() < rnd.get("chance", 0.2):
                self.queue_combat(self.rng.choice(rnd["table"]))
        if region and region != old_region and old_region is not None:
            self.autosave("region")

    def act_move(self, to: str):
        self._require("explore")
        node = self.node()
        for ex in node.get("exits", []):
            if ex["to"] == to:
                if not rules.check(self, ex.get("if")):
                    raise GameError(self.fmt(ex.get("locked", "The way is blocked.")))
                self.enter(to)
                return
        raise GameError("You can't go that way.")

    def act_talk(self, npc: str):
        self._require("explore")
        present = [n["id"] for n in self.visible_npcs()]
        if npc not in present:
            raise GameError("They aren't here.")
        self.open_dialogue(npc)

    def visible_npcs(self) -> list[dict]:
        return [n for n in self.node().get("npcs", []) if rules.check(self, n.get("if"))]

    def open_dialogue(self, npc: str, required: bool = False):
        if npc not in DIALOGUES:
            raise GameError(f"Unknown NPC {npc}")
        node = Dlg.entry_node(self, npc)
        self.dialogue = Dlg.DialogueState(npc, node, required)
        self.mode = "dialogue"
        self.counters["conversations"] = self.counters.get("conversations", 0) + 1
        self.flags.add(f"met:{npc}")
        Dlg.enter_node(self, self.dialogue, node)

    def act_choose(self, index: int):
        self._require("dialogue")
        try:
            cont = Dlg.choose(self, self.dialogue, int(index))
        except ValueError as e:
            raise GameError(str(e))
        if not cont and self.mode == "dialogue":
            self.dialogue = None
            self.mode = "explore"

    def act_leave(self):
        if self.mode == "dialogue" and self.dialogue and self.dialogue.required:
            raise GameError("This moment needs an answer — choose one of the options.")
        if self.mode == "dialogue":
            self.dialogue = None
            self.mode = "explore"
        elif self.mode == "shop":
            self.shop = None
            self.mode = "explore"

    # ---------------------------------------------------------------- features
    def visible_features(self) -> list[dict]:
        out = []
        for f in self.node().get("features", []):
            if not rules.check(self, f.get("if")):
                continue
            if f.get("hidden") and f"found:{self.location}:{f['id']}" not in self.flags:
                continue
            out.append(f)
        return out

    def feature_actions(self, f: dict) -> list[tuple[int, dict]]:
        out = []
        for i, a in enumerate(f.get("actions", [])):
            key = f"feat:{self.location}:{f['id']}:{i}"
            if a.get("once") and key in self.flags:
                continue
            if not rules.check(self, a.get("if")):
                continue
            out.append((i, a))
        return out

    def act_interact(self, feature: str, index: int = 0):
        self._require("explore")
        f = next((x for x in self.visible_features() if x["id"] == feature), None)
        if not f:
            raise GameError("There's nothing like that here.")
        acts = dict(self.feature_actions(f))
        index = int(index)
        if index not in acts:
            raise GameError("You can't do that.")
        a = acts[index]
        key = f"feat:{self.location}:{f['id']}:{index}"
        if a.get("once"):
            self.flags.add(key)
        self.counters["interactions"] = self.counters.get("interactions", 0) + 1
        texts = []
        if a.get("text"):
            texts.append(self.fmt(a["text"]))
        chk = a.get("check")
        if chk:
            bonus = Dlg.check_bonus(self, chk["stat"])
            roll = self.rng.randint(1, 20)
            ok = roll + bonus >= chk["dc"]
            name = Dlg.CHECK_NAMES.get(chk["stat"], chk["stat"])
            texts.append(f"[{name} check: {roll} {'+' if bonus >= 0 else '-'} {abs(bonus)} = {roll + bonus} vs DC {chk['dc']} — "
                         f"{'SUCCESS' if ok else 'FAILURE'}]")
            branch = chk.get("pass" if ok else "fail", {})
            if branch.get("text"):
                texts.append(self.fmt(branch["text"]))
            rules.apply_effects(self, branch.get("effects", []))
            if not ok and chk.get("retry") is False:
                self.flags.add(key)
        rules.apply_effects(self, a.get("effects", []))
        if texts:
            self.scene_text = "\n\n".join(texts)
            for t in texts:
                self.message(t, "story")

    def act_search(self):
        self._require("explore")
        # Searching is allowed once per location per character level, so a bad roll isn't permanent.
        key = f"searched:{self.location}:{self.player.level}"
        if key in self.flags:
            raise GameError("You've already searched here thoroughly. (You may notice more once you've gained a level.)")
        self.flags.add(key)
        self.counters["searches"] = self.counters.get("searches", 0) + 1
        found = []
        per = self.player.stats["perception"]
        for f in self.node().get("features", []):
            if not f.get("hidden") or not rules.check(self, f.get("if")):
                continue
            roll = self.rng.randint(1, 20) + per
            if roll >= f["hidden"]:
                self.flags.add(f"found:{self.location}:{f['id']}")
                found.append(f["name"])
        if found:
            self.scene_text = f"Your search turns up something: {', '.join(found)}."
            self.counters["secrets"] = self.counters.get("secrets", 0) + len(found)
            self.award_xp(15 * len(found) + 5 * self.player.level, "found a secret")
        else:
            self.scene_text = "You search carefully but find nothing of note."
        self.message(self.scene_text, "story")

    # ---------------------------------------------------------------- rest / travel
    def act_rest(self):
        self._require("explore")
        node = self.node()
        kind = node.get("rest")
        if not kind:
            raise GameError("This is no place to rest.")
        if kind == "inn":
            cost = self.inn_cost()
            if self.player.gold < cost:
                self.counters["stable_nights"] = self.counters.get("stable_nights", 0) + 1
                self.rest()
                self.scene_text = ("You can't afford a room, so the innkeeper points you to the stables. The hay is "
                                   "warm, the horse is judgmental, and you wake fully restored all the same.")
                return
            self.change_gold(-cost)
        if kind == "camp" and self.rng.random() < 0.2 and node.get("random"):
            self.message("Your campfire draws unwelcome attention!", "bad")
            self.queue_combat(self.rng.choice(node["random"]["table"]))
            return
        self.rest()

    def inn_cost(self) -> int:
        return 5 + 2 * self.player.level

    def rest(self, free=False):
        self.player.restore_full()
        self.day += 1
        self.last_rest_node = self.location
        self.counters["rests"] = self.counters.get("rests", 0) + 1
        self.shop_stock = {}
        self.scene_text = "You rest and wake refreshed. Health, mana and stamina fully restored."
        self.message(f"Day {self.day}: You rest and recover fully.", "good")
        self.autosave("rest")

    def travel_options(self) -> list[dict]:
        if "world_open" not in self.flags or not self.node().get("travel"):
            return []
        out = []
        here = self.node().get("travel")
        for tid, t in TRAVEL.items():
            if tid == here:
                continue
            if t.get("hidden") and f"discovered:{tid}" not in self.flags:
                continue
            if not rules.check(self, t.get("if")):
                continue
            out.append({"id": tid, "name": t["name"], "days": t.get("days", 2), "level": t.get("level", ""),
                        "desc": t.get("desc", ""), "region": t.get("region")})
        return out

    def act_travel(self, dest: str):
        self._require("explore")
        opts = {o["id"]: o for o in self.travel_options()}
        if dest not in opts:
            raise GameError("You can't travel there from here.")
        t = TRAVEL[dest]
        self.day += t.get("days", 2)
        self.counters["journeys"] = self.counters.get("journeys", 0) + 1
        self.message(f"You travel for {t.get('days', 2)} days to {t['name']}.", "travel")
        self.enter(t["node"])
        table = t.get("ambush")
        if table and not self.pending_combat and self.rng.random() < 0.3:
            self.message("Trouble finds you on the road!", "bad")
            self.queue_combat(self.rng.choice(table))

    # ---------------------------------------------------------------- combat
    def start_combat(self, enc_id: str):
        enc = ENCOUNTERS[enc_id]
        p = self.player
        lo, hi = enc.get("level", [None, None])
        units = []
        for spec in enc["enemies"]:
            eid, row = (spec, None) if isinstance(spec, str) else (spec[0], spec[1] if len(spec) > 1 else None)
            from ..data.enemies import ENEMIES
            base_lvl = ENEMIES[eid]["level"]
            if lo is not None:
                lvl = max(lo, min(hi, p.level + enc.get("level_offset", 0)))
            else:
                lvl = base_lvl
            units.append(unit_from_enemy(eid, lvl, row=row))
        pu = unit_from_character(p)
        self.combat = Combat(pu, units, self.rng, flee_allowed=enc.get("flee", True) and not enc.get("boss"),
                             difficulty=self.settings.get("difficulty", "normal"), title=enc.get("title", "Combat"),
                             intro=self.fmt(enc.get("intro", "")))
        self.combat_ctx = {"id": enc_id, "boss": enc.get("boss", False), "random": enc_id in RANDOM_ENCOUNTERS}
        self.combat_result = None
        self.mode = "combat"
        self.dialogue = None
        self.counters["battles"] = self.counters.get("battles", 0) + 1
        self.combat.start()
        self._after_combat_action()

    def act_combat(self, kind: str, ability: str | None = None, target: str | None = None, item: str | None = None):
        self._require("combat")
        if self.combat.state != "ongoing":
            raise GameError("The battle is over.")
        try:
            if kind == "item":
                it = I.inv_find(self.player.inventory, item)
                if not it or it["kind"] != "consumable":
                    raise GameError("You don't have that.")
                cdef = ItemData.CONSUMABLES[it["id"]]
                if cdef["use"] == "field":
                    raise GameError("You can't use that in combat.")
                self.combat.player_act("item", target=target, item={"name": it["name"], "target": cdef.get("target", "self")},
                                       item_effects=cdef["effects"])
                I.inv_remove(self.player.inventory, uid=it["uid"])
                self.counters["potions_used"] = self.counters.get("potions_used", 0) + 1
            else:
                self.combat.player_act(kind, ability=ability, target=target)
        except CombatError as e:
            raise GameError(str(e))
        self._after_combat_action()

    def _after_combat_action(self):
        cb = self.combat
        self._sync_player_from_combat()
        for ev, data in cb.events:
            self._combat_event(ev, data)
        cb.events = []
        if cb.state == "ongoing":
            return
        if cb.state == "victory":
            self._victory()
        elif cb.state == "defeat":
            self._defeat()
        elif cb.state == "fled":
            self.counters["fled"] = self.counters.get("fled", 0) + 1
            self.combat_result = {"state": "fled", "xp": 0, "gold": 0, "items": []}
            self._post_combat_restore()

    def _combat_event(self, ev: str, data: dict):
        c = self.counters
        if ev == "kill":
            u = data["unit"]
            if u.enemy_id:
                c["kills"] = c.get("kills", 0) + (0 if u.is_object else 1)
                c[f"kill:{u.enemy_id}"] = c.get(f"kill:{u.enemy_id}", 0) + 1
                for t in u.tags:
                    c[f"killtag:{t}"] = c.get(f"killtag:{t}", 0) + 1
                self.quests.on_kill(u.enemy_id, u.tags)
        elif ev == "crit":
            c["crits"] = c.get("crits", 0) + 1
            c["max_hit"] = max(c.get("max_hit", 0), data["amount"])
        elif ev == "interrupt":
            c["interrupts"] = c.get("interrupts", 0) + 1
        elif ev == "dodge":
            if data["unit"].is_player:
                c["dodges"] = c.get("dodges", 0) + 1
        elif ev == "survive":
            c["survived_lethal"] = c.get("survived_lethal", 0) + 1
        elif ev == "convert":
            c["freed_matriarch"] = 1
        elif ev == "debuff":
            c["debuffs_applied"] = c.get("debuffs_applied", 0) + 1

    def _sync_player_from_combat(self):
        pu = self.combat.player
        p = self.player
        p.hp, p.mp, p.sp = max(0, pu.hp), max(0, pu.mp), max(0, pu.sp)

    def _post_combat_restore(self):
        p = self.player
        s = p.stats
        p.sp = s["max_sp"]
        p.mp = min(s["max_mp"], p.mp + int(s["max_mp"] * 0.25))
        p.hp = max(1, p.hp)

    def _victory(self):
        cb = self.combat
        enc_id = self.combat_ctx["id"]
        enc = ENCOUNTERS[enc_id]
        plvl = self.player.level
        # Foes below your level are worth less, so grinding weak enemies can't outpace the story.
        xp = int(sum(u.xp * max(0.1, 1 - 0.3 * max(0, plvl - u.level)) for u in cb.defeated if not u.summon or u.xp))
        if self.combat_ctx.get("random"):
            xp = int(xp * 0.6)
        gold = 0
        items = []
        for u in cb.defeated:
            if u.loot:
                g, its = I.roll_loot(u.level, u.loot, self.rng, u.gold)
                gold += g
                items.extend(its)
        for iid in enc.get("drops", []):
            items.append(I.make_item(iid, rng=self.rng))
        self.cleared.add(enc_id)
        c = self.counters
        c["victories"] = c.get("victories", 0) + 1
        if self.combat_ctx.get("boss"):
            c["bosses"] = c.get("bosses", 0) + 1
        foes = len([u for u in cb.defeated if not u.is_object and not u.summon])
        if cb.player_damage_taken == 0 and foes >= 3:
            c["flawless"] = c.get("flawless", 0) + 1
        if self.combat_ctx.get("boss") and self.settings.get("difficulty") == "hard":
            self.flags.add("hard_boss_win")
        armor_slots = ("head", "chest", "hands", "legs", "feet")
        if not any(self.player.equipment.get(s) for s in armor_slots):
            self.flags.add("naked_victory")
        if cb.player.hp <= max(1, cb.player.max_hp * 0.05):
            c["close_calls"] = c.get("close_calls", 0) + 1
        if len([u for u in cb.defeated if not u.is_object]) >= 5:
            c["big_fights"] = c.get("big_fights", 0) + 1
        if cb.player_used_items == 0 and self.combat_ctx.get("boss"):
            c["boss_no_items"] = c.get("boss_no_items", 0) + 1
        if self.combat_ctx.get("boss") and not cb.player_ability_uses:
            c["boss_basic_only"] = c.get("boss_basic_only", 0) + 1
        self._post_combat_restore()
        self.mode = "combat"
        self.combat_result = {"state": "victory", "xp": xp, "gold": gold,
                              "items": [{"name": it["name"], "rarity": it["rarity"]} for it in items]}
        if gold:
            self.change_gold(gold)
        for it in items:
            self.give_item(it)
        self.combat_result["xp"] = self.award_xp(xp, "combat") or 0
        self._received = []
        try:
            rules.apply_effects(self, enc.get("on_victory", []))
        finally:
            self.combat_result["items"] += [{"name": it["name"], "rarity": it["rarity"]} for it in self._received]
            self._received = None

    def _defeat(self):
        self.counters["deaths"] = self.counters.get("deaths", 0) + 1
        self.combat_result = {"state": "defeat"}
        self.mode = "defeat"

    def act_combat_done(self):
        if self.mode != "combat" or not self.combat or self.combat.state == "ongoing":
            raise GameError("The battle isn't over.")
        fled = self.combat.state == "fled"
        enc = ENCOUNTERS[self.combat_ctx["id"]]
        self.combat = None
        self.combat_result = None
        self.mode = "explore"
        if fled and self.prev_location and self.node().get("encounter", {}).get("id") == self.combat_ctx["id"]:
            self.location = self.prev_location
            self.message("You retreat the way you came.", "info")
        if not fled and enc.get("after_dialogue"):
            self.queue_dialogue(enc["after_dialogue"], required=True)
        if not fled and enc.get("after_move"):
            self.queue_move(enc["after_move"])

    def act_respawn(self):
        self._require("defeat")
        p = self.player
        lost = p.gold // 10
        p.gold -= lost
        self.combat = None
        self.combat_result = None
        self.mode = "explore"
        p.restore_full()
        self.location = self.last_rest_node or RACES[p.race]["start_node"]
        self.message(f"You awaken at {self.node()['name']}, battered but alive. You lost {lost} gold.", "bad")
        self.scene_text = ("Darkness... then light. Someone found you and dragged you to safety. "
                           f"You lost {lost} gold along the way.")

    # ---------------------------------------------------------------- inventory
    def act_equip(self, uid: str, slot: str | None = None):
        if self.mode not in ("explore", "shop"):
            raise GameError("You can't change equipment now.")
        try:
            self.player.equip(uid, slot)
        except ValueError as e:
            raise GameError(str(e))
        self.counters["equips"] = self.counters.get("equips", 0) + 1

    def act_unequip(self, slot: str):
        if self.mode not in ("explore", "shop"):
            raise GameError("You can't change equipment now.")
        try:
            self.player.unequip(slot)
        except ValueError as e:
            raise GameError(str(e))
        if all(v is None for v in self.player.equipment.values()):
            self.flags.add("stripped_bare")

    def act_use_item(self, uid: str):
        if self.mode not in ("explore", "shop"):
            raise GameError("Use items in combat from the combat menu.")
        it = I.inv_find(self.player.inventory, uid)
        if not it:
            raise GameError("You don't have that.")
        if it["kind"] == "key" and it.get("read"):
            self.read_lore(it["read"])
            return
        if it["kind"] != "consumable":
            raise GameError("You can't use that.")
        cdef = ItemData.CONSUMABLES[it["id"]]
        if cdef["use"] == "combat":
            raise GameError("That can only be used in combat.")
        p = self.player
        s = p.stats
        for eff in cdef["effects"]:
            if eff["type"] == "heal":
                amt = eff.get("base", 0) + s["max_hp"] * eff.get("pct_max", 0) / 100
                if eff.get("potion"):
                    amt *= 1 + s.get("potion_pct", 0) / 100
                p.hp = min(s["max_hp"], p.hp + int(amt))
            elif eff["type"] == "restore":
                pct = eff.get("pct", 0)
                p.mp = min(s["max_mp"], p.mp + eff.get("mp", 0) + int(s["max_mp"] * pct / 100))
                p.sp = min(s["max_sp"], p.sp + eff.get("sp", 0) + int(s["max_sp"] * pct / 100))
        I.inv_remove(p.inventory, uid=uid)
        self.message(f"You use {it['name']}.", "info")
        if cdef.get("drink"):
            self.counters["drinks"] = self.counters.get("drinks", 0) + 1

    def read_lore(self, lid: str):
        entry = LORE[lid]
        self.counters["books_read"] = self.counters.get("books_read", 0) + (0 if lid in self.lore else 1)
        self.add_lore(lid)
        self.scene_text = f"{entry['title']}\n\n{self.fmt(entry['text'])}"

    def act_drop(self, uid: str):
        it = I.inv_find(self.player.inventory, uid)
        if not it:
            raise GameError("You don't have that.")
        if it["kind"] == "key":
            raise GameError("You might need that. Better hold on to it.")
        I.inv_remove(self.player.inventory, uid=uid, qty=it.get("qty", 1))
        self.message(f"You discard {it['name']}.", "info")
        self.counters["dropped"] = self.counters.get("dropped", 0) + 1
        if it.get("rarity") == "legendary":
            self.flags.add("dropped_legendary")

    # ---------------------------------------------------------------- progression
    def act_learn(self, node: str):
        if self.mode not in ("explore", "shop", "dialogue"):
            raise GameError("Not now.")
        try:
            self.player.learn(node)
        except ValueError as e:
            raise GameError(str(e))
        self.counters["skills_learned"] = self.counters.get("skills_learned", 0) + 1

    def act_spend_attr(self, attr: str):
        if self.mode not in ("explore", "shop", "dialogue"):
            raise GameError("Not now.")
        try:
            self.player.spend_attr(attr)
        except ValueError as e:
            raise GameError(str(e))

    def act_respec(self):
        self._require("explore")
        if not self.node().get("respec"):
            raise GameError("You need a trainer to unlearn your skills.")
        cost = self.player.respec_cost()
        if self.player.gold < cost:
            raise GameError(f"Retraining costs {cost} gold.")
        self.change_gold(-cost)
        n = self.player.respec()
        self.counters["respecs"] = self.counters.get("respecs", 0) + 1
        self.message(f"You unlearn your techniques. {n} skill points refunded.", "good")

    def act_track(self, quest: str):
        if quest in self.quests.data:
            self.quests.tracked = quest

    # ---------------------------------------------------------------- shops
    def open_shop(self, sid: str):
        if sid not in SHOPS:
            raise GameError("Unknown shop.")
        self.shop = sid
        self.mode = "shop"
        if sid not in self.shop_stock:
            self.shop_stock[sid] = self._generate_stock(sid)

    def act_shop(self, shop: str):
        self._require("explore")
        if shop not in [s for s in [self.node().get("shop")] if s] and \
                not any(f.get("shop") == shop for f in self.visible_features()):
            raise GameError("There's no shop here.")
        self.open_shop(shop)

    def _generate_stock(self, sid: str) -> list:
        sh = SHOPS[sid]
        stock = []
        for iid in sh.get("stock", []):
            stock.append(I.make_item(iid, qty=1))
        lvl = self.player.level
        for _ in range(sh.get("random", 0)):
            stock.append(I.generate_equipment(lvl + self.rng.randint(0, 1), self.rng, sh.get("quality", "shop"),
                                              base=self.rng.choice(sh["bases"]) if sh.get("bases") else None))
        for tier in sh.get("rep_stock", []):
            if self.reputation.get(tier["faction"], 0) >= tier["min"]:
                for iid in tier["items"]:
                    it = I.make_item(iid, rarity=tier.get("rarity", "rare"), rng=self.rng)
                    it["rep_item"] = True
                    stock.append(it)
        return stock

    def buy_price(self, item: dict) -> int:
        return max(1, int(item.get("value", 1) * self.player.stats["price_mult"]))

    def sell_price(self, item: dict) -> int:
        base = I.sell_value(item)
        return max(0 if item.get("kind") == "key" else 1, int(base * (2 - self.player.stats["price_mult"])))

    def act_buy(self, index: int):
        self._require("shop")
        stock = self.shop_stock[self.shop]
        index = int(index)
        if not 0 <= index < len(stock):
            raise GameError("That's not for sale.")
        it = stock[index]
        price = self.buy_price(it)
        if self.player.gold < price:
            raise GameError("You can't afford that.")
        self.player.gold -= price
        self.counters["gold_spent"] = self.counters.get("gold_spent", 0) + price
        if it["kind"] == "consumable":
            self.give_item(I.make_item(it["id"]))
        else:
            stock.pop(index)
            it.pop("rep_item", None)
            self.give_item(it)
        self.counters["purchases"] = self.counters.get("purchases", 0) + 1

    def act_sell(self, uid: str):
        self._require("shop")
        it = I.inv_find(self.player.inventory, uid)
        if not it:
            raise GameError("You don't have that.")
        if it["kind"] == "key":
            raise GameError("The merchant won't touch that.")
        price = self.sell_price(it)
        I.inv_remove(self.player.inventory, uid=uid, qty=1)
        self.player.gold += price
        self.counters["gold_earned"] = self.counters.get("gold_earned", 0) + price
        self.counters["items_sold"] = self.counters.get("items_sold", 0) + 1
        self.message(f"Sold {it['name']} for {price} gold.", "gold")
        if it["kind"] != "consumable":
            sold = dict(it)
            sold["qty"] = 1
            self.shop_stock[self.shop].append(sold)
        if it.get("rarity") == "legendary":
            self.flags.add("sold_legendary")

    # ---------------------------------------------------------------- ending
    def start_ending(self, choice: str):
        from ..data.story import ENDINGS
        e = ENDINGS[choice]
        self.flags.update({f"ending:{choice}", "act1_complete", "act_two"})
        self.act = 2
        epilogue = []
        for line in e.get("epilogue", []):
            if isinstance(line, str):
                epilogue.append(line)
            elif rules.check(self, line.get("if")):
                epilogue.append(line["text"])
        self.ending = {"id": choice, "title": e["title"], "text": e["text"], "epilogue": epilogue,
                       "banner": e.get("banner", "ASHES OF AETHER — ACT II")}
        self.mode = "ending"
        self.unlock_achievement("act_one")
        self.check_achievements()

    def act_continue(self):
        self._require("ending")
        self.mode = "explore"
        self.ending = None
        self.message("The world remains open. The Aether hums on — for now.", "story")
        self.autosave("ending")

    # ---------------------------------------------------------------- saves & settings
    def act_save(self, slot: str):
        if self.mode not in ("explore", "shop"):
            raise GameError("You can only save while exploring (not during combat or conversations).")
        if not self.saves:
            raise GameError("Saving is unavailable.")
        n = self.counters.get("saves", 0)
        self.counters["saves"] = n + 1
        try:
            self.saves.save(self, slot)
        except (ValueError, OSError) as e:
            self.counters["saves"] = n
            raise GameError(str(e) if isinstance(e, ValueError) else f"Could not write the save file: {e}")
        self.message(f"Game saved ({'autosave' if slot == 'auto' else slot.replace('slot', 'slot ')}).", "good")
        self.notify("info", "Game Saved", f"Slot: {slot}")

    def act_load(self, slot: str):
        if not self.saves:
            raise GameError("Loading is unavailable.")
        try:
            data = self.saves.read(slot)
        except FileNotFoundError:
            raise GameError("That save slot is empty.")
        except Exception as e:
            raise GameError(f"Could not load save: {e}")
        previous = self.__dict__.copy()
        try:
            self.load_dict(data)
        except Exception as e:
            self.__dict__.clear()
            self.__dict__.update(previous)
            detail = str(e) if isinstance(e, ValueError) else "the file is damaged or incomplete"
            raise GameError(f"Could not load save: {detail}")
        self.message(f"Loaded save '{slot}'.", "good")
        self.notify("info", "Game Loaded", f"Welcome back, {self.player.name}.")

    def act_delete_save(self, slot: str):
        if self.saves:
            try:
                self.saves.delete(slot)
            except (ValueError, OSError) as e:
                raise GameError(str(e))

    def act_settings(self, **kw):
        for k, v in kw.items():
            if k == "difficulty" and isinstance(v, str) and v in DIFFICULTY:
                self.settings["difficulty"] = v
                if v == "hard":
                    self.flags.add("played_hard")
            elif k == "autosave":
                self.settings["autosave"] = bool(v)

    # ---------------------------------------------------------------- 3D presentation
    def act_set_position(self, x: float, z: float, yaw: float = 0.0):
        if self.mode in ("title", "create") or not self.location:
            raise GameError("No scene to stand in.")
        clamp = lambda v: max(-POS_LIMIT, min(POS_LIMIT, v))  # noqa: E731
        self.scene_pos = {"loc": self.location, "x": round(clamp(x), 3), "z": round(clamp(z), 3),
                          "yaw": round(math.remainder(yaw, math.tau), 4)}

    # ---------------------------------------------------------------- developer tools (--dev only)
    def act_debug_teleport(self, to: str, peaceful: int = 0):
        if to not in LOCATIONS:
            raise GameError(f"Unknown location {to}")
        if self.mode == "combat":
            raise GameError("Finish or flee the fight first.")
        self.dialogue = self.shop = None
        self.mode = "explore"
        self.message(f"[dev] Teleported to {LOCATIONS[to]['name']}.", "info")
        self.enter(to)
        if peaceful:
            self.pending_combat = None

    def act_debug_end_combat(self):
        """Abandon the current fight: no rewards, no penalties, the encounter stays uncleared."""
        if self.mode != "combat" or not self.combat:
            raise GameError("Not in combat.")
        self.combat = None
        self.combat_result = None
        self.combat_ctx = {}
        self.mode = "explore"
        self.message("[dev] Fight abandoned.", "info")

    def act_debug_encounter(self, enc: str):
        if enc not in ENCOUNTERS:
            raise GameError(f"Unknown encounter {enc}")
        self._require("explore")
        self.queue_combat(enc)

    def act_debug_level(self, level: int):
        from .character import MAX_LEVEL, xp_for_level
        target = max(1, min(MAX_LEVEL, level))
        p = self.player
        for _ in range(100):
            if p.level >= target:
                break
            _, levels = p.gain_xp(max(1, xp_for_level(p.level + 1) - p.xp))
            for lv in levels:
                self.notify("level", f"Level {lv}!", "[dev] level set.")
        self.message(f"[dev] Level is now {p.level}.", "info")

    def act_debug_xp(self, amount: int):
        self.award_xp(max(0, amount) / XP_SCALE, "dev")

    def act_debug_flag(self, flag: str, on: int = 1):
        (self.flags.add if on else self.flags.discard)(flag)
        self.message(f"[dev] Flag {flag} {'set' if on else 'cleared'}.", "info")

    def act_debug_quest(self, quest: str, stage: str | None = None):
        from ..data.quests import QUESTS
        if quest not in QUESTS:
            raise GameError(f"Unknown quest {quest}")
        self.quests.start(quest)
        if stage:
            if stage not in QUESTS[quest]["stages"]:
                raise GameError(f"Unknown stage {stage}")
            self.quests.set_stage(quest, stage)

    def act_debug_heal(self):
        self.player.restore_full()

    def act_debug_reset_location(self):
        """Forget this location's cleared fights and one-shot interactions, then walk in again."""
        self._require("explore")
        loc = self.location
        node = self.node()
        if node.get("encounter"):
            self.cleared.discard(node["encounter"]["id"])
        self.flags = {f for f in self.flags if not f.startswith((f"feat:{loc}:", f"enter:{loc}:", f"searched:{loc}:"))}
        self.message(f"[dev] Reset {node['name']}.", "info")
        self.enter(loc)

    # ---------------------------------------------------------------- serialization
    def to_dict(self) -> dict:
        return {
            "version": VERSION,
            "player": self.player.to_dict(),
            "location": self.location,
            "prev_location": self.prev_location,
            "flags": sorted(self.flags),
            "counters": self.counters,
            "visited": sorted(self.visited),
            "cleared": sorted(self.cleared),
            "quests": self.quests.to_dict(),
            "achievements": self.achievements,
            "reputation": self.reputation,
            "lore": self.lore,
            "day": self.day,
            "act": self.act,
            "last_rest_node": self.last_rest_node,
            "shop_stock": self.shop_stock,
            "messages": self.messages[-40:],
            "scene_pos": self.scene_pos,
        }

    def load_dict(self, d: dict):
        from .save import migrate
        d = migrate(d)
        player = Character.from_dict(d["player"])
        loc = d["location"]
        if loc not in LOCATIONS:
            loc = RACES[player.race]["start_node"]
        self.reset()
        self.player = player
        self.location = loc
        self.prev_location = d.get("prev_location") if d.get("prev_location") in LOCATIONS else None
        self.flags = set(d.get("flags", []))
        self.counters = dict(d.get("counters", {}))
        self.visited = {v for v in d.get("visited", []) if v in LOCATIONS}
        self.cleared = {c for c in d.get("cleared", []) if c in ENCOUNTERS}
        self.quests.load(d.get("quests", {}))
        self.achievements = {k: v for k, v in d.get("achievements", {}).items() if k in ACHIEVEMENTS}
        self.reputation = {f: int(d.get("reputation", {}).get(f, 0)) for f in FACTIONS}
        self.lore = [l for l in d.get("lore", []) if l in LORE]
        self.day = int(d.get("day", 1))
        self.act = int(d.get("act", 1))
        self.last_rest_node = d.get("last_rest_node") if d.get("last_rest_node") in LOCATIONS else loc
        self.shop_stock = {k: v for k, v in d.get("shop_stock", {}).items() if k in SHOPS}
        self.messages = list(d.get("messages", []))
        self.scene_pos = _valid_pos(d.get("scene_pos"), loc)
        self.mode = "explore"

    def region_name(self) -> str:
        r = self.current_region()
        return REGIONS.get(r, {}).get("name", "") if r else ""
