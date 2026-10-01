import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Coordinates and heights are shared by rendering, collision and game actors.
const BOUNDS = 650;
const EYE_HEIGHT = 2.2;
const TERRAIN_SIZE = 1440;
const TERRAIN_SEGMENTS = 80;
const CELL = TERRAIN_SIZE / TERRAIN_SEGMENTS;
const HALF = TERRAIN_SIZE / 2;
const GRAVITY = 34;
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const gaussian = (x, z, cx, cz, width) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (width * width));

function landscape(x, z) {
  // A low central run, with wide banked ski routes and a higher outer rim.
  let h = 10 + 10 * Math.sin(z / 89) * Math.sin(x / 113)
    + 6 * Math.cos(x / 67 + z / 100) + 4 * Math.sin(z / 45 + x / 150);
  h += 35 * gaussian(x, z, 0, 230, 125) + 35 * gaussian(x, z, 0, -230, 125);
  h += 39 * gaussian(x, z, -165, 55, 95) + 44 * gaussian(x, z, 170, -100, 105);
  h += 30 * gaussian(x, z, 135, 255, 100) + 34 * gaussian(x, z, -150, -270, 95);
  h += 85 * smooth(250, 640, Math.abs(x)) + 60 * smooth(350, 680, Math.abs(z));
  h += 18 * smooth(240, 450, Math.abs(x)) * Math.sin(z / 51 + x / 87);
  const cut = (Math.abs(x) - 405 - 35 * Math.sin(z / 130)) / 36;
  h += 38 * Math.exp(-cut * cut); // Steep exposed rock cuts along the outer ski banks.
  for (const bz of [-230, 230]) {
    const distance = Math.hypot(x, z - bz);
    // Both flag stands and the full base yard really are flat.
    h = THREE.MathUtils.lerp(43, h, smooth(44, 88, distance));
  }
  return h;
}

function makeTerrain() {
  const heights = new Float32Array((TERRAIN_SEGMENTS + 1) ** 2);
  const positions = [];
  const colors = [];
  const indices = [];
  const snow = new THREE.Color();
  for (let iz = 0; iz <= TERRAIN_SEGMENTS; iz++) {
    for (let ix = 0; ix <= TERRAIN_SEGMENTS; ix++) {
      const x = ix * CELL - HALF;
      const z = iz * CELL - HALF;
      const h = landscape(x, z);
      heights[iz * (TERRAIN_SEGMENTS + 1) + ix] = h;
      positions.push(x, h, z);
      const dx = (landscape(x + 2, z) - landscape(x - 2, z)) / 4;
      const dz = (landscape(x, z + 2) - landscape(x, z - 2)) / 4;
      const slope = Math.hypot(dx, dz);
      const rock = smooth(0.66, 1.2, slope) * smooth(65, 100, h);
      const grain = Math.sin(ix * 12.9898 + iz * 78.233) * 0.018;
      snow.setRGB(0.74 + grain, 0.86 + grain, 0.96 + grain);
      snow.lerp(new THREE.Color(0x263b4c), rock * 0.85);
      colors.push(snow.r, snow.g, snow.b);
      if (ix < TERRAIN_SEGMENTS && iz < TERRAIN_SEGMENTS) {
        const a = iz * (TERRAIN_SEGMENTS + 1) + ix;
        const b = a + 1;
        const c = a + TERRAIN_SEGMENTS + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const faceted = geometry.toNonIndexed();
  faceted.computeVertexNormals();
  geometry.dispose();
  const mesh = new THREE.Mesh(faceted, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  // The same triangle split as the mesh, rather than an approximate height function.
  function height(x, z) {
    const gx = clamp((x + HALF) / CELL, 0, TERRAIN_SEGMENTS - 0.000001);
    const gz = clamp((z + HALF) / CELL, 0, TERRAIN_SEGMENTS - 0.000001);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const u = gx - ix;
    const v = gz - iz;
    const a = iz * (TERRAIN_SEGMENTS + 1) + ix;
    const ha = heights[a];
    const hb = heights[a + 1];
    const hc = heights[a + TERRAIN_SEGMENTS + 1];
    const hd = heights[a + TERRAIN_SEGMENTS + 2];
    return u + v <= 1
      ? ha + u * (hb - ha) + v * (hc - ha)
      : hd + (1 - u) * (hc - hd) + (1 - v) * (hb - hd);
  }
  return { mesh, height };
}

function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.25, ...extra });
}

function box(group, mat, x, y, z, sx, sy, sz, shadow = true) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  object.position.set(x, y, z);
  object.castShadow = shadow;
  object.receiveShadow = true;
  group.add(object);
  return object;
}

function cylinder(group, mat, x, y, z, top, bottom, height, sides = 8, shadow = true) {
  const object = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, sides), mat);
  object.position.set(x, y, z);
  object.castShadow = shadow;
  object.receiveShadow = true;
  group.add(object);
  return object;
}

function batchStatic(group, animated = []) {
  // Architectural detail remains geometric, but shares a handful of draw calls.
  const batches = new Map();
  group.updateMatrix();
  for (const mesh of [...group.children]) {
    if (!mesh.isMesh || mesh.isInstancedMesh || animated.includes(mesh)) continue;
    mesh.updateMatrix();
    const key = `${mesh.material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}:${mesh.renderOrder}`;
    if (!batches.has(key)) batches.set(key, { meshes: [], geometries: [] });
    const batch = batches.get(key);
    batch.meshes.push(mesh);
    batch.geometries.push(mesh.geometry.clone().applyMatrix4(mesh.matrix));
  }
  for (const { meshes, geometries } of batches.values()) {
    if (meshes.length < 2) { geometries.forEach(g => g.dispose()); continue; }
    const merged = mergeGeometries(geometries);
    geometries.forEach(g => g.dispose());
    if (!merged) continue;
    const first = meshes[0];
    const mesh = new THREE.Mesh(merged, first.material);
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    group.add(mesh);
    for (const original of meshes) {
      group.remove(original);
      original.geometry.dispose();
    }
  }
}

function bakeStaticLighting(scene, terrainMesh) {
  // Sun/sky lighting is evaluated once, on vertices. The software GPU then only
  // interpolates color + fog: no PBR, normal derivatives or shadow-map sampling.
  const sun = new THREE.Vector3(-260, 430, -300).normalize();
  const fill = new THREE.Vector3(170, 140, 280).normalize();
  const normal = new THREE.Vector3();
  const point = new THREE.Vector3();
  const color = new THREE.Color();
  const matrix = new THREE.Matrix3();
  const opaque = new THREE.MeshBasicMaterial({ vertexColors: true });
  const weapon = new THREE.MeshBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false });
  scene.updateMatrixWorld(true);
  scene.traverse(mesh => {
    if (!mesh.isMesh || mesh.material.isShaderMaterial || mesh.material.isMeshBasicMaterial) return;
    const original = mesh.material;
    let geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const normals = geometry.getAttribute('normal');
    const positions = geometry.getAttribute('position');
    const sourceColors = geometry.getAttribute('color');
    const colors = new Float32Array(positions.count * 3);
    matrix.getNormalMatrix(mesh.matrixWorld);
    const glowing = original.emissiveIntensity > 0 && original.emissive?.getHex() !== 0;
    for (let i = 0; i < positions.count; i++) {
      color.copy(original.color);
      if (sourceColors) color.multiply(new THREE.Color().fromBufferAttribute(sourceColors, i));
      if (!glowing) {
        normal.fromBufferAttribute(normals, i).applyMatrix3(matrix).normalize();
        let light = 0.46 + 0.48 * Math.max(0, normal.dot(sun))
          + 0.18 * Math.max(0, normal.dot(fill)) + 0.08 * Math.max(0, normal.y);
        if (mesh === terrainMesh) {
          point.fromBufferAttribute(positions, i);
          // Broad, baked tower shadows anchor the bases without a render pass.
          for (const bz of [-230, 230]) for (const x of [-24, 24]) {
            const along = point.z - bz - 14;
            const across = point.x - x - along * 0.3;
            light *= 1 - 0.3 * Math.exp(-(across * across / 35 + along * along / 260));
          }
        }
        color.multiplyScalar(light);
      } else color.multiplyScalar(1.25);
      color.toArray(colors, i * 3);
    }
    // Basic shading needs neither normals nor UVs. A common layout also allows
    // all differently colored armor pieces to merge into the same draw call.
    for (const attribute of Object.keys(geometry.attributes)) {
      if (attribute !== 'position') geometry.deleteAttribute(attribute);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    mesh.geometry = geometry;
    mesh.material = original.depthTest === false ? weapon : opaque;
    mesh.castShadow = mesh.receiveShadow = false;
  });
}

function buildBase(scene, position, team, colliders, beacons) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.rotation.y = team === 'blue' ? 0 : Math.PI;
  scene.add(group);
  const color = team === 'blue' ? 0x26caff : 0xff5269;
  const dark = material(0x182b3c, { metalness: 0.65 });
  const armor = material(0x78929e, { metalness: 0.5 });
  const white = material(0xd5e6ef);
  const glow = material(color, { emissive: color, emissiveIntensity: 2.1, toneMapped: false });
  const deck = material(0x334a5b);
  cylinder(group, deck, 0, -0.04, 0, 29, 30, 0.16, 8, false);
  cylinder(group, armor, 0, 0.07, 0, 8.5, 9.5, 0.16, 8, false);
  // The circular socket leaves room for the gameplay-owned flag.
  const socket = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.14, 4, 32), glow);
  socket.rotation.x = Math.PI / 2;
  socket.position.y = 0.2;
  group.add(socket);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const strip = box(group, glow, Math.sin(angle) * 22, 0.14, Math.cos(angle) * 22, 0.35, 0.08, 5, false);
    strip.rotation.y = angle;
  }
  // Open-sided architecture frames the opening downhill view.
  for (const side of [-1, 1]) {
    const x = side * 24;
    cylinder(group, dark, x, 2.5, 9, 5, 7, 5);
    box(group, armor, x, 12, 9, 4.5, 21, 5);
    box(group, dark, x, 20, 9, 7, 3, 7);
    box(group, glow, x, 12, 6.4, 0.6, 17, 0.12, false);
    box(group, glow, x, 21.8, 9, 5.5, 0.4, 5.5, false);
    cylinder(group, dark, x, 27, 9, 0.3, 0.65, 11, 6);
    const beacon = cylinder(group, glow, x, 33, 9, 0.7, 0.7, 1.5, 8, false);
    beacons.push(beacon);
    colliders.push({ x: position.x + x * (team === 'blue' ? 1 : -1), z: position.z + (team === 'blue' ? 9 : -9), radius: 5.3, minY: position.y, maxY: position.y + 23 });
    box(group, dark, side * 17, 2.3, 27, 6, 4.6, 9);
    box(group, glow, side * 17, 3, 22.4, 4.7, 0.35, 0.15, false);
  }
  box(group, dark, 0, 5, 35, 27, 10, 12);
  const roof = box(group, white, 0, 10.5, 35, 30, 1.5, 15);
  roof.rotation.z = 0.025;
  box(group, glow, 0, 7, 28.8, 24, 0.5, 0.2, false);
  box(group, armor, 0, 3.1, 28.6, 9, 6.2, 0.5);
  box(group, glow, 0, 3.2, 28.25, 6.4, 4.4, 0.12, false);
  colliders.push({ x: position.x, z: position.z + (team === 'blue' ? 35 : -35), halfX: 14, halfZ: 6.5, minY: position.y, maxY: position.y + 12 });
  // Distant navigational beacon, intentionally transparent and very low draw cost.
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 1.5, 105, 8, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.17, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.set(0, 53, 35);
  group.add(beam);
  const icon = new THREE.Mesh(new THREE.OctahedronGeometry(2.8), glow);
  icon.position.set(0, 58, 35);
  group.add(icon);
  beacons.push(icon);
  for (let i = 0; i < 5; i++) {
    const z = -37 - i * 15;
    for (const side of [-1, 1]) {
      const px = side * (10 + i * 1.3);
      const pz = position.z + (team === 'blue' ? z : -z);
      const py = landscape(px, pz) - position.y;
      cylinder(group, dark, px, py + 1, z, 0.35, 0.55, 2, 6, false);
      box(group, glow, px, py + 2.05, z, 0.65, 0.13, 0.65, false);
    }
  }
  batchStatic(group, beacons);
}

function buildMountain(scene, x, z, radius, height, seed) {
  const segments = 11;
  const vertices = [];
  const colors = [];
  const indices = [];
  const color = new THREE.Color();
  const bottom = -25;
  for (let ring = 0; ring < 5; ring++) {
    const t = ring / 4;
    for (let i = 0; i <= segments; i++) {
      const a = (i % segments) / segments * Math.PI * 2;
      const variation = 1 + 0.19 * Math.sin(i * 4.3 + seed) + 0.1 * Math.sin(i * 2.1 + seed * 2);
      const r = radius * (1 - t) * variation;
      const y = bottom + height * t + (ring > 0 && ring < 4 ? Math.sin(i * 3.2 + seed) * height * 0.07 : 0);
      vertices.push(x + Math.cos(a) * r + t * radius * 0.13, y, z + Math.sin(a) * r);
      color.setHex(t >= 0.5 ? 0xd6e5ec : 0x496176);
      if (t === 0.5 && i % 3 === 0) color.setHex(0x718597);
      colors.push(color.r, color.g, color.b);
      if (ring < 4 && i < segments) {
        const j = ring * (segments + 1) + i;
        indices.push(j, j + segments + 1, j + 1, j + 1, j + segments + 1, j + segments + 2);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  const faceted = geo.toNonIndexed();
  faceted.computeVertexNormals();
  geo.dispose();
  const mesh = new THREE.Mesh(faceted, new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(mesh);
}

function buildScenery(scene, terrainHeight) {
  // Deterministic geometry: no downloads, heavy textures, or per-frame allocation.
  for (let i = 0; i < 23; i++) {
    const a = i * Math.PI * 2 / 23;
    const radius = 1150 + 180 * Math.sin(i * 3.7);
    buildMountain(scene, Math.sin(a) * radius, Math.cos(a) * radius,
      245 + 70 * Math.sin(i * 2.6), 330 + 175 * (0.5 + 0.5 * Math.sin(i * 5.7)), i * 2.3);
  }
  const rockMat = material(0x304556, { flatShading: true, roughness: 1, metalness: 0 });
  const snowMat = material(0xd4e4eb, { flatShading: true, metalness: 0 });
  const rockGeometry = new THREE.IcosahedronGeometry(1, 0);
  const rockInstances = new THREE.InstancedMesh(rockGeometry, rockMat, 48);
  const snowInstances = new THREE.InstancedMesh(rockGeometry, snowMat, 48);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 48; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (245 + (Math.sin(i * 12.23) * 0.5 + 0.5) * 320);
    const z = Math.sin(i * 4.71) * 610;
    const scale = 4 + (Math.sin(i * 2.72) * 0.5 + 0.5) * 13;
    const y = terrainHeight(x, z);
    dummy.position.set(x, y + scale * 0.15, z);
    dummy.rotation.set(i * 0.3, i * 1.7, i * 0.2);
    dummy.scale.set(scale * 1.5, scale, scale);
    dummy.updateMatrix();
    rockInstances.setMatrixAt(i, dummy.matrix);
    dummy.position.y += scale * 0.43;
    dummy.scale.set(scale * 1.3, scale * 0.58, scale * 0.93);
    dummy.updateMatrix();
    snowInstances.setMatrixAt(i, dummy.matrix);
  }
  rockInstances.receiveShadow = true;
  scene.add(rockInstances, snowInstances);
  // Two high, angular comms landmarks along the lateral ski routes.
  for (const side of [-1, 1]) {
    const group = new THREE.Group();
    group.position.set(side * 192, terrainHeight(side * 192, side * -60), side * -60);
    scene.add(group);
    const dark = material(0x24384b);
    const light = material(0xb3cbd5);
    const cyan = material(0x8fe8ff, { emissive: 0x3dbddd, emissiveIntensity: 1.2 });
    cylinder(group, dark, 0, 2, 0, 5, 7, 4);
    cylinder(group, light, 0, 19, 0, 1, 2.4, 34, 4);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 0.6, 4, 12), light);
    ring.position.y = 31;
    ring.rotation.x = Math.PI / 3;
    group.add(ring);
    box(group, cyan, 0, 38, 0, 2, 2, 2, false);
    batchStatic(group);
  }
}

function buildWeapon(camera) {
  const group = new THREE.Group();
  group.name = 'first-person-spinfusor';
  camera.add(group);
  const armor = material(0x344b60, { metalness: 0.65, roughness: 0.32 });
  const dark = material(0x101e2b, { metalness: 0.45 });
  const edge = material(0xa3c1d0, { metalness: 0.7 });
  const glow = material(0x32d7ff, { emissive: 0x13caff, emissiveIntensity: 2.3, toneMapped: false });
  for (const mat of [armor, dark, edge, glow]) {
    mat.depthTest = false;
    mat.depthWrite = false;
  }
  box(group, dark, 0, -0.06, 0.13, 0.17, 0.28, 0.2, false).rotation.x = -0.22;
  box(group, armor, 0, 0, -0.12, 0.3, 0.21, 0.55, false);
  box(group, edge, 0, 0.11, -0.17, 0.22, 0.04, 0.4, false);
  box(group, dark, 0, 0.01, -0.45, 0.25, 0.15, 0.23, false);
  const barrel = cylinder(group, edge, 0, 0.015, -0.57, 0.12, 0.14, 0.11, 10, false);
  barrel.rotation.x = Math.PI / 2;
  const mouth = cylinder(group, dark, 0, 0.015, -0.633, 0.089, 0.089, 0.018, 10, false);
  mouth.rotation.x = Math.PI / 2;
  const disc = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 5, 20), glow);
  disc.position.set(0, 0.015, -0.648);
  group.add(disc);
  for (const side of [-1, 1]) {
    box(group, armor, side * 0.19, 0.035, -0.24, 0.09, 0.15, 0.4, false);
    box(group, glow, side * 0.238, 0.055, -0.25, 0.008, 0.025, 0.27, false);
  }
  const rotor = cylinder(group, dark, 0, 0.135, -0.17, 0.155, 0.155, 0.055, 12, false);
  const rotorRing = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 4, 24), glow);
  rotorRing.rotation.x = Math.PI / 2;
  rotorRing.position.set(0, 0.166, -0.17);
  group.add(rotorRing);
  box(group, glow, 0, 0.15, -0.02, 0.09, 0.012, 0.05, false);
  // Forearm stays at the edge, leaving the flag stand and distant action clear.
  box(group, dark, -0.025, -0.16, 0.2, 0.18, 0.18, 0.34, false).rotation.x = -0.3;
  group.traverse(object => { if (object.isMesh) object.renderOrder = 100; });
  group.position.set(0.47, -0.37, -0.74);
  group.rotation.set(0.025, -0.07, -0.035);
  batchStatic(group, [rotor, disc]);
  return { group, rotor, disc };
}

export function createWorld(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9dbcd5);
  scene.fog = new THREE.Fog(0xaac9df, 360, 1800);
  const camera = new THREE.PerspectiveCamera(82, 1, 0.08, 4200);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : '';
  const softwareRenderer = /swiftshader|llvmpipe|lavapipe|software/i.test(gpuName);
  const maxRenderScale = softwareRenderer ? 0.6 : 1;
  let renderScale = maxRenderScale;
  renderer.setPixelRatio(renderScale);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = 1.15;
  // Static facet lighting and broad contact shadows are baked into vertex colors.
  renderer.shadowMap.enabled = false;
  scene.add(new THREE.HemisphereLight(0xc9e5ff, 0x536579, 1.7));
  const fill = new THREE.DirectionalLight(0xa9dfff, 1.15);
  fill.position.set(170, 140, 280);
  scene.add(fill);
  const sun = new THREE.DirectionalLight(0xffedcd, 2.8);
  sun.position.set(-260, 430, -300);
  scene.add(sun, sun.target);
  const skyGeometry = new THREE.SphereGeometry(3500, 16, 10);
  const skyPositions = skyGeometry.getAttribute('position');
  const skyColors = new Float32Array(skyPositions.count * 3);
  const horizonColor = new THREE.Color(0xb8d7e9);
  const topColor = new THREE.Color(0x376caa);
  const skyColor = new THREE.Color();
  for (let i = 0; i < skyPositions.count; i++) {
    skyColor.copy(horizonColor).lerp(topColor, Math.pow(Math.max(0, skyPositions.getY(i) / 3500), 0.55));
    skyColor.toArray(skyColors, i * 3);
  }
  skyGeometry.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
  const sky = new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, vertexColors: true,
  }));
  scene.add(sky);
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(32, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff2cf, fog: false, toneMapped: false }));
  sunDisc.position.copy(sun.position).normalize().multiplyScalar(2900);
  scene.add(sunDisc);
  const terrain = makeTerrain();
  const terrainHeight = terrain.height;
  scene.add(terrain.mesh);
  const bases = {
    blue: new THREE.Vector3(0, terrainHeight(0, 230), 230),
    red: new THREE.Vector3(0, terrainHeight(0, -230), -230),
  };
  const colliders = [];
  const beacons = [];
  buildBase(scene, bases.blue, 'blue', colliders, beacons);
  buildBase(scene, bases.red, 'red', colliders, beacons);
  buildScenery(scene, terrainHeight);
  const weapon = buildWeapon(camera);
  bakeStaticLighting(scene, terrain.mesh);
  for (const group of scene.children) if (group.isGroup) batchStatic(group, beacons);
  batchStatic(weapon.group, [weapon.rotor, weapon.disc]);
  batchStatic(scene, [terrain.mesh, sky, sunDisc]);
  const player = {
    position: new THREE.Vector3(), velocity: new THREE.Vector3(), health: 100, energy: 100,
    yaw: 0, pitch: 0, grounded: true, speed: 0, speedMps: 0, horizontalSpeed: 0,
    mode: 'WALK', movementMode: 'WALK', skiing: false, jetting: false, altitude: 0,
  };
  let elapsed = 0;
  let lastJump = false;
  let rechargeDelay = 0;
  let weaponKick = 0;
  let lastFire = false;
  const slope = new THREE.Vector2();
  const wish = new THREE.Vector2();
  function getSlope(x, z) {
    const sample = 1.2;
    slope.set((terrainHeight(x + sample, z) - terrainHeight(x - sample, z)) / (sample * 2),
      (terrainHeight(x, z + sample) - terrainHeight(x, z - sample)) / (sample * 2));
    return slope;
  }
  function syncCamera() {
    camera.position.copy(player.position);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  }
  function resetPlayer(position) {
    // Gameplay redeploys at the blue-base ground vector. Use the forward apron
    // for that spawn as well as the default, ahead of the initial squad line.
    if (!position || bases.blue.distanceToSquared(position) < 0.01) {
      player.position.set(12, terrainHeight(12, 210) + EYE_HEIGHT, 210);
    } else player.position.copy(position);
    player.position.x = clamp(player.position.x, -BOUNDS, BOUNDS);
    player.position.z = clamp(player.position.z, -BOUNDS, BOUNDS);
    player.position.y = Math.max(player.position.y, terrainHeight(player.position.x, player.position.z) + EYE_HEIGHT);
    player.velocity.set(0, 0, 0);
    player.yaw = 0;
    player.pitch = -0.075;
    player.health = 100;
    player.energy = 100;
    player.grounded = player.position.y <= terrainHeight(player.position.x, player.position.z) + EYE_HEIGHT + 0.1;
    player.speed = player.speedMps = player.horizontalSpeed = 0;
    player.mode = player.movementMode = player.grounded ? 'WALK' : 'AIR';
    player.skiing = player.jetting = false;
    player.altitude = Math.max(0, player.position.y - terrainHeight(player.position.x, player.position.z) - EYE_HEIGHT);
    rechargeDelay = 0;
    lastJump = lastFire = false;
    syncCamera();
  }
  function resolveStructures() {
    const p = player.position;
    const v = player.velocity;
    for (const c of colliders) {
      if (p.y - EYE_HEIGHT > c.maxY || p.y < c.minY) continue;
      let nx = 0;
      let nz = 0;
      let push = 0;
      if (c.radius) {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const length = Math.hypot(dx, dz);
        if (length >= c.radius + 0.8) continue;
        nx = length > 0.001 ? dx / length : 1;
        nz = length > 0.001 ? dz / length : 0;
        push = c.radius + 0.8 - length;
      } else {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const px = c.halfX + 0.8 - Math.abs(dx);
        const pz = c.halfZ + 0.8 - Math.abs(dz);
        if (px <= 0 || pz <= 0) continue;
        if (px < pz) { nx = dx < 0 ? -1 : 1; push = px; }
        else { nz = dz < 0 ? -1 : 1; push = pz; }
      }
      p.x += nx * push;
      p.z += nz * push;
      const inward = v.x * nx + v.z * nz;
      if (inward < 0) { v.x -= inward * nx; v.z -= inward * nz; }
    }
  }
  function update(dt, input = {}) {
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.15);
    const lookX = Number.isFinite(input.lookX) ? input.lookX : 0;
    const lookY = Number.isFinite(input.lookY) ? input.lookY : 0;
    player.yaw -= lookX * 0.0021;
    player.pitch = clamp(player.pitch - lookY * 0.0021, -1.42, 1.42);
    const forward = clamp(Number(input.forward) || 0, -1, 1);
    const right = clamp(Number(input.right) || 0, -1, 1);
    wish.set(-Math.sin(player.yaw) * forward + Math.cos(player.yaw) * right,
      -Math.cos(player.yaw) * forward - Math.sin(player.yaw) * right);
    const inputMagnitude = Math.min(1, wish.length());
    if (inputMagnitude > 0) wish.normalize();
    const jumpPressed = !!input.jump && !lastJump;
    lastJump = !!input.jump;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    const p = player.position;
    const v = player.velocity;
    let anyJet = false;
    for (let step = 0; step < steps; step++) {
      const ground = terrainHeight(p.x, p.z) + EYE_HEIGHT;
      if (p.y > ground + 0.5) player.grounded = false;
      if (p.y < ground) { p.y = ground; player.grounded = true; if (v.y < 0) v.y = 0; }
      if (jumpPressed && step === 0 && player.grounded) {
        v.y = Math.max(v.y, 0) + 15;
        p.y += 0.08;
        player.grounded = false;
      }
      const jet = !!input.jet && player.energy > 0.01 && h > 0;
      if (jet) {
        const fraction = Math.min(1, player.energy / (30 * h));
        player.energy = Math.max(0, player.energy - 30 * h);
        v.y += 68 * fraction * h;
        // A gentle vertical limiter keeps thrust controllable without killing lateral speed.
        if (v.y > 49) v.y = THREE.MathUtils.lerp(v.y, 49, Math.min(1, h * 4));
        player.grounded = false;
        rechargeDelay = 0.65;
        anyJet = true;
      } else {
        rechargeDelay = Math.max(0, rechargeDelay - h);
        if (rechargeDelay === 0) player.energy = Math.min(100, player.energy + (player.grounded ? 25 : 15) * h);
      }
      const planarSpeed = Math.hypot(v.x, v.z);
      if (player.grounded) {
        getSlope(p.x, p.z);
        const skiing = !!input.ski;
        const friction = skiing ? 0.028 : (planarSpeed > 28 ? 0.65 : 4.0);
        const decay = Math.exp(-friction * h);
        v.x *= decay;
        v.z *= decay;
        if (skiing) {
          // Gravity projected onto the actual terrain tangent, not a speed bonus.
          const gravityAlong = GRAVITY / (1 + slope.lengthSq());
          v.x -= slope.x * gravityAlong * h;
          v.z -= slope.y * gravityAlong * h;
          if (inputMagnitude > 0) {
            const along = v.x * wish.x + v.z * wish.y;
            const acceleration = along < 30 ? 23 : 6;
            v.x += wish.x * acceleration * inputMagnitude * h;
            v.z += wish.y * acceleration * inputMagnitude * h;
            // Modest carve, while conserving the existing fast run.
            if (planarSpeed > 25 && along > 0) {
              const carvingSpeed = Math.hypot(v.x, v.z);
              const carve = Math.min(1, h * 0.55 * inputMagnitude);
              const vx = THREE.MathUtils.lerp(v.x, wish.x * carvingSpeed, carve);
              const vz = THREE.MathUtils.lerp(v.z, wish.y * carvingSpeed, carve);
              const after = Math.hypot(vx, vz);
              if (after > 0) { v.x = vx * carvingSpeed / after; v.z = vz * carvingSpeed / after; }
            }
          }
        } else if (inputMagnitude > 0) {
          const along = v.x * wish.x + v.z * wish.y;
          const add = Math.min(Math.max(0, 23 * inputMagnitude - along), 105 * h);
          v.x += wish.x * add;
          v.z += wish.y * add;
        }
        v.y = slope.x * v.x + slope.y * v.z;
      } else {
        v.y -= GRAVITY * h;
        const airAcceleration = 10 * inputMagnitude;
        v.x += wish.x * airAcceleration * h;
        v.z += wish.y * airAcceleration * h;
        const drag = Math.exp(-0.012 * h);
        v.x *= drag;
        v.z *= drag;
      }
      const speed = Math.hypot(v.x, v.z);
      if (speed > 165) { v.x *= 165 / speed; v.z *= 165 / speed; }
      const predictedY = p.y + v.y * h;
      p.x += v.x * h;
      p.z += v.z * h;
      p.y = predictedY;
      if (Math.abs(p.x) > BOUNDS) { p.x = clamp(p.x, -BOUNDS, BOUNDS); v.x *= -0.15; }
      if (Math.abs(p.z) > BOUNDS) { p.z = clamp(p.z, -BOUNDS, BOUNDS); v.z *= -0.15; }
      resolveStructures();
      const nextGround = terrainHeight(p.x, p.z) + EYE_HEIGHT;
      if (player.grounded) {
        // Fast skiers can naturally launch off convex ridges; ordinary walking hugs ground.
        if (input.ski && speed > 25 && predictedY - nextGround > 0.065) player.grounded = false;
        else {
          p.y = nextGround;
          getSlope(p.x, p.z);
          v.y = slope.x * v.x + slope.y * v.z;
        }
      }
      if (!player.grounded && p.y <= nextGround) {
        p.y = nextGround;
        player.grounded = true;
        getSlope(p.x, p.z);
        // Landing transfers flight velocity into the surface tangent, preserving a ski run.
        if (input.ski) {
          const dot = (v.y - slope.x * v.x - slope.y * v.z) / (1 + slope.lengthSq());
          v.x += slope.x * dot;
          v.z += slope.y * dot;
        }
        v.y = slope.x * v.x + slope.y * v.z;
      }
    }
    elapsed += dt;
    player.jetting = anyJet;
    player.skiing = !!input.ski && player.grounded;
    player.mode = player.movementMode = anyJet ? 'JET' : !player.grounded ? 'AIR' : input.ski ? 'SKI' : 'WALK';
    player.speedMps = v.length();
    player.speed = player.speedMps * 3.6;
    player.horizontalSpeed = Math.hypot(v.x, v.z);
    player.altitude = Math.max(0, p.y - terrainHeight(p.x, p.z) - EYE_HEIGHT);
    if (input.fire && !lastFire) weaponKick = 1;
    lastFire = !!input.fire;
    weaponKick *= Math.exp(-dt * 13);
    const moving = Math.min(1, player.horizontalSpeed / 22);
    const bob = player.grounded ? Math.sin(elapsed * (input.ski ? 7 : 11)) * 0.008 * moving : 0;
    weapon.group.position.set(0.47 + Math.sin(elapsed * 5) * 0.003 * moving,
      -0.37 + bob - (anyJet ? 0.007 * Math.sin(elapsed * 31) : 0), -0.74 + weaponKick * 0.08);
    weapon.group.rotation.set(0.025 + weaponKick * 0.07, -0.07 - clamp(lookX, -40, 40) * 0.0004, -0.035);
    weapon.rotor.rotation.y += dt * (anyJet ? 6 : 2);
    for (let i = 0; i < beacons.length; i++) beacons[i].rotation.y += dt * (i % 2 ? -0.4 : 0.4);
    syncCamera();
  }
  function resize() {
    const width = Math.max(1, canvas.clientWidth || globalThis.innerWidth || 1280);
    const height = Math.max(1, canvas.clientHeight || globalThis.innerHeight || 720);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    // Keep the weapon in the lower-right on narrow as well as wide viewports.
    weapon.group.scale.setScalar(0.85 * Math.min(1, camera.aspect / 1.2));
  }
  let lastRenderTime = 0;
  let frameAverage = 16;
  let qualityFrames = 0;
  function render() {
    const now = globalThis.performance?.now() || 0;
    if (lastRenderTime && now - lastRenderTime < 1000) {
      frameAverage = THREE.MathUtils.lerp(frameAverage, now - lastRenderTime, 0.07);
      if (++qualityFrames >= 60) {
        const next = frameAverage > 55 ? Math.max(0.4, renderScale - 0.1)
          : frameAverage < 38 ? Math.min(maxRenderScale, renderScale + 0.05) : renderScale;
        if (next !== renderScale) {
          renderScale = next;
          renderer.setPixelRatio(renderScale);
        }
        qualityFrames = 0;
      }
    }
    lastRenderTime = now;
    renderer.render(scene, camera);
  }
  resetPlayer();
  resize();
  return {
    scene, camera, renderer, player, terrainHeight, update, render, resize, resetPlayer, bases,
    bounds: BOUNDS, eyeHeight: EYE_HEIGHT, geometry: { terrain: terrain.mesh, colliders },
    renderQuality: { softwareRenderer, gpuName, get scale() { return renderScale; } },
  };
}
