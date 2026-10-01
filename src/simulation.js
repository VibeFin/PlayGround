/**
 * WRECKAGE's deterministic, renderer-independent XZ rigid-body simulation.
 * Forward = (sin(yaw), cos(yaw)); positive steering turns toward +X at yaw 0.
 * Call update(1 / 60, input). Updates are internally substepped at <= 1 / 120 s;
 * invalid/nonpositive dt is ignored and catch-up is capped at 0.25 s per call.
 *
 * Contract units/ranges: time is elapsed match seconds (180 s limit), health
 * and boost are 0..100, damage regions are 0..1, steer is -1..1, speed is signed
 * forward m/s. Events live for one update; force is 0..1 and player means the
 * player participated in a hit, was wrecked, or received an opponent wreck's
 * credit. Colors are hex. Boost drains 30/s and regenerates 13/s when released
 * (also while braking/reversing); holding an empty boost cannot trickle power.
 * Added car fields: mass (kg), angularVelocity (rad/s, positive increases yaw).
 * Cars remain collidable wrecks when dead. AI state and hit attribution are
 * private. Combo starts at 0, counts credited hits up to 8, and expires after
 * 4 seconds; takedowns include kills within 5 seconds of a credited player hit.
 * reset() replaces cars/events and restores the same seeded opening every time.
 * start() only transitions ready -> playing. Final states freeze the match;
 * on timeout the surviving player wins ties for highest remaining health.
 * Private camping memory grows without propulsion or below 3 m/s; sustained
 * powered movement clears it. Collision shoves alone cannot clear camping.
 * After an 8-second opening grace, 4..10 seconds of camping increasingly bias
 * up to two AI target-selection slots toward the player; a thinning field also
 * raises pursuit priority. This changes
 * target choice only, with the usual physics, damage, and reaction intervals.
 */

const HALF_X = 43;
const HALF_Z = 32;
const RADIUS = 1.05;
const OFFSETS = [-1.2, 0, 1.2];
const MATCH_SECONDS = 180;
const STEP = 1 / 120;
const COLORS = [0xffc23d, 0xe84b4b, 0x40a9e8, 0x9cd34e, 0xb772ee,
  0xff843d, 0x42d1be, 0xeb6caf, 0xd3d8e2, 0x5374d8];
const NAMES = ['YOU', 'RUST', 'HATCHET', 'VENOM', 'RIOT', 'BURNOUT',
  'WRECKER', 'FURY', 'ANVIL', 'REAPER'];
const SPAWNS = [[0, -20], [-28, -19], [-14, -16], [16, -17], [30, -17],
  [-29, 4], [-13, 9], [13, 8], [29, 5], [0, 24]];

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const angle = n => Math.atan2(Math.sin(n), Math.cos(n));
const finiteInput = n => Number.isFinite(n) ? clamp(n, -1, 1) : 0;
const inertia = car => car.mass * (4.5 ** 2 + 2.1 ** 2) / 12;
// In XZ coordinates a positive yaw rotates +Z toward +X.
const torque = (rx, rz, fx, fz) => rz * fx - rx * fz;

export function createSimulation() {
  let seed;
  let bots;
  let impacts;
  let credit;
  let comboUntil;
  let camping;
  const sim = { cars: [], time: 0, events: [], state: 'ready', score: 0,
    combo: 0, takedowns: 0, reset, start, update };

  function random() {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  }

  function reset() {
    seed = 0x57ec4a9;
    bots = new Map();
    impacts = new Map();
    credit = new Map();
    comboUntil = 0;
    camping = 0;
    sim.time = 0;
    sim.events = [];
    sim.state = 'ready';
    sim.score = 0;
    sim.combo = 0;
    sim.takedowns = 0;
    sim.cars = SPAWNS.map(([x, z], id) => {
      if (id) bots.set(id, { target: null, rethink: id * 0.07,
        stuck: 0, reverse: 0, turn: id % 2 ? 1 : -1,
        aggression: 0.88 + random() * 0.12 });
      return { id, isPlayer: id === 0, name: NAMES[id], color: COLORS[id],
        x, z, yaw: id ? Math.atan2(-x, -z) : 0, vx: 0, vz: 0,
        speed: 0, steer: 0, health: 100,
        damage: { front: 0, rear: 0, left: 0, right: 0 },
        boost: 100, alive: true, mass: id ? 1450 + (id % 4) * 90 : 1650,
        angularVelocity: 0 };
    });
    return sim;
  }

  function start() {
    if (sim.state === 'ready') sim.state = 'playing';
    return sim;
  }

  function chooseTarget(car, bot) {
    let best = Infinity;
    bot.target = null;
    const opponents = sim.cars.filter(other => other.alive && !other.isPlayer).length;
    for (const other of sim.cars) {
      if (!other.alive || other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      let attackers = 0;
      for (const [id, ai] of bots) {
        if (id !== car.id && sim.cars[id].alive && ai.target === other.id) attackers++;
      }
      const turn = Math.abs(angle(Math.atan2(dx, dz) - car.yaw));
      let cost = Math.hypot(dx, dz) * (1 + attackers * 0.55)
        * (0.85 + other.health * 0.0015) + turn * 4;
      if (other.isPlayer && attackers < 2 && sim.time > 8) {
        const pressure = Math.max(clamp((camping - 4) / 6, 0, 1),
          clamp((4 - opponents) / 3, 0, 1) * 0.6);
        cost *= 1 - pressure * 0.95;
      }
      if (cost < best) { best = cost; bot.target = other.id; }
    }
    bot.rethink = 0.8 + random() * 0.65;
  }

  function aiInput(car, dt) {
    const bot = bots.get(car.id);
    bot.rethink -= dt;
    if (bot.rethink <= 0 || !sim.cars[bot.target]?.alive) chooseTarget(car, bot);
    const target = sim.cars[bot.target];
    if (!target) return { throttle: 0, steer: 0, brake: true, boost: false };

    const speed = Math.hypot(car.vx, car.vz);
    if (bot.reverse > 0) {
      bot.reverse -= dt;
      bot.stuck = 0;
      return { throttle: -1, steer: bot.turn, brake: false, boost: false };
    }
    bot.stuck = speed < 1.8 ? bot.stuck + dt : Math.max(0, bot.stuck - dt * 2);
    const distance = Math.hypot(target.x - car.x, target.z - car.z);
    const lead = clamp(distance / 35, 0, 0.65);
    let tx = clamp(target.x + target.vx * lead, -HALF_X + RADIUS, HALF_X - RADIUS);
    let tz = clamp(target.z + target.vz * lead, -HALF_Z + RADIUS, HALF_Z - RADIUS);
    // Turn back before meeting the wall, with different return lanes per car.
    // A nearby aligned opponent at the perimeter is still reachable: do not
    // steer away from a committed strike and grant corner campers immunity.
    const committed = distance < 12
      && Math.abs(angle(Math.atan2(target.x - car.x, target.z - car.z) - car.yaw)) < 0.6;
    const outwardX = Math.abs(car.x) > 37 && Math.sin(car.yaw) * car.x > 0;
    const outwardZ = Math.abs(car.z) > 26 && Math.cos(car.yaw) * car.z > 0;
    if ((outwardX || outwardZ) && !committed) {
      tx = -Math.sign(car.x) * 12;
      tz = -Math.sign(car.z) * 9 + (car.id % 3 - 1) * 6;
    }
    const error = angle(Math.atan2(tx - car.x, tz - car.z) - car.yaw);
    if (bot.stuck > 1.3 || (Math.abs(error) > 2.5 && speed < 2.5)) {
      bot.reverse = 0.85 + random() * 0.55;
      bot.turn = -Math.sign(error || bot.turn);
      return { throttle: -1, steer: bot.turn, brake: false, boost: false };
    }
    const tightTurn = Math.abs(error) > 1.1 && distance < 8
      && Math.hypot(target.vx, target.vz) < 3;
    return { throttle: tightTurn ? 0 : bot.aggression * (Math.abs(error) > 1.2 ? 0.55 : 1),
      steer: clamp(error * 1.65, -1, 1),
      // Shed speed when the target lies inside our turning circle, rather than
      // endlessly orbiting a parked car at the old 15 m/s brake threshold.
      brake: tightTurn || (Math.abs(error) > 1.1 && speed > clamp(distance * 0.8, 5, 15)),
      boost: Math.abs(error) < 0.22 && distance > 12 && speed > 8 && car.boost > 30 };
  }

  function drive(car, input, dt) {
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    const rx = fz;
    const rz = -fx;
    let forward = car.vx * fx + car.vz * fz;
    let lateral = car.vx * rx + car.vz * rz;
    if (car.alive) {
      const throttle = finiteInput(input.throttle);
      const steering = finiteInput(input.steer);
      const handbrake = Boolean(input.brake);
      const wantsBoost = Boolean(input.boost) && throttle > 0 && !handbrake;
      const boosting = wantsBoost && car.boost > 0;
      const boostFraction = boosting ? Math.min(1, car.boost / (30 * dt)) : 0;
      car.boost = clamp(car.boost + (boosting ? -30 : wantsBoost ? 0 : 13) * dt, 0, 100);
      car.steer += (steering - car.steer) * (1 - Math.exp(-12 * dt));
      const reversingDirection = throttle * forward < -0.5;
      const acceleration = reversingDirection ? 17 : throttle < 0 ? 7 : 10;
      forward += (throttle * acceleration + boostFraction * 8) * dt;
      forward *= Math.exp(-(0.14 + 0.012 * Math.abs(forward)) * dt);
      if (handbrake) forward *= Math.exp(-0.9 * dt);
      forward = clamp(forward, -10, boosting ? 28 : 26);
      // Rear grip is released by the handbrake, retaining sideways momentum.
      lateral *= Math.exp(-(handbrake ? 1.15 : 7.5) * dt);
      const yawTarget = clamp(car.steer * forward / 3.4 * Math.tan(handbrake ? 0.72 : 0.48),
        handbrake ? -2.2 : -1.6, handbrake ? 2.2 : 1.6);
      car.angularVelocity += (yawTarget - car.angularVelocity)
        * (1 - Math.exp(-(handbrake ? 3.5 : 4.5) * dt));
    } else {
      car.steer *= Math.exp(-5 * dt);
      forward *= Math.exp(-1.2 * dt);
      lateral *= Math.exp(-2.8 * dt);
      car.angularVelocity *= Math.exp(-2.5 * dt);
    }
    car.vx = fx * forward + rx * lateral;
    car.vz = fz * forward + rz * lateral;
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    car.yaw = angle(car.yaw + car.angularVelocity * dt);
  }

  function circles(car) {
    const sx = Math.sin(car.yaw);
    const sz = Math.cos(car.yaw);
    return OFFSETS.map(offset => ({ x: car.x + sx * offset, z: car.z + sz * offset }));
  }

  function velocityAt(car, x, z) {
    return { x: car.vx + car.angularVelocity * (z - car.z),
      z: car.vz - car.angularVelocity * (x - car.x) };
  }

  function impulse(car, x, z, ix, iz) {
    car.vx += ix / car.mass;
    car.vz += iz / car.mass;
    car.angularVelocity += torque(x - car.x, z - car.z, ix, iz) / inertia(car);
  }

  function region(car, x, z) {
    const dx = x - car.x;
    const dz = z - car.z;
    const longitudinal = dx * Math.sin(car.yaw) + dz * Math.cos(car.yaw);
    const lateral = dx * Math.cos(car.yaw) - dz * Math.sin(car.yaw);
    return Math.abs(longitudinal) / 2.25 > Math.abs(lateral) / 1.05
      ? longitudinal >= 0 ? 'front' : 'rear'
      : lateral >= 0 ? 'right' : 'left';
  }

  function damage(car, amount, x, z, playerCredit, force) {
    if (!car.alive || amount <= 0) return 0;
    const side = region(car, x, z);
    const armor = side === 'front' ? 0.72 : side === 'rear' ? 1.12 : 1;
    const loss = Math.min(car.health, amount * armor * (car.isPlayer ? 0.85 : 1));
    car.health = Math.max(0, car.health - loss);
    car.damage[side] = clamp(car.damage[side] + loss / 65, 0, 1);
    if (playerCredit && !car.isPlayer) credit.set(car.id, sim.time);
    if (car.health <= 0) {
      car.alive = false;
      const credited = !car.isPlayer && sim.time - (credit.get(car.id) ?? -Infinity) <= 5;
      if (credited) { sim.takedowns++; sim.score += 500 * Math.max(1, sim.combo); }
      sim.events.push({ type: 'wreck', x: car.x, z: car.z,
        force: clamp(Math.max(0.4, force), 0, 1), player: credited || car.isPlayer });
    }
    return loss;
  }

  function impact(key, a, b, x, z, closing, approachA, approachB) {
    if (closing < 0.8 || sim.time - (impacts.get(key) ?? -Infinity) < 0.2) return;
    impacts.set(key, sim.time);
    const force = clamp(closing / 26, 0, 1);
    sim.events.push({ type: 'hit', x, z, force, player: a.isPlayer || Boolean(b?.isPlayer) });
    const base = Math.pow(Math.max(0, closing - 3), 1.35) * 0.62;
    const creditA = a.isPlayer && a.alive && approachA > 2 && approachA >= approachB * 0.6;
    const creditB = b?.isPlayer && b.alive && approachB > 2 && approachB >= approachA * 0.6;
    // A score multiplier belongs to one physical impact, never solver iterations.
    const earnsHit = base > 0 && ((creditA && b?.alive) || (creditB && a.alive));
    if (earnsHit) {
      sim.combo = sim.time <= comboUntil ? Math.min(8, sim.combo + 1) : 1;
      comboUntil = sim.time + 4;
    }
    const lossA = damage(a, base * (b ? 2 * b.mass / (a.mass + b.mass) : 0.6),
      x, z, creditB, force);
    const lossB = b ? damage(b, base * 2 * a.mass / (a.mass + b.mass), x, z, creditA, force) : 0;
    if (earnsHit) sim.score += Math.round((creditA ? lossB : lossA) * 12) * sim.combo;
  }

  function collideCars(a, b) {
    if (Math.abs(a.x - b.x) > 4.5 || Math.abs(a.z - b.z) > 4.5) return;
    let contact = null;
    const ac = circles(a);
    const bc = circles(b);
    for (const ca of ac) for (const cb of bc) {
      const dx = cb.x - ca.x;
      const dz = cb.z - ca.z;
      const distance = Math.hypot(dx, dz);
      const depth = RADIUS * 2 - distance;
      if (depth <= 0 || (contact && depth <= contact.depth)) continue;
      // Stable normal even for perfectly coincident stationary bodies.
      const nx = distance > 1e-8 ? dx / distance : 1;
      const nz = distance > 1e-8 ? dz / distance : 0;
      contact = { depth, nx, nz, x: (ca.x + cb.x) / 2, z: (ca.z + cb.z) / 2 };
    }
    if (!contact) return;
    const { nx, nz, x, z, depth } = contact;
    const va = velocityAt(a, x, z);
    const vb = velocityAt(b, x, z);
    const closing = (va.x - vb.x) * nx + (va.z - vb.z) * nz;
    if (closing > 0) {
      const ra = torque(x - a.x, z - a.z, nx, nz);
      const rb = torque(x - b.x, z - b.z, nx, nz);
      const effectiveMass = 1 / a.mass + 1 / b.mass + ra * ra / inertia(a) + rb * rb / inertia(b);
      const magnitude = (1 + 0.16) * closing / effectiveMass;
      impulse(a, x, z, -nx * magnitude, -nz * magnitude);
      impulse(b, x, z, nx * magnitude, nz * magnitude);
      // Coulomb contact friction adds a scrape and torque without injecting energy.
      const tx = -nz;
      const tz = nx;
      const postA = velocityAt(a, x, z);
      const postB = velocityAt(b, x, z);
      const ta = torque(x - a.x, z - a.z, tx, tz);
      const tb = torque(x - b.x, z - b.z, tx, tz);
      const tangentMass = 1 / a.mass + 1 / b.mass + ta * ta / inertia(a) + tb * tb / inertia(b);
      const friction = clamp(((postA.x - postB.x) * tx + (postA.z - postB.z) * tz)
        / tangentMass, -magnitude * 0.28, magnitude * 0.28);
      impulse(a, x, z, -tx * friction, -tz * friction);
      impulse(b, x, z, tx * friction, tz * friction);
      impact(`${a.id}:${b.id}`, a, b, x, z, closing,
        Math.max(0, va.x * nx + va.z * nz), Math.max(0, -vb.x * nx - vb.z * nz));
    }
    const correction = Math.max(0, depth - 0.003) * 0.85;
    const shareA = b.mass / (a.mass + b.mass);
    a.x -= nx * correction * shareA;
    a.z -= nz * correction * shareA;
    b.x += nx * correction * (1 - shareA);
    b.z += nz * correction * (1 - shareA);
  }

  function collideWalls(car) {
    // Recompute the support after each wall; corner projections are independent.
    for (const [nx, nz, extent, wall] of [[1, 0, HALF_X, 'east'], [-1, 0, HALF_X, 'west'],
      [0, 1, HALF_Z, 'north'], [0, -1, HALF_Z, 'south']]) {
      const points = circles(car);
      let support = points[0];
      for (const point of points) {
        if (point.x * nx + point.z * nz > support.x * nx + support.z * nz) support = point;
      }
      const depth = support.x * nx + support.z * nz + RADIUS - extent;
      if (depth <= 0) continue;
      const x = support.x + nx * RADIUS;
      const z = support.z + nz * RADIUS;
      const velocity = velocityAt(car, x, z);
      const closing = velocity.x * nx + velocity.z * nz;
      if (closing > 0) {
        const lever = torque(x - car.x, z - car.z, nx, nz);
        const magnitude = 1.12 * closing / (1 / car.mass + lever * lever / inertia(car));
        impulse(car, x, z, -nx * magnitude, -nz * magnitude);
        impact(`${car.id}:${wall}`, car, null,
          clamp(x, -HALF_X, HALF_X), clamp(z, -HALF_Z, HALF_Z), closing, closing, 0);
      }
      car.x -= nx * depth;
      car.z -= nz * depth;
    }
  }

  function finishIfNeeded() {
    const player = sim.cars[0];
    if (!player.alive) sim.state = 'lost';
    else if (sim.cars.every(car => car.isPlayer || !car.alive)) sim.state = 'won';
    else if (sim.time >= MATCH_SECONDS) {
      sim.state = sim.cars.every(car => !car.alive || car.health <= player.health) ? 'won' : 'lost';
    }
  }

  function update(dt, input = {}) {
    sim.events = [];
    if (sim.state !== 'playing' || !Number.isFinite(dt) || dt <= 0) return sim;
    input = input ?? {};
    const duration = Math.min(dt, 0.25);
    const steps = Math.ceil(duration / STEP);
    const h = duration / steps;
    for (let step = 0; step < steps && sim.state === 'playing'; step++) {
      sim.time = Math.min(MATCH_SECONDS, sim.time + h);
      if (sim.time > comboUntil) sim.combo = 0;
      const player = sim.cars[0];
      const driving = Math.abs(finiteInput(input.throttle)) > 0.2 && Math.hypot(player.vx, player.vz) > 3;
      camping = clamp(camping + (driving ? -2 * h : h), 0, 10);
      for (const car of sim.cars) drive(car,
        car.isPlayer || !car.alive ? input : aiInput(car, h), h);
      // Repeated position/velocity solving handles piles without spring explosions.
      for (let iteration = 0; iteration < 5; iteration++) {
        for (let i = 0; i < sim.cars.length; i++) {
          for (let j = i + 1; j < sim.cars.length; j++) {
            collideCars(sim.cars[i], sim.cars[j]);
          }
        }
        for (const car of sim.cars) collideWalls(car);
      }
      for (const car of sim.cars) {
        // Impact safety limits exceed normal driving speeds; no tunnelling runaway.
        const speed = Math.hypot(car.vx, car.vz);
        if (speed > 36) { car.vx *= 36 / speed; car.vz *= 36 / speed; }
        car.angularVelocity = clamp(car.angularVelocity, -5, 5);
        car.speed = car.vx * Math.sin(car.yaw) + car.vz * Math.cos(car.yaw);
      }
      finishIfNeeded();
    }
    return sim;
  }

  return reset();
}
