"""Quest log: staged quests with condition- and kill-based objectives.

Quest definition (ashes/data/quests/*):
    {"name", "type": main|side|faction|exploration|hidden, "summary", "level",
     "start": stage_id, "stages": {stage_id: {
         "desc": journal text,
         "objectives": [{"id", "text", "cond": {...}} | {"id", "text", "kill": eid|"tag:x", "count": n}],
         "on_complete": [effects],
         "next": stage_id | [{"if": cond, "goto": stage}, ...] | None   (None completes the quest)
     }},
     "rewards": {"xp", "gold", "items": [...], "rep": {faction: n}}, "on_complete": [effects]}
"""
from __future__ import annotations

from ..data.quests import QUESTS
from ..data.races import RACES
from ..data.enemies import ENEMIES
from . import rules

QUEST_TYPES = ["main", "side", "faction", "exploration", "hidden"]


class QuestLog:
    def __init__(self, game):
        self.game = game
        self.data: dict[str, dict] = {}
        self.tracked: str | None = None

    # ------------------------------------------------------------ queries
    def state(self, qid: str) -> str:
        q = self.data.get(qid)
        return q["state"] if q else "not_started"

    def is_state(self, qid: str, state: str) -> bool:
        s = self.state(qid)
        if state == "started":
            return s != "not_started"
        return s == state

    def stage(self, qid: str) -> str | None:
        q = self.data.get(qid)
        return q["stage"] if q and q["state"] == "active" else (q["stage"] if q else None)

    def active(self) -> list[str]:
        return [qid for qid, q in self.data.items() if q["state"] == "active"]

    def qtype(self, qid: str) -> str:
        """Homeland intro quests are the main story for natives and a side quest for everyone else."""
        qd = QUESTS[qid]
        native = qd.get("native_region")
        p = self.game.player
        if native and p is not None and RACES[p.race]["home"] != native:
            return "side"
        return qd["type"]

    # ------------------------------------------------------------ mutation
    def start(self, qid: str):
        if qid not in QUESTS:
            raise KeyError(f"Unknown quest {qid}")
        if qid in self.data:
            return
        qd = QUESTS[qid]
        self.data[qid] = {"state": "active", "stage": qd["start"], "progress": {}, "journal": []}
        self._journal(qid, qd["stages"][qd["start"]]["desc"])
        qt = self.qtype(qid)
        label = {"main": "Main Quest", "side": "Side Quest", "faction": "Faction Quest",
                 "exploration": "Discovery", "hidden": "Hidden Quest"}.get(qt, "Quest")
        self.game.notify("quest", f"{label} Started", qd["name"])
        self.game.message(f"New {label.lower()}: {qd['name']}", "quest")
        if self.tracked is None or qt == "main":
            self.tracked = qid
        self.update()

    def set_stage(self, qid: str, stage: str):
        if qid not in self.data:
            self.start(qid)
        q = self.data[qid]
        if q["state"] != "active":
            return
        q["stage"] = stage
        q["progress"] = {}
        self._journal(qid, QUESTS[qid]["stages"][stage]["desc"])
        self.game.notify("quest", "Quest Updated", QUESTS[qid]["name"])
        self.update()

    def complete(self, qid: str):
        if qid not in self.data:
            self.data[qid] = {"state": "active", "stage": QUESTS[qid]["start"], "progress": {}, "journal": []}
        q = self.data[qid]
        if q["state"] != "active":
            return
        q["state"] = "completed"
        qd = QUESTS[qid]
        g = self.game
        g.message(f"Quest completed: {qd['name']}", "quest")
        g.notify("quest", "Quest Completed", qd["name"])
        g.counters["quests_completed"] = g.counters.get("quests_completed", 0) + 1
        if self.qtype(qid) in ("side", "faction", "hidden"):
            g.counters["side_quests"] = g.counters.get("side_quests", 0) + 1
        r = qd.get("rewards", {})
        if r.get("gold"):
            g.change_gold(r["gold"])
        for iid in r.get("items", []):
            from . import items as I
            g.give_item(I.make_item(iid, rng=g.rng))
        for f, n in r.get("rep", {}).items():
            g.change_rep(f, n)
        if r.get("xp"):
            g.award_xp(r["xp"], f"quest: {qd['name']}")
        rules.apply_effects(g, qd.get("on_complete", []))
        if self.tracked == qid:
            act = self.active()
            mains = [a for a in act if self.qtype(a) == "main"]
            self.tracked = (mains or act or [None])[0]
        g.autosave("quest")

    def fail(self, qid: str):
        if qid not in self.data:
            return
        q = self.data[qid]
        if q["state"] == "active":
            q["state"] = "failed"
            self.game.message(f"Quest failed: {QUESTS[qid]['name']}", "bad")
            self.game.notify("quest", "Quest Failed", QUESTS[qid]["name"])
            if self.tracked == qid:
                act = self.active()
                self.tracked = act[0] if act else None

    def _journal(self, qid: str, text: str):
        self.data[qid]["journal"].append(self.game.fmt(text))

    # ------------------------------------------------------------ events
    def on_kill(self, enemy_id: str, tags: set):
        for qid in self.active():
            q = self.data[qid]
            st = QUESTS[qid]["stages"][q["stage"]]
            for ob in st.get("objectives", []):
                target = ob.get("kill")
                if not target:
                    continue
                hit = (target == enemy_id) or (target.startswith("tag:") and target[4:] in tags)
                if hit:
                    q["progress"][ob["id"]] = min(ob.get("count", 1), q["progress"].get(ob["id"], 0) + 1)

    def objective_done(self, qid: str, ob: dict) -> bool:
        q = self.data[qid]
        if "kill" in ob:
            target = ob["kill"]
            # Unique bosses can't be fought again, so kills made before the quest was accepted still count.
            if not target.startswith("tag:") and ENEMIES.get(target, {}).get("boss"):
                return self.game.counters.get(f"kill:{target}", 0) >= ob.get("count", 1)
            return q["progress"].get(ob["id"], 0) >= ob.get("count", 1)
        return rules.check(self.game, ob.get("cond"))

    def update(self):
        """Advance any quest whose current stage objectives are all complete."""
        changed = True
        guard = 0
        while changed and guard < 50:
            changed = False
            guard += 1
            for qid in list(self.active()):
                q = self.data[qid]
                st = QUESTS[qid]["stages"][q["stage"]]
                obs = [o for o in st.get("objectives", []) if not o.get("optional")]
                if not obs:
                    continue
                if all(self.objective_done(qid, o) for o in obs):
                    rules.apply_effects(self.game, st.get("on_complete", []))
                    if self.data[qid]["state"] != "active" or self.data[qid]["stage"] != q["stage"]:
                        changed = True
                        continue
                    nxt = st.get("next")
                    if isinstance(nxt, list):
                        nxt = next((b["goto"] for b in nxt if rules.check(self.game, b.get("if"))), None)
                    if nxt:
                        self.set_stage(qid, nxt)
                    else:
                        self.complete(qid)
                    changed = True

    # ------------------------------------------------------------ view / save
    def view(self) -> list[dict]:
        out = []
        for qid, q in self.data.items():
            qd = QUESTS[qid]
            st = qd["stages"][q["stage"]]
            objs = []
            if q["state"] == "active":
                for o in st.get("objectives", []):
                    if o.get("hidden") and not self.objective_done(qid, o):
                        continue
                    prog = ""
                    if "kill" in o and o.get("count", 1) > 1:
                        prog = f" ({q['progress'].get(o['id'], 0)}/{o['count']})"
                    objs.append({"text": self.game.fmt(o["text"]) + prog, "done": self.objective_done(qid, o),
                                 "optional": bool(o.get("optional"))})
            out.append({"id": qid, "name": qd["name"], "type": self.qtype(qid), "state": q["state"],
                        "summary": self.game.fmt(qd.get("summary", "")), "level": qd.get("level"),
                        "desc": self.game.fmt(st["desc"]), "objectives": objs, "journal": q["journal"],
                        "tracked": qid == self.tracked, "region": qd.get("region", "")})
        order = {t: i for i, t in enumerate(QUEST_TYPES)}
        out.sort(key=lambda x: (x["state"] != "active", order.get(x["type"], 9)))
        return out

    def to_dict(self) -> dict:
        return {"data": self.data, "tracked": self.tracked}

    def load(self, d: dict):
        self.data = {k: v for k, v in d.get("data", {}).items() if k in QUESTS}
        for qid, q in self.data.items():
            if q["stage"] not in QUESTS[qid]["stages"]:
                q["stage"] = QUESTS[qid]["start"]
        self.tracked = d.get("tracked") if d.get("tracked") in self.data else None
