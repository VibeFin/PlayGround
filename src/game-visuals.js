import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// All geometry is procedural. Meshes share geometry/materials and effects are pooled.
export function createGameVisuals(THREE, scene, camera) {
  const geometries = [];
  const materials = [];
  const geometry = value => (geometries.push(value), value);
  const material = options => {
    const value = new THREE.MeshStandardMaterial(options);
    materials.push(value);
    return value;
  };
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const bevelBox = geometry(new RoundedBoxGeometry(1, 1, 1, 1, 0.055));
  const sphere = geometry(new THREE.SphereGeometry(1, 8, 6));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 10));
  const steel = material({ color: 0x626f74, roughness: 0.37, metalness: 0.7 });
  const dark = material({ color: 0x202a2f, roughness: 0.58, metalness: 0.45 });
  const grip = material({ color: 0x313b2b, roughness: 0.9 });
  const brass = material({ color: 0xc0a060, roughness: 0.35, metalness: 0.7 });
  // One deterministic, canvas-free grime tile for the infected only. Broad damp
  // stains, vertical seepage and fine flecks survive both close and distant views.
  const grimePixels = new Uint8Array(64 * 64 * 4);
  let grimeSeed = 731;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    grimeSeed = (Math.imul(grimeSeed, 1664525) + 1013904223) >>> 0;
    const noise = grimeSeed / 4294967296;
    const stain = Math.sin(x * 0.23 + Math.sin(y * 0.13) * 2) * Math.cos(y * 0.17);
    const streak = Math.pow(Math.max(0, Math.sin(x * 0.71 + Math.sin(y * 0.09))), 8);
    const value = Math.round(188 + stain * 37 - streak * 44 + noise * 29 - (noise < 0.055 ? 65 : 0));
    const i = (y * 64 + x) * 4;
    grimePixels.set([value, Math.round(value * 0.97), Math.round(value * 0.9), 255], i);
  }
  const zombieGrime = new THREE.DataTexture(grimePixels, 64, 64);
  zombieGrime.colorSpace = THREE.SRGBColorSpace;
  zombieGrime.wrapS = zombieGrime.wrapT = THREE.RepeatWrapping;
  zombieGrime.magFilter = THREE.LinearFilter;
  zombieGrime.minFilter = THREE.LinearMipmapLinearFilter;
  zombieGrime.generateMipmaps = true;
  zombieGrime.needsUpdate = true;
  const skin = material({ color: 0x9ba18b, roughness: 0.98, map: zombieGrime });
  // The existing material lifecycle owns this shared zombie-only texture.
  skin.addEventListener('dispose', () => zombieGrime.dispose());
  const wound = material({ color: 0x482c29, roughness: 1, map: zombieGrime });
  const boots = material({ color: 0x242827, roughness: 1, map: zombieGrime });
  const shirts = [0x586662, 0x88705b, 0x575a6b, 0x647057].map(color => material({ color, roughness: 1, map: zombieGrime }));
  const pants = material({ color: 0x3f4847, roughness: 1, map: zombieGrime });
  const hollows = material({ color: 0x161c1b, roughness: 1 });
  const deadEyes = material({ color: 0xc3cb9b, roughness: 0.6, emissive: 0x82a348, emissiveIntensity: 0.65 });
  const eyes = material({ color: 0xdef18c, emissive: 0xbad968, emissiveIntensity: 2.6 });
  // A soft additive eye glow fades in past arm's reach, where the mesh eyes
  // shrink to a few pixels, so distant infected stay readable in the dark yard.
  const glowPixels = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = (x + 0.5) / 32 - 0.5, dy = (y + 0.5) / 32 - 0.5;
    const falloff = Math.pow(Math.max(0, 1 - Math.hypot(dx, dy) * 2), 1.7);
    const i = (y * 32 + x) * 4;
    glowPixels.set([222, 243, 150, Math.round(falloff * 255)], i);
  }
  const eyeGlowTexture = new THREE.DataTexture(glowPixels, 32, 32);
  eyeGlowTexture.wrapS = eyeGlowTexture.wrapT = THREE.ClampToEdgeWrapping;
  eyeGlowTexture.magFilter = THREE.LinearFilter;
  eyeGlowTexture.minFilter = THREE.LinearMipmapLinearFilter;
  eyeGlowTexture.generateMipmaps = true;
  eyeGlowTexture.needsUpdate = true;
  const eyeGlowMaterial = new THREE.SpriteMaterial({
    map: eyeGlowTexture, color: 0xe8ffa6, blending: THREE.AdditiveBlending,
    transparent: true, opacity: 0.85, depthWrite: false,
  });
  materials.push(eyeGlowMaterial);
  eyeGlowMaterial.addEventListener('dispose', () => eyeGlowTexture.dispose());
  const sleeve = material({ color: 0x646b4d, roughness: 1 });
  const glove = material({ color: 0x36392c, roughness: 0.95 });
  const root = new THREE.Group();
  root.name = 'game-actors-and-effects';
  scene.add(root);
  if (!camera.parent) scene.add(camera);

  function mesh(parent, geo, mat, position, scale, rotation) {
    const object = new THREE.Mesh(geo, mat);
    object.position.set(...position);
    object.scale.set(...scale);
    if (rotation) object.rotation.set(...rotation);
    parent.add(object);
    return object;
  }
  // Merge rigid surfaces by material while retaining the animated joint groups.
  // Merged zombie templates are cached, so every new wave reuses GPU resources.
  function batchRigid(parent, excluded = new Set()) {
    const batches = new Map();
    const removed = [];
    function collect(object, matrix) {
      if (!object.isMesh || excluded.has(object)) return;
      object.updateMatrix();
      const transform = matrix.clone().multiply(object.matrix);
      const geo = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geo.applyMatrix4(transform);
      if (!batches.has(object.material)) batches.set(object.material, []);
      batches.get(object.material).push(geo);
      for (const child of object.children) collect(child, transform);
      removed.push(object);
    }
    for (const child of [...parent.children]) collect(child, new THREE.Matrix4());
    for (const object of removed) object.removeFromParent();
    for (const [mat, geos] of batches) {
      const merged = geometry(mergeGeometries(geos));
      for (const geo of geos) geo.dispose();
      parent.add(new THREE.Mesh(merged, mat));
    }
  }
  const weapon = new THREE.Group();
  weapon.name = 'Kestrel-9-first-person';
  camera.add(weapon);
  weapon.visible = false;
  // The front insert center and rear notch share one camera-parallel sight line.
  // Translating by -sightHeight in ADS puts that line on the actual firing ray.
  const sightHeight = 0.102;
  // Forward is camera -Z. Layered receiver, ribbed furniture, iron sights,
  // magazine, trigger guard and gloved hands give a readable close-up silhouette.
  mesh(weapon, bevelBox, dark, [0, 0, -0.25], [0.105, 0.12, 0.43]);
  mesh(weapon, bevelBox, steel, [0, 0.055, -0.24], [0.09, 0.055, 0.39]);
  mesh(weapon, box, steel, [0.055, 0.005, -0.2], [0.006, 0.036, 0.095]);
  mesh(weapon, box, dark, [0.06, 0.023, -0.11], [0.055, 0.025, 0.035]);
  mesh(weapon, box, steel, [-0.054, 0.007, -0.16], [0.004, 0.044, 0.15]);
  mesh(weapon, box, dark, [-0.057, 0.01, -0.16], [0.004, 0.021, 0.105]);
  mesh(weapon, box, brass, [-0.06, 0.011, -0.12], [0.005, 0.01, 0.027]);
  for (const z of [-0.08, -0.28]) mesh(weapon, cylinder, steel, [-0.056, -0.025, z], [0.008, 0.006, 0.008], [0, 0, Math.PI / 2]);
  for (let i = 0; i < 5; i++) mesh(weapon, box, steel, [-0.054, -0.026, -0.17 - i * 0.01], [0.004, 0.004, 0.006]);
  mesh(weapon, cylinder, steel, [0, 0.023, -0.565], [0.023, 0.28, 0.023], [Math.PI / 2, 0, 0]);
  mesh(weapon, cylinder, dark, [0, 0.023, -0.708], [0.032, 0.068, 0.032], [Math.PI / 2, 0, 0]);
  mesh(weapon, bevelBox, grip, [0, -0.025, -0.445], [0.115, 0.11, 0.17]);
  for (let i = 0; i < 6; i++) {
    mesh(weapon, box, dark, [0, -0.03, -0.38 - i * 0.026], [0.12, 0.115, 0.008]);
  }
  mesh(weapon, box, grip, [0, -0.14, -0.065], [0.073, 0.19, 0.08], [-0.24, 0, 0]);
  mesh(weapon, box, dark, [0, -0.095, -0.17], [0.065, 0.012, 0.13]);
  mesh(weapon, box, dark, [0, -0.06, -0.23], [0.065, 0.075, 0.012]);
  mesh(weapon, box, brass, [0, -0.06, -0.15], [0.012, 0.05, 0.012], [0.3, 0, 0]);
  const magazine = mesh(weapon, bevelBox, steel, [0, -0.17, -0.29], [0.07, 0.23, 0.09], [-0.12, 0, 0]);
  for (const x of [-0.036, 0.036]) {
    mesh(weapon, box, dark, [x, sightHeight, -0.075], [0.019, 0.045, 0.032]);
    mesh(weapon, box, dark, [x, 0.092, -0.54], [0.012, 0.045, 0.025]);
  }
  const frontSight = mesh(weapon, box, eyes, [0, sightHeight, -0.54], [0.008, 0.018, 0.008]);
  frontSight.name = 'Kestrel-front-sight';
  mesh(weapon, bevelBox, dark, [0, 0.025, 0.035], [0.095, 0.12, 0.14]);
  mesh(weapon, bevelBox, glove, [0.024, -0.15, -0.055], [0.105, 0.105, 0.12], [-0.2, 0, -0.12]);
  mesh(weapon, bevelBox, sleeve, [0.09, -0.25, 0.025], [0.12, 0.23, 0.14], [-0.5, 0, -0.4]);
  const supportHand = new THREE.Group();
  weapon.add(supportHand);
  mesh(supportHand, bevelBox, glove, [-0.055, -0.087, -0.41], [0.1, 0.1, 0.12], [0, 0, 0.25]);
  mesh(supportHand, bevelBox, sleeve, [-0.12, -0.19, -0.28], [0.115, 0.27, 0.13], [-0.7, 0, -0.4]);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffde8c, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  materials.push(flashMat);
  const flash = mesh(weapon, sphere, flashMat, [0, 0.023, -0.79], [0.075, 0.06, 0.15]);
  flash.visible = false;
  const flashLight = new THREE.PointLight(0xffc778, 0, 6, 2);
  flashLight.position.set(0, 0.05, -0.8);
  weapon.add(flashLight);
  // A soft camera-local fill keeps the weapon legible without ambient world light.
  const fill = new THREE.PointLight(0xa8c9c6, 0.7, 1.8, 2);
  fill.position.set(-0.3, 0.35, 0.1);
  weapon.add(fill);
  // The insert was already the only emissive weapon batch: keeping it named
  // allows exact projection checks without adding a mesh or draw call.
  batchRigid(weapon, new Set([magazine, flash, frontSight]));
  batchRigid(supportHand);
  let overlayOrder = 10000;
  let firstOpaque = true;
  weapon.traverse(object => {
    if (!object.isMesh) return;
    object.renderOrder = overlayOrder++;
    object.frustumCulled = false;
    if (firstOpaque && !object.material.transparent) {
      // Draw after the world with a fresh depth buffer, retaining weapon
      // self-occlusion while preventing nearby walls from swallowing the gun.
      object.onBeforeRender = renderer => renderer.clearDepth();
      firstOpaque = false;
    }
  });
  let flashTime = 0;
  const zombieTemplates = new Map();

  // Low-sided elliptical rings give the chest and skull anatomical profiles,
  // rather than scaling cubes. Ring entries: y, x radius, z radius, z offset.
  function infectedProfile(rings, ragged = false) {
    const positions = [], uvs = [], indices = [];
    const sides = 10;
    for (let r = 0; r < rings.length; r++) {
      const [y, rx, rz, z] = rings[r];
      for (let s = 0; s <= sides; s++) {
        const angle = s / sides * Math.PI * 2;
        const tear = ragged && r === 0 ? [0.025, -0.045, 0.01, -0.02, 0.035][s % 5] : 0;
        positions.push(Math.sin(angle) * rx, y + tear, Math.cos(angle) * rz + z);
        uvs.push(s / sides, r / (rings.length - 1));
        if (r && s < sides) {
          const a = (r - 1) * (sides + 1) + s, b = r * (sides + 1) + s;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geometry(geo);
  }
  const infectedTorso = infectedProfile([
    [0.84, 0.17, 0.115, 0], [0.96, 0.145, 0.105, 0],
    [1.12, 0.19, 0.125, -0.02], [1.3, 0.24, 0.145, -0.045],
    [1.4, 0.185, 0.115, -0.055], [1.445, 0.085, 0.07, -0.015],
  ], true);
  const infectedSkull = infectedProfile([
    [-0.195, 0.035, 0.035, 0.04], [-0.155, 0.079, 0.075, 0.035],
    [-0.085, 0.1, 0.105, 0.006], [0.015, 0.13, 0.117, 0],
    [0.105, 0.14, 0.12, -0.018], [0.175, 0.104, 0.09, -0.025],
    [0.205, 0, 0, -0.02],
  ]);
  const infectedLimb = geometry(new THREE.CylinderGeometry(0.68, 1, 1, 8));
  const clothTatter = geometry(new THREE.ConeGeometry(1, 1, 3));
  function infectedBone(parent, mat, from, to, width, depth = width) {
    const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const part = mesh(parent, infectedLimb, mat, start.add(end).multiplyScalar(0.5).toArray(), [width, direction.length(), depth]);
    part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return part;
  }

  function zombie(id, variant = 0) {
    if (zombieTemplates.has(variant)) {
      const group = zombieTemplates.get(variant).clone(true);
      group.name = `infected-${id}`;
      root.add(group);
      return { group, variant, rig: group.getObjectByName('rig'), head: group.getObjectByName('head'),
        legs: [group.getObjectByName('leg--1'), group.getObjectByName('leg-1')],
        arms: [group.getObjectByName('arm--1'), group.getObjectByName('arm-1')],
        glow: group.getObjectByName('eye-glow') };
    }
    const group = new THREE.Group();
    group.name = `infected-${id}`;
    const rig = new THREE.Group();
    rig.name = 'rig';
    group.add(rig);
    const cloth = shirts[Math.abs(variant) % shirts.length];
    mesh(rig, infectedTorso, cloth, [0, 0, 0], [1, 1, 1], [0, 0, -0.035]);
    mesh(rig, sphere, pants, [0.015, 0.86, -0.005], [0.18, 0.105, 0.12]);
    // Exposed throat and folded collar reinforce the forward neck / raised back.
    infectedBone(rig, skin, [0.025, 1.4, -0.015], [0.025, 1.55, 0.06], 0.067, 0.064);
    for (const side of [-1, 1]) {
      infectedBone(rig, cloth, [side * 0.17, 1.385, 0.015], [side * 0.048, 1.36, 0.112], 0.025, 0.018);
      mesh(rig, clothTatter, cloth, [side * 0.14, 0.835, 0.09], [0.055, side < 0 ? 0.16 : 0.09, 0.02], [0, 0, Math.PI + side * 0.18]);
    }
    mesh(rig, sphere, wound, [0.115, 1.19, 0.09], [0.061, 0.115, 0.019], [0, 0, -0.3]);
    for (let i = 0; i < 3; i++) {
      infectedBone(rig, skin, [0.077, 1.14 + i * 0.04, 0.11], [0.14, 1.16 + i * 0.04, 0.117], 0.009, 0.007);
      mesh(rig, clothTatter, cloth, [0.06, 1.14 + i * 0.04, 0.126], [0.027, 0.073, 0.012], [0, 0, -0.65]);
    }
    // Long split placket and one sagging pocket, all merged into the shirt batch.
    infectedBone(rig, cloth, [-0.015, 0.93, 0.111], [-0.022, 1.32, 0.105], 0.017, 0.012);
    mesh(rig, infectedLimb, cloth, [-0.116, 1.22, 0.109], [0.063, 0.115, 0.019], [0, 0, -0.16]);
    const head = new THREE.Group();
    head.name = 'head';
    head.position.set(0.025, 1.65, 0.075);
    rig.add(head);
    mesh(head, infectedSkull, skin, [0, 0, 0], [1, 1, 1]);
    mesh(head, sphere, hollows, [0.008, -0.112, 0.1], [0.055, 0.047, 0.017], [0, 0, -0.17]);
    mesh(head, sphere, wound, [0.067, -0.086, 0.089], [0.024, 0.078, 0.014], [0, 0, -0.27]);
    infectedBone(head, skin, [0, 0.052, 0.107], [0.009, -0.037, 0.15], 0.023, 0.021);
    for (const side of [-1, 1]) {
      const x = side * 0.061;
      mesh(head, sphere, hollows, [x, 0.016, 0.102], [0.047, 0.034, 0.024], [0, side * 0.2, side * 0.13]);
      mesh(head, sphere, deadEyes, [x, 0.011, 0.124], [0.012, side < 0 ? 0.009 : 0.006, 0.006]);
      infectedBone(head, skin, [side * 0.023, 0.06, 0.111], [side * 0.108, 0.052, 0.086], 0.021, 0.022);
      infectedBone(head, skin, [side * 0.104, -0.035, 0.082], [side * 0.04, -0.069, 0.113], 0.023, 0.015);
      mesh(head, sphere, skin, [side * 0.136, -0.008, -0.005], [0.023, 0.044, 0.025]);
      mesh(head, sphere, skin, [side * 0.022, -0.087, 0.115], [0.014, 0.013, 0.006]);
    }
    // Matted remnants follow the cranium instead of a rectangular hair cap.
    mesh(head, sphere, hollows, [-0.036, 0.147, -0.039], [0.098, 0.056, 0.093], [0, 0, -0.28]);
    mesh(head, sphere, hollows, [0.082, 0.097, -0.065], [0.041, 0.075, 0.075], [0.2, 0, 0.2]);
    const legs = [], arms = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.name = `leg-${side}`;
      leg.position.set(side * 0.115, 0.86, 0);
      rig.add(leg);
      const kneeZ = side < 0 ? 0.065 : 0.015;
      infectedBone(leg, pants, [0, -0.015, 0], [side * 0.014, -0.36, kneeZ], 0.104, 0.103);
      mesh(leg, sphere, side < 0 ? skin : pants, [side * 0.014, -0.37, kneeZ], [0.065, 0.079, 0.067]);
      infectedBone(leg, pants, [side * 0.014, -0.39, kneeZ], [-side * 0.015, -0.7, -0.025], 0.076, 0.075);
      mesh(leg, clothTatter, pants, [side * 0.05, -0.37, kneeZ + 0.035], [0.035, 0.12, 0.02], [0.15, 0, Math.PI + 0.2]);
      mesh(leg, sphere, boots, [-side * 0.015, -0.75, 0.025], [0.092, 0.1, 0.165], [0, side * 0.1, 0]);
      legs.push(leg);
      const arm = new THREE.Group();
      arm.name = `arm-${side}`;
      arm.position.set(side * 0.235, side < 0 ? 1.365 : 1.315, -0.035);
      rig.add(arm);
      mesh(arm, sphere, cloth, [0, -0.045, 0], [0.096, 0.112, 0.1]);
      infectedBone(arm, cloth, [0, -0.035, 0], [side * 0.025, -0.255, 0.035], 0.087, 0.09);
      mesh(arm, clothTatter, cloth, [side * 0.04, -0.26, 0.046], [0.046, 0.125, 0.023], [0, 0, Math.PI - side * 0.22]);
      mesh(arm, sphere, skin, [side * 0.025, -0.28, 0.04], [0.059, 0.064, 0.062]);
      infectedBone(arm, skin, [side * 0.025, -0.29, 0.04], [side * 0.016, -0.485, 0.155], 0.058, 0.06);
      mesh(arm, sphere, skin, [side * 0.016, -0.515, 0.17], [0.062, 0.075, 0.032], [-0.45, 0, 0]);
      // Separated hooked fingers give the reaching silhouette a grasping edge.
      for (let finger = 0; finger < 3; finger++) {
        const x = side * 0.016 + (finger - 1) * 0.034;
        const reach = finger === 1 ? 0.012 : 0;
        infectedBone(arm, skin, [x, -0.548, 0.181], [x * 1.17, -0.607 - reach, 0.203], 0.013, 0.014);
        infectedBone(arm, skin, [x * 1.17, -0.607 - reach, 0.203], [x * 1.13, -0.624 - reach, 0.232], 0.01, 0.011);
      }
      infectedBone(arm, skin, [side * 0.055, -0.505, 0.18], [side * 0.09, -0.553, 0.222], 0.019, 0.018);
      arm.rotation.set(side < 0 ? -1.03 : -0.64, side * -0.12, side * 0.12);
      arms.push(arm);
    }
    for (const joint of [rig, head, ...legs, ...arms]) batchRigid(joint);
    // Added after batching so the glow survives as an independent billboard.
    const glow = new THREE.Sprite(eyeGlowMaterial);
    glow.name = 'eye-glow';
    glow.position.set(0.025, 1.66, 0.21);
    glow.scale.set(0.34, 0.17, 1);
    glow.visible = false;
    rig.add(glow);
    zombieTemplates.set(variant, group.clone(true));
    root.add(group);
    return { group, rig, head, legs, arms, variant, glow };
  }

  const glowCamera = new THREE.Vector3();
  const glowActor = new THREE.Vector3();
  function animateZombie(model, time, speed, attacking = false, death = 0) {
    if (model.glow) {
      if (death > 0) model.glow.visible = false;
      else {
        camera.getWorldPosition(glowCamera);
        model.group.getWorldPosition(glowActor);
        const distance = glowCamera.distanceTo(glowActor);
        model.glow.visible = distance > 7.5;
        if (model.glow.visible) {
          const grow = Math.min(1, Math.max(0, (distance - 8) / 18));
          model.glow.scale.set(0.34 * (1 + grow * 0.85), 0.17 * (1 + grow * 0.85), 1);
        }
      }
    }
    const t = time * (3.4 + speed) + model.variant * 1.7;
    const stride = Math.sin(t);
    const drag = Math.max(0, Math.sin(t + 0.6));
    const lunge = attacking ? 0.5 + Math.sin(t * 1.8) * 0.5 : 0;
    model.rig.position.y = Math.abs(stride) * 0.023 - drag * 0.018;
    model.rig.rotation.z = -0.025 + stride * 0.025;
    model.rig.rotation.x = 0.018 + lunge * 0.025;
    model.rig.rotation.y = Math.sin(t + 0.4) * 0.035;
    model.head.rotation.z = 0.14 + Math.sin(t * 0.6) * 0.055;
    model.head.rotation.x = -0.055 + Math.sin(t * 0.7) * 0.035;
    model.head.rotation.y = Math.sin(t * 0.4) * 0.09;
    model.legs[0].rotation.set(stride * 0.32, -0.06, -0.025);
    model.legs[1].rotation.set(-stride * 0.16 + 0.075, 0.09, 0.045);
    model.arms[0].rotation.set(-1.03 - stride * 0.1 - lunge * 0.28, -0.12, -0.13 - drag * 0.035);
    model.arms[1].rotation.set(-0.64 + Math.sin(t + 0.8) * 0.13 - lunge * 0.55, 0.16, 0.16);
    if (death > 0) {
      model.rig.rotation.x = -Math.min(1, death * 2) * 1.48;
      model.rig.position.y = -death * 0.7;
      model.group.scale.setScalar(Math.max(0, 1 - Math.max(0, death - 0.6) * 2.5));
    }
  }

  const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xfbeaac, transparent: true, opacity: 0.62, depthWrite: false });
  const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffd182 });
  const bloodMaterial = new THREE.MeshBasicMaterial({ color: 0x994b35 });
  materials.push(tracerMaterial, sparkMaterial, bloodMaterial);
  const tracers = Array.from({ length: 20 }, () => {
    const geo = geometry(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMaterial);
    line.frustumCulled = false;
    line.visible = false;
    root.add(line);
    return { line, life: 0 };
  });
  const sparks = Array.from({ length: 64 }, () => {
    const object = mesh(root, sphere, sparkMaterial, [0, 0, 0], [0.02, 0.02, 0.02]);
    object.visible = false;
    return { object, life: 0, velocity: new THREE.Vector3() };
  });
  let tracerIndex = 0, sparkIndex = 0;
  function trace(from, to, hit = false, blood = false) {
    const tracer = tracers[tracerIndex++ % tracers.length];
    const positions = tracer.line.geometry.attributes.position;
    positions.setXYZ(0, from.x, from.y, from.z);
    positions.setXYZ(1, to.x, to.y, to.z);
    positions.needsUpdate = true;
    tracer.line.visible = true;
    tracer.life = 0.055;
    if (hit) for (let i = 0; i < 6; i++) {
      const spark = sparks[sparkIndex++ % sparks.length];
      spark.object.position.copy(to);
      spark.object.material = blood ? bloodMaterial : sparkMaterial;
      spark.object.visible = true;
      spark.life = 0.15 + Math.random() * 0.18;
      spark.velocity.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2);
    }
  }

  function update(dt, { time, moving, sprinting, aiming, recoil, reloadProgress, pitch, lookX }) {
    const hipWeight = 1 - aiming;
    const bob = (moving ? (sprinting ? 0.018 : 0.008) : 0.0015) * hipWeight * hipWeight;
    const rate = sprinting ? 12 : 8;
    const reloadSwing = reloadProgress >= 0 ? Math.sin(Math.PI * reloadProgress) : 0;
    const kick = recoil * (1 - aiming * 0.65);
    weapon.position.set(
      0.27 * hipWeight + Math.sin(time * rate * 0.5) * bob,
      -0.255 * hipWeight - sightHeight * aiming + Math.cos(time * rate) * bob - reloadSwing * 0.14,
      // ADS extends away from the eye: the rear cap stays >= 0.465m away,
      // rather than 0.135m, substantially reducing receiver screen coverage.
      -0.32 - aiming * 0.25 + kick * 0.075,
    );
    weapon.rotation.set(kick * 0.11 + reloadSwing * 0.3 + (sprinting ? -0.15 * hipWeight : 0), reloadSwing * -0.35, reloadSwing * -0.48 - Math.max(-0.07, Math.min(0.07, lookX * 0.001)) * hipWeight);
    magazine.position.y = -0.17 - reloadSwing * 0.28;
    supportHand.position.set(-reloadSwing * 0.07, -reloadSwing * 0.17, reloadSwing * 0.17);
    flashTime = Math.max(0, flashTime - dt);
    flash.visible = flashTime > 0;
    flashLight.intensity = flashTime > 0 ? 3 : 0;
    for (const tracer of tracers) {
      tracer.life -= dt;
      tracer.line.visible = tracer.life > 0;
    }
    for (const spark of sparks) if (spark.life > 0) {
      spark.life -= dt;
      spark.object.visible = spark.life > 0;
      spark.velocity.y -= dt * 5;
      spark.object.position.addScaledVector(spark.velocity, dt);
    }
  }
  function createSupply(position) {
    const group = new THREE.Group();
    group.position.copy(position);
    root.add(group);
    mesh(group, box, grip, [0, 0.32, 0], [1.15, 0.64, 0.65]);
    mesh(group, box, steel, [0, 0.66, 0], [1.2, 0.09, 0.7]);
    for (const x of [-0.4, 0.4]) mesh(group, box, brass, [x, 0.34, 0.335], [0.045, 0.62, 0.03]);
    mesh(group, box, eyes, [0, 0.4, 0.337], [0.19, 0.05, 0.015]);
    mesh(group, box, eyes, [0, 0.4, 0.34], [0.05, 0.19, 0.015]);
    return group;
  }
  function clearEffects() {
    for (const item of tracers) { item.life = 0; item.line.visible = false; }
    for (const item of sparks) { item.life = 0; item.object.visible = false; }
    flashTime = 0;
    flash.visible = false;
    flashLight.intensity = 0;
  }
  return {
    zombie, animateZombie, weapon, update, trace, createSupply, clearEffects,
    muzzle() { flashTime = 0.045; flash.rotation.z = Math.random() * Math.PI; },
    removeZombie(model) { root.remove(model.group); },
    dispose() {
      root.removeFromParent();
      weapon.removeFromParent();
      for (const item of geometries) item.dispose();
      for (const item of materials) item.dispose();
    },
  };
}
