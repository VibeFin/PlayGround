import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createVehicle, updateVehicle } from '../src/vehicles.js';

const healthyCar = (overrides = {}) => ({
  health: 100, alive: true, speed: 0, steer: 0, vx: 0, vz: 0,
  damage: { front: 0, rear: 0, left: 0, right: 0 },
  ...overrides,
});

function createPlayer() {
  const group = createVehicle(THREE, { id: 0, isPlayer: true });
  updateVehicle(group, healthyCar(), 0, 0);
  return group;
}

function snapshotGeometry(group) {
  return group.userData.vehicle.deformables.map(({ mesh, original }) => ({
    mesh,
    original,
    positions: mesh.geometry.getAttribute('position').array.slice(),
    rest: original.slice(),
  }));
}

function assertGeometryMatches(snapshot) {
  for (const { mesh, original, positions, rest } of snapshot) {
    assert.deepEqual(mesh.geometry.getAttribute('position').array, positions, `${mesh.name}: vertices`);
    assert.deepEqual(original, rest, `${mesh.name}: immutable rest vertices`);
  }
}

function assertFiniteVehicle(group) {
  group.updateMatrixWorld(true);
  group.traverse(object => {
    for (const values of [object.position.toArray(), object.quaternion.toArray(),
      object.scale.toArray(), object.matrixWorld.elements]) {
      assert(values.every(Number.isFinite), `${object.name}: finite transform`);
    }
    if (!object.isMesh) return;
    assert(object.geometry.getAttribute('position').array.every(Number.isFinite), `${object.name}: finite vertices`);
    const sphere = object.geometry.boundingSphere;
    assert(sphere && Number.isFinite(sphere.radius), `${object.name}: finite bounding sphere`);
    assert(sphere.center.toArray().every(Number.isFinite));
  });
  const bounds = new THREE.Box3().setFromObject(group);
  assert(!bounds.isEmpty());
  assert([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));
}

test('health uses 0..100, drives burn/fire, and defaults to 100', () => {
  const group = createPlayer();
  const v = group.userData.vehicle;
  const pristinePaint = v.materials.paint.color.clone();

  updateVehicle(group, healthyCar({ health: 50 }), 1 / 60, 1);
  assert.equal(v.health, .5);
  assert.equal(v.fire.visible, false);
  assert(v.materials.paint.color.r < pristinePaint.r, 'moderate health should darken paint');

  updateVehicle(group, healthyCar({ health: 28 }), 1 / 60, 2);
  assert.equal(v.fire.visible, false);
  updateVehicle(group, healthyCar({ health: 27 }), 1 / 60, 3);
  assert.equal(v.health, .27);
  assert.equal(v.fire.visible, true);
  assert(v.materials.ember.emissiveIntensity > 0);

  updateVehicle(group, healthyCar({ health: 0, alive: false }), 1 / 60, 4);
  assert(v.fire.visible && !v.hood.visible);
  assert(v.materials.paint.color.r < pristinePaint.r * .25, 'wreck should look charred');

  for (const health of [100, 150, undefined, NaN, Infinity]) {
    updateVehicle(group, healthyCar({ health }), 0, 0);
    assert.equal(v.health, 1, `health ${health} normalizes/defaults to full health`);
    assert.equal(v.fire.visible, false);
    assert.equal(v.materials.ember.emissiveIntensity, 0);
    assert(v.materials.paint.color.equals(pristinePaint));
  }
  updateVehicle(group, healthyCar({ health: -10 }), 1 / 60, 5);
  assert.equal(v.health, 0);
  assert.equal(v.fire.visible, true);
});

test('software-tier rivals reduce geometry while preserving damage, fire, and reset', () => {
  const detailed = createVehicle(THREE, { id: 3 });
  const economical = createVehicle(THREE, { id: 3, lowDetail: true });
  const triangles = group => {
    let total = 0;
    group.traverse(object => {
      if (object.isMesh) total += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    });
    return total;
  };
  assert(triangles(economical) < triangles(detailed) * .6, 'software tier should substantially reduce geometry');
  const rest = snapshotGeometry(economical);
  updateVehicle(economical, healthyCar({ health: 20, damage: { front: .9 } }), 1 / 60, 1);
  assert(economical.userData.vehicle.fire.visible);
  assert(!economical.userData.vehicle.hood.visible);
  assertFiniteVehicle(economical);
  updateVehicle(economical, healthyCar(), 0, 0);
  assertGeometryMatches(rest);
  assert(!economical.userData.vehicle.fire.visible);
  assert(economical.userData.vehicle.hood.visible);
});

const regions = [
  { name: 'front', axis: 2, sign: 1, edge: 1.6 },
  { name: 'rear', axis: 2, sign: -1, edge: 1.6 },
  { name: 'left', axis: 0, sign: -1, edge: .85 },
  { name: 'right', axis: 0, sign: 1, edge: .85 },
];

for (const { name, axis, sign, edge } of regions) {
  test(`${name} damage is localized, non-cumulative, and exactly reversible`, () => {
    const group = createPlayer();
    const pristine = snapshotGeometry(group);
    const hit = Object.freeze(healthyCar({
      health: 60, damage: Object.freeze({ [name]: .4 }),
    }));
    updateVehicle(group, hit, 1 / 60, 1);

    let largestInwardMove = 0;
    let oppositeVertices = 0;
    for (const { mesh, original, rest } of pristine) {
      const positions = mesh.geometry.getAttribute('position').array;
      assert.deepEqual(original, rest, 'damage must never change the saved rest shape');
      for (let i = 0; i < rest.length; i += 3) {
        if (sign * rest[i + axis] > edge) {
          largestInwardMove = Math.max(largestInwardMove, sign * (rest[i + axis] - positions[i + axis]));
        }
        if (sign * rest[i + axis] < -edge) {
          oppositeVertices++;
          for (let component = 0; component < 3; component++) {
            assert.equal(positions[i + component], rest[i + component], 'opposite region stays intact');
          }
        }
      }
    }
    assert(oppositeVertices > 0, 'locality check must inspect actual opposite-region vertices');
    assert(largestInwardMove > .12, 'medium damage must visibly move the impacted region inward');

    const damaged = snapshotGeometry(group);
    for (let frame = 0; frame < 30; frame++) updateVehicle(group, hit, 1 / 60, 1 + frame / 60);
    assertGeometryMatches(damaged);

    // Returning to the same damage after a worse hit must produce the same shape.
    updateVehicle(group, healthyCar({ health: 40, damage: { [name]: .75 } }), 1 / 60, 2);
    updateVehicle(group, hit, 1 / 60, 3);
    assertGeometryMatches(damaged);

    // Include a tiny residual amount so the dirty threshold cannot strand dents.
    updateVehicle(group, healthyCar({ damage: { [name]: .004 } }), 1 / 60, 4);
    updateVehicle(group, healthyCar(), 0, 0);
    assertGeometryMatches(pristine);
  });
}

test('reusing a wrecked model restores panels, paint, suspension, and original geometry', () => {
  const group = createPlayer();
  const untouched = createPlayer();
  const pristine = snapshotGeometry(group);
  const neighbor = snapshotGeometry(untouched);
  const v = group.userData.vehicle;
  const originalPaint = v.materials.paint.color.clone();
  group.position.set(7, 0, -4);
  group.rotation.y = 1.3;

  updateVehicle(group, healthyCar({
    health: 0, alive: false, speed: 8,
    damage: { front: 1, rear: 1, left: 1, right: 1 },
  }), 1 / 60, 1);
  assert(!v.hood.visible && !v.trunk.visible && v.fire.visible);
  assertGeometryMatches(neighbor);
  assert(untouched.userData.vehicle.materials.paint.color.equals(originalPaint), 'other car paint is independent');

  updateVehicle(group, healthyCar(), 0, 0);
  assertGeometryMatches(pristine);
  assert(v.hood.visible && v.trunk.visible && !v.fire.visible);
  assert(v.materials.paint.color.equals(originalPaint));
  assert.equal(v.materials.ember.emissiveIntensity, 0);
  assert.deepEqual(v.chassis.position.toArray(), [0, 0, 0]);
  assert(v.chassis.quaternion.angleTo(new THREE.Quaternion()) < 1e-10);
  assert.deepEqual(group.position.toArray(), [7, 0, -4]);
  assert.equal(group.rotation.y, 1.3);
});

for (const dt of [1 / 60, 1 / 20]) {
  test(`collision suspension reacts, preserves wheel height, and settles at dt=${dt}`, () => {
    const group = createPlayer();
    const v = group.userData.vehicle;
    updateVehicle(group, healthyCar({ speed: 14 }), 0, 0);
    const initialHeights = v.wheels.map(wheel => wheel.mount.getWorldPosition(new THREE.Vector3()).y);
    const hit = healthyCar({ health: 60, speed: 5, damage: { front: .4, left: .3 } });
    let peakPitch = 0;
    let peakRoll = 0;
    let peakCompression = 0;
    for (let frame = 0; frame < Math.ceil(3 / dt); frame++) {
      updateVehicle(group, hit, dt, 1 + frame * dt);
      peakPitch = Math.max(peakPitch, Math.abs(v.chassis.rotation.x));
      peakRoll = Math.max(peakRoll, Math.abs(v.chassis.rotation.z));
      peakCompression = Math.max(peakCompression, -v.chassis.position.y);
      v.wheels.forEach((wheel, i) => {
        const height = wheel.mount.getWorldPosition(new THREE.Vector3()).y;
        assert(Math.abs(height - initialHeights[i]) < 1e-7, 'wheel center must stay grounded during body response');
      });
    }
    assert(peakPitch > .035 && peakRoll > .035, 'impact should visibly pitch and roll the chassis');
    assert(peakCompression > .01, 'impact should compress suspension');
    assert(Math.abs(v.chassis.rotation.x) < .001);
    assert(Math.abs(v.chassis.rotation.z) < .001);
    assert(Math.abs(v.chassis.position.y) < .001, 'constant motion should not keep jittering after impact');
  });
}

test('abrupt speed loss alone produces a transient response, steady motion does not', () => {
  const group = createPlayer();
  const v = group.userData.vehicle;
  updateVehicle(group, healthyCar({ speed: 16 }), 0, 0);
  for (let i = 0; i < 60; i++) updateVehicle(group, healthyCar({ speed: 16 }), 1 / 60, i / 60);
  assert.equal(v.chassis.position.y, 0);
  updateVehicle(group, healthyCar({ speed: 3 }), 1 / 60, 2);
  assert(v.chassis.position.y < -.001, 'speed discontinuity should compress the suspension without a damage event');
  for (let i = 0; i < 180; i++) updateVehicle(group, healthyCar({ speed: 3 }), 1 / 60, 2 + i / 60);
  assert(Math.abs(v.chassis.position.y) < .001);
  assert(Math.abs(v.chassis.rotation.x) < .001);
});

test('rivals have deterministic geometry variation while preserving footprint and wheelbase', () => {
  const rivals = Array.from({ length: 8 }, (_, i) => createVehicle(THREE, { id: i + 1, color: '#888888' }));
  const shellBounds = rivals.map(group => {
    const v = group.userData.vehicle;
    const shell = group.getObjectByName('painted-shell');
    assert(shell?.isMesh);
    const bounds = new THREE.Box3().setFromObject(shell);
    const footprint = new THREE.Box3().setFromObject(v.chassis).getSize(new THREE.Vector3());
    assert(footprint.x > 1.9 && footprint.x < 2.3);
    assert(footprint.z > 4.1 && footprint.z < 4.8);
    for (const { mesh, original } of v.deformables) {
      assert.deepEqual(mesh.geometry.getAttribute('position').array, original, 'rivals spawn in their undamaged rest shape');
    }
    assert.equal(v.fire.visible, false);
    return bounds;
  });
  const heights = shellBounds.map(bounds => bounds.max.y);
  assert(Math.max(...heights) - Math.min(...heights) > .12, 'variation must affect silhouette, not just colors or labels');
  const wheelPositions = group => group.userData.vehicle.wheels.map(wheel => wheel.mount.position.toArray());
  for (const rival of rivals) assert.deepEqual(wheelPositions(rival), wheelPositions(rivals[0]));

  const repeated = createVehicle(THREE, { id: 1, color: '#888888' });
  assert.deepEqual(repeated.getObjectByName('painted-shell').geometry.attributes.position.array,
    rivals[0].getObjectByName('painted-shell').geometry.attributes.position.array);
  const player = createPlayer();
  const otherPlayer = createVehicle(THREE, { id: 99, isPlayer: true });
  assert.deepEqual(player.getObjectByName('painted-shell').geometry.attributes.position.array,
    otherPlayer.getObjectByName('painted-shell').geometry.attributes.position.array,
    'player proportions must not inherit rival profile variation');
});

test('partial and malformed updates keep transforms, vertices, and bounds finite', () => {
  const group = createPlayer();
  const cases = [
    [null, undefined, undefined],
    [{}, 0, 0],
    [{ speed: NaN, steer: Infinity, health: NaN, vx: Infinity, vz: -Infinity,
      damage: { front: NaN, rear: Infinity, left: -1, right: 2 } }, NaN, Infinity],
    [healthyCar({ speed: -25, steer: -1, health: 0, alive: false,
      damage: { front: 1, rear: 1, left: 1, right: 1 } }), 10, 5],
    [healthyCar(), -1, NaN],
  ];
  for (const [car, dt, time] of cases) {
    updateVehicle(group, car, dt, time);
    assertFiniteVehicle(group);
  }
  assert.doesNotThrow(() => updateVehicle(null, null));
  assert.doesNotThrow(() => updateVehicle(new THREE.Group(), {}));
});

test('contact shadow remains grounded with all dynamic shadow casting disabled', () => {
  const group = createPlayer();
  const v = group.userData.vehicle;
  const shadow = v.contactShadow;
  group.traverse(object => { object.castShadow = false; });
  const before = shadow.getWorldPosition(new THREE.Vector3());
  updateVehicle(group, healthyCar({ health: 60, damage: { front: .5, right: .4 } }), 1 / 60, 1);
  assert(shadow.visible && shadow.parent === group);
  assert(shadow.material.isMeshBasicMaterial && shadow.material.transparent);
  assert.equal(shadow.material.depthWrite, false);
  assert.equal(shadow.castShadow, false);
  assert(before.y > 0 && before.y < .05);
  assert(shadow.getWorldPosition(new THREE.Vector3()).equals(before));
});
