// Pooled visual effects and the rules that map engine combat events to them. Effects never decide
// outcomes: they only illustrate events the engine already resolved.
import * as THREE from "three";
import { tex } from "./textures.js";
import { tintModel } from "./characters.js";
import { glowSprite } from "./prefabs.js";

export const ELEMENT = {
  physical: ["#f2e8d4", "#ffffff"], fire: ["#ff7a2a", "#ffd070"], frost: ["#9fe3ff", "#ffffff"],
  lightning: ["#c8b8ff", "#fff7a0"], arcane: ["#6fe3ff", "#e0fbff"], poison: ["#7dff5a", "#d8ff9a"],
  shadow: ["#9a5cff", "#e0c0ff"], holy: ["#ffe08a", "#ffffff"], heal: ["#8dff9a", "#e8ffe8"], buff: ["#ffd36a", "#fff4c8"],
};
export const elementColor = (el) => (ELEMENT[el] || ELEMENT.physical)[0];

// Decide how an "act" event is presented. Returns {anim, delivery, color, color2, count}.
export function planAct(e, actorModel) {
  const el = e.element || "physical";
  const [c1, c2] = ELEMENT[el] || ELEMENT.physical;
  const id = (e.ability || "") + " " + (e.name || "").toLowerCase();
  const tg = e.targeting || "enemy";
  const spell = (e.tags || []).includes("spell");
  const plan = { anim: "attack", delivery: "melee", color: c1, color2: c2, element: el, targeting: tg };
  if (/heal|mend|salve|prayer|restor|renew|regenerat/.test(id) && tg !== "enemy" && tg !== "all_enemies") return { ...plan, anim: "cast", delivery: "heal", color: ELEMENT.heal[0], color2: ELEMENT.heal[1] };
  if (/summon|call|raise/.test(id) && (tg === "self" || tg === "none")) return { ...plan, anim: "cast", delivery: "summon" };
  if (tg === "self" || tg === "ally" || tg === "all_allies" || tg === "none") {
    if (/stealth|vanish|shadow|hide|smoke/.test(id)) return { ...plan, anim: "cast", delivery: "vanish", color: "#9a8cff" };
    if (/roar|shout|cry|rally|taunt|provoke|horn/.test(id)) return { ...plan, anim: "cheer", delivery: "shout", color: ELEMENT.buff[0] };
    return { ...plan, anim: "cast", delivery: "buff", color: spell ? c1 : ELEMENT.buff[0], color2: ELEMENT.buff[1] };
  }
  if (e.melee) return { ...plan, delivery: tg === "all_enemies" ? "cleave" : "melee" };
  const ranged = !spell && actorModel?.weaponKind === "bow";
  if (ranged || (!spell && el === "physical")) return { ...plan, anim: actorModel?.weaponKind === "bow" ? "shoot" : "attack", delivery: "arrow" };
  if (tg === "all_enemies") {
    if (el === "lightning") return { ...plan, anim: "cast", delivery: "chain" };
    if (el === "frost") return { ...plan, anim: "cast", delivery: "rain" };
    return { ...plan, anim: "cast", delivery: "nova" };
  }
  if (tg === "random_enemies") return { ...plan, anim: "cast", delivery: "volley" };
  if (el === "lightning") return { ...plan, anim: "cast", delivery: "beam" };
  return { ...plan, anim: "cast", delivery: "bolt" };
}

const PVERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
uniform float uPixel;
varying float vA; varying vec3 vC;
void main() {
  vA = aAlpha; vC = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixel * (300.0 / max(0.3, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const PFRAG = `
uniform sampler2D uTex; varying float vA; varying vec3 vC;
void main() { vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC * (0.6 + t.r * 0.8), t.a * vA); }`;

class Burst {
  constructor(scene, cap, pixel) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap); this.alpha = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.grav = new Float32Array(cap); this.drag = new Float32Array(cap); this.s0 = new Float32Array(cap);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: PVERT, fragmentShader: PFRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTex: { value: tex("spark") }, uPixel: { value: pixel } },
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }
  emit(p, v, color, size, life, grav = 0, drag = 1) {
    const i = this.next; this.next = (this.next + 1) % this.cap;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.size[i] = this.s0[i] = size; this.alpha[i] = 1; this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; } continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      const d = Math.pow(this.drag[i], dt * 60);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = k < 0.5 ? k * 2 : 1;
      this.size[i] = this.s0[i] * (0.4 + 0.6 * k);
    }
    for (const n of ["position", "aColor", "aSize", "aAlpha"]) this.geo.attributes[n].needsUpdate = true;
  }
}

const _c = new THREE.Color(), _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class FX {
  constructor(scene, labels, { pixelRatio = 1, onShake = null } = {}) {
    this.scene = scene;
    this.labels = labels;
    this.onShake = onShake;
    this.burstSys = new Burst(scene, 1800, pixelRatio);
    this.live = [];
    this.lights = [0, 1].map(() => { const l = new THREE.PointLight("#ffffff", 0, 12, 1.5); scene.add(l); return { l, t: 0, dur: 0, peak: 0 }; });
    this.lightIdx = 0;
    this.statusFx = new Map();
    this.speed = 1;
  }

  dispose() {
    this.scene.remove(this.burstSys.points);
    for (const o of this.live) this.scene.remove(o.obj);
    for (const L of this.lights) this.scene.remove(L.l);
    this.live = [];
  }

  update(dt) {
    this.burstSys.update(dt);
    for (let i = this.live.length - 1; i >= 0; i--) {
      const o = this.live[i];
      o.t += dt;
      const k = Math.min(1, o.t / o.dur);
      o.step?.(k, dt);
      if (k >= 1) { o.done?.(); this.scene.remove(o.obj); o.obj.traverse?.((x) => { if (x.geometry && !x.isSprite && !x.userData.keep) x.geometry.dispose(); if (x.material && !x.userData.keep) x.material.dispose?.(); }); this.live.splice(i, 1); }
    }
    for (const L of this.lights) {
      if (L.t < L.dur) { L.t += dt; const k = L.t / L.dur; L.l.intensity = L.peak * (1 - k) * (1 - k); } else L.l.intensity = 0;
    }
    for (const [model, s] of this.statusFx) s.tick?.(dt, model);
  }

  add(obj, dur, step, done) {
    this.scene.add(obj);
    const o = { obj, t: 0, dur: dur / this.speed, step, done };
    this.live.push(o);
    return o;
  }

  burst(pos, { color = "#ffffff", count = 20, speed = 3, size = 0.25, life = 0.6, gravity = 3, up = 1, drag = 0.93, spread = 1 } = {}) {
    _c.set(color);
    for (let i = 0; i < count; i++) {
      _v.set((Math.random() - 0.5) * 2 * spread, Math.random() * up, (Math.random() - 0.5) * 2 * spread).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.burstSys.emit(pos, _v, _c, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), gravity, drag);
    }
  }

  flash(pos, color, intensity = 20, dur = 0.35) {
    const L = this.lights[this.lightIdx++ % this.lights.length];
    L.l.color.set(color); L.l.position.copy(pos); L.peak = intensity; L.t = 0; L.dur = dur / this.speed;
  }

  shake(amount) { this.onShake?.(amount); }

  number(pos, text, cls) { this.labels.float(pos, text, cls, 1.25 / Math.max(0.5, this.speed)); }

  projectile(from, to, { color = "#ffffff", color2 = "#ffffff", size = 0.5, speed = 16, arc = 0.6, kind = "bolt" } = {}) {
    const g = new THREE.Group();
    if (kind === "arrow") {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 4), new THREE.MeshBasicMaterial({ color: "#6a4a2a" }));
      shaft.rotation.x = Math.PI / 2; g.add(shaft);
      const tip = glowSprite(color2, 0.25, 0.8); tip.position.z = 0.35; g.add(tip);
    } else {
      g.add(glowSprite(color, size * 2.2, 0.9));
      g.add(glowSprite(color2, size, 1));
    }
    const dist = from.distanceTo(to);
    const dur = Math.max(0.18, dist / speed);
    const a = from.clone(), b = to.clone();
    const mid = a.clone().lerp(b, 0.5); mid.y += dist * (kind === "arrow" ? 0.12 : arc * 0.25);
    const col = new THREE.Color(color);
    const prev = a.clone();
    return new Promise((resolve) => {
      this.add(g, dur, (k) => {
        const u = 1 - k;
        g.position.set(u * u * a.x + 2 * u * k * mid.x + k * k * b.x, u * u * a.y + 2 * u * k * mid.y + k * k * b.y, u * u * a.z + 2 * u * k * mid.z + k * k * b.z);
        if (kind === "arrow") g.lookAt(prev.clone().lerp(g.position, 2));
        prev.copy(g.position);
        if (kind !== "arrow") for (let i = 0; i < 2; i++) this.burstSys.emit(g.position, _w.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6), col, size * 0.7, 0.35, 0, 0.9);
      }, resolve);
    });
  }

  beam(from, to, { color = "#c8b8ff", width = 0.08, dur = 0.35, jag = true } = {}) {
    const pts = [];
    const n = jag ? 8 : 1;
    for (let i = 0; i <= n; i++) {
      const p = from.clone().lerp(to, i / n);
      if (jag && i > 0 && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5));
      pts.push(p);
    }
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[i + 1], len = a.distanceTo(b);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(width, width, len, 4, 1, true), m);
      c.position.copy(a).lerp(b, 0.5); c.lookAt(b); c.rotateX(Math.PI / 2);
      g.add(c);
    }
    this.add(g, dur, (k) => { m.opacity = 1 - k; });
    this.flash(to, color, 25, 0.25);
  }

  ring(pos, { color = "#ffffff", radius = 3, dur = 0.6, y = 0.08, width = 0.25 } = {}) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, map: tex("ring") });
    const r = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
    r.rotation.x = -Math.PI / 2; r.position.set(pos.x, pos.y + y, pos.z);
    this.add(r, dur, (k) => { r.scale.setScalar(0.2 + k * radius); m.opacity = 1 - k; });
  }

  slash(pos, facing, { color = "#ffffff", size = 1.1 } = {}) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const arc = new THREE.Mesh(new THREE.TorusGeometry(size, 0.06, 3, 20, Math.PI * 0.8), m);
    arc.position.copy(pos);
    arc.rotation.set(Math.random() * 0.8 - 0.4, facing, Math.PI * 0.6 + Math.random() * 0.6);
    this.add(arc, 0.28, (k) => { m.opacity = 1 - k; arc.scale.setScalar(0.8 + k * 0.4); });
  }

  column(pos, { color = "#ffd36a", height = 2.4, dur = 0.9, radius = 0.7 } = {}) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const c = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.2, height, 16, 1, true), m);
    c.position.set(pos.x, pos.y + height / 2, pos.z);
    this.add(c, dur, (k) => { m.opacity = 0.5 * Math.sin(Math.PI * k); c.rotation.y += 0.05; c.scale.set(1 - k * 0.3, 0.6 + k * 0.4, 1 - k * 0.3); });
    const col = new THREE.Color(color);
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      this.burstSys.emit(_v.set(pos.x + Math.cos(a) * radius, pos.y + Math.random() * 0.5, pos.z + Math.sin(a) * radius), _w.set(0, 1.5 + Math.random() * 2, 0), col, 0.25, 0.9, -0.5, 0.97);
    }
  }

  portal(pos, color = "#9a5cff") {
    this.ring(pos, { color, radius: 2.2, dur: 0.9 });
    this.column(pos, { color, height: 2.5, dur: 0.8, radius: 0.6 });
    this.burst(pos.clone().setY(pos.y + 1), { color, count: 30, speed: 3, gravity: 0 });
  }

  bubble(model, color = "#9fd8ff") {
    let s = this.statusFx.get(model)?.bubble;
    if (s) return;
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
    const sph = new THREE.Mesh(new THREE.IcosahedronGeometry(Math.max(0.8, model.height * 0.6), 2), m);
    sph.position.y = model.height * 0.5 / model.root.scale.y;
    sph.scale.divideScalar(model.root.scale.x);
    model.root.add(sph);
    this.entry(model).bubble = sph;
  }

  unbubble(model) {
    const e = this.statusFx.get(model);
    if (e?.bubble) { e.bubble.parent?.remove(e.bubble); e.bubble = null; }
  }

  entry(model) {
    let e = this.statusFx.get(model);
    if (!e) {
      e = { attach: {}, t: 0 };
      e.tick = (dt, m) => {
        e.t += dt;
        if (e.bubble) e.bubble.material.opacity = 0.14 + 0.06 * Math.sin(e.t * 4);
        for (const [id, a] of Object.entries(e.attach)) a.tick?.(e.t, dt, m);
      };
      this.statusFx.set(model, e);
    }
    return e;
  }

  // Persistent status visuals, keyed by engine status id.
  setStatuses(model, statuses) {
    const e = this.entry(model);
    const want = new Set(statuses.map((s) => s.id));
    for (const id of Object.keys(e.attach)) if (!want.has(id)) { e.attach[id].remove(); delete e.attach[id]; }
    for (const s of statuses) if (!e.attach[s.id]) e.attach[s.id] = this.makeStatus(model, s);
    const frozen = want.has("frozen"), stealth = want.has("stealthed") || want.has("shrouded");
    const chilled = want.has("chilled");
    tintModel(model.root, frozen || chilled ? "#9fe3ff" : "#ffffff", frozen ? 0.65 : chilled ? 0.3 : 0, stealth ? 0.35 : 1);
  }

  makeStatus(model, s) {
    const h = model.height / model.root.scale.y;
    const g = new THREE.Group();
    model.root.add(g);
    const col = new THREE.Color(elementColor(s.element) || "#ffffff");
    const remove = () => g.parent?.remove(g);
    const at = (y) => { model.root.getWorldPosition(_v); _v.y += y * model.root.scale.y; return _v; };
    switch (s.id) {
      case "burn": case "overheated": {
        const f = [0, 1, 2].map((i) => { const sp = glowSprite("#ff7a2a", 0.5, 0.7); sp.position.set(Math.cos(i * 2.1) * 0.25, h * (0.3 + i * 0.2), Math.sin(i * 2.1) * 0.25); g.add(sp); return sp; });
        return { remove, tick: (t) => { f.forEach((sp, i) => { sp.scale.setScalar(0.4 + 0.15 * Math.sin(t * 12 + i * 2)); }); if (Math.random() < 0.3) this.burstSys.emit(at(h * 0.5), _w.set((Math.random() - 0.5) * 0.4, 1.4, (Math.random() - 0.5) * 0.4), _c.set("#ff8a3a"), 0.2, 0.6, -0.5, 0.97); } };
      }
      case "poison": case "hexed": {
        const c = s.id === "poison" ? "#7dff5a" : "#b070ff";
        return { remove, tick: () => { if (Math.random() < 0.18) this.burstSys.emit(at(h * (0.2 + Math.random() * 0.6)), _w.set((Math.random() - 0.5) * 0.3, 0.8, (Math.random() - 0.5) * 0.3), _c.set(c), 0.22, 0.9, -0.3, 0.97); } };
      }
      case "bleed":
        return { remove, tick: () => { if (Math.random() < 0.12) this.burstSys.emit(at(h * 0.6), _w.set((Math.random() - 0.5) * 0.5, 0.2, (Math.random() - 0.5) * 0.5), _c.set("#c02020"), 0.15, 0.6, 6, 0.98); } };
      case "stunned": case "confused": case "sleep": {
        const stars = [0, 1, 2].map(() => { const sp = glowSprite(s.id === "sleep" ? "#a0c0ff" : "#ffe070", 0.22, 1); g.add(sp); return sp; });
        return { remove, tick: (t) => stars.forEach((sp, i) => { const a = t * 3 + i * 2.1; sp.position.set(Math.cos(a) * 0.35, h * 1.05 + Math.sin(t * 5 + i) * 0.05, Math.sin(a) * 0.35); }) };
      }
      case "frozen": {
        const ice = new THREE.Mesh(new THREE.IcosahedronGeometry(Math.max(0.6, h * 0.55), 0), new THREE.MeshStandardMaterial({ color: "#bfefff", transparent: true, opacity: 0.35, roughness: 0.1, flatShading: true }));
        ice.position.y = h * 0.45; ice.scale.y = 1.3; g.add(ice);
        return { remove };
      }
      case "charging": {
        const m = new THREE.MeshBasicMaterial({ color: "#ff5a2a", transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, map: tex("ring") });
        const r = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); r.rotation.x = -Math.PI / 2; r.position.y = 0.06; g.add(r);
        const R = model.radius / model.root.scale.x * 2.2;
        return { remove, tick: (t) => { r.scale.setScalar(R * (0.9 + 0.15 * Math.sin(t * 8))); m.opacity = 0.45 + 0.3 * Math.sin(t * 8); } };
      }
      case "mana_shield": case "guarded": case "stoneskin": case "plated": case "fortified": {
        const c = s.id === "mana_shield" ? "#6fe3ff" : s.id === "stoneskin" ? "#b8a890" : "#ffd36a";
        const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, map: tex("ring") });
        const r = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); r.rotation.x = -Math.PI / 2; r.position.y = 0.05; r.scale.setScalar(0.9); g.add(r);
        return { remove, tick: (t) => { r.rotation.z = t; } };
      }
      case "regen":
        return { remove, tick: () => { if (Math.random() < 0.1) this.burstSys.emit(at(0.2), _w.set((Math.random() - 0.5) * 0.6, 1, (Math.random() - 0.5) * 0.6), _c.set("#8dff9a"), 0.2, 0.9, -0.3, 0.97); } };
      default: {
        if (s.id === "stealthed" || s.id === "shrouded") return { remove };
        const c = s.kind === "buff" ? "#ffd36a" : s.kind === "debuff" ? "#c080ff" : "#8ff0ff";
        const orb = glowSprite(c, 0.18, 0.8);
        g.add(orb);
        const seed = Math.random() * 6;
        return { remove, tick: (t) => { orb.position.set(Math.cos(t * 1.5 + seed) * 0.45, h * 0.9, Math.sin(t * 1.5 + seed) * 0.45); } };
      }
    }
  }

  clearStatuses(model) {
    const e = this.statusFx.get(model);
    if (!e) return;
    for (const a of Object.values(e.attach)) a.remove();
    this.unbubble(model);
    tintModel(model.root, "#ffffff", 0, 1);
    this.statusFx.delete(model);
  }
}
