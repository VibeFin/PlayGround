import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DerbyScene } from '../src/scene.js';

function car(number, z = 0) {
  const mesh = new THREE.Group();
  mesh.position.z = z;
  mesh.userData = {
    health: 100, maxHealth: 100, alive: true, speed: 0, angle: 0, cooldown: 0,
    velocity: new THREE.Vector2(), config: { number, color: '#bf6035' },
    hood: new THREE.Object3D(), front: new THREE.Object3D(), body: new THREE.Group(),
    paint: new THREE.MeshStandardMaterial(),
  };
  return mesh;
}

function fixture() {
  const game = Object.create(DerbyScene.prototype);
  const player = car('07'), victim = car('17', 10);
  const deaths = [], blasts = [], events = [];
  Object.assign(game, {
    player, cars: [player, victim], time: 180, mode: 'playing', scene: new THREE.Scene(),
    damageDealt: 0, takedowns: 0, impactShake: 0, weaponHitCooldown: 0,
    effects: [], projectiles: [], obstacles: [],
    destruction: { destroy: car => deaths.push(car), blast: position => blasts.push(position.clone()) },
    onWreck: (...args) => events.push(args), sparks: () => {},
  });
  return { game, player, victim, deaths, blasts, events };
}

test('fatal damage triggers destruction and awards a takedown exactly once', () => {
  const { game, victim, deaths, events } = fixture();
  assert.equal(game.damage(victim, 140, victim.position, true), 100);
  assert.equal(victim.userData.alive, false);
  assert.equal(game.takedowns, 1);
  assert.equal(game.damageDealt, 100);
  assert.deepEqual(deaths, [victim]);
  assert.deepEqual(events, [[false, true, { number: '17', count: 1 }]]);
  assert.ok(game.impactShake > 0);
  assert.equal(game.takedownFocus.car, victim);
  assert.equal(game.damage(victim, 140, victim.position, true), 0);
  assert.equal(deaths.length, 1);
  assert.equal(game.takedowns, 1);
});

test('ramming a rival to death invokes the same destruction trigger', () => {
  const { game, player, victim, deaths } = fixture();
  victim.position.z = 3; victim.userData.health = 4;
  player.userData.speed = 22; player.userData.velocity.set(0, 22);
  game.carCollisions();
  assert.equal(victim.userData.alive, false);
  assert.deepEqual(deaths, [victim]);
  assert.equal(game.takedowns, 1);
});

test('a fatal minigun projectile triggers vehicle destruction', () => {
  const { game, player, victim, deaths } = fixture();
  victim.userData.health = 3;
  const bullet = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, 1), new THREE.MeshBasicMaterial());
  bullet.position.set(0, 1.2, 2.75);
  game.projectiles.push({ mesh: bullet, owner: player, type: 'minigun', velocity: new THREE.Vector3(0, 0, 95), life: .5 });
  game.updateProjectiles(.2);
  assert.deepEqual(deaths, [victim]);
  assert.equal(game.takedowns, 1);
  assert.equal(game.projectiles.length, 0);
});

test('fatal rocket hits trigger both rocket and vehicle blast effects', () => {
  const { game, player, victim, deaths, blasts } = fixture();
  victim.userData.health = 5;
  const rocket = { mesh: new THREE.Group(), owner: player };
  rocket.mesh.position.copy(victim.position);
  game.explodeRocket(rocket, victim);
  assert.deepEqual(deaths, [victim]);
  assert.equal(blasts.length, 1);
  assert.equal(game.takedowns, 1);
});

test('recent player damage credits a subsequent crash, but an old hit does not', () => {
  for (const [remainingTime, expected] of [[175, 1], [174.9, 0]]) {
    const { game, victim, deaths } = fixture();
    game.damage(victim, 10, victim.position, true);
    game.time = remainingTime;
    game.damage(victim, 100, victim.position);
    assert.equal(game.takedowns, expected);
    assert.equal(deaths.length, 1);
  }
});
