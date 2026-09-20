/**
 * Arcade vehicle: procedural mesh plus the per-car physics state.
 *
 * Faithful readable port of the original builders:
 * - `oL(r)` — smooth lofted hull (100x32 parametric tube with nose taper,
 *   fender flares and wheel-arch cutouts, plus nose/tail caps).
 * - `fL(carId, paint)` — batched detail parts: splitter, skirts, grille,
 *   headlight clusters, glasshouse, mirrors, diffuser, exhausts, wing,
 *   rally/prototype extras, steering wheel.
 * - `pL(...)` — wheels: lathed tire, tread blocks, rim rings, drilled
 *   brake disc, spokes, hub, lugs, plus a non-spinning caliper.
 * - `update(...)` — wheel spin/steer/suspension, body roll/pitch,
 *   brake-light boost (folded into `poseVehicle` here).
 *
 * Forward is +Z (nose at `body.front`). The track poser yaws the group so
 * +Z follows the spline tangent.
 */
import * as THREE from 'three';
import { CAR_BODIES, GHOST_COLOR, deriveCarStats, getCar } from '../config/cars.js';

// ---------------------------------------------------------------- materials

function makeMaterials(paintColor, body) {
  const paint = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(paintColor),
    metalness: 0.58,
    roughness: 0.24,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    side: THREE.DoubleSide,
  });
  const trim = new THREE.MeshStandardMaterial({ color: '#11151b', roughness: 0.39, metalness: 0.48 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#111217', roughness: 0.8 });
  const groove = new THREE.MeshStandardMaterial({ color: '#07080a', roughness: 1 });
  const alloy = new THREE.MeshStandardMaterial({
    color: body.id === 'vanta' || body.rally ? '#9e916e' : '#adbbc4',
    metalness: 0.94, roughness: 0.26,
  });
  const disc = new THREE.MeshStandardMaterial({ color: '#777b81', metalness: 0.93, roughness: 0.44 });
  const caliper = new THREE.MeshStandardMaterial({
    color: body.rally ? '#dfd2ac' : '#eb4430', metalness: 0.45, roughness: 0.35,
  });
  const accent = new THREE.MeshStandardMaterial({ color: body.accent, metalness: 0.48, roughness: 0.34 });
  const dark = new THREE.MeshStandardMaterial({ color: '#19181b', roughness: 0.98 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#a8c6c9', roughness: 0.06, metalness: 0,
    transparent: true, opacity: 0.55, side: THREE.DoubleSide,
  });
  const lens = new THREE.MeshStandardMaterial({
    color: '#f1f9ff', emissive: '#d5f0ff', emissiveIntensity: 2.2, roughness: 0.17,
  });
  const tail = new THREE.MeshStandardMaterial({
    color: '#ff2520', emissive: '#ff1007', emissiveIntensity: 2.2, roughness: 0.23,
  });
  const indicator = new THREE.MeshStandardMaterial({
    color: '#ff9130', emissive: '#ff5904', emissiveIntensity: 1.4,
  });
  return { paint, trim, rubber, groove, alloy, disc, caliper, accent, dark, glass, lens, tail, indicator };
}

// ---------------------------------------------------------------- helpers

function box(parent, mat, size, pos, rot = [0, 0, 0]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function tube(parent, mat, points, radius, segments = 24) {
  const v3s = points.map((p) => new THREE.Vector3(...p));
  if (v3s.length < 2 || v3s.some((v) => !Number.isFinite(v.x + v.y + v.z))) {
    console.warn('[vehicle] skipping degenerate tube', JSON.stringify(points));
    return null;
  }
  const curve = new THREE.CatmullRomCurve3(v3s);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 6, false), mat);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** Flat quad from four [x,y,z] corners (for glass panels). */
function quad(parent, mat, corners) {
  const geo = new THREE.BufferGeometry();
  const [a, b, c, d] = corners;
  geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------- hull
// Exact port of `oL`: for each station `i` along the body and each angle
// `p` around the section, blend between floor, bodyside and roof.

function buildHullGeometry(b) {
  const lengthSegs = 80;
  const radialSegs = 28;
  const half = b.length / 2;
  const positions = [];
  const uvs = [];
  const indices = [];

  function sectionPoint(n, r) {
    const i = -half + n * b.length; // longitudinal station
    const endness = Math.abs(i / half); // 0 amidships, 1 at the tips
    const widthScale = 1 - (b.noseTaper ?? 0.21) * endness ** 7;
    const halfWidth = (b.width * 0.5) * widthScale;
    // Fender flares over the axles.
    const frontBump = Math.exp(-(((i - b.front) / 0.66) ** 2));
    const rearBump = Math.exp(-(((i - b.rear) / 0.69) ** 2));
    const flareBump = Math.max(frontBump, rearBump);
    // Beltline height; the sine term swells the cabin area.
    const cabinT = THREE.MathUtils.smoothstep(i, b.cabinFront, half);
    const belt = (b.rally ? 0.83 : b.prototype ? 0.7 : 0.72)
      - 0.085 * endness ** 5
      + Math.sin(cabinT * Math.PI) * 0.025;
    const p = r * Math.PI * 2;
    const sin = Math.sin(p);
    const cos = Math.cos(p);
    const g = Math.abs(sin);
    const lateral = Math.sign(sin) * g ** 0.54 * halfWidth;
    const bulge = g ** 3;
    const side = belt + flareBump * (b.flare ?? 0.19) * bulge;
    // Floor rises into wheel-arch cutouts near the axles.
    let floor = 0.275;
    for (const axle of [b.front, b.rear]) {
      const along = i - axle;
      const archR = b.radius + (b.archClearance ?? (b.rally ? 0.096 : 0.066));
      if (Math.abs(along) < archR) {
        floor = Math.max(floor, b.radius + Math.sqrt(archR * archR - along * along));
      }
    }
    const lower = THREE.MathUtils.lerp(0.255, floor, g ** 2);
    let height;
    if (cos >= 0) {
      height = THREE.MathUtils.lerp(side - 0.045, belt + 0.048, cos ** 0.52);
      height += flareBump * 0.145 * bulge * cos ** 0.7; // fender crown
    } else {
      height = THREE.MathUtils.lerp(side - 0.045, lower, (-cos) ** 0.42);
    }
    return [lateral, height, i];
  }

  for (let a = 0; a <= lengthSegs; a++) {
    for (let o = 0; o <= radialSegs; o++) {
      const s = sectionPoint(a / lengthSegs, o / radialSegs);
      positions.push(s[0], s[1], s[2]);
      uvs.push(o / radialSegs, a / lengthSegs);
    }
  }
  for (let n = 0; n < lengthSegs; n++) {
    for (let e = 0; e < radialSegs; e++) {
      const r0 = n * (radialSegs + 1) + e;
      const r1 = r0 + radialSegs + 1;
      indices.push(r0, r1, r0 + 1, r1, r1 + 1, r0 + 1);
    }
  }
  // Nose + tail cap fans closing the tube.
  for (const capFront of [false, true]) {
    const ringStart = (capFront ? lengthSegs : 0) * (radialSegs + 1);
    const center = positions.length / 3;
    positions.push(0, 0.46, capFront ? half : -half);
    uvs.push(0.5, 0.5);
    for (let e = 0; e <= radialSegs; e++) {
      positions.push(positions[(ringStart + e) * 3], positions[(ringStart + e) * 3 + 1], positions[(ringStart + e) * 3 + 2]);
      uvs.push(e / radialSegs, 0);
    }
    for (let t = 0; t < radialSegs; t++) {
      if (capFront) indices.push(center, center + t + 2, center + t + 1);
      else indices.push(center, center + t + 1, center + t + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------- wheels
// Readable port of `pL`: tire + tread + rim + drilled disc + spokes + hub
// on a spinning group, caliper on the steering pivot (non-spinning).

function buildWheel(b, mats, front) {
  const r = b.radius;
  const halfWidth = (b.rally ? 0.25 : 0.285);
  const pivot = new THREE.Group();
  const spin = new THREE.Group();
  pivot.add(spin);

  const tireGeo = new THREE.CylinderGeometry(r, r, halfWidth * 2, 28);
  tireGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeo, mats.rubber);
  tire.castShadow = true;
  spin.add(tire);
  // Sidewall rings + tread blocks.
  for (const sx of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.88, 0.006, 5, 40), mats.rubber);
    ring.position.x = sx * halfWidth * 0.49;
    ring.rotation.y = Math.PI / 2;
    spin.add(ring);
  }
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    const tread = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 1.44, 0.004, 0.02), mats.groove);
    tread.position.set(0, Math.cos(a) * (r + 0.001), Math.sin(a) * (r + 0.001));
    tread.rotation.x = a;
    spin.add(tread);
  }
  // Rim barrel + brake disc.
  const barrelGeo = new THREE.CylinderGeometry(r * 0.715, r * 0.715, halfWidth * 0.8, 24, 1, true);
  barrelGeo.rotateZ(Math.PI / 2);
  spin.add(new THREE.Mesh(barrelGeo, mats.trim));
  const discGeo = new THREE.CylinderGeometry(r * 0.606, r * 0.606, 0.017, 28);
  discGeo.rotateZ(Math.PI / 2);
  const brake = new THREE.Mesh(discGeo, mats.disc);
  spin.add(brake);
  // Spokes (rally: single wide blade; road: paired slim spokes).
  for (let s = 0; s < b.spokes; s++) {
    const a = (s / b.spokes) * Math.PI * 2;
    for (const off of b.rally ? [0] : [-0.035, 0.035]) {
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.028, b.rally ? 0.032 : 0.018, r * 0.6),
        mats.alloy,
      );
      const aa = a + off;
      spoke.position.set(0, Math.sin(aa) * r * 0.425, Math.cos(aa) * r * 0.425);
      spoke.rotation.x = -aa;
      spin.add(spoke);
    }
  }
  // Hub + lug bolts.
  const hubGeo = new THREE.CylinderGeometry(r * 0.148, r * 0.17, 0.032, 16);
  hubGeo.rotateZ(Math.PI / 2);
  spin.add(new THREE.Mesh(hubGeo, mats.alloy));
  for (let lug = 0; lug < 5; lug++) {
    const a = (lug / 5) * Math.PI * 2;
    const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.009, 5, 4), mats.alloy);
    bolt.position.set(0.022, Math.sin(a) * 0.043, Math.cos(a) * 0.043);
    spin.add(bolt);
  }
  // Caliper on the pivot so it steers but never spins.
  const caliper = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, front ? 0.17 : 0.13, front ? 0.078 : 0.066),
    mats.caliper,
  );
  caliper.position.set(halfWidth * 0.25, 0.04, -r * 0.53);
  caliper.rotation.x = 0.14;
  pivot.add(caliper);

  pivot.position.y = r;
  return { pivot, spin };
}

// ---------------------------------------------------------------- assembly

export function createVehicleMesh(carId = 'apex', paint = null) {
  const spec = getCar(carId);
  const b = { ...CAR_BODIES[carId] ?? CAR_BODIES.apex, id: carId };
  const mats = makeMaterials(paint ?? spec.color, b);

  const group = new THREE.Group();
  group.name = `${spec.name} procedural vehicle`;
  const inner = new THREE.Group(); // body lean: roll / pitch / damage drop
  group.add(inner);

  const halfL = b.length / 2;
  const halfW = b.width / 2;

  // Lofted hull.
  const hull = new THREE.Mesh(buildHullGeometry(b), mats.paint);
  hull.castShadow = true;
  hull.receiveShadow = true;
  inner.add(hull);

  // Undertray + side skirts + accent blades.
  box(inner, mats.trim, [b.width * 0.84, 0.07, b.length * 0.88], [0, 0.245, -0.02]);
  for (const sx of [-1, 1]) {
    box(inner, mats.trim, [0.105, 0.11, b.front - b.rear - 0.64], [sx * halfW * 0.93, 0.28, (b.front + b.rear) / 2]);
    tube(inner, mats.accent, [
      [sx * halfW * 0.95, 0.294, b.rear + 0.44],
      [sx * halfW * 0.965, 0.299, 0],
      [sx * halfW * 0.94, 0.31, b.front - 0.43],
    ], 0.012);
  }

  // Front splitter + winglets + canards + strakes.
  box(inner, mats.trim, [b.width * 0.81, 0.062, 0.37], [0, 0.278, halfL - 0.115]);
  for (const sx of [-1, 1]) {
    box(inner, mats.trim, [0.26, 0.065, 0.48], [sx * halfW * 0.78, 0.29, halfL - 0.21], [0, sx * 0.2, 0]);
    box(inner, mats.trim, [0.18, 0.145, 0.27], [sx * halfW * 0.79, 0.38, halfL - 0.2]);
    box(inner, mats.rubber, [0.355, 0.14, 0.025], [sx * halfW * 0.59, 0.464, halfL - 0.046], [0, sx * 0.1, 0]);
    for (let t = 0; t < 4; t++) {
      box(inner, mats.trim, [0.33, 0.009, 0.031], [sx * halfW * 0.59, 0.409 + t * 0.033, halfL - 0.025]);
    }
  }

  // Grille + slats + badge.
  box(inner, mats.rubber, [b.width * 0.58, 0.145, 0.029], [0, 0.423, halfL + 0.01]);
  box(inner, mats.trim, [b.width * 0.47, 0.091, 0.018], [0, 0.425, halfL + 0.029]);
  for (let e = -3; e <= 3; e++) {
    box(inner, mats.disc, [b.width * 0.43, 0.007, 0.009], [0, 0.385 + e * 0.018, halfL + 0.041]);
  }
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 20), mats.accent);
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0, 0.431, halfL + 0.051);
  inner.add(badge);

  // Headlight clusters: housing, twin projectors with rings + lenses,
  // DRL strip, glass cover, side indicator.
  const browY = b.rally ? 0.69 : 0.606;
  for (const sx of [-1, 1]) {
    const x = sx * halfW * 0.6;
    box(inner, mats.rubber, [0.435, 0.105, 0.022], [x, browY, halfL + 0.014]);
    for (const off of [-0.1, 0.085]) {
      const proj = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.039, 0.016, 24), mats.alloy);
      proj.rotation.x = Math.PI / 2;
      proj.position.set(x + off, browY - 0.002, halfL + 0.032);
      inner.add(proj);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.004, 6, 24), mats.trim);
      ring.position.set(x + off, browY - 0.002, halfL + 0.043);
      inner.add(ring);
      const lensDisc = new THREE.Mesh(new THREE.CircleGeometry(0.023, 24), mats.lens);
      lensDisc.position.set(x + off, browY - 0.002, halfL + 0.046);
      inner.add(lensDisc);
    }
    box(inner, mats.lens, [0.354, 0.009, 0.008], [x, browY + 0.036, halfL + 0.048]);
    box(inner, mats.glass, [0.41, 0.089, 0.006], [x, browY, halfL + 0.054]);
    box(inner, mats.indicator, [0.028, 0.032, 0.08], [sx * halfW * 0.878, 0.636, halfL - 0.23]);
  }

  // Glasshouse: windshield, rear window, roof spine, side glass, pillars.
  const beltY = b.rally ? 0.87 : b.prototype ? 0.73 : 0.79;
  const glassW = b.windowWidth;
  const frontW = b.prototype ? 0.61 : b.width * 0.407;
  quad(inner, mats.glass, [
    [-glassW, b.roof - 0.02, b.roofFront], [glassW, b.roof - 0.02, b.roofFront],
    [frontW, beltY, b.cabinFront], [-frontW, beltY, b.cabinFront],
  ]);
  quad(inner, mats.glass, [
    [-glassW, b.roof - 0.02, b.roofRear], [glassW, b.roof - 0.02, b.roofRear],
    [frontW, beltY, b.cabinRear], [-frontW, beltY, b.cabinRear],
  ]);
  quad(inner, mats.paint, [
    [-glassW, b.roof + 0.011, b.roofRear], [glassW, b.roof + 0.011, b.roofRear],
    [glassW, b.roof + 0.011, b.roofFront], [-glassW, b.roof + 0.011, b.roofFront],
  ]);
  for (const sx of [-1, 1]) {
    quad(inner, mats.glass, [
      [sx * glassW, b.roof - 0.022, b.roofRear], [sx * glassW, b.roof - 0.022, b.roofFront],
      [sx * frontW, beltY, b.cabinFront], [sx * frontW, beltY, b.cabinRear],
    ]);
    // A-pillar + beltline trim, mirror, door handle, arch lips.
    tube(inner, mats.paint, [
      [sx * frontW, beltY, b.cabinFront + 0.045],
      [sx * (frontW + glassW) / 2, (beltY + b.roof) / 2, (b.cabinFront + b.roofFront) / 2],
      [sx * glassW, b.roof, b.roofFront],
    ], 0.032);
    tube(inner, mats.trim, [
      [sx * frontW * 1.025, beltY - 0.025, b.cabinFront],
      [sx * halfW * 0.992, 0.665, b.front - 0.5],
      [sx * halfW * 0.989, 0.38, b.front - 0.55],
    ], 0.004);
    const mirror = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), mats.paint);
    mirror.scale.set(0.118, 0.046, 0.072);
    mirror.position.set(sx * (halfW + 0.08), beltY + 0.097, b.cabinFront - 0.15);
    mirror.rotation.y = sx * -0.2;
    inner.add(mirror);
    box(inner, mats.alloy, [0.021, 0.011, 0.1], [sx * halfW * 0.987, 0.714, -0.455]);
    for (const axle of [b.front, b.rear]) {
      const pts = [];
      for (let k = 0; k <= 12; k++) {
        const a = (k / 12) * Math.PI;
        pts.push([sx * halfW * 0.992, b.radius + Math.sin(a) * (b.radius + 0.065), axle + Math.cos(a) * (b.radius + 0.065)]);
      }
      tube(inner, b.rally ? mats.trim : mats.paint, pts, b.rally ? 0.025 : 0.012, 12);
    }
    box(inner, mats.rubber, [0.024, 0.155, 0.42], [sx * halfW * 0.988, 0.555, -0.73], [0, 0, sx * -0.1]);
  }
  // Cowl + dashboard hint.
  box(inner, mats.dark, [glassW * 1.96, 0.025, b.roofFront - b.roofRear], [0, b.roof - 0.008, (b.roofFront + b.roofRear) * 0.5]);
  box(inner, mats.trim, [frontW * 1.8, 0.13, 0.28], [0, beltY - 0.075, b.cabinFront - 0.21]);

  // Rear deck: diffuser, strakes, taillights, exhausts.
  box(inner, mats.trim, [b.width * 0.83, 0.13, 0.45], [0, 0.315, -halfL + 0.2], [-0.12, 0, 0]);
  for (let e = -3; e <= 3; e++) {
    box(inner, mats.trim, [0.018, 0.15, 0.48], [e * 0.235, 0.266, -halfL + 0.16], [-0.1, 0, 0]);
  }
  for (const sx of [-1, 1]) {
    box(inner, mats.rubber, [0.63, 0.09, 0.07], [sx * halfW * 0.49, 0.687, -halfL + 0.062]);
    box(inner, mats.tail, [0.55, 0.025, 0.025], [sx * halfW * 0.49, 0.712, -halfL + 0.019]);
    box(inner, mats.tail, [0.48, 0.015, 0.025], [sx * halfW * 0.51, 0.674, -halfL + 0.019]);
    for (const [pr, pl, px] of [[0.065, 0.14, 0.015], [0.05, 0.13, 0.008]]) {
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, pl, 18, 1, true), mats.alloy);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(sx * 0.59, 0.427, -halfL + px);
      inner.add(tip);
      const dark2 = new THREE.Mesh(new THREE.CylinderGeometry(pr * 0.77, pr * 0.77, pl + 0.005, 16), mats.rubber);
      dark2.rotation.x = Math.PI / 2;
      dark2.position.copy(tip.position);
      inner.add(dark2);
    }
  }

  // Wing (swan mounts + plane + endplates) or ducktail spine.
  if (b.wing) {
    const wingY = b.prototype ? 1.05 : b.rally ? 1.38 : 1.005;
    for (const sx of [-1, 1]) {
      box(inner, mats.trim, [0.035, wingY - 0.72, 0.14], [sx * 0.56, (wingY + 0.72) / 2, -halfL + 0.4], [-0.16, 0, 0]);
      box(inner, mats.trim, [0.027, 0.16, 0.47], [sx * halfW * 0.93, wingY + 0.015, -halfL + 0.35], [0.02, 0, 0]);
    }
    box(inner, mats.trim, [b.width * 0.94, 0.035, 0.42], [0, wingY, -halfL + 0.36]);
    box(inner, mats.accent, [b.width * 0.87, 0.018, 0.034], [0, wingY - 0.032, -halfL + 0.57]);
  } else {
    tube(inner, mats.paint, [
      [-halfW * 0.78, 0.773, -halfL + 0.17], [0, 0.78, -halfL + 0.12], [halfW * 0.78, 0.773, -halfL + 0.17],
    ], 0.026);
  }
  if (b.rally) {
    // Roof pod + lamp cluster + mudflaps.
    box(inner, mats.trim, [0.3, 0.07, 0.25], [0, b.roof + 0.068, -0.08], [0.05, 0, 0]);
    for (const sx of [-1, 1]) {
      for (const lx of [-0.12, 0.12]) {
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.069, 0.069, 0.08, 20), mats.trim);
        lamp.rotation.x = Math.PI / 2;
        lamp.position.set(sx * 0.39 + lx, 0.58, halfL + 0.06);
        inner.add(lamp);
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), mats.lens);
        face.position.set(sx * 0.39 + lx, 0.58, halfL + 0.103);
        inner.add(face);
      }
      for (const axle of [b.front, b.rear]) {
        box(inner, mats.accent, [0.23, 0.24, 0.018], [sx * halfW * 0.9, 0.24, axle - 0.45]);
      }
    }
  }
  if (b.prototype) {
    // Dorsal fin + dive planes.
    const finShape = new THREE.Shape();
    finShape.moveTo(-0.9, 0.77);
    finShape.lineTo(-0.84, 1.03);
    finShape.lineTo(-2.13, 0.99);
    finShape.lineTo(-2.22, 0.75);
    finShape.closePath();
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.018, bevelEnabled: false }), mats.paint);
    fin.rotation.y = Math.PI / 2;
    fin.position.x = -0.009;
    inner.add(fin);
  }

  // Steering wheel hint (seen through the glass).
  const wheel = new THREE.Group();
  wheel.position.set(0.35, beltY - 0.03, b.cabinFront - 0.4);
  wheel.rotation.x = 0.18;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.016, 7, 24), mats.rubber);
  wheel.add(rim);
  inner.add(wheel);

  inner.traverse((o) => {
    if (o.isMesh) o.castShadow = o.material === mats.paint || o.material === mats.trim || o.material === mats.dark;
  });

  // Wheels on steering pivots.
  const wheels = [];
  for (const [axle, front] of [[b.front, true], [b.rear, false]]) {
    for (const sx of [-1, 1]) {
      const { pivot, spin } = buildWheel(b, mats, front);
      pivot.position.set(sx * (halfW - 0.104), b.radius, axle);
      group.add(pivot);
      wheels.push({ pivot, spin, front });
    }
  }

  group.userData.wheels = wheels;
  group.userData.inner = inner;
  group.userData.paintMat = mats.paint;
  group.userData.tailMat = mats.tail;
  group.userData.lensMat = mats.lens;
  group.userData.wheelRadius = b.radius;
  group.userData.steerWheel = wheel;
  group.userData.setColor = (c) => mats.paint.color.set(c);
  return group;
}

export function createGhostMesh(carId) {
  const mesh = createVehicleMesh(carId, GHOST_COLOR);
  mesh.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.45;
      o.material.emissive = new THREE.Color('#000000');
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

/**
 * Pose a three.js group from (track, state). Mirrors the original per-car
 * `update()`: wheel spin/steer/suspension, body roll/pitch, ride-height
 * sag with damage, steering-wheel turn, brake-light boost.
 */
export function poseVehicle(group, track, state, dt = 1 / 60) {
  const frame = track.sample(state.s);
  const pos = frame.position
    .clone()
    .addScaledVector(frame.right, state.lateral)
    .addScaledVector(frame.up, 0.05);
  group.position.copy(pos);
  const yaw = Math.atan2(frame.tangent.x, frame.tangent.z) + state.heading;
  group.rotation.set(0, yaw, -frame.bank - state.heading * 0.3, 'YXZ');

  const ud = group.userData;
  const speed = Number.isFinite(state.speed) ? state.speed : 0;
  const steer = THREE.MathUtils.clamp(state.steer || 0, -1, 1);
  const brake = THREE.MathUtils.clamp(state.brake || 0, 0, 1);
  const throttle = THREE.MathUtils.clamp(state.throttle || 0, 0, 1);
  const damage = THREE.MathUtils.clamp(state.damage || 0, 0, 1);
  const radius = ud.wheelRadius ?? 0.36;

  for (const w of ud.wheels ?? []) {
    w.spin.rotation.x = (w.spin.rotation.x + (speed * dt) / radius) % (Math.PI * 2);
    w.pivot.rotation.y = w.front ? (steer * 0.55) / (1 + Math.max(0, speed) * 0.034) : 0;
  }
  if (ud.inner) {
    // Body lean: roll into steering, pitch under brake/throttle.
    const roll = -steer * Math.min(Math.abs(speed) / 55, 1) * 0.035;
    const pitch = ((brake * 0.024 - throttle * 0.009) * Math.min(Math.abs(speed) / 10, 1)) || 0;
    const k = 1 - Math.exp(-dt * 9);
    ud.inner.rotation.z += (roll - ud.inner.rotation.z) * k;
    ud.inner.rotation.x += (pitch - ud.inner.rotation.x) * k;
    ud.inner.position.y = -damage * 0.018;
  }
  if (ud.steerWheel) ud.steerWheel.rotation.z = -steer * 1.05;
  if (ud.tailMat) ud.tailMat.emissiveIntensity = 2.2 + brake * 7.5;
}

export { deriveCarStats };
