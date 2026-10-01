import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentCircleHit, rocketDamage, WEAPON_STATS } from '../src/weapons.js';

test('swept shots hit a target even when both endpoints are outside it', () => {
  assert.equal(segmentCircleHit(0, 0, 20, 0, 10, 0, 1), .45);
  assert.equal(segmentCircleHit(20, 0, 0, 0, 10, 0, 1), .45);
});

test('swept contact rejects targets behind the shot or off its path', () => {
  assert.equal(segmentCircleHit(0, 0, 20, 0, -5, 0, 1), null);
  assert.equal(segmentCircleHit(0, 0, 20, 0, 10, 2, 1), null);
  assert.equal(segmentCircleHit(0, 0, 2, 0, 10, 0, 1), null);
});

test('point-blank and tangent hits are handled without invalid arithmetic', () => {
  assert.equal(segmentCircleHit(10, 0, 10, 0, 10, 0, 1), 0);
  assert.equal(segmentCircleHit(0, 0, 0, 0, 10, 0, 1), null);
  assert.equal(segmentCircleHit(0, 1, 20, 1, 10, 0, 1), .5);
});

test('nearer contacts occlude targets farther along the firing line', () => {
  const blocker = segmentCircleHit(0, 0, 20, 0, 5, 0, 1);
  const target = segmentCircleHit(0, 0, 20, 0, 10, 0, 1);
  assert.ok(blocker < target);
});

test('rocket direct hits get full damage and splash falls off to zero', () => {
  assert.equal(rocketDamage(0, true), WEAPON_STATS.rocket.damage);
  assert.equal(rocketDamage(0), 44);
  assert.equal(rocketDamage(3), 22);
  assert.equal(rocketDamage(6), 0);
  assert.equal(rocketDamage(12), 0);
  assert.equal(rocketDamage(0, true, 32), 32);
});
