/**
 * Fixed-step arcade physics.
 * Readable rewrite of minified `hV` (vehicle step), `AL` (barrier),
 * `LL` (car-car), `DV` (laps) and surface helpers `EL/DL`.
 */
import * as THREE from 'three';
import { wrapDistance, signedDelta } from './spline-track.js';
import { deriveCarStats } from '../config/cars.js';

export const FIXED_STEP = 1 / 120;
const GRAVITY = 9.81;
const GEAR_LIMITS = [0, 12, 24, 38, 54, 71, 91]; // m/s, 1..7

export function surfaceGrip(surface, wetness) {
  switch (surface) {
    case 'kerb': return 0.88 * (1 - wetness * 0.45);
    case 'grass': return 0.43 * (1 - wetness * 0.4);
    case 'gravel': return 0.52;
    default: return 1 - wetness * 0.32;
  }
}

export function surfaceDrag(surface) {
  if (surface === 'grass') return 1.5;
  if (surface === 'gravel') return 2.4;
  return 0.18;
}

export function maxSteerFor(speed) {
  return 0.55 / (1 + Math.max(0, speed) * 0.034);
}

function gearFor(speed) {
  for (let g = GEAR_LIMITS.length - 1; g >= 0; g--) {
    if (speed >= GEAR_LIMITS[g]) return Math.min(g + 1, 7);
  }
  return 1;
}

/**
 * Advance one vehicle by dt. Mutates `car`.
 * `input` = { steer -1..1, throttle 0..1, brake 0..1, handbrake bool }.
 */
export function stepVehicle(car, input, track, dt, opts = {}) {
  const { wetness = 0, abs = true, traction = true } = opts;
  const stats = deriveCarStats(car.spec);

  car.surface = track.surfaceAt(car.lateral);
  const grip = surfaceGrip(car.surface, wetness) * stats.grip;
  const drag = surfaceDrag(car.surface);

  // Steering with speed-sensitive lock + damage wobble.
  const maxSteer = maxSteerFor(car.speed);
  const targetSteer = THREE.MathUtils.clamp(input.steer ?? 0, -1, 1) * maxSteer;
  car.steer += (targetSteer - car.steer) * Math.min(1, dt * 10);
  car.throttle = input.throttle ?? 0;
  car.brake = input.brake ?? 0;

  const effectiveThrottle = traction && car.surface !== 'asphalt'
    ? car.throttle * 0.75
    : car.throttle;

  // Longitudinal: engine force fades near top speed + aero quadratic.
  const aero = (stats.powerWatts * 0.88) / (car.spec.mass * stats.topSpeed);
  const engineForce = effectiveThrottle * stats.acceleration * Math.max(0, 1 - car.speed / (stats.topSpeed * 1.04));
  const brakeForce = car.brake * (abs ? 22 : 26);
  const resist = drag + aero * Math.pow(Math.max(0, car.speed) / stats.topSpeed, 2) * 18;
  let accel = engineForce - Math.sign(car.speed) * resist;
  if (car.brake > 0) accel -= Math.sign(car.speed || 1) * brakeForce * (car.speed > 1 ? 1 : 4);
  if (input.handbrake) accel -= Math.sign(car.speed || 1) * 14;
  car.speed = Math.max(-8, car.speed + accel * dt);
  // Holding the brake at a standstill must not creep backwards.
  if (car.throttle < 0.05 && (car.brake > 0.1 || input.handbrake) && Math.abs(car.speed) < 0.6) {
    car.speed = 0;
  }

  // Lateral: yaw towards steer, grip pulls heading back to tangent.
  const yawTarget = car.steer * Math.min(1, Math.abs(car.speed) / 8) * (car.speed >= 0 ? 1 : -1) * 1.9;
  car.yawRate += (yawTarget - car.yawRate) * Math.min(1, dt * (4 + grip * 4));
  car.heading += car.yawRate * dt * Math.min(1, grip + 0.25);
  car.heading *= Math.exp(-dt * (input.handbrake ? 0.4 : 1.6) * grip * 0.4);

  const forwardSpeed = car.speed * Math.cos(car.heading);
  const sideSpeed = car.speed * Math.sin(car.heading);
  car.sideSpeed = sideSpeed;
  car.slip = Math.min(1, Math.abs(sideSpeed) / Math.max(6, Math.abs(forwardSpeed)));

  // Advance along spline with curvature correction for the offset line.
  const frame = track.sample(car.s);
  const curvatureFix = THREE.MathUtils.clamp(1 / (1 - frame.curvature * car.lateral), 0.45, 1.6);
  car.s += (forwardSpeed / curvatureFix) * dt;
  car.lateral += sideSpeed * dt;

  // Barrier clamp + damage (minified `AL`).
  const limit = track.halfWidth + 4.6;
  car.impact = 0;
  if (Math.abs(car.lateral) > limit) {
    car.lateral = Math.sign(car.lateral) * limit;
    const hit = Math.min(0.52, 0.08 + (Math.abs(sideSpeed) + Math.abs(forwardSpeed) * 0.2) / 30);
    car.damage = Math.min(1, car.damage + hit * 0.15);
    car.speed *= 1 - hit;
    car.impact = hit;
    car.heading *= 0.5;
  }

  // Gears + rpm for HUD/audio.
  car.gear = gearFor(Math.abs(car.speed));
  const lo = GEAR_LIMITS[car.gear - 1] ?? 0;
  const hi = GEAR_LIMITS[car.gear] ?? 110;
  const frac = THREE.MathUtils.clamp((Math.abs(car.speed) - lo) / Math.max(1, hi - lo), 0, 1);
  car.rpm = Math.abs(car.speed) < 0.5 && car.throttle < 0.05
    ? 950 + car.throttle * 1900
    : THREE.MathUtils.clamp(3200 + frac * 5200 + car.slip * 1700, 950, 9200);

  // Off-track invalidation mirrors the original time-trial rule.
  if (Math.abs(car.lateral) > track.halfWidth + 2) car.lapInvalid = true;
  return car;
}

/** Simple OBB-ish car-car push-apart (minified `LL`). */
export function resolveCarContact(a, b, track) {
  const ds = signedDelta(a.s, b.s, track.length);
  const dl = b.lateral - a.lateral;
  if (Math.abs(ds) > 7 || Math.abs(dl) > 2.6) return 0;
  const push = (1 - Math.abs(ds) / 7) * 2.2;
  const dir = ds >= 0 ? 1 : -1;
  a.s -= dir * push * 0.5;
  b.s += dir * push * 0.5;
  a.lateral -= Math.sign(dl || 1) * push * 0.18;
  b.lateral += Math.sign(dl || 1) * push * 0.18;
  const exchange = (a.speed - b.speed) * 0.12;
  a.speed -= exchange;
  b.speed += exchange;
  a.damage = Math.min(1, a.damage + 0.02);
  b.damage = Math.min(1, b.damage + 0.02);
  return Math.abs(exchange);
}

export function resetCarToTrack(car) {
  car.lateral = 0;
  car.heading = 0;
  car.yawRate = 0;
  car.speed = Math.min(car.speed, 12);
  car.damage = Math.min(car.damage, 0.25);
  car.lapInvalid = true;
}

export function formatLapTime(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '--:--.---';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export { wrapDistance };
