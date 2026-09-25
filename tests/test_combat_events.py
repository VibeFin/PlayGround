"""The structured combat feed the 3D client animates from must agree with the authoritative combat state."""
import random
import unittest

from helpers import COMBOS, started_game
from ashes.engine.view import build_view

HP_EVENTS = {"damage", "heal", "death", "survive"}


def fight(g, rng, max_turns=300):
    """Play a real fight with random legal choices, returning every feed event seen by the client."""
    seen, last = [], 0

    def pull():
        nonlocal last
        cb = build_view(g, None).get("combat")
        if not cb:
            return None
        new = [e for e in cb["feed"] if e["seq"] > last]
        seen.extend(new)
        last = cb["feed_seq"]
        return cb

    cb = pull()
    for _ in range(max_turns):
        if not cb or cb["result"]:
            break
        usable = [a for a in cb["abilities"] if a["usable"]]
        choice = rng.random()
        if usable and choice < 0.6:
            ab = rng.choice(usable)
            tgt = rng.choice(ab["targets"]) if ab["targets"] else None
            g.dispatch({"action": "combat", "kind": "ability", "ability": ab["id"], "target": tgt})
        elif choice < 0.95 and cb["attack_targets"]:
            g.dispatch({"action": "combat", "kind": "attack", "target": rng.choice(cb["attack_targets"])})
        else:
            g.dispatch({"action": "combat", "kind": "defend"})
        # Keep the player standing so fights run long enough to exercise many event types.
        g.combat.player.hp = max(g.combat.player.hp, g.combat.player.max_hp // 2)
        cb = pull()
    return seen, cb


class CombatFeedTests(unittest.TestCase):
    def test_feed_agrees_with_state_for_every_combo(self):
        for i, (race, cls) in enumerate(COMBOS):
            with self.subTest(combo=f"{race} {cls}"):
                g = started_game(race, cls, seed=20 + i)
                g.start_combat("enc_kd_shaft")
                seen, cb = fight(g, random.Random(i))
                seqs = [e["seq"] for e in seen]
                self.assertEqual(seqs, sorted(set(seqs)), "feed must be strictly increasing with no duplicates")
                self.assertEqual(seqs, list(range(seqs[0], seqs[0] + len(seqs))), "no events lost between views")
                units = {u.uid: u for u in g.combat.units}
                for e in seen:
                    for k in ("actor", "target", "source"):
                        if e.get(k) is not None:
                            self.assertIn(e[k], units, f"{e['type']} references unknown unit")
                last_hp = {}
                for e in seen:
                    if e["type"] in HP_EVENTS and "hp" in e:
                        last_hp[e["target"]] = e["hp"]
                for uid, hp in last_hp.items():
                    u = units[uid]
                    if uid == g.combat.player.uid:
                        continue  # the test itself tops the player's HP up between turns
                    self.assertEqual(max(0, u.hp), hp, f"{u.name}: feed says {hp} HP, engine says {u.hp}")
                for u in units.values():
                    if u.side == "enemy" and not u.alive:
                        self.assertTrue(any(e["type"] == "death" and e["target"] == u.uid for e in seen),
                                        f"{u.name} died without a death event")
                ends = [e for e in seen if e["type"] == "end"]
                self.assertEqual(len(ends), 1)
                self.assertEqual(ends[0]["state"], g.combat.state)
                self.assertTrue(any(e["type"] == "act" for e in seen))
                self.assertTrue(any(e["type"] == "turn" and e["actor"] == g.combat.player.uid for e in seen))

    def test_status_events_match_applied_statuses(self):
        g = started_game("human", "mage", seed=4)
        g.start_combat("enc_kd_shaft")
        cb = g.combat
        foe = cb.living("enemy")[0]
        start = cb._seq
        cb.add_status(foe, "burn", 3, cb.player, potency=4)
        ev = [e for e in cb.feed if e["seq"] > start]
        self.assertEqual([(e["type"], e["status"], e["target"]) for e in ev], [("status_on", "burn", foe.uid)])
        self.assertEqual(ev[0]["element"], "fire")

    def test_feed_is_bounded(self):
        g = started_game("dwarf", "fighter", seed=4)
        g.start_combat("enc_kd_shaft")
        cb = g.combat
        for _ in range(cb.FEED_KEEP + 50):
            cb.emit("round", n=0)
        self.assertLessEqual(len(cb.feed), cb.FEED_KEEP)
        self.assertLessEqual(len(build_view(g, None)["combat"]["feed"]), 160)


if __name__ == "__main__":
    unittest.main()
