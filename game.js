import * as THREE from './three.module.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

/* ================= AUDIO (synthesized, no assets) ================= */
let AC = null, engineOsc = null, engineGain = null, engineFilter = null;
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(freq, dur, type = 'square', vol = 0.15, slide = 0) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur);
}
function noiseBurst(dur = 0.4, vol = 0.3, low = 400) {
  const c = ac(); if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = low;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination); src.start();
}
const SFX = {
  shoot() { tone(rand(700, 900), 0.09, 'square', 0.08, -400); },
  plasma() { tone(rand(300, 380), 0.18, 'sawtooth', 0.1, -180); },
  enemyShoot() { tone(rand(200, 260), 0.2, 'sawtooth', 0.06, -120); },
  tank() { tone(90, 0.5, 'square', 0.25, -40); noiseBurst(0.5, 0.35, 900); },
  explosion() { noiseBurst(0.9, 0.5, 600); tone(60, 0.8, 'sine', 0.4, -30); },
  hit() { tone(1200, 0.06, 'square', 0.07); },
  hurt() { tone(160, 0.25, 'sawtooth', 0.2, -80); noiseBurst(0.2, 0.2, 500); },
  shield() { tone(900, 0.15, 'sine', 0.12, 400); },
  pickup() { tone(600, 0.12, 'sine', 0.15, 300); setTimeout(() => tone(900, 0.12, 'sine', 0.15, 300), 100); },
  reload() { tone(400, 0.08, 'square', 0.1); setTimeout(() => tone(550, 0.08, 'square', 0.1), 120); },
  wave() { [440, 554, 659, 880].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.16), i * 140)); },
  capture() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.18), i * 130)); },
  flagPickup() { tone(700, 0.1, 'square', 0.12, 300); setTimeout(() => tone(1050, 0.14, 'square', 0.12), 90); },
  flagReturn() { tone(500, 0.12, 'sine', 0.14, 250); setTimeout(() => tone(750, 0.14, 'sine', 0.14), 110); },
  empty() { tone(200, 0.07, 'square', 0.08); },
  grenade() { tone(500, 0.1, 'square', 0.1, 200); },
};
function engineStart() {
  const c = ac(); if (!c || engineOsc) return;
  engineOsc = c.createOscillator(); engineGain = c.createGain(); engineFilter = c.createBiquadFilter();
  engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 60;
  engineFilter.type = 'lowpass'; engineFilter.frequency.value = 400;
  engineGain.gain.value = 0.0;
  engineOsc.connect(engineFilter).connect(engineGain).connect(c.destination);
  engineOsc.start();
}
function engineUpdate(on, speedRatio, fly) {
  if (!engineOsc || !AC) return;
  const t = AC.currentTime;
  engineGain.gain.setTargetAtTime(on ? 0.05 + speedRatio * 0.08 : 0.0, t, 0.1);
  engineOsc.frequency.setTargetAtTime((fly ? 120 : 55) + speedRatio * (fly ? 120 : 90), t, 0.1);
}

/* ================= RENDERER / SCENE ================= */
const app = $('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e2138);
scene.fog = new THREE.Fog(0x0e2138, 120, 620);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 3000);
camera.rotation.order = 'YXZ';
camera.position.set(0, 30, 60);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  layoutGun();
});
function layoutGun() {
  if (!player.gun) return;
  // shrink the view-model on narrow/portrait screens so it doesn't fill the view
  player.gun.scale.setScalar(camera.aspect < 0.9 ? 0.5 : 0.7);
}

const hemi = new THREE.HemisphereLight(0x8fd8ff, 0x1a2a1a, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d8, 1.9);
sun.position.set(120, 180, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
sun.shadow.camera.far = 600; sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(new THREE.AmbientLight(0x223344, 0.5));

/* ================= WORLD ================= */
const WORLD_R = 480;               // playable radius
/* ---- Team battle: bases, flags, CTF ---- */
const BLUE_BASE = new THREE.Vector3(0, 0, 0);
const RED_BASE = new THREE.Vector3(-240, 0, 190);
const BASE_R = 26;                 // capture / delivery zone radius
const CAPS_TO_WIN = 3;
let blueCaps = 0, redCaps = 0, matchT = 0, reinfT = 0;
const colliders = [];              // {x,z,r}
function addCollider(x, z, r) { colliders.push({ x, z, r }); }
function collideCircle(p, r) {
  for (const c of colliders) {
    const dx = p.x - c.x, dz = p.z - c.z;
    const d = Math.hypot(dx, dz), min = c.r + r;
    if (d < min && d > 0.001) { p.x = c.x + dx / d * min; p.z = c.z + dz / d * min; }
  }
  const dc = Math.hypot(p.x, p.z);
  if (dc > WORLD_R) { p.x *= WORLD_R / dc; p.z *= WORLD_R / dc; }
}

function groundTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#3d6b34'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const s = ['#3d6b34', '#4a7a3a', '#35602e', '#5a8a42', '#2c4f28'][i % 5];
    g.fillStyle = s; g.globalAlpha = rand(0.3, 0.9);
    g.fillRect(Math.random() * 256, Math.random() * 256, rand(1, 5), rand(1, 5));
  }
  const tx = new THREE.CanvasTexture(cv);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(60, 60);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}
{
  const g = new THREE.Mesh(
    new THREE.CircleGeometry(700, 64),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1, metalness: 0 })
  );
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
  // outer energy wall ring
  const wall = new THREE.Mesh(
    new THREE.TorusGeometry(WORLD_R + 4, 1.2, 8, 128),
    new THREE.MeshBasicMaterial({ color: 0x39e6ff, transparent: true, opacity: 0.7 })
  );
  wall.rotation.x = Math.PI / 2; wall.position.y = 3; scene.add(wall);
}
// Halo ring in the sky (the namesake!)
{
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(650, 26, 12, 140),
    new THREE.MeshStandardMaterial({ color: 0x9aa7b5, roughness: 0.5, metalness: 0.6, emissive: 0x1a3a4a, emissiveIntensity: 0.7 })
  );
  halo.position.set(0, 700, -500); halo.rotation.set(1.25, 0.1, 0.35);
  scene.add(halo);
  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(650, 34, 8, 140),
    new THREE.MeshBasicMaterial({ color: 0x39e6ff, transparent: true, opacity: 0.12 })
  );
  glow.position.copy(halo.position); glow.rotation.copy(halo.rotation); scene.add(glow);
  // planet below horizon
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(220, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0x2a6ab5, emissive: 0x0a2a55, emissiveIntensity: 0.8, roughness: 1 })
  );
  planet.position.set(-500, -180, -900); scene.add(planet);
}
// stars
{
  const n = 900, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = rand(0, TAU), p = rand(0.05, 1.2);
    const r = 2200;
    pos[i * 3] = Math.cos(t) * Math.cos(p) * r;
    pos[i * 3 + 1] = Math.sin(p) * r * 0.9 + 60;
    pos[i * 3 + 2] = Math.sin(t) * Math.cos(p) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfe9ff, size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0.9 })));
}
function box(w, h, d, color, emissive = 0x000000, ei = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.25, emissive, emissiveIntensity: ei })
  );
  m.castShadow = true; m.receiveShadow = true; return m;
}
// scatter: rocks, alien trees, forerunner beacons, base
const obstacleMeshes = [];
{
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b7a82, roughness: 1 });
  const treeTrunk = new THREE.CylinderGeometry(0.35, 0.6, 4, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 1 });
  const crownGeo = new THREE.IcosahedronGeometry(2.2, 0);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2aff9a, roughness: 0.8, emissive: 0x06331a, emissiveIntensity: 0.6 });
  for (let i = 0; i < 90; i++) {
    const a = rand(0, TAU), r = rand(40, WORLD_R - 20);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x, z) < 26) continue; // keep spawn clear
    if (Math.hypot(x - RED_BASE.x, z - RED_BASE.z) < 34) continue; // keep red base clear
    if (Math.random() < 0.4) {
      const s = rand(1.2, 4.2);
      const m = new THREE.Mesh(rockGeo, rockMat);
      m.position.set(x, s * 0.4, z); m.scale.setScalar(s);
      m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      m.castShadow = m.receiveShadow = true; scene.add(m);
      addCollider(x, z, s * 1.1);
    } else {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(treeTrunk, trunkMat); trunk.position.y = 2; trunk.castShadow = true;
      const crown = new THREE.Mesh(crownGeo, crownMat); crown.position.y = 5.2; crown.castShadow = true;
      t.add(trunk, crown); t.position.set(x, 0, z); t.scale.setScalar(rand(0.9, 2.1));
      scene.add(t); addCollider(x, z, 1.4);
    }
  }
  // Forerunner pillars (cover + landmarks)
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x8fa3ad, roughness: 0.4, metalness: 0.7, emissive: 0x0a3a4a, emissiveIntensity: 0.5 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + 0.2, r = rand(120, 380);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = rand(10, 26);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, h, 8), pillarMat);
    p.position.set(x, h / 2, z); p.castShadow = p.receiveShadow = true; scene.add(p);
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(1.4),
      new THREE.MeshStandardMaterial({ color: 0x39e6ff, emissive: 0x39e6ff, emissiveIntensity: 1.6 }));
    tip.position.set(x, h + 1.5, z); scene.add(tip);
    obstacleMeshes.push(tip);
    addCollider(x, z, 3.4);
  }
  // UNSC home base
  const base = new THREE.Group();
  const pad = box(34, 1, 34, 0x3a4a55); pad.position.y = 0.5; base.add(pad);
  for (const [sx, sz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
    const b = box(6, 5, 6, 0x51616d); b.position.set(sx, 3, sz); base.add(b);
    const lamp = box(1, 1, 1, 0x39e6ff, 0x39e6ff, 2); lamp.position.set(sx, 6, sz); base.add(lamp);
  }
  const tower = box(4, 16, 4, 0x5a6d78); tower.position.set(0, 8, -14); base.add(tower);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 8, 0, TAU, 0, 1),
    new THREE.MeshStandardMaterial({ color: 0x9adfff, roughness: 0.3, metalness: 0.6 }));
  dish.position.set(0, 16.5, -14); dish.rotation.x = -0.8; base.add(dish);
  base.position.set(0, 0, 0); scene.add(base);
  addCollider(-12, -12, 4.4); addCollider(12, -12, 4.4); addCollider(-12, 12, 4.4); addCollider(12, 12, 4.4);
  // RED Covenant base (mirrored layout, hostile palette)
  const rbase = new THREE.Group();
  const rpad = box(34, 1, 34, 0x3a2430); rpad.position.y = 0.5; rbase.add(rpad);
  for (const [sx, sz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
    const b = box(6, 5, 6, 0x5e2a4a); b.position.set(sx, 3, sz); rbase.add(b);
    const lamp = box(1, 1, 1, 0xff4d5e, 0xff4d5e, 2); lamp.position.set(sx, 6, sz); rbase.add(lamp);
  }
  const rspire = new THREE.Mesh(new THREE.ConeGeometry(3, 18, 6),
    new THREE.MeshStandardMaterial({ color: 0x4a1a3a, roughness: 0.6, emissive: 0x550a1a, emissiveIntensity: 0.7 }));
  rspire.position.set(0, 9, -14); rspire.castShadow = true; rbase.add(rspire);
  const rglow = new THREE.Mesh(new THREE.OctahedronGeometry(1.6),
    new THREE.MeshStandardMaterial({ color: 0xff4d5e, emissive: 0xff4d5e, emissiveIntensity: 2 }));
  rglow.position.set(0, 4, -14); rbase.add(rglow);
  rbase.position.set(RED_BASE.x, 0, RED_BASE.z); scene.add(rbase);
  obstacleMeshes.push(rglow);
  addCollider(RED_BASE.x - 12, RED_BASE.z - 12, 4.4); addCollider(RED_BASE.x + 12, RED_BASE.z - 12, 4.4);
  addCollider(RED_BASE.x - 12, RED_BASE.z + 12, 4.4); addCollider(RED_BASE.x + 12, RED_BASE.z + 12, 4.4);
  addCollider(RED_BASE.x, RED_BASE.z - 14, 3.4);
}

/* ================= VEHICLES ================= */
const vehicles = [];
function headlight(color = 0xcfefff) {
  const l = new THREE.SpotLight(color, 60, 60, 0.5, 0.4);
  l.position.set(0, 2.4, 3); return l;
}
function makeWarthog(x, z, yaw, accent = 0x39e6ff) {
  const g = new THREE.Group();
  const body = box(2.4, 0.8, 4.6, 0x3f5a3a); body.position.y = 1.1; g.add(body);
  const hood = box(2.2, 0.5, 1.4, 0x4a6b44); hood.position.set(0, 1.6, 1.4); g.add(hood);
  const seat = box(1.8, 0.5, 1.2, 0x222222); seat.position.set(0, 1.6, -0.6); g.add(seat);
  const gunBase = box(0.5, 1.0, 0.5, 0x333333); gunBase.position.set(0, 2.0, -1.8); g.add(gunBase);
  const gun = box(0.25, 0.25, 1.8, 0x111111); gun.position.set(0, 2.5, -1.4); g.add(gun);
  g.add(headlight());
  const wheels = [];
  const wg = new THREE.CylinderGeometry(0.62, 0.62, 0.5, 12);
  const wm = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 1 });
  for (const [wx, wz] of [[-1.3, 1.5], [1.3, 1.5], [-1.3, -1.5], [1.3, -1.5]]) {
    const w = new THREE.Mesh(wg, wm); w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.62, wz); w.castShadow = true; g.add(w); wheels.push(w);
  }
  // green stripe
  const stripe = box(0.4, 0.06, 4.6, accent, accent, 1.2); stripe.position.y = 1.53; g.add(stripe);
  g.position.set(x, 0, z); g.rotation.y = yaw; scene.add(g);
  const v = { kind: 'warthog', name: 'M12 Warthog', group: g, wheels, gun, pos: g.position,
    yaw, speed: 0, hp: 220, maxHp: 220, cooldown: 0, radius: 2.6, topSpeed: 30, gunTip: gun };
  vehicles.push(v); return v;
}
function makeTank(x, z, yaw, accent = 0xffb454) {
  const g = new THREE.Group();
  const hull = box(3.4, 1.2, 5.6, 0x4d5b46); hull.position.y = 1.2; g.add(hull);
  const glacis = box(3.0, 0.7, 1.4, 0x5c6b54); glacis.position.set(0, 2.0, 1.8); glacis.rotation.x = 0.4; g.add(glacis);
  const turret = new THREE.Group(); turret.position.set(0, 2.2, -0.4); g.add(turret);
  const tdome = box(2.2, 0.8, 2.4, 0x66765e); turret.add(tdome);
  const barrel = box(0.35, 0.35, 4.2, 0x222222); barrel.position.set(0, 0.2, 2.8); turret.add(barrel);
  const hatch = box(0.9, 0.4, 0.9, 0x39443a); hatch.position.set(0, 0.6, -0.6); turret.add(hatch);
  const stripe = box(3.42, 0.15, 1.0, accent, accent, 1.0); stripe.position.y = 1.3; g.add(stripe);
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 1 });
  for (const sx of [-2.0, 2.0]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 5.8), trackMat);
    t.position.set(sx, 0.7, 0); t.castShadow = true; g.add(t);
  }
  g.add(headlight(0xffe2b0));
  g.position.set(x, 0, z); g.rotation.y = yaw; scene.add(g);
  const v = { kind: 'tank', name: 'M808 Scorpion', group: g, turret, barrel, pos: g.position,
    yaw, turretYaw: yaw, speed: 0, hp: 520, maxHp: 520, cooldown: 0, radius: 3.2, topSpeed: 14 };
  vehicles.push(v); return v;
}
function makeWasp(x, z, yaw) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.4, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.3, 14, 12), bodyM);
  body.scale.set(1, 0.55, 1.9); body.position.y = 2.2; body.castShadow = true; g.add(body);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x9adfff, roughness: 0.1, metalness: 0.2, emissive: 0x1a5a7a, emissiveIntensity: 0.8 }));
  cockpit.position.set(0, 2.6, 1.0); g.add(cockpit);
  const wingM = new THREE.MeshStandardMaterial({ color: 0x2a4a5e, roughness: 0.5, metalness: 0.5 });
  for (const sx of [-2.2, 2.2]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 1.6), wingM);
    wing.position.set(sx, 2.2, -0.4); wing.castShadow = true; g.add(wing);
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 16),
      new THREE.MeshStandardMaterial({ color: 0x39e6ff, emissive: 0x39e6ff, emissiveIntensity: 0.9, transparent: true, opacity: 0.85 }));
    rotor.position.set(sx, 2.45, -0.4); g.add(rotor);
    if (!g.userData.rotors) g.userData.rotors = [];
    g.userData.rotors.push(rotor);
    const thr = new THREE.PointLight(0x39e6ff, 8, 14); thr.position.set(sx, 1.6, -0.4); g.add(thr);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 1.2), wingM);
  tail.position.set(0, 3.0, -2.2); g.add(tail);
  g.position.set(x, 2.5, z); g.rotation.y = yaw; scene.add(g);
  const v = { kind: 'wasp', name: 'AV-49 Wasp', group: g, pos: g.position,
    yaw, speed: 0, vy: 0, vel: new THREE.Vector3(), hp: 300, maxHp: 300, cooldown: 0, radius: 2.8, topSpeed: 42, hoverY: 2.5 };
  vehicles.push(v); return v;
}
// glowing vehicle pad so parking spots read from far away
function makePad(x, z, color) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.22, 8, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
  ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.25, z); scene.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 26, 8, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.set(x, 13, z); scene.add(beam);
}
const RED_ACCENT = 0xff4d5e;
// BLUE home fleet
makeWarthog(12, 14, 0.6);   makePad(12, 14, 0x39e6ff);
makeWarthog(-16, 10, -0.8); makePad(-16, 10, 0x39e6ff);
makeWarthog(20, -2, 2.6);   makePad(20, -2, 0x39e6ff);
makeTank(18, -14, Math.PI); makePad(18, -14, 0x39e6ff);
makeTank(-20, -14, 0.4);    makePad(-20, -14, 0x39e6ff);
makeWasp(0, 24, 0);         makePad(0, 24, 0x39e6ff);
makeWasp(-9, 27, 0.5);      makePad(-9, 27, 0x39e6ff);
// RED home fleet
makeWarthog(RED_BASE.x + 10, RED_BASE.z + 8, 2.2, RED_ACCENT);  makePad(RED_BASE.x + 10, RED_BASE.z + 8, RED_ACCENT);
makeWarthog(RED_BASE.x - 10, RED_BASE.z + 12, -0.6, RED_ACCENT); makePad(RED_BASE.x - 10, RED_BASE.z + 12, RED_ACCENT);
makeTank(RED_BASE.x + 12, RED_BASE.z - 6, -2.4, RED_ACCENT);    makePad(RED_BASE.x + 12, RED_BASE.z - 6, RED_ACCENT);
makeWasp(RED_BASE.x - 12, RED_BASE.z - 8, 1.0);                 makePad(RED_BASE.x - 12, RED_BASE.z - 8, RED_ACCENT);
// neutral midfield
makeWarthog(70, -70, 1.2); makePad(70, -70, 0xffb454);
makeTank(-60, 90, -0.5);   makePad(-60, 90, 0xffb454);
for (const v of vehicles) v.home = { x: v.pos.x, y: v.pos.y, z: v.pos.z, yaw: v.yaw };

/* ================= PLAYER ================= */
const player = {
  pos: new THREE.Vector3(0, 0, 6), vel: new THREE.Vector3(),
  yaw: 0.55, pitch: 0, onGround: true,
  shield: 100, maxShield: 100, health: 100, maxHealth: 100,
  shieldDelay: 0, ammo: 60, magSize: 60, reloading: 0,
  grenades: 4, meleeCd: 0, vehicle: null, dead: false,
  gun: null, muzzle: null, ads: false,
};
{ // view-model gun
  const g = new THREE.Group();
  const recv = box(0.09, 0.14, 0.55, 0x2a3438); g.add(recv);
  const barrel = box(0.06, 0.06, 0.4, 0x111111); barrel.position.set(0, 0.03, -0.4); g.add(barrel);
  const sight = box(0.03, 0.08, 0.1, 0x39e6ff, 0x39e6ff, 1.4); sight.position.set(0, 0.11, -0.1); g.add(sight);
  const grip = box(0.08, 0.22, 0.1, 0x3a2a1a); grip.position.set(0, -0.15, 0.12); grip.rotation.x = 0.3; g.add(grip);
  g.position.set(0.3, -0.3, -0.75);
  g.scale.setScalar(0.7);
  camera.add(g); scene.add(camera);
  player.gun = g;
  const mz = new THREE.PointLight(0x9adfff, 0, 12); mz.position.set(0.28, -0.2, -1.2);
  camera.add(mz); player.muzzle = mz;
  layoutGun();
}
const EYE = 1.7;

/* ================= ENEMIES ================= */
const enemies = [];
const enemyBodyGrunts = new THREE.SphereGeometry(0.55, 10, 8);
function makeEnemyMesh(type) {
  const g = new THREE.Group();
  if (type === 'grunt') {
    const mat = new THREE.MeshStandardMaterial({ color: 0xd88a2a, roughness: 0.8 });
    const body = new THREE.Mesh(enemyBodyGrunts, mat); body.position.y = 0.8; body.castShadow = true; g.add(body);
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x7adfff, emissive: 0x2277aa, emissiveIntensity: 1 }));
    mask.position.set(0, 0.95, 0.4); g.add(mask);
    const pack = box(0.4, 0.5, 0.25, 0x5a3a1a); pack.position.set(0, 0.9, -0.5); g.add(pack);
  } else { // elite
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a2ad8, roughness: 0.6, metalness: 0.3 });
    const legs = box(0.7, 1.0, 0.5, 0x4a1a8a); legs.position.y = 0.5; g.add(legs);
    const torso = box(1.0, 1.0, 0.6, 0x7a2ad8); torso.position.y = 1.5; torso.castShadow = true; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), mat);
    head.position.y = 2.3; head.castShadow = true; g.add(head);
    const mand = box(0.5, 0.15, 0.3, 0x9a4ae8); mand.position.set(0, 2.1, 0.35); g.add(mand);
    const glow = box(1.02, 0.12, 0.62, 0x39e6ff, 0x39e6ff, 1.5); glow.position.y = 1.5; g.add(glow);
    g.userData.torso = torso;
  }
  // shield bubble
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(type === 'elite' ? 1.6 : 1.0, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0x39e6ff, transparent: true, opacity: 0.0 }));
  bubble.position.y = type === 'elite' ? 1.4 : 0.8; g.add(bubble);
  g.userData.bubble = bubble;
  return g;
}
function spawnEnemy(type, x, z) {
  const mesh = makeEnemyMesh(type);
  mesh.position.set(x, 0, z); scene.add(mesh);
  const elite = type === 'elite';
  enemies.push({
    type, mesh, pos: mesh.position,
    hp: elite ? 130 : 55, maxHp: elite ? 130 : 55,
    shield: elite ? 90 : 0, maxShield: elite ? 90 : 0,
    cooldown: rand(0.5, 2), strafe: Math.random() < 0.5 ? 1 : -1,
    strafeT: rand(1, 3), speed: elite ? 5.2 : 4.2,
    bob: rand(0, TAU), alive: true, flash: 0, role: 'attack',
  });
}

/* ================= MARINES (BLUE teammates) ================= */
const marines = [];
function makeMarineMesh() {
  const g = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0x2e7a3a, roughness: 0.7 });
  const legs = box(0.65, 0.9, 0.45, 0x1e5228); legs.position.y = 0.45; g.add(legs);
  const torso = box(0.9, 0.9, 0.55, 0x2e7a3a); torso.position.y = 1.35; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), armor);
  head.position.y = 2.05; head.castShadow = true; g.add(head);
  const visor = box(0.44, 0.14, 0.2, 0x39e6ff, 0x39e6ff, 1.6); visor.position.set(0, 2.05, 0.26); g.add(visor);
  const rifle = box(0.12, 0.12, 1.1, 0x181818); rifle.position.set(0.4, 1.4, 0.5); g.add(rifle);
  const lampM = box(0.92, 0.1, 0.57, 0x39e6ff, 0x39e6ff, 1.2); lampM.position.y = 1.35; g.add(lampM);
  return g;
}
function spawnMarine(role, x, z) {
  const mesh = makeMarineMesh();
  mesh.position.set(x, 0, z); scene.add(mesh);
  marines.push({
    team: 'BLUE', role, mesh, pos: mesh.position,
    hp: 120, maxHp: 120, cooldown: rand(0.5, 1.5),
    strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rand(1, 3),
    speed: 5.6, bob: rand(0, TAU), alive: true, flash: 0,
  });
}

/* ================= CTF FLAGS ================= */
const FLAG_HOME = {
  BLUE: new THREE.Vector3(0, 0, 13),
  RED: new THREE.Vector3(RED_BASE.x, 0, RED_BASE.z + 13),
};
const TEAM_COLOR = { BLUE: 0x39e6ff, RED: 0xff4d5e };
const TEAM_CSS = { BLUE: '#39e6ff', RED: '#ff4d5e' };
const flags = {};
function makeFlag(team) {
  const color = TEAM_COLOR[team];
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.4, 8),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.7, roughness: 0.3 }));
  pole.position.y = 2.2; pole.castShadow = true; g.add(pole);
  const banner = box(1.5, 0.9, 0.08, color, color, 1.4);
  banner.position.set(0.8, 3.7, 0); g.add(banner);
  const glow = new THREE.PointLight(color, 14, 22); glow.position.y = 3; g.add(glow);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.18, 8, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; g.add(ring);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.6, 70, 8, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  beacon.position.y = 35; g.add(beacon);
  g.position.copy(FLAG_HOME[team]); scene.add(g);
  flags[team] = { team, mesh: g, banner, beacon, home: FLAG_HOME[team].clone(),
    state: 'home', carrier: null, dropPos: new THREE.Vector3(), returnT: 0 };
  return flags[team];
}
makeFlag('BLUE'); makeFlag('RED');
function flagPos(f, out) {
  if (f.state === 'home') return out.copy(f.home).setY(1.2);
  if (f.state === 'carried') {
    if (f.carrier === 'player') return out.copy(playerPos());
    return out.copy(f.carrier.pos).setY(f.carrier.pos.y + 3.2);
  }
  return out.copy(f.dropPos).setY(0.8);
}
const _fp = new THREE.Vector3();
function dropFlag(team, pos) {
  const f = flags[team];
  if (f.state !== 'carried') return;
  f.state = 'dropped'; f.carrier = null;
  f.dropPos.set(pos.x, 0, pos.z);
  f.returnT = 30;
  feed(`${team === 'BLUE' ? '🔵' : '🔴'} ${team} flag dropped!`, TEAM_CSS[team]);
}
function returnFlag(team, silent) {
  const f = flags[team];
  f.state = 'home'; f.carrier = null;
  if (!silent) { feed(`${team === 'BLUE' ? '🔵' : '🔴'} ${team} flag returned!`, TEAM_CSS[team]); SFX.flagReturn(); }
}
function pickupFlag(team, carrier) {
  const f = flags[team];
  f.state = 'carried'; f.carrier = carrier;
  const who = carrier === 'player' ? 'YOU' : (carrier.team === 'BLUE' ? 'a Marine' : `a ${carrier.type === 'elite' ? 'Elite' : 'Grunt'}`);
  feed(`${team === 'BLUE' ? '🔵' : '🔴'} ${team} flag taken by ${who}!`, TEAM_CSS[team]);
  SFX.flagPickup();
  if (carrier === 'player') showBanner('FLAG TAKEN — RUN IT HOME!');
}
function captureFlag(team) { // team just scored by delivering the foe flag
  if (team === 'BLUE') { blueCaps++; score += 500; }
  else redCaps++;
  returnFlag(team === 'BLUE' ? 'RED' : 'BLUE', true); // captured flag goes home
  SFX.capture();
  showBanner(team === 'BLUE' ? '🔵 CAPTURED! +500' : '🔴 ENEMY CAPTURED!');
  feed(team === 'BLUE' ? `🔵 BLUE scores! (${blueCaps}–${redCaps})` : `🔴 RED scores! (${blueCaps}–${redCaps})`, team === 'BLUE' ? '#51ff7a' : '#ff4d5e');
  updateTop();
  if (blueCaps >= CAPS_TO_WIN) endMatch(true);
  else if (redCaps >= CAPS_TO_WIN) endMatch(false);
}
function updateFlags(dt) {
  const t = performance.now() * 0.001;
  for (const team of ['BLUE', 'RED']) {
    const f = flags[team];
    flagPos(f, _fp);
    f.mesh.position.set(_fp.x, f.state === 'carried' ? _fp.y - 1.5 : 0, _fp.z);
    f.banner.rotation.y = Math.sin(t * 3 + (team === 'BLUE' ? 0 : 2)) * 0.5;
    f.beacon.visible = f.state !== 'carried';
    if (f.state === 'dropped') {
      f.returnT -= dt;
      f.mesh.position.y = 0.4 + Math.sin(t * 4) * 0.12;
      if (f.returnT <= 0) returnFlag(team);
    }
  }
  // player interactions (on foot only)
  if (!player.dead && !player.vehicle && state === 'playing') {
    const pp = playerPos();
    for (const team of ['BLUE', 'RED']) {
      const f = flags[team];
      flagPos(f, _fp);
      const d = Math.hypot(pp.x - _fp.x, pp.z - _fp.z);
      if (d > 3) continue;
      if (team === 'RED' && f.state !== 'carried') pickupFlag('RED', 'player');
      else if (team === 'BLUE' && f.state === 'dropped') { returnFlag('BLUE'); score += 25; updateTop(); }
    }
    // delivery: carrying RED flag inside BLUE base while BLUE flag is home
    if (flags.RED.carrier === 'player') {
      const inBase = Math.hypot(pp.x - BLUE_BASE.x, pp.z - BLUE_BASE.z) < BASE_R;
      if (inBase) {
        if (flags.BLUE.state === 'home') captureFlag('BLUE');
        else if (!updateFlags._warned || performance.now() - updateFlags._warned > 5000) {
          updateFlags._warned = performance.now();
          feed('Recover our 🔵 flag first!', '#ffb454');
        }
      }
    }
  }
}

/* ================= MATCH SETUP (replaces waves) ================= */
function setupMatch() {
  blueCaps = 0; redCaps = 0; matchT = 0; reinfT = 14;
  returnFlag('BLUE', true); returnFlag('RED', true);
  // BLUE marines
  for (let i = 0; i < 5; i++) {
    const a = rand(0, TAU);
    spawnMarine(i < 2 ? 'defend' : 'attack', BLUE_BASE.x + Math.cos(a) * rand(6, 14), BLUE_BASE.z + Math.sin(a) * rand(6, 14));
  }
  // RED attackers
  for (let i = 0; i < 7; i++) {
    const a = rand(0, TAU);
    const type = i % 3 === 0 ? 'elite' : (Math.random() < 0.35 ? 'elite' : 'grunt');
    const m = { role: i < 3 ? 'defend' : 'attack' };
    spawnEnemy(type, RED_BASE.x + Math.cos(a) * rand(6, 16), RED_BASE.z + Math.sin(a) * rand(6, 16));
    enemies[enemies.length - 1].role = m.role;
  }
  showBanner('🔵 CTF — FIRST TO 3 🔴');
  $('objective').textContent = '⬢ Steal the 🔴 flag to your 🔵 base — defend yours! Vehicles at glowing pads.';
  updateTop();
}
function updateReinforcements(dt) {
  reinfT -= dt;
  if (reinfT > 0 || state !== 'playing') return;
  reinfT = 14;
  const mAlive = marines.filter(m => m.alive).length;
  const rAlive = enemies.filter(e => e.alive).length;
  if (mAlive < 5 && marines.length < 40) {
    const a = rand(0, TAU);
    spawnMarine(Math.random() < 0.4 ? 'defend' : 'attack', BLUE_BASE.x + Math.cos(a) * 10, BLUE_BASE.z + Math.sin(a) * 10);
    feed('🔵 Marine reinforcement arrived', '#39e6ff');
  }
  if (rAlive < 7 && enemies.length < 60) {
    const a = rand(0, TAU);
    spawnEnemy(Math.random() < 0.35 ? 'elite' : 'grunt', RED_BASE.x + Math.cos(a) * 12, RED_BASE.z + Math.sin(a) * 12);
    enemies[enemies.length - 1].role = Math.random() < 0.4 ? 'defend' : 'attack';
    feed('🔴 Enemy reinforcement detected', '#ff4d5e');
  }
  updateTop();
}
function endMatch(blueWon) {
  if (state !== 'playing') return;
  state = 'over';
  refreshTouchUI();
  document.exitPointerLock && document.exitPointerLock();
  SFX.capture();
  setTimeout(() => {
    $('go-title').textContent = blueWon ? `🔵 VICTORY ${blueCaps}–${redCaps} · ${kills} kills · ${score} pts` : `🔴 DEFEAT ${blueCaps}–${redCaps} · ${kills} kills · ${score} pts`;
    $('go-sub').textContent = blueWon ? 'The ring is ours. The team fought as one.' : 'The Covenant takes the ring… rematch, Spartan.';
    $('gameover').classList.remove('hidden');
  }, 900);
}

/* ================= PROJECTILES / PARTICLES / PICKUPS ================= */
const projectiles = [];
const projGeoFriendly = new THREE.SphereGeometry(0.14, 8, 6);
const projGeoEnemy = new THREE.SphereGeometry(0.2, 8, 6);
const projMatFriendly = new THREE.MeshBasicMaterial({ color: 0xaef4ff });
const projMatEnemy = new THREE.MeshBasicMaterial({ color: 0xff5a3c });
const tracerGeo = new THREE.BoxGeometry(0.08, 0.08, 1.6);
const tracerMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
function fireProjectile(origin, dir, { speed = 90, damage = 12, friendly = true, life = 2, size = 1, explosive = 0, color = null, byPlayer = false } = {}) {
  let mesh;
  if (explosive) {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3 * size, 8, 6), new THREE.MeshBasicMaterial({ color: color || 0xffb454 }));
  } else if (friendly && damage < 20) {
    mesh = new THREE.Mesh(tracerGeo, tracerMat);
    mesh.lookAt(origin.clone().add(dir));
  } else {
    mesh = new THREE.Mesh(friendly ? projGeoFriendly : projGeoEnemy, friendly ? projMatFriendly : projMatEnemy);
    mesh.scale.setScalar(size);
  }
  const glow = new THREE.PointLight(friendly ? 0x66d5ff : 0xff5a3c, 3, 8);
  if (explosive || !friendly || damage >= 20) mesh.add(glow); // tracers skip lights (perf)
  mesh.position.copy(origin);
  scene.add(mesh);
  projectiles.push({ mesh, vel: dir.clone().normalize().multiplyScalar(speed), life, damage, friendly, explosive, byPlayer });
}
const particles = [];
const partGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
function burst(pos, color, n = 14, spd = 9, up = 6) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.copy(pos);
    scene.add(m);
    particles.push({ mesh: m, vel: new THREE.Vector3(rand(-spd, spd), rand(1, up), rand(-spd, spd)),
      life: rand(0.4, 1.1), max: 1 });
  }
}
function explode(pos, radius, damage, friendly, byPlayer = false) {
  burst(pos, 0xffb454, 22, 14, 12); burst(pos, 0xff4d3c, 14, 9, 9); burst(pos, 0x555555, 10, 6, 8);
  const flash = new THREE.PointLight(0xffb454, 120, radius * 4);
  flash.position.copy(pos); flash.position.y += 1; scene.add(flash);
  setTimeout(() => scene.remove(flash), 180);
  SFX.explosion();
  shake = Math.min(1.2, shake + 0.5);
  // damage
  const targets = [];
  if (!friendly || true) {
    for (const e of enemies) if (e.alive) targets.push({ p: e.pos, y: 1.2, enemy: e });
  }
  const pp = playerPos();
  const pd = Math.hypot(pp.x - pos.x, pp.z - pos.z) + Math.abs(pp.y - pos.y) * 0.5;
  if (pd < radius) damagePlayer(damage * (1 - pd / radius) * (friendly && player.vehicle ? 0.35 : 1), pos);
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = e.pos.distanceTo(pos);
    if (d < radius) damageEnemy(e, damage * (1 - d / radius), pos, byPlayer);
  }
  if (!friendly) {
    for (const m of marines) {
      if (!m.alive) continue;
      const d = m.pos.distanceTo(pos);
      if (d < radius) damageMarine(m, damage * (1 - d / radius), pos);
    }
  }
  for (const v of vehicles) {
    const d = v.pos.distanceTo(pos);
    if (d < radius + v.radius) damageVehicle(v, damage * (1 - d / (radius + v.radius)) * 0.7);
  }
}
const pickups = [];
function spawnPickup(x, z, kind) {
  const color = kind === 'shield' ? 0x39e6ff : kind === 'health' ? 0x51ff7a : 0xffb454;
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.6),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 }));
  m.position.set(x, 1.0, z); m.castShadow = true; scene.add(m);
  pickups.push({ mesh: m, kind, t: rand(0, TAU) });
}
for (let i = 0; i < 14; i++) {
  const a = rand(0, TAU), r = rand(50, 380);
  spawnPickup(Math.cos(a) * r, Math.sin(a) * r, ['shield', 'health', 'ammo'][i % 3]);
}

/* ================= GAME STATE ================= */
let state = 'menu';           // menu | playing | paused | dead
let score = 0, kills = 0;
let shake = 0, grenadeCd = 0, bannerT = 0;
const keys = {};
let firing = false, adsHeld = false;
let yawDelta = 0, pitchDelta = 0;
let menuCamA = 0;

function playerPos() {
  if (player.vehicle) return player.vehicle.pos.clone().setY(player.vehicle.pos.y + 1.5);
  return player.pos.clone().setY(player.pos.y + 1.4);
}
function feed(msg, color = '#39e6ff') {
  const kf = $('killfeed');
  const d = document.createElement('div');
  d.className = 'feed'; d.style.borderColor = color; d.textContent = msg;
  kf.prepend(d);
  while (kf.children.length > 5) kf.lastChild.remove();
  setTimeout(() => d.remove(), 4100);
}
function showBanner(t) {
  const b = $('wave-banner');
  b.textContent = t; b.classList.remove('hidden');
  b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => b.classList.add('hidden'), 2400);
}
function damageEnemy(e, dmg, fromPos, byPlayer = false) {
  if (!e.alive) return;
  if (e.shield > 0) {
    e.shield -= dmg;
    e.mesh.userData.bubble.material.opacity = 0.35;
    setTimeout(() => { if (e.alive) e.mesh.userData.bubble.material.opacity = 0; }, 120);
    SFX.shield();
    if (e.shield < 0) { e.hp += e.shield; e.shield = 0; }
  } else e.hp -= dmg;
  e.flash = 0.1;
  $('hitmarker').classList.remove('show'); void $('hitmarker').offsetWidth;
  $('hitmarker').classList.add('show');
  SFX.hit();
  if (fromPos) { // slight knockback / turn toward attacker
    e.mesh.lookAt(fromPos.x, 0, fromPos.z);
  }
  if (e.hp <= 0) {
    e.alive = false;
    if (flags.RED.carrier === e) dropFlag('RED', e.pos);
    if (flags.BLUE.carrier === e) dropFlag('BLUE', e.pos);
    const p = e.pos.clone(); p.y = 1;
    burst(p, e.type === 'elite' ? 0x9a4ae8 : 0xd88a2a, 20, 10, 9);
    burst(p, 0x39e6ff, 8, 7, 7);
    scene.remove(e.mesh);
    if (byPlayer) {
      kills++; score += e.type === 'elite' ? 250 : 100;
      feed(`${e.type === 'elite' ? 'Elite' : 'Grunt'} down  +${e.type === 'elite' ? 250 : 100}`);
    } else {
      feed(`${e.type === 'elite' ? 'Elite' : 'Grunt'} killed by a Marine`, '#51ff7a');
    }
    if (Math.random() < 0.3) spawnPickup(e.pos.x + rand(-2, 2), e.pos.z + rand(-2, 2), Math.random() < 0.5 ? 'shield' : 'health');
    updateTop();
  }
}
function damageMarine(m, dmg, fromPos) {
  if (!m.alive) return;
  m.hp -= dmg;
  m.flash = 0.1;
  if (m.hp <= 0) {
    m.alive = false;
    if (flags.BLUE.carrier === m) dropFlag('BLUE', m.pos);
    if (flags.RED.carrier === m) dropFlag('RED', m.pos);
    const p = m.pos.clone(); p.y = 1.2;
    burst(p, 0x2e7a3a, 18, 9, 8); burst(p, 0x39e6ff, 6, 6, 6);
    scene.remove(m.mesh);
    feed('🔵 Marine down!', '#39e6ff');
    updateTop();
  }
}
function damagePlayer(dmg, fromPos) {
  if (state !== 'playing' || player.dead) return;
  if (player.vehicle) {
    const v = player.vehicle;
    damageVehicle(v, dmg * 1.4);
    if (Math.random() < 0.3) damageThrough(dmg * 0.12);
    return;
  }
  damageThrough(dmg);
  function damageThrough(d) {
    if (player.shield > 0) {
      player.shield -= d * 1.4;
      player.shieldDelay = 4;
      $('shield-hit').style.opacity = 0.9;
      setTimeout(() => $('shield-hit').style.opacity = 0, 220);
      SFX.shield();
      if (player.shield < 0) { player.health += player.shield * 0.6; player.shield = 0; }
    } else {
      player.health -= d;
      SFX.hurt();
    }
    $('vignette').style.boxShadow = 'inset 0 0 180px rgba(255,30,60,.55)';
    setTimeout(() => $('vignette').style.boxShadow = 'inset 0 0 180px rgba(255,30,60,0)', 260);
    if (player.health <= 0) { player.health = 0; die(); }
  }
}
function damageVehicle(v, dmg) {
  v.hp -= dmg;
  burst(v.pos.clone().setY(v.pos.y + 1.5), 0xff8844, 4, 6, 6);
  if (v.hp <= 0) {
    v.hp = 0;
    const p = v.pos.clone(); p.y += 1.5;
    explode(p, 7, 60, false);
    feed(`${v.name} destroyed!`, '#ff4d5e');
    if (player.vehicle === v) exitVehicle(true);
    v.group.visible = false;
    v.dead = true;
    setTimeout(() => { // respawn fresh vehicle at its home pad
      v.hp = v.maxHp; v.dead = false; v.group.visible = true;
      if (v.home) {
        v.pos.set(v.home.x, v.home.y, v.home.z);
        v.yaw = v.home.yaw; v.group.rotation.y = v.yaw;
        if (v.kind === 'tank') v.turretYaw = v.yaw;
      } else {
        const a = rand(0, TAU);
        v.pos.set(Math.cos(a) * 24, v.kind === 'wasp' ? 2.5 : 0, Math.sin(a) * 24);
      }
      if (v.kind !== 'wasp') v.speed = 0; else v.vel.set(0, 0, 0);
      feed(`${v.name} requisitioned at base`, '#51ff7a');
    }, 12000);
  }
}
let respawnT = 0;
function die() {
  if (player.dead || state !== 'playing') return;
  if (flags.RED.carrier === 'player') dropFlag('RED', player.pos);
  if (flags.BLUE.carrier === 'player') dropFlag('BLUE', player.pos);
  if (player.vehicle) exitVehicle(true);
  player.dead = true; respawnT = 3.5;
  refreshTouchUI();
  burst(playerPos(), 0xff4d5e, 26, 12, 10);
  SFX.explosion();
  document.exitPointerLock && document.exitPointerLock();
  feed('You died — respawning at 🔵 base…', '#ffb454');
}
function respawnPlayer() {
  const a = rand(0, TAU);
  player.pos.set(BLUE_BASE.x + Math.cos(a) * 10, 0, BLUE_BASE.z + Math.sin(a) * 10);
  player.vel.set(0, 0, 0);
  player.yaw = 0.55; player.pitch = 0;
  player.shield = player.maxShield; player.health = player.maxHealth;
  player.ammo = player.magSize; player.grenades = 4; player.reloading = 0;
  player.shieldDelay = 2; player.dead = false; player.vehicle = null;
  refreshTouchUI();
  SFX.pickup();
  feed('🔵 Back in the fight!', '#51ff7a');
}
function updateTop() {
  $('blue-caps').textContent = blueCaps;
  $('red-caps').textContent = redCaps;
  $('score').textContent = score;
  $('kills').textContent = kills;
  const rAlive = enemies.filter(e => e.alive).length;
  const mAlive = marines.filter(m => m.alive).length;
  const flagWord = (f) => f.state === 'home' ? 'HOME' : f.state === 'carried' ? (f.carrier === 'player' ? 'YOU HAVE IT' : 'TAKEN') : 'DROPPED';
  $('objective').textContent = `⬢ CTF first to ${CAPS_TO_WIN} · 🔵 ${mAlive} vs ${rAlive} 🔴 · us: ${flagWord(flags.BLUE)} · theirs: ${flagWord(flags.RED)}`;
}

/* ================= ENTER / EXIT VEHICLES ================= */
let nearVehicle = null;
function findNearVehicle() {
  let best = null, bd = 5.2;
  const p = player.vehicle ? player.vehicle.pos : player.pos;
  for (const v of vehicles) {
    if (v.dead || v === player.vehicle) continue;
    const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
function enterVehicle(v) {
  if (flags.RED.carrier === 'player') dropFlag('RED', player.pos);
  if (flags.BLUE.carrier === 'player') dropFlag('BLUE', player.pos);
  player.vehicle = v;
  SFX.pickup();
  feed(`Entered ${v.name}`, '#51ff7a');
  $('state-label').textContent = v.name.toUpperCase();
  $('vehicle-stats').classList.remove('hidden');
  engineStart();
  if (v.kind === 'wasp') { v.hoverY = Math.max(3, v.pos.y); }
}
function exitVehicle(forced) {
  const v = player.vehicle;
  if (!v) return;
  player.vehicle = null;
  const side = new THREE.Vector3(Math.cos(v.yaw + Math.PI / 2), 0, -Math.sin(v.yaw + Math.PI / 2));
  player.pos.set(v.pos.x + side.x * (v.radius + 1.2), 0, v.pos.z + side.z * (v.radius + 1.2));
  player.pos.y = v.kind === 'wasp' ? Math.max(0, v.pos.y - 1.5) : 0;
  player.vel.set(0, 0, 0);
  collideCircle(player.pos, 0.7);
  if (!forced) SFX.pickup();
  $('state-label').textContent = 'ON FOOT';
  $('vehicle-stats').classList.add('hidden');
}

/* ================= INPUT ================= */
// Touch devices: left stick moves, drag on screen aims, buttons fire/use/jump.
const _coarse = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
const _fine = (typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches);
const IS_TOUCH = location.search.includes('touch') || (_coarse && !_fine) ||
  (!_coarse && !_fine && 'ontouchstart' in window);
if (IS_TOUCH) document.body.classList.add('touch');
const touch = { moveX: 0, moveY: 0, jump: false, down: false, lookId: null, lookX: 0, lookY: 0, stickId: null };

function toggleVehicle() {
  if (state !== 'playing' || player.dead) return;
  if (player.vehicle) exitVehicle(false);
  else if (nearVehicle) enterVehicle(nearVehicle);
}
function startReload() {
  if (state === 'playing' && !player.vehicle && player.ammo < player.magSize && player.reloading <= 0) {
    player.reloading = 1.4; SFX.reload();
  }
}
function throwGrenade() {
  if (state !== 'playing' || player.grenades <= 0 || grenadeCd > 0 || player.vehicle) return;
  player.grenades--; grenadeCd = 1.0; SFX.grenade();
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const o = playerPos().add(dir.clone().multiplyScalar(1));
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x39e6ff, emissive: 0x39e6ff, emissiveIntensity: 1.5 }));
  mesh.position.copy(o); scene.add(mesh);
  projectiles.push({ mesh, vel: dir.multiplyScalar(22).add(new THREE.Vector3(0, 7, 0)), life: 2.0,
    damage: 110, friendly: true, explosive: 6, grenade: true, gravity: 18, byPlayer: true });
}
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE') toggleVehicle();
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyG') throwGrenade();
  if (e.code === 'KeyH') $('help-toast').classList.toggle('hidden');
  if (e.code === 'Escape' && state === 'playing') pauseGame();
  if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys[e.code] = false);
addEventListener('mousedown', (e) => {
  if (state !== 'playing') return;
  if (e.button === 0) firing = true;
  if (e.button === 2) { adsHeld = true; player.ads = true; }
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) firing = false;
  if (e.button === 2) { adsHeld = false; player.ads = false; }
});
addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('mousemove', (e) => {
  if (state !== 'playing') return;
  if (document.pointerLockElement === renderer.domElement) {
    const s = parseFloat($('sens')?.value || '1') * 0.0022 * (player.ads ? 0.5 : 1);
    player.yaw -= e.movementX * s;
    player.pitch = clamp(player.pitch - e.movementY * s, -1.45, 1.45);
  } else if (e.buttons === 1 || firing) { // drag-look fallback (headless / no lock)
    player.yaw -= e.movementX * 0.004;
    player.pitch = clamp(player.pitch - e.movementY * 0.004, -1.45, 1.45);
  }
});
renderer.domElement.addEventListener('click', () => {
  if (IS_TOUCH) return;
  if (state === 'playing' && document.pointerLockElement !== renderer.domElement) {
    try { renderer.domElement.requestPointerLock(); } catch (err) { }
  }
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement && state === 'playing' && !player.dead) {
    // don't force-pause on lock loss in headless; only show hint via pause if user pressed Esc
  }
});

/* ---- Touch controls: joystick, look-drag, buttons ---- */
function refreshTouchUI() {
  $('touch-ui').classList.toggle('hidden', !(IS_TOUCH && state === 'playing'));
}
{
  const stick = $('stick'), knob = $('stick-knob');
  const stickSet = (dx, dy) => {
    const m = Math.hypot(dx, dy), c = m > 1 ? 1 / m : 1;
    touch.moveX = dx * c; touch.moveY = -dy * c; // up on stick = forward
    knob.style.transform = `translate(calc(-50% + ${dx * c * 36}px), calc(-50% + ${dy * c * 36}px))`;
  };
  const stickMove = (e) => {
    const r = stick.getBoundingClientRect();
    stickSet((e.clientX - (r.left + r.width / 2)) / (r.width / 2),
      (e.clientY - (r.top + r.height / 2)) / (r.height / 2));
  };
  stick.addEventListener('pointerdown', (e) => {
    touch.stickId = e.pointerId;
    try { stick.setPointerCapture(e.pointerId); } catch (err) { }
    stickMove(e); e.preventDefault();
  });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === touch.stickId) stickMove(e); });
  const stickEnd = (e) => {
    if (e.pointerId !== touch.stickId) return;
    touch.stickId = null; touch.moveX = 0; touch.moveY = 0;
    knob.style.transform = 'translate(-50%,-50%)';
  };
  stick.addEventListener('pointerup', stickEnd);
  stick.addEventListener('pointercancel', stickEnd);

  const bindBtn = (id, down, up) => {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch (err) { }
      el.classList.add('active'); down();
    });
    const end = (e) => { e.stopPropagation(); el.classList.remove('active'); if (up) up(); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  bindBtn('btn-fire', () => { firing = true; }, () => { firing = false; });
  bindBtn('btn-jump', () => { touch.jump = true; }, () => { touch.jump = false; });
  bindBtn('btn-down', () => { touch.down = true; }, () => { touch.down = false; });
  bindBtn('btn-use', () => toggleVehicle());
  bindBtn('btn-nade', () => throwGrenade());
  bindBtn('btn-reload', () => startReload());
  bindBtn('btn-pause', () => {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  });
  // kill synthetic mouse events / scrolling inside the touch layer
  $('touch-ui').addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

  // drag anywhere on the 3D view to look (joystick/buttons sit above canvas)
  const cvs = renderer.domElement;
  cvs.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (state !== 'playing' || touch.lookId !== null) return;
    const t = e.changedTouches[0];
    touch.lookId = t.identifier; touch.lookX = t.clientX; touch.lookY = t.clientY;
  }, { passive: false });
  cvs.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (state !== 'playing') return;
    for (const t of e.changedTouches) {
      if (t.identifier !== touch.lookId) continue;
      const s = 0.0042 * (player.ads ? 0.6 : 1);
      player.yaw -= (t.clientX - touch.lookX) * s;
      player.pitch = clamp(player.pitch - (t.clientY - touch.lookY) * s, -1.45, 1.45);
      touch.lookX = t.clientX; touch.lookY = t.clientY;
    }
  }, { passive: false });
  const lookEnd = (e) => {
    for (const t of e.changedTouches) if (t.identifier === touch.lookId) touch.lookId = null;
  };
  cvs.addEventListener('touchend', lookEnd);
  cvs.addEventListener('touchcancel', lookEnd);
}

/* ================= MENU / FLOW ================= */
function startGame() {
  ac(); engineStart();
  $('menu').classList.add('hidden');
  $('gameover').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  // reset
  enemies.forEach(e => scene.remove(e.mesh)); enemies.length = 0;
  marines.forEach(m => scene.remove(m.mesh)); marines.length = 0;
  projectiles.forEach(p => scene.remove(p.mesh)); projectiles.length = 0;
  player.pos.set(0, 0, 6); player.vel.set(0, 0, 0);
  player.yaw = 0.55; player.pitch = 0;
  player.shield = 100; player.health = 100; player.ammo = 60; player.reloading = 0;
  player.grenades = 4; player.dead = false; player.vehicle = null;
  respawnT = 0; score = 0; kills = 0;
  vehicles.forEach((v, i) => {
    v.hp = v.maxHp; v.dead = false; v.group.visible = true; v.speed = 0;
    if (v.home) { v.pos.set(v.home.x, v.home.y, v.home.z); v.yaw = v.home.yaw; v.group.rotation.y = v.yaw; }
    if (v.vel) v.vel.set(0, 0, 0);
  });
  state = 'playing';
  refreshTouchUI();
  setupMatch();
  if (!IS_TOUCH) { try { renderer.domElement.requestPointerLock(); } catch (err) { } }
  feed(IS_TOUCH ? 'Team battle! Stick moves, drag aims, USE drives / flies.' : 'Team battle! E to drive / fly. Steal the 🔴 flag!', '#ffe9b0');
}
function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  refreshTouchUI();
  $('pause').classList.remove('hidden');
  document.exitPointerLock && document.exitPointerLock();
}
function resumeGame() {
  $('pause').classList.add('hidden');
  state = 'playing';
  refreshTouchUI();
  if (!IS_TOUCH) { try { renderer.domElement.requestPointerLock(); } catch (err) { } }
}
$('play-btn').addEventListener('click', startGame);
$('help-btn').addEventListener('click', () => $('menu-help').classList.toggle('hidden'));
$('resume-btn').addEventListener('click', resumeGame);
$('quit-btn').addEventListener('click', () => { $('pause').classList.add('hidden'); startGame(); });
$('restart-btn').addEventListener('click', startGame);

/* ================= WEAPON FIRE ================= */
let footCd = 0;
function updateFootWeapon(dt) {
  footCd -= dt; grenadeCd -= dt; player.reloading -= dt;
  if (player.reloading > 0) {
    $('reload-tip').classList.remove('hidden');
    if (player.reloading <= 0) { player.ammo = player.magSize; }
  } else $('reload-tip').classList.add('hidden');

  if (firing && footCd <= 0 && player.reloading <= 0) {
    if (player.ammo <= 0) { SFX.empty(); footCd = 0.3; player.reloading = 1.4; SFX.reload(); return; }
    player.ammo--; footCd = 0.115;
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    dir.x += rand(-0.012, 0.012); dir.y += rand(-0.012, 0.012); dir.z += rand(-0.012, 0.012);
    const o = playerPos().add(dir.clone().multiplyScalar(0.8)); o.y -= 0.1;
    fireProjectile(o, dir, { speed: 130, damage: 13, friendly: true, life: 1.6, byPlayer: true });
    player.muzzle.intensity = 14;
    setTimeout(() => player.muzzle.intensity = 0, 50);
    SFX.shoot();
    // recoil + gun kick
    player.pitch = clamp(player.pitch + 0.0035, -1.45, 1.45);
    player.gun.position.z = -0.68;
  }
  player.gun.position.z += ((-0.75 + (player.ads ? 0.12 : 0)) - player.gun.position.z) * Math.min(1, dt * 12);
  player.gun.position.x += (((player.ads ? 0 : 0.3)) - player.gun.position.x) * Math.min(1, dt * 12);
  $('crosshair').classList.toggle('ads', !!player.ads);
}
function vehicleFire(dt, v) {
  v.cooldown -= dt;
  if (!firing || v.cooldown > 0 || v.dead) return;
  const fwd = new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw));
  if (v.kind === 'warthog') {
    v.cooldown = 0.12;
    const o = v.pos.clone().setY(v.pos.y + 2.2).add(fwd.clone().multiplyScalar(2.5));
    const dir = fwd.clone(); dir.y = player.pitch * 0.6;
    // MG aims where driver looks (blend hull + camera)
    const look = new THREE.Vector3(); camera.getWorldDirection(look);
    fireProjectile(o, look, { speed: 140, damage: 11, friendly: true, life: 1.4, byPlayer: true });
    SFX.shoot();
  } else if (v.kind === 'tank') {
    v.cooldown = 1.4;
    const ty = v.turretYaw;
    const dir = new THREE.Vector3(-Math.sin(ty), player.pitch * 0.7, -Math.cos(ty));
    const o = v.pos.clone().setY(v.pos.y + 2.6)
      .add(new THREE.Vector3(-Math.sin(ty), 0, -Math.cos(ty)).multiplyScalar(3.4));
    fireProjectile(o, dir, { speed: 70, damage: 130, friendly: true, life: 3, size: 1.6, explosive: 8, color: 0xffd27a, byPlayer: true });
    SFX.tank();
    // recoil the barrel
    v.barrel.position.z = 1.8; setTimeout(() => v.barrel.position.z = 2.8, 180);
  } else if (v.kind === 'wasp') {
    v.cooldown = 0.16;
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    const side = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
    for (const s of [-1, 1]) {
      const o = v.pos.clone().setY(v.pos.y + 1.8)
        .add(new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw)).multiplyScalar(2))
        .add(side.clone().multiplyScalar(s * 2.2));
      fireProjectile(o, dir, { speed: 150, damage: 16, friendly: true, life: 1.8, byPlayer: true });
    }
    SFX.plasma();
  }
}

/* ================= UPDATES ================= */
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
function updatePlayer(dt) {
  // shield regen (Halo-style)
  player.shieldDelay -= dt;
  if (player.shieldDelay <= 0 && player.shield < player.maxShield) {
    player.shield = Math.min(player.maxShield, player.shield + 22 * dt);
  }
  if (player.vehicle) { updateVehicle(dt, player.vehicle); return; }

  const tMag = Math.hypot(touch.moveX, touch.moveY);
  const sprint = keys['ShiftLeft'] || keys['ShiftRight'] || (tMag > 0.92);
  const speed = (sprint ? 9.5 : 6.2) * (player.ads ? 0.55 : 1);
  const f = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const r = new THREE.Vector3(-f.z, 0, f.x);
  const wish = new THREE.Vector3();
  const mx = ((keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0)) + touch.moveX;
  const mz = ((keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0)) + touch.moveY;
  wish.addScaledVector(f, mz).addScaledVector(r, mx);
  if (wish.lengthSq() > 1) wish.normalize();
  wish.multiplyScalar(speed);
  const accel = player.onGround ? 14 : 4;
  player.vel.x += (wish.x - player.vel.x) * Math.min(1, accel * dt);
  player.vel.z += (wish.z - player.vel.z) * Math.min(1, accel * dt);
  // gravity / jump
  player.vel.y -= 22 * dt;
  if ((keys['Space'] || touch.jump) && player.onGround) { player.vel.y = 8.2; player.onGround = false; }
  player.pos.addScaledVector(player.vel, dt);
  if (player.pos.y <= 0) { player.pos.y = 0; player.vel.y = 0; player.onGround = true; }
  collideCircle(player.pos, 0.7);

  // head bob
  const moving = Math.hypot(player.vel.x, player.vel.z);
  const t = performance.now() * 0.001;
  camera.position.set(
    player.pos.x + Math.cos(t * 9) * 0.05 * Math.min(1, moving / 6),
    player.pos.y + EYE + Math.abs(Math.sin(t * 9)) * 0.06 * Math.min(1, moving / 6),
    player.pos.z
  );
  camera.rotation.set(player.pitch, player.yaw, 0);
  if (shake > 0) {
    camera.position.x += rand(-shake, shake) * 0.25;
    camera.position.y += rand(-shake, shake) * 0.25;
    shake = Math.max(0, shake - dt * 2.2);
  }
  updateFootWeapon(dt);
  nearVehicle = findNearVehicle();
  const pr = $('prompt');
  if (nearVehicle) { pr.textContent = IS_TOUCH ? `Tap USE to enter ${nearVehicle.name}` : `Press E to enter ${nearVehicle.name}`; pr.classList.remove('hidden'); }
  else pr.classList.add('hidden');
  // pickups
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (Math.hypot(p.mesh.position.x - player.pos.x, p.mesh.position.z - player.pos.z) < 2.2) {
      if (p.kind === 'shield') player.shield = player.maxShield;
      if (p.kind === 'health') player.health = player.maxHealth;
      if (p.kind === 'ammo') { player.ammo = player.magSize; player.grenades = Math.min(6, player.grenades + 2); }
      SFX.pickup(); feed(`${p.kind.toUpperCase()} acquired`, '#51ff7a');
      scene.remove(p.mesh); pickups.splice(i, 1);
    }
  }
}
function updateVehicle(dt, v) {
  const fwd = new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw));
  if (v.kind === 'warthog') {
    const accel = 22, max = v.topSpeed, grip = 3.2;
    const tY = touch.moveY;
    if (keys['KeyW'] || tY > 0.12) v.speed += accel * dt * (keys['KeyW'] ? 1 : Math.min(1, tY));
    if (keys['KeyS'] || tY < -0.12) v.speed -= (v.speed > 0 ? 30 : 12) * dt * (keys['KeyS'] ? 1 : Math.min(1, -tY));
    v.speed = clamp(v.speed, -10, max);
    const steer = clamp(((keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0)) - touch.moveX, -1, 1) * 1.7;
    v.yaw += steer * clamp(v.speed / max, -1, 1) * dt * (v.speed < 0 ? -1 : 1);
    if (keys['Space'] || touch.jump) v.speed *= (1 - 2.5 * dt); // handbrake
    else v.speed *= (1 - 0.35 * dt);
    v.pos.addScaledVector(new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw)), v.speed * dt);
    collideCircle(v.pos, v.radius);
    v.wheels.forEach(w => w.rotation.x += v.speed * dt * 1.4);
    v.group.rotation.y = v.yaw;
    v.group.rotation.z = -steer * clamp(Math.abs(v.speed) / max, 0, 1) * 0.08;
    // turret gun follows camera
    v.gun.lookAt(v.group.localToWorld(new THREE.Vector3(0, 2.5, -20)));
    engineUpdate(true, Math.abs(v.speed) / max, false);
  } else if (v.kind === 'tank') {
    const max = v.topSpeed;
    let throt = 0;
    if (keys['KeyW']) throt = 1;
    if (keys['KeyS']) throt = -0.7;
    if (!keys['KeyW'] && !keys['KeyS']) throt = touch.moveY > 0 ? touch.moveY : touch.moveY * 0.7;
    v.speed += (throt * max - v.speed) * Math.min(1, 2.2 * dt);
    if (keys['KeyA']) v.yaw += 1.1 * dt * (throt < 0 ? -1 : 1);
    if (keys['KeyD']) v.yaw -= 1.1 * dt * (throt < 0 ? -1 : 1);
    v.yaw -= touch.moveX * 1.1 * dt * (throt < 0 ? -1 : 1);
    v.pos.addScaledVector(new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw)), v.speed * dt);
    collideCircle(v.pos, v.radius);
    v.group.rotation.y = v.yaw;
    // turret follows camera yaw
    let want = player.yaw;
    let d = ((want - v.turretYaw + Math.PI * 3) % TAU) - Math.PI;
    v.turretYaw += clamp(d, -1.8 * dt, 1.8 * dt);
    v.turret.rotation.y = v.turretYaw - v.yaw;
    engineUpdate(true, Math.abs(v.speed) / max, false);
  } else if (v.kind === 'wasp') {
    // fly: mouse steers yaw/pitch via player.yaw/pitch; A/D strafe+turn
    if (keys['KeyA']) player.yaw += 1.4 * dt;
    if (keys['KeyD']) player.yaw -= 1.4 * dt;
    player.yaw -= touch.moveX * 1.4 * dt;
    v.yaw = player.yaw;
    const thrust = (keys['KeyW'] ? 34 : 0) - (keys['KeyS'] ? 18 : 0) + touch.moveY * 34;
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    v.vel.addScaledVector(dir, thrust * dt);
    // vertical
    if (keys['Space'] || keys['ShiftLeft'] || touch.jump) v.vel.y += 26 * dt;
    if (keys['KeyC'] || keys['ControlLeft'] || touch.down) v.vel.y -= 26 * dt;
    v.vel.multiplyScalar(1 - 1.1 * dt); // drag
    const sp = v.vel.length(), maxSp = v.topSpeed;
    if (sp > maxSp) v.vel.multiplyScalar(maxSp / sp);
    v.pos.addScaledVector(v.vel, dt);
    if (v.pos.y < 1.6) { v.pos.y = 1.6; v.vel.y = Math.max(0, v.vel.y); }
    if (v.pos.y > 130) { v.pos.y = 130; v.vel.y = Math.min(0, v.vel.y); }
    collideCircle(v.pos, v.radius);
    v.group.rotation.y = v.yaw;
    v.group.rotation.x = clamp(-v.vel.dot(new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw))) * 0.012, -0.4, 0.4);
    v.group.rotation.z = clamp(((keys['KeyA'] ? 0.3 : 0) - (keys['KeyD'] ? 0.3 : 0)) - touch.moveX * 0.3, -0.35, 0.35);
    if (v.group.userData.rotors) v.group.userData.rotors.forEach(r => r.rotation.y += dt * 22);
    engineUpdate(true, sp / maxSp, true);
  }
  vehicleFire(dt, v);
  // chase camera
  const back = v.kind === 'wasp' ? 11 : v.kind === 'tank' ? 10 : 8.5;
  const up = v.kind === 'wasp' ? 4.5 : 4.2;
  const cy = player.yaw, cp = clamp(player.pitch, -0.9, 0.6);
  tmpV.set(
    v.pos.x + Math.sin(cy) * Math.cos(cp) * back,
    v.pos.y + up - Math.sin(cp) * back * 0.7,
    v.pos.z + Math.cos(cy) * Math.cos(cp) * back
  );
  if (tmpV.y < 1.2) tmpV.y = 1.2;
  camera.position.lerp(tmpV, 1 - Math.pow(0.0001, dt));
  tmpV2.set(v.pos.x - Math.sin(cy) * 12, v.pos.y + 2 - Math.sin(cp) * 8, v.pos.z - Math.cos(cy) * 12);
  camera.lookAt(tmpV2);
  if (shake > 0) {
    camera.position.x += rand(-shake, shake) * 0.3;
    camera.position.y += rand(-shake, shake) * 0.3;
    shake = Math.max(0, shake - dt * 2.2);
  }
  nearVehicle = null;
  $('prompt').textContent = IS_TOUCH ? 'Tap USE to exit vehicle' : 'Press E to exit vehicle';
  $('prompt').classList.remove('hidden');
  const kmh = Math.round((v.kind === 'wasp' ? v.vel.length() : Math.abs(v.speed)) * 3.6);
  $('speed').textContent = v.kind === 'wasp' ? `${kmh} km/h · ALT ${Math.round(v.pos.y)}m` : `${kmh} km/h`;
  grenadeCd -= dt;
}
/* ---- shared bot helpers ---- */
function nearestRedSoldier(pos) {
  let best = null, bd = 1e9;
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
    if (d < bd) { bd = d; best = e; }
  }
  return best ? { ref: best, dist: bd } : null;
}
function nearestBlueSoldier(pos) {
  let best = null, bd = 1e9, kind = null;
  if (!player.dead) {
    const pp = playerPos();
    const d = Math.hypot(pp.x - pos.x, pp.z - pos.z);
    bd = d; best = 'player'; kind = 'player';
  }
  for (const m of marines) {
    if (!m.alive) continue;
    const d = Math.hypot(m.pos.x - pos.x, m.pos.z - pos.z);
    if (d < bd) { bd = d; best = m; kind = 'marine'; }
  }
  return best ? { ref: best, kind, dist: bd } : null;
}
function blueSoldierPos(s, out) {
  if (s.kind === 'player') return out.copy(playerPos());
  return out.copy(s.ref.pos).setY(s.ref.pos.y + 1.2);
}
// objective-driven movement with combat strafing; faces foe when present
function botMove(bot, dt, foePos, foeDist, objX, objZ, combatR = 45) {
  const px = bot.pos.x, pz = bot.pos.z;
  let tx, tz, hasFoe = foePos && foeDist < combatR;
  if (hasFoe) { tx = foePos.x; tz = foePos.z; }
  else if (objX !== undefined) { tx = objX; tz = objZ; }
  else return;
  tmpV.set(tx - px, 0, tz - pz);
  let dist = tmpV.length();
  if (!hasFoe && dist < 1.5) { bot.mesh.lookAt(tx, 0, tz); return; } // arrived (inside 3u flag-touch range)
  tmpV.normalize();
  bot.strafeT -= dt;
  if (bot.strafeT <= 0) { bot.strafeT = rand(1, 3); bot.strafe *= -1; }
  tmpV2.set(-tmpV.z * bot.strafe, 0, tmpV.x * bot.strafe).multiplyScalar(0.6);
  if (hasFoe) {
    if (dist > 26) tmpV.add(tmpV2.multiplyScalar(0.4));
    else if (dist < 9) tmpV.multiplyScalar(-0.8).add(tmpV2);
    else tmpV.multiplyScalar(0.25).add(tmpV2);
  } else tmpV.add(tmpV2.multiplyScalar(0.15));
  tmpV.y = 0;
  if (tmpV.lengthSq() > 0.01) {
    const sp = bot.speed * (bot.carrying ? 0.92 : 1);
    tmpV.normalize().multiplyScalar(sp * dt);
    bot.pos.x += tmpV.x; bot.pos.z += tmpV.z;
    collideCircle(bot.pos, 0.8);
  }
  if (foePos) bot.mesh.lookAt(foePos.x, 0, foePos.z);
  else bot.mesh.lookAt(tx, 0, tz);
  bot.bob += dt * 6;
  bot.mesh.position.y = Math.abs(Math.sin(bot.bob)) * 0.15;
  if (bot.flash > 0) { bot.flash -= dt; bot.mesh.scale.setScalar(1.12); }
  else bot.mesh.scale.setScalar(1);
}
function updateEnemies(dt) {
  const diff = Math.min(0.8, matchT * 0.004);
  for (const e of enemies) {
    if (!e.alive) continue;
    e.cooldown -= dt;
    // objective
    let obj = null;
    const carryingBlue = flags.BLUE.carrier === e;
    if (carryingBlue) obj = { x: RED_BASE.x, z: RED_BASE.z };
    else if (flags.RED.state === 'dropped') { flagPos(flags.RED, _fp); obj = { x: _fp.x, z: _fp.z }; }
    else if (e.role === 'defend') {
      const foeNear = nearestBlueSoldier(e.pos);
      obj = (foeNear && foeNear.dist < 50) ? null : { x: RED_BASE.x + (e.anchorX || 0), z: RED_BASE.z + (e.anchorZ || 0) };
      if (!e.anchorX) { e.anchorX = rand(-14, 14); e.anchorZ = rand(-14, 14); obj = { x: RED_BASE.x + e.anchorX, z: RED_BASE.z + e.anchorZ }; }
    } else {
      if (flags.BLUE.state === 'carried') { const c = flags.BLUE.carrier; const cp = c === 'player' ? playerPos() : c.pos; obj = { x: cp.x, z: cp.z }; }
      else { flagPos(flags.BLUE, _fp); obj = { x: _fp.x, z: _fp.z }; }
    }
    const foe = nearestBlueSoldier(e.pos);
    let foePos = null;
    if (foe) { foePos = blueSoldierPos(foe, tmpV2).clone(); }
    botMove(e, dt, foePos, foe ? foe.dist : 1e9, obj ? obj.x : undefined, obj ? obj.z : undefined);
    e.carrying = carryingBlue;
    // touch BLUE flag (grab) / touch RED flag (return ours)
    flagPos(flags.BLUE, _fp);
    if (!carryingBlue && flags.BLUE.state !== 'carried' && Math.hypot(e.pos.x - _fp.x, e.pos.z - _fp.z) < 3) {
      pickupFlag('BLUE', e); e.carrying = true;
    }
    flagPos(flags.RED, _fp);
    if (flags.RED.state === 'dropped' && Math.hypot(e.pos.x - _fp.x, e.pos.z - _fp.z) < 3) returnFlag('RED');
    // deliver BLUE flag to RED base
    if (carryingBlue && Math.hypot(e.pos.x - RED_BASE.x, e.pos.z - RED_BASE.z) < BASE_R) {
      if (flags.RED.state === 'home') captureFlag('RED');
    }
    // attack
    if (foe && foe.dist < 70 && e.cooldown <= 0) {
      e.cooldown = rand(1.2, 2.6) - diff;
      const o = e.pos.clone(); o.y = e.type === 'elite' ? 1.8 : 1.0;
      const dir = foePos.clone().sub(o).normalize();
      dir.x += rand(-0.05, 0.05); dir.y += rand(-0.02, 0.03); dir.z += rand(-0.05, 0.05);
      fireProjectile(o, dir, { speed: e.type === 'elite' ? 42 : 34, damage: e.type === 'elite' ? 9 : 6, friendly: false, life: 3.2, size: 1.2 });
      SFX.enemyShoot();
      burst(o, 0xff5a3c, 3, 3, 3);
    }
  }
}
function updateMarines(dt) {
  for (const m of marines) {
    if (!m.alive) continue;
    m.cooldown -= dt;
    let obj = null;
    const carryingRed = flags.RED.carrier === m;
    if (carryingRed) obj = { x: BLUE_BASE.x, z: BLUE_BASE.z };
    else if (flags.BLUE.state === 'dropped') { flagPos(flags.BLUE, _fp); obj = { x: _fp.x, z: _fp.z }; }
    else if (m.role === 'defend') {
      const foeNear = nearestRedSoldier(m.pos);
      obj = (foeNear && foeNear.dist < 50) ? null : { x: BLUE_BASE.x + (m.anchorX || 0), z: BLUE_BASE.z + (m.anchorZ || 0) };
      if (!m.anchorX) { m.anchorX = rand(-14, 14); m.anchorZ = rand(-14, 14); obj = { x: BLUE_BASE.x + m.anchorX, z: BLUE_BASE.z + m.anchorZ }; }
    } else {
      if (flags.RED.state === 'carried' && flags.RED.carrier !== 'player') { const c = flags.RED.carrier; obj = { x: c.pos.x, z: c.pos.z }; }
      else if (flags.RED.state === 'carried' && flags.RED.carrier === 'player') { const pp = playerPos(); obj = { x: pp.x, z: pp.z }; } // escort the player
      else { flagPos(flags.RED, _fp); obj = { x: _fp.x, z: _fp.z }; }
    }
    const foe = nearestRedSoldier(m.pos);
    let foePos = null;
    if (foe) foePos = tmpV2.set(foe.ref.pos.x, foe.ref.pos.y + 1.2, foe.ref.pos.z).clone();
    botMove(m, dt, foePos, foe ? foe.dist : 1e9, obj ? obj.x : undefined, obj ? obj.z : undefined);
    m.carrying = carryingRed;
    // touch RED flag (grab) / touch BLUE flag (return ours)
    flagPos(flags.RED, _fp);
    if (!carryingRed && flags.RED.state !== 'carried' && Math.hypot(m.pos.x - _fp.x, m.pos.z - _fp.z) < 3) {
      pickupFlag('RED', m); m.carrying = true;
    }
    flagPos(flags.BLUE, _fp);
    if (flags.BLUE.state === 'dropped' && Math.hypot(m.pos.x - _fp.x, m.pos.z - _fp.z) < 3) returnFlag('BLUE');
    // deliver RED flag to BLUE base
    if (carryingRed && Math.hypot(m.pos.x - BLUE_BASE.x, m.pos.z - BLUE_BASE.z) < BASE_R) {
      if (flags.BLUE.state === 'home') captureFlag('BLUE');
    }
    // attack
    if (foe && foe.dist < 65 && m.cooldown <= 0) {
      m.cooldown = rand(1.0, 2.2);
      const o = m.pos.clone(); o.y = 1.6;
      const dir = foePos.clone().sub(o).normalize();
      dir.x += rand(-0.06, 0.06); dir.y += rand(-0.02, 0.04); dir.z += rand(-0.06, 0.06);
      fireProjectile(o, dir, { speed: 120, damage: 10, friendly: true, life: 1.6 });
      burst(o, 0xaef4ff, 3, 3, 3);
    }
  }
}
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    if (p.gravity) p.vel.y -= p.gravity * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    const mp = p.mesh.position;
    let dead = p.life <= 0 || mp.y < 0 || Math.hypot(mp.x, mp.z) > WORLD_R + 30 || mp.y > 200;
    // obstacle hit
    if (!dead && mp.y < 8) {
      for (const c of colliders) {
        if (Math.hypot(mp.x - c.x, mp.z - c.z) < c.r && mp.y < 10) { dead = true; break; }
      }
    }
    if (!dead) {
      if (p.friendly) {
        for (const e of enemies) {
          if (!e.alive) continue;
          tmpV.set(mp.x - e.pos.x, mp.y - (e.pos.y + 1.2), mp.z - e.pos.z);
          if (tmpV.length() < (e.type === 'elite' ? 1.7 : 1.2) + 0.4) {
            if (p.explosive) { dead = true; explode(mp.clone(), p.explosive, p.damage, true, p.byPlayer); }
            else { damageEnemy(e, p.damage, playerPos(), p.byPlayer); dead = true; burst(mp.clone(), 0xaef4ff, 4, 5, 4); }
            break;
          }
        }
      } else {
        // enemy bolt vs player / vehicle / marines
        const pp = playerPos();
        const rr = player.vehicle ? player.vehicle.radius + 0.6 : 0.9;
        tmpV.set(mp.x - pp.x, mp.y - pp.y, mp.z - pp.z);
        if (!player.dead && tmpV.length() < rr) {
          damagePlayer(p.damage, mp.clone());
          burst(mp.clone(), 0xff5a3c, 4, 4, 4);
          dead = true;
        }
        if (!dead) {
          for (const m of marines) {
            if (!m.alive) continue;
            tmpV.set(mp.x - m.pos.x, mp.y - (m.pos.y + 1.2), mp.z - m.pos.z);
            if (tmpV.length() < 1.8) {
              damageMarine(m, p.damage, mp.clone());
              burst(mp.clone(), 0xff5a3c, 4, 4, 4);
              dead = true;
              break;
            }
          }
        }
        // friendly vehicles can be hit too (splash handled in explode)
      }
    }
    if (dead) {
      if (p.explosive && p.grenade && p.life > 0) { // grenade landed / impacted: explode now
        explode(mp.clone(), p.explosive, p.damage, true, p.byPlayer);
      } else if (p.explosive && !p.grenade) {
        explode(mp.clone(), p.explosive, p.damage, p.friendly, p.byPlayer);
      } else if (!p.explosive) {
        burst(mp.clone(), p.friendly ? 0xaef4ff : 0xff5a3c, 3, 3, 2);
      }
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
    }
  }
  // grenade fuse: explode at end of life even mid-air
  // (handled by life<=0 branch above since grenades are explosive)
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.vel.y -= 14 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.vel.set(0, 0, 0); }
    p.mesh.rotation.x += dt * 4; p.mesh.rotation.y += dt * 3;
    p.mesh.material.opacity = clamp(p.life * 1.6, 0, 1);
    if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); }
  }
}
function updatePickups(dt) {
  const t = performance.now() * 0.001;
  for (const p of pickups) {
    p.mesh.rotation.y = t * 1.6 + p.t;
    p.mesh.position.y = 1.0 + Math.sin(t * 2 + p.t) * 0.18;
  }
  // idle vehicles: spin beacons? subtle bob for wasp
  for (const v of vehicles) {
    if (v === player.vehicle || v.dead) continue;
    if (v.kind === 'wasp') {
      v.pos.y = 2.5 + Math.sin(t * 1.4 + v.pos.x) * 0.25;
      if (v.group.userData.rotors) v.group.userData.rotors.forEach(r => r.rotation.y += dt * 6);
    }
  }
}

/* ================= HUD + MINIMAP ================= */
const mm = $('minimap').getContext('2d');
function updateHUD() {
  player.gun.visible = !player.vehicle;
  const inWasp = !!(player.vehicle && player.vehicle.kind === 'wasp');
  if (IS_TOUCH) {
    $('btn-down').classList.toggle('hidden', !inWasp);
    $('btn-nade').classList.toggle('hidden', inWasp);
    $('btn-reload').classList.toggle('hidden', inWasp);
    const jb = $('btn-jump');
    const jl = inWasp ? '▲' : 'JUMP';
    if (jb.textContent !== jl) jb.textContent = jl;
  }
  $('shield-fill').style.width = `${(player.shield / player.maxShield) * 100}%`;
  $('health-fill').style.width = `${(player.health / player.maxHealth) * 100}%`;
  const v = player.vehicle;
  if (v) {
    $('hull-fill').style.width = `${(v.hp / v.maxHp) * 100}%`;
    $('weapon-name').textContent = v.kind === 'warthog' ? 'M41 CHAIN GUN' : v.kind === 'tank' ? '90MM CANNON' : 'WASP PLASMA CANNONS';
    $('ammo').textContent = v.kind === 'tank' ? (v.cooldown > 0 ? '···' : 'READY') : '∞';
  } else {
    $('weapon-name').textContent = player.ads ? 'MA5 — AIMING' : 'MA5 ASSAULT RIFLE';
    $('ammo').textContent = `${Math.max(0, Math.ceil(player.ammo))} / ∞  ·  ✸${player.grenades}`;
  }
  $('pos-label').textContent = v ? `HULL ${Math.ceil(v.hp)}` : `${Math.ceil(player.shield)}‖${Math.ceil(player.health)}`;
  // minimap
  mm.clearRect(0, 0, 180, 180);
  mm.save(); mm.translate(90, 90);
  const scale = 90 / (WORLD_R + 40);
  const yawRef = player.vehicle ? player.vehicle.yaw : player.yaw;
  mm.rotate(yawRef + Math.PI);
  // range ring + base
  mm.strokeStyle = 'rgba(57,230,255,.5)'; mm.beginPath(); mm.arc(0, 0, WORLD_R * scale, 0, TAU); mm.stroke();
  const px = player.vehicle ? player.vehicle.pos.x : player.pos.x;
  const pz = player.vehicle ? player.vehicle.pos.z : player.pos.z;
  const dot = (x, z, color, s = 3) => {
    mm.fillStyle = color;
    mm.fillRect((x - px) * scale - s / 2, (z - pz) * scale - s / 2, s, s);
  };
  for (const c of colliders) dot(c.x, c.z, 'rgba(140,170,185,.5)', 2);
  for (const p of pickups) dot(p.mesh.position.x, p.mesh.position.z, p.kind === 'shield' ? '#39e6ff' : p.kind === 'health' ? '#51ff7a' : '#ffb454', 3);
  for (const vv of vehicles) {
    if (vv.dead || vv === player.vehicle) continue;
    dot(vv.pos.x, vv.pos.z, vv.kind === 'wasp' ? '#c99aff' : vv.kind === 'tank' ? '#ffb454' : '#7dff6a', 5);
  }
  for (const e of enemies) if (e.alive) dot(e.pos.x, e.pos.z, '#ff4d5e', e.type === 'elite' ? 5 : 3);
  for (const m of marines) if (m.alive) dot(m.pos.x, m.pos.z, '#51ff7a', 4);
  // bases
  dot(BLUE_BASE.x, BLUE_BASE.z, '#39e6ff', 9);
  dot(RED_BASE.x, RED_BASE.z, '#ff4d5e', 9);
  // flags (blink when not home)
  const blink = (performance.now() % 800) < 500;
  for (const team of ['BLUE', 'RED']) {
    const f = flags[team];
    flagPos(f, _fp);
    dot(_fp.x, _fp.z, f.state === 'home' || blink ? TEAM_CSS[team] : '#ffffff', 6);
  }
  mm.restore();
  // player arrow
  mm.fillStyle = '#fff';
  mm.save(); mm.translate(90, 90); mm.rotate(0);
  mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(5, 5); mm.lineTo(-5, 5); mm.closePath(); mm.fill();
  mm.restore();
}

/* ================= MAIN LOOP ================= */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  if (state === 'menu') {
    menuCamA += dt * 0.08;
    camera.position.set(Math.cos(menuCamA) * 70, 26 + Math.sin(menuCamA * 0.7) * 6, Math.sin(menuCamA) * 70);
    camera.lookAt(0, 6, 0);
    updateParticles(dt); updatePickups(dt);
    // idle battle ambience: enemies wander not spawned yet; just spin halo glow
  } else if (state === 'playing') {
    matchT += dt;
    if (player.dead) {
      respawnT -= dt;
      $('prompt').classList.add('hidden');
      if (respawnT <= 0) respawnPlayer();
    } else updatePlayer(dt);
    updateEnemies(dt);
    updateMarines(dt);
    updateFlags(dt);
    updateReinforcements(dt);
    updateProjectiles(dt);
    updateParticles(dt);
    updatePickups(dt);
    updateHUD();
    if (!player.vehicle && !player.dead) engineUpdate(false, 0, false);
  } else if (state === 'paused' || state === 'over') {
    updateParticles(dt);
  }
  renderer.render(scene, camera);
}
animate();
// expose for automated capture check
window.__game = { player, vehicles, enemies, marines, flags, touch, IS_TOUCH, get state() { return state; }, get blueCaps() { return blueCaps; }, get redCaps() { return redCaps; }, startGame };
