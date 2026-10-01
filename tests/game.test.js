import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, DEFS, MAP_SIZE } from '../src/game.js';

const find = (game, kind, team = 'player') => game.state.entities.find(e => e.kind === kind && e.team === team);
const all = (game, kind, team = 'player') => game.state.entities.filter(e => e.kind === kind && e.team === team);
const army = game => game.state.entities.filter(e => e.team === 'player' && ['hero', 'footman', 'archer'].includes(e.kind));
const ids = entities => entities.map(e => e.id);
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be close to ${expected}`);

// Advance through observable play, with a deadline rather than depending on
// internal timers, path caches, combat formulas, or a particular frame count.
function until(game, condition, deadline, label) {
  const end = game.state.time + deadline;
  while (!condition() && game.state.status === 'playing' && game.state.time < end) game.update(0.2);
  assert.ok(condition(), `${label} (time=${game.state.time.toFixed(1)}, status=${game.state.status})`);
}

test('a new skirmish is ready to play, with economy, army, objective, and preparation time', () => {
  const game = new Game();
  assert.equal(MAP_SIZE, 110);
  assert.equal(game.state.status, 'playing');
  assert.equal(all(game, 'worker').length, 4);
  assert.equal(all(game, 'footman').length, 4);
  assert.equal(all(game, 'hero').length, 1);
  assert.deepEqual([find(game, 'hall').x, find(game, 'hall').z], [-28, 26]);
  assert.deepEqual([find(game, 'stronghold', 'enemy').x, find(game, 'stronghold', 'enemy').z], [29, -28]);
  assert.ok(game.canAfford('barracks'));
  assert.ok(game.canAfford('farm'));
  assert.ok(game.state.food <= game.state.foodCap);
  assert.ok(new Set(ids(game.state.entities)).size === game.state.entities.length);
  for (const entity of game.state.entities) {
    assert.ok(DEFS[entity.kind]?.name);
    assert.ok(entity.radius > 0 && entity.hp > 0 && entity.hp <= entity.maxHp);
  }
  game.update(90);
  assert.equal(game.state.status, 'playing');
  assert.equal(find(game, 'hall').hp, find(game, 'hall').maxHp);
  assert.equal(army(game).length, 5);
  assert.equal(game.state.entities.filter(e => e.team === 'enemy').length, 5);
  assert.ok(game.state.gold > 350 && game.state.lumber > 220);
});

test('gold and lumber are carried, then credited only on return to the hall', () => {
  for (const [resourceKind, currency] of [['goldmine', 'gold'], ['tree', 'lumber']]) {
    const game = new Game();
    const workers = all(game, 'worker');
    game.command(ids(workers), { type: 'stop' });
    const worker = workers[0];
    const resource = find(game, resourceKind, 'neutral');
    const balance = game.state[currency];
    const supply = resource.resource;
    assert.ok(game.command([worker.id], { type: 'gather', targetId: resource.id }));
    until(game, () => worker.carrying >= 1, 15, 'worker starts harvesting');
    assert.equal(game.state[currency], balance, 'harvested goods are not instant income');
    assert.ok(resource.resource < supply);
    assert.ok(gap(worker, resource) < gap(find(game, 'hall'), resource));
    until(game, () => game.state[currency] > balance, 20, 'worker deposits goods');
    close(game.state[currency] - balance, 12);
    close(worker.carrying, 0);
    assert.equal(worker.order.type, 'gather', 'worker repeats the route automatically');
    until(game, () => game.state[currency] >= balance + 24, 20, 'second delivery');
  }
});

test('depleted timber still gets delivered and workers find another tree', () => {
  const game = new Game();
  game.command(ids(all(game, 'worker')), { type: 'stop' });
  const worker = all(game, 'worker')[0];
  const tree = find(game, 'tree', 'neutral');
  tree.resource = 5; // A nearly exhausted tree is a realistic world fixture.
  const before = game.state.lumber;
  game.command([worker.id], { type: 'gather', targetId: tree.id });
  until(game, () => game.state.lumber > before, 30, 'last timber delivery');
  close(game.state.lumber - before, 5);
  assert.ok(!game.state.entities.some(e => e.id === tree.id));
  until(game, () => worker.carrying > 0 && worker.order.targetId !== tree.id, 20, 'replacement tree harvested');
});

test('construction spends immediately, requires a worker, and returns builders to gathering on completion', () => {
  const game = new Game();
  const workers = all(game, 'worker');
  game.command(ids(workers), { type: 'stop' });
  const worker = workers[0];
  const before = { gold: game.state.gold, lumber: game.state.lumber };
  assert.ok(game.build('barracks', -12, 27, [worker.id]));
  const site = find(game, 'barracks');
  assert.equal(game.state.gold, before.gold - DEFS.barracks.gold);
  assert.equal(game.state.lumber, before.lumber - DEFS.barracks.lumber);
  assert.ok(site.buildProgress < 1);
  assert.equal(game.train(site.id, 'footman'), false);
  game.update(9);
  assert.ok(site.buildProgress > 0 && site.buildProgress < 1);
  game.command([worker.id], { type: 'stop' });
  const paused = site.buildProgress;
  game.update(5);
  close(site.buildProgress, paused);
  // Building again must not silently charge for or overwrite the paused site.
  const wallet = game.state.gold;
  assert.equal(game.build('barracks', site.x, site.z, [worker.id]), false);
  assert.equal(game.state.gold, wallet);
  // A fresh game verifies a complete construction cycle through the public API.
  const other = new Game();
  const builder = all(other, 'worker')[0];
  assert.ok(other.build('barracks', -12, 27, [builder.id]));
  until(other, () => find(other, 'barracks').buildProgress === 1, 40, 'barracks completes');
  assert.equal(builder.order.type, 'gather', 'builder resumes its previous economic task');
  assert.ok(other.train(find(other, 'barracks').id, 'footman'));
});

test('a different worker resumes an interrupted site without payment, leaves its old site, and returns to gathering', () => {
  const game = new Game();
  const [original, replacement, ...idle] = all(game, 'worker');
  const gatherOrder = { ...replacement.order };
  game.command(ids(idle), { type: 'stop' });
  assert.ok(game.build('barracks', -12, 27, [original.id]));
  assert.ok(game.build('farm', -17, 36, [replacement.id]));
  const site = find(game, 'barracks');
  const oldSite = find(game, 'farm');
  game.update(9);
  assert.ok(site.buildProgress > 0 && site.buildProgress < 1);
  assert.ok(game.command([original.id], { type: 'move', x: -45, z: 10 }));
  const interrupted = site.buildProgress;
  game.update(3);
  close(site.buildProgress, interrupted, 1e-9);
  assert.ok(oldSite.buildProgress > 0 && oldSite.buildProgress < 1);

  const wallet = { gold: game.state.gold, lumber: game.state.lumber };
  for (const invalidSite of [find(game, 'hall'), find(game, 'stronghold', 'enemy'), find(game, 'goldmine', 'neutral')]) {
    assert.equal(game.assistBuild(invalidSite.id, [replacement.id]), false);
    assert.ok(game.state.message.length > 0);
  }
  for (const invalidWorkers of [null, [], [find(game, 'hero').id], ids(all(game, 'footman', 'enemy')), [-1]]) {
    assert.equal(game.assistBuild(site.id, invalidWorkers), false);
    assert.ok(game.state.message.length > 0);
  }
  assert.ok(game.assistBuild(site.id, [replacement.id, replacement.id]));
  assert.ok(game.assistBuild(site.id, [replacement.id]), 'repeated right-clicks preserve the original gather order');
  assert.deepEqual({ gold: game.state.gold, lumber: game.state.lumber }, wallet);
  assert.deepEqual(replacement.order, { type: 'build', targetId: site.id });
  assert.equal(site.builders.filter(id => id === replacement.id).length, 1);
  assert.ok(!oldSite.builders.includes(replacement.id));
  const abandoned = oldSite.buildProgress;

  until(game, () => site.buildProgress === 1, 40, 'replacement worker finishes the existing barracks');
  assert.equal(oldSite.buildProgress, abandoned, 'the previous site remains paused');
  assert.deepEqual({ gold: game.state.gold, lumber: game.state.lumber }, wallet, 'resuming and completion incur no second payment');
  assert.deepEqual(replacement.order, gatherOrder, 'handoff restores gathering, not the abandoned build order');
  assert.equal(game.assistBuild(site.id, [replacement.id]), false, 'completed buildings cannot be assisted');
  assert.ok(game.state.message.length > 0);
  assert.deepEqual(replacement.order, gatherOrder, 'rejected assistance leaves the worker gathering');
  until(game, () => replacement.carrying > 0, 25, 'replacement worker actually returns to harvesting');
});

test('farms unlock supply and training queues spend once, reserve food, and produce in order', () => {
  const game = new Game();
  const workers = all(game, 'worker');
  assert.ok(game.build('barracks', -12, 27, [workers[0].id]));
  until(game, () => find(game, 'barracks').buildProgress === 1, 40, 'barracks completes');
  const barracks = find(game, 'barracks');
  const cap = game.state.foodCap;
  assert.ok(game.build('farm', -17, 36, [workers[2].id]));
  assert.equal(game.state.foodCap, cap, 'unfinished farms provide no capacity');
  until(game, () => find(game, 'farm').buildProgress === 1, 30, 'farm completes');
  assert.equal(game.state.foodCap, cap + 10);
  game.command(ids(workers), { type: 'stop' });
  const gold = game.state.gold, lumber = game.state.lumber, food = game.state.food;
  assert.ok(game.train(barracks.id, 'footman'));
  assert.ok(game.train(barracks.id, 'archer'));
  assert.equal(game.state.gold, gold - DEFS.footman.gold - DEFS.archer.gold);
  assert.equal(game.state.lumber, lumber - DEFS.archer.lumber);
  assert.equal(game.state.food, food + DEFS.footman.food + DEFS.archer.food);
  assert.equal(barracks.queue.length, 2);
  until(game, () => all(game, 'footman').length === 5, 20, 'footman finishes first');
  assert.equal(all(game, 'archer').length, 0);
  assert.equal(barracks.queue.length, 1);
  until(game, () => all(game, 'archer').length === 1, 20, 'archer finishes second');
  assert.equal(barracks.queue.length, 0);
  assert.equal(game.state.food, food + DEFS.footman.food + DEFS.archer.food, 'reserved food converts into occupied food');
});

test('food limits and invalid actions cannot spend resources or commandeer enemies', () => {
  const game = new Game();
  const hall = find(game, 'hall');
  game.command(ids(all(game, 'worker')), { type: 'stop' });
  // Fill the remaining starting supply using real training reservations.
  while (game.state.food < game.state.foodCap) assert.ok(game.train(hall.id, 'worker'));
  const balance = { gold: game.state.gold, lumber: game.state.lumber };
  assert.equal(game.canAfford('worker'), false);
  assert.equal(game.train(hall.id, 'worker'), false);
  assert.equal(game.build('farm', hall.x, hall.z, ids(all(game, 'worker'))), false);
  assert.equal(game.build('tower', NaN, 0, []), false);
  assert.equal(game.train(hall.id, 'hero'), false);
  assert.equal(game.canAfford('constructor'), false);
  assert.equal(game.command(ids(all(game, 'footman', 'enemy')), { type: 'move', x: 0, z: 0 }), false);
  assert.equal(game.command(ids(army(game)), { type: 'move', x: Infinity, z: 0 }), false);
  assert.equal(game.command([find(game, 'hero').id], { type: 'gather', targetId: find(game, 'goldmine', 'neutral').id }), false);
  assert.equal(game.command(null, null), false);
  assert.deepEqual({ gold: game.state.gold, lumber: game.state.lumber }, balance);
  assert.ok(game.state.message.length > 0);
});

test('formations travel around buildings and mines, separate, and obey stop', () => {
  const game = new Game();
  const troops = army(game);
  const destination = { x: -47, z: 31 };
  assert.ok(game.command(ids(troops), { type: 'move', ...destination }));
  until(game, () => troops.every(e => gap(e, destination) < 6), 25, 'formation navigates past the hall and mine');
  game.update(2);
  for (let i = 0; i < troops.length; i++) {
    assert.ok(Math.abs(troops[i].x) < MAP_SIZE / 2 && Math.abs(troops[i].z) < MAP_SIZE / 2);
    for (let j = i + 1; j < troops.length; j++) assert.ok(gap(troops[i], troops[j]) >= (troops[i].radius + troops[j].radius) * 0.9);
    for (const obstacle of [find(game, 'hall'), find(game, 'goldmine', 'neutral')]) assert.ok(gap(troops[i], obstacle) >= troops[i].radius + obstacle.radius);
  }
  game.command(ids(troops), { type: 'move', x: 0, z: 0 });
  game.update(1);
  game.command(ids(troops), { type: 'stop' });
  const positions = troops.map(e => ({ x: e.x, z: e.z }));
  game.update(3);
  troops.forEach((e, i) => assert.ok(gap(e, positions[i]) < 0.5, 'stopped troops do not continue their old route'));
});

test('move ignores enemies, attack chases and damages, and attack-move acquires defenders', () => {
  const game = new Game();
  const hero = find(game, 'hero');
  const defender = find(game, 'footman', 'enemy');
  const original = defender.hp;
  assert.ok(game.command([hero.id], { type: 'move', x: 15, z: -17 }));
  until(game, () => gap(hero, { x: 15, z: -17 }) < 3, 20, 'hero reaches the enemy approach');
  assert.equal(hero.order.type, 'move');
  assert.equal(defender.hp, original, 'a pure move order does not attack along the route');
  assert.ok(game.command([hero.id], { type: 'attack', targetId: defender.id }));
  until(game, () => defender.hp < original, 10, 'hero chases and strikes the target');
  assert.ok(gap(hero, defender) < 5);
  const others = all(game, 'footman');
  game.command(ids(others), { type: 'attackMove', x: 29, z: -28 });
  until(game, () => game.state.kills > 0, 30, 'advancing troops engage and kill a defender');
  assert.ok(game.state.entities.every(e => e.hp > 0), 'fallen units leave the live entity list');
});

test('Sunburst heals allies, damages enemies, has a cooldown, and rejects distant casts', () => {
  const game = new Game();
  const hero = find(game, 'hero');
  const enemy = find(game, 'footman', 'enemy');
  const ally = find(game, 'footman');
  // Arrange a wounded frontline cluster to test the spell as a tactical action.
  hero.x = 0; hero.z = 0; hero.hp -= 150;
  ally.x = 3; ally.z = 0; ally.hp -= 120;
  enemy.x = 5; enemy.z = 0;
  const enemyHp = enemy.hp, allyHp = ally.hp, heroHp = hero.hp;
  assert.equal(game.cast(hero.id, 40, 40), false);
  assert.ok(game.cast(hero.id, 2, 0));
  assert.ok(enemy.hp < enemyHp);
  assert.ok(ally.hp > allyHp && hero.hp > heroHp);
  assert.ok(hero.spellCooldown > 0);
  const after = enemy.hp;
  assert.equal(game.cast(hero.id, 2, 0), false);
  assert.equal(enemy.hp, after);
  game.command([hero.id, ally.id], { type: 'move', x: -15, z: 0 });
  game.update(23);
  assert.ok(game.cast(hero.id));
});

test('raids are delayed, announce themselves, and grow into an unattended defeat', () => {
  const game = new Game();
  game.update(90);
  assert.equal(game.state.entities.filter(e => e.team === 'enemy').length, 5);
  until(game, () => game.state.events.some(e => /raid 1/.test(e)), 25, 'first raid is announced after preparation');
  assert.ok(game.state.time >= 90);
  const first = game.state.entities.filter(e => e.team === 'enemy' && ['footman', 'archer'].includes(e.kind)).length;
  assert.ok(first > 4);
  until(game, () => game.state.events.some(e => /raid 2/.test(e)), 75, 'second raid arrives');
  until(game, () => game.state.status === 'defeat', 240, 'unattended settlement eventually falls');
  assert.ok(game.state.time > 150 && game.state.time < 420);
  assert.equal(find(game, 'hall'), undefined);
  assert.match(game.state.message, /Defeat/);
  const finalTime = game.state.time;
  game.update(10);
  assert.equal(game.state.time, finalTime, 'battle stops after defeat');
});

test('economic preparation, reinforcement, tactical advance, and hero support win a full skirmish', () => {
  const game = new Game();
  const workers = all(game, 'worker');
  assert.ok(game.build('barracks', -12, 27, [workers[0].id]));
  until(game, () => find(game, 'barracks').buildProgress === 1, 40, 'barracks is ready');
  assert.ok(game.build('farm', -17, 36, [workers[2].id]));
  until(game, () => find(game, 'farm').buildProgress === 1 && game.canAfford('archer'), 30, 'supply and resources are ready');
  const barracks = find(game, 'barracks');
  assert.ok(game.train(barracks.id, 'archer'));
  until(game, () => game.canAfford('footman'), 20, 'next reinforcement is affordable');
  assert.ok(game.train(barracks.id, 'footman'));
  until(game, () => all(game, 'archer').length === 1 && all(game, 'footman').length === 5, 40, 'reinforcements join');
  const troops = army(game);
  assert.ok(game.command(ids(troops), { type: 'attackMove', x: 29, z: -28 }));
  const deadline = game.state.time + 180;
  while (game.state.status === 'playing' && game.state.time < deadline) {
    const hero = find(game, 'hero');
    if (hero && hero.spellCooldown <= 0 && game.state.entities.some(e => e.team === 'enemy' && gap(hero, e) < 10)) game.cast(hero.id);
    game.update(0.5);
  }
  assert.equal(game.state.status, 'victory', game.state.message);
  assert.equal(find(game, 'stronghold', 'enemy'), undefined);
  assert.ok(find(game, 'hall'));
  assert.ok(game.state.kills >= 3);
  assert.ok(game.state.time < 300, 'a reinforced push wins within a short skirmish');
  assert.match(game.state.message, /Victory/);
  const finished = game.state.time;
  const wallet = game.state.gold;
  game.update(30);
  assert.equal(game.state.time, finished);
  assert.equal(game.build('farm', 0, 0, ids(all(game, 'worker'))), false);
  assert.equal(game.train(barracks.id, 'footman'), false);
  assert.equal(game.state.gold, wallet);
  game.reset();
  assert.deepEqual(game.state, new Game().state, 'restart restores a fresh playable scenario after victory');
});

test('restart after defeat restores the army, economy, objective, and delayed raid schedule', () => {
  const game = new Game();
  game.update(420);
  assert.equal(game.state.status, 'defeat');
  const oldState = game.state;
  game.reset();
  assert.notEqual(game.state, oldState);
  assert.deepEqual(game.state, new Game().state);
  game.update(90);
  assert.equal(game.state.status, 'playing');
  assert.equal(game.state.entities.filter(e => e.team === 'enemy').length, 5);
  assert.equal(find(game, 'hall').hp, find(game, 'hall').maxHp);
});

test('large headless time advances and frame-sized updates agree; invalid dt is harmless', () => {
  const batched = new Game(), framed = new Game();
  batched.update(30);
  for (let i = 0; i < 600; i++) framed.update(0.05);
  close(batched.state.gold, framed.state.gold);
  close(batched.state.lumber, framed.state.lumber);
  close(batched.state.time, framed.state.time);
  batched.state.entities.forEach((e, i) => {
    const other = framed.state.entities[i];
    assert.equal(e.id, other.id);
    assert.ok(gap(e, other) < 0.001);
    close(e.hp, other.hp);
  });
  const before = structuredClone(batched.state);
  for (const dt of [0, -1, NaN, Infinity, undefined]) batched.update(dt);
  assert.deepEqual(batched.state, before);
});
