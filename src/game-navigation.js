// A small shared flow field per living player avoids one A* search per zombie.
export function createNavigation(colliders = [], radius = 0.34) {
  const min = -24, max = 24, size = 49;
  const blocked = new Uint8Array(size * size);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function free(x, z, r = radius) {
    if (x < min + r || x > max - r || z < min + r || z > max - r) return false;
    return !colliders.some(c => x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r);
  }
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) blocked[z * size + x] = free(x + min, z + min) ? 0 : 1;
  const index = (x, z) => clamp(Math.round(z - min), 0, size - 1) * size + clamp(Math.round(x - min), 0, size - 1);
  const point = i => ({ x: i % size + min, z: Math.floor(i / size) + min });
  const neighbors = i => {
    const x = i % size, z = Math.floor(i / size), result = [];
    if (x > 0) result.push(i - 1);
    if (x < size - 1) result.push(i + 1);
    if (z > 0) result.push(i - size);
    if (z < size - 1) result.push(i + size);
    return result;
  };
  function nearest(x, z) {
    let best = -1, distance = Infinity;
    for (let i = 0; i < blocked.length; i++) if (!blocked[i]) {
      const p = point(i), d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d < distance) { best = i; distance = d; }
    }
    return best;
  }
  function field(x, z) {
    const distances = new Int16Array(size * size).fill(-1);
    let start = index(x, z);
    if (blocked[start]) start = nearest(x, z);
    if (start < 0) return distances;
    const queue = new Int16Array(size * size);
    let read = 0, write = 1;
    queue[0] = start;
    distances[start] = 0;
    while (read < write) {
      const current = queue[read++];
      for (const next of neighbors(current)) if (!blocked[next] && distances[next] < 0) {
        distances[next] = distances[current] + 1;
        queue[write++] = next;
      }
    }
    return distances;
  }
  function clearLine(x, z, tx, tz, r = radius) {
    const steps = Math.max(1, Math.ceil(Math.hypot(tx - x, tz - z) / 0.2));
    for (let i = 1; i <= steps; i++) if (!free(x + (tx - x) * i / steps, z + (tz - z) * i / steps, r)) return false;
    return true;
  }
  function waypoint(x, z, target, distances) {
    if (clearLine(x, z, target.x, target.z)) return target;
    const cell = index(x, z);
    let best = -1, cost = Infinity;
    // Consider visible nearby cells rather than steering into a corner from a
    // rounded cell whose center is on the opposite side of a thin wall.
    const cx = cell % size, cz = Math.floor(cell / size);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue;
      const i = nz * size + nx;
      if (distances[i] < 0) continue;
      const p = point(i), d = Math.hypot(p.x - x, p.z - z);
      const value = distances[i] + d * 0.9;
      if (value < cost && clearLine(x, z, p.x, p.z)) { best = i; cost = value; }
    }
    return best >= 0 ? point(best) : { x, z };
  }
  function move(position, dx, dz, r = radius) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
    for (let i = 0; i < steps; i++) {
      if (free(position.x + dx / steps, position.z, r)) position.x += dx / steps;
      if (free(position.x, position.z + dz / steps, r)) position.z += dz / steps;
    }
  }
  return { free, field, waypoint, move, clearLine, nearestPoint(x, z) { const i = nearest(x, z); return i < 0 ? { x: 0, z: 0 } : point(i); } };
}
