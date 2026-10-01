import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGame } from '../src/game.js';
import { createNavigation } from '../src/game-navigation.js';

// Exercise the production game and procedural visuals with real Three.js
// geometry/rays. Only audio output is recorded; no browser or renderer is needed.
beforeEach(t => {
  let seed = 1986;
  t.mock.method(Math, 'random', () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  });
});

function fixture(t, extra = {}, authority = true) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 100);
  const events = [], sounds = [];
  const world = {
    colliders: [], playerSpawn: [0, 1.7, 10], spawnPoints: [[0, 0, -12]], ...extra,
  };
  const game = createGame({
    THREE, scene, camera, world,
    audio: { play: (...args) => sounds.push(args) },
    onEvent: (type, data) => events.push({ type, data }),
  });
  t.after(() => game.dispose());
  game.setAuthority(authority);
  game.start();
  return { game, camera, scene, events, sounds };
}

function advance(game, duration, input = {}) {
  const frames = Math.ceil(duration * 60);
  for (let i = 0; i < frames; i++) {
    game.update(duration / frames, { keys: new Set(), ...input });
  }
}

function killLocal({ game, camera }) {
  advance(game, 0.12);
  const enemy = game.getSnapshot().enemies[0];
  assert.ok(enemy, 'a live target must exist');
  camera.lookAt(enemy.x, 1.65, enemy.z);
  assert.equal(game.shoot(), true);
}

function shotAt(enemy, height, shotId) {
  const origin = new THREE.Vector3(0, height, 10);
  return {
    origin: origin.toArray(),
    direction: new THREE.Vector3(enemy.x, height, enemy.z).sub(origin).normalize().toArray(),
    damage: 999999, // The host must use its weapon damage, not this client value.
    shotId,
  };
}

function standNearSupply({ game, camera }) {
  const [x, , z] = game.getState().supplyPosition;
  camera.position.set(x, 1.7, z + 1.2);
}

// JSON round-tripping also checks the actual serialization boundary without
// coupling game behavior tests to the WebSocket server's separate test suite.
const snapshotFrom = game => JSON.parse(JSON.stringify(game.getSnapshot()));

test('start resets the run and weapon; reset/dispose clean up actors', t => {
  const { game, camera, scene } = fixture(t);
  const firstRun = game.getSnapshot().runId;
  assert.equal(game.getState().phase, 'playing');
  assert.equal(game.getState().wave, 1);
  assert.equal(game.getState().enemies, 8);
  assert.equal(scene.getObjectByName('Kestrel-9-first-person').visible, true);

  game.applyDamage(25);
  assert.equal(game.shoot(), true);
  assert.equal(game.reload(), true);
  game.update(0.05, { keys: new Set(['KeyD']), lookX: 40 });
  game.start();
  const restarted = game.getState();
  assert.equal(restarted.health, 100);
  assert.equal(restarted.ammo, 30);
  assert.equal(restarted.reserve, 120);
  assert.equal(restarted.score, 0);
  assert.equal(restarted.kills, 0);
  assert.equal(restarted.reloading, false);
  assert.equal(restarted.yaw, 0);
  assert.deepEqual(camera.position.toArray(), [0, 1.7, 10]);
  assert.notEqual(game.getSnapshot().runId, firstRun);
  assert.equal(game.getSnapshot().enemies.length, 1);

  game.reset();
  assert.equal(game.getState().phase, 'menu');
  assert.equal(game.getSnapshot().enemies.length, 0);
  assert.equal(scene.getObjectByName('Kestrel-9-first-person').visible, false);
  game.dispose();
  assert.equal(scene.getObjectByName('game-actors-and-effects'), undefined);
  assert.equal(scene.getObjectByName('Kestrel-9-first-person'), undefined);
});

test('co-op deployment slots separate survivors while preserving navigable spawn positions', t => {
  const { game, camera } = fixture(t);
  const positions=[];
  for(let spawnIndex=0;spawnIndex<4;spawnIndex++){
    game.start({spawnIndex});
    positions.push(camera.position.clone());
    assert.equal(game.getState().health,100);
    assert.equal(camera.position.y,1.7);
  }
  for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)assert.ok(positions[a].distanceTo(positions[b])>=1.3);
});

test('mouse look uses frame deltas; movement collides and sprint consumes stamina', t => {
  const blocked = fixture(t, { colliders: [{ minX: -3, maxX: 3, minZ: 4, maxZ: 6 }] });
  const open = fixture(t);
  blocked.game.update(0.01, { lookX: 20, lookY: -10 });
  open.game.update(0.08, { lookX: 20, lookY: -10 });
  assert.notEqual(blocked.game.getState().yaw, 0);
  assert.equal(blocked.game.getState().yaw, open.game.getState().yaw);
  assert.equal(blocked.game.getState().pitch, open.game.getState().pitch);

  blocked.game.start();
  advance(blocked.game, 2, { keys: new Set(['KeyW', 'ShiftLeft']) });
  assert.ok(blocked.camera.position.z < 7, 'player should reach the wall');
  assert.ok(blocked.camera.position.z >= 6.3 - 0.001, 'player must stop outside the wall');
  assert.ok(blocked.game.getState().stamina < 100);
});

test('navigation reaches a target by detouring around a blocking obstacle', () => {
  const nav = createNavigation([{ minX: -3, maxX: 3, minZ: -2, maxZ: 2 }]);
  const target = { x: 0, z: 8 }, current = { x: 0, z: -8 };
  const field = nav.field(target.x, target.z);
  assert.equal(nav.clearLine(current.x, current.z, target.x, target.z), false);
  let widest = 0;
  for (let i = 0; i < 1500; i++) {
    const waypoint = nav.waypoint(current.x, current.z, target, field);
    const dx = waypoint.x - current.x, dz = waypoint.z - current.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 0.001) {
      const step = Math.min(distance, 0.035);
      nav.move(current, dx / distance * step, dz / distance * step);
    }
    assert.equal(nav.free(current.x, current.z), true, 'every step must remain collision-free');
    widest = Math.max(widest, Math.abs(current.x));
  }
  assert.ok(widest > 3.3, 'route must clear the obstacle plus actor radius');
  assert.ok(Math.hypot(current.x - target.x, current.z - target.z) < 0.1, JSON.stringify(current));
});

test('headshots kill and award points, but a wall blocks the same ray', t => {
  const open = fixture(t);
  killLocal(open);
  assert.equal(open.game.getState().kills, 1);
  assert.equal(open.game.getState().score, 150);
  assert.ok(open.events.some(event => event.type === 'hit' && event.data.headshot && event.data.confirmed));
  assert.ok(open.events.some(event => event.type === 'kill' && event.data.headshot && !event.data.remote));

  const blocked = fixture(t, { colliders: [{ minX: -3, maxX: 3, minZ: -2, maxZ: 2 }] });
  const enemy = blocked.game.getSnapshot().enemies[0];
  const result = blocked.game.applyRemoteShot(shotAt(enemy, 1.65, 'wall'));
  assert.equal(result.hit, false);
  assert.equal(blocked.game.getSnapshot().enemies[0].health, enemy.health);
  assert.equal(blocked.events.some(event => event.type === 'hit' || event.type === 'kill'), false);
});

test('body shots use host-owned damage and duplicate/invalid remote shots are rejected', t => {
  const { game } = fixture(t);
  const enemy = game.getSnapshot().enemies[0];
  const shot = shotAt(enemy, 1.18, 'duplicate');
  const result = game.applyRemoteShot(shot);
  assert.equal(result.damage, 32);
  assert.equal(result.headshot, false);
  assert.equal(result.killed, false);
  assert.equal(game.getSnapshot().enemies[0].health, enemy.health - 32);
  assert.equal(game.applyRemoteShot(shot), null);
  assert.equal(game.applyRemoteShot({ ...shot, origin: [NaN, 0, 0], shotId: 'invalid' }), null);
  assert.equal(game.getSnapshot().enemies[0].health, enemy.health - 32);
});

test('automatic fire consumes ammunition; timed reload conserves total rounds', t => {
  const { game, sounds } = fixture(t);
  advance(game, 0.8, { firing: true });
  const before = game.getState();
  assert.ok(before.ammo < 25, 'holding fire must produce multiple shots');
  assert.equal(game.reload(), true);
  assert.equal(game.reload(), false, 'cannot restart an ongoing reload');
  assert.equal(game.shoot(), false);
  advance(game, 1);
  assert.equal(game.getState().reloading, true);
  assert.equal(game.getState().ammo, before.ammo, 'rounds transfer only when reload completes');
  assert.equal(game.getState().reserve, before.reserve);
  advance(game, 1);
  const after = game.getState();
  assert.equal(after.reloading, false);
  assert.equal(after.ammo, 30);
  assert.equal(after.reserve, before.reserve - (30 - before.ammo));
  assert.equal(after.ammo + after.reserve, before.ammo + before.reserve);
  assert.equal(game.reload(), false, 'full magazines cannot consume reserve');
  assert.ok(sounds.some(([name]) => name === 'reload'));
});

test('clearing a wave grants intermission, score-funded resupply, and a larger next wave', t => {
  const f = fixture(t);
  standNearSupply(f);
  assert.equal(f.game.interact(), false, 'nearby resupply still requires enough score');
  assert.equal(f.game.getState().reserve, 120);
  f.camera.position.set(0, 1.7, 10);

  const waveSize = f.game.getState().enemies;
  for (let i = 0; i < waveSize; i++) {
    if (!f.game.getSnapshot().enemies.length) advance(f.game, 1.1);
    killLocal(f);
  }
  advance(f.game, 0.1);
  assert.equal(f.game.getState().phase, 'intermission');
  assert.equal(f.game.getState().enemies, 0);
  assert.equal(f.game.getState().kills, waveSize);
  assert.equal(f.game.getState().score, 1325);
  assert.ok(f.game.getState().phaseTime > 11);
  assert.ok(f.events.some(event => event.type === 'wave' && event.data.phase === 'intermission'));

  assert.equal(f.game.interact(), false, 'sufficient score cannot buy supplies from a distance');
  standNearSupply(f);
  f.game.update(0, { keys: new Set() });
  assert.match(f.game.getState().interaction, /RESUPPLY/);
  assert.equal(f.game.interact(), true);
  assert.equal(f.game.getState().score, 1025);
  assert.equal(f.game.getState().reserve, 180);
  assert.equal(f.game.interact(), false, 'full reserve must not charge again');
  assert.equal(f.game.getState().score, 1025);

  advance(f.game, 5);
  assert.equal(f.game.getState().phase, 'intermission', 'next wave must wait for the countdown');
  advance(f.game, 7.1);
  assert.equal(f.game.getState().phase, 'playing');
  assert.equal(f.game.getState().wave, 2);
  assert.equal(f.game.getState().enemies, 11);
  assert.ok(f.events.some(event => event.type === 'wave' && event.data.wave === 2));
});

test('guest shots need host receipts to award kills, exactly once, preserving local player state', t => {
  const host = fixture(t), guest = fixture(t, {}, false);
  const snapshot = snapshotFrom(host.game);
  assert.equal(guest.game.applySnapshot(snapshot), true);
  assert.equal(guest.game.applySnapshot(snapshot), false, 'stale snapshots must be rejected');
  guest.game.update(0.05, { keys: new Set(['KeyD']) });
  assert.ok(guest.camera.position.x > 0, 'guest movement is local');
  guest.game.applyDamage(10);

  const enemy = snapshot.enemies[0];
  guest.camera.lookAt(enemy.x, 1.65, enemy.z);
  assert.equal(guest.game.shoot(), true);
  const shotEvent = guest.events.find(event => event.type === 'shot');
  assert.ok(shotEvent);
  const shot = JSON.parse(JSON.stringify(shotEvent.data));
  assert.equal(guest.game.getSnapshot().enemies[0].health, enemy.health, 'prediction must not change enemy health');
  assert.equal(guest.game.getState().kills, 0);
  assert.equal(guest.game.getState().score, 0);
  assert.ok(guest.events.some(event => event.type === 'hit' && event.data.confirmed === false));

  const result = host.game.applyRemoteShot({ ...shot, playerId: 'guest' });
  assert.equal(result.killed, true);
  const confirmed = snapshotFrom(host.game);
  assert.ok(confirmed.receipts.some(receipt => receipt.shotId === shot.shotId && receipt.killed));
  const guestPosition = guest.camera.position.toArray();
  assert.equal(guest.game.applySnapshot(confirmed), true);
  assert.equal(guest.game.getSnapshot().enemies.length, 0);
  assert.equal(guest.game.getState().kills, 1);
  assert.equal(guest.game.getState().score, 150);
  assert.equal(guest.game.getState().ammo, 29);
  assert.equal(guest.game.getState().health, 90);
  assert.deepEqual(guest.camera.position.toArray(), guestPosition);

  guest.game.applySnapshot(snapshotFrom(host.game));
  assert.equal(guest.game.getState().kills, 1, 'repeated receipts must not double-award kills');
  assert.equal(guest.game.getState().score, 150);
  assert.equal(guest.events.filter(event => event.type === 'kill').length, 1);
  assert.equal(host.game.getState().kills, 0, 'guest kills do not belong to the host player');
  assert.equal(host.game.getState().score, 0);
  assert.ok(host.events.some(event => event.type === 'kill' && event.data.remote && event.data.playerId === 'guest'));

  guest.game.applyDamage(100);
  guest.game.applySnapshot(snapshotFrom(host.game));
  assert.equal(guest.game.getState().phase, 'dead', 'host telemetry cannot revive a defeated local player');
});

test('enemies attack the nearest living peer and forwarded damage affects that peer', t => {
  const host = fixture(t), guest = fixture(t, {}, false);
  const enemy = host.game.getSnapshot().enemies[0];
  host.game.setPeers([
    { id: 'dead-peer', position: [enemy.x + 0.1, 1.7, enemy.z], health: 0 },
    { id: 'near-peer', position: [enemy.x + 0.5, 1.7, enemy.z], health: 100 },
    { id: 'far-peer', position: [10, 1.7, 10], health: 100 },
  ]);
  advance(host.game, 0.8);
  assert.equal(host.events.filter(event => event.type === 'peerDamage').length, 0,
    'a zombie must telegraph its windup before contact damage lands');
  advance(host.game, 0.7);
  const attacks = host.events.filter(event => event.type === 'peerDamage');
  assert.ok(attacks.length > 0);
  assert.ok(attacks.every(event => event.data.peerId === 'near-peer'));
  assert.equal(attacks[0].data.enemyId, enemy.id);
  assert.ok(attacks[0].data.damage > 0);
  assert.equal(host.game.getState().health, 100);
  guest.game.applyDamage(attacks[0].data.damage);
  assert.equal(guest.game.getState().health, 100 - attacks[0].data.damage);
  assert.ok(guest.events.some(event => event.type === 'hurt'));
});

test('defeat emits once and prevents movement, shooting and reload until restart', t => {
  const { game, camera, events } = fixture(t);
  game.applyDamage(100);
  const position = camera.position.clone();
  advance(game, 1, { firing: true, keys: new Set(['KeyW']) });
  game.applyDamage(100);
  assert.equal(game.getState().phase, 'dead');
  assert.deepEqual(camera.position, position);
  assert.equal(game.getState().ammo, 30);
  assert.equal(game.shoot(), false);
  assert.equal(game.reload(), false);
  assert.equal(game.interact(), false);
  assert.equal(events.filter(event => event.type === 'death').length, 1);
  game.start();
  assert.equal(game.getState().phase, 'playing');
  assert.equal(game.getState().health, 100);
  assert.equal(game.shoot(), true);
});

test('repeated starts and combat effects do not accumulate scene objects', t => {
  const { game, scene } = fixture(t);
  const countObjects = () => {
    let count = 0;
    scene.traverse(() => count++);
    return count;
  };
  const initial = countObjects();
  for (let i = 0; i < 25; i++) {
    game.start();
    advance(game, 0.15, { firing: true });
  }
  assert.equal(countObjects(), initial);
});

// Playing real waves to six proves the mixed archetypes spawn from the same
// pool, cross the JSON snapshot boundary with their traits, and render on a
// guest at the host's scale.
test('later waves mix runners and brutes with scaled health, speed, reach and rewards', t => {
  const f = fixture(t);
  const records = new Map();
  let guestChecked = false;
  const sample = () => {
    for (const enemy of f.game.getSnapshot().enemies) {
      if (!records.has(enemy.id)) records.set(enemy.id, { ...enemy, wave: f.game.getState().wave });
    }
  };
  const clearWave = () => {
    let guard = 0;
    while (f.game.getState().phase === 'playing' && guard++ < 9000) {
      const list = f.game.getSnapshot().enemies;
      sample();
      if (!guestChecked && f.game.getState().wave >= 6 && list.some(enemy => enemy.archetype === 'brute')) {
        guestChecked = true;
        const mid = snapshotFrom(f.game);
        const guest = fixture(t, {}, false);
        assert.equal(guest.game.applySnapshot(mid), true);
        const guestEnemies = guest.game.getSnapshot().enemies;
        assert.equal(guestEnemies.length, mid.enemies.length);
        for (const entry of mid.enemies) {
          const mirrored = guestEnemies.find(candidate => candidate.id === entry.id);
          assert.equal(mirrored.archetype, entry.archetype);
          assert.equal(mirrored.scale, entry.scale);
          assert.equal(mirrored.points, entry.points);
        }
        const brute = guestEnemies.find(entry => entry.archetype === 'brute');
        const rig = brute && guest.scene.getObjectByName(`infected-${brute.id}`)?.getObjectByName('rig');
        assert.ok(rig, 'a brute must exist on the guest');
        assert.ok(Math.abs(rig.scale.x - 1.32) < 1e-6, 'the guest must render the brute at host scale');
      }
      if (list.length) {
        const enemy = list[0];
        advance(f.game, 0.12);
        f.camera.position.set(0, 1.7, 10);
        f.camera.lookAt(enemy.x, 1.65 * (enemy.scale || 1), enemy.z);
        if (!f.game.shoot()) advance(f.game, 0.45);
      } else advance(f.game, 0.5);
    }
    sample();
    assert.equal(f.game.getState().phase, 'intermission', 'the wave must end');
  };
  const restock = () => {
    if (f.game.getState().reserve < 180) {
      standNearSupply(f);
      assert.equal(f.game.interact(), true, 'kills must fund resupply');
    }
    f.camera.position.set(0, 1.7, 10);
    advance(f.game, 13.5);
    assert.equal(f.game.getState().phase, 'playing', 'the countdown must start the next wave');
  };

  for (let wave = 1; wave <= 8; wave++) {
    assert.equal(f.game.getState().wave, wave, `wave ${wave} must start`);
    clearWave();
    if (wave < 8) restock();
  }
  assert.ok(guestChecked, 'a wave-six snapshot containing a brute must cross the co-op boundary');

  const all = [...records.values()];
  const runners = all.filter(entry => entry.archetype === 'runner');
  const brutes = all.filter(entry => entry.archetype === 'brute');
  assert.ok(runners.length >= 3, 'waves three and up must spawn runners');
  assert.ok(brutes.length >= 3, 'waves six and up must spawn brutes');

  const byWave = wave => all.filter(entry => entry.wave === wave);
  const mixed = [6, 7, 8].find(wave => ['walker', 'runner', 'brute']
    .every(kind => byWave(wave).some(entry => entry.archetype === kind)));
  assert.ok(mixed, 'at least one late wave must mix all three archetypes');
  const late = byWave(mixed);
  const walker = late.find(entry => entry.archetype === 'walker');
  const runner = late.find(entry => entry.archetype === 'runner');
  const brute = late.find(entry => entry.archetype === 'brute');
  assert.equal(walker.scale, 1);
  assert.equal(runner.scale, 0.94);
  assert.equal(brute.scale, 1.32);
  assert.equal(walker.points, 1);
  assert.equal(runner.points, 1.5);
  assert.equal(brute.points, 2.4);
  assert.ok(runner.speed > walker.speed, 'runners must outrun walkers at an equal wave');
  assert.ok(brute.speed < walker.speed, 'brutes must close more slowly than walkers');
  assert.ok(brute.health > walker.health, 'brutes must soak more damage than walkers');
  assert.ok(runner.health < walker.health, 'runners must trade health for speed');
  assert.equal(f.game.getState().phase, 'intermission');
});
