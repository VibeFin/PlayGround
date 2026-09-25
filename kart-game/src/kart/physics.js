/**
 * physics.js — arcade kart physics (Agent 3 ownership).
 *
 * Headless-safe: pure math, no DOM, no THREE imports.
 * Position uses plain { x, y, z } so node tests can import this file directly.
 *
 * Forward convention: forward = (sin(heading), 0, cos(heading)).
 * Increasing heading turns right (+X when heading = 0 faces +Z).
 */

export const TUNING = {
  TOP_SPEED: 42,          // m/s (~151 km/h)
  ACCEL: 22,              // m/s^2
  BRAKE_DECEL: 34,        // m/s^2 when pressing back while moving forward
  REVERSE_ACCEL: 14,      // m/s^2 when reversing from standstill
  REVERSE_MAX: 12,        // m/s reverse cap
  DRAG: 0.49,             // proportional drag; tuned so WOT equilibrium ≈ TOP_SPEED
  ROLL_RESIST: 1.6,       // linear rolling resistance (m/s^2)
  STEER_MAX: 2.3,         // rad/s at standstill
  STEER_MIN_FACTOR: 0.38, // steering authority retained at top speed
  DRIFT_TURN_MULT: 1.65,  // extra yaw rate while drifting
  DRIFT_SLIDE: 0.42,      // lateral slide strength while drifting (fraction of speed)
  DRIFT_MIN_SPEED: 9,     // must be going this fast to start a drift
  DRIFT_CHARGE_TIME: 1.2, // s of drift to earn a mini-turbo
  MINI_TURBO_TIME: 1.7,   // s of boost granted by a charged drift
  MINI_TURBO_TOP: 55,     // top speed during mini-turbo
  BOOST_TOP: 58,          // top speed during item/pad boost
  BOOST_ACCEL: 38,        // accel while boosting
  BOOST_TIME_DEFAULT: 1.6,
  HOP_VEL: 5.2,           // m/s initial vertical velocity for a hop
  GRAVITY: -16,           // m/s^2
  OFFROAD_TOP_SCALE: 0.55,
  OFFROAD_EXTRA_DRAG: 4.2,
  WALL_SPEED_KEEP: 0.94,  // speed retained per wall tick
  KART_RADIUS: 1.1,       // collision sphere radius
};

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** Wrap angle to [-PI, PI]. */
export function wrapAngle(a) {
  a = a % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Input normalization. Accepts any of:
 *  { throttle: -1..1, steer: -1..1, drift: bool, hop: bool(edge), boost: bool }
 *  { up, down, left, right } booleans
 *  { forward, back } 0..1
 */
export function normalizeInput(raw = {}) {
  let throttle = 0;
  let steer = 0;
  if (typeof raw.throttle === 'number') throttle = raw.throttle;
  else {
    const f = raw.up ? 1 : (raw.forward ?? 0);
    const b = raw.down ? 1 : (raw.back ?? 0);
    throttle = (f || 0) - (b || 0);
  }
  if (typeof raw.steer === 'number') steer = raw.steer;
  else {
    const l = raw.left ? 1 : 0;
    const r = raw.right ? 1 : 0;
    steer = r - l;
  }
  return {
    throttle: clamp(throttle, -1, 1),
    steer: clamp(steer, -1, 1),
    drift: !!raw.drift,
    hop: !!raw.hop,       // edge-triggered: true for exactly one tick to hop
    boost: !!raw.boost,
  };
}

export class KartPhysics {
  constructor(opts = {}) {
    this.tuning = { ...TUNING, ...(opts.tuning || {}) };
    this.topSpeedScale = opts.topSpeedScale ?? 1; // AI rubber-banding / difficulty hook
    this.position = { x: opts.x ?? 0, y: 0, z: opts.z ?? 0 };
    this.heading = opts.heading ?? 0;
    this.speed = 0;          // signed forward speed (m/s)
    this.velY = 0;           // vertical velocity
    this.grounded = true;
    this.drifting = false;
    this.driftDir = 0;       // -1 left, +1 right
    this.driftCharge = 0;    // seconds of charged drift
    this.driftCharged = false;
    this.boostTime = 0;      // remaining boost seconds
    this.boostActive = false;
    this.offroad = false;
    this.surface = 'road';
    this.wallHit = false;    // set true for the tick a wall slide occurred
    this.hopCooldown = 0;
  }

  reset(x = 0, z = 0, heading = 0) {
    this.position.x = x;
    this.position.y = 0;
    this.position.z = z;
    this.heading = heading;
    this.speed = 0;
    this.velY = 0;
    this.grounded = true;
    this.drifting = false;
    this.driftDir = 0;
    this.driftCharge = 0;
    this.driftCharged = false;
    this.boostTime = 0;
    this.boostActive = false;
    this.offroad = false;
    this.surface = 'road';
    this.wallHit = false;
    this.hopCooldown = 0;
  }

  /** Grant a boost of `duration` seconds (mini-turbo, pads, mushrooms). */
  addBoost(duration = this.tuning.BOOST_TIME_DEFAULT) {
    this.boostTime = Math.max(this.boostTime, duration);
  }

  get boosting() {
    return this.boostTime > 0;
  }

  getSpeedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  forwardVector(out = {}) {
    out.x = Math.sin(this.heading);
    out.z = Math.cos(this.heading);
    return out;
  }

  rightVector(out = {}) {
    out.x = Math.cos(this.heading);
    out.z = -Math.sin(this.heading);
    return out;
  }

  /**
   * Wall slide: call when a wall with outward normal (nx, nz) is hit.
   * Slides heading along the wall and scrubs a little speed. Never crashes.
   */
  slideAlongWall(nx, nz) {
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const intoWall = fx * nx + fz * nz;
    if (intoWall < 0) {
      // Remove the into-wall component: slide direction = f - (f·n)n
      const sx = fx - intoWall * nx;
      const sz = fz - intoWall * nz;
      if (Math.hypot(sx, sz) > 1e-4) {
        this.heading = Math.atan2(sx, sz);
      }
      this.speed *= this.tuning.WALL_SPEED_KEEP;
      this.wallHit = true;
    }
    return this;
  }

  /**
   * Main arcade step.
   * @param {number} dt seconds (clamped internally to <= 1/20 for stability)
   * @param {object} rawInput normalized via normalizeInput
   * @param {object} env { surface: 'road'|'offroad'|'boost', topSpeedScale?: number }
   */
  update(dt, rawInput = {}, env = {}) {
    const T = this.tuning;
    dt = Math.min(Math.max(dt, 0), 1 / 20);
    const input = normalizeInput(rawInput);
    const surface = env.surface || 'road';
    this.surface = surface;
    this.offroad = surface === 'offroad';
    this.wallHit = false;
    if (this.hopCooldown > 0) this.hopCooldown -= dt;

    const scale = (env.topSpeedScale ?? 1) * (this.topSpeedScale ?? 1);
    let topSpeed = T.TOP_SPEED * scale;
    let accel = T.ACCEL;

    // --- boost state ---
    if (this.boostTime > 0) {
      this.boostTime -= dt;
      this.boostActive = true;
      topSpeed = Math.max(topSpeed, T.BOOST_TOP * Math.max(scale, 1) * 0.98 + 2);
      accel = T.BOOST_ACCEL;
      if (this.boostTime <= 0) {
        this.boostTime = 0;
        this.boostActive = false;
        // Boost decay: clamp down toward normal top speed gradually instead of a cliff.
        if (this.speed > T.TOP_SPEED * scale) this.speed = T.TOP_SPEED * scale + 6;
      }
    } else {
      this.boostActive = false;
    }
    // Boost pad surface (driving over a pad grants/refreshes boost).
    if (surface === 'boost') this.addBoost(0.6);

    if (this.offroad) {
      topSpeed *= T.OFFROAD_TOP_SCALE;
    }

    // --- longitudinal ---
    const th = input.throttle;
    if (th > 0) {
      this.speed += accel * th * dt;
    } else if (th < 0) {
      if (this.speed > 0.6) this.speed += T.BRAKE_DECEL * th * dt; // th negative → braking
      else this.speed += T.REVERSE_ACCEL * th * dt;               // reversing
    }
    // drag + rolling resistance
    this.speed -= this.speed * T.DRAG * dt;
    if (this.offroad) this.speed -= Math.sign(this.speed) * T.OFFROAD_EXTRA_DRAG * dt;
    const rr = T.ROLL_RESIST * dt;
    if (Math.abs(this.speed) <= rr && th === 0) this.speed = 0;
    else if (th === 0) this.speed -= Math.sign(this.speed) * rr;
    this.speed = clamp(this.speed, -T.REVERSE_MAX, topSpeed + 14); // allow transient overspeed, decays via drag
    if (this.speed > topSpeed) {
      // soft cap back toward top speed (boost decay / offroad slowdown feel)
      this.speed += (topSpeed - this.speed) * Math.min(1, 2.6 * dt);
    }

    // --- hop (edge-triggered) ---
    if (input.hop && this.grounded && this.hopCooldown <= 0 && Math.abs(this.speed) > 0.5) {
      this.velY = T.HOP_VEL;
      this.grounded = false;
      this.hopCooldown = 0.25;
    }
    if (!this.grounded) {
      this.velY += T.GRAVITY * dt;
      this.position.y += this.velY * dt;
      if (this.position.y <= 0) {
        this.position.y = 0;
        this.velY = 0;
        this.grounded = true;
      }
    }

    // --- drift state machine ---
    const wantDrift = input.drift && this.grounded && Math.abs(this.speed) > T.DRIFT_MIN_SPEED;
    if (wantDrift && !this.drifting) {
      this.drifting = true;
      this.driftDir = input.steer !== 0 ? Math.sign(input.steer) : (this.driftDir || 1);
      this.driftCharge = 0;
      this.driftCharged = false;
    } else if (!wantDrift && this.drifting) {
      // release: charged drift → mini-turbo
      if (this.driftCharge >= T.DRIFT_CHARGE_TIME) {
        this.boostTime = Math.max(this.boostTime, T.MINI_TURBO_TIME);
        this.boostActive = true;
      }
      this.drifting = false;
      this.driftDir = 0;
      this.driftCharge = 0;
      this.driftCharged = false;
    }
    if (this.drifting) {
      if (input.steer !== 0) this.driftDir = Math.sign(input.steer);
      // Charging counts while sliding; steering hard charges slightly faster.
      this.driftCharge += dt * (Math.abs(input.steer) > 0.5 ? 1 : 0.7);
      if (this.driftCharge >= T.DRIFT_CHARGE_TIME) this.driftCharged = true;
      // Drifting preserves momentum: fight drag a little.
      this.speed += Math.sign(this.speed) * 3.0 * dt;
      this.speed = clamp(this.speed, -T.REVERSE_MAX, topSpeed + 10);
    }

    // --- steering ---
    const spdAbs = Math.abs(this.speed);
    const speedFactor = Math.max(
      T.STEER_MIN_FACTOR,
      1 / (1 + spdAbs * 0.045)
    );
    let yawRate = T.STEER_MAX * speedFactor;
    if (this.drifting) yawRate *= T.DRIFT_TURN_MULT;
    if (this.speed < 0) input.steer *= -1; // reverse flips steering
    this.heading = wrapAngle(this.heading + input.steer * yawRate * dt);

    // --- integrate ---
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    this.position.x += fx * this.speed * dt;
    this.position.z += fz * this.speed * dt;
    if (this.drifting) {
      // lateral powerslide offset (visual + positional)
      const rx = Math.cos(this.heading);
      const rz = -Math.sin(this.heading);
      const slide = this.driftDir * T.DRIFT_SLIDE * spdAbs * dt;
      this.position.x += rx * slide;
      this.position.z += rz * slide;
    }

    return this.snapshot();
  }

  snapshot() {
    return {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      heading: this.heading,
      speed: this.speed,
      velY: this.velY,
      grounded: this.grounded,
      drifting: this.drifting,
      driftCharged: this.driftCharged,
      driftCharge: this.driftCharge,
      boosting: this.boostActive,
      boostTime: this.boostTime,
      offroad: this.offroad,
      surface: this.surface,
    };
  }
}

/**
 * Kart-kart sphere collision: pushes overlapping karts apart equally and
 * scrubs a touch of speed from the faster one. Mutates the physics objects.
 * @param {KartPhysics[]} karts
 * @param {number} minDist minimum center distance (default 2.4)
 * @returns {number} number of pairs separated
 */
export function separateKarts(karts, minDist = 2.4) {
  if (!Array.isArray(karts) || karts.length < 2) return 0;
  let hits = 0;
  for (let i = 0; i < karts.length; i++) {
    for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i];
      const b = karts[j];
      if (!a?.position || !b?.position) continue;
      const dx = b.position.x - a.position.x;
      const dz = b.position.z - a.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-6) {
        a.position.x -= minDist / 2;
        b.position.x += minDist / 2;
        hits++;
        continue;
      }
      if (d < minDist) {
        const push = (minDist - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        a.position.x -= nx * push;
        a.position.z -= nz * push;
        b.position.x += nx * push;
        b.position.z += nz * push;
        // Faster kart loses a little pace in the bump.
        if (typeof a.speed === 'number' && typeof b.speed === 'number') {
          if (Math.abs(a.speed) > Math.abs(b.speed)) a.speed *= 0.97;
          else b.speed *= 0.97;
        }
        if ('wallHit' in a) a.wallHit = false;
        hits++;
      }
    }
  }
  return hits;
}

/**
 * Fallback circular track bounds (used when world/track.js is absent).
 * Keeps `pos` inside an annulus: center + inner/outer radius.
 * @returns {{ corrected: boolean, normal: {x,z}|null }}
 */
export function fallbackBounds(pos, opts = {}) {
  const cx = opts.centerX ?? 0;
  const cz = opts.centerZ ?? 0;
  const outer = opts.outerRadius ?? 120;
  const inner = opts.innerRadius ?? 0; // 0 = no inner island
  const margin = opts.kartRadius ?? TUNING.KART_RADIUS;
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d = Math.hypot(dx, dz);
  if (d > outer - margin && d > 1e-6) {
    const s = (outer - margin) / d;
    pos.x = cx + dx * s;
    pos.z = cz + dz * s;
    return { corrected: true, normal: { x: -dx / d, z: -dz / d } };
  }
  if (inner > 0 && d < inner + margin && d > 1e-6) {
    const s = (inner + margin) / d;
    pos.x = cx + dx * s;
    pos.z = cz + dz * s;
    return { corrected: true, normal: { x: dx / d, z: dz / d } };
  }
  return { corrected: false, normal: null };
}

/**
 * Resolve track bounds against the real world module when present,
 * otherwise fall back to circular bounds. Never throws.
 *
 * Supports both world-module shapes:
 *  - `{ corrected, normal }` style (kart-agent contract), and
 *  - the actual world/track.js `checkBounds(pos)` →
 *    `{ onRoad, slowFactor, distance }`, in which case off-road surface and
 *    wall clamping (at WALL_OFFSET from the centerline) are derived here.
 *    The wall normal is estimated from the numeric gradient of the distance
 *    field, so no centerline access is needed.
 *
 * World modules may also register
 * `globalThis.__kartBoundsCheck = (pos, radius) => ({...})` (checked first,
 * synchronously, every tick-safe).
 *
 * @param {{x,z}} pos mutated in place when a wall push-back applies
 * @param {object} opts { kartRadius, fallback, wallOffset }
 * @returns {Promise<{ corrected, normal, onRoad, slowFactor, surface, source }>}
 *   `normal` is the wall OUTWARD normal — feed it to
 *   `physics.slideAlongWall(normal.x, normal.z)` to wall-slide.
 */
export async function resolveTrackBounds(pos, opts = {}) {
  const radius = opts.kartRadius ?? TUNING.KART_RADIUS;
  try {
    if (typeof globalThis !== 'undefined' && typeof globalThis.__kartBoundsCheck === 'function') {
      const adapted = adaptBoundsResult(globalThis.__kartBoundsCheck(pos, radius), pos, opts);
      if (adapted) return { ...adapted, source: 'hook' };
    }
  } catch { /* ignore hook errors, use fallbacks below */ }

  try {
    // @vite-ignore: world module is owned by another agent and may not exist yet.
    const mod = await import(/* @vite-ignore */ '../world/track.js');
    const fn = mod?.checkBounds || mod?.default?.checkBounds;
    if (typeof fn === 'function') {
      let raw;
      try {
        raw = fn(pos, radius);
      } catch {
        try {
          raw = fn(pos);
        } catch { raw = null; }
      }
      const adapted = adaptBoundsResult(raw, pos, {
        ...opts,
        wallOffset: opts.wallOffset ?? mod?.WALL_OFFSET ?? mod?.default?.WALL_OFFSET,
        checkFn: fn,
      });
      if (adapted) return { ...adapted, source: 'world/track.js' };
    }
  } catch { /* missing world module — fall through to fallback */ }

  const fb = fallbackBounds(pos, opts.fallback);
  return {
    corrected: fb.corrected,
    normal: fb.normal,
    onRoad: !fb.corrected,
    slowFactor: fb.corrected ? 0.55 : 1,
    surface: fb.corrected ? 'offroad' : 'road',
    source: 'fallback',
  };
}

/**
 * Adapt a raw world checkBounds result to the unified shape.
 * Returns null when the result is unusable. Mutates `pos` for wall push-back.
 */
export function adaptBoundsResult(raw, pos, opts = {}) {
  if (!raw || typeof raw !== 'object') return null;
  // Already in kart-agent contract shape.
  if (typeof raw.corrected === 'boolean' || 'normal' in raw) {
    return {
      corrected: !!raw.corrected,
      normal: raw.normal ?? null,
      onRoad: raw.onRoad ?? !raw.corrected,
      slowFactor: raw.slowFactor ?? (raw.corrected ? 0.55 : 1),
      surface: raw.surface || (raw.onRoad === false ? 'offroad' : 'road'),
    };
  }
  // world/track.js shape: { onRoad, slowFactor, distance }.
  if (typeof raw.onRoad === 'boolean' || typeof raw.distance === 'number') {
    const onRoad = raw.onRoad ?? true;
    const slowFactor = raw.slowFactor ?? (onRoad ? 1 : 0.55);
    const distance = raw.distance ?? 0;
    const wallOffset = opts.wallOffset ?? 7.5;
    let corrected = false;
    let normal = null;
    if (distance > wallOffset && pos) {
      // Numeric gradient of the distance field → outward normal.
      const fn = opts.checkFn;
      const e = 0.75;
      let gx = 0;
      let gz = 0;
      if (typeof fn === 'function') {
        try {
          const dx = (fn({ x: pos.x + e, z: pos.z })?.distance ?? distance) - distance;
          const dz = (fn({ x: pos.x, z: pos.z + e })?.distance ?? distance) - distance;
          gx = dx / e;
          gz = dz / e;
        } catch { /* keep zero gradient */ }
      }
      let len = Math.hypot(gx, gz);
      if (len < 1e-4) {
        // Degenerate gradient (symmetry): push radially from track centroid.
        gx = pos.x;
        gz = pos.z;
        len = Math.hypot(gx, gz) || 1;
      }
      normal = { x: gx / len, z: gz / len };
      // Push back toward the track: move inward (against the outward
      // normal) by the overshoot amount.
      const push = distance - wallOffset;
      pos.x -= normal.x * push;
      pos.z -= normal.z * push;
      corrected = true;
    }
    return {
      corrected,
      normal,
      onRoad: onRoad && !corrected,
      slowFactor,
      surface: !onRoad || corrected ? 'offroad' : slowFactor < 1 ? 'road' : 'road',
    };
  }
  return null;
}

/**
 * Synchronous bounds resolve (no import attempt): hook first, then fallback.
 * Safe to call every physics tick.
 */
export function resolveTrackBoundsSync(pos, opts = {}) {
  const radius = opts.kartRadius ?? TUNING.KART_RADIUS;
  try {
    if (typeof globalThis !== 'undefined' && typeof globalThis.__kartBoundsCheck === 'function') {
      const r = globalThis.__kartBoundsCheck(pos, radius) || {};
      return { corrected: !!r.corrected, normal: r.normal ?? null, source: 'hook' };
    }
  } catch { /* ignore */ }
  const fb = fallbackBounds(pos, opts.fallback);
  return { corrected: fb.corrected, normal: fb.normal, source: 'fallback' };
}
