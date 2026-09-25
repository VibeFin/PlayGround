// Prop catalogue. Each prefab draws itself into a Builder in local space (metres, y up, facing +z)
// and registers its colliders, lights, particle emitters and animations.
import * as THREE from "three";
import { tex } from "./textures.js";
import { mat } from "./materials.js";
import { boxGeo, cylGeo } from "./builder.js";

const TAU = Math.PI * 2;

export function glowSprite(color, size = 1, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex("glow"), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.set(size, size, size);
  return s;
}

function flame(color = "#ff9a3a", size = 0.8) {
  const g = new THREE.Group();
  const outer = glowSprite(color, size * 1.6, 0.8);
  const inner = glowSprite("#fff0c0", size * 0.7, 0.9);
  outer.position.y = size * 0.4; inner.position.y = size * 0.25;
  g.add(outer, inner);
  g.userData.flicker = (t, seed = 0) => {
    const f = 0.85 + 0.15 * Math.sin(t * 13 + seed) * Math.sin(t * 7.3 + seed * 2);
    outer.scale.set(size * 1.6 * f, size * 1.9 * f, 1);
    inner.scale.setScalar(size * 0.7 * (0.9 + 0.1 * Math.sin(t * 17 + seed)));
  };
  return g;
}

function hangingChain(b, x, z, top, bottom, m = "iron_dark") {
  const len = top - bottom;
  b.cyl(m, 0.035, 0.035, len, x, bottom + len / 2, z, 4);
}

export const PREFABS = {
  pillar(b, p) {
    const h = p.h ?? 8, w = p.w ?? 1.4;
    b.box(p.mat || "stone", w + 0.6, 0.6, w + 0.6, 0, 0.3, 0);
    b.box(p.mat || "stone", w, h - 1.4, w, 0, 0.6 + (h - 1.4) / 2, 0);
    b.box(p.trim || "stone_dark", w + 0.8, 0.8, w + 0.8, 0, h - 0.4, 0);
    if (p.rune !== false) b.add(boxGeo(w + 0.06, 0.45, w + 0.06, 0.45), p.rune_mat || "rune", 0, 2.6, 0);
    b.colBox(w + 0.6, w + 0.6, 0, 0, 0, { cam: true, h });
  },
  column(b, p) {
    const h = p.h ?? 7, r = p.r ?? 0.55;
    b.cyl(p.mat || "stone", r + 0.25, r + 0.35, 0.5, 0, 0.25, 0, 10);
    b.cyl(p.mat || "stone", r, r, h - 1, 0, 0.5 + (h - 1) / 2, 0, 12);
    b.cyl(p.trim || "stone_dark", r + 0.35, r + 0.1, 0.5, 0, h - 0.25, 0, 10);
    b.colCircle(r + 0.3, 0, 0, { cam: true, h });
  },
  anvil(b, p) {
    b.box("stone_dark", 1.0, 0.35, 0.8, 0, 0.175, 0);
    b.box("iron_dark", 0.34, 0.4, 0.32, 0, 0.55, 0);
    b.box("iron", 0.95, 0.2, 0.36, 0, 0.85, 0);
    b.cone("iron", 0.14, 0.45, 0.68, 0.85, 0, 8, 0, -Math.PI / 2);
    b.colBox(1.1, 0.9, 0, 0, 0, { h: 1 });
  },
  anvil_ring(b, p) {
    const n = p.n ?? 12, R = p.radius ?? 6;
    for (let i = 0; i < n + 1; i++) {
      const a = (i / (n + 1)) * TAU + (p.phase ?? 0) * (Math.PI / 180);
      const x = Math.sin(a) * R, z = Math.cos(a) * R;
      b.box("stone_dark", 1.6, 0.3, 1.3, x, 0.15, z, a);
      if (i === n) {
        // The thirteenth plinth: bare, its surface worn smooth where an anvil used to stand.
        b.box("stone_pale", 1.0, 0.12, 0.7, x, 0.36, z, a);
        b.col.circle(b.world(x, z).x, b.world(x, z).z, 0.8 * b.scale, { h: 0.5 });
        continue;
      }
      b.box("iron_dark", 0.32, 0.45, 0.3, x, 0.52, z, a);
      b.box("iron", 1.0, 0.2, 0.38, x, 0.84, z, a);
      const hx = x + Math.cos(a) * 0.62, hz = z - Math.sin(a) * 0.62;
      b.cone("iron", 0.14, 0.45, hx, 0.84, hz, 8, 0, -Math.PI / 2, a);
      b.col.circle(b.world(x, z).x, b.world(x, z).z, 0.85 * b.scale, { h: 1 });
    }
  },
  furnace_column(b, p) {
    const r = p.r ?? 2.4, h = p.h ?? 16;
    b.cyl("stone_dark", r + 1.3, r + 1.6, 1.2, 0, 0.6, 0, 8);
    b.add(cylGeo(r + 1.34, r + 1.5, 0.4, 16, 0.4, true), "rune", 0, 0.7, 0);
    b.cyl("iron_dark", r + 0.9, r + 1.1, 0.5, 0, 1.45, 0, 16);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      b.instance("bar", () => new THREE.CylinderGeometry(0.09, 0.09, 1, 6), "iron_dark", Math.sin(a) * (r + 0.6), 1.7 + (h - 2) / 2, Math.cos(a) * (r + 0.6), 0, 0, 0, 1, h - 2, 1);
    }
    for (const y of [2.2, 5, 8.5, 12, h - 0.5]) b.torus("bronze", r + 0.65, 0.14, 0, y, 0);
    b.cyl("iron_dark", r * 0.8, r + 0.9, 1.4, 0, h + 0.5, 0, 16);
    b.cyl("iron_dark", r * 0.5, r * 0.5, 12, 0, h + 7, 0, 12);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.7, h - 3, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: "#7feaff", transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    b.dyn(core, 0, 1.7 + (h - 3) / 2, 0);
    const heart = glowSprite("#9ff4ff", r * 3.2, 0.9);
    b.dyn(heart, 0, 3.5, 0);
    const halo = glowSprite("#ffb070", r * 5, 0.35);
    b.dyn(halo, 0, 2.2, 0);
    b.tick((t) => {
      const f = 1 + 0.06 * Math.sin(t * 2.1) + 0.03 * Math.sin(t * 7.7);
      core.scale.set(f, 1, f); core.rotation.y = t * 0.4;
      core.material.opacity = 0.45 + 0.12 * Math.sin(t * 3.3);
      heart.material.opacity = 0.75 + 0.2 * Math.sin(t * 2.6);
    });
    b.light("#8ae8ff", 60, 34, 0, 4, 0, { flicker: 0.06, shadow: true, prio: 100 });
    b.light("#ff9a50", 18, 14, 0, 1.8, 0, { flicker: 0.15, prio: 40 });
    b.emit("motes", 0, 2, 0, [r * 2, h, r * 2], 90);
    b.emit("embers", 0, 1.5, 0, [r * 3, 3, r * 3], 40);
    b.colCircle(r + 1.5, 0, 0, { cam: true, h: 30 });
  },
  forge(b, p) {
    const w = p.w ?? 3;
    b.box("stone_dark", w, 1.1, 1.8, 0, 0.55, 0);
    b.box("ember_dim", w - 0.6, 0.12, 1.2, 0, 1.12, 0);
    b.box("stone", w + 0.2, 0.4, 2, 0, 3.3, -0.1);
    b.box("stone", 0.3, 2.2, 1.8, -w / 2 + 0.15, 2.2, 0);
    b.box("stone", 0.3, 2.2, 1.8, w / 2 - 0.15, 2.2, 0);
    b.cyl("stone_dark", 0.6, 0.9, 3, 0, 5, -0.3, 8);
    b.box("leather", 0.9, 0.3, 0.6, w / 2 + 0.6, 0.9, 0.2);
    const f = flame("#ff8a30", 0.6);
    b.dyn(f, 0, 1.15, 0);
    b.tick((t) => f.userData.flicker(t, p.pos?.[0] || 0));
    b.light("#ff8a3a", 10, 9, 0, 1.8, 0.6, { flicker: 0.25 });
    b.emit("embers", 0, 1.4, 0, [w * 0.6, 2, 0.8], 18);
    b.colBox(w + 0.2, 2, 0, 0, 0, { cam: false, h: 4 });
  },
  stall(b, p) {
    const w = p.w ?? 3.6, d = p.d ?? 1.8, cloth = p.cloth || "cloth_red";
    b.box("wood", w, 1, d * 0.6, 0, 0.5, d * 0.2);
    for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) b.box("wood_dark", 0.14, 2.6, 0.14, x, 1.3, z);
    b.box(cloth, w + 0.4, 0.06, d + 0.6, 0, 2.7, 0.1, 0, 0.18);
    for (let i = 0; i < (p.goods ?? 4); i++) {
      const x = -w / 2 + 0.5 + (i * (w - 1)) / Math.max(1, (p.goods ?? 4) - 1);
      if (i % 2) b.box(i % 3 ? "iron" : "bronze", 0.4, 0.25, 0.3, x, 1.13, d * 0.2);
      else b.cyl(i % 4 ? "copper" : "leather", 0.14, 0.18, 0.35, x, 1.18, d * 0.2, 8);
    }
    b.colBox(w + 0.3, d, 0, 0, 0, { h: 1.2 });
  },
  lamp(b, p) {
    const h = p.h ?? 3.2, color = p.color || "#8ff0ff";
    b.box("stone_dark", 0.6, 0.3, 0.6, 0, 0.15, 0);
    b.cyl("iron_dark", 0.07, 0.09, h, 0, h / 2, 0, 6);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.78; b.box("iron_dark", 0.04, 0.55, 0.04, Math.sin(a) * 0.22, h + 0.25, Math.cos(a) * 0.22); }
    b.box("iron_dark", 0.55, 0.06, 0.55, 0, h + 0.55, 0);
    b.sphere(color === "#8ff0ff" ? "aether" : "lamp_warm", 0.14, 0, h + 0.25, 0, 8);
    b.dyn(glowSprite(color, 1.3, 0.6), 0, h + 0.25, 0);
    if (p.light) b.light(color, p.intensity ?? 6, p.distance ?? 9, 0, h + 0.2, 0, { flicker: 0.05 });
    b.colCircle(0.35, 0, 0, { h });
  },
  hanging_lamp(b, p) {
    const y = p.y ?? 5, top = p.top ?? 12, color = p.color || "#ffcf80";
    hangingChain(b, 0, 0, top, y + 0.4);
    b.cyl("iron_dark", 0.3, 0.2, 0.15, 0, y + 0.35, 0, 8);
    b.sphere(color === "#8ff0ff" ? "aether" : "lamp_warm", 0.2, 0, y, 0, 8);
    b.dyn(glowSprite(color, 1.8, 0.55), 0, y, 0);
    if (p.light) b.light(color, p.intensity ?? 8, p.distance ?? 12, 0, y - 0.2, 0, { flicker: 0.04 });
  },
  brazier(b, p) {
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; b.cyl("iron_dark", 0.04, 0.05, 1.1, Math.sin(a) * 0.3, 0.5, Math.cos(a) * 0.3, 5, Math.cos(a) * 0.3, -Math.sin(a) * 0.3); }
    b.cyl("iron", 0.5, 0.3, 0.3, 0, 1.05, 0, 10);
    b.cyl("ember_dim", 0.44, 0.44, 0.05, 0, 1.18, 0, 10);
    const f = flame(p.color || "#ff9a3a", 0.7);
    b.dyn(f, 0, 1.2, 0);
    b.tick((t) => f.userData.flicker(t, (p.pos?.[0] || 0) * 3));
    if (p.light !== false) b.light(p.color || "#ff9a4a", p.intensity ?? 9, p.distance ?? 10, 0, 1.9, 0, { flicker: 0.3 });
    b.emit("embers", 0, 1.5, 0, [0.6, 2.5, 0.6], 10);
    b.colCircle(0.5, 0, 0, { h: 1.3 });
  },
  vat(b, p) {
    const r = p.r ?? 1.5, h = p.h ?? 3;
    b.cyl("copper", r, r * 1.05, h, 0, h / 2 + 0.3, 0, 16);
    b.cyl("iron_dark", r * 1.1, r * 1.1, 0.3, 0, 0.15, 0, 16);
    for (const y of [0.8, h * 0.5 + 0.3, h]) b.torus("iron_dark", r * 1.04, 0.06, 0, y, 0);
    b.cone("copper", r * 1.02, 1, 0, h + 0.8, 0, 16);
    b.cyl("copper", 0.12, 0.12, 3, 0, h + 2.6, 0, 8);
    b.cyl("copper", 0.1, 0.1, r + 1, r / 2 + 0.3, h * 0.4, 0, 8, 0, Math.PI / 2);
    b.colCircle(r + 0.2, 0, 0, { cam: true, h: h + 1 });
  },
  barrel(b, p) {
    const x = 0, z = 0;
    b.cyl("wood", 0.4, 0.36, 1, x, 0.5, z, 10);
    b.torus("iron_dark", 0.41, 0.03, x, 0.25, z, Math.PI / 2, 12);
    b.torus("iron_dark", 0.41, 0.03, x, 0.75, z, Math.PI / 2, 12);
    b.colCircle(0.45, 0, 0, { h: 1 });
  },
  barrels(b, p) {
    const n = p.n ?? 4;
    for (let i = 0; i < n; i++) {
      const x = (i % 3) * 0.85 - 0.85, z = Math.floor(i / 3) * 0.85;
      b.cyl("wood", 0.4, 0.36, 1, x, 0.5, z, 10);
      b.torus("iron_dark", 0.41, 0.03, x, 0.25, z, Math.PI / 2, 12);
      b.torus("iron_dark", 0.41, 0.03, x, 0.75, z, Math.PI / 2, 12);
      b.colCircle(0.45, x, z, { h: 1 });
    }
  },
  crates(b, p) {
    const n = p.n ?? 3;
    for (let i = 0; i < n; i++) {
      const s = 0.7 + ((i * 37) % 5) * 0.08, x = (i % 2) * 0.9 - 0.45, z = Math.floor(i / 4) * 0.9, y = (Math.floor(i / 2) % 2) * 0.75;
      b.box("wood", s, s, s, x, y + s / 2, z, i * 0.3, 0, 0, 1);
    }
    b.colBox(1.9, 1.8, 0, 0.3, 0, { h: 1.5 });
  },
  table(b, p) {
    const w = p.w ?? 2.4;
    b.box("wood", w, 0.12, 1.1, 0, 0.85, 0);
    for (const [x, z] of [[-w / 2 + 0.2, -0.4], [w / 2 - 0.2, -0.4], [-w / 2 + 0.2, 0.4], [w / 2 - 0.2, 0.4]]) b.box("wood_dark", 0.12, 0.8, 0.12, x, 0.4, z);
    for (const z of [-0.95, 0.95]) { b.box("wood", w, 0.08, 0.4, 0, 0.48, z); b.box("wood_dark", 0.1, 0.45, 0.3, -w / 2 + 0.3, 0.22, z); b.box("wood_dark", 0.1, 0.45, 0.3, w / 2 - 0.3, 0.22, z); }
    for (let i = 0; i < 3; i++) b.cyl("copper", 0.07, 0.06, 0.18, -w / 3 + i * (w / 3), 1, (i % 2 ? 0.2 : -0.2), 8);
    b.colBox(w + 0.2, 2.3, 0, 0, 0, { h: 1 });
  },
  bar_counter(b, p) {
    const w = p.w ?? 6;
    b.box("wood_dark", w, 1.1, 0.8, 0, 0.55, 0);
    b.box("wood", w + 0.2, 0.1, 1, 0, 1.15, 0);
    for (let i = 0; i < Math.floor(w / 1.2); i++) b.cyl("copper", 0.07, 0.06, 0.2, -w / 2 + 0.6 + i * 1.2, 1.3, 0.1, 8);
    b.colBox(w + 0.2, 1, 0, 0, 0, { h: 1.2 });
  },
  shelf(b, p) {
    const w = p.w ?? 3, h = p.h ?? 3;
    b.box("wood_dark", w, h, 0.5, 0, h / 2, 0);
    const colors = ["cloth_red", "cloth_blue", "cloth_green", "cloth_tan", "leather", "cloth_purple"];
    for (let r = 0; r < 4; r++) {
      const y = 0.4 + r * (h - 0.4) / 4;
      b.box("wood", w - 0.1, 0.05, 0.45, 0, y, 0.05);
      for (let i = 0; i < 8; i++) b.box(colors[(i + r * 3) % colors.length], (w - 0.4) / 9, 0.45 + ((i * 7 + r) % 3) * 0.07, 0.34, -w / 2 + 0.3 + i * (w - 0.4) / 8, y + 0.26, 0.1, 0, 0, (i % 5 === 4) * 0.2);
    }
    b.colBox(w, 0.6, 0, 0, 0, { h, cam: false });
  },
  lectern(b, p) {
    b.box("wood_dark", 0.5, 1.1, 0.5, 0, 0.55, 0);
    b.box("wood", 0.8, 0.08, 0.6, 0, 1.2, 0, 0, -0.35);
    b.box("paper", 0.6, 0.04, 0.45, 0, 1.25, 0, 0, -0.35);
    b.colCircle(0.45, 0, 0, { h: 1.3 });
  },
  rune_chains(b, p) {
    const n = p.n ?? 10, [w, d] = p.area || [8, 8], top = p.top ?? 12, dead = p.dead ?? 0.35;
    const stones = [];
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const x = (r() - 0.5) * w, z = (r() - 0.5) * d, y = 2.6 + r() * 3;
      hangingChain(b, x, z, top, y + 0.5);
      const isDead = r() < dead;
      const m = new THREE.MeshStandardMaterial({ color: "#2a2724", emissive: isDead ? "#1a3a44" : "#6fe3ff", emissiveIntensity: isDead ? 0.4 : 1.4, roughness: 0.6,
        emissiveMap: tex("runes", { srgb: false }), map: tex("runes") });
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.5), m);
      b.dyn(s, x, y, z, r() * 3);
      stones.push({ s, m, isDead, seed: r() * 10, base: s.position.clone() });
    }
    b.tick((t) => {
      for (const o of stones) {
        o.s.position.x = o.base.x + Math.sin(t * 0.6 + o.seed) * 0.05;
        o.s.rotation.y += 0.002;
        if (o.isDead) o.m.emissiveIntensity = Math.max(0.1, 0.4 + (Math.sin(t * 9 + o.seed * 5) > 0.93 ? 1.2 : 0) - 0.2 * Math.sin(t + o.seed));
        else o.m.emissiveIntensity = 1.2 + 0.3 * Math.sin(t * 1.4 + o.seed);
      }
    });
  },
  gate(b, p) {
    const w = p.w ?? 7, h = p.h ?? 8;
    b.box("stone_dark", w + 2, h + 1.5, 1.4, 0, (h + 1.5) / 2, -0.3);
    b.box("bronze", w / 2 - 0.05, h, 0.4, -w / 4, h / 2, 0.45);
    b.box("bronze", w / 2 - 0.05, h, 0.4, w / 4, h / 2, 0.45);
    for (const y of [1.5, h / 2, h - 1.5]) b.box("iron_dark", w, 0.25, 0.1, 0, y, 0.7);
    b.add(boxGeo(w, 0.6, 0.1, 0.6), "rune_gold", 0, h * 0.62, 0.7);
    b.colBox(w + 2, 1.6, 0, 0, 0, { cam: true, h: h + 2 });
  },
  statue(b, p) {
    const h = p.h ?? 6, m = p.mat || "stone_pale";
    b.box("stone_dark", 2.2, 1.2, 2.2, 0, 0.6, 0);
    b.cyl(m, 0.9, 1.1, h * 0.35, 0, 1.2 + h * 0.175, 0, 8);
    b.box(m, 1.9, h * 0.3, 1.2, 0, 1.2 + h * 0.5, 0);
    b.sphere(m, 0.5, 0, 1.2 + h * 0.72, 0, 8);
    b.cone(m, 0.55, h * 0.28, 0, 1.2 + h * 0.52, 0.45, 6, Math.PI, 0);
    b.cyl(m, 0.1, 0.1, h * 0.4, 0.9, 1.2 + h * 0.62, 0.3, 6, 0, 0.3);
    b.box(m, 0.9, 0.5, 0.5, 1.05, 1.2 + h * 0.82, 0.3, 0, 0, 0.3);
    b.colBox(2.4, 2.4, 0, 0, 0, { cam: true, h: h + 1 });
  },
  chasm(b, p) {
    const w = p.w ?? 12, d = p.d ?? 5, bw = p.bridge ?? 3;
    b.box("void", w, 0.02, d, 0, 0.01, 0, 0, 0, 0, 0);
    for (const s of [-1, 1]) {
      b.box("rock_dark", w, 1.5, 0.3, 0, -0.74, s * (d / 2 - 0.15));
      const segW = (w - bw) / 2;
      b.colBox(segW, d, s * (bw / 2 + segW / 2), 0, 0, { h: 1 });
    }
    b.box("wood", bw, 0.2, d + 0.6, 0, 0.05, 0);
    for (let i = 0; i < Math.ceil(d / 0.5); i++) b.box("wood_dark", bw, 0.04, 0.06, 0, 0.17, -d / 2 + i * 0.5);
    for (const s of [-1, 1]) {
      b.box("wood_dark", 0.12, 0.12, d + 0.6, s * bw / 2, 1.0, 0);
      for (let i = 0; i <= 4; i++) b.box("wood_dark", 0.12, 1.0, 0.12, s * bw / 2, 0.5, -d / 2 - 0.3 + i * (d + 0.6) / 4);
    }
    b.emit("dust", 0, -1, 0, [w, 3, d], 25);
  },
  rails(b, p) {
    const len = p.len ?? 12;
    for (let i = 0; i < len / 0.9; i++) b.box("wood_dark", 1.5, 0.08, 0.2, 0, 0.04, -len / 2 + i * 0.9);
    for (const x of [-0.5, 0.5]) b.box("iron", 0.08, 0.1, len, x, 0.12, 0);
  },
  cart(b, p) {
    b.box("iron_dark", 1.2, 0.8, 1.8, 0, 0.75, 0);
    b.box("rock_dark", 1.0, 0.3, 1.6, 0, 1.2, 0);
    for (const [x, z] of [[-0.62, -0.6], [0.62, -0.6], [-0.62, 0.6], [0.62, 0.6]]) b.cyl("iron", 0.25, 0.25, 0.1, x, 0.3, z, 10, 0, Math.PI / 2);
    b.colBox(1.4, 2, 0, 0, 0, { h: 1.3 });
  },
  supports(b, p) {
    const w = p.w ?? 5, h = p.h ?? 4.5;
    b.box("wood_dark", 0.35, h, 0.35, -w / 2, h / 2, 0);
    b.box("wood_dark", 0.35, h, 0.35, w / 2, h / 2, 0);
    b.box("wood_dark", w + 0.6, 0.4, 0.4, 0, h, 0);
    b.box("wood_dark", 0.2, 1.4, 0.2, -w / 2 + 0.5, h - 0.6, 0, 0, 0, -0.8);
    b.box("wood_dark", 0.2, 1.4, 0.2, w / 2 - 0.5, h - 0.6, 0, 0, 0, 0.8);
    b.colCircle(0.3, -w / 2, 0, { h }); b.colCircle(0.3, w / 2, 0, { h });
  },
  rubble(b, p) {
    const n = p.n ?? 8, [w, d] = p.area || [3, 2];
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996, rr = Math.sqrt(i / n);
      const s = 0.2 + ((i * 13) % 7) * 0.08;
      b.instance("rock", () => new THREE.DodecahedronGeometry(1, 0), p.mat || "rock", Math.cos(a) * rr * w / 2, s * 0.5, Math.sin(a) * rr * d / 2, a, a * 2, 0, s, s * 0.7, s);
    }
    if (p.solid) b.colBox(w * 0.8, d * 0.8, 0, 0, 0, { h: 1 });
  },
  boulder(b, p) {
    const r = p.r ?? 1.4;
    b.rock(p.mat || "rock", r, 0, r * 0.5, 0, p.seed ?? 1);
    b.colCircle(r * 0.9, 0, 0, { cam: r > 1.5, h: r });
  },
  breach(b, p) {
    const w = p.w ?? 4;
    b.box("void", w * 0.7, 2.6, 0.2, 0, 1.4, -0.2);
    for (let i = 0; i < 10; i++) b.rock("rock", 0.35 + (i % 3) * 0.2, -w / 2 + (i / 9) * w, 0.2 + (i % 4) * 0.8, 0.1, i);
    for (let i = 0; i < 5; i++) b.box("aether", 0.05, 0.7 + (i % 2) * 0.5, 0.05, -w * 0.35 + i * 0.4, 1.2 + (i % 3) * 0.6, 0.05, 0, 0, (i - 2) * 0.4);
    b.dyn(glowSprite("#6fe3ff", 2.5, 0.35), 0, 1.5, 0.2);
    b.emit("dust", 0, 1, 0.6, [w, 2, 1], 15);
    PREFABS.rubble(b, { n: 10, area: [w + 1, 1.6], solid: true });
  },
  crystals(b, p) {
    const n = p.n ?? 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, h = 0.6 + ((i * 7) % 5) * 0.25;
      b.add(new THREE.OctahedronGeometry(0.25, 0), "aether_crystal", Math.cos(a) * 0.4, h * 0.5, Math.sin(a) * 0.4, Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4, 1, h * 2.2, 1);
    }
    b.dyn(glowSprite("#6fe3ff", 2.4, 0.4), 0, 0.8, 0);
    if (p.light !== false) b.light("#6fe3ff", 5, 7, 0, 1, 0, { flicker: 0.08 });
    b.colCircle(0.7, 0, 0, { h: 1.5 });
  },
  tent(b, p) {
    b.cone(p.cloth || "cloth_tan", 2.2, 2.8, 0, 1.4, 0, 4, 0, 0, Math.PI / 4);
    b.box("void", 0.9, 1.3, 0.05, 0, 0.65, 1.1, 0, -0.45);
    b.cyl("wood_dark", 0.05, 0.05, 3.2, 0, 1.6, 0, 5);
    b.colCircle(1.7, 0, 0, { h: 2.5 });
  },
  campfire(b, p) {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; b.rock("rock_dark", 0.18, Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55, i); }
    for (let i = 0; i < 3; i++) b.cyl("wood_dark", 0.07, 0.07, 0.9, 0, 0.12, 0, 5, Math.PI / 2, 0, (i / 3) * Math.PI);
    if (p.lit) {
      const f = flame("#ff8a30", 0.7);
      b.dyn(f, 0, 0.2, 0);
      b.tick((t) => f.userData.flicker(t, 3));
      b.light("#ff8a3a", 10, 10, 0, 1.2, 0, { flicker: 0.3 });
      b.emit("embers", 0, 0.6, 0, [0.6, 2, 0.6], 12);
    }
    b.colCircle(0.7, 0, 0, { h: 0.5 });
  },
  mural(b, p) {
    const w = p.w ?? 8, h = p.h ?? 4, y = p.y ?? 1.5;
    b.box("stone_dark", w + 0.6, h + 0.6, 0.2, 0, y + h / 2, -0.1);
    const g = new THREE.PlaneGeometry(w, h);
    b.add(g, "mural", 0, y + h / 2, 0.01);
  },
  bells(b, p) {
    const n = p.n ?? 4, w = n * 1.4;
    b.box("wood_dark", 0.3, 4, 0.3, -w / 2, 2, 0); b.box("wood_dark", 0.3, 4, 0.3, w / 2, 2, 0);
    b.box("wood_dark", w + 0.6, 0.35, 0.35, 0, 4, 0);
    const bells = [];
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.7 + i * ((w - 1.4) / Math.max(1, n - 1));
      const s = 1 - i * 0.12;
      const bell = new THREE.Group();
      const m = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.45, 0], [0.42, 0.1], [0.3, 0.5], [0.25, 0.8], [0, 0.85]].map(([x, y]) => new THREE.Vector2(x, y)), 14), mat("bronze"));
      m.position.y = -0.95; bell.add(m);
      b.dyn(bell, x, 3.8, 0);
      bell.scale.multiplyScalar(s);
      bells.push({ bell, seed: i });
    }
    b.tick((t) => { for (const o of bells) o.bell.rotation.z = Math.sin(t * 0.8 + o.seed) * 0.03; });
    b.colBox(w + 0.6, 0.8, 0, 0, 0, { h: 4 });
  },
  round_door(b, p) {
    const r = p.r ?? 3;
    b.box("stone_dark", r * 2 + 2, r * 2 + 1.5, 1.2, 0, r + 0.75, -0.2);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.6, 32), mat("iron_dark"));
    disc.rotation.x = Math.PI / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.75, 0.08, 6, 32), mat(p.open ? "rune" : "rune_dead"));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.31;
    disc.add(ring);
    const group = new THREE.Group();
    group.add(disc);
    b.dyn(group, p.open ? r * 1.9 : 0, r, 0.5);
    if (p.open) b.box("void", r * 1.8, r * 1.8, 0.1, 0, r, 0.45);
    b.colBox(r * 2 + 2, 1.4, 0, 0, 0, { cam: true, h: r * 2 + 1 });
  },
  sentinel(b, p) {
    // Kneeling iron giant; shown before the fight. The 3D combat model takes over once battle starts.
    const m = "iron_dark";
    b.box("stone_dark", 5, 0.6, 5, 0, 0.3, 0);
    b.box(m, 2.6, 2.4, 1.6, 0, 3.2, 0, 0, 0.25);
    b.box(m, 1.2, 1, 1.1, 0, 4.9, 0.3);
    b.box(m, 1.1, 1.2, 2.2, -0.9, 1.2, 0.5); b.box(m, 1.1, 1.2, 2.2, 0.9, 1.2, -0.3);
    b.box(m, 0.9, 2.6, 0.9, -1.9, 2.4, 0.4, 0, 0.3); b.box(m, 0.9, 2.6, 0.9, 1.9, 2.4, 0.4, 0, 0.3);
    b.sphere("aether_dim", 0.35, 0, 3.4, 0.85, 8);
    b.colCircle(2.4, 0, 0, { cam: true, h: 5 });
  },
  wreck(b, p) {
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = 0.8 + (i % 4) * 0.6;
      b.box("iron_dark", 0.8 + (i % 3) * 0.4, 0.3 + (i % 2) * 0.5, 0.9, Math.cos(a) * r, 0.25, Math.sin(a) * r, a, a * 0.3, a * 0.2);
    }
    b.box("iron_dark", 1.2, 1, 1.1, 0.4, 0.5, -0.4, 0.4, 0, 0.9);
    b.colCircle(1.8, 0, 0, { h: 1 });
  },
  cradle(b, p) {
    b.cyl("stone_dark", 2.4, 2.6, 0.5, 0, 0.25, 0, 20);
    b.torus("rune", 2.0, 0.07, 0, 0.52, 0);
    for (const s of [-1, 1]) b.torus("bronze", 1.3, 0.12, s * 0.6, 1.6, 0, 0, 16, Math.PI / 2);
    b.box("bronze", 2, 0.2, 0.8, 0, 0.7, 0);
    b.colCircle(2.5, 0, 0, { h: 1 });
  },
  dais(b, p) {
    const r = p.r ?? 3;
    b.cyl("stone_dark", r, r + 0.3, 0.4, 0, 0.2, 0, 24);
    b.torus(p.rune || "rune", r - 0.4, 0.06, 0, 0.41, 0);
  },
  pipes(b, p) {
    const len = p.len ?? 10, n = p.n ?? 3;
    for (let i = 0; i < n; i++) {
      const y = 1.2 + i * 0.6;
      b.cyl(i % 2 ? "copper" : "iron", 0.15, 0.15, len, 0, y, 0, 8, 0, Math.PI / 2);
      for (let k = 0; k < len / 3; k++) b.torus("iron_dark", 0.17, 0.04, -len / 2 + 1 + k * 3, y, 0, 0, 10, Math.PI / 2);
    }
  },
  valves(b, p) {
    const n = p.n ?? 4, wheels = [];
    b.box("iron_dark", n * 1.3 + 0.6, 2.6, 0.5, 0, 1.3, -0.2);
    for (let i = 0; i < n; i++) {
      const x = -((n - 1) * 1.3) / 2 + i * 1.3;
      b.cyl("copper", 0.12, 0.12, 1.4, x, 2.4, 0.2, 8);
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 6, 16), mat("bronze"));
      b.dyn(w, x, 1.5, 0.3);
      wheels.push(w);
    }
    b.tick((t) => wheels.forEach((w, i) => { w.rotation.z = Math.sin(t * 0.3 + i) * 0.2; }));
    b.emit("steam", 0, 2.6, 0.3, [n * 1.3, 1, 0.5], 14);
    b.colBox(n * 1.3 + 0.6, 1, 0, 0, 0, { h: 2.6 });
  },
  slag_pit(b, p) {
    const w = p.w ?? 6, d = p.d ?? 3;
    b.box("slag", w, 0.1, d, 0, 0.03, 0, 0, 0, 0, 3);
    b.box("iron_dark", w + 0.4, 0.5, 0.2, 0, 0.25, d / 2 + 0.1); b.box("iron_dark", w + 0.4, 0.5, 0.2, 0, 0.25, -d / 2 - 0.1);
    b.box("iron_dark", 0.2, 0.5, d, w / 2 + 0.1, 0.25, 0); b.box("iron_dark", 0.2, 0.5, d, -w / 2 - 0.1, 0.25, 0);
    b.light("#ff6a1a", 12, 10, 0, 1, 0, { flicker: 0.2 });
    b.emit("embers", 0, 0.3, 0, [w, 2, d], 30);
    b.colBox(w + 0.4, d + 0.4, 0, 0, 0, { h: 0.5 });
  },
  war_machine(b, p) {
    const top = p.top ?? 14, y = p.y ?? 6;
    hangingChain(b, -1, 0, top, y + 1.5); hangingChain(b, 1, 0, top, y + 1.5);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 1.8), mat("bronze")); g.add(body);
    for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 0.5), mat("iron_dark")); arm.position.set(s * 1.5, -0.9, 0); arm.rotation.z = s * 0.3; g.add(arm); }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), mat("ember_dim")); eye.position.set(0, 0.3, 0.92); g.add(eye);
    b.dyn(g, 0, y, 0);
    b.tick((t) => { g.rotation.y = Math.sin(t * 0.2 + y) * 0.15; g.rotation.z = Math.sin(t * 0.4) * 0.03; });
  },
  heart_furnace(b, p) {
    const r = p.r ?? 3.5, lit = p.lit !== false;
    b.cyl("stone_red", r + 1, r + 1.4, 2, 0, 1, 0, 12);
    b.cyl("iron_dark", r, r + 0.5, 6, 0, 5, 0, 12);
    b.cyl("iron_dark", r * 0.5, r, 3, 0, 9.5, 0, 12);
    b.cyl("iron_dark", r * 0.45, r * 0.45, 10, 0, 16, 0, 10);
    b.box(lit ? "ember" : "ember_dim", r * 1.2, 1.8, 0.2, 0, 3, r + 0.35);
    b.torus(lit ? "rune_gold" : "rune_dead", r * 0.55, 0.15, 0, 5.5, r + 0.45, 0);
    if (lit) {
      b.light("#ff7a2a", 40, 24, 0, 3, r + 1.5, { flicker: 0.2, shadow: true, prio: 90 });
      b.emit("embers", 0, 3, r + 1, [r * 1.5, 4, 1.5], 50);
      b.dyn(glowSprite("#ff8a3a", r * 3, 0.5), 0, 3, r + 0.6);
    }
    b.colCircle(r + 1.4, 0, 0, { cam: true, h: 20 });
  },
  cold_furnace(b, p) {
    b.box("stone_dark", 3, 2.6, 2.4, 0, 1.3, 0);
    b.box("void", 1.4, 1.2, 0.1, 0, 1.1, 1.21);
    b.cyl("stone_dark", 0.6, 1, 3, 0, 4, -0.2, 8);
    b.colBox(3.2, 2.6, 0, 0, 0, { h: 3 });
  },
  tap(b, p) {
    b.box("wood_dark", 1.4, 1, 1, 0, 0.5, 0);
    b.cyl("wood", 0.6, 0.6, 1.4, 0, 1.6, 0, 12, 0, Math.PI / 2);
    for (const x of [-0.5, 0.5]) b.torus("iron_dark", 0.62, 0.04, x, 1.6, 0, 0, 14, Math.PI / 2);
    b.cyl("bronze", 0.05, 0.05, 0.4, 0, 1.4, 0.7, 6, Math.PI / 2);
    b.cyl("bronze", 0.05, 0.05, 0.2, 0, 1.5, 0.9, 6);
    b.colBox(1.6, 1.4, 0, 0, 0, { h: 2.2 });
  },
  notice_board(b, p) {
    b.box("wood_dark", 0.15, 2.4, 0.15, -1, 1.2, 0); b.box("wood_dark", 0.15, 2.4, 0.15, 1, 1.2, 0);
    b.box("wood", 2.4, 1.4, 0.1, 0, 1.7, 0);
    for (let i = 0; i < 6; i++) b.box("paper", 0.4, 0.5, 0.02, -0.85 + (i % 3) * 0.8 + ((i * 13) % 3) * 0.05, 1.4 + Math.floor(i / 3) * 0.6, 0.07, 0, 0, (i - 2) * 0.05);
    b.colBox(2.4, 0.4, 0, 0, 0, { h: 2.4 });
  },
  banner(b, p) {
    const h = p.h ?? 5, y = p.y ?? 3;
    b.box("iron_dark", 1.8, 0.1, 0.1, 0, y + h, 0.2);
    b.add(new THREE.PlaneGeometry(1.5, h), p.cloth || "cloth_red", 0, y + h / 2, 0.2);
    b.add(new THREE.CircleGeometry(0.4, 12), "gold", 0, y + h * 0.65, 0.22);
  },
  parapet(b, p) {
    const len = p.len ?? 10;
    b.box("stone", len, 1, 0.7, 0, 0.5, 0);
    for (let i = 0; i < len / 1.5; i++) b.box("stone", 0.7, 0.5, 0.7, -len / 2 + 0.35 + i * 1.5, 1.25, 0);
    b.colBox(len, 0.8, 0, 0, 0, { h: 1.4 });
  },
  map_table(b, p) {
    b.box("wood_dark", 2.2, 0.9, 1.4, 0, 0.45, 0);
    b.box("paper", 2, 0.02, 1.2, 0, 0.92, 0);
    for (let i = 0; i < 5; i++) b.cyl("cloth_red", 0.03, 0.03, 0.15, -0.8 + i * 0.4, 1.0, (i % 2 ? 0.2 : -0.3), 5);
    b.colBox(2.3, 1.5, 0, 0, 0, { h: 1 });
  },
  bench(b, p) {
    const w = p.w ?? 2;
    b.box("wood", w, 0.1, 0.5, 0, 0.5, 0);
    b.box("wood_dark", 0.1, 0.5, 0.4, -w / 2 + 0.2, 0.25, 0); b.box("wood_dark", 0.1, 0.5, 0.4, w / 2 - 0.2, 0.25, 0);
    b.colBox(w, 0.6, 0, 0, 0, { h: 0.6 });
  },
  cot(b, p) {
    b.box("wood_dark", 1, 0.4, 2.1, 0, 0.2, 0);
    b.box("cloth_tan", 0.9, 0.15, 1.9, 0, 0.47, 0);
    b.box("cloth_red", 0.9, 0.05, 1.2, 0, 0.56, 0.3);
    b.colBox(1.1, 2.2, 0, 0, 0, { h: 0.6 });
  },
  altar(b, p) {
    b.box("stone_dark", 1.8, 1, 1.1, 0, 0.5, 0);
    b.box("stone_pale", 2, 0.15, 1.3, 0, 1.05, 0);
    b.add(new THREE.OctahedronGeometry(0.3, 0), "aether_crystal", 0, 1.6, 0, 0, 0, 0, 1, 1.6, 1);
    const g = glowSprite("#8ff0ff", 1.6, 0.5); b.dyn(g, 0, 1.6, 0);
    b.tick((t) => { g.material.opacity = 0.4 + 0.2 * Math.sin(t * 2); });
    b.colBox(2, 1.3, 0, 0, 0, { h: 1.6 });
  },
  poi(b, p) {
    b.cyl("stone_dark", 0.5, 0.6, 0.9, 0, 0.45, 0, 8);
    b.add(new THREE.OctahedronGeometry(0.18, 0), p.lit === false ? "rune_dead" : "aether_crystal", 0, 1.15, 0);
    b.colCircle(0.6, 0, 0, { h: 1 });
  },
  shaft_pit(b, p) {
    const r = p.r ?? 4;
    b.cyl("void", r, r, 0.05, 0, 0.02, 0, 28);
    b.torus("iron_dark", r + 0.1, 0.06, 0, 1.0, 0, Math.PI / 2, 32);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; b.cyl("iron_dark", 0.05, 0.05, 1, Math.cos(a) * (r + 0.1), 0.5, Math.sin(a) * (r + 0.1), 5); }
    b.cyl("rock_dark", r + 0.4, r + 0.4, 0.3, 0, -0.14, 0, 28, 0, 0);
    b.emit("motes", 0, -2, 0, [r * 1.5, 6, r * 1.5], 30);
    b.dyn(glowSprite("#6fe3ff", r * 2, 0.15), 0, -3, 0);
    b.colCircle(r + 0.2, 0, 0, { h: 1 });
  },
  hearth(b, p) {
    b.box("stone", 3.2, 3, 1.2, 0, 1.5, 0);
    b.box("void", 1.8, 1.3, 0.1, 0, 0.75, 0.61);
    b.box("ember_dim", 1.6, 0.1, 0.6, 0, 0.1, 0.4);
    const f = flame("#ff9a3a", 0.6); b.dyn(f, 0, 0.2, 0.5);
    b.tick((t) => f.userData.flicker(t, 11));
    b.light("#ff9a4a", 10, 10, 0, 1, 1.2, { flicker: 0.3 });
    b.colBox(3.3, 1.3, 0, 0, 0, { h: 3 });
  },
  scaffold(b, p) {
    const w = p.w ?? 4, h = p.h ?? 4;
    for (const [x, z] of [[-w / 2, -0.6], [w / 2, -0.6], [-w / 2, 0.6], [w / 2, 0.6]]) b.box("wood_dark", 0.15, h, 0.15, x, h / 2, z);
    b.box("wood", w + 0.3, 0.1, 1.4, 0, h, 0);
    b.box("wood_dark", w, 0.1, 0.1, 0, h * 0.5, 0.6, 0, 0, 0.4);
    b.colBox(w + 0.3, 1.4, 0, 0, 0, { h });
  },
  tree(b, p) {
    const h = p.h ?? 7, m = p.leaf || "foliage";
    b.cyl("bark", 0.25, 0.45, h * 0.6, 0, h * 0.3, 0, 7);
    for (let i = 0; i < 3; i++) b.add(new THREE.IcosahedronGeometry(h * (0.28 - i * 0.05), 0), m, Math.sin(i * 2.1) * 0.6, h * (0.62 + i * 0.14), Math.cos(i * 2.1) * 0.6, i, i * 2, 0);
    b.colCircle(0.5, 0, 0, { cam: true, h });
  },
  bush(b, p) {
    b.add(new THREE.IcosahedronGeometry(0.8, 0), p.leaf || "foliage", 0, 0.5, 0, 0, 0, 0, 1.3, 0.8, 1.1);
  },
  house(b, p) {
    const w = p.w ?? 6, h = p.h ?? 5, d = p.d ?? 5;
    b.box(p.mat || "stone_pale", w, h, d, 0, h / 2, 0);
    b.add(new THREE.CylinderGeometry(0.01, d * 0.72, w + 0.6, 4, 1), p.roof || "wood_dark", 0, h + d * 0.35, 0, 0, 0, Math.PI / 2, 1, 1, 0.72);
    b.box("wood_dark", 1.2, 2.2, 0.1, 0, 1.1, d / 2 + 0.03);
    for (const x of [-w / 3, w / 3]) b.box("lamp_warm", 0.8, 0.9, 0.05, x, h * 0.6, d / 2 + 0.03);
    b.colBox(w, d, 0, 0, 0, { cam: true, h: h + 2 });
  },
  well(b, p) {
    b.cyl("stone", 1, 1.1, 0.9, 0, 0.45, 0, 12);
    b.cyl("void", 0.8, 0.8, 0.02, 0, 0.91, 0, 12);
    b.box("wood_dark", 0.15, 2.2, 0.15, -0.9, 1.1, 0); b.box("wood_dark", 0.15, 2.2, 0.15, 0.9, 1.1, 0);
    b.box("wood_dark", 2, 0.15, 0.15, 0, 2.2, 0);
    b.colCircle(1.1, 0, 0, { h: 1 });
  },
  water_pool(b, p) {
    const w = p.w ?? 8, d = p.d ?? 6;
    b.box("water", w, 0.05, d, 0, 0.04, 0, 0, 0, 0, 4);
    if (p.solid !== false) b.colBox(w, d, 0, 0, 0, { h: 0.3 });
  },
  gravestone(b, p) {
    b.box("stone_dark", 0.8, 1.1, 0.2, 0, 0.55, 0, 0, 0, (p.tilt ?? 0.05));
    b.colBox(0.9, 0.4, 0, 0, 0, { h: 1 });
  },
  sarcophagus(b, p) {
    b.box("stone_dark", 1.2, 0.9, 2.4, 0, 0.45, 0);
    b.box("stone_pale", 1.3, 0.2, 2.5, 0, 1, 0);
    b.colBox(1.4, 2.6, 0, 0, 0, { h: 1.2 });
  },
  pylon(b, p) {
    const h = p.h ?? 4;
    b.cyl("iron_dark", 0.6, 0.8, 0.6, 0, 0.3, 0, 6);
    b.add(new THREE.OctahedronGeometry(0.5, 0), "aether_crystal", 0, h * 0.6, 0, 0, 0, 0, 1, h * 0.5, 1);
    b.dyn(glowSprite("#8ff0ff", 2.5, 0.45), 0, h * 0.6, 0);
    b.light("#6fe3ff", 6, 9, 0, h * 0.6, 0, { flicker: 0.1 });
    b.colCircle(0.8, 0, 0, { h });
  },
  mountains(b, p) {
    const R = p.r ?? 110, n = p.n ?? 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (i % 3) * 0.1, h = 30 + ((i * 17) % 5) * 12;
      b.cone("rock", 26 + (i % 4) * 6, h, Math.cos(a) * R, h / 2 - 4, Math.sin(a) * R, 5, 0, 0, a);
      b.cone("stone_pale", (26 + (i % 4) * 6) * 0.3, h * 0.3, Math.cos(a) * R, h - 4 - h * 0.15 + 0.5, Math.sin(a) * R, 5, 0, 0, a);
    }
  },
};

export const PREFAB_NAMES = Object.keys(PREFABS);
