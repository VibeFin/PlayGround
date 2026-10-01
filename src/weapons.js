export const WEAPON_STATS = {
  minigun: { interval: 1 / 12, speed: 95, range: 44, damage: 3, heatPerShot: 3.5, cooling: 24, resumeHeat: 35 },
  rocket: { speed: 38, lifetime: 2.4, damage: 55, radius: 6, capacity: 4, cooldown: 1.2, reload: 8 },
};

// Earliest swept contact, so fast bullets cannot skip thin targets between frames.
export function segmentCircleHit(ax, az, bx, bz, cx, cz, radius) {
  const dx = bx - ax, dz = bz - az;
  const ox = ax - cx, oz = az - cz;
  const c = ox * ox + oz * oz - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz;
  if (a < 1e-10) return null;
  const b = 2 * (ox * dx + oz * dz);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

export function rocketDamage(distance, directHit = false, damage = WEAPON_STATS.rocket.damage) {
  if (directHit) return damage;
  return damage * .8 * Math.max(0, 1 - distance / WEAPON_STATS.rocket.radius);
}

export function weaponState() {
  return { heat: 0, overheated: false, gunCooldown: 0, flash: 0, rockets: WEAPON_STATS.rocket.capacity, rocketCooldown: 0, reload: 0, shots: 0, launches: 0, aiPhase: Math.random() * 3 };
}
