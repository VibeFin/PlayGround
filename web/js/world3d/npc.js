// NPCs in the current room: procedural bodies at layout anchors, nameplates with quest markers,
// idle motion, and turning to face the player when approached or spoken to.
import * as THREE from "three";
import { buildHumanoid, disposeModel, lookForNpc } from "./characters.js";

export class NpcManager {
  constructor(scene, labels) {
    this.scene = scene;
    this.labels = labels;
    this.npcs = new Map();
    this.room = null;
  }

  clear() {
    for (const n of this.npcs.values()) this.drop(n);
    this.npcs.clear();
  }

  drop(n) {
    this.scene.remove(n.model.root);
    disposeModel(n.model.root);
    n.label.remove();
    this.room?.col.remove(n.collider);
  }

  sync(loc, room, looks = {}) {
    if (room !== this.room) { this.clear(); this.room = room; }
    const want = new Set(loc.npcs.map((n) => n.id));
    for (const [id, n] of this.npcs) if (!want.has(id)) { this.drop(n); this.npcs.delete(id); }
    for (const v of loc.npcs) {
      let n = this.npcs.get(v.id);
      const spot = room.npcSpots[v.id];
      if (!spot) continue;
      if (!n) {
        const model = buildHumanoid(lookForNpc(v, loc.region, looks[v.id] || {}));
        model.root.position.set(spot.x, 0, spot.z);
        model.root.rotation.y = spot.yaw;
        this.scene.add(model.root);
        const el = document.createElement("div");
        el.className = "w3d-nameplate npc";
        const label = this.labels.add(el, model.root, { offsetY: model.height + 0.35, maxDist: 22, occlude: true });
        const collider = room.col.circle(spot.x, spot.z, 0.45, { h: 2 });
        n = { id: v.id, model, label, el, spot, collider, yaw: spot.yaw, gestureT: 4 + Math.random() * 6, markerKey: null };
        this.npcs.set(v.id, n);
      }
      n.view = v;
      const key = `${v.name}|${v.title}|${v.marker}`;
      if (key !== n.markerKey) {
        n.markerKey = key;
        n.el.replaceChildren(
          ...(v.marker ? [Object.assign(document.createElement("div"), { className: "qmark " + (v.marker === "?" ? "turnin" : "offer"), textContent: v.marker })] : []),
          Object.assign(document.createElement("div"), { className: "nm", textContent: v.name }),
          ...(v.title ? [Object.assign(document.createElement("div"), { className: "tt", textContent: v.title })] : []));
      }
    }
  }

  get(id) { return this.npcs.get(id); }

  update(dt, playerPos, talkingTo) {
    for (const n of this.npcs.values()) {
      const m = n.model;
      const dx = playerPos.x - m.root.position.x, dz = playerPos.z - m.root.position.z;
      const d = Math.hypot(dx, dz);
      const toPlayer = Math.atan2(dx, dz);
      let goal = n.spot.yaw;
      const talking = talkingTo === n.id;
      if (talking || d < 3.2) goal = toPlayer;
      const diff = Math.atan2(Math.sin(goal - n.yaw), Math.cos(goal - n.yaw));
      n.yaw += diff * Math.min(1, dt * (talking ? 6 : 2.5));
      m.root.rotation.y = n.yaw;
      // The head tracks the player a little further out than the body turns.
      const rel = Math.atan2(Math.sin(toPlayer - n.yaw), Math.cos(toPlayer - n.yaw));
      m.anim.lookYaw += ((d < 7 && Math.abs(rel) < 1.4 ? rel * 0.7 : 0) - m.anim.lookYaw) * Math.min(1, dt * 4);
      n.gestureT -= dt;
      if (n.gestureT <= 0) {
        n.gestureT = talking ? 2.2 + Math.random() * 2 : 7 + Math.random() * 8;
        if (talking || d < 6) m.anim.play("talk");
      }
      m.anim.update(dt, Math.abs(diff) > 0.3 ? 1.2 : 0);
      n.label.setHidden(talking);
    }
  }

  // Screen-ray pick for click-to-talk.
  pick(ray) {
    let best = null, bestT = Infinity;
    const c = new THREE.Vector3();
    for (const n of this.npcs.values()) {
      c.copy(n.model.root.position); c.y += n.model.height * 0.55;
      if (ray.distanceToPoint(c) < n.model.height * 0.45) {
        const t = ray.origin.distanceTo(c);
        if (t < bestT) { bestT = t; best = n; }
      }
    }
    return best;
  }
}
