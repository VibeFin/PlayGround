import * as THREE from 'three';
import { clayMat, clayBox, clayBall, clayRamp, handMake, buildKid, buildBead, buildFlower, buildFlag, buildGoal, buildSpike, buildSoftClay } from './clay.js';
import { LEVELS, CLAY_SHAPES } from './levels.js';
import { sfx, setSoundEnabled } from './audio.js';

// ================= settings / progress =================
const DEF_SET = { fps: 12, sens: 100, wobble: true, sound: true, shadow: true };
const DEF_PROG = { unlocked: 0, beads: {}, flowers: {}, best: {} };
let SET = { ...DEF_SET }, PROG = JSON.parse(JSON.stringify(DEF_PROG));
try { Object.assign(SET, JSON.parse(localStorage.getItem('claybound-settings') || '{}')); } catch (e) {}
try { Object.assign(PROG, JSON.parse(localStorage.getItem('claybound-progress') || '{}')); } catch (e) {}
function saveSet() { localStorage.setItem('claybound-settings', JSON.stringify(SET)); }
function saveProg() { localStorage.setItem('claybound-progress', JSON.stringify(PROG)); }
setSoundEnabled(SET.sound);

// ================= renderer / scene =================
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = SET.shadow;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffd9a0);
scene.fog = new THREE.Fog(0xf0a860, 40, 160);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 600);
const hemi = new THREE.HemisphereLight(0xffe6c0, 0x8a4a20, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d0, 1.4);
sun.position.set(20, 35, 12);
sun.castShadow = SET.shadow;
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.5;
scene.add(sun); scene.add(sun.target);
scene.add(new THREE.AmbientLight(0xffffff, 0.15));
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ================= state =================
let mode = 'title';           // title | play | editor | playtest
let levelIndex = 0, levelDef = LEVELS[0];
let world = null;             // THREE.Group
let colliders = [];           // {min,max,ramp?...}
let clays = [];               // clay puzzle objects
let pickups = [];             // beads/flowers {mesh,taken,kind,x,y,z}
let hazards = [];             // spikes {x,y,z}
let flags = [];               // {mesh,x,y,z,hit}
let goalPt = null;            // {mesh,x,y,z}
let spawnPt = { x: 0, y: 4, z: 0 };
let groundMesh = null;
let totalBeads = 0, gotBeads = 0, gotFlowers = [];
let camYaw = Math.PI / 2, camPitch = 0.32, camDist = 7.5;
let playTime = 0, playing = false, dead = false;
let menuT = 0;

// ================= player =================
const kid = buildKid();
scene.add(kid);
const player = {
  pos: new THREE.Vector3(0, 4, 0), vel: new THREE.Vector3(),
  onGround: false, jumps: 0, face: 0, walk: 0, squash: 0, coyote: 0,
};
const PW = 0.35, PH = 1.9;
kid.visible = false;

function respawn(at) {
  player.pos.set(at.x, at.y + 0.2, at.z);
  player.vel.set(0, 0, 0);
  player.onGround = false; player.jumps = 0; dead = false;
  camYaw = Math.PI / 2; // face down the +X trail
}

// ================= world building =================
function clearWorld() {
  if (world) { scene.remove(world); }
  world = new THREE.Group(); scene.add(world);
  colliders = []; clays = []; pickups = []; hazards = []; flags = []; goalPt = null;
}
function addCollider(min, max, extra = {}) {
  colliders.push({ min, max, ...extra });
}
function addBoxMesh(item) {
  const m = clayBox(item.w, item.h, item.d, item.c ?? 0xc96a2e);
  m.position.set(item.x, item.y, item.z);
  world.add(m);
  addCollider(
    new THREE.Vector3(item.x - item.w / 2, item.y - item.h / 2, item.z - item.d / 2),
    new THREE.Vector3(item.x + item.w / 2, item.y + item.h / 2, item.z + item.d / 2));
  return m;
}
// --- clay morph block ---
function addClay(item) {
  const base = { x: item.x, y: item.y, z: item.z }; // base top surface y
  const anchor = new THREE.Group();
  anchor.position.set(base.x, base.y, base.z);
  const glowBase = buildSoftClay();
  anchor.add(glowBase);
  const holder = new THREE.Group();
  anchor.add(holder);
  world.add(anchor);
  const clay = { base, shape: item.shape || 0, anchor, holder, glowBase, squish: 0, meshes: [] };
  rebuildClay(clay, false);
  clays.push(clay);
  return clay;
}
function clayColor() { return 0xb47aff; }
function rebuildClay(clay, animate = true) {
  while (clay.holder.children.length) clay.holder.remove(clay.holder.children[0]);
  clay.meshes = [];
  const c = clayColor();
  let mesh;
  if (clay.shape === 0) {
    mesh = clayBox(2.4, 2.4, 2.4, c); mesh.position.y = 1.2; clay.holder.add(mesh); clay.meshes.push(mesh);
  } else if (clay.shape === 1) {
    mesh = clayRamp(4.8, 2.4, 2.4, c); mesh.position.y = 0; clay.holder.add(mesh); clay.meshes.push(mesh);
  } else {
    mesh = clayBox(7, 0.7, 2.4, c); mesh.position.y = 1.85; clay.holder.add(mesh); clay.meshes.push(mesh);
    // little posts
    const p1 = clayBox(0.5, 1.5, 0.5, c); p1.position.set(-3, 0.75, 0); clay.holder.add(p1);
    const p2 = p1.clone(); p2.position.x = 3; clay.holder.add(p2);
    clay.meshes.push(p1, p2);
  }
  if (animate) { clay.squish = 1; sfx.shape(); }
  refreshClayCollider(clay);
}
function refreshClayCollider(clay) {
  // remove old
  for (let i = colliders.length - 1; i >= 0; i--) if (colliders[i].clay === clay) colliders.splice(i, 1);
  const { x, y, z } = clay.base;
  if (clay.shape === 0) {
    addCollider(new THREE.Vector3(x - 1.2, y, z - 1.2), new THREE.Vector3(x + 1.2, y + 2.4, z + 1.2), { clay });
  } else if (clay.shape === 1) {
    colliders.push({
      ramp: true, clay,
      x0: x - 2.4, x1: x + 2.4, yB: y, yT: y + 2.4,
      z0: z - 1.2, z1: z + 1.2,
      min: new THREE.Vector3(x - 2.4, y, z - 1.2), max: new THREE.Vector3(x + 2.4, y + 2.4, z + 1.2),
    });
  } else {
    addCollider(new THREE.Vector3(x - 3.5, y + 1.5, z - 1.2), new THREE.Vector3(x + 3.5, y + 2.2, z + 1.2), { clay });
  }
}
function rampHeight(r, px) {
  const t = Math.min(1, Math.max(0, (px - r.x0) / (r.x1 - r.x0)));
  return r.yB + t * (r.yT - r.yB);
}

// --- decorations per theme ---
function scatterDeco(theme, items) {
  const R = (a, b) => a + Math.random() * (b - a);
  const put = (m, x, y, z, s = 1) => { m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.y = R(0, 6); world.add(m); };
  // big ground disc
  const gnd = new THREE.Mesh(handMake(new THREE.CylinderGeometry(90, 90, 1, 24), 0.12), clayMat(theme.ground));
  gnd.position.set(30, -1.6, 0); gnd.receiveShadow = true; world.add(gnd);
  if (theme.deco === 'canyon') {
    for (let i = 0; i < 10; i++) {
      const w = R(4, 9), h = R(6, 16);
      const mesa = clayBox(w, h, R(4, 8), [0xb34a22, 0xd9793c, 0x9e3f1c][i % 3], 0.35);
      put(mesa, R(-25, 85), h / 2 - 1.5, (i % 2 ? -1 : 1) * R(14, 40), 1);
      const cap = clayBox(w * 0.7, 1.2, w * 0.5, 0x7a2f14, 0.2);
      cap.position.set(mesa.position.x, h - 1, mesa.position.z); world.add(cap);
    }
    for (let i = 0; i < 12; i++) { // cacti
      const cx = R(-20, 80), cz = (i % 2 ? -1 : 1) * R(9, 30);
      const cactus = clayBox(0.9, R(2, 4), 0.9, 0x4a9e57, 0.08);
      put(cactus, cx, 1, cz);
      const arm = clayBox(0.6, 1.4, 0.6, 0x4a9e57, 0.06);
      arm.position.set(cx + 0.7, 1.4, cz); world.add(arm);
    }
  } else if (theme.deco === 'treetop') {
    for (let i = 0; i < 12; i++) {
      const tx = R(-20, 80), tz = (i % 2 ? -1 : 1) * R(11, 34);
      const trunk = new THREE.Mesh(handMake(new THREE.CylinderGeometry(0.7, 1, R(5, 9), 8), 0.1), clayMat(0x7a5230));
      trunk.position.set(tx, 2, tz); trunk.castShadow = true; world.add(trunk);
      for (let j = 0; j < 3; j++) {
        const leaf = clayBall(R(1.6, 2.6), [0x3f9e3f, 0x55bb4a, 0x2f7e35][j % 3], 0.25);
        put(leaf, tx + R(-2, 2), R(5, 8.5), tz + R(-2, 2));
      }
    }
  } else if (theme.deco === 'caves') {
    for (let i = 0; i < 16; i++) {
      const col = [0x35e0ff, 0xb47aff, 0xff5fa2][i % 3];
      const cry = new THREE.Mesh(handMake(new THREE.ConeGeometry(R(0.5, 1), R(2, 5), 6), 0.06),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, roughness: 0.4 }));
      cry.position.set(R(-20, 85), R(0, 3), (i % 2 ? -1 : 1) * R(10, 32));
      cry.rotation.z = R(-0.4, 0.4); world.add(cry);
      const l = new THREE.PointLight(col, 12, 18); l.position.copy(cry.position).add(new THREE.Vector3(0, 2, 0));
      if (i % 3 === 0) world.add(l);
    }
    for (let i = 0; i < 10; i++) { // stalactites
      const s = new THREE.Mesh(handMake(new THREE.ConeGeometry(R(0.8, 1.6), R(3, 7), 7), 0.15), clayMat(0x3a2a55));
      s.position.set(R(-15, 80), R(12, 20), R(-25, 25)); s.rotation.x = Math.PI; world.add(s);
    }
  } else if (theme.deco === 'cloud') {
    for (let i = 0; i < 14; i++) {
      const cl = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const puff = clayBall(R(1, 2.2), 0xffffff, 0.15);
        puff.position.set(j * 1.6 - 2, R(-0.3, 0.5), R(-1, 1)); cl.add(puff);
      }
      cl.position.set(R(-25, 90), R(2, 16), (i % 2 ? -1 : 1) * R(13, 36));
      world.add(cl);
    }
    // rainbow
    const rb = ['#ff5f5f', '#ffb35c', '#ffe14d', '#57b24a', '#3fa7ff', '#b47aff'];
    rb.forEach((c, i) => {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(22 - i * 1.1, 0.55, 8, 40, Math.PI),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75 }));
      arc.position.set(28, 4, -30); world.add(arc);
    });
  } else if (theme.deco === 'workshop') {
    const grid = new THREE.GridHelper(80, 16, 0xffffff, 0xffffff);
    grid.position.set(20, 0.05, 0);
    grid.material.transparent = true; grid.material.opacity = 0.15;
    grid.material.depthWrite = false;
    world.add(grid);
  }
}

function buildLevel(def) {
  clearWorld();
  scene.background = new THREE.Color(def.sky);
  scene.fog.color.setHex(def.fog); scene.fog.near = def.fogNear; scene.fog.far = def.fogFar;
  hemi.color.setHex(def.hemi[0]); hemi.groundColor.setHex(def.hemi[1]); hemi.intensity = def.hemi[2];
  sun.color.setHex(def.sun[0]); sun.intensity = def.sun[1];
  scatterDeco(def, def.items);
  spawnPt = { ...def.spawn };
  totalBeads = def.items.filter(i => i.k === 'bead').length;
  gotBeads = 0; gotFlowers = [];
  for (const it of def.items) {
    if (it.k === 'box') addBoxMesh(it);
    else if (it.k === 'clay') addClay(it);
    else if (it.k === 'bead') { const m = buildBead(); m.position.set(it.x, it.y, it.z); world.add(m); pickups.push({ mesh: m, taken: false, kind: 'bead', x: it.x, y: it.y, z: it.z }); }
    else if (it.k === 'flower') { const m = buildFlower(); m.position.set(it.x, it.y, it.z); world.add(m); pickups.push({ mesh: m, taken: false, kind: 'flower', x: it.x, y: it.y, z: it.z }); }
    else if (it.k === 'spike') { const m = buildSpike(); m.position.set(it.x, it.y, it.z); world.add(m); hazards.push({ x: it.x, y: it.y, z: it.z }); }
    else if (it.k === 'flag') { const m = buildFlag(false); m.position.set(it.x, it.y, it.z); world.add(m); flags.push({ mesh: m, x: it.x, y: it.y, z: it.z, hit: false }); }
    else if (it.k === 'goal') { const m = buildGoal(); m.position.set(it.x, it.y, it.z); world.add(m); goalPt = { mesh: m, x: it.x, y: it.y, z: it.z }; }
  }
  respawn(spawnPt);
  playTime = 0;
}

// ================= input =================
const keys = {};
addEventListener('keydown', e => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'Space') tryJump();
  if (e.code === 'KeyE') tryReshape();
  if (e.code === 'KeyR' && (mode === 'play' || mode === 'playtest')) die(true);
  if (e.code === 'Escape') { if (mode === 'play') pauseGame(); else if (!isMenuOpen()) resumeGame(); }
  if (e.code === 'Delete' || e.code === 'Backspace') { if (mode === 'editor') edDelete(); }
});
addEventListener('keyup', e => keys[e.code] = false);

// mouse orbit
let dragging = false, lx = 0, ly = 0;
canvas.addEventListener('pointerdown', e => {
  if (mode === 'editor') { edClick(e); return; }
  dragging = true; lx = e.clientX; ly = e.clientY;
});
addEventListener('pointermove', e => {
  if (!dragging || mode === 'editor' && edTool !== 'orbit') return;
  if (mode === 'editor') {
    edYaw -= (e.clientX - lx) * 0.005 * SET.sens / 100;
    edPitch = Math.min(1.2, Math.max(0.38, edPitch + (e.clientY - ly) * 0.004 * SET.sens / 100));
  } else {
    camYaw -= (e.clientX - lx) * 0.005 * SET.sens / 100;
    camPitch = Math.min(1.2, Math.max(-0.2, camPitch + (e.clientY - ly) * 0.004 * SET.sens / 100));
  }
  lx = e.clientX; ly = e.clientY;
});
addEventListener('pointerup', () => dragging = false);
canvas.addEventListener('wheel', e => { camDist = Math.min(14, Math.max(4, camDist + e.deltaY * 0.01)); }, { passive: true });
canvas.addEventListener('contextmenu', e => { if (mode === 'editor') { e.preventDefault(); edDeleteAt(e); } });

// touch joystick
const joy = { x: 0, y: 0, id: null };
const stick = document.getElementById('stick'), nub = document.getElementById('stick-nub');
stick.addEventListener('pointerdown', e => { joy.id = e.pointerId; stick.setPointerCapture(e.pointerId); joyMove(e); });
stick.addEventListener('pointermove', e => { if (e.pointerId === joy.id) joyMove(e); });
stick.addEventListener('pointerup', e => { joy.x = joy.y = 0; joy.id = null; nub.style.transform = 'translate(-50%,-50%)'; });
function joyMove(e) {
  const r = stick.getBoundingClientRect();
  let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
  let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
  joy.x = dx; joy.y = dy;
  nub.style.transform = `translate(calc(-50% + ${dx * 36}px), calc(-50% + ${dy * 36}px))`;
}
document.getElementById('t-jump').addEventListener('pointerdown', e => { e.preventDefault(); tryJump(); });
document.getElementById('t-shape').addEventListener('pointerdown', e => { e.preventDefault(); tryReshape(); });
if ('ontouchstart' in window) document.getElementById('touch').classList.remove('hidden');

// ================= actions =================
function tryJump() {
  if (mode !== 'play' && mode !== 'playtest') return;
  if (!playing || dead) return;
  if (player.onGround || player.jumps < 2) {
    player.vel.y = 11.5;
    player.onGround = false; player.jumps++;
    player.squash = -0.35;
    sfx.jump();
  }
}
function nearestClay() {
  let best = null, bd = 5;
  for (const c of clays) {
    const d = Math.hypot(player.pos.x - c.base.x, player.pos.z - c.base.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function tryReshape() {
  if (mode !== 'play' && mode !== 'playtest') return;
  if (!playing || dead) return;
  const c = nearestClay();
  if (c) {
    c.shape = (c.shape + 1) % 3;
    rebuildClay(c, true);
    toast(`Clay reshaped → ${CLAY_SHAPES[c.shape]}`);
  }
}
function die(silent = false) {
  if (dead || !playing) return;
  dead = true;
  sfx.hurt();
  toast('Ouch! Back to the flag…');
  setTimeout(() => respawn(spawnPt), 650);
}

// ================= physics =================
function collideAxis(axis) {
  const min = new THREE.Vector3(player.pos.x - PW, player.pos.y, player.pos.z - PW);
  const max = new THREE.Vector3(player.pos.x + PW, player.pos.y + PH, player.pos.z + PW);
  for (const c of colliders) {
    if (c.ramp) continue;
    if (max.x > c.min.x && min.x < c.max.x && max.y > c.min.y && min.y < c.max.y && max.z > c.min.z && min.z < c.max.z) {
      if (axis === 'x') player.pos.x = player.vel.x > 0 ? c.min.x - PW : c.max.x + PW;
      else if (axis === 'z') player.pos.z = player.vel.z > 0 ? c.min.z - PW : c.max.z + PW;
      else {
        if (player.vel.y <= 0 && (player.pos.y >= c.max.y - 1.2)) {
          if (!player.onGround && player.vel.y < -12) { player.squash = 0.4; }
          player.pos.y = c.max.y + 0.02;
          player.vel.y = 0; player.onGround = true; player.jumps = 0; player.coyote = 0.12;
        } else if (player.vel.y > 0) {
          player.pos.y = c.min.y - PH - 0.02; player.vel.y = 0;
        }
      }
      // refresh box after push
      min.set(player.pos.x - PW, player.pos.y, player.pos.z - PW);
      max.set(player.pos.x + PW, player.pos.y + PH, player.pos.z + PW);
    }
  }
}
function onRamp() {
  for (const c of colliders) {
    if (!c.ramp) continue;
    if (player.pos.x > c.x0 - PW && player.pos.x < c.x1 + PW && player.pos.z > c.z0 - PW && player.pos.z < c.z1 + PW) {
      const h = rampHeight(c, player.pos.x);
      if (player.pos.y <= h + 0.35 && player.pos.y >= h - 1.6 && player.vel.y <= 0.1) return h;
    }
  }
  return null;
}
function stepPhysics(dt) {
  // input dir (camera relative)
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz -= 1;
  if (keys.KeyS || keys.ArrowDown) iz += 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  ix += joy.x; iz += joy.y;
  const m = Math.hypot(ix, iz);
  if (m > 1) { ix /= m; iz /= m; }
  const s = Math.sin(camYaw), co = Math.cos(camYaw);
  const wx = ix * co - iz * s, wz = -ix * s - iz * co;
  // note: forward (-z input) maps away from camera
  const SPEED = 8;
  const accel = player.onGround ? 14 : 8;
  player.vel.x += (wx * SPEED - player.vel.x) * Math.min(1, accel * dt);
  player.vel.z += (wz * SPEED - player.vel.z) * Math.min(1, accel * dt);
  player.vel.y -= 30 * dt;
  if (player.vel.y < -26) player.vel.y = -26;

  player.onGround = false;
  player.pos.x += player.vel.x * dt; collideAxis('x');
  player.pos.z += player.vel.z * dt; collideAxis('z');
  player.pos.y += player.vel.y * dt; collideAxis('y');
  const rh = onRamp();
  if (rh !== null) {
    player.pos.y = rh + 0.02; player.vel.y = 0;
    if (!player.onGround && player.jumps > 0) player.squash = 0.25;
    player.onGround = true; player.jumps = 0;
  }
  if (player.onGround) player.coyote = 0.12; else player.coyote -= dt;
  if (Math.hypot(player.vel.x, player.vel.z) > 0.5) {
    player.face = Math.atan2(player.vel.x, player.vel.z);
    player.walk += dt * Math.hypot(player.vel.x, player.vel.z) * 1.6;
  }
  if (player.pos.y < -25) die();
  // hazards
  for (const h of hazards) {
    if (Math.abs(player.pos.x - h.x) < 1 && player.pos.y < h.y + 1 && player.pos.y + PH > h.y && Math.abs(player.pos.z - h.z) < 1) { die(); break; }
  }
  // pickups
  for (const p of pickups) {
    if (p.taken) continue;
    const d = Math.hypot(player.pos.x - p.x, (player.pos.y + 1 - p.y), player.pos.z - p.z);
    if (d < (p.kind === 'bead' ? 1.4 : 1.8)) {
      p.taken = true; p.mesh.visible = false;
      if (p.kind === 'bead') { gotBeads++; sfx.bead(); }
      else { gotFlowers.push(p); sfx.flower(); toast('🌸 Secret flower found!'); }
      updateHUD();
    }
  }
  // flags
  for (const f of flags) {
    if (f.hit) continue;
    if (Math.hypot(player.pos.x - f.x, player.pos.z - f.z) < 2.2 && Math.abs(player.pos.y - f.y) < 3) {
      f.hit = true;
      f.mesh.userData.flag.material = clayMat(0x57b24a);
      spawnPt = { x: f.x, y: f.y + 0.5, z: f.z };
      sfx.check(); toast('🚩 Checkpoint!');
    }
  }
  // goal
  if (goalPt && Math.hypot(player.pos.x - goalPt.x, player.pos.z - goalPt.z) < 2.6 && Math.abs(player.pos.y - goalPt.y) < 4) {
    completeLevel();
  }
}

// ================= stop-motion character pose =================
let tickAcc = 0, tickPose = 0;
function animateKid(dt, t) {
  kid.position.copy(player.pos);
  player.squash += (0 - player.squash) * Math.min(1, 6 * dt);
  tickAcc += dt;
  const tickLen = 1 / SET.fps;
  if (tickAcc >= tickLen) {
    tickAcc = 0; tickPose++;
    const u = kid.userData;
    const run = Math.min(1, Math.hypot(player.vel.x, player.vel.z) / 8);
    const sw = Math.sin(player.walk) * 0.75 * run;
    // quantized stop-motion swing
    const q = (v) => Math.round(v * 3) / 3;
    u.legL.rotation.x = q(sw); u.legR.rotation.x = q(-sw);
    u.armL.rotation.x = q(-sw * 0.9); u.armR.rotation.x = q(sw * 0.9);
    if (!player.onGround) { u.legL.rotation.x = 0.5; u.legR.rotation.x = -0.4; u.armL.rotation.x = -2.6; u.armR.rotation.x = -2.6; }
    if (SET.wobble) {
      kid.rotation.y = player.face + (Math.random() - 0.5) * 0.06;
      u.head.rotation.z = (Math.random() - 0.5) * 0.08;
      u.body.rotation.z = (Math.random() - 0.5) * 0.05;
    } else { kid.rotation.y = player.face; }
  }
  const sq = 1 + player.squash * 0.25;
  kid.scale.set(2 - sq > 0 ? 1 - player.squash * 0.15 : 1, sq, 1 - player.squash * 0.15);
  // clay squish anim
  for (const c of clays) {
    if (c.squish > 0) {
      c.squish = Math.max(0, c.squish - dt * 3);
      const s = 1 + Math.sin(c.squish * Math.PI) * 0.25;
      c.holder.scale.set(s, 1 / s, s);
    }
    c.glowBase.userData.ring.rotation.z += dt * 0.8;
  }
  // idle anims
  const tt = performance.now() * 0.001;
  for (const p of pickups) {
    if (p.taken) continue;
    p.mesh.rotation.y = Math.round(tt * 2.2 * 3) / 3 + (SET.wobble ? (Math.random() - 0.5) * 0.03 : 0);
    p.mesh.position.y = p.y + Math.sin(tt * 2.4 + p.x) * 0.15;
  }
  if (goalPt) goalPt.mesh.userData.orb.position.y = 3.5 + Math.sin(tt * 2) * 0.2;
}

// ================= camera =================
function updateCamera(dt) {
  const tx = player.pos.x, ty = player.pos.y + 2.1, tz = player.pos.z;
  // camera sits behind the direction W walks toward: W moves along (sin yaw, cos yaw)
  const cx = tx - Math.sin(camYaw) * Math.cos(camPitch) * camDist;
  const cz = tz - Math.cos(camYaw) * Math.cos(camPitch) * camDist;
  const cy = ty + Math.sin(camPitch) * camDist;
  // camera collision: keep above ground colliders roughly
  camera.position.lerp(new THREE.Vector3(cx, Math.max(cy, ty - 1), cz), Math.min(1, 10 * dt));
  camera.lookAt(tx, ty, tz);
  sun.target.position.set(player.pos.x, 0, player.pos.z);
  sun.position.set(player.pos.x + 20, 35, player.pos.z + 12);
}

// ================= UI helpers =================
const $ = id => document.getElementById(id);
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
function hideAllScreens() { ['screen-title', 'screen-chapters', 'screen-settings', 'screen-pause', 'screen-done', 'screen-help'].forEach(hide); }
function isMenuOpen() { return ['screen-title', 'screen-chapters', 'screen-settings', 'screen-pause', 'screen-done', 'screen-help'].some(id => !$(id).classList.contains('hidden')); }
let toastT = null;
function toast(msg, ms = 2200) {
  const el = $('toast'); el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.add('hidden'), ms);
}
function fmtTime(s) { const m = Math.floor(s / 60), ss = Math.floor(s % 60); return `${m}:${String(ss).padStart(2, '0')}`; }
function updateHUD() {
  $('hud-beads').textContent = `${gotBeads}/${totalBeads}`;
  $('hud-flowers').textContent = `${gotFlowers.length}`;
  $('hud-chapter').textContent = levelDef.name;
}

// ================= flow =================
function startLevel(idx, custom = null) {
  levelIndex = idx;
  levelDef = custom || LEVELS[idx];
  buildLevel(levelDef);
  hideAllScreens(); hide('editorbar');
  show('hud'); kid.visible = true;
  mode = custom && custom.workshop ? 'playtest' : 'play';
  if (mode === 'playtest') show('editorbar');
  playing = true;
  camYaw = Math.PI / 2; camPitch = 0.32;
  updateHUD();
  toast(`${levelDef.emoji || '🌍'} ${levelDef.name} — reach the golden arch!`);
  sfx.click();
}
function pauseGame() {
  if (mode !== 'play' && mode !== 'playtest') return;
  playing = false; hideAllScreens(); show('screen-pause');
}
function resumeGame() {
  if (mode !== 'play' && mode !== 'playtest') return;
  hideAllScreens(); playing = true; sfx.click();
}
function completeLevel() {
  if (!playing) return;
  playing = false;
  sfx.win();
  const id = levelDef.workshop ? 'workshop' : levelIndex;
  const prevBeads = PROG.beads[id] || 0;
  PROG.beads[id] = Math.max(prevBeads, gotBeads);
  for (const f of gotFlowers) PROG.flowers[`${id}@${f.x},${f.z}`] = true;
  if (!PROG.best[id] || playTime < PROG.best[id]) PROG.best[id] = Math.round(playTime);
  if (!levelDef.workshop) PROG.unlocked = Math.max(PROG.unlocked, Math.min(3, levelIndex + 1));
  saveProg();
  $('done-stats').textContent = `🔮 ${gotBeads}/${totalBeads} beads · ⏱ ${fmtTime(playTime)}`;
  $('done-flowers').textContent = gotFlowers.length ? `🌸 You found ${gotFlowers.length} secret flower(s)!` : '🌸 No secret flowers this time…';
  $('d-next').style.display = (!levelDef.workshop && levelIndex < 3) ? '' : 'none';
  hideAllScreens(); show('screen-done');
}
function flowerCount(id) { return Object.keys(PROG.flowers).filter(k => k.startsWith(id + '@')).length; }

// chapters menu
function renderChapters() {
  const grid = $('chapter-grid'); grid.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const locked = i > PROG.unlocked;
    const d = document.createElement('div');
    d.className = 'ch-card' + (locked ? ' locked' : '');
    const tot = L.items.filter(x => x.k === 'bead').length;
    d.innerHTML = `<div class="emoji">${locked ? '🔒' : L.emoji}</div><h3>${i + 1} · ${L.name}</h3><p>${L.sub}</p><p class="stars">🔮 ${PROG.beads[i] || 0}/${tot} · 🌸 ${flowerCount(i)} · ⏱ ${PROG.best[i] ? fmtTime(PROG.best[i]) : '—'}</p>`;
    if (!locked) d.onclick = () => { sfx.click(); startLevel(i); };
    grid.appendChild(d);
  });
  // workshop slot
  let ws = null;
  try { ws = JSON.parse(localStorage.getItem('claybound-workshop') || 'null'); } catch (e) {}
  const w = document.createElement('div');
  w.className = 'ch-card workshop';
  if (ws && ws.items.length) {
    w.innerHTML = `<div class="emoji">🧱</div><h3>Workshop</h3><p>${ws.items.length} pieces · by you!</p><p class="stars">🔮 ${PROG.beads.workshop || 0} · playtest your build</p>`;
    w.onclick = () => { sfx.click(); startLevel(-1, workshopDef()); };
  } else {
    w.innerHTML = `<div class="emoji">🧱</div><h3>Workshop</h3><p>No saved build yet — open the Level Editor!</p>`;
    w.onclick = () => { sfx.click(); enterEditor(); };
  }
  grid.appendChild(w);
}
function workshopDef() {
  const ws = JSON.parse(localStorage.getItem('claybound-workshop') || '{"items":[],"spawn":{"x":0,"y":4,"z":0}}');
  return {
    workshop: true, name: 'Workshop Playtest', emoji: '🧱',
    sky: 0xbfe3ff, fog: 0x9fc8e8, fogNear: 45, fogFar: 180, ground: 0x8fbf6f,
    hemi: [0xe8f4ff, 0x4a6a3a, 1.0], sun: [0xffffff, 1.3],
    deco: 'workshop', spawn: ws.spawn, items: ws.items,
  };
}

// ================= editor =================
let edItems = [], edSpawn = { x: 0, y: 4, z: 0 }, edTool = 'solid';
let edYaw = 0.8, edPitch = 0.55, edDist = 30;
const ED_TOOLS = [['solid', '🟧 solid'], ['clay', '🟪 clay'], ['bead', '🔮 bead'], ['flower', '🌸 flower'], ['spike', '🔺 spike'], ['flag', '🚩 flag'], ['goal', '🏁 goal'], ['spawn', '📍 spawn'], ['orbit', '🎥 orbit']];
function enterEditor() {
  hideAllScreens(); hide('hud'); $('touch').classList.add('hidden');
  show('editorbar');
  const pal = $('palette'); pal.innerHTML = '';
  ED_TOOLS.forEach(([k, label]) => {
    const b = document.createElement('button');
    b.textContent = label; b.dataset.tool = k;
    if (k === edTool) b.classList.add('sel');
    b.onclick = () => { edTool = k; pal.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x.dataset.tool === k)); sfx.click(); };
    pal.appendChild(b);
  });
  try {
    const ws = JSON.parse(localStorage.getItem('claybound-workshop') || 'null');
    if (ws) { edItems = ws.items; edSpawn = ws.spawn; }
  } catch (e) {}
  mode = 'editor';
  rebuildEditorWorld();
  kid.visible = false;
  toast('🧱 Editor: pick a piece, click the ground to build');
}
function editorDef() {
  return {
    workshop: true, name: 'Editor', emoji: '🧱',
    sky: 0xbfe3ff, fog: 0x9fc8e8, fogNear: 45, fogFar: 200, ground: 0x8fbf6f,
    hemi: [0xe8f4ff, 0x4a6a3a, 1.0], sun: [0xffffff, 1.3],
    deco: 'workshop', spawn: edSpawn,
    items: [...edItems, { k: 'box', x: 0, y: -1.2, z: 0, w: 80, h: 1, d: 80, c: 0x8fbf6f }],
  };
}
function rebuildEditorWorld() {
  levelDef = editorDef();
  buildLevel(levelDef);
  playing = false;
}
const ray = new THREE.Raycaster();
function groundPoint(e) {
  const r = canvas.getBoundingClientRect();
  const nd = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(nd, camera);
  const h = parseFloat($('ed-h').value);
  const t = (h - ray.ray.origin.y) / ray.ray.direction.y;
  if (!isFinite(t) || t < 0) return null;
  const p = ray.ray.origin.clone().add(ray.ray.direction.clone().multiplyScalar(t));
  return { x: Math.round(p.x * 2) / 2, y: h, z: Math.round(p.z * 2) / 2 };
}
function edClick(e) {
  if (e.button === 2) return;
  if (edTool === 'orbit') { dragging = true; lx = e.clientX; ly = e.clientY; return; }
  const p = groundPoint(e);
  if (!p) return;
  if (edTool === 'spawn') { edSpawn = { x: p.x, y: p.y + 2, z: p.z }; rebuildEditorWorld(); sfx.place(); return; }
  const map = { solid: { k: 'box', ...p, w: 4, h: 1.5, d: 4, c: 0xd9793c }, clay: { k: 'clay', ...p, shape: 0 }, bead: { k: 'bead', ...p, y: p.y + 1.5 }, flower: { k: 'flower', ...p }, spike: { k: 'spike', ...p }, flag: { k: 'flag', ...p }, goal: { k: 'goal', ...p } };
  edItems.push(map[edTool]);
  sfx.place();
  rebuildEditorWorld();
}
function edDelete() {
  edItems.pop(); rebuildEditorWorld();
}
function edDeleteAt(e) {
  const p = groundPoint(e);
  if (!p) return;
  let bi = -1, bd = 2.5;
  edItems.forEach((it, i) => {
    const d = Math.hypot(it.x - p.x, it.z - p.z);
    if (d < bd) { bd = d; bi = i; }
  });
  if (bi >= 0) { edItems.splice(bi, 1); rebuildEditorWorld(); sfx.click(); }
}
$('ed-playtest').onclick = () => {
  hideAllScreens(); show('hud'); $('ed-stop').classList.remove('hidden'); $('ed-playtest').classList.add('hidden');
  if ('ontouchstart' in window) $('touch').classList.remove('hidden');
  mode = 'playtest';
  levelDef = { ...editorDef(), name: 'Workshop Playtest' };
  buildLevel(levelDef);
  kid.visible = true; playing = true; updateHUD();
  toast('▶ Playtesting — finish or press ⏹ to keep editing');
};
$('ed-stop').onclick = () => {
  $('ed-stop').classList.add('hidden'); $('ed-playtest').classList.remove('hidden');
  hide('hud'); mode = 'editor'; rebuildEditorWorld(); kid.visible = false;
};
$('ed-save').onclick = () => {
  localStorage.setItem('claybound-workshop', JSON.stringify({ items: edItems, spawn: edSpawn }));
  sfx.check(); toast('💾 Workshop build saved!');
};
$('ed-clear').onclick = () => { if (confirm('Clear the whole build?')) { edItems = []; rebuildEditorWorld(); } };
$('ed-exit').onclick = () => {
  hide('editorbar'); $('ed-stop').classList.add('hidden'); $('ed-playtest').classList.remove('hidden');
  if (!('ontouchstart' in window)) $('touch').classList.add('hidden');
  toTitle();
};

// ================= menu wiring =================
function toTitle() {
  mode = 'title'; playing = false; kid.visible = false;
  hideAllScreens(); hide('hud'); hide('editorbar');
  show('screen-title');
  levelDef = LEVELS[0]; buildLevel(levelDef); // scenic backdrop
}
$('m-play').onclick = () => { sfx.click(); startLevel(Math.min(3, PROG.unlocked)); };
$('m-chapters').onclick = () => { sfx.click(); renderChapters(); hideAllScreens(); show('screen-chapters'); };
$('m-editor').onclick = () => { sfx.click(); enterEditor(); };
$('m-settings').onclick = () => { sfx.click(); syncSettingsUI(); hideAllScreens(); show('screen-settings'); };
$('m-help').onclick = () => { sfx.click(); hideAllScreens(); show('screen-help'); };
$('ch-back').onclick = () => { sfx.click(); hideAllScreens(); show(mode === 'play' || mode === 'playtest' ? 'screen-pause' : 'screen-title'); if (mode === 'title') show('screen-title'); };
$('h-back').onclick = () => { sfx.click(); hideAllScreens(); show('screen-title'); };
$('s-back').onclick = () => { sfx.click(); saveSet(); hideAllScreens(); show(mode === 'play' || mode === 'playtest' ? 'screen-pause' : 'screen-title'); };
$('s-reset').onclick = () => { if (confirm('Reset all progress?')) { PROG = JSON.parse(JSON.stringify(DEF_PROG)); saveProg(); toast('Progress reset'); } };
$('p-resume').onclick = resumeGame;
$('p-restart').onclick = () => { sfx.click(); hideAllScreens(); playing = true; buildLevel(levelDef); kid.visible = true; updateHUD(); };
$('p-chapters').onclick = () => { renderChapters(); hideAllScreens(); show('screen-chapters'); };
$('p-editor').onclick = () => { hideAllScreens(); enterEditor(); };
$('p-quit').onclick = () => toTitle();
$('d-replay').onclick = () => { sfx.click(); startLevel(levelIndex, levelDef.workshop ? levelDef : null); };
$('d-next').onclick = () => { sfx.click(); startLevel(Math.min(3, levelIndex + 1)); };
$('d-chapters').onclick = () => { renderChapters(); hideAllScreens(); show('screen-chapters'); };
$('btn-pause').onclick = pauseGame;
$('btn-shape').onclick = tryReshape;
function syncSettingsUI() {
  $('s-fps').value = SET.fps; $('s-fps-v').textContent = SET.fps + ' fps';
  $('s-sen').value = SET.sens; $('s-sen-v').textContent = SET.sens + '%';
  $('s-wobble').checked = SET.wobble; $('s-sound').checked = SET.sound; $('s-shadow').checked = SET.shadow;
}
$('s-fps').oninput = e => { SET.fps = +e.target.value; $('s-fps-v').textContent = SET.fps + ' fps'; saveSet(); };
$('s-sen').oninput = e => { SET.sens = +e.target.value; $('s-sen-v').textContent = SET.sens + '%'; saveSet(); };
$('s-wobble').onchange = e => { SET.wobble = e.target.checked; saveSet(); };
$('s-sound').onchange = e => { SET.sound = e.target.checked; setSoundEnabled(SET.sound); saveSet(); };
$('s-shadow').onchange = e => { SET.shadow = e.target.checked; renderer.shadowMap.enabled = SET.shadow; sun.castShadow = SET.shadow; saveSet(); };

// ================= main loop =================
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  if ((mode === 'play' || mode === 'playtest') && playing && !dead) {
    playTime += dt;
    stepPhysics(dt);
    // reshape prompt
    const nc = nearestClay();
    $('prompt').classList.toggle('hidden', !nc);
    if (nc) $('prompt').innerHTML = `Press <b>E</b> to reshape ${CLAY_SHAPES[nc.shape]} → ${CLAY_SHAPES[(nc.shape + 1) % 3]}`;
    $('hud-time').textContent = fmtTime(playTime);
    animateKid(dt, t);
    updateCamera(dt);
  } else if (mode === 'title') {
    menuT += dt;
    // scenic orbit around canyon start
    const cx = 8 + Math.sin(menuT * 0.12) * 16;
    camera.position.lerp(new THREE.Vector3(cx, 10, 16), Math.min(1, 2 * dt));
    camera.lookAt(20, 2, 0);
    for (const p of pickups) {
      if (p.taken) continue;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = p.y + Math.sin(t * 2.4 + p.x) * 0.15;
    }
    if (goalPt) goalPt.mesh.userData.orb.position.y = 3.5 + Math.sin(t * 2) * 0.2;
  } else if (mode === 'editor') {
    const cx = 20 + Math.sin(edYaw) * Math.cos(edPitch) * edDist;
    const cz = Math.cos(edYaw) * Math.cos(edPitch) * edDist;
    camera.position.lerp(new THREE.Vector3(cx, Math.sin(edPitch) * edDist + 2, cz), Math.min(1, 6 * dt));
    camera.lookAt(20, 0, 0);
    sun.target.position.set(20, 0, 0);
    sun.position.set(40, 35, 12);
    for (const p of pickups) {
      if (p.taken) continue;
      p.mesh.rotation.y += dt * 2;
    }
  } else if ((mode === 'play' || mode === 'playtest') && !playing) {
    // paused / done / dead: keep rendering, gentle camera
    updateCamera(dt);
  }
  renderer.render(scene, camera);
}

syncSettingsUI();
toTitle();
loop();

// tiny debug/testing handle (used by automated smoke tests)
window.__game = {
  get mode() { return mode; }, get beads() { return [gotBeads, totalBeads]; },
  get pos() { return { x: player.pos.x, y: player.pos.y, z: player.pos.z }; },
  get clays() { return clays.map(c => c.shape); },
  teleport(x, y, z) { player.pos.set(x, y, z); player.vel.set(0, 0, 0); },
  reshape: tryReshape, jump: tryJump,
  start: startLevel, editor: enterEditor,
  edPlace(tool, x, y, z) {
    const map = {
      solid: { k: 'box', x, y, z, w: 4, h: 1.5, d: 4, c: 0xd9793c },
      clay: { k: 'clay', x, y, z, shape: 0 },
      bead: { k: 'bead', x, y: y + 1.5, z }, flower: { k: 'flower', x, y, z },
      spike: { k: 'spike', x, y, z }, flag: { k: 'flag', x, y, z }, goal: { k: 'goal', x, y, z },
    };
    if (tool === 'spawn') { edSpawn = { x, y: y + 2, z }; }
    else if (map[tool]) edItems.push(map[tool]);
    rebuildEditorWorld();
  },
  get edCount() { return edItems.length; },
  dbg(name, v) {
    if (name === 'shadow') { renderer.shadowMap.enabled = v; sun.castShadow = v; }
    if (name === 'grid') { world.traverse(o => { if (o.isGridHelper || (o.type === 'GridHelper')) o.visible = v; }); }
    if (name === 'hemi') { hemi.intensity = v; }
    if (name === 'sun') { sun.intensity = v; }
    return 'ok';
  },
};
