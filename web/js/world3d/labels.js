// DOM labels anchored to 3D positions: nameplates, quest markers, exit signs, unit health bars and
// floating combat text. DOM keeps text crisp, accessible and styled by the existing CSS.
import * as THREE from "three";

const _v = new THREE.Vector3();

export class Labels {
  constructor(container) {
    this.root = document.createElement("div");
    this.root.className = "w3d-labels";
    container.appendChild(this.root);
    this.items = new Set();
    this.floats = [];
    this.occluder = null;
  }

  // anchor: Object3D (follows it) or Vector3. offsetY lifts the label above the anchor.
  add(el, anchor, { offsetY = 0, maxDist = 30, minScale = 0.6, occlude = false, cls = "" } = {}) {
    const wrap = document.createElement("div");
    wrap.className = "w3d-label " + cls;
    wrap.appendChild(el);
    this.root.appendChild(wrap);
    const item = { wrap, el, anchor, offsetY, maxDist, minScale, occlude, hidden: false };
    this.items.add(item);
    item.remove = () => { wrap.remove(); this.items.delete(item); };
    item.setHidden = (h) => { item.hidden = h; };
    return item;
  }

  clear() {
    for (const it of this.items) it.wrap.remove();
    this.items.clear();
    for (const f of this.floats) f.el.remove();
    this.floats = [];
  }

  float(pos, text, cls = "", dur = 1.2) {
    const el = document.createElement("div");
    el.className = "w3d-float " + cls;
    el.textContent = text;
    this.root.appendChild(el);
    this.floats.push({ el, pos: pos.clone(), t: 0, dur, dx: (Math.random() - 0.5) * 30 });
  }

  update(camera, w, h, dt, camPos) {
    for (const it of this.items) {
      if (it.hidden) { it.wrap.style.display = "none"; continue; }
      if (it.anchor.isObject3D) it.anchor.getWorldPosition(_v); else _v.copy(it.anchor);
      _v.y += it.offsetY;
      const dist = camera.position.distanceTo(_v);
      let visible = dist < it.maxDist;
      if (visible && it.occlude && this.occluder) {
        const t = this.occluder.raycast(camPos || camera.position, _v, 0.05);
        if (t < 0.97) visible = false;
      }
      _v.project(camera);
      if (!visible || _v.z > 1 || _v.z < -1) { it.wrap.style.display = "none"; continue; }
      const x = ((_v.x + 1) / 2) * w, y = ((1 - _v.y) / 2) * h;
      const s = Math.max(it.minScale, Math.min(1.1, 12 / Math.max(1, dist)));
      it.wrap.style.display = "";
      it.wrap.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${s.toFixed(3)})`;
      it.wrap.style.opacity = dist > it.maxDist * 0.75 ? String(Math.max(0, (it.maxDist - dist) / (it.maxDist * 0.25))) : "";
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      if (f.t >= f.dur) { f.el.remove(); this.floats.splice(i, 1); continue; }
      _v.copy(f.pos); _v.y += f.t * 0.9;
      _v.project(camera);
      if (_v.z > 1) { f.el.style.display = "none"; continue; }
      const k = f.t / f.dur;
      const x = ((_v.x + 1) / 2) * w + f.dx * k, y = ((1 - _v.y) / 2) * h;
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.6 : 1.2 - Math.min(0.2, (k - 0.12) * 0.5);
      f.el.style.display = "";
      f.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${pop.toFixed(3)})`;
      f.el.style.opacity = String(k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
    }
  }
}
