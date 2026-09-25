/**
 * Math / misc helpers shared by all kart-game modules.
 */

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, lambda, dt) {
  // Framerate-independent exponential damping (same as THREE.MathUtils.damp).
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function formatRaceTime(seconds) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  const sec = Math.floor(rest);
  const tenths = Math.floor((rest - sec) * 10);
  return `${m}:${String(sec).padStart(2, '0')}.${tenths}`;
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Angle lerp that wraps correctly around ±PI. */
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function isDesktopWidth() {
  return typeof window === 'undefined' ? true : window.innerWidth >= 1100;
}
