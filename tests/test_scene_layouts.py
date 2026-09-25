"""Authored 3D layouts (web/world/*.json) must agree with the engine's world data.

The engine is authoritative: a layout may only place things the engine knows about, and in an authored
region every NPC, feature and exit the engine defines should have a hand-placed anchor (the client's
automatic placement is only meant for regions without authored layouts).
"""
import json
import os
import re
import unittest

from ashes.data.world import LOCATIONS, DIALOGUES

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORLD_DIR = os.path.join(ROOT, "web", "world")
PREFABS_JS = os.path.join(ROOT, "web", "js", "world3d", "prefabs.js")
SIDES = {"n", "s", "e", "w"}
DOOR_STYLES = {"arch", "tunnel", "gate", "door", "trail", "round", "stairs_down"}
BARRIERS = {"portcullis", "rubble", "none"}


def prefab_names():
    src = open(PREFABS_JS, encoding="utf-8").read()
    start = src.index("export const PREFABS = {")
    end = src.index("\n};", start)
    return set(re.findall(r"^  ([a-z_]+)\s*[(:]", src[start:end], re.M))


def layouts():
    out = {}
    for name in sorted(os.listdir(WORLD_DIR)):
        if name.endswith(".json"):
            with open(os.path.join(WORLD_DIR, name), encoding="utf-8") as f:
                out[name[:-5]] = json.load(f)
    return out


class LayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.regions = layouts()
        cls.prefabs = prefab_names()

    def test_prefab_registry_parsed(self):
        self.assertGreater(len(self.prefabs), 30)
        for core in ("pillar", "anvil_ring", "furnace_column", "stall", "breach", "round_door"):
            self.assertIn(core, self.prefabs)

    def test_kharum_is_fully_authored(self):
        self.assertIn("kharum", self.regions)
        reg = self.regions["kharum"]
        self.assertEqual(reg["region"], "kharum")
        engine = {k for k, v in LOCATIONS.items() if v.get("region") == "kharum"}
        self.assertEqual(set(reg["locations"]), engine)

    def test_layouts_match_engine_data(self):
        for region, reg in self.regions.items():
            for loc_id, lay in reg["locations"].items():
                with self.subTest(loc=loc_id):
                    self.assertIn(loc_id, LOCATIONS)
                    node = LOCATIONS[loc_id]
                    self.assertEqual(node.get("region"), reg["region"])
                    w, d = lay.get("size", [30, 26])
                    half = max(w, d) / 2 + 1

                    engine_exits = {e["to"] for e in node.get("exits", [])}
                    self.assertEqual(set(lay.get("exits", {})), engine_exits, "exits must match the engine one-to-one")
                    for to, spec in lay.get("exits", {}).items():
                        if lay.get("shape") == "round":
                            self.assertIn("angle", spec, f"{to}: round rooms place exits by angle")
                        else:
                            self.assertIn(spec.get("side"), SIDES, to)
                        if "style" in spec:
                            self.assertIn(spec["style"], DOOR_STYLES, to)
                        if "barrier" in spec:
                            self.assertIn(spec["barrier"], BARRIERS, to)

                    engine_npcs = {n["id"] for n in node.get("npcs", [])}
                    self.assertEqual(set(lay.get("npcs", {})), engine_npcs, "every NPC needs an anchor")
                    for npc, spot in lay.get("npcs", {}).items():
                        self.assertIn(npc, DIALOGUES, npc)
                        self.assertTrue(abs(spot[0]) <= half and abs(spot[1]) <= half, f"{npc} outside the room")
                    self.assertLessEqual(set(lay.get("look", {})), engine_npcs)

                    engine_feats = {f["id"] for f in node.get("features", [])}
                    self.assertEqual(set(lay.get("features", {})), engine_feats, "every feature needs an anchor")
                    for fid, spec in lay.get("features", {}).items():
                        x, z = spec["pos"]
                        self.assertTrue(abs(x) <= half and abs(z) <= half, f"{fid} outside the room")

                    for p in lay.get("props", []):
                        self.assertIn(p["type"], self.prefabs, f"unknown prefab {p['type']}")
                        self.assertEqual(len(p["pos"]), 2)

                    services = [k for k in ("shop", "rest", "respec") if node.get(k)] + (["travel"] if node.get("can_travel") else [])
                    self.assertLessEqual(set(lay.get("points", {})), set(services) | {"shop", "rest", "respec", "travel"})

                    for key in lay.get("spawn", {}):
                        self.assertTrue(key == "default" or key in LOCATIONS, key)
                    if "arena" in lay:
                        self.assertEqual(len(lay["arena"]["pos"]), 2)


if __name__ == "__main__":
    unittest.main()
