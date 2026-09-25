/**
 * World track: closed-loop circuit (~680m), 12m wide asphalt.
 * Procedural only (no external assets). Imports `three` only.
 *
 * API for physics / HUD / AI agents:
 *   buildTrack(scene) -> { group, curve, length, checkpoints, startLine, roadHalf }
 *   getSpawnPoints(count = 8) -> [{ position: Vector3, rotationY: number }]
 *   getCenterline(samples = 200) -> Vector3[]
 *   checkBounds(pos) -> { onRoad: boolean, slowFactor: number, distance: number }
 *   CHECKPOINTS: [{ index, t, position: [x,y,z], radius }]
 *   START_LINE: { t, position: [x,y,z], rotationY }
 *   TRACK_LENGTH, ROAD_WIDTH, ROAD_HALF, CURB_WIDTH, LAPS
 */
import * as THREE from 'three';

export const ROAD_WIDTH = 12;
export const ROAD_HALF = ROAD_WIDTH / 2;
export const CURB_WIDTH = 1.2;
export const WALL_OFFSET = ROAD_HALF + CURB_WIDTH + 0.3; // 7.5m from center
export const WALL_HEIGHT = 1.0;
export const LAPS = 3;
export const ROAD_SEGMENTS = 400;
export const SAMPLE_COUNT = 400;
export const OFF_ROAD_SLOW = 0.55;
export const CURB_SLOW = 0.92;

export const CONTROL_POINTS = [
  [0, 0, -95],
  [55, 0, -85],
  [95, 0, -55],
  [115, 0, -5],
  [95, 0, 40],
  [105, 0, 80],
  [55, 0, 105],
  [0, 0, 90],
  [-45, 0, 105],
  [-95, 0, 80],
  [-115, 0, 25],
  [-100, 0, -35],
  [-60, 0, -75],
].map(([x, y, z]) => new THREE.Vector3(x, y, z));

// ---------------------------------------------------------------------------
// Centerline curve (module-level, no scene needed so physics/HUD can use it)
// ---------------------------------------------------------------------------
function createCurve() {
  return new THREE.CatmullRomCurve3(CONTROL_POINTS, true, 'centripetal', 0.5);
}

const _curve = createCurve();
_curve.arcLengthDivisions = 800;
const TRACK_LENGTH = _curve.getLength();

/** Uniformly sampled centerline points (XZ plane, y=0) for distance checks. */
const _samples = _curve.getSpacedPoints(SAMPLE_COUNT - 1).map(
  (p) => new THREE.Vector3(p.x, 0, p.z),
);
// getSpacedPoints on a closed curve returns SAMPLE_COUNT points; ensure wrap.
if (_samples.length > SAMPLE_COUNT) _samples.length = SAMPLE_COUNT;

export { TRACK_LENGTH };

function frameAt(u) {
  const uu = ((u % 1) + 1) % 1;
  const p = _curve.getPointAt(uu);
  const t = _curve.getTangentAt(uu);
  t.y = 0;
  t.normalize();
  // Left normal in XZ plane.
  const n = new THREE.Vector3(-t.z, 0, t.x).normalize();
  return { p, t, n };
}

export function getCurve() {
  return _curve;
}

/** Sampled centerline (fresh Vector3 array) for minimap / AI / reset logic. */
export function getCenterline(samples = 200) {
  const pts = [];
  for (let i = 0; i < samples; i++) {
    const p = _curve.getPointAt(i / samples);
    pts.push(new THREE.Vector3(p.x, 0, p.z));
  }
  return pts;
}

/** Start/finish line info (t = 0 on the curve). */
export const START_LINE = (() => {
  const { p, t } = frameAt(0);
  const rotationY = Math.atan2(t.x, t.z);
  return { t: 0, position: [p.x, 0, p.z], rotationY };
})();

/** 8 checkpoints incl. start line (index 0), evenly spaced by arc length. */
export const CHECKPOINTS = (() => {
  const list = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const { p } = frameAt(t);
    list.push({ index: i, t, position: [p.x, 0, p.z], radius: 14 });
  }
  return list;
})();

/**
 * Grid spawn slots behind the start line, staggered 2-wide.
 * @param {number} count
 * @returns {{ position: THREE.Vector3, rotationY: number }[]}
 */
export function getSpawnPoints(count = 8) {
  const { p, t } = frameAt(0);
  const n = new THREE.Vector3(-t.z, 0, t.x).normalize();
  const rotationY = Math.atan2(t.x, t.z);
  const slots = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 2);
    const side = i % 2 === 0 ? -1 : 1;
    const back = 4 + row * 6;
    const lateral = side * 2.0;
    const pos = p
      .clone()
      .addScaledVector(t, -back)
      .addScaledVector(n, lateral);
    pos.y = 0.3;
    slots.push({ position: pos, rotationY });
  }
  return slots;
}

/**
 * Road / curb / wall test for physics.
 * @param {THREE.Vector3 | { x: number, z: number }} pos
 * @returns {{ onRoad: boolean, slowFactor: number, distance: number }}
 */
export function checkBounds(pos) {
  const x = pos.x;
  const z = pos.z ?? pos.y ?? 0;
  let minSq = Infinity;
  // Linear scan over 400 samples: ~cheap, no allocations.
  for (let i = 0; i < _samples.length; i++) {
    const s = _samples[i];
    const dx = x - s.x;
    const dz = z - s.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < minSq) minSq = d2;
  }
  const distance = Math.sqrt(minSq);
  if (distance <= ROAD_HALF) return { onRoad: true, slowFactor: 1.0, distance };
  if (distance <= ROAD_HALF + CURB_WIDTH)
    return { onRoad: true, slowFactor: CURB_SLOW, distance };
  return { onRoad: false, slowFactor: OFF_ROAD_SLOW, distance };
}

// ---------------------------------------------------------------------------
// Geometry builders (ribbon mesh helpers)
// ---------------------------------------------------------------------------
function buildRibbon({
  segments,
  halfInner,
  halfOuter,
  y,
  colorFn,
  uvScaleV = 1,
}) {
  const verts = new Float32Array((segments + 1) * 2 * 3);
  const colors = new Float32Array((segments + 1) * 2 * 3);
  const uvs = new Float32Array((segments + 1) * 2 * 2);
  const idx = [];
  const c = new THREE.Color();
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const { p, n } = frameAt(u);
    const ax = p.x + n.x * halfInner;
    const az = p.z + n.z * halfInner;
    const bx = p.x + n.x * halfOuter;
    const bz = p.z + n.z * halfOuter;
    const o = i * 6;
    verts[o] = ax;
    verts[o + 1] = y;
    verts[o + 2] = az;
    verts[o + 3] = bx;
    verts[o + 4] = y;
    verts[o + 5] = bz;
    colorFn(u, i, c);
    colors[o] = c.r;
    colors[o + 1] = c.g;
    colors[o + 2] = c.b;
    colorFn(u, i, c, true);
    colors[o + 3] = c.r;
    colors[o + 4] = c.g;
    colors[o + 5] = c.b;
    const ou = i * 4;
    uvs[ou] = 0;
    uvs[ou + 1] = u * uvScaleV;
    uvs[ou + 2] = 1;
    uvs[ou + 3] = u * uvScaleV;
    if (i < segments) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function asphaltColors(u, _i, c) {
  c.setHex(0x33373d);
  return c;
}

const CURB_RED = new THREE.Color(0xd23b2e);
const CURB_WHITE = new THREE.Color(0xf2f2f2);

function curbStripe(u, i, c) {
  // Alternate every ~4m: length/segments ≈ 1.7m, so flip every 2 segments.
  const block = Math.floor(i / 2) % 2 === 0;
  c.copy(block ? CURB_RED : CURB_WHITE);
  return c;
}

function buildCurbs(y) {
  // Both curbs merged into ONE geometry (two ribbons concatenated).
  const left = buildRibbon({
    segments: ROAD_SEGMENTS,
    halfInner: ROAD_HALF,
    halfOuter: ROAD_HALF + CURB_WIDTH,
    y,
    colorFn: (u, i, c) => curbStripe(u, i, c),
  });
  const right = buildRibbon({
    segments: ROAD_SEGMENTS,
    halfInner: -ROAD_HALF - CURB_WIDTH,
    halfOuter: -ROAD_HALF,
    y,
    colorFn: (u, i, c) => curbStripe(u, i, c),
  });
  return mergeGeometries([left, right]);
}

// Minimal merge helper (avoids importing BufferGeometryUtils).
function mergeGeometries(geoms) {
  let vCount = 0;
  let iCount = 0;
  for (const g of geoms) {
    vCount += g.attributes.position.count;
    iCount += g.index.count;
  }
  const pos = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const index = new (vCount > 65535 ? Uint32Array : Uint16Array)(iCount);
  let vOff = 0;
  let iOff = 0;
  for (const g of geoms) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vOff * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, vOff * 3);
    else col.fill(1, vOff * 3, (vOff + n) * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vOff * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) index[iOff + i] = gi[i] + vOff;
    vOff += n;
    iOff += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeVertexNormals();
  for (const g of geoms) g.dispose();
  return out;
}

function buildWalls() {
  // Vertical wall strips on both edges, merged into one geometry.
  const segs = 200;
  const geoms = [];
  for (const side of [1, -1]) {
    const offsetInner = side * (ROAD_HALF + CURB_WIDTH + 0.3);
    const verts = [];
    const colors = [];
    const idx = [];
    const top = new THREE.Color();
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const { p, n } = frameAt(u);
      const cx = p.x + n.x * offsetInner;
      const cz = p.z + n.z * offsetInner;
      verts.push(cx, 0, cz, cx, WALL_HEIGHT, cz);
      const block = Math.floor(i / 4) % 2 === 0;
      colors.push(0.92, 0.92, 0.94);
      top.copy(block ? CURB_RED : CURB_WHITE);
      colors.push(top.r, top.g, top.b);
      if (i < segs) {
        const a = i * 2;
        if (side > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(verts), 3),
    );
    g.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(colors), 3),
    );
    g.setIndex(idx);
    g.computeVertexNormals();
    geoms.push(g);
  }
  return mergeGeometries(geoms);
}

function checkerTexture(squares = 8) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const ctx = cv.getContext('2d');
  const sw = cv.width / squares;
  const sh = cv.height / 2;
  for (let x = 0; x < squares; x++) {
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#111' : '#f5f5f5';
      ctx.fillRect(x * sw, y * sh, sw, sh);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function bannerTexture() {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#141824';
  ctx.fillRect(0, 0, cv.width, cv.height);
  // Checker borders top/bottom.
  const s = 32;
  for (let x = 0; x < cv.width / s; x++) {
    ctx.fillStyle = x % 2 === 0 ? '#f5f5f5' : '#111';
    ctx.fillRect(x * s, 0, s, 16);
    ctx.fillStyle = x % 2 === 0 ? '#111' : '#f5f5f5';
    ctx.fillRect(x * s, cv.height - 16, s, 16);
  }
  ctx.fillStyle = '#ffcf3f';
  ctx.font = '900 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★ KART GAME ★', cv.width / 2, cv.height / 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------
/**
 * Build the full track group and add it to the scene.
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group, curve: THREE.CatmullRomCurve3, length: number, checkpoints: typeof CHECKPOINTS, startLine: typeof START_LINE, roadHalf: number }}
 */
export function buildTrack(scene) {
  const group = new THREE.Group();
  group.name = 'track';

  // Grass base (single draw call).
  const grassGeo = new THREE.PlaneGeometry(600, 600, 1, 1);
  grassGeo.rotateX(-Math.PI / 2);
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0x5da53f,
    roughness: 1,
    metalness: 0,
  });
  const grass = new THREE.Mesh(grassGeo, grassMat);
  grass.position.y = -0.1;
  grass.receiveShadow = true;
  group.add(grass);

  // Asphalt ribbon (vertex-colored, single draw call).
  const roadGeo = buildRibbon({
    segments: ROAD_SEGMENTS,
    halfInner: -ROAD_HALF,
    halfOuter: ROAD_HALF,
    y: 0.02,
    colorFn: asphaltColors,
    uvScaleV: TRACK_LENGTH / 12,
  });
  const roadMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  group.add(road);

  // Red/white curbs (merged, single draw call).
  const curbGeo = buildCurbs(0.035);
  const curbMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
  });
  const curbs = new THREE.Mesh(curbGeo, curbMat);
  curbs.receiveShadow = true;
  group.add(curbs);

  // Outer walls (merged, single draw call, DoubleSide).
  const wallGeo = buildWalls();
  const wallMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.castShadow = true;
  group.add(walls);

  // Start/finish line: checkered strip across the road.
  const { p, t, n } = frameAt(0);
  const lineGeo = new THREE.PlaneGeometry(ROAD_WIDTH, 2.2);
  lineGeo.rotateX(-Math.PI / 2);
  const lineMat = new THREE.MeshStandardMaterial({
    map: checkerTexture(12),
    roughness: 0.85,
  });
  const line = new THREE.Mesh(lineGeo, lineMat);
  line.position.set(p.x, 0.045, p.z);
  line.rotation.y = Math.atan2(t.x, t.z);
  line.receiveShadow = true;
  group.add(line);

  // Start gantry: 2 pillars + banner.
  const pillarGeo = new THREE.CylinderGeometry(0.45, 0.55, 7.5, 10);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0xdadfe6,
    roughness: 0.5,
    metalness: 0.35,
  });
  const span = ROAD_HALF + CURB_WIDTH + 1.2;
  for (const s of [1, -1]) {
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(p.x + n.x * span * s, 3.75, p.z + n.z * span * s);
    pillar.castShadow = true;
    group.add(pillar);
  }
  const bannerGeo = new THREE.BoxGeometry(span * 2 + 1.5, 1.6, 0.5);
  const bannerMat = new THREE.MeshStandardMaterial({
    map: bannerTexture(),
    roughness: 0.6,
  });
  const banner = new THREE.Mesh(bannerGeo, bannerMat);
  banner.position.set(p.x, 6.8, p.z);
  banner.rotation.y = Math.atan2(t.x, t.z) + Math.PI / 2;
  banner.castShadow = true;
  group.add(banner);

  scene.add(group);
  return {
    group,
    curve: _curve,
    length: TRACK_LENGTH,
    checkpoints: CHECKPOINTS,
    startLine: START_LINE,
    roadHalf: ROAD_HALF,
  };
}
