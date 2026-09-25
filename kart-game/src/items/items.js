/**
 * items.js — ItemSystem for the Three.js Mario Kart clone.
 *
 * Owned by Agent 4. Other agents: `import { ItemSystem } from './items.js'`
 * (or '../items/items.js' from main.js) and drive it from the game loop.
 *
 * Effects (per spec):
 *  - Mystery boxes respawn after 5s, grant a 1s roulette then a random item.
 *  - Mushroom: +12 m/s boost for 2s.
 *  - Green shell: travels straight, bounces up to 3x, stuns victim 2s.
 *  - Banana: dropped behind, spins victim 1.5s.
 *  - Star: 6s invincible + speed bonus.
 *
 * Kart contract (duck-typed, everything optional — guards apply):
 *   kart.position: { x, y?, z } (THREE.Vector3 compatible)
 *   kart.heading / kart.yaw: radians, 0 = -Z (three.js convention). Falls back to velocity dir.
 *   kart.speed: scalar m/s (read for drop/spawn math only)
 *   kart.lap, kart.progress / kart.totalProgress: numbers for HUD position (untouched here)
 *   kart.isPlayer: boolean (used for callbacks only)
 *   Item/effect fields written by ItemSystem:
 *     kart.item: null | 'mushroom' | 'shell' | 'banana' | 'star'
 *     kart.roulette: null | { t: number, display: string }  (HUD shows slot machine)
 *     kart.boostTime, kart.boostAmount, kart.starTime,
 *     kart.stunTime, kart.spinTime, kart.invincible
 *
 * Pure logic works with NO scene/THREE (meshes are skipped). Pass a three.js
 * Scene for visuals; set a custom THREE module via setThree() if the global
 * build differs from the importer's.
 */

const ITEM_TYPES = ['mushroom', 'shell', 'banana', 'star'];
const ITEM_WEIGHTS = { mushroom: 0.34, shell: 0.26, banana: 0.24, star: 0.16 };
const ITEM_LABEL = { mushroom: '🍄', shell: '🟢', banana: '🍌', star: '⭐' };

export const ITEMS = {
  BOX_RESPAWN: 5.0,
  ROULETTE_TIME: 1.0,
  PICKUP_RADIUS: 3.0,
  SHELL_SPEED: 32,
  SHELL_BOUNCES: 3,
  SHELL_LIFE: 12,
  SHELL_HIT_RADIUS: 2.0,
  SHELL_STUN: 2.0,
  BANANA_SPIN: 1.5,
  BANANA_HIT_RADIUS: 2.0,
  MUSHROOM_BOOST: 12,
  MUSHROOM_TIME: 2.0,
  STAR_TIME: 6.0,
  STAR_SPEED: 8,
};

let InjectedThree = null;
export function setThree(THREE) {
  InjectedThree = THREE || null;
}
function getThree() {
  if (InjectedThree) return InjectedThree;
  try {
    if (typeof globalThis !== 'undefined' && globalThis.THREE) return globalThis.THREE;
  } catch { /* ignore */ }
  return null;
}

/** Normalize the many trackData shapes other agents might produce. */
export function normalizeTrackPoints(trackData) {
  if (!trackData) return [];
  const raw =
    (Array.isArray(trackData) && trackData) ||
    trackData.points ||
    trackData.path ||
    trackData.centerline ||
    trackData.centerLine ||
    trackData.spine ||
    [];
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const p of raw) {
    if (p == null) continue;
    if (Array.isArray(p) && p.length >= 2) out.push({ x: +p[0], z: +p[1] });
    else if (typeof p === 'object' && 'x' in p && 'z' in p) out.push({ x: +p.x, z: +p.z });
    else if (typeof p === 'object' && 'x' in p && 'y' in p && !('z' in p)) out.push({ x: +p.x, z: +p.y });
  }
  return out;
}

function kartXZ(kart) {
  if (!kart) return { x: 0, z: 0 };
  const p = kart.position || kart.pos || { x: 0, z: 0 };
  return { x: +(p.x || 0), z: +(p.z || 0) };
}

function kartHeading(kart) {
  if (!kart) return 0;
  for (const k of ['heading', 'yaw', 'angle', 'rotationY']) {
    if (typeof kart[k] === 'number' && Number.isFinite(kart[k])) return kart[k];
  }
  if (kart.quaternion && typeof kart.quaternion === 'object') {
    try {
      // yaw from quaternion (three.js Y-up): heading 0 faces -Z.
      const q = kart.quaternion;
      const siny = 2 * (q.w * q.y + q.x * q.z);
      const cosy = 1 - 2 * (q.y * q.y + q.x * q.x);
      if (Number.isFinite(siny) && Number.isFinite(cosy)) {
        // Negate so 0 => -Z forward like three.js lookAt convention.
        return Math.atan2(siny, cosy);
      }
    } catch { /* fall through */ }
  }
  if (kart.mesh?.rotation && typeof kart.mesh.rotation.y === 'number') return kart.mesh.rotation.y;
  const v = kart.velocity || kart.vel;
  if (v && (v.x || v.z)) return Math.atan2(v.x, -v.z);
  return 0;
}

function rollItem(rng = Math.random) {
  const r = rng();
  let acc = 0;
  for (const t of ITEM_TYPES) {
    acc += ITEM_WEIGHTS[t] ?? 0.25;
    if (r <= acc) return t;
  }
  return ITEM_TYPES[0];
}

export class ItemSystem {
  /**
   * @param {object|null} scene three.js Scene (optional — logic-only if falsy)
   * @param {object|array|null} trackData centerline for box placement + shell bounds
   * @param {object} opts { boxCount, bounds, rng, onEvent }
   */
  constructor(scene = null, trackData = null, opts = {}) {
    this.scene = scene || null;
    this.opts = opts || {};
    this.rng = typeof this.opts.rng === 'function' ? this.opts.rng : Math.random;
    this.boxCount = Math.max(1, this.opts.boxCount ?? 8);
    this.bounds = this.opts.bounds ?? 120; // square half-extent for shell bounces
    this._listeners = new Set();
    if (typeof this.opts.onEvent === 'function') this._listeners.add(this.opts.onEvent);

    this.boxes = [];
    this.shells = [];
    this.bananas = [];
    this.time = 0;

    this.setTrackData(trackData);
  }

  onEvent(fn) {
    if (typeof fn === 'function') this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(evt) {
    for (const fn of this._listeners) {
      try { fn(evt); } catch { /* listener errors must not break the loop */ }
    }
  }

  setScene(scene) {
    // Re-parent existing visuals when the scene arrives late (guarded).
    const old = this.scene;
    this.scene = scene || null;
    if (this.scene && this.scene !== old) {
      try {
        for (const b of this.boxes) if (b.mesh && !b.mesh.parent) this.scene.add?.(b.mesh);
        for (const s of this.shells) if (s.mesh && !s.mesh.parent) this.scene.add?.(s.mesh);
        for (const bn of this.bananas) if (bn.mesh && !bn.mesh.parent) this.scene.add?.(bn.mesh);
      } catch { /* ignore */ }
    }
  }

  setTrackData(trackData) {
    this.trackData = trackData || null;
    this.trackPoints = normalizeTrackPoints(trackData);
    this._layoutBoxes();
  }

  // ---- visuals (all guarded; safe with no THREE/scene) ----
  _makeMesh(kind) {
    const THREE = getThree();
    if (!THREE || !this.scene) return null;
    try {
      let mesh = null;
      if (kind === 'box') {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 1.6, 1.6),
          new THREE.MeshStandardMaterial({ color: 0x2288ff, emissive: 0x1144aa, emissiveIntensity: 0.7, transparent: true, opacity: 0.92 })
        );
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry),
          new THREE.LineBasicMaterial({ color: 0xffffff })
        );
        mesh.add(edges);
        mesh.position.y = 1.2;
      } else if (kind === 'shell') {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.55, 14, 12),
          new THREE.MeshStandardMaterial({ color: 0x22cc44, roughness: 0.35, metalness: 0.1 })
        );
        mesh.position.y = 0.6;
      } else if (kind === 'banana') {
        mesh = new THREE.Mesh(
          new THREE.TorusGeometry(0.5, 0.18, 8, 12, Math.PI * 1.2),
          new THREE.MeshStandardMaterial({ color: 0xffd21f, roughness: 0.6 })
        );
        mesh.position.y = 0.35;
        mesh.rotation.x = -Math.PI / 2;
      }
      return mesh;
    } catch {
      return null;
    }
  }

  _addMesh(mesh) {
    if (!mesh || !this.scene) return;
    try { this.scene.add?.(mesh); } catch { /* ignore */ }
  }

  _removeMesh(mesh) {
    if (!mesh) return;
    try {
      this.scene?.remove?.(mesh);
      mesh.geometry?.dispose?.();
      const m = mesh.material;
      if (Array.isArray(m)) m.forEach((x) => x?.dispose?.());
      else m?.dispose?.();
    } catch { /* ignore */ }
  }

  _layoutBoxes() {
    // Drop old box meshes.
    for (const b of this.boxes) this._removeMesh(b.mesh);
    this.boxes = [];
    const pts = this.trackPoints;
    for (let i = 0; i < this.boxCount; i++) {
      let x = 0; let z = -20 - i * 12;
      if (pts.length > 0) {
        const p = pts[Math.floor((i / this.boxCount) * pts.length) % pts.length];
        x = p.x; z = p.z;
      } else {
        // Fallback ring when track is unknown.
        const a = (i / this.boxCount) * Math.PI * 2;
        x = Math.cos(a) * 40; z = Math.sin(a) * 40;
      }
      const mesh = this._makeMesh('box');
      if (mesh) { mesh.position.x = x; mesh.position.z = z; this._addMesh(mesh); }
      this.boxes.push({ x, z, active: true, respawn: 0, mesh, spin: this.rng() * Math.PI * 2 });
    }
  }

  reset() {
    for (const s of this.shells) this._removeMesh(s.mesh);
    for (const b of this.bananas) this._removeMesh(b.mesh);
    this.shells = [];
    this.bananas = [];
    for (const b of this.boxes) {
      b.active = true; b.respawn = 0;
      if (b.mesh) { try { b.mesh.visible = true; } catch { /* ignore */ } }
    }
  }

  dispose() {
    this.reset();
    for (const b of this.boxes) this._removeMesh(b.mesh);
    this.boxes = [];
    this._listeners.clear();
  }

  // ---- item flow ----
  /** Start the 1s roulette for a kart touching a box. Returns granted type or null. */
  giveItem(kart) {
    if (!kart || kart.roulette || kart.item) return kart?.item ?? null;
    kart.roulette = { t: ITEMS.ROULETTE_TIME, display: rollItem(this.rng) };
    this._emit({ type: 'roulette', kart });
    return null;
  }

  _finishRoulette(kart) {
    const item = rollItem(this.rng);
    kart.roulette = null;
    kart.item = item;
    this._emit({ type: 'pickup', kart, item });
    return item;
  }

  hasItem(kart) { return !!(kart && kart.item); }

  /**
   * Consume kart.item and apply/fire it. Returns the used type or null.
   * Safe to call when kart has no item (returns null).
   */
  useItem(kart) {
    if (!kart || !kart.item || kart.roulette) return null;
    if ((kart.stunTime ?? 0) > 0) return null; // stunned karts can't fire
    const item = kart.item;
    kart.item = null;
    const { x, z } = kartXZ(kart);
    const heading = kartHeading(kart);
    const fx = Math.sin(heading); const fz = -Math.cos(heading);

    if (item === 'mushroom') {
      kart.boostTime = ITEMS.MUSHROOM_TIME;
      kart.boostAmount = ITEMS.MUSHROOM_BOOST;
      this._emit({ type: 'boost', kart, item });
    } else if (item === 'star') {
      kart.starTime = ITEMS.STAR_TIME;
      kart.invincible = true;
      this._emit({ type: 'star', kart, item });
    } else if (item === 'shell') {
      const mesh = this._makeMesh('shell');
      const shell = {
        x: x + fx * 2.2, z: z + fz * 2.2,
        dx: fx, dz: fz,
        bounces: 0, life: ITEMS.SHELL_LIFE, mesh, owner: kart,
      };
      if (mesh) { mesh.position.x = shell.x; mesh.position.z = shell.z; this._addMesh(mesh); }
      this.shells.push(shell);
      this._emit({ type: 'fire', kart, item, projectile: shell });
    } else if (item === 'banana') {
      const mesh = this._makeMesh('banana');
      const banana = { x: x - fx * 2.4, z: z - fz * 2.4, mesh, owner: kart, age: 0 };
      if (mesh) { mesh.position.x = banana.x; mesh.position.z = banana.z; this._addMesh(mesh); }
      this.bananas.push(banana);
      this._emit({ type: 'drop', kart, item, hazard: banana });
    }
    return item;
  }

  _stunVictim(victim, secs, cause, source) {
    if (!victim) return false;
    if ((victim.starTime ?? 0) > 0 || victim.invincible === true) {
      this._emit({ type: 'blocked', kart: victim, cause });
      return false; // star shrugs it off
    }
    victim.stunTime = Math.max(victim.stunTime ?? 0, secs);
    try { victim.speed = Math.min(victim.speed ?? 0, 4); } catch { /* ignore */ }
    this._emit({ type: 'hit', kart: victim, cause, source });
    return true;
  }

  // ---- per-frame ----
  /**
   * Advance boxes, roulette, projectiles, hazards and effect timers.
   * @param {number} dt seconds (clamped internally)
   * @param {Array} karts kart list (missing/empty is a no-op, per guard spec)
   */
  update(dt, karts) {
    const step = (typeof dt === 'number' && Number.isFinite(dt)) ? Math.min(Math.max(dt, 0), 0.1) : 0.016;
    this.time += step;
    if (!Array.isArray(karts) || karts.length === 0) {
      this._updateProjectilesOnly(step);
      return;
    }

    // Mystery boxes: spin, respawn after 5s, grant roulette on touch.
    for (const b of this.boxes) {
      if (!b.active) {
        b.respawn -= step;
        if (b.respawn <= 0) {
          b.active = true;
          try { if (b.mesh) b.mesh.visible = true; } catch { /* ignore */ }
          this._emit({ type: 'box-respawn', box: b });
        }
        continue;
      }
      if (b.mesh) {
        try {
          b.spin += step * 2;
          b.mesh.rotation.y = b.spin;
          b.mesh.position.y = 1.2 + Math.sin(this.time * 3 + b.spin) * 0.15;
        } catch { /* ignore */ }
      }
      for (const kart of karts) {
        if (!kart || kart.roulette || kart.item) continue;
        const { x, z } = kartXZ(kart);
        const dx = x - b.x; const dz = z - b.z;
        if (dx * dx + dz * dz < ITEMS.PICKUP_RADIUS * ITEMS.PICKUP_RADIUS) {
          b.active = false;
          b.respawn = ITEMS.BOX_RESPAWN;
          try { if (b.mesh) b.mesh.visible = false; } catch { /* ignore */ }
          this.giveItem(kart);
          break;
        }
      }
    }

    // Per-kart timers: roulette 1s, mushroom 2s, star 6s, stun 2s, spin 1.5s.
    for (const kart of karts) {
      if (!kart) continue;
      if (kart.roulette) {
        kart.roulette.t -= step;
        // Slot-machine flicker for HUD.
        if (this.rng() < 0.35) kart.roulette.display = rollItem(this.rng);
        if (kart.roulette.t <= 0) this._finishRoulette(kart);
      }
      if ((kart.boostTime ?? 0) > 0) {
        kart.boostTime -= step;
        if (kart.boostTime <= 0) { kart.boostTime = 0; kart.boostAmount = 0; }
      }
      if ((kart.starTime ?? 0) > 0) {
        kart.starTime -= step;
        kart.invincible = true;
        if (kart.starTime <= 0) { kart.starTime = 0; kart.invincible = false; }
      }
      if ((kart.stunTime ?? 0) > 0) kart.stunTime = Math.max(0, kart.stunTime - step);
      if ((kart.spinTime ?? 0) > 0) kart.spinTime = Math.max(0, kart.spinTime - step);
    }

    // Green shells: straight flight, bounce 3x on world bounds, stun 2s.
    const half = typeof this.bounds === 'number' ? this.bounds : 120;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= step;
      s.x += s.dx * ITEMS.SHELL_SPEED * step;
      s.z += s.dz * ITEMS.SHELL_SPEED * step;
      let bounced = false;
      if (s.x > half) { s.x = half; s.dx = -Math.abs(s.dx); bounced = true; }
      if (s.x < -half) { s.x = -half; s.dx = Math.abs(s.dx); bounced = true; }
      if (s.z > half) { s.z = half; s.dz = -Math.abs(s.dz); bounced = true; }
      if (s.z < -half) { s.z = -half; s.dz = Math.abs(s.dz); bounced = true; }
      if (bounced) {
        s.bounces += 1;
        this._emit({ type: 'bounce', projectile: s, count: s.bounces });
      }
      if (s.mesh) {
        try { s.mesh.position.x = s.x; s.mesh.position.z = s.z; s.mesh.rotation.y += step * 9; } catch { /* ignore */ }
      }
      let dead = s.life <= 0 || s.bounces > ITEMS.SHELL_BOUNCES;
      if (!dead) {
        for (const kart of karts) {
          if (!kart || kart === s.owner) continue;
          // Brief grace so the shooter isn't instantly hit.
          if (s.life > ITEMS.SHELL_LIFE - 0.25) break;
          const { x, z } = kartXZ(kart);
          const dx = x - s.x; const dz = z - s.z;
          if (dx * dx + dz * dz < ITEMS.SHELL_HIT_RADIUS * ITEMS.SHELL_HIT_RADIUS) {
            this._stunVictim(kart, ITEMS.SHELL_STUN, 'shell', s.owner);
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        this._removeMesh(s.mesh);
        this.shells.splice(i, 1);
        this._emit({ type: 'expired', kind: 'shell' });
      }
    }

    // Bananas: static hazards, spin victim 1.5s, consumed on hit.
    for (let i = this.bananas.length - 1; i >= 0; i--) {
      const bn = this.bananas[i];
      bn.age = (bn.age ?? 0) + step;
      if (bn.mesh) {
        try { bn.mesh.rotation.z += step * 1.5; } catch { /* ignore */ }
      }
      let consumed = false;
      for (const kart of karts) {
        if (!kart || kart === bn.owner) {
          // Owner can still slip on their own peel after 2s (Mario Kart rule-ish).
          if (!kart || kart !== bn.owner || (bn.age ?? 0) < 2) continue;
        }
        const { x, z } = kartXZ(kart);
        const dx = x - bn.x; const dz = z - bn.z;
        if (dx * dx + dz * dz < ITEMS.BANANA_HIT_RADIUS * ITEMS.BANANA_HIT_RADIUS) {
          if ((kart.starTime ?? 0) > 0 || kart.invincible === true) {
            this._emit({ type: 'blocked', kart, cause: 'banana' });
            consumed = true; // star plows through and eats the peel
            break;
          }
          kart.spinTime = Math.max(kart.spinTime ?? 0, ITEMS.BANANA_SPIN);
          try { kart.speed = Math.min(kart.speed ?? 0, 5); } catch { /* ignore */ }
          this._emit({ type: 'hit', kart, cause: 'banana', source: bn.owner });
          consumed = true;
          break;
        }
      }
      if (consumed) {
        this._removeMesh(bn.mesh);
        this.bananas.splice(i, 1);
      }
    }
  }

  _updateProjectilesOnly(step) {
    // Keep world visuals alive even when kart list is missing (guard spec).
    const half = typeof this.bounds === 'number' ? this.bounds : 120;
    for (const s of this.shells) {
      s.life -= step;
      s.x += s.dx * ITEMS.SHELL_SPEED * step;
      s.z += s.dz * ITEMS.SHELL_SPEED * step;
      if (s.mesh) {
        try { s.mesh.position.x = s.x; s.mesh.position.z = s.z; } catch { /* ignore */ }
      }
      void half;
    }
  }

  /** Speed bonus (m/s) other systems should add: mushroom +12, star +8. */
  static speedBonus(kart) {
    if (!kart) return 0;
    if ((kart.boostTime ?? 0) > 0) return kart.boostAmount ?? ITEMS.MUSHROOM_BOOST;
    if ((kart.starTime ?? 0) > 0) return ITEMS.STAR_SPEED;
    return 0;
  }

  static label(item) {
    if (!item) return '—';
    return ITEM_LABEL[item] || String(item);
  }

  snapshot() {
    return {
      boxes: this.boxes.map((b) => ({ x: b.x, z: b.z, active: b.active })),
      shells: this.shells.length,
      bananas: this.bananas.length,
    };
  }
}

export default ItemSystem;
