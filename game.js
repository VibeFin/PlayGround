import * as THREE from 'three';

/* ============ helpers ============ */
const $ = (s) => document.querySelector(s);
const toastEl = $('#toast');
let toastT = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), 1800);
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============ blocks ============ */
const B = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, WOOD: 4, LEAVES: 5, SAND: 6, PLANKS: 7, GLASS: 8 };
const BLOCKS = {
  [B.GRASS]: { name: 'Grass' },
  [B.DIRT]: { name: 'Dirt' },
  [B.STONE]: { name: 'Stone' },
  [B.WOOD]: { name: 'Wood' },
  [B.LEAVES]: { name: 'Leaves' },
  [B.SAND]: { name: 'Sand' },
  [B.PLANKS]: { name: 'Planks' },
  [B.GLASS]: { name: 'Glass' },
};
const HOTBAR = [B.GRASS, B.DIRT, B.STONE, B.WOOD, B.LEAVES, B.SAND, B.PLANKS, B.GLASS];
let selected = B.GRASS;

/* ============ procedural pixel textures ============ */
function pixelTexture(painter) {
  const S = 16;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  painter(g, S);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, url: c.toDataURL() };
}
function speckle(g, S, rnd, colors, n = 60) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(rnd() * colors.length) | 0];
    g.fillRect((rnd() * S) | 0, (rnd() * S) | 0, 1, 1);
  }
}
const R = mulberry32(987654);
function flat(g, S, base) { g.fillStyle = base; g.fillRect(0, 0, S, S); }

const T = {};
T.grassTop = pixelTexture((g, S) => {
  flat(g, S, '#6abe30'); speckle(g, S, R, ['#5aa82a', '#79d244', '#4c9623', '#8ae05a'], 90);
});
T.grassSide = pixelTexture((g, S) => {
  flat(g, S, '#79553a'); speckle(g, S, R, ['#6b4a32', '#86644a', '#5d3f2a'], 90);
  g.fillStyle = '#6abe30'; g.fillRect(0, 0, S, 4);
  g.fillStyle = '#5aa82a';
  for (let x = 0; x < S; x += 2) g.fillRect(x, 4, 1, 1 + ((x * 7) % 3));
});
T.dirt = pixelTexture((g, S) => {
  flat(g, S, '#79553a'); speckle(g, S, R, ['#6b4a32', '#86644a', '#5d3f2a', '#93705a'], 100);
});
T.stone = pixelTexture((g, S) => {
  flat(g, S, '#7d7d7d'); speckle(g, S, R, ['#6f6f6f', '#8c8c8c', '#5f5f5f', '#9a9a9a'], 110);
});
T.wood = pixelTexture((g, S) => {
  flat(g, S, '#5b4128'); speckle(g, S, R, ['#4c3520', '#6b4e30'], 40);
  g.fillStyle = '#3f2c1a';
  for (let x = 2; x < S; x += 4) g.fillRect(x, 0, 1, S);
});
T.leaves = pixelTexture((g, S) => {
  flat(g, S, '#2f8f2f'); speckle(g, S, R, ['#267326', '#3aa53a', '#1f5c1f', '#4cc04c'], 130);
});
T.sand = pixelTexture((g, S) => {
  flat(g, S, '#d9c48a'); speckle(g, S, R, ['#cbb37e', '#e6d49a', '#bfa76f'], 90);
});
T.planks = pixelTexture((g, S) => {
  flat(g, S, '#a9804e'); speckle(g, S, R, ['#96713f', '#bb925e'], 50);
  g.fillStyle = '#7a5a33';
  for (let y = 3; y < S; y += 4) g.fillRect(0, y, S, 1);
  g.fillRect(7, 0, 1, S);
});
T.glass = pixelTexture((g, S) => {
  g.fillStyle = '#cfe8f7'; g.fillRect(0, 0, S, S);
  speckle(g, S, R, ['#c2dfee', '#dceff9'], 30);
  g.fillStyle = '#ffffff'; g.fillRect(2, 2, 4, 1); g.fillRect(2, 2, 1, 5);
  g.fillStyle = '#7fb2d9';
  g.fillRect(0, 0, S, 1); g.fillRect(0, S - 1, S, 1); g.fillRect(0, 0, 1, S); g.fillRect(S - 1, 0, 1, S);
});

/* ============ world data ============ */
const WORLD_R = 32;          // world is 64 x 64
const WORLD_H = 28;
const WATER_Y = 7;
let seed = 1337;
const voxels = new Map();
const key = (x, y, z) => x + ',' + y + ',' + z;

function hash2(ix, iz, s) {
  let h = ix * 374761393 + iz * 668265263 + s * 1442695041;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h >>> 0) % 100000) / 100000;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function valueNoise(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz, s), b = hash2(ix + 1, iz, s);
  const c = hash2(ix, iz + 1, s), d = hash2(ix + 1, iz + 1, s);
  const ux = smooth(fx), uz = smooth(fz);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm(x, z, s) {
  return valueNoise(x * 0.045, z * 0.045, s) * 0.55
    + valueNoise(x * 0.11 + 31, z * 0.11 + 17, s) * 0.27
    + valueNoise(x * 0.26 + 57, z * 0.26 + 43, s) * 0.18;
}
function groundHeight(x, z) {
  const n = fbm(x, z, seed);
  return Math.floor(5 + n * 11);
}

function clearSpawnArea() {
  // keep spawn (0,0) open: remove trees within radius 4, keep terrain
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
    const h = groundHeight(dx, dz);
    for (let y = h + 1; y < WORLD_H; y++) voxels.delete(key(dx, y, dz));
  }
}

function generateWorld(newSeed) {
  seed = newSeed | 0;
  voxels.clear();
  const rnd = mulberry32(seed);
  for (let x = -WORLD_R; x < WORLD_R; x++) {
    for (let z = -WORLD_R; z < WORLD_R; z++) {
      const h = groundHeight(x, z);
      for (let y = 0; y <= h; y++) {
        let id;
        if (y === h) id = (h <= WATER_Y + 1) ? B.SAND : B.GRASS;
        else if (y >= h - 2) id = (h <= WATER_Y + 1) ? B.SAND : B.DIRT;
        else id = B.STONE;
        voxels.set(key(x, y, z), id);
      }
    }
  }
  // trees
  for (let x = -WORLD_R + 3; x < WORLD_R - 3; x++) {
    for (let z = -WORLD_R + 3; z < WORLD_R - 3; z++) {
      const h = groundHeight(x, z);
      if (h <= WATER_Y + 1) continue;
      if (voxels.get(key(x, h, z)) !== B.GRASS) continue;
      if (rnd() < 0.018) {
        const th = 4 + ((rnd() * 2) | 0);
        for (let i = 1; i <= th; i++) voxels.set(key(x, h + i, z), B.WOOD);
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = th - 2; dy <= th + 1; dy++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          if (dy === th + 1 && (Math.abs(dx) + Math.abs(dz) > 1)) continue;
          const p = key(x + dx, h + dy, z + dz);
          if (!voxels.get(p)) voxels.set(p, B.LEAVES);
        }
      }
    }
  }
  clearSpawnArea();
}

function getBlock(x, y, z) {
  if (y < 0) return B.STONE;
  if (y >= WORLD_H) return B.AIR;
  if (x < -WORLD_R || x >= WORLD_R || z < -WORLD_R || z >= WORLD_R) return B.AIR;
  return voxels.get(key(x, y, z)) || B.AIR;
}
function setBlock(x, y, z, id) {
  if (y < 0 || y >= WORLD_H) return;
  if (x < -WORLD_R || x >= WORLD_R || z < -WORLD_R || z >= WORLD_R) return;
  if (id === B.AIR) voxels.delete(key(x, y, z));
  else voxels.set(key(x, y, z), id);
  scheduleRebuild();
  saveSoon();
}
function isOpaque(id) {
  return id !== B.AIR && id !== B.GLASS;
}

/* ============ three.js scene ============ */
const canvas = $('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 30, 110);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 400);
camera.rotation.order = 'YXZ';

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6b5b3e, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(40, 70, 20);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

function lam(map, opts = {}) {
  return new THREE.MeshLambertMaterial({ map: map.tex, ...opts });
}
const MATS = {
  [B.GRASS]: [lam(T.grassSide), lam(T.grassSide), lam(T.grassTop), lam(T.dirt), lam(T.grassSide), lam(T.grassSide)],
  [B.DIRT]: lam(T.dirt),
  [B.STONE]: lam(T.stone),
  [B.WOOD]: lam(T.wood),
  [B.LEAVES]: lam(T.leaves),
  [B.SAND]: lam(T.sand),
  [B.PLANKS]: lam(T.planks),
  [B.GLASS]: lam(T.glass, { transparent: true, opacity: 0.55 }),
};

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const meshes = {};
for (const id of HOTBAR) {
  const mat = MATS[id];
  const m = new THREE.InstancedMesh(boxGeo, mat, 40000);
  m.count = 0;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false;
  scene.add(m);
  meshes[id] = m;
}

// water plane
const waterMat = new THREE.MeshLambertMaterial({ color: 0x3a7bd5, transparent: true, opacity: 0.65 });
const water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_R * 2, WORLD_R * 2), waterMat);
water.rotation.x = -Math.PI / 2;
water.position.set(0, WATER_Y + 0.6, 0);
scene.add(water);

// clouds
const cloudGeo = new THREE.BoxGeometry(4, 1, 3);
const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, 24);
clouds.frustumCulled = false;
scene.add(clouds);
const cloudData = [];
{
  const crnd = mulberry32(42);
  for (let i = 0; i < 24; i++) cloudData.push({ x: (crnd() - 0.5) * 90, y: 22 + crnd() * 5, z: (crnd() - 0.5) * 90, s: 0.8 + crnd() * 1.6 });
}

// highlight
const hl = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7 })
);
hl.visible = false;
scene.add(hl);

const dummy = new THREE.Object3D();
let rebuildQueued = false;
function scheduleRebuild() {
  if (rebuildQueued) return;
  rebuildQueued = true;
  setTimeout(() => { rebuildQueued = false; rebuildMeshes(); }, 30);
}

function rebuildMeshes() {
  const lists = {};
  for (const id of HOTBAR) lists[id] = [];
  const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for (const [k, id] of voxels) {
    const [x, y, z] = k.split(',').map(Number);
    let exposed = false;
    for (const [dx, dy, dz] of DIRS) {
      const n = getBlock(x + dx, y + dy, z + dz);
      if (!isOpaque(n)) { if (!(id === B.GLASS && n === B.GLASS)) { exposed = true; break; } }
    }
    if (exposed) lists[id].push([x, y, z]);
  }
  for (const id of HOTBAR) {
    const arr = lists[id];
    const mesh = meshes[id];
    const n = Math.min(arr.length, 40000);
    for (let i = 0; i < n; i++) {
      dummy.position.set(arr[i][0] + 0.5, arr[i][1] + 0.5, arr[i][2] + 0.5);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }
  updateStats();
}

/* ============ player + physics ============ */
const player = {
  pos: new THREE.Vector3(0.5, 12, 0.5), // feet
  vel: new THREE.Vector3(),
  yaw: Math.PI * 0.25, pitch: -0.1,
  onGround: false, fly: false,
};
const EYE = 1.62, PW = 0.3, PH = 1.8;

function collides(px, py, pz) {
  const minX = Math.floor(px - PW), maxX = Math.floor(px + PW);
  const minY = Math.floor(py), maxY = Math.floor(py + PH - 0.01);
  const minZ = Math.floor(pz - PW), maxZ = Math.floor(pz + PW);
  for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) for (let z = minZ; z <= maxZ; z++) {
    if (getBlock(x, y, z) !== B.AIR) return true;
  }
  return false;
}
function moveAxis(axis, amount) {
  const p = player.pos;
  if (axis === 0) p.x += amount;
  if (axis === 1) p.y += amount;
  if (axis === 2) p.z += amount;
  if (collides(p.x, p.y, p.z)) {
    if (axis === 0) p.x -= amount;
    if (axis === 1) { p.y -= amount; if (amount < 0) { player.onGround = true; player.vel.y = 0; } else player.vel.y = 0; }
    if (axis === 2) p.z -= amount;
    return true;
  }
  return false;
}

const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyF') toggleFly();
  const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7 }[e.code];
  if (n !== undefined) selectBlock(HOTBAR[n]);
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// joystick state
const joy = { x: 0, y: 0, id: null };
let jumpHeld = false, downHeld = false;

function stepPlayer(dt) {
  dt = Math.min(dt, 0.05);
  const speed = player.fly ? 10 : 5.2;
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz -= 1;
  if (keys.KeyS || keys.ArrowDown) iz += 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  ix += joy.x; iz += joy.y;
  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  const wx = (ix * cos - iz * sin) * speed * dt;
  const wz = (ix * -sin - iz * cos) * -1 * speed * dt;
  // NOTE: forward mapping tuned for yaw convention below
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
  const mx = (rx * ix + fx * -iz) * speed * dt;
  const mz = (rz * ix + fz * -iz) * speed * dt;

  if (player.fly) {
    moveAxis(0, mx); moveAxis(2, mz);
    let vy = 0;
    if (keys.Space || jumpHeld) vy += 9 * dt;
    if (keys.ShiftLeft || keys.ShiftRight || downHeld) vy -= 9 * dt;
    // gentle vertical from look? no
    player.pos.y += vy;
    if (collides(player.pos.x, player.pos.y, player.pos.z)) player.pos.y -= vy;
    player.pos.y = Math.max(1, Math.min(WORLD_H + 6, player.pos.y));
    player.vel.set(0, 0, 0);
    player.onGround = false;
  } else {
    moveAxis(0, mx); moveAxis(2, mz);
    player.vel.y -= 26 * dt;
    if (player.vel.y < -18) player.vel.y = -18;
    if ((keys.Space || jumpHeld) && player.onGround) {
      player.vel.y = 8.6; player.onGround = false;
      jumpHeld = false; // require re-press on desktop feel; on mobile hold handled by repeat
      if (isTouch) jumpHeld = true;
    }
    player.onGround = false;
    moveAxis(1, player.vel.y * dt);
    if (player.pos.y < 1) { player.pos.y = 1; player.vel.y = 0; player.onGround = true; }
  }
  // void / fall out of world -> respawn
  if (player.pos.y < -10) respawn();

  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  void wx; void wz;
}

function respawn() {
  const h = groundHeight(0, 0);
  player.pos.set(0.5, h + 2, 0.5);
  player.vel.set(0, 0, 0);
}

/* ============ voxel raycast (DDA) ============ */
function raycastVoxel(maxDist = 7) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  let x = Math.floor(camera.position.x), y = Math.floor(camera.position.y), z = Math.floor(camera.position.z);
  const stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
  const tDeltaX = Math.abs(1 / (dir.x || 1e-8)), tDeltaY = Math.abs(1 / (dir.y || 1e-8)), tDeltaZ = Math.abs(1 / (dir.z || 1e-8));
  let tMaxX = ((stepX > 0 ? (x + 1 - camera.position.x) : (camera.position.x - x)) * tDeltaX);
  let tMaxY = ((stepY > 0 ? (y + 1 - camera.position.y) : (camera.position.y - y)) * tDeltaY);
  let tMaxZ = ((stepZ > 0 ? (z + 1 - camera.position.z) : (camera.position.z - z)) * tDeltaZ);
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let i = 0; i < 128; i++) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0; }
    else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0; }
    else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ; }
    if (t > maxDist) return null;
    const id = getBlock(x, y, z);
    if (id !== B.AIR) return { x, y, z, nx, ny, nz, id };
  }
  return null;
}

let target = null;
function updateTarget() {
  target = raycastVoxel(7);
  if (target) {
    hl.visible = true;
    hl.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
    $('#target-label').textContent = BLOCKS[target.id].name;
  } else {
    hl.visible = false;
    $('#target-label').textContent = '';
  }
}
function doBreak() {
  updateTarget();
  if (!target) { toast('Aim at a block'); return; }
  if (target.y === 0) { toast('Bedrock protected'); return; }
  setBlock(target.x, target.y, target.z, B.AIR);
}
function doPlace() {
  updateTarget();
  if (!target) { toast('Aim at a block'); return; }
  const px = target.x + target.nx, py = target.y + target.ny, pz = target.z + target.nz;
  if (getBlock(px, py, pz) !== B.AIR) return;
  // don't place inside player
  const p = player.pos;
  const overlap = (px + 0.5 > p.x - PW && px + 0.5 < p.x + PW + 1 - 1 + PW * 2 * 0 + PW * 0 + (p.x + PW) - (p.x - PW) * 0) ? false : false;
  // simple AABB check
  const boxMin = { x: px, y: py, z: pz }, boxMax = { x: px + 1, y: py + 1, z: pz + 1 };
  const pMin = { x: p.x - PW, y: p.y, z: p.z - PW }, pMax = { x: p.x + PW, y: p.y + PH, z: p.z + PW };
  const inter = boxMin.x < pMax.x && boxMax.x > pMin.x && boxMin.y < pMax.y && boxMax.y > pMin.y && boxMin.z < pMax.z && boxMax.z > pMin.z;
  void overlap;
  if (inter) { toast('Too close'); return; }
  setBlock(px, py, pz, selected);
}

/* ============ touch controls ============ */
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const stickBase = $('#stick-base'), knob = $('#stick-knob');
let joyCenter = null;
function setKnob(dx, dy) {
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}
stickBase.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.changedTouches[0];
  joy.id = t.identifier;
  const r = stickBase.getBoundingClientRect();
  joyCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, { passive: false });
window.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) {
      const dx = t.clientX - joyCenter.x, dy = t.clientY - joyCenter.y;
      const max = 46;
      const d = Math.hypot(dx, dy) || 1;
      const cl = Math.min(d, max);
      const nx = dx / d * cl, ny = dy / d * cl;
      setKnob(nx, ny);
      joy.x = nx / max; joy.y = ny / max;
    }
  }
}, { passive: true });
window.addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) { joy.id = null; joy.x = 0; joy.y = 0; setKnob(0, 0); }
  }
});

// look: drag on right half (canvas area, not UI)
let lookId = null, lx = 0, ly = 0;
canvas.addEventListener('touchstart', (e) => {
  for (const t of e.changedTouches) {
    if (t.clientX > window.innerWidth * 0.35 && lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
  }
}, { passive: true });
window.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === lookId) {
      player.yaw -= (t.clientX - lx) * 0.0048;
      player.pitch -= (t.clientY - ly) * 0.0048;
      player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch));
      lx = t.clientX; ly = t.clientY;
    }
  }
}, { passive: true });
window.addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
});

// mouse look (pointer lock on desktop)
let locked = false;
canvas.addEventListener('click', () => {
  if (!isTouch && started && !locked) canvas.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; });
document.addEventListener('mousemove', (e) => {
  if (locked) {
    player.yaw -= e.movementX * 0.0025;
    player.pitch -= e.movementY * 0.0025;
    player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch));
  }
});
canvas.addEventListener('mousedown', (e) => {
  if (!started || isTouch) return;
  if (!locked) return;
  if (e.button === 0) doBreak();
  if (e.button === 2) doPlace();
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

// buttons (works for touch + mouse, with hold-to-jump/fly-up)
function holdButton(el, down, up) {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); down(); });
  el.addEventListener('pointerup', (e) => { e.preventDefault(); up?.(); });
  el.addEventListener('pointercancel', () => up?.());
  el.addEventListener('pointerleave', () => up?.());
}
holdButton($('#btn-jump'), () => { jumpHeld = true; }, () => { jumpHeld = false; });
holdButton($('#btn-break'), () => doBreak());
holdButton($('#btn-place'), () => doPlace());

// fly "down" button (mobile only, appears in fly mode)
const downBtn = document.createElement('button');
downBtn.className = 'abtn jump';
downBtn.innerHTML = '⬇<small>DOWN</small>';
downBtn.style.background = 'rgba(120,60,180,.92)';
downBtn.style.display = 'none';
$('#actions').prepend(downBtn);
holdButton(downBtn, () => { downHeld = true; }, () => { downHeld = false; });

function toggleFly() {
  player.fly = !player.fly;
  player.vel.set(0, 0, 0);
  $('#btn-fly').textContent = player.fly ? '🕊️ Fly: On' : '🕊️ Fly: Off';
  $('#btn-fly').classList.toggle('on', player.fly);
  $('#btn-jump').querySelector('small').textContent = player.fly ? 'UP' : 'JUMP';
  downBtn.style.display = player.fly ? 'flex' : 'none';
  toast(player.fly ? 'Fly mode ON' : 'Fly mode OFF');
}
$('#btn-fly').addEventListener('click', toggleFly);

/* day / night */
let day = true;
$('#btn-day').addEventListener('click', () => {
  day = !day;
  $('#btn-day').textContent = day ? '☀️ Day' : '🌙 Night';
  if (day) {
    scene.background.set(0x87ceeb); scene.fog.color.set(0x87ceeb);
    sun.intensity = 1.6; hemi.intensity = 0.95;
  } else {
    scene.background.set(0x0a1030); scene.fog.color.set(0x0a1030);
    sun.intensity = 0.35; hemi.intensity = 0.35;
  }
});

/* ============ hotbar UI ============ */
const iconURL = { 1: T.grassSide.url, 2: T.dirt.url, 3: T.stone.url, 4: T.wood.url, 5: T.leaves.url, 6: T.sand.url, 7: T.planks.url, 8: T.glass.url };
function buildHotbar() {
  const bar = $('#hotbar');
  bar.innerHTML = '';
  HOTBAR.forEach((id, i) => {
    const b = document.createElement('button');
    b.className = 'slot' + (id === selected ? ' sel' : '');
    b.innerHTML = `<img alt="${BLOCKS[id].name}"/><span>${i + 1}</span>`;
    b.querySelector('img').src = iconURL[id];
    b.title = BLOCKS[id].name;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); selectBlock(id); });
    bar.appendChild(b);
  });
}
function selectBlock(id) {
  selected = id;
  document.querySelectorAll('.slot').forEach((el, i) => el.classList.toggle('sel', HOTBAR[i] === id));
}
buildHotbar();

/* ============ save / load ============ */
const SAVE_KEY = 'mc3d-pocket-v1';
let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 1500);
}
function saveNow() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      seed, sel: selected,
      p: [player.pos.x, player.pos.y, player.pos.z],
      v: [...voxels],
    }));
  } catch { /* ignore */ }
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || !Array.isArray(s.v)) return false;
    seed = s.seed | 0;
    voxels.clear();
    for (const [k, v] of s.v) voxels.set(k, v);
    if (Array.isArray(s.p)) player.pos.set(s.p[0], s.p[1], s.p[2]);
    if (s.sel) selected = s.sel;
    $('#seed-input').value = String(seed);
    return true;
  } catch { return false; }
}
window.addEventListener('beforeunload', saveNow);
setInterval(saveNow, 15000);

/* ============ overlay / start ============ */
let started = false;
$('#btn-dice').addEventListener('click', () => {
  $('#seed-input').value = String((Math.random() * 90000 + 1000) | 0);
});
$('#btn-help').addEventListener('click', () => $('#help').classList.remove('hidden'));
$('#btn-close-help').addEventListener('click', () => $('#help').classList.add('hidden'));
$('#btn-regen').addEventListener('click', () => {
  const s = parseInt($('#seed-input').value || '1337', 10) || 1337;
  newWorld(s || ((Math.random() * 90000) | 0));
});
$('#btn-play').addEventListener('click', () => {
  $('#overlay').classList.add('hidden');
  started = true;
  toast(player.fly ? 'Fly mode' : 'WASD / stick to move');
  if (!isTouch) canvas.requestPointerLock?.();
});
function newWorld(s) {
  generateWorld(s);
  $('#seed-input').value = String(s);
  respawn();
  rebuildMeshes();
  buildHotbar();
  saveNow();
  toast('New world #' + s);
}

/* ============ stats ============ */
const statsEl = $('#stats');
let fpsFrames = 0, fpsTime = 0, fps = 0;
function updateStats() { /* called on rebuild */ }
function tickStats(dt) {
  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) { fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0; }
  if ((tickStats.n = (tickStats.n || 0) + 1) % 20 === 0) {
    statsEl.textContent = `${fps} fps · ${player.pos.x.toFixed(0)},${player.pos.y.toFixed(0)},${player.pos.z.toFixed(0)} · ${voxels.size} blocks`;
  }
}

/* ============ boot ============ */
const hadSave = loadSave();
if (!hadSave) generateWorld(parseInt($('#seed-input').value, 10) || 1337);
if (!hadSave) respawn();
selectBlock(selected);
rebuildMeshes();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ============ main loop ============ */
const clock = new THREE.Clock();
const cloudDummy = new THREE.Object3D();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (started) stepPlayer(dt);
  else {
    // idle orbit behind overlay for a lively preview
    const a = t * 0.12;
    camera.position.set(Math.sin(a) * 30, 18, Math.cos(a) * 30);
    camera.lookAt(0, 6, 0);
  }
  updateTarget();
  water.position.y = WATER_Y + 0.6 + Math.sin(t * 1.2) * 0.06;
  for (let i = 0; i < cloudData.length; i++) {
    const c = cloudData[i];
    c.x += dt * 0.7;
    if (c.x > 60) c.x = -60;
    cloudDummy.position.set(c.x, c.y, c.z);
    cloudDummy.scale.setScalar(c.s);
    cloudDummy.updateMatrix();
    clouds.setMatrixAt(i, cloudDummy.matrix);
  }
  clouds.instanceMatrix.needsUpdate = true;
  tickStats(dt);
  renderer.render(scene, camera);
}
animate();
