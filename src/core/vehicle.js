/**
 * Arcade vehicle: procedural mesh (`oL`/`fL` in the minified bundle) plus
 * the per-car physics state (`TL`).
 */
import * as THREE from 'three';
import { CAR_BODIES, GHOST_COLOR, deriveCarStats, getCar } from '../config/cars.js';

export function createVehicleMesh(carId = 'apex', paint = null) {
  const spec = getCar(carId);
  const body = CAR_BODIES[carId] ?? CAR_BODIES.apex;
  const group = new THREE.Group();
  group.name = `${spec.name} procedural vehicle`;

  const color = new THREE.Color(paint ?? spec.color);
  const paintMat = new THREE.MeshStandardMaterial({
    color, roughness: 0.35, metalness: 0.55,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(body.accent), roughness: 0.6, metalness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#0f1518', roughness: 0.15, metalness: 0.8 });

  // Lower hull: tapered box lofted from nose to tail.
  const hullGeo = new THREE.BoxGeometry(spec.width, 0.62, spec.length, 2, 1, 6);
  taperHull(hullGeo, body);
  const hull = new THREE.Mesh(hullGeo, paintMat);
  hull.position.y = 0.62;
  hull.castShadow = true;
  group.add(hull);

  // Cabin / canopy: narrower and lower than the hull reads as glasshouse.
  const cabinGeo = new THREE.BoxGeometry(
    spec.width * (body.windowWidth ?? 0.65) * 0.82,
    0.42,
    spec.length * 0.36,
  );
  const cabin = new THREE.Mesh(cabinGeo, glassMat);
  cabin.position.set(0, 1.02, (body.cabinFront + body.cabinRear) / 2 - 0.1);
  cabin.castShadow = true;
  group.add(cabin);

  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(body.radius, body.radius, 0.32, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#0c0d0e', roughness: 0.9 });
  const wheels = [];
  const halfTrack = (body.width ?? spec.width) / 2 - 0.1;
  for (const [x, z] of [[-halfTrack, body.front], [halfTrack, body.front], [-halfTrack, body.rear], [halfTrack, body.rear]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, body.radius + 0.02, z);
    w.castShadow = true;
    group.add(w);
    wheels.push(w);
  }

  // Wing for aero cars.
  if (body.wing) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.92, 0.08, 0.5), darkMat);
    wing.position.set(0, 1.15, body.rear - 0.25);
    wing.castShadow = true;
    group.add(wing);
    for (const sx of [-1, 1]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.55), darkMat);
      plate.position.set(sx * spec.width * 0.44, 0.98, body.rear - 0.25);
      group.add(plate);
    }
  }

  // Headlights + taillight strip so night racing reads.
  const headMat = new THREE.MeshBasicMaterial({ color: '#fff6d8' });
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.06), headMat);
    h.position.set(sx * spec.width * 0.3, 0.72, body.front + 0.02);
    group.add(h);
  }
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width * 0.7, 0.09, 0.06),
    new THREE.MeshBasicMaterial({ color: '#ff2d2d' }),
  );
  tail.position.set(0, 0.78, body.rear - 0.02);
  group.add(tail);

  group.userData.wheels = wheels;
  group.userData.paintMat = paintMat;
  return group;
}

function taperHull(geo, body) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const t = THREE.MathUtils.clamp((z - body.rear) / (body.front - body.rear), 0, 1);
    const widthScale = 1 - (body.noseTaper ?? 0.2) * Math.pow(Math.abs(t - 0.5) * 2, 3) * (t > 0.7 ? 1 : 0.3);
    pos.setX(i, pos.getX(i) * widthScale);
  }
  geo.computeVertexNormals();
}

export function createGhostMesh(carId) {
  const mesh = createVehicleMesh(carId, GHOST_COLOR);
  mesh.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.45;
      o.castShadow = false;
    }
  });
  return mesh;
}

/** Fresh arcade physics state (minified `TL()`). */
export function createCarState() {
  return {
    s: 0, lateral: 0, heading: 0,
    speed: 0, yawRate: 0, sideSpeed: 0,
    steer: 0, throttle: 0, brake: 0,
    damage: 0, rpm: 950, gear: 1, slip: 0,
    surface: 'asphalt', compression: [0, 0, 0, 0],
    raceLap: 0, lapStart: 0, sectorStart: 0, nextSector: 0,
    sectors: [], lastSectors: [], bestLap: null,
    finished: false, finishTime: 0, lapInvalid: false,
    isPlayer: false, finishedPlace: 0,
  };
}

export function placeOnTrack(state, track, s, lateral = 0) {
  state.s = s;
  state.lateral = lateral;
  state.heading = 0;
  state.speed = 0;
  state.yawRate = 0;
  return state;
}

/** Pose a three.js group from (track, state). */
export function poseVehicle(group, track, state) {
  const frame = track.sample(state.s);
  const pos = frame.position
    .clone()
    .addScaledVector(frame.right, state.lateral)
    .addScaledVector(frame.up, 0.05);
  group.position.copy(pos);
  const yaw = Math.atan2(frame.tangent.x, frame.tangent.z) + state.heading;
  group.rotation.set(0, yaw, -frame.bank - state.heading * 0.3, 'YXZ');
  // Spin wheels + lean with steer.
  const wheels = group.userData.wheels ?? [];
  wheels.forEach((w, i) => {
    w.rotation.x += (state.speed / 0.36) * 0.016;
    if (i < 2) w.rotation.y = state.steer * 0.42;
  });
}

export { deriveCarStats };
