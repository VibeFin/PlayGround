import * as THREE from 'three';

/* ============================================================
   QUAKE LIVE — POCKET ARENA
   Quake-style arena FPS for phone/tablet + desktop.
   Touch: left stick move, drag-right look, fire/jump/weapon btns.
   Desktop: WASD + pointer-lock mouse, click fire, space jump.
   ============================================================ */

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

const settings = {
  sens: parseFloat(localStorage.getItem('ql_sens') || '1'),
  quality: localStorage.getItem('ql_quality') || 'auto', // auto | high | low
  sound: localStorage.getItem('ql_sound') !== 'off',
};
$('opt-sens').value = String(settings.sens);

/* ---------------- Audio (procedural, no assets) ---------------- */
let AC = null;
function audio() {
  if (!settings.sound) return null;
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(freq, dur, type = 'square', vol = 0.12, slide = 0) {
  const ac = audio(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, ac.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), ac.currentTime + dur);
  g.gain.setValueAtTime(vol, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
}
function noiseBurst(dur = 0.4, vol = 0.25, lowpass = 1200) {
  const ac = audio(); if (!ac) return;
  const n = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ac.createBufferSource(); src.buffer = buf;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass;
  const g = ac.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(ac.destination); src.start();
}
const sfx = {
  nail: () => tone(880 + Math.random() * 200, 0.07, 'square', 0.06, -400),
  rocketFire: () => { noiseBurst(0.35, 0.2, 900); tone(120, 0.3, 'sawtooth', 0.1, -60); },
  boom: () => { noiseBurst(0.6, 0.35, 700); tone(70, 0.5, 'sine', 0.25, -40); },
  hit: () => tone(2200, 0.05, 'square', 0.05),
  hurt: () => tone(160, 0.18, 'sawtooth', 0.16, -80),
  pickup: () => { tone(660, 0.08, 'square', 0.08); setTimeout(() => tone(990, 0.1, 'square', 0.08), 70); },
  jump: () => tone(300, 0.09, 'sine', 0.05, 150),
  frag: () => { tone(523, 0.1, 'square', 0.1); setTimeout(() => tone(784, 0.14, 'square', 0.1), 90); },
  enemyDie: () => tone(400, 0.25, 'sawtooth', 0.1, -300),
  empty: () => tone(200, 0.06, 'square', 0.06),
  ui: () => tone(700, 0.06, 'square', 0.07),
};

/* ---------------- Renderer / scene ---------------- */
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_TOUCH, powerPreference: 'high-performance' });
let lowQ = settings.quality === 'low' || (settings.quality === 'auto' && (IS_TOUCH || Math.min(screen.width, screen.height) < 500));
function applyQuality() {
  renderer.setPixelRatio(lowQ ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
}
applyQuality();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0218);
scene.fog = new THREE.Fog(0x0d0218, 18, 95);

const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.08, 220);
camera.rotation.order = 'YXZ';

scene.add(new THREE.HemisphereLight(0x9a6cff, 0x2a1808, 1.6));
scene.add(new THREE.AmbientLight(0x50407a, 1.0));
const sun = new THREE.DirectionalLight(0xff9a5c, 1.5);
sun.position.set(30, 46, 12);
scene.add(sun);
const lavaGlow = new THREE.PointLight(0xff4400, 60, 40, 1.8);
lavaGlow.position.set(0, 3, 0);
scene.add(lavaGlow);

/* ---------------- Arena construction ---------------- */
const ARENA = 30; // half-size
const colliders = []; // {x0,x1,z0,z1, tall}
function addCollider(x0, x1, z0, z1, tall = true) { colliders.push({ x0, x1, z0, z1, tall }); }

const stoneMat = new THREE.MeshLambertMaterial({ color: 0x5d5680 });
const darkStone = new THREE.MeshLambertMaterial({ color: 0x3d3858 });
const trimMat = new THREE.MeshBasicMaterial({ color: 0xd6ff3f });
const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
const runeMat = new THREE.MeshBasicMaterial({ color: 0xff3fd6 });

function box(w, h, d, mat, x, y, z, collide = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  scene.add(m);
  if (collide) addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
  return m;
}

(function buildArena() {
  // floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2 + 8, ARENA * 2 + 8, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0x4d4970 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  // floor grid glow strips
  for (let i = -2; i <= 2; i++) {
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.02, ARENA * 2), trimMat);
    s1.position.set(i * 12, 0.02, 0); scene.add(s1);
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(ARENA * 2, 0.02, 0.25), trimMat);
    s2.position.set(0, 0.02, i * 12); scene.add(s2);
  }
  // outer walls
  const H = 9;
  box(ARENA * 2 + 4, H, 2, stoneMat, 0, H / 2, -ARENA - 1);
  box(ARENA * 2 + 4, H, 2, stoneMat, 0, H / 2, ARENA + 1);
  box(2, H, ARENA * 2 + 4, stoneMat, -ARENA - 1, H / 2, 0);
  box(2, H, ARENA * 2 + 4, stoneMat, ARENA + 1, H / 2, 0);
  // wall torch flames (emissive sprites)
  const flameGeo = new THREE.SphereGeometry(0.35, 8, 8);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
  [[-ARENA + 2, -ARENA], [ARENA - 2, -ARENA], [-ARENA + 2, ARENA], [ARENA - 2, ARENA]].forEach(([x, z]) => {
    const f = new THREE.Mesh(flameGeo, flameMat); f.position.set(x, 5.4, z > 0 ? z - 1.4 : z + 1.4); scene.add(f);
  });
  const tl1 = new THREE.PointLight(0xff8830, 40, 42, 1.9); tl1.position.set(0, 6, -ARENA + 3); scene.add(tl1);
  const tl2 = new THREE.PointLight(0xff8830, 40, 42, 1.9); tl2.position.set(0, 6, ARENA - 3); scene.add(tl2);

  // four corner pillars
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(3, 8, 3, darkStone, sx * 18, 4, sz * 18);
    const cap = box(3.6, 0.5, 3.6, stoneMat, sx * 18, 8.2, sz * 18, false);
    cap.material = stoneMat;
    const rune = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.3, 3.1), runeMat);
    rune.position.set(sx * 18, 6.5, sz * 18); scene.add(rune);
  }
  // mid pillars (cover)
  box(2.4, 5.5, 2.4, stoneMat, -9, 2.75, 0);
  box(2.4, 5.5, 2.4, stoneMat, 9, 2.75, 0);
  box(2.4, 5.5, 2.4, stoneMat, 0, 2.75, -9);
  box(2.4, 5.5, 2.4, stoneMat, 0, 2.75, 9);
  // side platforms with ramps (jump-up blocks)
  box(8, 2.2, 8, darkStone, -22, 1.1, 0);
  box(8, 2.2, 8, darkStone, 22, 1.1, 0);
  box(4, 1.1, 4, stoneMat, -16.5, 0.55, 0);
  box(4, 1.1, 4, stoneMat, 16.5, 0.55, 0);

  // central lava pit (damaging)
  const pit = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), lavaMat);
  pit.rotation.x = -Math.PI / 2; pit.position.y = 0.03; scene.add(pit);
  const rimMat = new THREE.MeshLambertMaterial({ color: 0x1c1830 });
  box(11, 0.5, 0.7, rimMat, 0, 0.25, -5.3, false);
  box(11, 0.5, 0.7, rimMat, 0, 0.25, 5.3, false);
  box(0.7, 0.5, 11, rimMat, -5.3, 0.25, 0, false);
  box(0.7, 0.5, 11, rimMat, 5.3, 0.25, 0, false);
  // lava crust chunks (visual only)
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(rand(0.6, 1.6), 0.12, rand(0.6, 1.6)), rimMat);
    c.position.set(rand(-4.4, 4.4), 0.08, rand(-4.4, 4.4)); c.rotation.y = rand(0, 3); scene.add(c);
  }
  // sky silhouettes
  const spireMat = new THREE.MeshBasicMaterial({ color: 0x150a2e });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const h = rand(18, 42);
    const s = new THREE.Mesh(new THREE.ConeGeometry(rand(4, 8), h, 4), spireMat);
    s.position.set(Math.cos(a) * rand(70, 110), h / 2 - 4, Math.sin(a) * rand(70, 110));
    scene.add(s);
  }
  // moon
  const moon = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 16), new THREE.MeshBasicMaterial({ color: 0xe8d8ff }));
  moon.position.set(-60, 55, -80); scene.add(moon);
})();

function inLava(x, z) { return Math.abs(x) < 5 && Math.abs(z) < 5; }

/* ---------------- Collision ---------------- */
const PR = 0.55; // player radius
function collideXZ(pos, yFeet, height) {
  for (const c of colliders) {
    if (yFeet + height < 0.4 || yFeet > 8.4) continue;
    const nx = clamp(pos.x, c.x0, c.x1), nz = clamp(pos.z, c.z0, c.z1);
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < PR * PR) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), push = (PR - d) / d;
        pos.x += dx * push; pos.z += dz * push;
      } else {
        // inside: push out along smallest penetration axis
        const pl = pos.x - c.x0, pr = c.x1 - pos.x, pt = pos.z - c.z0, pb = c.z1 - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.x0 - PR; else if (m === pr) pos.x = c.x1 + PR;
        else if (m === pt) pos.z = c.z0 - PR; else pos.z = c.z1 + PR;
      }
    }
  }
  pos.x = clamp(pos.x, -ARENA + PR, ARENA - PR);
  pos.z = clamp(pos.z, -ARENA + PR, ARENA - PR);
}
function groundHeightAt(x, z) {
  if (Math.abs(x - -22) < 4 && Math.abs(z - 0) < 4) return 2.2;
  if (Math.abs(x - 22) < 4 && Math.abs(z - 0) < 4) return 2.2;
  if (Math.abs(x - -16.5) < 2 && Math.abs(z - 0) < 2) return 1.1;
  if (Math.abs(x - 16.5) < 2 && Math.abs(z - 0) < 2) return 1.1;
  return 0;
}

/* ---------------- Weapon viewmodel ---------------- */
const gun = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.52),
    new THREE.MeshLambertMaterial({ color: 0x70779a, emissive: 0x222233 }));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8),
    new THREE.MeshLambertMaterial({ color: 0x9aa0c0, emissive: 0x111122 }));
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.4);
  const glowStrip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.32), runeMat);
  glowStrip.position.set(0, -0.05, -0.15);
  gun.add(body, barrel, glowStrip);
  gun.scale.setScalar(0.55);
  gun.position.set(0.26, -0.24, -0.6);
}
camera.add(gun);
scene.add(camera);
const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0 }));
muzzle.position.set(0.32, -0.24, -1.3);
camera.add(muzzle);
let muzzleT = 0, gunKick = 0, gunBob = 0;

/* ---------------- Tracers / particles / rockets ---------------- */
const tracers = [];
function spawnTracer(from, to, color = 0xd6ff3f) {
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 }));
  scene.add(l); tracers.push({ mesh: l, t: 0.09 });
}
const gibs = [];
const gibGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
function spawnGibs(p, color, n = 14, speed = 7) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(gibGeo, new THREE.MeshBasicMaterial({ color }));
    m.position.copy(p);
    scene.add(m);
    gibs.push({ m, vx: rand(-speed, speed), vy: rand(2, speed + 3), vz: rand(-speed, speed), t: rand(0.5, 1.1) });
  }
}
const rockets = [];
const rocketGeo = new THREE.SphereGeometry(0.22, 10, 10);
const rocketMat = new THREE.MeshBasicMaterial({ color: 0xffcc44 });
function fireRocket(ownerPos, dir, owner) {
  const m = new THREE.Mesh(rocketGeo, rocketMat);
  m.position.copy(ownerPos);
  const glow = new THREE.PointLight(0xff7733, 12, 10, 2);
  m.add(glow);
  scene.add(m);
  rockets.push({ m, vx: dir.x * 24, vy: dir.y * 24, vz: dir.z * 24, life: 4, owner });
  // trail gibs
  rockets[rockets.length - 1].trail = 0;
}
function explode(p, owner) {
  sfx.boom();
  spawnGibs(p, 0xff8830, 22, 10);
  spawnGibs(p, 0x555566, 10, 6);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.9 }));
  flash.position.copy(p); scene.add(flash);
  gibs.push({ m: flash, vx: 0, vy: 0, vz: 0, t: 0.18, grow: true });
  // splash damage
  const R = 4.5;
  const dp = camera.position.distanceTo(p);
  if (owner !== 'player' || true) {
    if (dp < R && player.alive) damagePlayer(Math.round(55 * (1 - dp / R)) + 8, owner);
  }
  for (const b of bots) {
    if (!b.alive || owner === b) continue;
    const d = b.pos.distanceTo(p);
    if (d < R) damageBot(b, Math.round(70 * (1 - d / R)) + 10, 'player');
  }
}

/* ---------------- Player ---------------- */
const EYE = 1.62;
const player = {
  pos: new THREE.Vector3(0, 0, 20), vel: new THREE.Vector3(),
  yaw: Math.PI, pitch: 0, onGround: true,
  hp: 100, armor: 0, alive: true, respawnT: 0, invuln: 0,
  frags: 0, deaths: 0, weapon: 0, rockets: 12, nailCd: 0, rocketCd: 0,
  lavaT: 0,
};
const WEAPONS = [{ name: 'NAILGUN', ammo: () => '∞' }, { name: 'ROCKET', ammo: () => String(player.rockets) }];
const SPAWNS = [
  [0, 20], [0, -20], [-24, -24], [24, 24], [-24, 24], [24, -24], [-22, 0], [22, 0],
];
function respawnPlayer() {
  const s = SPAWNS[(Math.random() * SPAWNS.length) | 0];
  player.pos.set(s[0], 0, s[1]);
  player.pos.y = groundHeightAt(s[0], s[1]);
  player.vel.set(0, 0, 0);
  player.hp = 100; player.armor = 0; player.rockets = 12;
  player.alive = true; player.invuln = 3; // spawn protection
  player.yaw = Math.atan2(player.pos.x, player.pos.z); // face arena center
  player.pitch = 0;
  $('respawn-banner').classList.add('hidden');
}
function damagePlayer(amount, from) {
  if (!player.alive || state !== 'play') return;
  if (player.invuln > 0) return;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, Math.round(amount * 0.6));
    player.armor -= absorbed; amount -= absorbed;
  }
  player.hp -= amount;
  sfx.hurt();
  $('dmg-vignette').style.opacity = clamp(0.35 + amount / 40, 0, 1);
  setTimeout(() => $('dmg-vignette').style.opacity = 0, 140);
  updateHUD();
  if (player.hp <= 0) {
    player.hp = 0; player.alive = false; player.deaths++;
    player.respawnT = 2.5;
    $('respawn-banner').classList.remove('hidden');
    spawnGibs(new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z), 0xaa2222, 18, 8);
    const killer = bots.find(b => b === from);
    feed(`${killer ? killer.name : 'The arena'} fragged YOU`);
    checkScores();
  }
}

/* ---------------- Bots ---------------- */
const BOT_NAMES = ['Vex', 'Gore', 'Hex', 'Ruin', 'Morg', 'Zed'];
const BOT_COLORS = [0xff3b3b, 0x3bff9e, 0x3ba4ff, 0xff9a3b, 0xc44dff, 0xfff23b];
const bots = [];
function makeBotMesh(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1a24 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.5), mat); torso.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), dark); head.position.y = 1.85;
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  eye.position.set(0, 1.88, 0.26);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.7, 0.3), dark); legL.position.set(-0.2, 0.35, 0);
  const legR = legL.clone(); legR.position.x = 0.2;
  const gunM = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.9), dark); gunM.position.set(0.4, 1.2, -0.3);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.03;
  g.add(torso, head, eye, legL, legR, gunM, blob);
  g.userData = { legL, legR };
  return g;
}
function spawnBot(i) {
  const s = SPAWNS[(Math.random() * SPAWNS.length) | 0];
  const mesh = makeBotMesh(BOT_COLORS[i % BOT_COLORS.length]);
  scene.add(mesh);
  const b = {
    name: BOT_NAMES[i % BOT_NAMES.length], mesh,
    pos: new THREE.Vector3(s[0], groundHeightAt(s[0], s[1]), s[1]),
    vel: new THREE.Vector3(), yaw: 0, vy: 0,
    hp: 100, alive: true, respawnT: 0, frags: 0, deaths: 0,
    aiT: 0, wx: 0, wz: 0, shootT: rand(1, 2.5), burst: 0, hopT: rand(1, 3),
  };
  pickWaypoint(b); bots.push(b);
}
function pickWaypoint(b) { b.wx = rand(-ARENA + 4, ARENA - 4); b.wz = rand(-ARENA + 4, ARENA - 4); }
function damageBot(b, amount, from) {
  if (!b.alive || state !== 'play') return;
  b.hp -= amount;
  if (from === 'player') { hitmark(); sfx.hit(); }
  if (b.hp <= 0) {
    b.hp = 0; b.alive = false; b.deaths++; b.respawnT = rand(2, 4);
    spawnGibs(new THREE.Vector3(b.pos.x, b.pos.y + 1.2, b.pos.z), BOT_COLORS[bots.indexOf(b) % BOT_COLORS.length], 20, 8);
    sfx.enemyDie();
    if (from === 'player') {
      player.frags++; sfx.frag();
      feed(`YOU fragged ${b.name}`);
      bannerCheck();
    } else if (from && from !== b) { from.frags++; feed(`${from.name} fragged ${b.name}`); }
    else feed(`${b.name} was fragged`);
    updateHUD(); checkScores();
  }
}
for (let i = 0; i < 5; i++) spawnBot(i);

/* ---------------- Pickups ---------------- */
const pickups = [];
function addPickup(kind, x, z) {
  let color, geo;
  if (kind === 'hp') { color = 0x37ff6e; geo = new THREE.BoxGeometry(0.6, 0.6, 0.6); }
  else if (kind === 'armor') { color = 0x3bc8ff; geo = new THREE.BoxGeometry(0.6, 0.8, 0.3); }
  else if (kind === 'rockets') { color = 0xffb43b; geo = new THREE.BoxGeometry(0.7, 0.4, 0.4); }
  else { color = 0xff3fd6; geo = new THREE.OctahedronGeometry(0.45); }
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  m.position.set(x, 1, z);
  scene.add(m);
  pickups.push({ kind, m, active: true, t: 0, baseY: 1 });
}
addPickup('hp', -9, -14); addPickup('hp', 9, 14); addPickup('hp', 0, -22);
addPickup('armor', -22, 0); addPickup('armor', 22, 0);
addPickup('rockets', -14, 9); addPickup('rockets', 14, -9); addPickup('rockets', 0, 22);
addPickup('mega', 0, -14); addPickup('mega', 0, 14);
function toast(msg, color = '#7dff6a') {
  const t = $('pickup-toast');
  t.textContent = msg; t.style.color = color; t.style.borderColor = color;
  t.classList.remove('hidden');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hidden'), 1400);
}
function checkPickups() {
  for (const p of pickups) {
    if (!p.active || !player.alive) continue;
    const dx = player.pos.x - p.m.position.x, dz = player.pos.z - p.m.position.z;
    if (dx * dx + dz * dz < 1.4 && Math.abs(player.pos.y + 1 - p.m.position.y) < 2) {
      let ok = false;
      if (p.kind === 'hp' && player.hp < 100) { player.hp = Math.min(100, player.hp + 25); toast('+25 HEALTH'); ok = true; }
      else if (p.kind === 'mega') { player.hp = Math.min(200, player.hp + 100); toast('MEGA HEALTH!', '#ff3fd6'); ok = true; }
      else if (p.kind === 'armor') { player.armor = Math.min(200, player.armor + 50); toast('+50 ARMOR', '#5ec8ff'); ok = true; }
      else if (p.kind === 'rockets') { player.rockets = Math.min(50, player.rockets + 8); toast('+8 ROCKETS', '#ffb43b'); ok = true; }
      if (ok) {
        sfx.pickup(); p.active = false; p.t = 15; p.m.visible = false;
        $('heal-flash').style.opacity = 1; setTimeout(() => $('heal-flash').style.opacity = 0, 250);
        updateHUD();
      }
    }
  }
}

/* ---------------- HUD / menus ---------------- */
function updateHUD() {
  $('hp').textContent = Math.max(0, Math.ceil(player.hp));
  $('armor').textContent = Math.ceil(player.armor);
  $('frags').textContent = player.frags;
  $('ammo').textContent = WEAPONS[player.weapon].ammo();
  $('wname').textContent = WEAPONS[player.weapon].name;
  $('stat-hp').classList.toggle('low', player.hp <= 30);
}
function feed(msg) {
  const k = $('killfeed');
  const d = document.createElement('div'); d.textContent = msg;
  k.prepend(d);
  while (k.children.length > 5) k.lastChild.remove();
  setTimeout(() => d.remove(), 6000);
}
function hitmark() {
  const h = $('hitmarker');
  h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop');
}
let lastBanner = 0;
function bannerCheck() {
  const now = performance.now();
  const msgs = { 3: 'RAMPAGE!', 5: 'UNSTOPPABLE!', 8: 'GODLIKE!', 12: 'BEYOND GODLIKE!' };
  const thresholds = Object.keys(msgs).map(Number).sort((a, b) => a - b);
  for (const t of thresholds) {
    if (player.frags >= t && player.frags < t + 1 && now - lastBanner > 2500) {
      lastBanner = now;
      const b = $('center-banner');
      b.textContent = msgs[t]; b.classList.remove('hidden');
      clearTimeout(b._h); b._h = setTimeout(() => b.classList.add('hidden'), 1600);
    }
  }
}
const FRAG_LIMIT = 20, MATCH_LEN = 360;
let matchT = MATCH_LEN, over = false;
function fmtT(s) { s = Math.max(0, Math.ceil(s)); return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; }
function standings() {
  return [{ name: 'YOU', frags: player.frags, me: true },
    ...bots.map(b => ({ name: b.name, frags: b.frags }))].sort((a, b) => b.frags - a.frags);
}
function checkScores() {
  const s = standings();
  const rank = s.findIndex(r => r.me) + 1;
  $('place').textContent = '#' + rank;
  if (!over && (player.frags >= FRAG_LIMIT || s[0].frags >= FRAG_LIMIT)) endMatch(s[0].me ? 'VICTORY!' : `${s[0].name} WINS`);
}
function endMatch(text) {
  over = true;
  const b = $('center-banner');
  b.textContent = text + `\nYOU: ${player.frags} FRAGS`;
  b.classList.remove('hidden');
  tone(392, 0.3, 'square', 0.12); setTimeout(() => tone(523, 0.3, 'square', 0.12), 200);
  setTimeout(() => tone(659, 0.5, 'square', 0.12), 400);
  setTimeout(() => { // reset match
    over = false; matchT = MATCH_LEN; player.frags = 0; player.deaths = 0;
    bots.forEach(x => { x.frags = 0; x.deaths = 0; });
    b.classList.add('hidden'); respawnPlayer();
    bots.forEach(x => { if (!x.alive) { x.hp = 100; x.alive = true; } });
    updateHUD();
  }, 5000);
}
function showScores(show) {
  const sb = $('scoreboard');
  if (show) {
    $('score-rows').innerHTML = standings().map((r, i) =>
      `<div class="srow${r.me ? ' me' : ''}"><span>${i + 1}. ${r.name}</span><span class="f">${r.frags}</span></div>`).join('');
  }
  sb.classList.toggle('hidden', !show);
}

/* ---------------- Input: keyboard/mouse ---------------- */
const keys = {};
let state = 'menu'; // menu | play | pause
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Tab') { e.preventDefault(); if (state === 'play') showScores(true); }
  if (e.code === 'Digit1') { player.weapon = 0; sfx.ui(); updateHUD(); }
  if (e.code === 'Digit2') { player.weapon = 1; sfx.ui(); updateHUD(); }
  if (e.code === 'KeyQ') { player.weapon = 1 - player.weapon; sfx.ui(); updateHUD(); }
  if (e.code === 'Escape' && state === 'play' && !IS_TOUCH) pauseGame();
  if (['Space', 'ArrowUp'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Tab') showScores(false);
});
let firing = false;
canvas.addEventListener('mousedown', (e) => { if (state === 'play' && e.button === 0) firing = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) firing = false; });
addEventListener('wheel', () => {
  if (state !== 'play') return;
  player.weapon = 1 - player.weapon; sfx.ui(); updateHUD();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && state === 'play' && !IS_TOUCH) pauseGame();
});
document.addEventListener('mousemove', (e) => {
  if (state !== 'play' || document.pointerLockElement !== canvas) return;
  player.yaw -= e.movementX * 0.0023 * settings.sens;
  player.pitch = clamp(player.pitch - e.movementY * 0.0023 * settings.sens, -1.45, 1.45);
});

/* ---------------- Input: touch ---------------- */
const stick = { id: null, cx: 0, cy: 0, dx: 0, dy: 0 };
const look = { id: null, lx: 0, ly: 0 };
let touchFire = false;
const stickZone = $('stick-zone'), stickBase = $('stick-base'), stickNub = $('stick-nub');
stickZone.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.changedTouches[0];
  stick.id = t.identifier; stick.cx = t.clientX; stick.cy = t.clientY; stick.dx = stick.dy = 0;
  stickBase.style.display = 'block';
  stickBase.style.left = (t.clientX - 62) + 'px'; stickBase.style.top = (t.clientY - 62) + 'px';
}, { passive: false });
const lookZone = $('look-zone');
lookZone.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.changedTouches[0];
  look.id = t.identifier; look.lx = t.clientX; look.ly = t.clientY;
}, { passive: false });
addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === stick.id) {
      let dx = (t.clientX - stick.cx) / 52, dy = (t.clientY - stick.cy) / 52;
      const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      stick.dx = dx; stick.dy = dy;
      stickNub.style.transform = `translate(calc(-50% + ${dx * 34}px), calc(-50% + ${dy * 34}px))`;
    } else if (t.identifier === look.id && state === 'play') {
      player.yaw -= (t.clientX - look.lx) * 0.0042 * settings.sens;
      player.pitch = clamp(player.pitch - (t.clientY - look.ly) * 0.0042 * settings.sens, -1.45, 1.45);
      look.lx = t.clientX; look.ly = t.clientY;
    }
  }
  if (state === 'play') e.preventDefault();
}, { passive: false });
addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === stick.id) {
      stick.id = null; stick.dx = stick.dy = 0;
      stickBase.style.display = 'none';
      stickNub.style.transform = 'translate(-50%,-50%)';
    }
    if (t.identifier === look.id) look.id = null;
  }
});
function bindHold(el, down, up) {
  el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); down(); }, { passive: false });
  el.addEventListener('touchend', (e) => { e.preventDefault(); up && up(); }, { passive: false });
  el.addEventListener('mousedown', (e) => { e.preventDefault(); down(); });
  el.addEventListener('mouseup', () => up && up());
}
bindHold($('btn-fire'), () => touchFire = true, () => touchFire = false);
bindHold($('btn-jump'), () => keys.Space = true, () => keys.Space = false);
bindHold($('btn-weapon'), () => { player.weapon = 1 - player.weapon; sfx.ui(); updateHUD(); });
bindHold($('btn-pause'), () => pauseGame());
bindHold($('btn-score'), () => showScores($('scoreboard').classList.contains('hidden')));
$('scoreboard').addEventListener('click', () => showScores(false));

/* ---------------- Menu wiring ---------------- */
$('opt-sens').addEventListener('input', (e) => {
  settings.sens = parseFloat(e.target.value);
  localStorage.setItem('ql_sens', String(settings.sens));
});
function refreshOptBtns() {
  $('opt-quality').textContent = 'QUALITY: ' + settings.quality.toUpperCase();
  $('opt-sound').textContent = 'SOUND: ' + (settings.sound ? 'ON' : 'OFF');
}
$('opt-quality').addEventListener('click', () => {
  settings.quality = settings.quality === 'auto' ? 'high' : settings.quality === 'high' ? 'low' : 'auto';
  localStorage.setItem('ql_quality', settings.quality);
  lowQ = settings.quality === 'low' || (settings.quality === 'auto' && IS_TOUCH);
  applyQuality(); refreshOptBtns(); sfx.ui();
});
$('opt-sound').addEventListener('click', () => {
  settings.sound = !settings.sound;
  localStorage.setItem('ql_sound', settings.sound ? 'on' : 'off');
  refreshOptBtns(); sfx.ui();
});
refreshOptBtns();

function startGame() {
  audio(); sfx.ui();
  $('menu').classList.add('hidden');
  $('pause-menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (IS_TOUCH) $('touch-ui').classList.remove('hidden');
  state = 'play'; over = false; matchT = MATCH_LEN;
  player.frags = 0; player.deaths = 0;
  bots.forEach(b => { b.frags = 0; b.deaths = 0; });
  respawnPlayer(); updateHUD();
  $('match-time').textContent = fmtT(matchT);
  if (!IS_TOUCH) { try { canvas.requestPointerLock(); } catch { } }
  feed('FRAG OR BE FRAGGED');
}
function pauseGame() {
  if (state !== 'play') return;
  state = 'pause';
  if (document.pointerLockElement) document.exitPointerLock();
  $('pause-menu').classList.remove('hidden');
}
function resumeGame() {
  sfx.ui();
  $('pause-menu').classList.add('hidden');
  state = 'play';
  if (!IS_TOUCH) { try { canvas.requestPointerLock(); } catch { } }
}
$('btn-play').addEventListener('click', startGame);
$('btn-resume').addEventListener('click', resumeGame);
$('btn-quit').addEventListener('click', () => {
  state = 'menu';
  $('pause-menu').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('touch-ui').classList.add('hidden');
  $('menu').classList.remove('hidden');
});
canvas.addEventListener('click', () => {
  if (state === 'play' && !IS_TOUCH && document.pointerLockElement !== canvas) {
    try { canvas.requestPointerLock(); } catch { }
  }
});

/* ---------------- Shooting ---------------- */
const _dir = new THREE.Vector3(), _o = new THREE.Vector3(), _t = new THREE.Vector3();
function playerShoot(dt) {
  player.nailCd -= dt; player.rocketCd -= dt;
  const wantFire = firing || touchFire || keys.KeyF;
  if (!wantFire || !player.alive) return;
  _dir.set(0, 0, -1).applyQuaternion(camera.quaternion);
  _o.copy(camera.position);
  if (player.weapon === 0) {
    if (player.nailCd > 0) return;
    player.nailCd = 0.11;
    sfx.nail();
    _dir.x += rand(-0.012, 0.012); _dir.y += rand(-0.012, 0.012); _dir.normalize();
    muzzleT = 0.05; gunKick = 0.09;
    let best = null, bestD = 60;
    for (const b of bots) {
      if (!b.alive) continue;
      _t.set(b.pos.x - _o.x, (b.pos.y + 1.3) - _o.y, b.pos.z - _o.z);
      const d = _t.length(); if (d > 60) continue;
      _t.normalize();
      const angle = _t.dot(_dir);
      if (angle > 0.9965 - Math.min(0.004, 3 / (d * d))) { if (d < bestD) { bestD = d; best = b; } }
    }
    // wall block check (sample along ray vs colliders)
    let wallD = 60;
    for (let s = 1; s < 60; s += 1.5) {
      const px = _o.x + _dir.x * s, pz = _o.z + _dir.z * s;
      const py = _o.y + _dir.y * s;
      if (py < 0 || py > 9) { wallD = s; break; }
      let hit = false;
      for (const c of colliders) {
        if (px > c.x0 && px < c.x1 && pz > c.z0 && pz < c.z1) { hit = true; break; }
      }
      if (hit || Math.abs(px) > ARENA || Math.abs(pz) > ARENA) { wallD = s; break; }
    }
    const endD = best ? Math.min(bestD, wallD) : wallD;
    spawnTracer(_o.clone().addScaledVector(_dir, 1.2), _o.clone().addScaledVector(_dir, endD));
    if (best && bestD <= wallD) {
      damageBot(best, 11, 'player');
      spawnGibs(new THREE.Vector3(best.pos.x, best.pos.y + 1.3, best.pos.z), 0xff2222, 4, 4);
    } else if (wallD < 60) {
      const hp = _o.clone().addScaledVector(_dir, wallD);
      spawnGibs(hp, 0xd6ff3f, 3, 3);
    }
  } else {
    if (player.rocketCd > 0) return;
    if (player.rockets <= 0) { sfx.empty(); player.rocketCd = 0.3; toast('NO ROCKETS — grab ammo', '#ffb43b'); return; }
    player.rocketCd = 0.85; player.rockets--;
    sfx.rocketFire();
    muzzleT = 0.08; gunKick = 0.22;
    fireRocket(_o.clone().addScaledVector(_dir, 1.2), _dir.clone(), 'player');
    updateHUD();
  }
}
function botShoot(b) {
  _o.set(b.pos.x, b.pos.y + 1.6, b.pos.z);
  _dir.set(player.pos.x - _o.x, (player.pos.y + 1.2) - _o.y, player.pos.z - _o.z);
  const d = _dir.length(); _dir.normalize();
  if (d > 42) return;
  // don't shoot through walls (2D sample)
  for (let s = 1; s < d; s += 2) {
    const px = _o.x + _dir.x * s, pz = _o.z + _dir.z * s;
    for (const c of colliders) if (px > c.x0 && px < c.x1 && pz > c.z0 && pz < c.z1) return;
  }
  _dir.x += rand(-0.05, 0.05); _dir.y += rand(-0.03, 0.03); _dir.z += rand(-0.05, 0.05);
  _dir.normalize();
  if (Math.random() < 0.35) {
    fireRocket(_o.clone(), _dir.clone(), b);
    tone(140, 0.25, 'sawtooth', 0.05, -50);
  } else {
    spawnTracer(_o.clone(), _o.clone().addScaledVector(_dir, Math.min(d, 30)), 0xff3b3b);
    tone(500 + Math.random() * 200, 0.06, 'square', 0.03);
    if (d < 30 && Math.random() < 0.5) damagePlayer(Math.round(rand(4, 8)), b);
  }
}

/* ---------------- Update loop ---------------- */
function updatePlayer(dt) {
  if (player.invuln > 0) player.invuln -= dt;
  if (!player.alive) {
    player.respawnT -= dt;
    $('respawn-in').textContent = Math.max(0, player.respawnT).toFixed(1);
    if (player.respawnT <= 0) { respawnPlayer(); updateHUD(); }
    return;
  }
  // move input
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz -= 1;
  if (keys.KeyS || keys.ArrowDown) iz += 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  ix += stick.dx; iz += stick.dy;
  const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
  const SPEED = 8.2;
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  const wx = (ix * cos - iz * sin) * SPEED;
  const wz = (ix * sin + iz * cos) * SPEED * -1;
  // note: forward is -Z rotated by yaw
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
  player.vel.x = (fx * -iz + rx * ix) * SPEED;
  player.vel.z = (fz * -iz + rz * ix) * SPEED;
  void wx; void wz;
  // gravity / jump
  player.vel.y -= 17 * dt;
  if ((keys.Space) && player.onGround) {
    player.vel.y = 6.2; player.onGround = false; sfx.jump();
    if (IS_TOUCH) keys.Space = false; // touch button = single hop per tap-hold ok
  }
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  player.pos.y += player.vel.y * dt;
  collideXZ(player.pos, player.pos.y, 1.7);
  const g = groundHeightAt(player.pos.x, player.pos.z);
  if (player.pos.y <= g) {
    // step-up assist for 1.1 blocks
    player.pos.y = g; player.vel.y = 0; player.onGround = true;
  } else player.onGround = false;
  // lava damage
  if (inLava(player.pos.x, player.pos.z) && player.pos.y < 0.5) {
    player.lavaT += dt;
    if (player.lavaT > 0.5) { player.lavaT = 0; damagePlayer(12, null); feed('YOU are burning in lava'); }
  } else player.lavaT = 0;
  // camera
  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  // gun feel
  gunBob += dt * (l > 0.1 ? 10 : 2);
  gunKick = Math.max(0, gunKick - dt * 1.4);
  gun.position.y = -0.24 + Math.sin(gunBob) * (l > 0.1 ? 0.014 : 0.004) + gunKick * 0.4;
  gun.position.z = -0.6 + gunKick;
  muzzleT -= dt; muzzle.material.opacity = muzzleT > 0 ? 0.95 : 0;
  playerShoot(dt);
  checkPickups();
}
function updateBots(dt) {
  for (const b of bots) {
    if (!b.alive) {
      b.respawnT -= dt;
      b.mesh.visible = false;
      if (b.respawnT <= 0 && state === 'play' && !over) {
        const s = SPAWNS[(Math.random() * SPAWNS.length) | 0];
        b.pos.set(s[0], groundHeightAt(s[0], s[1]), s[1]);
        b.hp = 100; b.alive = true; b.mesh.visible = true;
        pickWaypoint(b);
      }
      continue;
    }
    b.mesh.visible = true;
    // AI steering
    b.aiT -= dt;
    const dxP = player.pos.x - b.pos.x, dzP = player.pos.z - b.pos.z;
    const distP = Math.hypot(dxP, dzP);
    const seesPlayer = player.alive && distP < 34;
    let tx, tz;
    if (seesPlayer && Math.random() < 0.02) { tx = player.pos.x + rand(-4, 4); tz = player.pos.z + rand(-4, 4); }
    else { tx = b.wx; tz = b.wz; }
    if (b.aiT <= 0) { b.aiT = rand(1.5, 3.5); if (!seesPlayer || Math.random() < 0.3) pickWaypoint(b); }
    if (Math.hypot(tx - b.pos.x, tz - b.pos.z) < 2) pickWaypoint(b);
    const dx = tx - b.pos.x, dz = tz - b.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    const sp = seesPlayer ? 5.4 : 3.4;
    let mx = (dx / dl) * sp, mz = (dz / dl) * sp;
    // strafe while fighting
    if (seesPlayer && distP < 16) { const s = Math.sin(performance.now() / 700 + b.pos.x); mx += -dz / dl * s * 3; mz += dx / dl * s * 3; }
    const ox = b.pos.x, oz = b.pos.z;
    b.pos.x += mx * dt; b.pos.z += mz * dt;
    collideXZ(b.pos, b.pos.y, 1.7);
    if (Math.hypot(b.pos.x - ox, b.pos.z - oz) < sp * dt * 0.25) pickWaypoint(b); // stuck
    // keep on platforms / ground
    const gg = groundHeightAt(b.pos.x, b.pos.z);
    b.pos.y += (gg - b.pos.y) * Math.min(1, dt * 8);
    // face player or travel dir
    b.yaw = Math.atan2(seesPlayer ? dxP : mx, seesPlayer ? dzP : mz);
    b.mesh.position.copy(b.pos);
    b.mesh.rotation.y = b.yaw;
    // leg scissor
    const t = performance.now() / 130;
    b.mesh.userData.legL.position.z = Math.sin(t) * 0.2;
    b.mesh.userData.legR.position.z = -Math.sin(t) * 0.2;
    // lava hurts bots too
    if (inLava(b.pos.x, b.pos.z) && b.pos.y < 0.5 && Math.random() < dt * 2) damageBot(b, 8, null);
    // shooting
    b.shootT -= dt;
    if (seesPlayer && b.shootT <= 0 && state === 'play' && !over) {
      botShoot(b);
      b.shootT = rand(1.1, 2.6);
    }
    if (Math.random() < dt * 0.4 && b.pos.y <= 0.01) b.vy = 0; // grounded
  }
}
function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.life -= dt;
    r.trail += dt;
    if (r.trail > 0.03) { r.trail = 0; spawnGibs(r.m.position, 0xff8830, 1, 1); gibs[gibs.length - 1].t = 0.25; }
    r.m.position.x += r.vx * dt; r.m.position.y += r.vy * dt; r.m.position.z += r.vz * dt;
    r.vy -= 2.5 * dt;
    let boom = r.life <= 0 || r.m.position.y < 0.1;
    // hit player?
    if (r.owner !== 'player' && player.alive) {
      if (r.m.position.distanceToSquared(new THREE.Vector3(player.pos.x, player.pos.y + 1.1, player.pos.z)) < 1.1) boom = true;
    }
    // hit bots?
    if (!boom) for (const b of bots) {
      if (!b.alive || r.owner === b) continue;
      if (r.m.position.distanceToSquared(new THREE.Vector3(b.pos.x, b.pos.y + 1.2, b.pos.z)) < 1.3) { boom = true; break; }
    }
    // hit walls
    if (!boom) {
      if (Math.abs(r.m.position.x) > ARENA || Math.abs(r.m.position.z) > ARENA || r.m.position.y > 9.5) boom = true;
      else for (const c of colliders) {
        if (r.m.position.x > c.x0 && r.m.position.x < c.x1 && r.m.position.z > c.z0 && r.m.position.z < c.z1 && r.m.position.y < 8.4) { boom = true; break; }
      }
      // platform tops
      const gh = groundHeightAt(r.m.position.x, r.m.position.z);
      if (r.m.position.y < gh + 0.15) boom = true;
    }
    if (boom) { explode(r.m.position.clone(), r.owner); scene.remove(r.m); rockets.splice(i, 1); }
  }
}
function updateFx(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.t -= dt;
    t.mesh.material.opacity = Math.max(0, t.t / 0.09);
    if (t.t <= 0) { scene.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose(); tracers.splice(i, 1); }
  }
  for (let i = gibs.length - 1; i >= 0; i--) {
    const g = gibs[i]; g.t -= dt;
    if (g.grow) { g.m.scale.multiplyScalar(1 + dt * 14); g.m.material.opacity = Math.max(0, g.t / 0.18); }
    else { g.vy -= 20 * dt; g.m.position.x += g.vx * dt; g.m.position.y += g.vy * dt; g.m.position.z += g.vz * dt; if (g.m.position.y < 0.1) { g.m.position.y = 0.1; g.vy *= -0.4; } g.m.rotation.x += dt * 5; }
    if (g.t <= 0) { scene.remove(g.m); if (!g.grow) g.m.material.dispose(); else { g.m.geometry.dispose(); g.m.material.dispose(); } gibs.splice(i, 1); }
  }
  for (const p of pickups) {
    if (!p.active) { p.t -= 1 / 60; if (p.t <= 0) { p.active = true; p.m.visible = true; } continue; }
    p.m.rotation.y += dt * 2;
    p.m.position.y = p.baseY + Math.sin(performance.now() / 400 + p.m.position.x) * 0.18;
  }
  lavaMat.color.setHSL(0.03 + Math.sin(performance.now() / 500) * 0.015, 1, 0.5);
  lavaGlow.intensity = 55 + Math.sin(performance.now() / 300) * 10;
}

/* ---------------- Main loop ---------------- */
respawnPlayer();
updateHUD();
// debug/testing handle (read-only snapshot)
window.__game = {
  get state() { return state; },
  player, bots, camera, gun, muzzle,
  get counts() { return { rockets: rockets.length, tracers: tracers.length, gibs: gibs.length }; },
};
camera.position.set(player.pos.x, EYE, player.pos.z);
camera.rotation.set(0, player.yaw, 0);
// attract-mode camera
let menuAngle = 0;

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(((now - (frame._l || now)) / 1000), 0.05);
  frame._l = now;
  if (state === 'play' && !over) {
    matchT -= dt;
    $('match-time').textContent = fmtT(matchT);
    if (matchT <= 0) {
      const s = standings();
      endMatch(s[0].me ? 'VICTORY!' : `${s[0].name} WINS`);
    }
    updatePlayer(dt);
    updateBots(dt);
    updateRockets(dt);
    updateFx(dt);
  } else if (state === 'menu') {
    menuAngle += dt * 0.12;
    camera.position.set(Math.sin(menuAngle) * 26, 9 + Math.sin(menuAngle * 0.7) * 2, Math.cos(menuAngle) * 26);
    camera.lookAt(0, 1, 0);
    updateFx(dt);
    // idle bots drift for backdrop
    for (const b of bots) { b.mesh.visible = b.alive; if (b.alive) { b.mesh.position.copy(b.pos); } }
  } else { // pause
    updateFx(0.0001);
  }
  renderer.render(scene, camera);
}
frame();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  applyQuality();
});
// prevent double-tap zoom / scroll on mobile
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
