/**
 * KartModel.js — procedural low-poly kart + driver (Agent 3 ownership).
 *
 * Exports createKart(color) → THREE.Group with userData:
 *  { wheels: [{ mesh, front }], steerL/steerR, body, driver, exhausts,
 *    setSteer(s), setWheelSpin(dist) }
 * Plus syncKartMesh(group, state, dt) to pose the kart from physics snapshots,
 * and KART_COLORS palette shared with AI names.
 *
 * No DOM usage here (geometry/materials only), so importing is headless-safe
 * as long as the `three` package is installed.
 */

import * as THREE from 'three';

export const KART_COLORS = [0xe33e2b, 0x2b7fff, 0x2fbf4a, 0xffc93f, 0xff7fc0, 0x9b5bff, 0x35c759, 0xff7a1a];

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.6,
    metalness: opts.metalness ?? 0.15,
    flatShading: true,
    ...opts.extra,
  });
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/**
 * Build a low-poly kart with driver.
 * @param {number} color body color (hex)
 * @param {object} opts { driverShirt?, helmet? }
 * @returns {THREE.Group}
 */
export function createKart(color = 0xe33e2b, opts = {}) {
  const g = new THREE.Group();
  g.name = 'kart';

  const bodyMat = mat(color, { roughness: 0.45, metalness: 0.25 });
  const darkMat = mat(0x1c1f26, { roughness: 0.8, metalness: 0.1 });
  const chromeMat = mat(0xcfd6e4, { roughness: 0.3, metalness: 0.7 });
  const shirtMat = mat(opts.driverShirt ?? color, { roughness: 0.8 });
  const skinMat = mat(0xf2c89b, { roughness: 0.7 });
  const helmetMat = mat(opts.helmet ?? 0xffffff, { roughness: 0.35, metalness: 0.2 });
  const tireMat = mat(0x14161a, { roughness: 0.9 });
  const seatMat = mat(0x262a33, { roughness: 0.85 });

  // --- chassis ---
  const floor = box(1.15, 0.14, 2.1, darkMat, 0, 0.32, 0);
  g.add(floor);
  const nose = box(0.85, 0.22, 0.7, bodyMat, 0, 0.45, 1.15);
  nose.rotation.x = -0.08;
  g.add(nose);
  const noseTip = box(0.5, 0.16, 0.22, bodyMat, 0, 0.42, 1.55);
  g.add(noseTip);
  // side pods
  g.add(box(0.28, 0.2, 0.9, bodyMat, -0.68, 0.42, 0.1));
  g.add(box(0.28, 0.2, 0.9, bodyMat, 0.68, 0.42, 0.1));
  // seat + backrest
  g.add(box(0.62, 0.12, 0.6, seatMat, 0, 0.45, -0.45));
  const back = box(0.62, 0.55, 0.14, seatMat, 0, 0.72, -0.78);
  back.rotation.x = 0.12;
  g.add(back);
  // rear wing / spoiler
  g.add(box(0.1, 0.35, 0.1, darkMat, -0.45, 0.75, -1.0));
  g.add(box(0.1, 0.35, 0.1, darkMat, 0.45, 0.75, -1.0));
  g.add(box(1.25, 0.1, 0.35, bodyMat, 0, 0.95, -1.0));
  // front bumper
  g.add(box(1.0, 0.12, 0.18, chromeMat, 0, 0.3, 1.62));
  // exhausts
  const exhausts = [];
  for (const sx of [-0.28, 0.28]) {
    const ex = cyl(0.07, 0.09, 0.5, chromeMat, sx, 0.42, -1.15);
    ex.rotation.x = Math.PI / 2 - 0.15;
    g.add(ex);
    exhausts.push(ex);
  }
  // steering column + wheel
  const column = cyl(0.04, 0.04, 0.5, darkMat, 0, 0.62, 0.35);
  column.rotation.x = 0.5;
  g.add(column);
  const wheelMesh = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 14), darkMat);
  wheelMesh.position.set(0, 0.72, 0.25);
  wheelMesh.rotation.x = -0.5;
  wheelMesh.castShadow = true;
  g.add(wheelMesh);

  // --- driver (blocky low-poly) ---
  const driver = new THREE.Group();
  driver.name = 'driver';
  const torso = box(0.5, 0.5, 0.32, shirtMat, 0, 0.85, -0.45);
  driver.add(torso);
  const armL = box(0.13, 0.13, 0.5, shirtMat, -0.32, 0.85, -0.2);
  const armR = box(0.13, 0.13, 0.5, shirtMat, 0.32, 0.85, -0.2);
  driver.add(armL, armR);
  const handL = box(0.12, 0.12, 0.12, skinMat, -0.32, 0.82, 0.05);
  const handR = box(0.12, 0.12, 0.12, skinMat, 0.32, 0.82, 0.05);
  driver.add(handL, handR);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), helmetMat);
  helmet.position.set(0, 1.28, -0.5);
  helmet.castShadow = true;
  driver.add(helmet);
  const visor = box(0.3, 0.1, 0.05, mat(0x101418, { roughness: 0.2, metalness: 0.5 }), 0, 1.28, -0.28);
  driver.add(visor);
  g.add(driver);

  // --- wheels (cylinders, axle along X) ---
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.3, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.32, 8);
  hubGeo.rotateZ(Math.PI / 2);
  const spots = [
    { x: -0.72, z: 1.0, front: true },
    { x: 0.72, z: 1.0, front: true },
    { x: -0.75, z: -0.85, front: false },
    { x: 0.75, z: -0.85, front: false },
  ];
  let steerL = null;
  let steerR = null;
  for (const s of spots) {
    const pivot = new THREE.Group();
    pivot.position.set(s.x, 0.34, s.z);
    const tire = new THREE.Mesh(s.front ? wheelGeo.clone() : wheelGeo, tireMat);
    tire.scale.setScalar(s.front ? 0.88 : 1.08);
    tire.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, chromeMat);
    hub.scale.setScalar(s.front ? 0.88 : 1.0);
    pivot.add(tire, hub);
    g.add(pivot);
    const entry = { mesh: tire, hub, pivot, front: s.front };
    wheels.push(entry);
    if (s.front) {
      if (s.x < 0) steerL = pivot;
      else steerR = pivot;
    }
  }

  g.userData = {
    wheels,
    steerL,
    steerR,
    body: floor,
    driver,
    exhausts,
    steerWheel: wheelMesh,
    lastSteer: 0,
    spark: null, // main.js may attach drift-spark sprites here
    setSteer(s) {
      this.lastSteer = s;
      if (steerL) steerL.rotation.y = s * 0.42;
      if (steerR) steerR.rotation.y = s * 0.42;
      wheelMesh.rotation.z = -s * 0.6;
      driver.rotation.y = -s * 0.12;
    },
    setWheelSpin(dist) {
      for (const w of wheels) {
        const r = w.front ? 0.3 : 0.367;
        w.mesh.rotation.x += dist / r;
      }
    },
  };

  return g;
}

/**
 * Pose a kart mesh from a physics snapshot/state.
 * @param {THREE.Group} group from createKart
 * @param {object} state { x,y,z, heading, speed, drifting, driftDir, boosting }
 * @param {number} dt for wheel-spin integration
 */
export function syncKartMesh(group, state, dt = 0.016) {
  if (!group || !state) return;
  try {
    group.position.set(state.x ?? 0, state.y ?? 0, state.z ?? 0);
    group.rotation.y = state.heading ?? 0;
    const dir = state.driftDir || 0;
    group.rotation.z = state.drifting ? dir * -0.13 : 0;
    group.rotation.x = state.boosting ? -0.045 : 0;
    const u = group.userData || {};
    if (typeof u.setWheelSpin === 'function') {
      u.setWheelSpin((state.speed || 0) * dt);
    }
    if (typeof u.setSteer === 'function' && Number.isFinite(state.steer)) {
      u.setSteer(state.steer);
    }
  } catch { /* visuals must never break the loop */ }
}

export default createKart;
