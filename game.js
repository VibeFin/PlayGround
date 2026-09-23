import * as THREE from 'three';

/* ============================================================
   TURBO KART 3D — original arcade kart racer ( Mario-style,
   no Nintendo assets: all geometry + characters procedural )
   Phone / tablet focused: touch buttons, auto-gas, responsive.
   ============================================================ */

const TOTAL_LAPS = 3;
const KART_COUNT = 6;
const ROAD_HALF = 7;
const SAMPLES = 700;

const $ = id => document.getElementById(id);
const canvas = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) { $('gl-error').classList.remove('hidden'); throw e; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 120, 420);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x3f8f3f, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff5d6, 1.6);
sun.position.set(60, 100, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
sun.shadow.camera.far = 400;
scene.add(sun);

/* ---------------- track definition ---------------- */
const controlPts = [
  [0, -95], [55, -88], [95, -60], [88, -15], [110, 25], [85, 65],
  [40, 55], [10, 85], [-35, 95], [-75, 70], [-65, 30], [-100, 5],
  [-95, -45], [-50, -60], [-30, -80],
].map(([x, z]) => new THREE.Vector3(x, 0, z));
const curve = new THREE.CatmullRomCurve3(controlPts, true, 'catmullrom', 0.6);
const pts = curve.getSpacedPoints(SAMPLES - 1); // SAMPLES points (last == first)
const tangents = [];
for (let i = 0; i < SAMPLES; i++) {
  const t = curve.getTangent(i / SAMPLES);
  t.y = 0; t.normalize();
  tangents.push(t);
}
const sideOf = i => new THREE.Vector3(-tangents[i].z, 0, tangents[i].x); // left normal

/* ---------------- world geometry ---------------- */
function buildWorld() {
  // grass
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshLambertMaterial({ color: 0x4da84d })
  );
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.15; grass.receiveShadow = true;
  scene.add(grass);

  // darker inner + outer grass patches for style
  const patch = new THREE.Mesh(
    new THREE.CircleGeometry(60, 24),
    new THREE.MeshLambertMaterial({ color: 0x3f9c46 })
  );
  patch.rotation.x = -Math.PI / 2; patch.position.set(-10, -0.1, 10);
  scene.add(patch);

  // road ribbon
  const verts = [], uvs = [], idx = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const p = pts[i % SAMPLES], s = sideOf(i % SAMPLES);
    verts.push(p.x - s.x * ROAD_HALF, 0, p.z - s.z * ROAD_HALF,
               p.x + s.x * ROAD_HALF, 0, p.z + s.z * ROAD_HALF);
    uvs.push(0, i / 24, 1, i / 24);
    if (i < SAMPLES) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  roadGeo.setIndex(idx);
  roadGeo.computeVertexNormals();
  const road = new THREE.Mesh(roadGeo, new THREE.MeshLambertMaterial({ color: 0x4a4a52 }));
  road.receiveShadow = true;
  scene.add(road);

  // center dashes
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = 0; i < SAMPLES; i += 14) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.6), dashMat);
    d.rotation.x = -Math.PI / 2;
    d.rotation.z = -Math.atan2(tangents[i].z, tangents[i].x);
    d.position.set(pts[i].x, 0.02, pts[i].z);
    scene.add(d);
  }

  // red/white curbs
  for (let i = 0; i < SAMPLES; i += 4) {
    const s = sideOf(i);
    const col = (i / 4) % 2 < 1 ? 0xee3333 : 0xffffff;
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 3.4),
        new THREE.MeshLambertMaterial({ color: col }));
      curb.position.set(pts[i].x + s.x * side * (ROAD_HALF + 0.6), 0.05, pts[i].z + s.z * side * (ROAD_HALF + 0.6));
      curb.rotation.y = Math.atan2(tangents[i].x, tangents[i].z);
      scene.add(curb);
    }
  }

  // outer walls (low barriers)
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xd86a2c });
  for (let i = 0; i < SAMPLES; i += 6) {
    const s = sideOf(i);
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 9), wallMat);
      w.position.set(pts[i].x + s.x * side * (ROAD_HALF + 3.4), 0.5, pts[i].z + s.z * side * (ROAD_HALF + 3.4));
      w.rotation.y = Math.atan2(tangents[i].x, tangents[i].z);
      w.castShadow = true;
      scene.add(w);
    }
  }

  // start line
  const s0 = sideOf(0);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 2.4),
    new THREE.MeshBasicMaterial({ color: 0xffffff }));
  line.rotation.x = -Math.PI / 2;
  line.rotation.z = -Math.atan2(tangents[0].z, tangents[0].x) + Math.PI / 2;
  line.position.set(pts[0].x, 0.03, pts[0].z);
  scene.add(line);
  // start gantry
  const gantryMat = new THREE.MeshLambertMaterial({ color: 0xee3333 });
  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 9, 8), gantryMat);
    pole.position.set(pts[0].x + s0.x * side * (ROAD_HALF + 1.5), 4.5, pts[0].z + s0.z * side * (ROAD_HALF + 1.5));
    pole.castShadow = true; scene.add(pole);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry((ROAD_HALF + 1.5) * 2, 1.6, 1),
    new THREE.MeshLambertMaterial({ color: 0x222831 }));
  beam.position.set(pts[0].x, 8.6, pts[0].z);
  beam.rotation.y = Math.atan2(tangents[0].x, tangents[0].z) + Math.PI / 2;
  beam.castShadow = true; scene.add(beam);

  // trees
  const trunkM = new THREE.MeshLambertMaterial({ color: 0x7a4a22 });
  const leafM = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  const leafM2 = new THREE.MeshLambertMaterial({ color: 0x388e3c });
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 90; k++) {
    const x = (rnd() - 0.5) * 420, z = (rnd() - 0.5) * 420;
    if (distToTrack(x, z) < 16) continue;
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 3, 6), trunkM);
    trunk.position.y = 1.5; trunk.castShadow = true; t.add(trunk);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(2.4 + rnd() * 1.4, 5 + rnd() * 3, 7), k % 2 ? leafM : leafM2);
    leaf.position.y = 5.5; leaf.castShadow = true; t.add(leaf);
    t.position.set(x, 0, z);
    scene.add(t);
  }

  // floating balloons / decoration
  for (let k = 0; k < 10; k++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 10),
      new THREE.MeshLambertMaterial({ color: [0xff3b3b, 0xffd23e, 0x3ec1ff, 0x57ff8a][k % 4] }));
    const i = Math.floor(k / 10 * SAMPLES);
    const bp = placeOnTrack(i, 24);
    b.position.set(bp.x, 19 + (k % 3) * 2.5, bp.z);
    b.userData.baseY = b.position.y;
    b.userData.ph = k;
    scene.add(b);
    balloons.push(b);
  }
}
const balloons = [];

/* distance check used while scattering */
function nearestIdxFull(x, z) {
  let best = 0, bd = 1e12;
  for (let i = 0; i < SAMPLES; i += 4) {
    const dx = pts[i].x - x, dz = pts[i].z - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function distToTrack(x, z) {
  const i = nearestIdxFull(x, z);
  return Math.hypot(pts[i].x - x, pts[i].z - z);
}

/* ---------------- karts ---------------- */
const RACERS = [
  { name: 'YOU',    emoji: '🪖', color: 0xe63030, cap: 0xe63030 },
  { name: 'Bolt',   emoji: '⚡', color: 0x2b7fff, cap: 0x2b7fff },
  { name: 'Sunny',  emoji: '🌞', color: 0xffc93e, cap: 0xff9d00 },
  { name: 'Vex',    emoji: '💜', color: 0x9b30ff, cap: 0x5b1a99 },
  { name: 'Mint',   emoji: '🌱', color: 0x22cc66, cap: 0x0d6b34 },
  { name: 'Coral',  emoji: '🐚', color: 0xff6fa5, cap: 0xc2255c },
];
let charIndex = 0;

function makeKartMesh(color, capColor) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 3.1),
    new THREE.MeshLambertMaterial({ color }));
  body.position.y = 0.62; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.9),
    new THREE.MeshLambertMaterial({ color: 0xffffff }));
  nose.position.set(0, 0.55, 1.9); g.add(nose);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 1.0),
    new THREE.MeshLambertMaterial({ color: 0x222831 }));
  seat.position.set(0, 1.0, -0.7); g.add(seat);
  const wheelG = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 12);
  const wheelM = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [x, z] of [[-1.05, 1.1], [1.05, 1.1], [-1.05, -1.1], [1.05, -1.1]]) {
    const w = new THREE.Mesh(wheelG, wheelM);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.45, z); w.castShadow = true;
    g.add(w); wheels.push(w);
  }
  // driver
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.5, 4, 8),
    new THREE.MeshLambertMaterial({ color: 0x2b3a55 }));
  torso.position.set(0, 1.55, -0.55); torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0xffcfa3 }));
  head.position.set(0, 2.25, -0.5); head.castShadow = true; g.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 6, 0, Math.PI * 2, 0, 1.2),
    new THREE.MeshLambertMaterial({ color: capColor }));
  cap.position.set(0, 2.32, -0.5); g.add(cap);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 12),
    new THREE.MeshLambertMaterial({ color: capColor }));
  brim.position.set(0, 2.3, 0.05); g.add(brim);
  return { group: g, wheels };
}

class Kart {
  constructor(def, isPlayer, startIdx) {
    const { group, wheels } = makeKartMesh(def.color, def.cap);
    this.def = def; this.isPlayer = isPlayer;
    this.mesh = group; this.wheels = wheels;
    this.pos = pts[startIdx].clone();
    this.dir = tangents[startIdx].clone();
    this.speed = 0; this.maxBase = isPlayer ? 37 : 33 + Math.random() * 5;
    this.nearest = startIdx;
    this.lap = 1; this.quarter = 0; this.progress = 0; this.totalProgress = 0;
    this.finished = false; this.finishTime = 0;
    this.item = null;
    this.spin = 0; this.boost = 0; this.drift = 0; this.driftDir = 0;
    this.offroad = false;
    this.quarter = 0; this.prevNear = startIdx; this.lat = 0; this.dist = 0;
    this.wobble = Math.random() * 10;
    this.lane = (Math.random() - 0.5) * 7;
    this.coinBoost = 0;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    scene.add(group);
  }
}

/* ---------------- pickups / hazards ---------------- */
const itemBoxes = [];   // {mesh, idx, lat, active, timer}
const coins = [];       // {mesh, idx, lat, taken, timer}
const shells = [];      // {mesh, pos, dir, life, owner}
const bananas = [];     // {mesh, pos, life, owner}
const pads = [];        // boost pads {mesh, idx}

function scatterPickups() {
  const boxGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  const boxMat = new THREE.MeshLambertMaterial({ color: 0x2266ff, transparent: true, opacity: 0.9, emissive: 0x1133aa });
  const qMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let k = 0; k < 12; k++) {
    const idx = Math.floor(k / 12 * SAMPLES + 30) % SAMPLES;
    const lat = (k % 3 - 1) * 3.2;
    const grp = new THREE.Group();
    const b = new THREE.Mesh(boxGeo, boxMat.clone()); b.castShadow = true; grp.add(b);
    grp.position.copy(placeOnTrack(idx, lat)); grp.position.y = 1.4;
    scene.add(grp);
    itemBoxes.push({ mesh: grp, box: b, idx, lat, active: true, timer: 0 });
  }
  const coinGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.15, 14);
  const coinMat = new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0x7a5a00 });
  for (let k = 0; k < 40; k++) {
    const idx = Math.floor(k / 40 * SAMPLES) % SAMPLES;
    const lat = Math.sin(k * 2.3) * 3.5;
    const c = new THREE.Mesh(coinGeo, coinMat);
    c.rotation.x = Math.PI / 2;
    c.position.copy(placeOnTrack(idx, lat)); c.position.y = 1.0;
    scene.add(c);
    coins.push({ mesh: c, idx, lat, taken: false, timer: 0 });
  }
  // boost pads (cyan strips)
  const padMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  for (let k = 0; k < 5; k++) {
    const idx = Math.floor((k + 0.5) / 5 * SAMPLES) % SAMPLES;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 3),
      padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = -Math.atan2(tangents[idx].z, tangents[idx].x);
    pad.position.copy(placeOnTrack(idx, 0)); pad.position.y = 0.04;
    scene.add(pad);
    pads.push({ mesh: pad, idx });
  }
}
function placeOnTrack(idx, lat) {
  const s = sideOf(idx);
  return new THREE.Vector3(pts[idx].x + s.x * lat, 0, pts[idx].z + s.z * lat);
}

buildWorld();
scatterPickups();

/* ---------------- game state ---------------- */
let karts = [];
let state = 'title';       // title | countdown | race | finished
let countT = 0, raceTime = 0, bestLap = 0, lapStart = 0;
let player = null;
let camMode = 0;
const input = { left: false, right: false, gas: false, brake: false };

function resetRace() {
  for (const k of karts) scene.remove(k.mesh);
  for (const s of shells) scene.remove(s.mesh);
  for (const b of bananas) scene.remove(b.mesh);
  shells.length = 0; bananas.length = 0;
  karts = [];
  const perRow = 2, spacing = 6;
  for (let i = 0; i < KART_COUNT; i++) {
    const row = Math.floor(i / perRow), col = i % perRow;
    const startIdx = 8 + row * spacing; // grid just past the start gantry
    // player starts last (classic), uses chosen color
    const def = i === KART_COUNT - 1
      ? { ...RACERS[0], color: [0xe63030, 0x2b7fff, 0xffc93e, 0x22cc66][charIndex % 4], cap: [0xe63030, 0x2b7fff, 0xffc93e, 0x22cc66][charIndex % 4] }
      : RACERS[(i % (RACERS.length - 1)) + 1];
    const k = new Kart(def, i === KART_COUNT - 1, startIdx);
    const s = sideOf(startIdx);
    const lat = col === 0 ? -2.5 : 2.5;
    k.pos = placeOnTrack(startIdx, lat);
    karts.push(k);
  }
  player = karts[karts.length - 1];
  raceTime = 0; bestLap = 0; lapStart = 0;
  for (const b of itemBoxes) { b.active = true; b.mesh.visible = true; }
  for (const c of coins) { c.taken = false; c.mesh.visible = true; }
  $('pos').textContent = KART_COUNT;
}
resetRace();

/* ---------------- input: keyboard + touch ---------------- */
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = true;
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.gas = true;
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S' || e.key === ' ') input.brake = true;
  if (e.key === 'e' || e.key === 'E' || e.key === 'Shift') useItem(player);
});
window.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = false;
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.gas = false;
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S' || e.key === ' ') input.brake = false;
});
function bindHold(id, key) {
  const el = $(id);
  const on = e => { e.preventDefault(); input[key] = true; el.classList.add('on'); };
  const off = e => { e.preventDefault(); input[key] = false; el.classList.remove('on'); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointerleave', off);
  el.addEventListener('pointercancel', off);
}
bindHold('btn-left', 'left'); bindHold('btn-right', 'right');
bindHold('btn-gas', 'gas'); bindHold('btn-brake', 'brake');
$('btn-item').addEventListener('pointerdown', e => { e.preventDefault(); useItem(player); });
window.addEventListener('contextmenu', e => e.preventDefault());

/* ---------------- UI wiring ---------------- */
const charRow = $('char-row');
['🪖', '⚡', '🌞', '🌱'].forEach((em, i) => {
  const d = document.createElement('div');
  d.className = 'char' + (i === 0 ? ' sel' : '');
  d.innerHTML = `${em}<small>P${i + 1}</small>`;
  d.onclick = () => { charIndex = i; [...charRow.children].forEach((c, j) => c.classList.toggle('sel', j === i)); };
  charRow.appendChild(d);
});
$('startBtn').addEventListener('click', () => {
  resetRace();
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('touch').classList.remove('hidden');
  state = 'countdown'; countT = 0;
  snapCamera();
  startAudio();
});
$('againBtn').addEventListener('click', () => {
  $('results').classList.add('hidden');
  resetRace();
  $('hud').classList.remove('hidden');
  $('touch').classList.remove('hidden');
  state = 'countdown'; countT = 0;
  snapCamera();
});

function showMsg(t, ms = 1800) {
  const m = $('msg'); m.textContent = t;
  clearTimeout(showMsg._t);
  if (ms) showMsg._t = setTimeout(() => m.textContent = '', ms);
}

/* ---------------- audio (synthesized) ---------------- */
let AC = null, engineOsc = null, engineGain = null;
function startAudio() {
  try {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      engineOsc = AC.createOscillator(); engineGain = AC.createGain();
      engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 60;
      engineGain.gain.value = 0.03;
      engineOsc.connect(engineGain); engineGain.connect(AC.destination);
      engineOsc.start();
    }
    AC.resume();
  } catch (e) { /* audio optional */ }
}
function beep(freq, dur = 0.15, type = 'square', vol = 0.12) {
  if (!AC) return;
  try {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime + dur);
  } catch (e) {}
}

/* ---------------- items ---------------- */
const ITEMS = [
  { id: 'boost', emoji: '🚀', label: 'BOOST!' },
  { id: 'shell', emoji: '🟢', label: 'SHELL!' },
  { id: 'banana', emoji: '🍌', label: 'PEEL!' },
];
function giveItem(k) {
  if (!k || k.item) return;
  const it = ITEMS[Math.floor(Math.random() * ITEMS.length)];
  k.item = it;
  if (k.isPlayer) {
    $('item-emoji').textContent = it.emoji;
    $('item-slot').classList.remove('active'); void $('item-slot').offsetWidth;
    $('item-slot').classList.add('active');
    beep(880, 0.15);
  }
}
function useItem(k) {
  if (!k || !k.item || state !== 'race') return;
  const it = k.item; k.item = null;
  if (k.isPlayer) $('item-emoji').textContent = '❔';
  if (it.id === 'boost') { k.boost = 1.6; beep(220, 0.4, 'sawtooth'); showMsg(k.isPlayer ? '🚀 BOOST!' : '', 900); }
  if (it.id === 'banana') {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 7),
      new THREE.MeshLambertMaterial({ color: 0xffe14d }));
    const back = k.pos.clone().addScaledVector(k.dir, -3);
    m.position.set(back.x, 0.5, back.z); m.castShadow = true;
    scene.add(m);
    bananas.push({ mesh: m, pos: m.position.clone(), life: 60, owner: k });
    beep(500, 0.15);
  }
  if (it.id === 'shell') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0x2bff5b, emissive: 0x0a5b1a }));
    m.position.copy(k.pos).add(new THREE.Vector3(0, 1, 0)).addScaledVector(k.dir, 3);
    m.castShadow = true; scene.add(m);
    shells.push({ mesh: m, pos: m.position.clone(), dir: k.dir.clone(), life: 6, owner: k });
    beep(700, 0.2, 'square');
  }
}

/* ---------------- physics helpers ---------------- */
function updateNearest(k) {
  // local search window around last index (track is a loop)
  let best = k.nearest, bd = 1e12;
  for (let o = -14; o <= 30; o++) {
    const i = (k.nearest + o + SAMPLES) % SAMPLES;
    const dx = pts[i].x - k.pos.x, dz = pts[i].z - k.pos.z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  k.nearest = best;
  const s = sideOf(best);
  const dx = k.pos.x - pts[best].x, dz = k.pos.z - pts[best].z;
  k.lat = dx * s.x + dz * s.z;
  k.dist = Math.sqrt(bd);
}
function trackAhead(idx, n) { return pts[(idx + n) % SAMPLES]; }

/* ---------------- player update ---------------- */
function updatePlayer(dt) {
  const k = player;
  if (k.finished) { k.speed = Math.max(0, k.speed - 20 * dt); moveKart(k, dt, 0); return; }
  const autoGas = $('autogas').checked;
  const gas = input.gas || autoGas;
  updateNearest(k);
  k.offroad = Math.abs(k.lat) > ROAD_HALF + 0.4;

  let top = k.maxBase + k.coinBoost + (k.boost > 0 ? 22 : 0);
  if (k.offroad) top = Math.min(top, 15);
  if (k.spin > 0) top = 6;

  if (gas && k.spin <= 0) k.speed += 24 * dt;
  if (input.brake) k.speed -= (k.speed > 2 ? 34 : 10) * dt;
  // drag toward top speed
  if (k.speed > top) k.speed += (top - k.speed) * 2.2 * dt;
  else k.speed -= k.speed * 0.25 * dt;
  k.speed = THREE.MathUtils.clamp(k.speed, input.brake ? -8 : 0, 70);
  if (k.boost > 0) k.boost -= dt;
  if (k.spin > 0) k.spin -= dt;

  // steering
  let steer = 0;
  if (input.left) steer -= 1;
  if (input.right) steer += 1;
  const spdF = THREE.MathUtils.clamp(k.speed / 30, -1, 1);
  const turnRate = 1.9 * Math.min(1, Math.abs(spdF) * 1.4 + 0.25) * (k.speed < 0 ? -1 : 1);
  // drift: brake + steer charges mini-turbo
  if (input.brake && steer !== 0 && Math.abs(k.speed) > 12) {
    k.drift += dt; k.driftDir = steer;
    if (k.drift > 1.1 && k.boost <= 0) { k.boost = 1.0; k.drift = 0; if (state === 'race') { showMsg('MINI-TURBO!', 800); beep(300, 0.35, 'sawtooth'); } }
  } else k.drift = Math.max(0, k.drift - 2 * dt);

  if (k.spin > 0) {
    k.dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), 9 * dt);
  } else if (steer !== 0 && Math.abs(k.speed) > 0.5) {
    k.dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), steer * turnRate * dt * (k.drift > 0 ? 1.5 : 1));
    k.dir.y = 0; k.dir.normalize();
  }
  moveKart(k, dt, steer);
}
function moveKart(k, dt, steer) {
  k.pos.addScaledVector(k.dir, k.speed * dt);
  // wall clamp
  updateNearest(k);
  const LIM = ROAD_HALF + 3.0;
  if (Math.abs(k.lat) > LIM) {
    const s = sideOf(k.nearest);
    const over = Math.abs(k.lat) - LIM;
    const sign = Math.sign(k.lat);
    k.pos.x -= s.x * sign * over; k.pos.z -= s.z * sign * over;
    // scrub speed into wall
    k.speed *= 0.94;
    // nudge direction along track
    const t = tangents[k.nearest];
    k.dir.lerp(t, 0.06).normalize();
  }
  // boost pads
  for (const p of pads) {
    let d = Math.abs(p.idx - k.nearest); d = Math.min(d, SAMPLES - d);
    if (d < 4 && Math.abs(k.lat) < 3 && k.boost <= 0 && k.speed > 1) {
      k.boost = 1.2; beep(440, 0.25, 'sawtooth', 0.08);
      if (k.isPlayer) showMsg('⚡ BOOST PAD!', 700);
    }
  }
  k.mesh.position.copy(k.pos);
  const targetYaw = Math.atan2(k.dir.x, k.dir.z);
  let yaw = k.mesh.rotation.y;
  let dy = targetYaw - yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  k.mesh.rotation.y = yaw + dy * Math.min(1, 10 * dt);
  k.mesh.rotation.z = THREE.MathUtils.lerp(k.mesh.rotation.z, -steer * 0.12, 0.2);
  for (const w of k.wheels) w.rotation.x += k.speed * dt * 1.6;
}

/* ---------------- AI update ---------------- */
function updateAI(k, dt) {
  if (k.finished) { k.speed = Math.max(0, k.speed - 20 * dt); moveKart(k, dt, 0); return; }
  updateNearest(k);
  // rubber-band: slower leaders, faster trailers
  const rank = raceRank(k);
  const rubber = (rank - 1) * 1.1;
  let top = k.maxBase + rubber + (k.boost > 0 ? 20 : 0);
  if (Math.abs(k.lat) > ROAD_HALF) top = Math.min(top, 16);
  if (k.spin > 0) top = 6;
  // lookahead target with lane offset
  k.wobble += dt;
  const look = 14 + k.speed * 0.35;
  const aheadIdx = (k.nearest + Math.floor(look)) % SAMPLES;
  const laneWob = Math.sin(k.wobble * 0.7) * 1.5;
  const target = placeOnTrack(aheadIdx, THREE.MathUtils.clamp(k.lane + laneWob, -5, 5));
  target.y = 0;
  const want = target.clone().sub(k.pos); want.y = 0; want.normalize();
  const curYaw = Math.atan2(k.dir.x, k.dir.z);
  const wantYaw = Math.atan2(want.x, want.z);
  let dy = wantYaw - curYaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  const maxTurn = 2.4 * dt;
  k.dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.clamp(dy, -maxTurn, maxTurn));
  // avoid bananas/shells slightly
  k.speed += (top - k.speed) * Math.min(1, 1.6 * dt);
  if (k.speed > top + 8) k.speed = top + 8;
  if (k.boost > 0) k.boost -= dt;
  if (k.spin > 0) { k.spin -= dt; k.dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), 8 * dt); }
  // AI uses items randomly
  if (k.item && Math.random() < dt * 0.25) useItem(k);
  // AI grabs lane changes to avoid walls
  if (Math.abs(k.lat) > ROAD_HALF - 1) k.lane *= 0.9;
  moveKart(k, dt, 0);
}

/* ---------------- laps / positions ---------------- */
function updateProgress(k) {
  updateNearest(k);
  const q = Math.floor(k.nearest / SAMPLES * 4);
  if (q === (k.quarter + 1) % 4) k.quarter = q;
  // crossed start line forward with all quarters seen
  if (k.nearest < 30 && k.prevNear > SAMPLES - 30) {
    if (k.quarter === 3) {
      k.quarter = 0;
      if (k.lap >= TOTAL_LAPS) {
        if (!k.finished) {
          k.finished = true; k.finishTime = raceTime;
          if (k.isPlayer) onPlayerFinish();
          else if (state === 'race') showMsg(`${k.def.emoji} ${k.def.name} finished!`, 1200);
        }
      } else {
        k.lap++;
        if (k.isPlayer) {
          const lt = raceTime - lapStart;
          if (!bestLap || lt < bestLap) bestLap = lt;
          lapStart = raceTime;
          $('lap').textContent = Math.min(k.lap, TOTAL_LAPS);
          showMsg(k.lap > TOTAL_LAPS ? '' : `LAP ${k.lap}!`, 1400);
          beep(660, 0.2);
        }
        // AI difficulty nudge + item gift
        if (!k.isPlayer && Math.random() < 0.7) giveItem(k);
      }
    }
  }
  k.prevNear = k.nearest;
  k.totalProgress = (k.finished ? 1e6 - k.finishTime : (k.lap - 1) + k.nearest / SAMPLES);
}
for (const k of karts) { k.prevNear = k.nearest; k.quarter = 0; }

function raceRank(kart) {
  const order = [...karts].sort((a, b) => b.totalProgress - a.totalProgress);
  return order.indexOf(kart) + 1;
}
const SUFFIX = { 1: 'st', 2: 'nd', 3: 'rd' };
function onPlayerFinish() {
  const r = raceRank(player);
  state = 'finished';
  setTimeout(() => showResults(r), 1200);
  showMsg('🏁 FINISH!', 3000);
  beep(523, 0.3); setTimeout(() => beep(659, 0.3), 250); setTimeout(() => beep(784, 0.5), 500);
}
function showResults(r) {
  $('hud').classList.add('hidden');
  $('touch').classList.add('hidden');
  $('results').classList.remove('hidden');
  $('res-place').textContent = `${r}${SUFFIX[r] || 'th'}!`;
  $('res-head').textContent = r === 1 ? '🏆 VICTORY!' : 'RACE COMPLETE';
  const order = [...karts].sort((a, b) => (a.finishTime || 1e9) - (b.finishTime || 1e9) || b.totalProgress - a.totalProgress);
  $('res-table').innerHTML = order.map((k, i) =>
    `<div class="row${k.isPlayer ? ' me' : ''}"><span>${i + 1}. ${k.def.emoji} ${k.isPlayer ? 'YOU' : k.def.name}</span><span>${k.finishTime ? fmt(k.finishTime) : 'DNF'}</span></div>`
  ).join('') + `<div class="row"><span>Best lap</span><span>${bestLap ? fmt(bestLap) : '—'}</span></div>`;
}

/* ---------------- collisions: boxes / coins / shells / bananas ---------------- */
function updatePickups(dt) {
  for (const b of itemBoxes) {
    if (!b.active) {
      b.timer -= dt;
      if (b.timer <= 0) { b.active = true; b.mesh.visible = true; }
      continue;
    }
    b.mesh.rotation.y += 2 * dt;
    b.mesh.position.y = 1.4 + Math.sin(performance.now() * 0.004 + b.idx) * 0.25;
    for (const k of karts) {
      if (k.finished) continue;
      if (k.pos.distanceToSquared(new THREE.Vector3(b.mesh.position.x, 0, b.mesh.position.z)) < 6.5 && !k.item) {
        giveItem(k);
        b.active = false; b.timer = 4; b.mesh.visible = false;
        break;
      }
    }
  }
  for (const c of coins) {
    if (c.taken) {
      c.timer -= dt;
      if (c.timer <= 0) { c.taken = false; c.mesh.visible = true; }
      continue;
    }
    c.mesh.rotation.y += 3 * dt;
    for (const k of karts) {
      if (k.finished) continue;
      const dx = k.pos.x - c.mesh.position.x, dz = k.pos.z - c.mesh.position.z;
      if (dx * dx + dz * dz < 4.5) {
        c.taken = true; c.timer = 20; c.mesh.visible = false;
        k.coinBoost = Math.min(6, k.coinBoost + 0.6);
        if (k.isPlayer) { beep(1320, 0.08, 'square', 0.07); }
        break;
      }
    }
  }
  // shells
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    s.life -= dt;
    s.pos.addScaledVector(s.dir, 55 * dt);
    s.mesh.position.copy(s.pos);
    s.mesh.rotation.x += 8 * dt;
    let hit = s.life <= 0;
    if (distToTrack(s.pos.x, s.pos.z) > ROAD_HALF + 6) hit = true;
    if (!hit) {
      for (const k of karts) {
        if (k === s.owner || k.finished || k.spin > 0) continue;
        const dx = k.pos.x - s.pos.x, dz = k.pos.z - s.pos.z;
        if (dx * dx + dz * dz < 5.5) {
          k.spin = 1.4; k.speed *= 0.35; k.boost = 0;
          if (k.isPlayer) { showMsg('💥 HIT!', 1000); beep(150, 0.4, 'sawtooth'); }
          hit = true; break;
        }
      }
    }
    if (hit) { scene.remove(s.mesh); shells.splice(i, 1); }
  }
  // bananas
  for (let i = bananas.length - 1; i >= 0; i--) {
    const bn = bananas[i];
    bn.life -= dt;
    bn.mesh.rotation.y += 1.5 * dt;
    let hit = bn.life <= 0;
    if (!hit) {
      for (const k of karts) {
        if (k === bn.owner && bn.life > 58) continue; // grace so you don't hit your own instantly
        if (k.finished || k.spin > 0) continue;
        const dx = k.pos.x - bn.pos.x, dz = k.pos.z - bn.pos.z;
        if (dx * dx + dz * dz < 4.2) {
          k.spin = 1.4; k.speed *= 0.35;
          if (k.isPlayer) { showMsg('🍌 SLIP!', 1000); beep(200, 0.35, 'sawtooth'); }
          hit = true; break;
        }
      }
    }
    if (hit) { scene.remove(bn.mesh); bananas.splice(i, 1); }
  }
}

/* ---------------- HUD / minimap ---------------- */
const mm = $('minimap').getContext('2d');
function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
function updateHUD() {
  $('time').textContent = fmt(raceTime);
  $('speed').textContent = Math.round(Math.abs(player.speed) * 3.2);
  const r = raceRank(player);
  $('pos').textContent = r;
  $('pos-suffix').textContent = SUFFIX[r] || 'th';
  // engine pitch
  if (engineOsc) engineOsc.frequency.value = 55 + Math.abs(player.speed) * 3.2 + (player.boost > 0 ? 60 : 0);
  // minimap
  mm.clearRect(0, 0, 150, 150);
  mm.strokeStyle = '#fff'; mm.lineWidth = 7; mm.lineJoin = 'round';
  mm.beginPath();
  for (let i = 0; i <= 60; i++) {
    const p = pts[Math.floor(i / 60 * (SAMPLES - 1))];
    const x = 75 + p.x * 0.42, y = 75 + p.z * 0.42;
    i ? mm.lineTo(x, y) : mm.moveTo(x, y);
  }
  mm.closePath(); mm.stroke();
  for (const k of karts) {
    mm.fillStyle = k.isPlayer ? '#ffd23e' : '#ff3b3b';
    mm.beginPath();
    mm.arc(75 + k.pos.x * 0.42, 75 + k.pos.z * 0.42, k.isPlayer ? 5 : 3.5, 0, 7);
    mm.fill();
  }
}

/* ---------------- camera ---------------- */
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function snapCamera() {
  const k = player;
  if (!k) return;
  camPos.copy(k.pos).addScaledVector(k.dir, -11); camPos.y = 5.6;
  camLook.copy(k.pos).addScaledVector(k.dir, 10); camLook.y = 2.2;
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}
function updateCamera(dt) {
  if (state === 'title') {
    const t = performance.now() * 0.00008;
    const i = Math.floor(t * SAMPLES) % SAMPLES;
    const p = pts[i], tg = tangents[i];
    camPos.lerp(new THREE.Vector3(p.x - tg.x * 42 + 16, 24, p.z - tg.z * 42 + 16), 0.03);
    camera.position.copy(camPos);
    camera.lookAt(p.x, 2, p.z);
    camera.fov = 62; camera.updateProjectionMatrix();
    return;
  }
  const k = player;
  const back = k.pos.clone().addScaledVector(k.dir, -11 - k.speed * 0.06);
  back.y = 5.6 + k.speed * 0.012;
  // slight lateral offset for drift feel
  const s = new THREE.Vector3(-k.dir.z, 0, k.dir.x);
  const steerLean = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  back.addScaledVector(s, steerLean * 1.2);
  camPos.lerp(back, 1 - Math.pow(0.0001, dt));
  camera.position.copy(camPos);
  camLook.lerp(new THREE.Vector3(k.pos.x + k.dir.x * 10, 2.2, k.pos.z + k.dir.z * 10), 1 - Math.pow(0.00001, dt));
  camera.lookAt(camLook);
  const wantFov = 70 + (k.boost > 0 ? 12 : k.speed / 70 * 8);
  camera.fov += (wantFov - camera.fov) * 0.08;
  camera.updateProjectionMatrix();
}

/* ---------------- main loop ---------------- */
const clock = new THREE.Clock();
const cdEl = $('countdown');
let lastBeep = -1;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  for (const b of balloons) b.position.y = b.userData.baseY + Math.sin(now * 0.001 + b.userData.ph) * 1.2;

  if (state === 'countdown') {
    countT += dt;
    const n = Math.ceil(3 - countT);
    if (n > 0) {
      cdEl.textContent = n;
      if (n !== lastBeep) { lastBeep = n; beep(440, 0.15); }
    } else {
      cdEl.textContent = 'GO!';
      if (lastBeep !== 0) { lastBeep = 0; beep(880, 0.4); showMsg('', 1); }
      if (countT > 3.6) { cdEl.textContent = ''; state = 'race'; lapStart = 0; showMsg('GO! 🏁', 1200); }
    }
    // hold karts, rev wheels
    for (const w of player.wheels) w.rotation.x += 2 * dt;
    updateHUD();
  } else if (state === 'race' || state === 'finished') {
    if (state === 'race') raceTime += dt;
    updatePlayer(dt);
    for (const k of karts) if (!k.isPlayer) updateAI(k, dt);
    for (const k of karts) updateProgress(k);
    updatePickups(dt);
    updateHUD();
    if (state === 'race' && karts.filter(k => k.finished).length === KART_COUNT) {
      // everyone done (player finished earlier triggers results already)
      if (!player.finished) { player.finished = true; player.finishTime = raceTime; onPlayerFinish(); }
    }
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
// prevent double-tap zoom / scroll on touch devices
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', e => e.preventDefault());
