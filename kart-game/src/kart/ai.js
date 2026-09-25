/**
 * ai.js — AI opponents: pure-pursuit centerline following + rubber-banding
 * (Agent 3 ownership).
 *
 * Headless-safe: pure math, no DOM, no THREE. Centerline is an array of
 * { x, z } (or [x, z] pairs). If trackData.json / world module is missing,
 * falls back to an oval so logic never crashes.
 */

import { KartPhysics, normalizeInput } from './physics.js';

export const AI_COUNT = 7;
export const AI_NAMES = ['Mario', 'Luigi', 'Peach', 'Bowser', 'Yoshi', 'Toad', 'Wario'];
export const AI_COLORS = [0xe33e2b, 0x2fbf4a, 0xff7fc0, 0x5a3b1e, 0x35c759, 0x3fa7ff, 0xffc93f];

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function toXZ(p) {
  if (!p) return { x: 0, z: 0 };
  if (Array.isArray(p)) return { x: p[0] ?? 0, z: p[2] ?? p[1] ?? 0 };
  return { x: p.x ?? 0, z: p.z ?? p.y ?? 0 };
}

/** Fallback oval centerline (rx × rz ellipse, counterclockwise). */
export function makeOvalCenterline(n = 72, rx = 95, rz = 65, cx = 0, cz = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rx, z: cz + Math.sin(a) * rz });
  }
  return pts;
}

/**
 * Normalize trackData.json shapes into [{x,z}, ...].
 * Accepts: array of [x,z] / {x,z} / {x,y,z} (incl. THREE.Vector3-likes),
 * or { centerline: [...] }, { points: [...] }, { path: [...] },
 * or { controlPoints: [[x,y,z],...] } (upsampled with Catmull-Rom, since
 * 13 coarse points are too sparse for pure-pursuit).
 */
export function parseCenterline(data) {
  if (!data) return null;
  if (Array.isArray(data.controlPoints)) {
    return upsampleControlPoints(data.controlPoints, 16);
  }
  const raw = Array.isArray(data) ? data : data.centerline || data.points || data.path || null;
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const pts = raw.map(toXZ).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
  return pts.length >= 4 ? pts : null;
}

/**
 * Upsample closed-loop control points ([x,y,z] or {x,z}) with uniform
 * Catmull-Rom into a dense centerline. Pure math — headless-safe.
 */
export function upsampleControlPoints(control, samplesPerSegment = 16) {
  const cps = (Array.isArray(control) ? control : []).map(toXZ)
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
  if (cps.length < 4) return cps.length ? cps : null;
  const n = cps.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = cps[(i - 1 + n) % n];
    const p1 = cps[i];
    const p2 = cps[(i + 1) % n];
    const p3 = cps[(i + 2) % n];
    for (let j = 0; j < samplesPerSegment; j++) {
      const t = j / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t
          + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
          + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t
          + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2
          + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      });
    }
  }
  return out;
}

/**
 * Try to load a centerline from common locations. Never throws —
 * returns the oval fallback when anything is missing/unavailable.
 * In headless node tests without fetch, returns fallback immediately.
 */
export async function loadCenterline(urls = []) {
  const candidates = [
    ...urls,
    'src/world/trackData.json',
    './src/world/trackData.json',
    '/src/world/trackData.json',
    'kart-game/src/world/trackData.json',
  ];
  if (typeof fetch === 'function') {
    for (const u of candidates) {
      try {
        const res = await fetch(u);
        if (!res || !res.ok) continue;
        const json = await res.json();
        const pts = parseCenterline(json);
        if (pts) return { points: pts, source: u };
      } catch { /* try next candidate */ }
    }
  }
  // Try the world module hook (Agent 2 may expose getCenterline).
  try {
    if (typeof globalThis !== 'undefined' && Array.isArray(globalThis.__kartCenterline)) {
      const pts = parseCenterline(globalThis.__kartCenterline);
      if (pts) return { points: pts, source: 'hook' };
    }
  } catch { /* ignore */ }
  try {
    // @vite-ignore: world module is owned by another agent and may not exist yet.
    const mod = await import(/* @vite-ignore */ '../world/track.js');
    const getter = mod?.getCenterline || mod?.default?.getCenterline;
    if (typeof getter === 'function') {
      const pts = parseCenterline(getter());
      if (pts) return { points: pts, source: 'world/track.js' };
    }
    const pts = parseCenterline(mod?.CENTERLINE || mod?.default?.CENTERLINE);
    if (pts) return { points: pts, source: 'world/track.js' };
  } catch { /* missing world module — fallback below */ }
  return { points: makeOvalCenterline(), source: 'fallback-oval' };
}

/** Synchronous accessor: hook or oval fallback (safe to call every frame). */
export function getCenterlineSync() {
  try {
    if (typeof globalThis !== 'undefined' && Array.isArray(globalThis.__kartCenterline)) {
      const pts = parseCenterline(globalThis.__kartCenterline);
      if (pts) return pts;
    }
  } catch { /* ignore */ }
  return makeOvalCenterline();
}

function angleDiff(target, current) {
  let d = (target - current) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Deterministic per-driver pseudo-random in [0,1). Stable for tests. */
export function driverSeed(index, salt = 0) {
  let h = (index * 2654435761 + salt * 40503 + 0x9e3779b9) >>> 0;
  h ^= h >>> 15;
  h = (h * 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return ((h >>> 0) % 10000) / 10000;
}

export class AIController {
  /**
   * @param {KartPhysics} physics
   * @param {object} opts { index, name, color, difficulty 0..1, centerline,
   *   lateralOffset, onUseItem }
   */
  constructor(physics, opts = {}) {
    this.physics = physics || new KartPhysics();
    this.index = opts.index ?? 0;
    this.name = opts.name || AI_NAMES[this.index % AI_NAMES.length];
    this.color = opts.color ?? AI_COLORS[this.index % AI_COLORS.length];
    this.difficulty = clamp(opts.difficulty ?? 0.7, 0, 1);
    // Skill spread: within one field the best driver is ~8% quicker than worst.
    this.skill = clamp(
      this.difficulty * (0.92 + 0.08 * driverSeed(this.index, 7)),
      0.4, 1
    );
    this.centerline = Array.isArray(opts.centerline) && opts.centerline.length >= 4
      ? opts.centerline.map(toXZ)
      : makeOvalCenterline();
    this.lateralOffset = opts.lateralOffset ?? (this.index % 2 === 0 ? 3.2 : -3.2) + (driverSeed(this.index, 3) - 0.5) * 2;
    this.onUseItem = typeof opts.onUseItem === 'function' ? opts.onUseItem : null;

    this.closestIdx = 0;
    this.lap = 0;
    this.progressTotal = 0;
    this._prevIdx = 0;
    this.time = driverSeed(this.index, 11) * 10;
    this.itemCooldown = 4 + driverSeed(this.index, 13) * 5; // 4..9s
    this.wobblePhase = driverSeed(this.index, 17) * Math.PI * 2;
    this.lastInput = { throttle: 0, steer: 0, drift: false, hop: false };
  }

  setCenterline(points) {
    const pts = parseCenterline(points);
    if (pts) {
      this.centerline = pts;
      this.closestIdx = 0;
      this._prevIdx = 0;
    }
    return this;
  }

  reset(x, z, heading) {
    if (Number.isFinite(x) && Number.isFinite(z)) this.physics.reset(x, z, heading ?? 0);
    else {
      const p = this.centerline[0];
      this.physics.reset(p.x, p.z, 0);
    }
    this.closestIdx = 0;
    this._prevIdx = 0;
    this.lap = 0;
    this.progressTotal = 0;
  }

  /** Find closest centerline index, searching a window around last (O(20)). */
  findClosest(pos) {
    const pts = this.centerline;
    const n = pts.length;
    let best = this.closestIdx;
    let bestD = Infinity;
    for (let k = -12; k <= 12; k++) {
      const i = (this.closestIdx + k + n * 2) % n;
      const dx = pts[i].x - pos.x;
      const dz = pts[i].z - pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    // Global re-search if lost (teleport / reset): every ~2s or when far away.
    if (bestD > 60 * 60) {
      for (let i = 0; i < n; i++) {
        const dx = pts[i].x - pos.x;
        const dz = pts[i].z - pos.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    return best;
  }

  trackProgress() {
    return this.lap * this.centerline.length + this.closestIdx;
  }

  /**
   * Step the AI.
   * @param {number} dt
   * @param {object} ctx { karts?: KartPhysics[], playerProgress?: number,
   *   env?: { surface }, rubberBand?: boolean }
   */
  update(dt, ctx = {}) {
    dt = Math.min(Math.max(dt, 0), 1 / 20);
    this.time += dt;
    const pts = this.centerline;
    const n = pts.length;
    const pos = this.physics.position;

    this.closestIdx = this.findClosest(pos);
    // Lap counting on start-line wrap while moving forward.
    if (this._prevIdx > n * 0.75 && this.closestIdx < n * 0.25) this.lap++;
    else if (this._prevIdx < n * 0.25 && this.closestIdx > n * 0.75) this.lap = Math.max(0, this.lap - 1);
    this._prevIdx = this.closestIdx;
    this.progressTotal = this.trackProgress();

    // --- pure pursuit target ---
    const speedAbs = Math.abs(this.physics.speed);
    const lookaheadDist = 7 + speedAbs * 0.55;
    // Approx spacing between centerline samples.
    const p0 = pts[this.closestIdx];
    const p1 = pts[(this.closestIdx + 1) % n];
    const spacing = Math.max(2, Math.hypot(p1.x - p0.x, p1.z - p0.z));
    const steps = clamp(Math.round(lookaheadDist / spacing), 2, 14);
    const lookIdx = (this.closestIdx + steps) % n;
    const aheadIdx = (lookIdx + 2) % n;
    // Path tangent → normal for lateral offset.
    const tx = pts[aheadIdx].x - pts[lookIdx].x;
    const tz = pts[aheadIdx].z - pts[lookIdx].z;
    const tl = Math.hypot(tx, tz) || 1;
    const nx = tz / tl;
    const nz = -tx / tl;
    const targetX = pts[lookIdx].x + nx * this.lateralOffset;
    const targetZ = pts[lookIdx].z + nz * this.lateralOffset;

    const desired = Math.atan2(targetX - pos.x, targetZ - pos.z);
    let diff = angleDiff(desired, this.physics.heading);

    // --- avoidance: steer away from karts ahead in a cone ---
    const others = Array.isArray(ctx.karts) ? ctx.karts : [];
    for (const o of others) {
      if (!o || o === this.physics || !o.position) continue;
      const dx = o.position.x - pos.x;
      const dz = o.position.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 8 || dist < 0.01) continue;
      const fx = Math.sin(this.physics.heading);
      const fz = Math.cos(this.physics.heading);
      const ahead = (dx * fx + dz * fz) / dist; // 1 = straight ahead
      if (ahead > 0.55) {
        const side = Math.sign(dx * fz - dz * fx) || 1; // which side is the obstacle
        const strength = (1 - dist / 8) * 0.9;
        diff -= side * strength;
      }
    }

    // Difficulty wobble (worse drivers wander more).
    diff += Math.sin(this.time * 1.7 + this.wobblePhase) * 0.05 * (1 - this.skill);

    const steer = clamp(diff * 2.4, -1, 1);

    // --- throttle / brake on sharp corners ---
    let throttle = 1;
    const sharp = Math.abs(diff);
    if (sharp > 1.1) throttle = 0.25;
    else if (sharp > 0.7) throttle = 0.6;
    else if (sharp > 0.45) throttle = 0.85;
    // Slower drivers lift earlier.
    throttle = clamp(throttle + (this.skill - 0.8) * 0.4, 0.2, 1);

    // --- rubber-banding ±15% vs player progress ---
    let topSpeedScale = 0.9 + this.skill * 0.12;
    if (ctx.rubberBand !== false && Number.isFinite(ctx.playerProgress)) {
      const gap = ctx.playerProgress - this.progressTotal; // >0 → AI behind
      const pointsPerLap = n;
      const norm = clamp(gap / (pointsPerLap * 0.5), -1, 1);
      topSpeedScale = clamp(topSpeedScale * (1 + norm * 0.15), 0.85, 1.15);
    }

    // AI uses drift on sharp fast corners (charges mini-turbos like a player).
    const drift = sharp > 0.5 && speedAbs > 12;

    const input = normalizeInput({ throttle, steer, drift, hop: false });
    this.lastInput = input;
    const env = { ...(ctx.env || {}), topSpeedScale };
    const snap = this.physics.update(dt, input, env);

    // --- item usage hook ---
    this.itemCooldown -= dt;
    if (this.itemCooldown <= 0) {
      this.itemCooldown = 4 + driverSeed(this.index, Math.floor(this.time)) * 5;
      this.tryUseItem();
    }

    return { ...snap, input, topSpeedScale, targetX, targetZ };
  }

  /** Calls window.__useAIItem(index) when present + local onUseItem hook. Never throws. */
  tryUseItem() {
    try {
      if (this.onUseItem) this.onUseItem(this.index, this);
    } catch { /* ignore hook errors */ }
    try {
      if (typeof globalThis !== 'undefined' && typeof globalThis.__useAIItem === 'function') {
        globalThis.__useAIItem(this.index, this);
      } else if (typeof window !== 'undefined' && typeof window.__useAIItem === 'function') {
        window.__useAIItem(this.index, this);
      }
    } catch { /* ignore */ }
  }
}

/**
 * Build a full 7-kart AI field for main.js.
 * @param {object} opts { centerline?, difficulty?, startSpots?: [{x,z,heading}] }
 * @returns {{ controllers: AIController[], physics: KartPhysics[] }}
 */
export function createField(count = AI_COUNT, opts = {}) {
  const controllers = [];
  const physics = [];
  const baseDifficulty = opts.difficulty ?? 0.7;
  for (let i = 0; i < count; i++) {
    const p = new KartPhysics();
    const c = new AIController(p, {
      index: i,
      difficulty: clamp(baseDifficulty + (driverSeed(i, 21) - 0.5) * 0.25, 0.3, 1),
      centerline: opts.centerline,
      lateralOffset: (i % 2 === 0 ? 1 : -1) * (2 + driverSeed(i, 23) * 3.5),
      onUseItem: opts.onUseItem,
    });
    const spot = opts.startSpots?.[i];
    if (spot) p.reset(spot.x ?? 0, spot.z ?? 0, spot.heading ?? 0);
    else {
      // Stagger behind the start line so they don't overlap.
      const row = Math.floor(i / 2);
      const side = i % 2 === 0 ? 2.5 : -2.5;
      p.reset(side, -6 - row * 4, 0);
    }
    controllers.push(c);
    physics.push(p);
  }
  return { controllers, physics };
}

export default AIController;
