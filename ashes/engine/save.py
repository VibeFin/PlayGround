"""Save-file management.

Saves are human-readable JSON written atomically (temp file + os.replace) with
the previous version kept as `<slot>.bak`. Content is referenced by id, never
by pickled objects, so saves survive code changes; unknown ids are dropped on
load rather than crashing. A `version` field allows forward migrations.
"""
from __future__ import annotations

import json
import os
import re
import time

SLOT_RE = re.compile(r"^[a-z0-9_-]{1,24}$")
RESERVED = {"settings"}  # other files that live next to the saves
CURRENT_VERSION = 2


def migrate(d: dict) -> dict:
    v = d.get("version", 0)
    if not isinstance(v, int) or v > CURRENT_VERSION:
        raise ValueError("This save was made by a newer version of the game.")
    if "player" not in d or "location" not in d:
        raise ValueError("Save file is missing required data.")
    if v < 2:
        # v2 added the 3D avatar position; older saves spawn at the room's default entrance.
        d["scene_pos"] = None
    d["version"] = CURRENT_VERSION
    return d


class SaveManager:
    def __init__(self, directory: str):
        self.dir = directory
        os.makedirs(self.dir, exist_ok=True)

    def _path(self, slot: str) -> str:
        slot = str(slot).lower()
        if not SLOT_RE.match(slot) or slot in RESERVED:
            raise ValueError("Invalid save slot name.")
        return os.path.join(self.dir, f"{slot}.json")

    def save(self, game, slot: str) -> str:
        from ..data.world import LOCATIONS
        from ..data.races import RACES
        from ..data.classes import CLASSES
        p = game.player
        payload = game.to_dict()
        payload["meta"] = {
            "slot": slot, "saved_at": time.time(), "name": p.name, "level": p.level,
            "race": RACES[p.race]["name"], "cls": CLASSES[p.cls]["name"],
            "location": LOCATIONS[game.location]["name"], "day": game.day, "act": game.act,
        }
        path = self._path(slot)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=1)
            f.flush()
            os.fsync(f.fileno())
        if os.path.exists(path):
            os.replace(path, path + ".bak")
        os.replace(tmp, path)
        return path

    def read(self, slot: str) -> dict:
        path = self._path(slot)
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError:
            bak = path + ".bak"
            if os.path.exists(bak):
                with open(bak, encoding="utf-8") as f:
                    return json.load(f)
            raise ValueError("Save file is corrupted and no backup exists.")

    def delete(self, slot: str):
        path = self._path(slot)
        for p in (path, path + ".bak"):
            if os.path.exists(p):
                os.remove(p)

    def list(self) -> list[dict]:
        out = []
        for fn in sorted(os.listdir(self.dir)):
            if not fn.endswith(".json"):
                continue
            slot = fn[:-5]
            if slot in RESERVED or not SLOT_RE.match(slot):
                continue
            try:
                with open(os.path.join(self.dir, fn), encoding="utf-8") as f:
                    meta = json.load(f).get("meta", {})
                out.append({"slot": slot, **meta})
            except Exception:
                out.append({"slot": slot, "corrupt": True})
        out.sort(key=lambda m: m.get("saved_at", 0), reverse=True)
        return out
