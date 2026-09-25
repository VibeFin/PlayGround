"""An autonomous player used by the test-suite to prove the campaign is completable.

The bot drives the real `Game.dispatch` API only. It explores greedily: it talks to NPCs with quest
markers, tries every available feature action, walks to unvisited places, travels, rests, levels up,
equips upgrades, buys potions, and fights with a simple tactical policy. It knows puzzle answers the
same way a player who read the in-game clues would (PUZZLE_HINTS).
"""
from __future__ import annotations

from collections import deque

from ashes.engine.game import Game, GameError
from ashes.engine import rules
from ashes.engine import items as I
from ashes.engine.character import get_ability, MAX_LEVEL
from ashes.data.world import LOCATIONS, ENCOUNTERS, TRAVEL
from ashes.data.dialogue import DIALOGUES
from ashes.data.skills import SKILL_TREES
from ashes.data.classes import CLASSES
from ashes.data import items as ItemData

MAIN_ATTR = {"fighter": "str", "mage": "int", "rogue": "dex"}
# Answers a player would learn from in-game clues. feature_id -> label substring to prefer (others avoided).
PUZZLE_HINTS = {
    "ley_puzzle": "Moon, Star, Root",
    "lament_door": "outlast the sky",
    "tone_bells": "Mountain, Anvil, Star",
    "star_dial": "Lantern, Bow, Anvil",
    "emitter_left": "Flame",
    "emitter_right": "Frost",
    "emitter_up": "Storm",
    "three_hollows": "Set the three",
}
# Labels the bot never picks (they only hurt, or exist purely for flavour loops).
AVOID_LABELS = ("Toss a coin", "Drink a tankard", "Warm your hands")
PREFERRED_WEAPONS = {"fighter": {"sword", "axe", "mace"}, "mage": {"staff", "wand"}, "rogue": {"dagger", "rapier", "bow"}}


class StuckError(RuntimeError):
    pass


class Bot:
    def __init__(self, race: str, cls: str, seed: int = 1, difficulty: str = "normal", verbose: bool = False):
        self.g = Game(seed=seed, settings={"difficulty": difficulty, "autosave": False})
        self.race, self.cls, self.seed = race, cls, seed
        self.ranger = cls == "rogue" and seed % 3 == 2
        self.verbose = verbose
        self.steps = 0
        self.tried: dict = {}
        self.talked: dict = {}
        self.deaths_here: dict = {}
        self.grind_until_level = 0
        self.resting = False
        self.util_round: dict = {}
        self.log: list[str] = []

    # ------------------------------------------------------------------ helpers
    def act(self, **a):
        self.steps += 1
        if self.verbose:
            print(self.steps, self.g.location, self.g.mode, a)
        try:
            self.g.dispatch(a)
            return True
        except GameError as e:
            self.log.append(f"GameError on {a}: {e}")
            return False

    def sig(self):
        g = self.g
        return (frozenset(f for f in g.flags if not f.startswith(("feat:", "opt:", "enter:", "searched:", "met:"))),
                tuple(sorted((q, d["state"], d["stage"]) for q, d in g.quests.data.items())),
                g.player.level)

    def debug_state(self) -> str:
        g = self.g
        qs = [(q["name"], q["desc"], [o["text"] for o in q["objectives"] if not o["done"]])
              for q in g.quests.view() if q["state"] == "active"]
        return (f"loc={g.location} mode={g.mode} lvl={g.player.level} hp={g.player.hp} gold={g.player.gold} "
                f"steps={self.steps}\nactive quests={qs}\nlast log={self.log[-8:]}")

    # ------------------------------------------------------------------ main loop
    def run(self, max_steps: int = 40000, goal=lambda g: "act_two" in g.flags):
        g = self.g
        self.act(action="new_game")
        from ashes.engine.character import starting_attrs, creation_points, CREATION_MAX_ATTR
        base = starting_attrs(self.race, self.cls)
        alloc, pts = {}, creation_points(self.race)
        for attr in [MAIN_ATTR[self.cls], "con"] * 8 + ["wis", "cha"] * 4:
            if pts and base[attr] + alloc.get(attr, 0) < CREATION_MAX_ATTR:
                alloc[attr] = alloc.get(attr, 0) + 1
                pts -= 1
        self.act(action="create", name="Tester", race=self.race, cls=self.cls, alloc=alloc)
        while not goal(g):
            if self.steps > max_steps:
                raise StuckError("step limit reached\n" + self.debug_state())
            self.tick()
        return self

    def tick(self):
        g = self.g
        m = g.mode
        if m == "combat":
            self.fight()
        elif m == "defeat":
            self.deaths_here[g.combat_ctx["id"]] = self.deaths_here.get(g.combat_ctx["id"], 0) + 1
            if self.deaths_here[g.combat_ctx["id"]] >= 2 and g.player.level < MAX_LEVEL:
                self.grind_until_level = g.player.level + 1
            if sum(self.deaths_here.values()) > 25:
                raise StuckError("died too many times\n" + self.debug_state())
            self.act(action="respawn")
        elif m == "dialogue":
            self.converse()
        elif m == "shop":
            self.shop()
        elif m == "ending":
            self.act(action="continue")
        elif m == "explore":
            self.explore()
        else:
            raise StuckError(f"unexpected mode {m}")

    # ------------------------------------------------------------------ character upkeep
    def upkeep(self):
        g, p = self.g, self.g.player
        while p.attr_points > 0:
            attr = MAIN_ATTR[self.cls] if p.attr_points % 2 == 0 else "con"
            if not self.act(action="spend_attr", attr=attr):
                break
        tree = SKILL_TREES[CLASSES[self.cls]["tree"]]
        while p.skill_points > 0:
            options = [nid for nid in tree["nodes"] if p.can_learn(nid)[0]]
            if not options:
                break
            # Specialize in one branch (chosen by seed so test seeds cover every specialization),
            # preferring deeper tiers, then actives.
            branches = list(tree["branches"])
            main = branches[self.seed % len(branches)]
            options.sort(key=lambda n: (tree["nodes"][n]["branch"] != main, -tree["nodes"][n]["tier"],
                                        tree["nodes"][n]["type"] != "active"))
            if not self.act(action="learn", node=options[0]):
                break
        self.equip_upgrades()

    def item_score(self, it: dict) -> float:
        if it["kind"] not in ("weapon", "armor", "offhand", "jewelry"):
            return -1
        rar = ["common", "uncommon", "rare", "epic", "legendary"].index(it.get("rarity", "common")) \
            if it.get("rarity") in ("common", "uncommon", "rare", "epic", "legendary") else 0
        score = it.get("tier", 1) * 10 + rar * 4
        if it["kind"] == "weapon":
            if it.get("wtype") not in PREFERRED_WEAPONS[self.cls]:
                score -= 100
            if self.cls != "mage" and it.get("magic"):
                score -= 100
            if self.cls == "rogue" and (it.get("wtype") == "bow") == self.ranger:
                score += 5
        if it["kind"] == "offhand":
            want = {"fighter": "shield", "mage": "tome", "rogue": None}[self.cls]
            if it.get("otype") != want:
                score -= 100
        if it["kind"] == "armor":
            w = it.get("weight")
            pref = {"fighter": "heavy", "rogue": "medium", "mage": "light"}[self.cls]
            if w and w != pref:
                score -= 5
        return score

    def equip_upgrades(self):
        p = self.g.player
        for it in list(p.inventory):
            if it["kind"] not in ("weapon", "armor", "offhand", "jewelry"):
                continue
            s = self.item_score(it)
            if s < 0:
                continue
            slot = p._target_slot(it)
            if it["kind"] == "weapon" and self.cls == "rogue" and (it.get("wtype") == "bow") != self.ranger:
                continue
            cur = p.equipment.get(slot)
            if it["kind"] == "weapon" and it.get("hands") == 2 and p.equipment.get("off_hand") is not None \
                    and self.cls != "mage" and not self.ranger:
                continue
            if cur is None or s > self.item_score(cur):
                self.act(action="equip", uid=it["uid"], slot=slot)

    # ------------------------------------------------------------------ combat
    def fight(self):
        g = self.g
        cb = g.combat
        if cb is None or cb.state != "ongoing":
            self.act(action="combat_done")
            return
        p = cb.player
        foes = [u for u in cb.living("enemy")]
        hp_pct = p.hp / max(1, p.max_hp)
        inv = g.player.inventory
        heal = [it for it in inv if it["kind"] == "consumable" and it["id"].startswith("potion_heal")]
        if hp_pct < 0.35 and heal:
            heal.sort(key=lambda it: ItemData.CONSUMABLES[it["id"]]["value"], reverse=True)
            if self.act(action="combat", kind="item", item=heal[0]["uid"]):
                return
        antidotes = [it for it in inv if it["id"] == "antidote"]
        if antidotes and (p.stacks("poison") >= 3 or p.stacks("bleed") >= 2):
            if self.act(action="combat", kind="item", item=antidotes[0]["uid"]):
                return
        mana = [it for it in inv if it["kind"] == "consumable" and it["id"].startswith("potion_mana")]
        if self.cls == "mage" and p.mp < 12 and mana:
            if self.act(action="combat", kind="item", item=mana[0]["uid"]):
                return

        objects = [u for u in foes if u.is_object]
        chargers = [u for u in foes if u.has("charging")]

        def pick_target(options):
            if not options:
                return None
            obj = [u for u in options if u.is_object]
            if obj:
                return min(obj, key=lambda u: u.hp).uid
            boss = [u for u in options if u.is_boss]
            if boss and (p.has("stealthed") or p.has("focused")):
                return boss[0].uid
            return min(options, key=lambda u: (u.hp + u.barrier)).uid

        usable = []
        for aid in p.abilities:
            ok, _ = cb.ability_status(p, aid)
            if ok:
                usable.append(aid)

        def has_effect(ab, kinds):
            return any(e.get("type") in kinds for e in ab.get("effects", []))

        # Interrupt a telegraphed attack if possible.
        if chargers:
            for aid in usable:
                ab = get_ability(aid)
                if has_effect(ab, {"interrupt"}) or any(e.get("status") in ("stunned", "frozen", "provoked")
                                                        for e in ab.get("effects", [])):
                    tg = [u for u in cb.valid_targets(p, aid) if u.has("charging")] if ab.get("target", "enemy") == "enemy" else []
                    if ab.get("target", "enemy") != "enemy" or tg:
                        if self.act(action="combat", kind="ability", ability=aid, target=tg[0].uid if tg else None):
                            return
            if self.act(action="combat", kind="defend"):
                return
        # Self-sustain.
        if hp_pct < 0.5:
            for aid in usable:
                ab = get_ability(aid)
                if ab.get("target") in ("self", "ally", "all_allies") and has_effect(ab, {"heal", "barrier"}):
                    if self.act(action="combat", kind="ability", ability=aid):
                        return
        # In hard fights, keep defensive buffs and enemy debuffs rolling whenever they're off cooldown.
        if (g.combat_ctx.get("boss") or len(foes) >= 3) and cb.round >= self.util_round.get(id(cb), 0):
            self.util_round[id(cb)] = cb.round + 3
            for aid in usable:
                ab = get_ability(aid)
                if has_effect(ab, {"damage", "heal"}):
                    continue
                statuses = [e.get("status") for e in ab.get("effects", []) if e.get("status")]
                if ab.get("target") == "self" or has_effect(ab, {"gain_stacks"}):
                    if statuses and all(p.has(s) for s in statuses):
                        continue
                    if self.act(action="combat", kind="ability", ability=aid):
                        return
                elif ab.get("target", "enemy") in ("enemy", "all_enemies") and statuses:
                    tgts = cb.valid_targets(p, aid) if ab.get("target", "enemy") == "enemy" else foes
                    tgts = [u for u in tgts if not u.is_object and not all(u.has(s) for s in statuses)]
                    if not tgts:
                        continue
                    tgt = max(tgts, key=lambda u: (u.is_boss, u.hp)).uid if ab.get("target", "enemy") == "enemy" else None
                    if self.act(action="combat", kind="ability", ability=aid, target=tgt):
                        return
        # Damage: AoE when several enemies, else strongest single-target.
        dmg = []
        for aid in usable:
            ab = get_ability(aid)
            if not has_effect(ab, {"damage"}):
                continue
            t = ab.get("target", "enemy")
            cost = ab.get("cost", {})
            weight = sum(e.get("scale", e.get("mult", 1.0)) for e in ab.get("effects", []) if e.get("type") == "damage")
            if t in ("all_enemies", "random_enemies") and len([u for u in foes if not u.is_object]) >= 2:
                weight *= 1.8
            weight += (cost.get("mp", 0) + cost.get("sp", 0)) / 40
            dmg.append((weight, aid, t))
        dmg.sort(reverse=True)
        for _, aid, t in dmg:
            if t == "enemy":
                tgt = pick_target(cb.valid_targets(p, aid))
                if tgt is None:
                    continue
                if self.act(action="combat", kind="ability", ability=aid, target=tgt):
                    return
            else:
                if self.act(action="combat", kind="ability", ability=aid):
                    return
        tgt = pick_target(cb.valid_targets(p, None))
        if tgt and self.act(action="combat", kind="attack", target=tgt):
            return
        if not self.act(action="combat", kind="defend"):
            raise StuckError("cannot act in combat\n" + self.debug_state())

    # ------------------------------------------------------------------ dialogue
    @staticmethod
    def _is_leave(o) -> bool:
        return not o.get("goto") and not o.get("effects") and not o.get("check")

    def _opt_fresh(self, npc, node, i, o) -> bool:
        n = self.tried.get(("opt", npc, node, i), 0)
        if self._is_leave(o):
            return False
        if o.get("check"):
            return n < 3 and not self.tried.get(("passed", npc, node, i))
        return n == 0

    def _dlg_edges(self, o):
        out = []
        if o.get("goto"):
            out.append(o["goto"])
        if o.get("check"):
            out += [o["check"]["pass"], o["check"]["fail"]]
        return out

    def npc_interest(self, npc: str) -> bool:
        """True if the conversation graph (from the current entry) holds an option the bot hasn't tried."""
        from ashes.engine.dialogue import entry_node, visible_options
        g = self.g
        try:
            start = entry_node(g, npc)
        except ValueError:
            return False
        seen, dq = {start}, deque([start])
        while dq:
            node = dq.popleft()
            for i, o in visible_options(g, npc, node):
                if i == -1:
                    continue
                if self._opt_fresh(npc, node, i, o) and not self._costly(o):
                    return True
                for nxt in self._dlg_edges(o):
                    if nxt not in seen:
                        seen.add(nxt)
                        dq.append(nxt)
        return False

    def _costly(self, o) -> bool:
        for e in o.get("effects", []):
            if "shop" in e:
                return True
            if isinstance(e.get("gold"), int) and e["gold"] < 0 and self.g.player.gold < -e["gold"] + 50:
                return True
        return False

    def converse(self):
        from ashes.engine.dialogue import visible_options
        g = self.g
        st = g.dialogue
        npc, node = st.npc_id, st.node
        opts = visible_options(g, npc, node)
        depth = self.tried.get(("dlg_depth", npc), 0) + 1
        self.tried[("dlg_depth", npc)] = depth
        if depth > 30:
            self.tried[("dlg_depth", npc)] = 0
            self.act(action="leave")
            return

        # Distance (in options) from each option to a fresh option somewhere deeper in the graph.
        def reach(o, budget=6):
            seen = set()
            frontier = self._dlg_edges(o)
            for d in range(budget):
                nxt = []
                for n in frontier:
                    if n in seen:
                        continue
                    seen.add(n)
                    for j, oo in visible_options(g, npc, n):
                        if j != -1 and self._opt_fresh(npc, n, j, oo) and not self._costly(oo):
                            return d
                        nxt += self._dlg_edges(oo)
                frontier = nxt
            return None

        def score(io):
            i, o = io
            if i == -1:
                return 500
            effs = o.get("effects", [])
            questy = any(k in e for e in effs for k in ("start_quest", "set_stage", "complete_quest", "unique"))
            if self._costly(o):
                return 400
            if self._opt_fresh(npc, node, i, o):
                return 0 - (5 if questy else 0)
            r = reach(o)
            if r is not None:
                return 20 + r
            if self._is_leave(o):
                return 100
            return 200 + self.tried.get(("opt", npc, node, i), 0)

        i, o = min(opts, key=score)
        if score((i, o)) >= 200:
            leave = [x for x in opts if self._is_leave(x[1]) or x[0] == -1]
            if leave:
                i, o = leave[0]
            else:
                self.act(action="leave")
                return
        self.tried[("opt", npc, node, i)] = self.tried.get(("opt", npc, node, i), 0) + 1
        if not self.act(action="choose", index=i):
            self.act(action="leave")
            return
        if o.get("check") and g.dialogue and g.dialogue.last_result and "SUCCESS" in g.dialogue.last_result:
            self.tried[("passed", npc, node, i)] = 1
        if g.mode != "dialogue":
            self.tried[("dlg_depth", npc)] = 0

    # ------------------------------------------------------------------ shops
    def shop(self):
        g = self.g
        p = g.player
        stock = g.shop_stock[g.shop]
        # Sell junk equipment (anything not better than what's worn and not a unique).
        for it in list(p.inventory):
            if it["kind"] in ("weapon", "armor", "offhand", "jewelry") and not it["id"].startswith("u_"):
                slot = p._target_slot(it)
                cur = p.equipment.get(slot)
                if cur is not None and self.item_score(it) <= self.item_score(cur):
                    self.act(action="sell", uid=it["uid"])
        groups = [[("potion_heal_greater", 6), ("potion_heal", 6), ("potion_heal_minor", 5)], [("antidote", 3)]]
        if self.cls == "mage":
            groups.append([("potion_mana", 4), ("potion_mana_minor", 3)])
        for want in groups:
            for iid, n in want:
                idx = next((i for i, it in enumerate(stock) if it["id"] == iid), None)
                if idx is None:
                    continue
                while g.item_count(iid) < n and p.gold >= g.buy_price(stock[idx]) + 20:
                    if not self.act(action="buy", index=idx):
                        break
                break
        # Buy an upgrade if affordable.
        for i, it in enumerate(list(stock)):
            if it["kind"] in ("weapon", "armor", "offhand", "jewelry"):
                slot = p._target_slot(it)
                cur = p.equipment.get(slot)
                if (cur is None or self.item_score(it) > self.item_score(cur) + 5) and self.item_score(it) > 0 \
                        and p.gold >= g.buy_price(it) + 60:
                    self.act(action="buy", index=i)
                    break
        self.tried[("shop", g.shop, g.player.level)] = 1
        self.act(action="leave")
        self.upkeep()

    # ------------------------------------------------------------------ exploration
    def visible_features(self, loc: str):
        g = self.g
        out = []
        for f in LOCATIONS[loc].get("features", []):
            if not rules.check(g, f.get("if")):
                continue
            if f.get("hidden") and f"found:{loc}:{f['id']}" not in g.flags:
                continue
            out.append(f)
        return out

    def opportunities(self, loc: str) -> list[tuple[int, dict]]:
        """(priority, action) pairs available at loc; lower priority is more urgent."""
        g = self.g
        node = LOCATIONS[loc]
        sig = self.sig()
        ops = []
        for n in node.get("npcs", []):
            if not rules.check(g, n.get("if")):
                continue
            d = DIALOGUES[n["id"]]
            marker = next((m.get("marker", "!") for m in d.get("markers", []) if rules.check(g, m.get("if"))), None)
            if marker and self.talked.get((n["id"], sig), 0) < 2:
                ops.append((0, {"kind": "talk", "npc": n["id"], "key": (n["id"], sig)}))
            elif self.npc_interest(n["id"]) and self.talked.get((n["id"], sig), 0) < 3:
                ops.append((1, {"kind": "talk", "npc": n["id"], "key": (n["id"], sig)}))
        for f in self.visible_features(loc):
            hint = PUZZLE_HINTS.get(f["id"])
            for i, a in enumerate(f.get("actions", [])):
                if a.get("once") and f"feat:{loc}:{f['id']}:{i}" in g.flags:
                    continue
                if not rules.check(g, a.get("if")):
                    continue
                if any(x in a["label"] for x in AVOID_LABELS):
                    continue
                if hint and hint not in a["label"] and f["id"] != "lattice_heart":
                    continue
                if f["id"] == "lattice_heart" and not rules.check(g, {"flag": "lat_left_flame",
                                                                      "flags": ["lat_right_frost", "lat_up_storm"]}):
                    continue
                if any("travel" in e for e in a.get("effects", [])) and len(a.get("effects", [])) == 1:
                    continue
                key = ("feat", loc, f["id"], i, g.player.level if a.get("check") else 0)
                if self.tried.get(key):
                    continue
                pri = 1 if hint or a.get("effects") else 4
                ops.append((pri, {"kind": "interact", "feature": f["id"], "index": i, "key": key}))
        unfound = [f for f in node.get("features", []) if f.get("hidden") and rules.check(g, f.get("if"))
                   and f"found:{loc}:{f['id']}" not in g.flags]
        if unfound and f"searched:{loc}:{g.player.level}" not in g.flags:
            ops.append((2, {"kind": "search"}))
        if node.get("shop") and not self.tried.get(("shop", node["shop"], g.player.level)) and g.player.gold >= 40:
            ops.append((5, {"kind": "shop", "shop": node["shop"]}))
        if loc not in g.visited:
            ops.append((2, {"kind": "visit"}))
        enc = node.get("encounter")
        if loc in g.visited and enc and enc["id"] not in g.cleared and rules.check(g, enc.get("if")):
            ops.append((2, {"kind": "reenter", "loc": loc}))
        return ops

    def neighbors(self, loc: str):
        g = self.g
        for ex in LOCATIONS[loc].get("exits", []):
            if rules.check(g, ex.get("if")):
                yield ex["to"], {"action": "move", "to": ex["to"]}
        for f in self.visible_features(loc):
            for i, a in enumerate(f.get("actions", [])):
                if a.get("check") or a.get("once") or not rules.check(g, a.get("if")):
                    continue
                for e in a.get("effects", []):
                    if "travel" in e and len(a.get("effects", [])) == 1 and rules.check(g, e.get("if")):
                        yield e["travel"], {"action": "interact", "feature": f["id"], "index": i}
        here = LOCATIONS[loc].get("travel")
        if here and "world_open" in g.flags:
            for tid, t in TRAVEL.items():
                if tid == here:
                    continue
                if t.get("hidden") and f"discovered:{tid}" not in g.flags:
                    continue
                if not rules.check(g, t.get("if")):
                    continue
                yield t["node"], {"action": "travel", "dest": tid}

    def paths(self):
        start = self.g.location
        prev = {start: None}
        dq = deque([start])
        while dq:
            cur = dq.popleft()
            for nxt, a in self.neighbors(cur):
                if nxt not in prev:
                    prev[nxt] = (cur, a)
                    dq.append(nxt)
        return prev

    def first_step(self, prev, target):
        step = None
        cur = target
        while prev[cur] is not None:
            cur, a = prev[cur]
            step = a
            if prev[cur] is None:
                break
        return step

    def has_fight(self, loc: str) -> bool:
        if loc not in LOCATIONS:
            return False
        enc = LOCATIONS[loc].get("encounter")
        return bool(enc and enc["id"] not in self.g.cleared and rules.check(self.g, enc.get("if")))

    def dangerous(self, loc: str) -> bool:
        """An uncleared scripted fight waits there and we're not healthy enough to walk in."""
        if not self.has_fight(loc):
            return False
        enc = LOCATIONS[loc]["encounter"]
        p = self.g.player
        need = 0.8 if ENCOUNTERS[enc["id"]].get("boss") else 0.6
        return p.hp < p.stats["max_hp"] * need

    def explore(self):
        g, p = self.g, self.g.player
        self.upkeep()
        node = LOCATIONS[g.location]
        hp_pct = p.hp / max(1, p.stats["max_hp"])
        if node.get("rest") and (self.resting or hp_pct < 0.85 or
                                 (self.cls == "mage" and p.mp < p.stats["max_mp"] * 0.4)):
            self.resting = False
            if self.act(action="rest"):
                return
        if self.resting:
            if self.goto_rest(self.paths()):
                return
            self.resting = False
        if hp_pct < 0.5:
            potions = [it for it in p.inventory if it["id"].startswith("potion_heal")]
            if potions:
                self.act(action="use_item", uid=potions[0]["uid"])
                return
            if self.goto_rest(self.paths()):
                self.resting = True
                return

        prev = self.paths()
        if self.grind_until_level and p.level < self.grind_until_level:
            if self.grind(prev):
                return
        self.grind_until_level = 0

        best = None
        for loc in prev:
            ops = self.opportunities(loc)
            if not ops:
                continue
            dist = 0
            cur = loc
            while prev[cur] is not None:
                dist += 1
                cur = prev[cur][0]
            for pri, op in ops:
                danger = 0
                cand = (pri * 3 + dist + danger, loc, op)
                if best is None or cand[:1] < best[:1]:
                    best = cand
        if best is None:
            # Nothing left to do: grind a level and look again.
            self.grind_until_level = p.level + 1
            if p.level >= MAX_LEVEL or not self.grind(prev):
                raise StuckError("no opportunities and nowhere to grind\n" + self.debug_state())
            return
        _, loc, op = best
        if loc != g.location:
            step = self.first_step(prev, loc)
            if self.dangerous(step.get("to", "")):
                potions = [it for it in p.inventory if it["id"].startswith("potion_heal")]
                if potions:
                    self.act(action="use_item", uid=potions[0]["uid"])
                    return
                if self.goto_rest(prev):
                    self.resting = True
                    return
            self.act(**step)
            return
        self.do(op)

    def goto_rest(self, prev) -> bool:
        g, p = self.g, self.g.player
        best = None
        for loc in prev:
            r = LOCATIONS[loc].get("rest")
            if not r:
                continue
            dist = 0
            cur = loc
            while prev[cur] is not None:
                dist += 1
                cur = prev[cur][0]
            if best is None or dist < best[0]:
                best = (dist, loc)
        if best is None:
            return False
        if best[1] == g.location:
            return self.act(action="rest")
        self.act(**self.first_step(prev, best[1]))
        return True

    def grind(self, prev) -> bool:
        """Walk between nodes with random encounters to gain experience."""
        g = self.g
        p = g.player
        if p.hp < p.stats["max_hp"] * 0.6 and self.goto_rest(prev):
            return True
        here = LOCATIONS[g.location]
        cands = [loc for loc in prev if LOCATIONS[loc].get("random") and not self.has_fight(loc)]
        if not cands:
            return False
        if here.get("random"):
            exits = [ex["to"] for ex in here.get("exits", []) if rules.check(g, ex.get("if")) and not self.has_fight(ex["to"])]
            if exits:
                return self.act(action="move", to=exits[self.steps % len(exits)])
        target = min(cands, key=lambda l: self._dist(prev, l))
        step = self.first_step(prev, target)
        return bool(step) and self.act(**step)

    @staticmethod
    def _dist(prev, loc):
        d = 0
        while prev[loc] is not None:
            d += 1
            loc = prev[loc][0]
        return d

    def do(self, op):
        g = self.g
        k = op["kind"]
        if k == "talk":
            self.talked[op["key"]] = self.talked.get(op["key"], 0) + 1
            self.act(action="talk", npc=op["npc"])
        elif k == "interact":
            self.tried[op["key"]] = 1
            self.act(action="interact", feature=op["feature"], index=op["index"])
        elif k == "search":
            self.act(action="search")
        elif k == "shop":
            self.act(action="shop", shop=op["shop"])
        elif k == "visit":
            pass
        elif k == "reenter":
            p = g.player
            if p.hp < p.stats["max_hp"] * 0.8 and self.goto_rest(self.paths()):
                return
            out = [ex["to"] for ex in LOCATIONS[g.location].get("exits", []) if rules.check(g, ex.get("if"))]
            if out:
                self.act(action="move", to=out[0])
