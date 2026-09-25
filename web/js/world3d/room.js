// Builds a playable room from an engine location view plus a layout (authored or procedural).
// The view decides what exists (exits, NPCs, features, services); the layout only decides where.
import * as THREE from "three";
import { CollisionWorld } from "./collision.js";
import { Builder, boxGeo } from "./builder.js";
import { PREFABS, glowSprite } from "./prefabs.js";
import { KITS, kitFor, mat } from "./materials.js";
import { makeField } from "./particles.js";
import { tex } from "./textures.js";

const T = 1.2;          // wall thickness
const CORRIDOR = 5;     // how far door corridors extend beyond the wall
const TRIGGER = 1.7;    // distance past the wall line where walking through an exit triggers travel
const SIDES = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const LIGHTS_BY_QUALITY = { low: 3, medium: 5, high: 8 };

const deg = (d) => (d * Math.PI) / 180;
// Yaw such that a model facing +z looks along (dx, dz).
export const yawTo = (dx, dz) => Math.atan2(dx, dz);

function evalCond(c, loc) {
  if (!c) return true;
  if (Array.isArray(c)) return c.every((x) => evalCond(x, loc));
  const ex = (id) => loc.exits.find((e) => e.to === id);
  if ("exit_open" in c) return !!ex(c.exit_open) && !ex(c.exit_open).locked;
  if ("exit_locked" in c) return !!ex(c.exit_locked)?.locked;
  if ("exit" in c) return !!ex(c.exit);
  if ("no_exit" in c) return !ex(c.no_exit);
  if ("feature" in c) return loc.features.some((f) => f.id === c.feature);
  if ("no_feature" in c) return !loc.features.some((f) => f.id === c.no_feature);
  if ("npc" in c) return loc.npcs.some((n) => n.id === c.npc);
  if ("no_npc" in c) return !loc.npcs.some((n) => n.id === c.no_npc);
  return true;
}

// What about the view can change the room's geometry without changing location.
export function roomSignature(loc, layout) {
  const conds = new Set();
  for (const p of layout.props || []) { if (p.when) conds.add(JSON.stringify(p.when)); for (const v of Object.values(p.set || {})) conds.add(JSON.stringify(v)); }
  const bits = [...conds].map((c) => (evalCond(JSON.parse(c), loc) ? 1 : 0)).join("");
  return `${loc.id}|${loc.exits.map((e) => e.to + (e.locked ? "L" : "")).join(",")}|${loc.features.map((f) => f.id).join(",")}|${bits}`;
}

export function buildRoom(loc, layout, { quality = "medium", pixelRatio = 1 } = {}) {
  const baseKit = kitFor(loc.biome);
  const kit = layout.kit && KITS[layout.kit] ? { ...baseKit, name: layout.kit, ...KITS[layout.kit], shape: baseKit.shape } : baseKit;
  const shape = layout.shape || kit.shape;
  const outdoor = !!kit.sky || ["terrace", "plaza", "glade"].includes(shape);
  const [W, D] = layout.size || [30, 26];
  const H = outdoor ? 0 : layout.height ?? 10;
  const R = Math.min(W, D) / 2;
  const col = new CollisionWorld();
  const b = new Builder({ col, quality });
  const room = {
    loc: loc.id, kit, shape, W, D, H, R, outdoor, col, layout,
    doors: {}, npcSpots: {}, featureSpots: {}, points: {}, labels: [], separate: {}, fields: [], tickers: [], lights: [],
  };
  const wallMat = layout.wall || kit.wall, floorMat = layout.floor || kit.floor, trimMat = kit.trim;

  // ---- exits: where each opening sits ----
  const exits = loc.exits.map((e) => ({ ...e, spec: layout.exits?.[e.to] || null }));
  const autoSides = ["n", "e", "w", "s"];
  let autoIdx = 0;
  const used = { n: [], s: [], e: [], w: [] };
  for (const e of exits) {
    const s = e.spec || {};
    const width = s.width ?? (outdoor ? 5 : 4);
    let cx, cz, ox, oz;
    if (shape === "round") {
      const a = deg(s.angle ?? ((autoIdx++ * 360) / Math.max(1, exits.length)));
      ox = Math.sin(a); oz = -Math.cos(a);
      cx = ox * R; cz = oz * R;
      e.angle = a;
    } else {
      let side = s.side;
      if (!side) { side = autoSides[autoIdx % 4]; autoIdx++; }
      const len = side === "n" || side === "s" ? W : D;
      let at = s.at;
      if (at === undefined) {
        const k = used[side].length;
        at = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.min(8, len / 4);
      }
      used[side].push(at);
      [ox, oz] = SIDES[side];
      if (side === "n" || side === "s") { cx = at; cz = (oz * D) / 2; } else { cx = (ox * W) / 2; cz = at; }
      e.side = side; e.at = at;
    }
    e.width = width;
    e.style = s.style || kit.door || "arch";
    e.dh = Math.min(outdoor ? 6 : H - 0.5, s.height ?? Math.max(4.2, width * 1.2));
    Object.assign(e, { cx, cz, ox, oz });
    room.doors[e.to] = {
      to: e.to, label: e.label, locked: e.locked, locked_text: e.locked_text, visited: e.visited,
      x: cx, z: cz, ox, oz, width,
      inside: { x: cx - ox * 3, z: cz - oz * 3 },
      trigger: { x: cx + ox * TRIGGER, z: cz + oz * TRIGGER },
      labelPos: new THREE.Vector3(cx - ox * 0.4, e.dh + 0.8, cz - oz * 0.4),
      barrier: s.barrier,
    };
  }

  // ---- floor & ceiling ----
  const pad = outdoor ? 60 : 2 * CORRIDOR + 2;
  if (shape === "round") {
    b.add(new THREE.CylinderGeometry(R + T, R + T, 0.4, 40), floorMat, 0, -0.2, 0);
    scaleUV(b.parts.get(floorMat).at(-1), (R + T) / 2);
  } else {
    b.add(boxGeo(W + 2 * T, 0.4, D + 2 * T, 2.5), floorMat, 0, -0.2, 0);
  }
  if (outdoor) {
    const g = boxGeo(W + pad * 2, 0.4, D + pad * 2, 3);
    b.add(g, layout.ground || floorMat, 0, -0.25, 0);
  }
  if (!outdoor) {
    if (shape === "round") b.add(new THREE.CylinderGeometry(R + T, R + T, 1, 40), kit.ceil || "rock_dark", 0, H + 0.5, 0);
    else b.box(kit.ceil || "rock_dark", W + 2 * T, 1, D + 2 * T, 0, H + 0.5, 0, 0, 0, 0, 3);
    if (shape === "hall" && layout.beams !== false) {
      for (let x = -W / 2 + 6; x < W / 2 - 3; x += 6) b.box(trimMat, 0.8, 0.9, D, x, H - 0.45, 0);
    }
    if (shape === "cavern") {
      for (let i = 0; i < Math.round((W * D) / 30); i++) {
        const x = (hashf(i, 1) - 0.5) * (W - 2), z = (hashf(i, 2) - 0.5) * (D - 2), h = 0.8 + hashf(i, 3) * 2.2;
        b.cone(kit.wall, 0.3 + hashf(i, 4) * 0.5, h, x, H - h / 2, z, 6, Math.PI);
      }
    }
  }

  // ---- walls with openings ----
  const wallH = outdoor ? 6 : H;
  if (shape === "round") {
    const N = Math.max(20, Math.round((Math.PI * 2 * R) / 3));
    const segA = (Math.PI * 2) / N;
    const chord = 2 * (R + T / 2) * Math.sin(segA / 2) + 0.15;
    for (let i = 0; i < N; i++) {
      const a = (i + 0.5) * segA;
      const blocked = exits.some((e) => angDiff(a, e.angle) < Math.asin(Math.min(1, (e.width / 2 + 0.2) / R)) + segA * 0.5);
      if (blocked) continue;
      const x = Math.sin(a) * (R + T / 2), z = -Math.cos(a) * (R + T / 2);
      const rot = -a;
      b.box(wallMat, chord, wallH, T, x, wallH / 2, z, rot);
      col.box(x, z, chord, T, rot, { cam: true, h: wallH });
      if (!outdoor) {
        b.box(trimMat, chord, 0.6, T + 0.3, x, 0.3, z, rot);
        b.box(trimMat, chord, 0.6, T + 0.3, x, wallH - 0.3, z, rot);
        if (kit.rune) b.add(boxGeo(chord, 0.35, T + 0.08, 0.35), layout.rune || kit.rune, x, 3.2, z, 0, rot, 0);
      }
    }
    for (const e of exits) {
      // Frame the gap so the missing wall segments read as a doorway.
      const a = e.angle, rot = -a;
      const x = Math.sin(a) * (R + T / 2), z = -Math.cos(a) * (R + T / 2);
      const halfA = Math.asin(Math.min(1, (e.width / 2 + 0.2) / R)) + segA * 0.5;
      const gapHalf = Math.max(e.width / 2 + 0.6, (R + T / 2) * Math.sin(halfA + segA * 0.5));
      for (const s of [-1, 1]) {
        const px = x + Math.cos(a) * s * gapHalf, pz = z + Math.sin(a) * s * gapHalf;
        const fw = Math.max(1, (gapHalf - e.width / 2) * 2 + 0.2);
        b.box(wallMat, fw, wallH, T, px, wallH / 2, pz, rot);
        col.box(px, pz, fw, T, rot, { cam: true, h: wallH });
      }
      if (!outdoor) b.box(wallMat, e.width + 0.4, wallH - e.dh, T, x, e.dh + (wallH - e.dh) / 2, z, rot);
    }
  } else {
    for (const side of ["n", "s", "e", "w"]) {
      const [ox, oz] = SIDES[side];
      const horiz = side === "n" || side === "s";
      const len = (horiz ? W : D) + 2 * T;
      const ops = exits.filter((e) => e.side === side).map((e) => [e.at - e.width / 2, e.at + e.width / 2, e]).sort((p, q) => p[0] - q[0]);
      let cur = -len / 2;
      const seg = (a0, a1) => {
        if (a1 - a0 < 0.05) return;
        const mid = (a0 + a1) / 2, l = a1 - a0;
        const x = horiz ? mid : (ox * (W + T)) / 2, z = horiz ? (oz * (D + T)) / 2 : mid;
        const w = horiz ? l : T, d = horiz ? T : l;
        wallPiece(b, room, x, z, w, d, wallH, side);
        col.box(x, z, w, d, 0, { cam: !outdoor || shape === "terrace", h: outdoor ? 30 : wallH });
      };
      for (const [a0, a1, e] of ops) {
        seg(cur, a0);
        cur = a1;
        if (!outdoor) {
          const x = horiz ? e.at : (ox * (W + T)) / 2, z = horiz ? (oz * (D + T)) / 2 : e.at;
          b.box(wallMat, horiz ? e.width : T, wallH - e.dh, horiz ? T : e.width, x, e.dh + (wallH - e.dh) / 2, z);
        }
      }
      seg(cur, len / 2);
    }
  }
  // Shape-specific dressing along the room edge.
  if (shape === "cavern") edgeScatter(b, room, exits, (x, z, i) => {
    const r = 1 + hashf(i, 9) * 1.4;
    b.rock(kit.wall, r, x, r * 0.6, z, i);
    col.circle(x, z, r * 0.8, { h: 3 });
  }, 2.6, 0.2);
  if (shape === "terrace") edgeScatter(b, room, exits, (x, z, i, rot) => {
    b.box("stone", 3.2, 1, 0.8, x, 0.5, z, rot);
    b.box("stone", 0.8, 0.5, 0.8, x, 1.25, z, rot);
  }, 3.2, -0.2);
  if (shape === "plaza") edgeScatter(b, room, exits, (x, z, i, rot) => {
    b.begin(x, z, (rot * 180) / Math.PI);
    PREFABS.house(b, { w: 6.5, h: 5 + hashf(i, 3) * 3, d: 5, mat: i % 3 ? "stone_pale" : "stone" });
    b.begin();
  }, 7.5, -2.8);
  if (shape === "glade") edgeScatter(b, room, exits, (x, z, i) => {
    b.begin(x, z, i * 47);
    PREFABS.tree(b, { h: 7 + hashf(i, 5) * 5, leaf: kit.trees || "foliage" });
    b.begin();
  }, 2.8, -1.2);

  // ---- corridors, frames, barriers ----
  for (const e of exits) buildDoor(b, room, e, outdoor, wallMat, trimMat);

  // ---- authored / generated props ----
  // Generated layouts don't know where doors end up, so props that would sit in a doorway lane are dropped.
  const lanes = layout.authored ? [] : exits.map((e) => ({ x: e.cx, z: e.cz, ox: e.ox, oz: e.oz, half: Math.max(1.3, e.width * 0.45) }));
  for (const p of layout.props || []) {
    if (!evalCond(p.when, loc)) continue;
    if (lanes.length && blocksLane(p, lanes)) continue;
    const fn = PREFABS[p.type];
    if (!fn) { console.warn("Unknown prefab", p.type); continue; }
    const q = { ...p };
    for (const [k, c] of Object.entries(p.set || {})) q[k] = evalCond(c, loc);
    const [x, z] = p.pos || [0, 0];
    if (p.separate) {
      const sb = new Builder({ col, quality });
      sb.begin(x, z, p.rot || 0, p.scale || 1, p.lift || 0);
      fn(sb, q);
      const g = sb.build({ shadows: quality === "high" });
      room.separate[p.name || p.type] = { group: g, prop: p };
      b.group.add(g);
      b.lights.push(...sb.lights); b.emitters.push(...sb.emitters); b.tickers.push(...sb.tickers);
    } else {
      // `lift` raises the whole prop; `y` is left to prefabs that use it for their own height.
      b.begin(x, z, p.rot || 0, p.scale || 1, p.lift || 0);
      fn(b, q);
    }
  }
  b.begin();
  if (!outdoor && ["hall", "round", "tunnel"].includes(shape) && layout.sconces !== false) sconces(b, room, exits);

  // ---- anchors: NPCs, features, services ----
  const taken = [];
  const free = (x, z, r = 1) => !col.blocked(x, z, r) && taken.every(([a, c]) => Math.hypot(a - x, c - z) > 2.2)
    && Object.values(room.doors).every((d) => Math.hypot(d.inside.x - x, d.inside.z - z) > 2.5);
  const findFree = (x, z, r = 1) => {
    for (let k = 0; k < 60; k++) {
      const a = k * 2.39996, d = k === 0 ? 0 : 0.8 + k * 0.35;
      const px = clampIn(x + Math.cos(a) * d, W, R, shape), pz = clampIn(z + Math.sin(a) * d, D, R, shape);
      if (free(px, pz, r)) return [px, pz];
    }
    return [x, z];
  };
  const auto = (i, n, frac) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.6;
    return shape === "round" ? [Math.sin(a) * R * frac, -Math.cos(a) * R * frac] : [Math.sin(a) * (W / 2) * frac, -Math.cos(a) * (D / 2) * frac];
  };
  loc.npcs.forEach((n, i) => {
    const s = layout.npcs?.[n.id];
    let [x, z] = s ? s : auto(i, loc.npcs.length, 0.45);
    if (!s) [x, z] = findFree(x, z, 0.9);
    const yaw = s && s[2] !== undefined ? deg(s[2]) : yawTo(-x, -z);
    room.npcSpots[n.id] = { x, z, yaw };
    taken.push([x, z]);
  });
  loc.features.forEach((f, i) => {
    const s = layout.features?.[f.id];
    if (s) { room.featureSpots[f.id] = { x: s.pos[0], z: s.pos[1], r: s.radius ?? 2.2, h: s.h ?? 1.6 }; taken.push(s.pos); return; }
    let [x, z] = auto(i + 0.5, loc.features.length, 0.7);
    [x, z] = findFree(x, z, 0.9);
    b.begin(x, z, 0); PREFABS.poi(b, {}); b.begin();
    room.featureSpots[f.id] = { x, z, r: 1.8, h: 1.4, auto: true };
    taken.push([x, z]);
  });
  const services = [];
  if (loc.shop) services.push(["shop", "stall"]);
  if (loc.rest) services.push(["rest", loc.rest === "camp" ? "campfire" : "cot"]);
  if (loc.respec) services.push(["respec", "altar"]);
  if (loc.can_travel) services.push(["travel", "map_table"]);
  services.forEach(([kind, prefab], i) => {
    const s = layout.points?.[kind];
    if (s) { room.points[kind] = { x: s[0], z: s[1], r: s[2] ?? 2.4 }; return; }
    let [x, z] = auto(i + 0.25, services.length, 0.62);
    [x, z] = findFree(x, z, 1.4);
    b.begin(x, z, (yawTo(-x, -z) * 180) / Math.PI);
    PREFABS[prefab](b, { lit: true, cloth: "cloth_blue" });
    b.begin();
    room.points[kind] = { x, z, r: 2.6 };
    taken.push([x, z]);
  });

  // ---- combat arena and spawn ----
  const ar = layout.arena;
  room.arena = ar ? { x: ar.pos[0], z: ar.pos[1], yaw: deg(ar.yaw ?? 0) } : { x: 0, z: 0, yaw: 0 };
  room.spawnFor = (prev, scenePos) => {
    if (scenePos && scenePos.loc === loc.id) {
      const p = { x: scenePos.x, z: scenePos.z };
      col.resolve(p, 0.45);
      return { x: p.x, z: p.z, yaw: scenePos.yaw || 0 };
    }
    const d = prev && room.doors[prev];
    if (d) return { x: d.inside.x, z: d.inside.z, yaw: yawTo(-d.ox, -d.oz) };
    const s = layout.spawn?.[prev] || layout.spawn?.default;
    if (s) return { x: s[0], z: s[1], yaw: deg(s[2] ?? 180) };
    const [x, z] = findFree(0, D * 0.25, 0.6);
    return { x, z, yaw: Math.PI };
  };

  // ---- build meshes ----
  const shadows = quality === "high";
  room.group = b.build({ shadows });
  room.tickers.push(...b.tickers);

  // ---- lights ----
  const lightDefs = [...b.lights, ...(layout.lights || []).map((l) => ({
    color: l.color, intensity: l.intensity, distance: l.distance ?? 18, x: l.pos[0], y: l.pos[1], z: l.pos[2], flicker: l.flicker || 0, shadow: !!l.shadow, prio: l.prio ?? l.intensity,
  }))];
  lightDefs.sort((p, q) => q.prio - p.prio);
  const maxLights = LIGHTS_BY_QUALITY[quality] ?? 5;
  let shadowUsed = false;
  for (const l of lightDefs.slice(0, maxLights)) {
    const pl = new THREE.PointLight(l.color, l.intensity, l.distance, 1.3);
    pl.position.set(l.x, l.y, l.z);
    if (shadows && l.shadow && !shadowUsed && !outdoor) {
      pl.castShadow = true; pl.shadow.mapSize.set(1024, 1024); pl.shadow.bias = -0.004; pl.shadow.camera.near = 0.5; pl.shadow.camera.far = l.distance;
      shadowUsed = true;
    }
    room.group.add(pl);
    room.lights.push({ light: pl, base: l.intensity, flicker: l.flicker, seed: Math.random() * 10 });
  }
  const [skyC, groundC, amb] = kit.ambient;
  // Indoor kits are tuned moody; the multiplier keeps them readable on dim displays.
  const ground = outdoor ? groundC : new THREE.Color(groundC).lerp(new THREE.Color(skyC), 0.35);
  room.group.add(new THREE.HemisphereLight(skyC, ground, (layout.ambient ?? amb) * (outdoor ? 1 : 2.2) * (quality === "low" ? 1.35 : 1)));
  if (kit.key) {
    const dl = new THREE.DirectionalLight(kit.key[0], kit.key[1]);
    dl.position.set(W * 0.4, 40, D * 0.3);
    dl.target.position.set(0, 0, 0);
    room.group.add(dl, dl.target);
    if (shadows) {
      dl.castShadow = true; dl.shadow.mapSize.set(2048, 2048);
      const s = Math.max(W, D) * 0.7;
      Object.assign(dl.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 120 });
      dl.shadow.bias = -0.0008;
    }
  }
  room.fog = layout.fog || kit.fog;
  room.sky = !!kit.sky;

  // ---- particles ----
  const fieldMul = quality === "low" ? 0.4 : quality === "high" ? 1.2 : 0.8;
  const fieldDefs = [...b.emitters];
  if (kit.particles) fieldDefs.push({ type: kit.particles, x: 0, y: 0, z: 0, area: [W, outdoor ? 12 : H, D], count: Math.round(Math.min(350, W * D * 0.18)) });
  for (const p of layout.particles || []) fieldDefs.push({ type: p.type, x: p.pos[0], y: p.pos[1] ?? 0, z: p.pos[2] ?? 0, area: p.area || [4, 4, 4], count: p.count });
  for (const e of fieldDefs) {
    const f = makeField(e.type, e, e.area, e.count ? Math.max(4, Math.round(e.count * fieldMul)) : null, pixelRatio);
    if (f) { room.group.add(f); room.fields.push(f); }
  }

  room.dispose = () => {
    room.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !o.material.name) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  };
  return room;
}

function scaleUV(g, k) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
}

function hashf(i, j) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function angDiff(a, b) {
  const d = Math.abs(((a - b) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.min(d, Math.PI * 2 - d);
}

function clampIn(v, size, R, shape) {
  const lim = (shape === "round" ? R : size / 2) - 1.5;
  return Math.max(-lim, Math.min(lim, v));
}

function wallPiece(b, room, x, z, w, d, h, side) {
  const { kit, outdoor, shape, layout } = room;
  if (outdoor) return; // outdoor edges are dressed by edgeScatter; the collider is invisible
  const wallMat = layout.wall || kit.wall;
  b.box(wallMat, w, h, d, x, h / 2, z, 0, 0, 0, shape === "cavern" ? 4 : 2);
  if (shape === "cavern") return;
  const [ox, oz] = SIDES[side];
  const inset = 0.15;
  const tx = x - ox * inset, tz = z - oz * inset;
  b.box(kit.trim, w, 0.6, d, tx, 0.3, tz);
  b.box(kit.trim, w, 0.7, d, tx, h - 0.35, tz);
  if (kit.rune) {
    const horiz = side === "n" || side === "s";
    b.add(boxGeo(horiz ? w : d + 0.1, 0.35, horiz ? d + 0.1 : w, 0.35), layout.rune || kit.rune, x - ox * 0.05, 3.2, z - oz * 0.05, 0, horiz ? 0 : Math.PI / 2, 0);
  }
  // Pilasters break up long walls.
  const horiz = side === "n" || side === "s";
  const len = horiz ? w : d;
  for (let a = -len / 2 + 3; a < len / 2 - 2; a += 6) {
    const px = horiz ? x + a : x - ox * 0.2, pz = horiz ? z - oz * 0.2 : z + a;
    b.box(kit.trim, horiz ? 1 : T + 0.4, h, horiz ? T + 0.4 : 1, px, h / 2, pz);
  }
}

const NO_FOOTPRINT = new Set(["mountains", "hanging_lamp", "rune_chains", "banner", "mural"]);

function blocksLane(p, lanes) {
  if (NO_FOOTPRINT.has(p.type)) return false;
  const [px, pz] = p.pos || [0, 0];
  const rect = p.w && p.d;
  const a = deg(p.rot || 0), ca = Math.cos(a), sa = Math.sin(a);
  const r = p.r ?? (p.type === "tree" ? 1.3 : p.w ? p.w / 2 : 1.1);
  for (const l of lanes) {
    for (let s = 0; s <= 7; s += 0.5) {
      const x = l.x - l.ox * s, z = l.z - l.oz * s;
      if (rect) {
        const dx = x - px, dz = z - pz;
        const u = dx * ca - dz * sa, v = dx * sa + dz * ca;
        if (Math.abs(u) < p.w / 2 + l.half && Math.abs(v) < p.d / 2 + l.half) return true;
      } else if (Math.hypot(x - px, z - pz) < r + l.half) return true;
    }
  }
  return false;
}

function edgeScatter(b, room, exits, place, step, inset) {
  const { W, D, shape, R } = room;
  const clear = room.layout.clear || [];
  const nearExit = (x, z) => exits.some((e) => Math.hypot(e.cx - x, e.cz - z) < e.width / 2 + step * 0.6 + 0.5)
    || clear.some(([cx, cz, r]) => Math.hypot(cx - x, cz - z) < r);
  let i = 0;
  if (shape === "round") {
    const n = Math.round((Math.PI * 2 * R) / step);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = Math.sin(a) * (R - inset), z = -Math.cos(a) * (R - inset);
      if (!nearExit(Math.sin(a) * R, -Math.cos(a) * R)) place(x, z, i++, -a);
    }
    return;
  }
  for (const side of ["n", "s", "e", "w"]) {
    const [ox, oz] = SIDES[side];
    const horiz = side === "n" || side === "s";
    const len = horiz ? W : D;
    for (let a = -len / 2 + step / 2; a <= len / 2 - step / 2 + 0.01; a += step) {
      const ex = horiz ? a : (ox * W) / 2, ez = horiz ? (oz * D) / 2 : a;
      if (nearExit(ex, ez)) continue;
      const x = ex - ox * inset, z = ez - oz * inset;
      place(x, z, i++, horiz ? (oz > 0 ? Math.PI : 0) : (ox > 0 ? -Math.PI / 2 : Math.PI / 2));
    }
  }
}

function buildDoor(b, room, e, outdoor, wallMat, trimMat) {
  const { col } = room;
  const rot = yawTo(e.ox, e.oz);      // local +z points out of the room
  const w = e.width, dh = e.dh;
  b.begin(e.cx, e.cz, (rot * 180) / Math.PI);
  if (outdoor) {
    b.box("dirt", w, 0.06, CORRIDOR * 2, 0, 0.02, CORRIDOR, 0, 0, 0, 2);
    for (const s of [-1, 1]) {
      b.box("wood_dark", 0.3, 3.2, 0.3, s * (w / 2 + 0.2), 1.6, 0.2);
      b.colBox(0.8, CORRIDOR * 2, s * (w / 2 + 0.4), CORRIDOR, 0, { h: 3 });
    }
    b.box("wood", w + 0.8, 0.5, 0.15, 0, 3.0, 0.2);
    b.colBox(w + 2, 0.5, 0, TRIGGER + 2.5, 0, { h: 3 });
  } else {
    // Short corridor that fades to black, with a frame styled to the region.
    b.box(room.layout.floor || room.kit.floor, w + 0.4, 0.4, CORRIDOR, 0, -0.2, CORRIDOR / 2 + T / 2, 0, 0, 0, 2.5);
    for (const s of [-1, 1]) {
      b.box(wallMat, T, dh, CORRIDOR, s * (w / 2 + T / 2), dh / 2, CORRIDOR / 2 + T / 2);
      b.colBox(T, CORRIDOR + T, s * (w / 2 + T / 2), CORRIDOR / 2, 0, { cam: true, h: dh });
    }
    b.box(wallMat, w + 2 * T, 0.8, CORRIDOR, 0, dh + 0.4, CORRIDOR / 2 + T / 2);
    b.box("void", w + 0.2, dh, 0.2, 0, dh / 2, CORRIDOR + T / 2);
    b.colBox(w + 0.5, 0.6, 0, CORRIDOR * 0.8, 0, { h: dh });
    const fade = new THREE.Mesh(new THREE.PlaneGeometry(w, dh),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
    b.dyn(fade, 0, dh / 2, CORRIDOR * 0.45 + T / 2, Math.PI);
    if (e.style === "stairs_down") {
      for (let i = 0; i < 6; i++) b.box(room.kit.trim, w, 0.3, 0.5, 0, -0.15 - i * 0.3, TRIGGER + 1.3 + i * 0.5);
    }
    if (e.style === "tunnel") {
      b.box("wood_dark", 0.35, dh, 0.35, -w / 2 + 0.1, dh / 2, -0.25); b.box("wood_dark", 0.35, dh, 0.35, w / 2 - 0.1, dh / 2, -0.25);
      b.box("wood_dark", w + 0.6, 0.45, 0.45, 0, dh - 0.1, -0.25);
    } else if (e.style === "round") {
      // Dwarven vault door: a rune-ringed disc that rolls aside once the exit is open.
      const r = Math.min(dh, w + 1) / 2 + 0.3;
      b.torus(trimMat, r + 0.35, 0.35, 0, r - 0.2, -T / 2 - 0.1, 0, 28);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.5, 32), mat("iron_dark"));
      disc.rotation.x = Math.PI / 2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.72, 0.08, 6, 32), mat(e.locked ? "rune_dead" : "rune"));
      ring.rotation.x = Math.PI / 2; ring.position.y = -0.27;
      disc.add(ring);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.22, 0.7, 12), mat("bronze"));
      disc.add(hub);
      b.dyn(disc, e.locked ? 0 : w / 2 + r - 0.2, r - 0.2, e.locked ? 0 : -T / 2 - 0.35);
    } else if (e.style === "gate") {
      b.box("bronze", 0.6, dh + 0.5, T + 0.6, -w / 2 - 0.3, (dh + 0.5) / 2, 0); b.box("bronze", 0.6, dh + 0.5, T + 0.6, w / 2 + 0.3, (dh + 0.5) / 2, 0);
      b.box("bronze", w + 1.8, 0.7, T + 0.6, 0, dh + 0.35, 0);
      b.add(boxGeo(w + 1.2, 0.35, 0.1, 0.35), room.kit.rune || "rune", 0, dh + 0.35, -T / 2 - 0.31);
    } else {
      b.box(trimMat, 0.8, dh, T + 0.5, -w / 2 - 0.4, dh / 2, 0); b.box(trimMat, 0.8, dh, T + 0.5, w / 2 + 0.4, dh / 2, 0);
      b.box(trimMat, w + 2.4, 0.9, T + 0.5, 0, dh + 0.1, 0);
      b.add(boxGeo(0.8, 0.9, 0.1, 0.9), room.kit.rune || "rune", 0, dh + 0.1, -T / 2 - 0.26);
    }
  }
  if (e.locked) {
    const style = room.doors[e.to].barrier || (e.style === "round" ? "none" : e.style === "tunnel" || outdoor ? "rubble" : "portcullis");
    if (style === "portcullis") {
      for (let x = -w / 2 + 0.25; x < w / 2; x += 0.45) b.box("iron_dark", 0.1, dh, 0.1, x, dh / 2, 0.6);
      for (let y = 0.8; y < dh; y += 1.2) b.box("iron_dark", w, 0.1, 0.1, 0, y, 0.6);
    } else if (style === "rubble") {
      PREFABS.rubble(b, { n: 14, area: [w * 1.2, 1.8], mat: "rock_dark" });
      for (let i = 0; i < 4; i++) b.rock("rock_dark", 0.8 + (i % 2) * 0.4, -w / 2 + 0.6 + i * (w / 3.5), 0.7, 0.6, i + 3);
    }
    b.colBox(w + 0.4, 0.8, 0, 0.6, 0, { cam: false, h: dh });
  }
  b.begin();
}

function sconces(b, room, exits) {
  const { W, D, shape, R, kit } = room;
  const warm = kit.name === "foundry" || kit.name === "mine" || kit.name === "interior";
  const m = warm ? "lamp_warm" : "aether";
  const color = warm ? "#ffb060" : "#8ff0ff";
  const put = (x, z, rot) => {
    b.begin(x, z, (rot * 180) / Math.PI);
    b.box("iron_dark", 0.3, 0.5, 0.4, 0, 4.2, 0.1);
    b.sphere(m, 0.13, 0, 4.55, 0.25, 6);
    b.begin();
    const s = glowSprite(color, 1.1, 0.5);
    s.position.set(x + Math.sin(rot) * 0.25, 4.55, z + Math.cos(rot) * 0.25);
    b.dynamic.add(s);
  };
  edgeScatter(b, room, exits, (x, z, i, rot) => put(x, z, rot), 6, 0.35);
}
