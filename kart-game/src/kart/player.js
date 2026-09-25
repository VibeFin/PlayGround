/**
 * player.js — player controller wrapping KartPhysics + input (Agent 3 ownership).
 *
 * Headless-safe: no DOM access at import time. The controller accepts any
 * input-like object with a `.state` ({ throttle, steer, drift }) and optional
 * edge-triggered `consumeItemPressed()`. Works with Agent 1's core/Input.js.
 *
 * Hop/drift mapping (matches "Space = item / drift" menu binding):
 *  - Space TAP (press edge) while moving  → hop.
 *  - Space HOLD + steering while fast     → drift (physics owns the state machine).
 *  - Item use is ALSO on Space edge — main.js should call consumeItemPressed()
 *    for the item system; the harmless hop is classic Mario Kart behaviour
 *    (hop first, then drift). No double-handling needed here.
 */

import { KartPhysics, normalizeInput } from './physics.js';

function stubInput() {
  return {
    state: { throttle: 0, steer: 0, drift: false, boost: false },
    consumeItemPressed: () => false,
    consumeResetPressed: () => false,
    pollGamepad: () => {},
  };
}

export class PlayerController {
  /**
   * @param {object} opts
   * @param {KartPhysics} [opts.physics] existing physics instance to wrap
   * @param {object} [opts.input] input-like ({ state, consumeItemPressed? })
   * @param {object} [opts.start] { x, z, heading }
   * @param {string} [opts.name]
   * @param {number} [opts.color]
   */
  constructor(opts = {}) {
    this.physics = opts.physics || new KartPhysics(opts.start || {});
    this.input = opts.input || stubInput();
    this.name = opts.name || 'YOU';
    this.color = opts.color ?? 0x2b7fff;
    this.mesh = null; // set via attachMesh(); duck-typed, no THREE import needed
    this._prevDriftHeld = false;
    this._testInput = null;
    this.itemPressed = false; // edge: Space pressed this tick
    this.wallCorrected = false;
  }

  /** Headless-test helper: override input for one or many ticks. */
  setTestInput(partial) {
    this._testInput = { ...(this._testInput || {}), ...partial };
  }

  clearTestInput() {
    this._testInput = null;
  }

  /** Attach a THREE.Group from KartModel.js (optional; syncs each update). */
  attachMesh(mesh) {
    this.mesh = mesh || null;
    return this;
  }

  reset(x = 0, z = 0, heading = 0) {
    this.physics.reset(x, z, heading);
    this._prevDriftHeld = false;
    this.itemPressed = false;
  }

  /** Read continuous input from the bound input device (+ test overrides). */
  readInput() {
    const s = this.input?.state || {};
    let base = {
      throttle: s.throttle ?? 0,
      steer: s.steer ?? 0,
      drift: !!s.drift,
      boost: !!s.boost,
      hop: false,
    };
    if (this._testInput) base = { ...base, ...this._testInput };

    // Hop on drift-button rising edge (Space tap) while moving.
    const held = !!base.drift;
    const edge = held && !this._prevDriftHeld;
    this._prevDriftHeld = held;
    if (edge) base.hop = true;

    // Edge-triggered item flag (main.js drains the real queue; we mirror it).
    try {
      if (typeof this.input?.consumeItemPressed === 'function') {
        if (this.input.consumeItemPressed()) this.itemPressed = true;
      } else if (edge) {
        this.itemPressed = true;
      }
    } catch {
      if (edge) this.itemPressed = true;
    }
    return normalizeInput(base);
  }

  /** Did Space get tapped this tick? main.js may use it for items. Consuming. */
  consumeItemPressed() {
    const v = this.itemPressed;
    this.itemPressed = false;
    return v;
  }

  /**
   * Step physics. `env` is passed straight to KartPhysics.update
   * ({ surface, topSpeedScale }) — main.js fills surface from the world module.
   */
  update(dt, env = {}) {
    const input = this.readInput();
    const snap = this.physics.update(dt, input, env);
    if (this.mesh) syncMeshToPhysics(this.mesh, this.physics, dt);
    return { ...snap, itemPressed: this.consumeItemPressed(), input };
  }

  get position() {
    return this.physics.position;
  }

  get heading() {
    return this.physics.heading;
  }

  get speed() {
    return this.physics.speed;
  }

  get state() {
    return this.physics.snapshot();
  }
}

/**
 * Sync a kart mesh (from KartModel.createKart) to a physics instance.
 * Duck-typed: works with THREE.Group or any { position:{set?}, rotation }.
 * Pure function — safe headless (no-ops on missing parts).
 */
export function syncMeshToPhysics(mesh, physics, dt = 0.016) {
  if (!mesh || !physics) return;
  try {
    const p = physics.position || physics;
    const heading = physics.heading ?? 0;
    if (mesh.position && typeof mesh.position.set === 'function') {
      mesh.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    } else if (mesh.position) {
      mesh.position.x = p.x ?? 0;
      mesh.position.y = p.y ?? 0;
      mesh.position.z = p.z ?? 0;
    }
    if (mesh.rotation) mesh.rotation.y = heading;
    if (mesh.rotation && physics.drifting !== undefined) {
      mesh.rotation.z = physics.drifting ? (physics.driftDir || 1) * -0.13 : 0;
      mesh.rotation.x = physics.boosting || physics.boostActive ? -0.045 : 0;
    }

    const u = mesh.userData || {};
    // Wheel spin (all wheels) + front-pivot steer from last setSteer().
    if (Array.isArray(u.wheels)) {
      const spin = (physics.speed || 0) * dt;
      for (const w of u.wheels) {
        if (!w) continue;
        const tire = w.mesh || w;
        const r = w.front ? 0.3 : 0.367;
        if (tire.rotation) tire.rotation.x += spin / r;
        if (w.front && w.pivot) w.pivot.rotation.y = (u.lastSteer ?? 0) * 0.42;
      }
    }
  } catch { /* visual sync must never break physics */ }
}

/** Convenience factory for main.js: `const player = createPlayer({ input })`. */
export function createPlayer(opts = {}) {
  return new PlayerController(opts);
}

export default PlayerController;
