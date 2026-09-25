// Generic interaction registry. Anything the player can use in the world (NPCs, features, exits,
// shops, beds, altars, map tables) registers an entry whose activate() calls an existing engine
// action. The registry picks the best target in range, shows the prompt and highlights it.
import * as THREE from "three";
import { tex } from "./textures.js";

export class Interactions {
  constructor(scene, uiRoot) {
    this.list = [];
    this.current = null;
    this.menu = null;
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({
      map: tex("ring"), color: "#8ff0ff", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.ring.renderOrder = 3;
    scene.add(this.ring);
    this.prompt = document.createElement("div");
    this.prompt.className = "w3d-prompt";
    this.prompt.hidden = true;
    uiRoot.appendChild(this.prompt);
    this.menuEl = document.createElement("div");
    this.menuEl.className = "w3d-actmenu panel";
    this.menuEl.hidden = true;
    uiRoot.appendChild(this.menuEl);
    this.t = 0;
    this.promptKey = "";
  }

  set(list) {
    this.list = list;
    if (this.current && !list.find((i) => i.id === this.current.id)) this.current = null;
    else if (this.current) this.current = list.find((i) => i.id === this.current.id);
    if (this.menu && !list.find((i) => i.id === this.menu.id)) this.closeMenu();
  }

  update(dt, player, enabled) {
    this.t += dt;
    let best = null, bestScore = Infinity;
    if (enabled) {
      const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
      for (const it of this.list) {
        const dx = it.x - player.pos.x, dz = it.z - player.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > it.r) continue;
        const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
        const score = d - facing * 0.8 - (it.priority || 0);
        if (score < bestScore) { bestScore = score; best = it; }
      }
    }
    if (best !== this.current) { this.current = best; if (!best || best.id !== this.menu?.id) this.closeMenu(); }
    const it = this.current;
    if (it) {
      this.ring.visible = true;
      const r = it.ringR ?? Math.min(1.6, Math.max(0.7, it.r * 0.35));
      this.ring.position.set(it.x, 0.06, it.z);
      this.ring.scale.setScalar(r * (1 + 0.06 * Math.sin(this.t * 4)));
      this.ring.material.color.set(it.locked ? "#ff8a60" : it.kind === "npc" ? "#ffd36a" : "#8ff0ff");
      const key = `${it.id}|${it.verb}|${it.label}|${it.sub || ""}|${it.locked ? 1 : 0}`;
      if (key !== this.promptKey) {
        this.promptKey = key;
        this.prompt.replaceChildren(
          Object.assign(document.createElement("span"), { className: "key", textContent: "E" }),
          Object.assign(document.createElement("span"), { className: "verb", textContent: it.verb }),
          Object.assign(document.createElement("b"), { textContent: it.label }),
          ...(it.sub ? [Object.assign(document.createElement("div"), { className: "sub", textContent: it.sub })] : []));
        this.prompt.classList.toggle("locked", !!it.locked);
      }
      this.prompt.hidden = !!this.menu;
    } else {
      this.ring.visible = false;
      this.prompt.hidden = true;
      this.promptKey = "";
    }
  }

  activate(it = this.current) {
    if (!it) return false;
    if (it.actions && it.actions.length > 1) { this.openMenu(it); return true; }
    it.activate?.();
    return true;
  }

  openMenu(it) {
    this.menu = it;
    this.menuEl.replaceChildren(
      Object.assign(document.createElement("h4"), { textContent: it.label }),
      ...(it.sub ? [Object.assign(document.createElement("div"), { className: "muted sub", textContent: it.sub })] : []),
      ...it.actions.map((a, i) => {
        const b = document.createElement("button");
        b.className = "btn";
        b.innerHTML = `<span class="hk">${i + 1}</span> `;
        b.append(a.label);
        b.onclick = () => { this.closeMenu(); a.run(); };
        return b;
      }),
      Object.assign(document.createElement("div"), { className: "dim hint", textContent: "Number keys to choose · Esc to close" }));
    this.menuEl.hidden = false;
  }

  closeMenu() { this.menu = null; this.menuEl.hidden = true; }

  menuKey(e) {
    if (!this.menu) return false;
    if (e.key === "Escape") { this.closeMenu(); return true; }
    const n = parseInt(e.key, 10);
    const a = this.menu.actions[n - 1];
    if (a) { this.closeMenu(); a.run(); return true; }
    return false;
  }

  // Nearest entry to a screen ray (for click-to-interact).
  pick(ray) {
    let best = null, bestT = Infinity;
    const c = new THREE.Vector3();
    for (const it of this.list) {
      c.set(it.x, it.pickY ?? 1, it.z);
      const t = ray.origin.distanceTo(c);
      const d = ray.distanceToPoint(c);
      const rad = it.pickR ?? Math.max(0.8, Math.min(2.2, it.r * 0.45));
      if (d < rad && t < bestT) { best = it; bestT = t; }
    }
    return best;
  }

  dispose() { this.prompt.remove(); this.menuEl.remove(); this.ring.parent?.remove(this.ring); }
}
