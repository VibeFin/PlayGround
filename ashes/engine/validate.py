"""Static content validator: resolves every cross-reference in the data tables.

Run `python -m ashes.engine.validate` or use `validate()` from tests. Returns a list of problems;
an empty list means every id, stage, goto, condition key and effect key in the content is valid.
"""
from __future__ import annotations

from ..data.world import LOCATIONS, ENCOUNTERS, SHOPS, DIALOGUES, QUESTS, TRAVEL, REGIONS
from ..data.lore import LORE
from ..data.achievements import ACHIEVEMENTS
from ..data.factions import FACTIONS
from ..data.enemies import ENEMIES, ENEMY_ABILITIES
from ..data.skills import SKILL_NODES, SKILL_TREES
from ..data.story import ENDINGS
from ..data import items as ItemData
from . import items as I
from .dialogue import CHECK_NAMES

COND_KEYS = {"flag", "not_flag", "flags", "race", "not_race", "cls", "home", "not_home", "native", "level_gte",
             "level_lt", "has_item", "items", "not_has_item", "equipped", "gold_gte", "quest", "stage", "stage_in",
             "rep_gte", "rep_lt", "attr_gte", "visited", "counter_gte", "achievement", "skill", "branch_gte", "act",
             "any", "not", "chance", "lore", "mode"}
EFFECT_KEYS = {"if", "flag", "unflag", "xp", "gold", "item", "random_item", "loot", "remove_item", "start_quest",
               "set_stage", "complete_quest", "fail_quest", "rep", "achievement", "combat", "dialogue", "travel",
               "msg", "heal_full", "damage_pct", "counter", "lore", "discover", "open_world", "shop", "ending", "rest",
               "attr_point", "skill_point", "unique", "reason", "qty", "rarity", "kind"}
QUEST_STATES = {"active", "completed", "failed", "not_started", "started"}
# Flags created by the engine at runtime rather than by content effects.
DYNAMIC_FLAG_PREFIXES = ("region:", "found:", "discovered:", "ending:", "met:", "met_faction:", "opt:", "feat:",
                         "enter:", "searched:")
ENGINE_FLAGS = {"world_open", "act_two", "act1_complete", "stripped_bare", "dropped_legendary", "sold_legendary",
                "played_hard", "hard_boss_win", "naked_victory", "hoarder", "never"}


class _V:
    def __init__(self):
        self.errors: list[str] = []
        self.flags_set: set[str] = set(ENGINE_FLAGS)
        self.flags_used: dict[str, str] = {}
        self.enemy_tags = {t for e in ENEMIES.values() for t in e.get("tags", [])}

    def err(self, where: str, msg: str):
        self.errors.append(f"{where}: {msg}")

    # -------------------------------------------------------------- items
    def item_ok(self, where: str, iid: str):
        try:
            I.make_item(iid)
        except Exception as e:  # noqa: BLE001
            self.err(where, f"bad item '{iid}' ({e})")

    # -------------------------------------------------------------- conditions
    def cond(self, where: str, c):
        if c is None:
            return
        if isinstance(c, list):
            for x in c:
                self.cond(where, x)
            return
        if not isinstance(c, dict):
            self.err(where, f"condition is not a dict: {c!r}")
            return
        for k, v in c.items():
            if k not in COND_KEYS:
                self.err(where, f"unknown condition key '{k}'")
                continue
            if k in ("flag", "not_flag"):
                self.flags_used.setdefault(v, where)
            elif k == "flags":
                for f in v:
                    self.flags_used.setdefault(f, where)
            elif k in ("has_item", "not_has_item", "equipped"):
                self.item_ok(where, v if isinstance(v, str) else v[0])
            elif k == "items":
                for i in v:
                    self.item_ok(where, i)
            elif k == "quest":
                if v[0] not in QUESTS:
                    self.err(where, f"unknown quest '{v[0]}'")
                if v[1] not in QUEST_STATES:
                    self.err(where, f"bad quest state '{v[1]}'")
            elif k in ("stage", "stage_in"):
                qid, st = v
                if qid not in QUESTS:
                    self.err(where, f"unknown quest '{qid}'")
                else:
                    for s in (st if isinstance(st, list) else [st]):
                        if s not in QUESTS[qid]["stages"]:
                            self.err(where, f"unknown stage '{s}' of quest '{qid}'")
            elif k in ("rep_gte", "rep_lt"):
                if v[0] not in FACTIONS:
                    self.err(where, f"unknown faction '{v[0]}'")
            elif k == "visited":
                if v not in LOCATIONS:
                    self.err(where, f"unknown location '{v}'")
            elif k == "achievement":
                if v not in ACHIEVEMENTS:
                    self.err(where, f"unknown achievement '{v}'")
            elif k == "skill":
                if v not in SKILL_NODES:
                    self.err(where, f"unknown skill '{v}'")
            elif k == "branch_gte":
                branches = {b for t in SKILL_TREES.values() for b in t["branches"]}
                if v[0] not in branches:
                    self.err(where, f"unknown branch '{v[0]}'")
            elif k == "lore":
                if v not in LORE:
                    self.err(where, f"unknown lore '{v}'")
            elif k in ("home", "not_home"):
                if v not in REGIONS:
                    self.err(where, f"unknown home region '{v}'")
            elif k == "any":
                for x in v:
                    self.cond(where, x)
            elif k == "not":
                self.cond(where, v)

    # -------------------------------------------------------------- effects
    def effects(self, where: str, effs):
        if not effs:
            return
        if not isinstance(effs, list):
            self.err(where, f"effects must be a list, got {type(effs).__name__}")
            return
        for e in effs:
            if not isinstance(e, dict):
                self.err(where, f"effect is not a dict: {e!r}")
                continue
            self.cond(where, e.get("if"))
            for k, v in e.items():
                if k not in EFFECT_KEYS:
                    self.err(where, f"unknown effect key '{k}'")
                    continue
                if k == "flag":
                    for f in (v if isinstance(v, list) else [v]):
                        self.flags_set.add(f)
                elif k in ("item", "remove_item"):
                    if not isinstance(v, str):
                        self.err(where, f"{k} must be a string id, got {v!r}")
                    else:
                        self.item_ok(where, v)
                elif k == "unique":
                    if v not in ItemData.UNIQUES:
                        self.err(where, f"unknown unique '{v}'")
                elif k in ("start_quest", "complete_quest", "fail_quest"):
                    if v not in QUESTS:
                        self.err(where, f"unknown quest '{v}'")
                elif k == "set_stage":
                    qid, st = v
                    if qid not in QUESTS or st not in QUESTS[qid]["stages"]:
                        self.err(where, f"bad set_stage {v}")
                elif k == "rep":
                    if v[0] not in FACTIONS:
                        self.err(where, f"unknown faction '{v[0]}'")
                elif k == "achievement":
                    if v not in ACHIEVEMENTS:
                        self.err(where, f"unknown achievement '{v}'")
                elif k == "combat":
                    if v not in ENCOUNTERS:
                        self.err(where, f"unknown encounter '{v}'")
                elif k == "dialogue":
                    if v not in DIALOGUES:
                        self.err(where, f"unknown dialogue '{v}'")
                elif k == "travel":
                    if v not in LOCATIONS:
                        self.err(where, f"unknown location '{v}'")
                elif k == "lore":
                    if v not in LORE:
                        self.err(where, f"unknown lore '{v}'")
                elif k == "discover":
                    for t in (v if isinstance(v, list) else [v]):
                        if t not in TRAVEL:
                            self.err(where, f"unknown travel destination '{t}'")
                elif k == "shop":
                    if v not in SHOPS:
                        self.err(where, f"unknown shop '{v}'")
                elif k == "ending":
                    if v not in ENDINGS:
                        self.err(where, f"unknown ending '{v}'")
                elif k == "loot":
                    if v not in I.RARITY_WEIGHTS:
                        self.err(where, f"unknown loot quality '{v}'")
                elif k == "random_item":
                    if v.get("quality", "chest") not in I.RARITY_WEIGHTS:
                        self.err(where, f"unknown quality in random_item {v}")
                    if v.get("base") and v["base"] not in I.EQUIP_BASES:
                        self.err(where, f"unknown base in random_item {v}")

    def check_spec(self, where: str, chk: dict, node_ids=None):
        stat = chk.get("stat")
        if stat not in CHECK_NAMES:
            self.err(where, f"unknown check stat '{stat}'")
        if "dc" not in chk:
            self.err(where, "check without dc")
        for branch in ("pass", "fail"):
            b = chk.get(branch)
            if node_ids is not None:
                if b not in node_ids:
                    self.err(where, f"check {branch} goto '{b}' is not a node")
            elif b is not None:
                if not isinstance(b, dict):
                    self.err(where, f"feature check {branch} must be a dict")
                else:
                    self.effects(f"{where}.{branch}", b.get("effects"))

    # -------------------------------------------------------------- tables
    def run(self):
        for lid, loc in LOCATIONS.items():
            w = f"location {lid}"
            if loc.get("region") not in REGIONS:
                self.err(w, f"unknown region '{loc.get('region')}'")
            desc = loc.get("desc")
            if isinstance(desc, list):
                for d in desc:
                    self.cond(w, d.get("if"))
            for ex in loc.get("exits", []):
                if ex["to"] not in LOCATIONS:
                    self.err(w, f"exit to unknown location '{ex['to']}'")
                for key in ("if", "show_if", "hide_if"):
                    self.cond(w, ex.get(key))
            for n in loc.get("npcs", []):
                if n["id"] not in DIALOGUES:
                    self.err(w, f"unknown npc '{n['id']}'")
                self.cond(w, n.get("if"))
            for f in loc.get("features", []):
                fw = f"{w} feature {f['id']}"
                self.cond(fw, f.get("if"))
                if isinstance(f.get("desc"), list):
                    for d in f["desc"]:
                        self.cond(fw, d.get("if"))
                for a in f.get("actions", []):
                    self.cond(fw, a.get("if"))
                    self.effects(fw, a.get("effects"))
                    if a.get("check"):
                        self.check_spec(fw, a["check"])
            for oe in loc.get("on_enter", []):
                self.cond(w, oe.get("if"))
                self.effects(w, oe.get("effects"))
            enc = loc.get("encounter")
            if enc:
                if enc["id"] not in ENCOUNTERS:
                    self.err(w, f"unknown encounter '{enc['id']}'")
                self.cond(w, enc.get("if"))
            rnd = loc.get("random")
            if rnd:
                for eid in rnd["table"]:
                    if eid not in ENCOUNTERS:
                        self.err(w, f"unknown random encounter '{eid}'")
            if loc.get("shop") and loc["shop"] not in SHOPS:
                self.err(w, f"unknown shop '{loc['shop']}'")
            if loc.get("travel") and loc["travel"] not in TRAVEL:
                self.err(w, f"unknown travel id '{loc['travel']}'")
            if loc.get("rest") not in (None, "inn", "camp", "sanctuary"):
                self.err(w, f"unknown rest kind '{loc.get('rest')}'")

        for eid, enc in ENCOUNTERS.items():
            w = f"encounter {eid}"
            if not enc.get("enemies"):
                self.err(w, "no enemies")
            for spec in enc.get("enemies", []):
                en = spec if isinstance(spec, str) else spec[0]
                if en not in ENEMIES:
                    self.err(w, f"unknown enemy '{en}'")
                if not isinstance(spec, str) and len(spec) > 1 and spec[1] not in ("front", "back"):
                    self.err(w, f"bad row '{spec[1]}'")
            if "level" in enc and (len(enc["level"]) != 2 or enc["level"][0] > enc["level"][1]):
                self.err(w, f"bad level range {enc['level']}")
            self.effects(w, enc.get("on_victory"))
            if enc.get("after_dialogue") and enc["after_dialogue"] not in DIALOGUES:
                self.err(w, f"unknown after_dialogue '{enc['after_dialogue']}'")
            for iid in enc.get("drops", []):
                self.item_ok(w, iid)

        for eid, e in ENEMIES.items():
            w = f"enemy {eid}"
            ab_lists = [e.get("abilities", []), e.get("freed_abilities", [])]
            ab_lists += [ph.get("abilities", []) for ph in e.get("phases", [])]
            for lst in ab_lists:
                for ab in lst:
                    if ab["id"] not in ENEMY_ABILITIES:
                        self.err(w, f"unknown ability '{ab['id']}'")
            for ph in e.get("phases", []):
                for s in ph.get("summon", []):
                    if s["unit"] not in ENEMIES:
                        self.err(w, f"unknown summon '{s['unit']}'")
                for u in ph.get("remove_units", []):
                    if u not in ENEMIES:
                        self.err(w, f"unknown remove_units '{u}'")
            for od in e.get("on_death", []):
                if od.get("unit") and od["unit"] not in ENEMIES:
                    self.err(w, f"unknown on_death unit '{od['unit']}'")
        for aid, ab in ENEMY_ABILITIES.items():
            for eff in ab.get("effects", []):
                if eff.get("type") == "summon" and eff.get("unit") not in ENEMIES:
                    self.err(f"enemy ability {aid}", f"unknown summon '{eff.get('unit')}'")

        for did, d in DIALOGUES.items():
            w = f"dialogue {did}"
            nodes = d.get("nodes", {})
            for en in d.get("entry", []):
                self.cond(w, en.get("if"))
                if en["node"] not in nodes:
                    self.err(w, f"entry node '{en['node']}' missing")
            for m in d.get("markers", []):
                self.cond(w, m.get("if"))
            for nid, node in nodes.items():
                nw = f"{w}.{nid}"
                txt = node.get("text")
                if isinstance(txt, list):
                    for t in txt:
                        self.cond(nw, t.get("if"))
                self.effects(nw, node.get("effects"))
                for o in node.get("options", []):
                    self.cond(nw, o.get("if"))
                    self.effects(nw, o.get("effects"))
                    if o.get("goto") is not None and o["goto"] not in nodes:
                        self.err(nw, f"goto '{o['goto']}' missing")
                    if o.get("check"):
                        self.check_spec(nw, o["check"], set(nodes))
                extra = set(node) - {"text", "effects", "options"}
                if extra:
                    self.err(nw, f"unknown node keys {sorted(extra)}")

        for qid, q in QUESTS.items():
            w = f"quest {qid}"
            if q["start"] not in q["stages"]:
                self.err(w, f"start stage '{q['start']}' missing")
            for sid, st in q["stages"].items():
                sw = f"{w}.{sid}"
                for ob in st.get("objectives", []):
                    self.cond(sw, ob.get("cond"))
                    if "kill" in ob:
                        t = ob["kill"]
                        if t.startswith("tag:"):
                            if t[4:] not in self.enemy_tags:
                                self.err(sw, f"no enemy has tag '{t[4:]}'")
                        elif t not in ENEMIES:
                            self.err(sw, f"unknown kill target '{t}'")
                self.effects(sw, st.get("on_complete"))
                nxt = st.get("next")
                targets = [b["goto"] for b in nxt] if isinstance(nxt, list) else [nxt]
                if isinstance(nxt, list):
                    for b in nxt:
                        self.cond(sw, b.get("if"))
                for t in targets:
                    if t is not None and t not in q["stages"]:
                        self.err(sw, f"next stage '{t}' missing")
            for f in q.get("rewards", {}).get("rep", {}):
                if f not in FACTIONS:
                    self.err(w, f"unknown reward faction '{f}'")
            for iid in q.get("rewards", {}).get("items", []):
                self.item_ok(w, iid)
            self.effects(w, q.get("on_complete"))

        for sid, sh in SHOPS.items():
            w = f"shop {sid}"
            for iid in sh.get("stock", []):
                self.item_ok(w, iid)
            for b in sh.get("bases", []):
                if b not in I.EQUIP_BASES:
                    self.err(w, f"unknown base '{b}'")
            if sh.get("quality", "shop") not in I.RARITY_WEIGHTS:
                self.err(w, f"unknown quality '{sh.get('quality')}'")
            for tier in sh.get("rep_stock", []):
                if tier["faction"] not in FACTIONS:
                    self.err(w, f"unknown faction '{tier['faction']}'")
                for iid in tier["items"]:
                    self.item_ok(w, iid)

        for aid, a in ACHIEVEMENTS.items():
            self.cond(f"achievement {aid}", a.get("cond"))
        for lid, l in LORE.items():
            self.effects(f"lore {lid}", l.get("effects"))
        for kid, k in ItemData.KEY_ITEMS.items():
            if k.get("read") and k["read"] not in LORE:
                self.err(f"key item {kid}", f"read lore '{k['read']}' missing")
        for tid, t in TRAVEL.items():
            if t["node"] not in LOCATIONS:
                self.err(f"travel {tid}", f"unknown node '{t['node']}'")
            if not LOCATIONS.get(t["node"], {}).get("travel"):
                self.err(f"travel {tid}", "destination node has no 'travel' key (player could not travel onward)")
            self.cond(f"travel {tid}", t.get("if"))
            for eid in t.get("ambush", []):
                if eid not in ENCOUNTERS:
                    self.err(f"travel {tid}", f"unknown ambush '{eid}'")
        for eid, e in ENDINGS.items():
            for line in e.get("epilogue", []):
                if isinstance(line, dict):
                    self.cond(f"ending {eid}", line.get("if"))

        for f, where in sorted(self.flags_used.items()):
            if f in self.flags_set or f.startswith(DYNAMIC_FLAG_PREFIXES):
                continue
            self.err(where, f"flag '{f}' is checked but never set by any content")


def validate() -> list[str]:
    v = _V()
    v.run()
    return v.errors


if __name__ == "__main__":
    problems = validate()
    for p in problems:
        print(p)
    print(f"{len(problems)} problem(s)")
