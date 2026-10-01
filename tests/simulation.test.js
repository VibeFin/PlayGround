import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/simulation.js';

const DT = 1 / 60;
const idle = { throttle: 0, steer: 0, brake: false, boost: false };
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function place(car, x, z, yaw = 0, vx = 0, vz = 0) {
  Object.assign(car, { x, z, yaw, vx, vz, angularVelocity: 0, steer: 0 });
}

// Park uninvolved cars away from a controlled experiment. Keep one living
// opponent so last-car-standing cannot prematurely end a controls test.
function parkOthers(sim, involved = [0]) {
  for (const car of sim.cars) {
    if (involved.includes(car.id)) {
      if (car.id && !car.alive) { car.alive = true; car.health = 100; }
      continue;
    }
    place(car, -36 + (car.id - 1) * 8, 26);
    car.alive = car.id === 9;
    car.health = car.alive ? 100 : 0;
  }
}

function fixture() {
  const sim = createSimulation();
  sim.start();
  parkOthers(sim);
  place(sim.cars[0], 0, 0);
  return sim;
}

function controls(sim, input, frames, recenter = false) {
  for (let i = 0; i < frames; i++) {
    parkOthers(sim);
    if (recenter) { sim.cars[0].x = 0; sim.cars[0].z = 0; }
    sim.update(DT, input);
    assert.equal(sim.state, 'playing');
  }
}

function collision({ speed = 20, offset = 0, victimHealth = 100, sameVelocity = false } = {}) {
  const sim = fixture();
  parkOthers(sim, [0, 1]);
  place(sim.cars[0], 0, 0, 0, 0, speed);
  place(sim.cars[1], offset, 4.4, sameVelocity ? 0 : Math.PI, 0, sameVelocity ? speed : 0);
  sim.cars[1].health = victimHealth;
  sim.update(DT, idle);
  return sim;
}

function checkFinite(sim) {
  for (const key of ['time', 'score', 'combo', 'takedowns']) assert.ok(Number.isFinite(sim[key]), key);
  for (const car of sim.cars) {
    for (const key of ['x', 'z', 'yaw', 'vx', 'vz', 'speed', 'steer', 'health', 'boost', 'mass', 'angularVelocity']) {
      assert.ok(Number.isFinite(car[key]), `car ${car.id} ${key}`);
    }
    assert.ok(car.health >= 0 && car.health <= 100);
    assert.ok(car.boost >= 0 && car.boost <= 100);
    assert.equal(car.alive, car.health > 0);
    for (const value of Object.values(car.damage)) assert.ok(value >= 0 && value <= 1);
    const extentX = 1.05 + 1.2 * Math.abs(Math.sin(car.yaw));
    const extentZ = 1.05 + 1.2 * Math.abs(Math.cos(car.yaw));
    assert.ok(Math.abs(car.x) + extentX <= 43 + 1e-7, `car ${car.id} crossed X wall`);
    assert.ok(Math.abs(car.z) + extentZ <= 32 + 1e-7, `car ${car.id} crossed Z wall`);
    assert.ok(Math.hypot(car.vx, car.vz) <= 36.000001);
    assert.ok(Math.abs(car.angularVelocity) <= 5);
  }
  for (const event of sim.events) {
    assert.ok(['hit', 'wreck'].includes(event.type));
    assert.ok(Number.isFinite(event.x) && Number.isFinite(event.z));
    assert.ok(event.force > 0 && event.force <= 1);
    assert.equal(typeof event.player, 'boolean');
  }
}

test('contract, safe seeded spawns, and ready/start lifecycle', () => {
  const sim = createSimulation();
  assert.equal(sim.cars.length, 10);
  assert.equal(new Set(sim.cars.map(car => car.id)).size, 10);
  assert.equal(new Set(sim.cars.map(car => car.color)).size, 10);
  assert.equal(sim.cars.filter(car => car.isPlayer).length, 1);
  assert.deepEqual([sim.cars[0].x, sim.cars[0].z, sim.cars[0].yaw], [0, -20, 0]);
  for (const car of sim.cars) for (const other of sim.cars) {
    if (car !== other) assert.ok(distance(car, other) > 4.5);
  }
  const opening = structuredClone(sim.cars);
  for (let i = 0; i < 120; i++) sim.update(DT, { throttle: 1, boost: true });
  assert.equal(sim.state, 'ready');
  assert.equal(sim.time, 0);
  assert.deepEqual(sim.cars, opening);
  sim.start();
  sim.update(DT, { throttle: 1 });
  assert.equal(sim.state, 'playing');
  assert.ok(Math.abs(sim.time - DT) < 1e-12);
  assert.ok(sim.cars[0].z > -20);
  const time = sim.time;
  sim.start();
  assert.equal(sim.time, time);
});

test('forward convention, mass, acceleration, near-26 m/s cap, and coasting friction', () => {
  const sim = fixture();
  const car = sim.cars[0];
  controls(sim, { throttle: 1 }, 600, true);
  assert.ok(car.mass > 1000);
  assert.ok(car.speed > 22 && car.speed <= 26);
  assert.ok(Math.abs(car.vx) < 1e-9);
  const before = car.speed;
  controls(sim, idle, 120, true);
  assert.ok(car.speed < before * 0.7 && car.speed > 0);
  place(car, 0, 0, Math.PI / 2);
  controls(sim, { throttle: 1 }, 30);
  assert.ok(car.x > 0.8);
  assert.ok(Math.abs(car.z) < 1e-8);
});

test('steering reverses when backing up and cannot spin a stationary car', () => {
  const forward = fixture();
  const reverse = fixture();
  place(forward.cars[0], 0, 0, 0, 0, 7);
  place(reverse.cars[0], 0, 0, 0, 0, -7);
  controls(forward, { throttle: 1, steer: 1 }, 30);
  controls(reverse, { throttle: -1, steer: 1 }, 30);
  assert.ok(forward.cars[0].yaw > 0.15);
  assert.ok(reverse.cars[0].yaw < -0.15);
  assert.ok(reverse.cars[0].speed < 0 && reverse.cars[0].speed >= -10);
  const stopped = fixture();
  controls(stopped, { steer: 1 }, 60);
  assert.equal(stopped.cars[0].yaw, 0);
});

test('handbrake releases lateral grip, increases rotation, and grip recovers on release', () => {
  const grip = fixture();
  const drift = fixture();
  place(grip.cars[0], 0, 0, 0, 8, 18);
  place(drift.cars[0], 0, 0, 0, 8, 18);
  controls(grip, idle, 15);
  controls(drift, { brake: true }, 15);
  assert.ok(drift.cars[0].vx > grip.cars[0].vx * 3);
  const slip = drift.cars[0].vx;
  controls(drift, idle, 30);
  assert.ok(Math.abs(drift.cars[0].vx) < slip * 0.1);
  place(grip.cars[0], 0, 0, 0, 0, 18);
  place(drift.cars[0], 0, 0, 0, 0, 18);
  controls(grip, { throttle: 1, steer: 1 }, 30);
  controls(drift, { throttle: 1, steer: 1, brake: true }, 30);
  assert.ok(drift.cars[0].yaw > grip.cars[0].yaw * 1.1);
  assert.ok(drift.cars[0].speed < grip.cars[0].speed);
});

test('boost accelerates harder, has a finite pool, and regenerates', () => {
  const normal = fixture();
  const boosted = fixture();
  controls(normal, { throttle: 1 }, 120, true);
  controls(boosted, { throttle: 1, boost: true }, 120, true);
  assert.ok(boosted.cars[0].speed > normal.cars[0].speed + 5);
  assert.ok(Math.abs(boosted.cars[0].boost - 40) < 1e-8);
  controls(boosted, { throttle: 1, boost: true }, 120, true);
  assert.equal(boosted.cars[0].boost, 0);
  assert.ok(boosted.cars[0].speed <= 28);
  controls(boosted, { throttle: 1, boost: true }, 60, true);
  assert.equal(boosted.cars[0].boost, 0, 'held empty boost must not recharge into infinite power');
  assert.ok(boosted.cars[0].speed <= 26);
  controls(boosted, idle, 300, true);
  assert.ok(boosted.cars[0].boost > 60 && boosted.cars[0].boost < 70);
  controls(boosted, idle, 300, true);
  assert.equal(boosted.cars[0].boost, 100);
});

test('closing speed determines damage; gentle and co-moving contacts are harmless', () => {
  const gentle = collision({ speed: 2 });
  assert.equal(gentle.cars[0].health, 100);
  assert.equal(gentle.cars[1].health, 100);
  const together = collision({ speed: 20, sameVelocity: true });
  assert.equal(together.cars[0].health, 100);
  assert.equal(together.cars[1].health, 100);
  const medium = collision({ speed: 10 });
  const hard = collision({ speed: 24 });
  assert.ok(medium.cars[1].health < 100);
  assert.ok(100 - hard.cars[1].health > (100 - medium.cars[1].health) * 2);
  assert.ok(hard.cars[0].vz < 24);
  assert.ok(hard.cars[1].vz > 2);
  assert.ok(hard.cars[0].damage.front > 0);
  assert.ok(hard.cars[1].damage.front > 0);
  assert.equal(hard.cars[1].damage.rear, 0);
  assert.equal(hard.events.filter(event => event.type === 'hit').length, 1);
  checkFinite(hard);
});

test('off-center impacts generate angular impulse and side hits damage the struck region', () => {
  const sim = collision({ speed: 24, offset: 1.1 });
  // The offset cars touch on the following frames rather than at their noses.
  for (let i = 0; i < 5; i++) sim.update(DT, idle);
  assert.ok(Math.abs(sim.cars[1].angularVelocity) > 0.2);
  assert.ok(sim.cars[1].health < 100);
  const side = fixture();
  parkOthers(side, [0, 1]);
  place(side.cars[0], -3.1, 0, Math.PI / 2, 20, 0);
  place(side.cars[1], 0, 0);
  side.update(DT, idle);
  assert.ok(side.cars[1].damage.left > 0);
  assert.equal(side.cars[1].damage.right, 0);
  assert.equal(side.cars[1].damage.rear, 0);
  const rear = fixture();
  parkOthers(rear, [0, 1]);
  place(rear.cars[0], 0, 0, 0, 0, 20);
  place(rear.cars[1], 0, 4.4);
  rear.update(DT, idle);
  assert.ok(rear.cars[1].damage.rear > 0);
  assert.equal(rear.cars[1].damage.front, 0);
});

test('stationary coincident cars separate without phantom damage or nonfinite normals', () => {
  const sim = fixture();
  parkOthers(sim, [0, 1]);
  place(sim.cars[0], 0, 0);
  place(sim.cars[1], 0, 0);
  for (let i = 0; i < 30; i++) sim.update(DT, idle);
  assert.ok(distance(sim.cars[0], sim.cars[1]) > 2);
  assert.equal(sim.cars[0].health, 100);
  assert.equal(sim.cars[1].health, 100);
  assert.equal(sim.score, 0);
  checkFinite(sim);
});

test('walls contain the entire rotated body, damage real impacts, and never award score', () => {
  for (const [x, z, yaw, vx, vz] of [
    [40.8, 0, Math.PI / 2, 24, 0], [-40.8, 0, -Math.PI / 2, -24, 0],
    [0, 29.8, 0, 0, 24], [0, -29.8, Math.PI, 0, -24],
    [41.2, 30.2, Math.PI / 4, 18, 18],
  ]) {
    const sim = fixture();
    place(sim.cars[0], x, z, yaw, vx, vz);
    sim.update(DT, idle);
    assert.ok(sim.cars[0].health < 100);
    assert.ok(sim.events.some(event => event.type === 'hit' && event.player));
    assert.equal(sim.score, 0);
    assert.equal(sim.combo, 0);
    checkFinite(sim);
    for (let i = 0; i < 90; i++) { sim.update(DT, { throttle: 1 }); checkFinite(sim); }
  }
});

test('player hits score once, combo chains then expires, and wrecks credit one takedown', () => {
  const sim = collision({ speed: 20 });
  assert.ok(sim.score > 0);
  assert.equal(sim.combo, 1);
  const score = sim.score;
  parkOthers(sim);
  place(sim.cars[0], 0, 0);
  for (let i = 0; i < 20; i++) sim.update(DT, idle);
  parkOthers(sim, [0, 2]);
  sim.cars[2].alive = true;
  sim.cars[2].health = 1;
  place(sim.cars[0], 0, 0, 0, 0, 20);
  place(sim.cars[2], 0, 4.4, Math.PI);
  sim.update(DT, idle);
  assert.equal(sim.combo, 2);
  assert.equal(sim.takedowns, 1);
  assert.ok(sim.score >= score + 1000);
  assert.equal(sim.cars[2].health, 0);
  assert.equal(sim.cars[2].alive, false);
  assert.equal(sim.events.filter(event => event.type === 'wreck' && event.player).length, 1);
  sim.update(DT, idle);
  assert.equal(sim.takedowns, 1);
  assert.ok(!sim.events.some(event => event.type === 'wreck'));
  controls(sim, idle, 250, true);
  assert.equal(sim.combo, 0);
});

test('AI-on-AI kills give no player score; passive player damage does not earn a hit', () => {
  const sim = fixture();
  parkOthers(sim, [0, 1, 2]);
  place(sim.cars[0], -25, -20);
  place(sim.cars[1], 0, 0, 0, 0, 24);
  place(sim.cars[2], 0, 4.4, Math.PI);
  sim.cars[2].health = 1;
  sim.update(DT, idle);
  assert.equal(sim.cars[2].alive, false);
  assert.equal(sim.score, 0);
  assert.equal(sim.takedowns, 0);
  assert.ok(sim.events.some(event => event.type === 'wreck' && !event.player));
  const passive = fixture();
  parkOthers(passive, [0, 1]);
  place(passive.cars[0], 0, 0);
  place(passive.cars[1], 0, 4.4, Math.PI, 0, -24);
  passive.update(DT, idle);
  assert.ok(passive.cars[0].health < 100);
  assert.equal(passive.score, 0);
  assert.equal(passive.combo, 0);
});

test('last survivor and player wreck finish the match and final state freezes', () => {
  for (const win of [true, false]) {
    const sim = fixture();
    for (const car of sim.cars) {
      car.alive = win ? car.isPlayer : !car.isPlayer;
      car.health = car.alive ? 100 : 0;
    }
    sim.update(DT, idle);
    assert.equal(sim.state, win ? 'won' : 'lost');
    const snapshot = structuredClone(sim.cars);
    const time = sim.time;
    sim.start();
    sim.update(0.25, { throttle: 1, boost: true });
    assert.deepEqual(sim.cars, snapshot);
    assert.equal(sim.time, time);
    assert.deepEqual(sim.events, []);
  }
  const lethal = fixture();
  lethal.cars[0].health = 1;
  place(lethal.cars[0], 0, 29.8, 0, 0, 24);
  lethal.update(DT, idle);
  assert.equal(lethal.state, 'lost');
  assert.equal(lethal.events.filter(event => event.type === 'wreck').length, 1);
});

test('180-second timeout ranks surviving HP, with a fair player tiebreak', () => {
  for (const [playerHP, enemyHP, expected] of [[90, 70, 'won'], [50, 80, 'lost'], [75, 75, 'won']]) {
    const sim = fixture();
    sim.time = 179.99;
    sim.cars[0].health = playerHP;
    sim.cars[9].health = enemyHP;
    sim.update(DT, idle);
    assert.equal(sim.time, 180);
    assert.equal(sim.state, expected);
  }
});

test('AI engages other AI, spreads its opening, and reverses to escape a blocked nose', () => {
  const sim = createSimulation().start();
  let aiHits = 0;
  for (let i = 0; i < 900 && sim.state === 'playing'; i++) {
    sim.update(DT, idle);
    aiHits += sim.events.filter(event => event.type === 'hit' && !event.player).length;
  }
  assert.ok(aiHits >= 5, `only ${aiHits} AI-on-AI hits`);
  assert.ok(sim.cars.filter(car => !car.isPlayer && car.health < 100).length >= 5);
  assert.ok(sim.cars[0].alive, 'idle player should survive the opening engagement');
  const blocked = fixture();
  parkOthers(blocked, [0, 1]);
  place(blocked.cars[0], 0, -20);
  let reversed = false;
  // A repeatable immovable obstruction: hold the bot at rest against the north wall.
  for (let i = 0; i < 180; i++) {
    place(blocked.cars[1], 0, 29.7);
    blocked.update(DT, idle);
    if (blocked.cars[1].vz < -0.02) reversed = true;
  }
  assert.ok(reversed, 'blocked AI must choose reverse rather than press the wall forever');
});

function playMatch(sim, inputForFrame) {
  sim.start();
  let playerHits = 0;
  let aiHits = 0;
  let playerWrecks = 0;
  let opening;
  let contested;
  for (let frame = 0; frame < 10802 && sim.state === 'playing'; frame++) {
    sim.update(DT, inputForFrame(sim));
    for (const event of sim.events) {
      if (event.type === 'hit') {
        if (event.player) playerHits++;
        else aiHits++;
      } else if (!sim.cars[0].alive && event.player) playerWrecks++;
    }
    if (frame === 899) opening = { hp: sim.cars[0].health, aiHits, playerHits };
    if (frame === 1799) contested = { hp: sim.cars[0].health, aiHits, playerHits };
    checkFinite(sim);
  }
  return { state: sim.state, time: sim.time, hp: sim.cars[0].health,
    score: sim.score, takedowns: sim.takedowns, playerHits, aiHits, playerWrecks,
    opening, contested };
}

test('passive parking is contested and loses the standard match, including held handbrake', t => {
  for (const [label, input] of [['idle', {}], ['held handbrake', { brake: true }]]) {
    const sim = createSimulation();
    const result = playMatch(sim, () => input);
    t.diagnostic(`${label}: ${JSON.stringify(result)}`);
    assert.equal(result.state, 'lost', `${label} must not win by waiting out AI attrition`);
    assert.equal(result.hp, 0, 'loss must come from actual collision damage');
    assert.equal(result.playerWrecks, 1);
    assert.ok(result.time > 30 && result.time <= 180, 'allow time to react, but finish within the match');
    assert.ok(result.opening.hp > 60, 'no overwhelming opening dogpile');
    assert.ok(result.opening.aiHits >= 10 && result.opening.aiHits > result.opening.playerHits,
      'the opening must remain predominantly AI-on-AI');
    assert.ok(result.contested.hp < 95 && result.contested.playerHits >= 5,
      'parking must draw real pressure before most opponents die');
    if (label === 'idle') {
      sim.reset();
      assert.deepEqual(playMatch(sim, () => input), result,
        'reset must also clear camping memory and replay the same full match');
    }
  }
});

test('AI can strike a perimeter camper and close inside its turning circle', () => {
  for (const edge of [false, true]) {
    const sim = fixture();
    parkOthers(sim, [0, 1]);
    sim.cars[9].alive = false;
    sim.cars[9].health = 0;
    const player = sim.cars[0];
    const bot = sim.cars[1];
    // One surviving opponent eliminates target-selection luck from the test.
    if (edge) {
      place(player, 40.6, 30.6, Math.PI / 2);
      place(bot, 24, 16, Math.atan2(player.x - 24, player.z - 16));
    } else {
      place(player, 0, 0);
      place(bot, 6, 0, 0, 0, 10);
    }
    let playerHits = 0;
    for (let frame = 0; frame < 900 && sim.state === 'playing'; frame++) {
      sim.update(DT, { brake: true });
      playerHits += sim.events.filter(event => event.type === 'hit' && event.player).length;
      checkFinite(sim);
    }
    assert.ok(playerHits > 0, `${edge ? 'edge' : 'close'} target must actually be contacted`);
    assert.ok(player.health < 95, 'pursuit must produce damaging contact, not endless circling');
  }
});

test('ordinary active steering can still win full matches without state manipulation', t => {
  // Same visible-position oval driver used for the pre-change comparison, not
  // prerecorded winning inputs. No boost, healing, enemy edits, or AI access.
  const result = playMatch(createSimulation(), sim => {
    const p = sim.cars[0];
    const ahead = Math.atan2(p.x / 25, p.z / 18) + 0.5;
    const desired = Math.atan2(25 * Math.sin(ahead) - p.x, 18 * Math.cos(ahead) - p.z);
    const error = Math.atan2(Math.sin(desired - p.yaw), Math.cos(desired - p.yaw));
    return { throttle: 0.7, steer: Math.max(-1, Math.min(1, error * 1.6)) };
  });
  t.diagnostic(`active oval driver: ${JSON.stringify(result)}`);
  assert.equal(result.state, 'won', 'active driving must retain a demonstrated route to victory');
  assert.ok(result.hp > 10);
  assert.ok(result.score > 500 && result.takedowns >= 1, 'active player still participates in combat');
});

test('invalid dt/input is safe, catch-up is bounded, and reset replays identical physics and AI', () => {
  const sim = createSimulation().start();
  for (const dt of [0, -1, NaN, Infinity, undefined]) sim.update(dt, { throttle: NaN, steer: Infinity });
  assert.equal(sim.time, 0);
  sim.update(10, null);
  assert.ok(Math.abs(sim.time - 0.25) < 1e-12);
  sim.update(DT, { throttle: NaN, steer: Infinity, boost: true });
  checkFinite(sim);
  function replay() {
    sim.start();
    const events = [];
    for (let i = 0; i < 900; i++) {
      sim.update(DT, { throttle: i % 180 < 140 ? 1 : -1,
        steer: Math.sin(i * 0.031), brake: i % 240 > 210, boost: i % 120 < 40 });
      events.push(...sim.events);
    }
    return structuredClone({ cars: sim.cars, time: sim.time, state: sim.state,
      events, score: sim.score, combo: sim.combo, takedowns: sim.takedowns });
  }
  sim.reset();
  const freshCars = sim.cars;
  const first = replay();
  sim.reset();
  assert.notEqual(sim.cars, freshCars);
  assert.deepEqual(sim.cars, createSimulation().cars);
  assert.deepEqual([sim.time, sim.score, sim.combo, sim.takedowns], [0, 0, 0, 0]);
  assert.deepEqual(sim.events, []);
  assert.equal(sim.state, 'ready');
  assert.deepEqual(replay(), first);
});

test('full three-minute stress run keeps all bodies finite, bounded, and ends on time', () => {
  const sim = createSimulation().start();
  let hits = 0;
  // Repair between frames so ten moving bodies stress the solver for the entire
  // match, instead of reducing this to an early player death followed by no-ops.
  for (let i = 0; i < 10802 && sim.state === 'playing'; i++) {
    for (const car of sim.cars) { car.health = 100; car.alive = true; }
    sim.update(DT, { throttle: i % 420 < 360 ? 1 : -1,
      steer: Math.sin(i * 0.013), brake: i % 180 > 150, boost: i % 240 < 100 });
    hits += sim.events.filter(event => event.type === 'hit').length;
    checkFinite(sim);
  }
  assert.equal(sim.time, 180);
  assert.ok(['won', 'lost'].includes(sim.state));
  assert.ok(hits > 100, `stress run had only ${hits} collisions`);
});
