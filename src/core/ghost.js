/**
 * Personal-best ghosts in localStorage.
 * Minified sources: `sB` (key), `cB/lB` (load/save), `uB` (per-track key),
 * `dB` (ghost interpolation at 20 Hz).
 */

const STORE_KEY = 'spline-rush-v1';

export function storageKey(trackId, carId) {
  return `${trackId}:${carId}`;
}

export function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false; // mirrors "Record in memory" fallback toast
  }
}

export function getBest(trackId, carId) {
  return loadStore()[storageKey(trackId, carId)] ?? null;
}

/** Persist a lap if it beats the stored best and is valid. */
export function maybeSaveBest(trackId, carId, lapTime, sectors, ghostFrames) {
  if (!Number.isFinite(lapTime)) return false;
  const store = loadStore();
  const key = storageKey(trackId, carId);
  const prev = store[key]?.best;
  if (prev != null && lapTime >= prev) return false;
  store[key] = {
    best: lapTime,
    sectors: [...sectors],
    ghost: ghostFrames.map((f) => [...f]),
    date: new Date().toISOString(),
  };
  saveStore(store);
  return true;
}

/**
 * Interpolate a ghost frame at lap-time `t`.
 * Frames: [lapTime, sInLap, lateral, heading, speed].
 */
export function sampleGhost(ghost, t) {
  if (!ghost?.length) return null;
  if (t <= ghost[0][0]) return frameToPose(ghost[0]);
  for (let i = 1; i < ghost.length; i++) {
    if (ghost[i][0] >= t) {
      const a = ghost[i - 1];
      const b = ghost[i];
      const span = Math.max(1e-4, b[0] - a[0]);
      const k = (t - a[0]) / span;
      return {
        s: a[1] + (b[1] - a[1]) * k,
        lateral: a[2] + (b[2] - a[2]) * k,
        heading: a[3] + (b[3] - a[3]) * k,
        speed: a[4] + (b[4] - a[4]) * k,
      };
    }
  }
  return frameToPose(ghost[ghost.length - 1]);
}

function frameToPose(f) {
  return { s: f[1], lateral: f[2], heading: f[3], speed: f[4] };
}
