import * as THREE from 'three';

// ============ SKI//HALO : Tribal Clash CTF ============
// Tribes (jetpack+ski+speed+spinfusor) x Halo (shields, vehicles, bases, CTF)

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e8);
scene.fog = new THREE.Fog(0x9fc0e8, 120, 620);

const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.1, 2000);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- utils ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

// ---------- audio (procedural, no assets) ----------
let AC = null;
function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch {} } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
function beep(freq, dur, type = 'square', vol = 0.12, slide = 0) {
  const ac = audio(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), ac.currentTime + dur);
  g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
}
function noiseBurst(dur = 0.4, vol = 0.25) {
  const ac = audio(); if (!ac) return;
  const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ac.createBufferSource(); s.buffer = buf;
  const g = ac.createGain(); g.gain.value = vol;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  s.connect(f); f.connect(g); g.connect(ac.destination); s.start();
}
const sfx = {
  rifle() { beep(880, 0.08, 'square', 0.08, -400); },
  disc() { beep(300, 0.25, 'sawtooth', 0.12, 500); },
  sniper() { beep(1400, 0.2, 'square', 0.1, -900); },
  boom() { noiseBurst(0.6, 0.35); beep(70, 0.5, 'sine', 0.3, -30); },
  hit() { beep(1200, 0.05, 'square', 0.07); },
  hurt() { beep(180, 0.15, 'sawtooth', 0.15, -80); },
  pickup() { beep(660, 0.1, 'sine', 0.15); setTimeout(() => beep(990, 0.12, 'sine', 0.15), 90); },
  capture() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'triangle', 0.2), i * 120)); },
  deny() { beep(220, 0.2, 'sawtooth', 0.12); },
  engine() { beep(90, 0.12, 'sawtooth', 0.05, 20); },
};

// ---------- terrain ----------
const MAP = 520, HALF = MAP / 2;
function terrainH(x, z) {
  let h = 0;
  h += Math.sin(x * 0.018) * Math.cos(z * 0.021) * 6;
  h += Math.sin(x * 0.05 + 1.3) * Math.cos(z * 0.043 + 0.7) * 1.6;
  // valley: raise edges, flatten center lane
  const edge = Math.pow(Math.abs(x) / HALF, 2) * 26;
  h += edge;
  // base plateaus
  const dBlue = Math.hypot(x, z - 195), dRed = Math.hypot(x, z + 195);
  if (dBlue < 60) h = lerp(4, h, clamp(dBlue / 60, 0, 1) ** 0.7);
  if (dRed < 60) h = lerp(4, h, clamp(dRed / 60, 0, 1) ** 0.7);
  // center hill
  const dc = Math.hypot(x, z);
  if (dc < 45) h += (1 - dc / 45) * 9;
  return h;
}

// walkable ground: terrain + base platforms (mesh boxes the height fn doesn't know about)
function platformTopAt(x, z) {
  for (const t of ['blue', 'red']) {
    const bz = TEAM[t].z;
    if (Math.abs(x) < 23 && Math.abs(z - bz) < 20) return baseInfo[t].y + 2.7;
  }
  return -1e9;
}
function groundY(x, z) { return Math.max(terrainH(x, z), platformTopAt(x, z)); }
{
  const hemi = new THREE.HemisphereLight(0xcfe5ff, 0x4a5a3a, 0.95); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.6); sun.position.set(120, 180, 60); scene.add(sun);
  const sun2 = new THREE.DirectionalLight(0x88aaff, 0.35); sun2.position.set(-100, 80, -120); scene.add(sun2);
  // sun sprite
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff6c9, fog: false }));
  sunMesh.position.set(500, 320, 200); scene.add(sunMesh);
  // clouds
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, fog: false });
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(rand(14, 30), 10, 8), cloudMat);
    c.position.set(rand(-500, 500), rand(120, 190), rand(-500, 500));
    c.scale.set(rand(1.4, 2.6), 0.45, 1); scene.add(c);
  }
}

// terrain mesh with vertex colors
{
  const SEG = 128;
  const geo = new THREE.PlaneGeometry(MAP, MAP, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = [];
  const cGrass = new THREE.Color(0x5d9e4a), cDry = new THREE.Color(0x9aa04e),
    cRock = new THREE.Color(0x8a8d90), cSnow = new THREE.Color(0xe8eef4), cSand = new THREE.Color(0xc9b37a);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = terrainH(x, z);
    pos.setY(i, h);
    const slope = Math.abs(Math.sin(x * 0.018) * 0.4);
    tmp.copy(cGrass).lerp(cDry, clamp((h + 4) / 18, 0, 1) * 0.7 + slope * 0.2);
    if (h > 14) tmp.lerp(cRock, clamp((h - 14) / 12, 0, 1));
    if (h > 26) tmp.lerp(cSnow, clamp((h - 26) / 10, 0, 1));
    const dc = Math.hypot(x, z);
    if (dc < 20) tmp.lerp(cSand, 0.55);
    // team tint near bases
    if (z > 150) tmp.lerp(new THREE.Color(0x4d7dd1), 0.18);
    if (z < -150) tmp.lerp(new THREE.Color(0xd14d4d), 0.18);
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  scene.add(new THREE.Mesh(geo, mat));
}

// scattered rocks + pines
{
  const rockGeo = new THREE.DodecahedronGeometry(1.6, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x7d8187 });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3d24 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e6b34 });
  for (let i = 0; i < 90; i++) {
    const x = rand(-HALF + 20, HALF - 20), z = rand(-HALF + 20, HALF - 20);
    if (Math.abs(z) > 130 && Math.abs(x) < 70) continue; // keep bases clear
    if (Math.hypot(x, z) < 30) continue;
    const y = terrainH(x, z);
    if (Math.random() < 0.45) {
      const r = new THREE.Mesh(rockGeo, rockMat);
      r.position.set(x, y + 0.5, z); r.scale.setScalar(rand(0.6, 2.4));
      r.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3)); scene.add(r);
    } else {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 3, 6), trunkMat);
      trunk.position.y = 1.5; g.add(trunk);
      for (let k = 0; k < 3; k++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6 - k * 0.6, 2.6, 7), leafMat);
        cone.position.y = 3.4 + k * 1.6; g.add(cone);
      }
      const s = rand(0.8, 1.7); g.scale.setScalar(s);
      g.position.set(x, y, z); scene.add(g);
    }
  }
}

// ---------- bases, pads, turrets, flags ----------
const TEAM = { blue: { color: 0x2e7bff, dark: 0x14356e, z: 195, name: 'BLUE' }, red: { color: 0xff4444, dark: 0x6e1414, z: -195, name: 'RED' } };

function box(w, h, d, color, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m;
}

const baseInfo = {};
const turrets = [];
const vehiclePads = [];

function buildBase(team) {
  const T = TEAM[team], bz = T.z, gy = terrainH(0, bz);
  const grp = new THREE.Group(); scene.add(grp);
  const add = (m) => grp.add(m);
  const platMat = new THREE.MeshLambertMaterial({ color: team === 'blue' ? 0x274a7d : 0x7d2727 });
  const trimMat = new THREE.MeshBasicMaterial({ color: T.color });
  // main platform
  const plat = new THREE.Mesh(new THREE.BoxGeometry(46, 3, 40), platMat); plat.position.set(0, gy + 1.2, bz); add(plat);
  // back wall + two towers
  const wall = new THREE.Mesh(new THREE.BoxGeometry(46, 10, 3), new THREE.MeshLambertMaterial({ color: 0x2b2f3a }));
  wall.position.set(0, gy + 6, bz + (team === 'blue' ? 19 : -19)); add(wall);
  for (const sx of [-18, 18]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 22, 8), new THREE.MeshLambertMaterial({ color: 0x3a4050 }));
    tower.position.set(sx, gy + 11, bz + (team === 'blue' ? 14 : -14)); add(tower);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.5, 8, 20), trimMat);
    ring.position.set(sx, gy + 20, bz + (team === 'blue' ? 14 : -14)); ring.rotation.x = Math.PI / 2; add(ring);
    const lamp = new THREE.PointLight(T.color, 60, 70); lamp.position.set(sx, gy + 21, bz + (team === 'blue' ? 14 : -14)); add(lamp);
  }
  // glowing landing strips
  for (const sx of [-8, 8]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 30), trimMat);
    strip.position.set(sx, gy + 2.8, bz); add(strip);
  }
  // flag pedestal
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3, 1.4, 10), new THREE.MeshLambertMaterial({ color: 0x222633 }));
  const fwd = team === 'blue' ? -1 : 1;
  ped.position.set(0, gy + 3.4, bz + fwd * 8); add(ped);
  // vehicle pads
  for (const sx of [-14, 14]) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.5, 12), new THREE.MeshLambertMaterial({ color: 0x1c2030 }));
    pad.position.set(sx, gy + 2.9, bz + fwd * -2); add(pad);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.3, 8, 24), trimMat);
    glow.position.set(sx, gy + 3.2, bz + fwd * -2); glow.rotation.x = Math.PI / 2; add(glow);
    vehiclePads.push({ team, x: sx, z: bz + fwd * -2, y: gy + 3.2 });
  }
  // hologram beacon
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.2, 26, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: T.color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.set(0, gy + 18, bz + fwd * 8); add(beam);
  // spawn points (staging ridge just off the platform, clear view downfield)
  const spawns = [];
  for (let i = 0; i < 5; i++) spawns.push(new THREE.Vector3((i - 2) * 5, gy + 5, bz + (team === 'blue' ? -27 : 27)));
  baseInfo[team] = { y: gy, flagPos: new THREE.Vector3(0, gy + 4.2, bz + fwd * 8), spawns, beam };
  // turrets (2 per base, on towers' front)
  for (const sx of [-18, 18]) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 2.4, 8), new THREE.MeshLambertMaterial({ color: 0x222633 }));
    base.position.y = 1.2; g.add(base);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 2.6), new THREE.MeshLambertMaterial({ color: team === 'blue' ? 0x9fc2ff : 0xff9f9f }));
    head.position.y = 2.8; g.add(head);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3.4, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 2.8, 1.8); g.add(barrel);
    g.position.set(sx, gy + 21.5, bz + (team === 'blue' ? 8 : -8));
    scene.add(g);
    turrets.push({ team, mesh: g, head, pos: g.position.clone(), hp: 220, maxHp: 220, cd: 0, alive: true });
  }
  // big team letter
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d'); ctx.fillStyle = team === 'blue' ? '#2e7bff' : '#ff4444';
  ctx.fillRect(0, 0, 128, 128); ctx.fillStyle = '#fff'; ctx.font = 'bold 84px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(team === 'blue' ? 'B' : 'R', 64, 70);
  const tex = new THREE.CanvasTexture(c);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ map: tex, transparent: false }));
  sign.position.set(0, gy + 12, bz + (team === 'blue' ? 17.4 : -17.4));
  sign.rotation.y = team === 'blue' ? Math.PI : 0;
  scene.add(sign);
}
buildBase('blue'); buildBase('red');

// center spire (landmark + cover)
{
  const y = terrainH(0, 0);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(4, 8, 42, 8), new THREE.MeshLambertMaterial({ color: 0x565d6e }));
  spire.position.set(0, y + 18, 0); scene.add(spire);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 1.4, 10, 24), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
  ring.position.set(0, y + 30, 0); ring.rotation.x = Math.PI / 2; scene.add(ring);
  const light = new THREE.PointLight(0xffd34d, 120, 120); light.position.set(0, y + 32, 0); scene.add(light);
  for (const [sx, sz] of [[-24, 0], [24, 0], [0, -20], [0, 20]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(6, rand(5, 9), 6), new THREE.MeshLambertMaterial({ color: 0x6b7280 }));
    p.position.set(sx, terrainH(sx, sz) + 3, sz); scene.add(p);
  }
}

// ---------- soldier / vehicle meshes ----------
function makeSoldierMesh(team) {
  const g = new THREE.Group();
  const col = team === 'blue' ? 0x2e7bff : 0xff5040;
  const dark = team === 'blue' ? 0x1a2c52 : 0x521a1a;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.6), new THREE.MeshLambertMaterial({ color: dark })); legs.position.y = 0.55; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 0.7), new THREE.MeshLambertMaterial({ color: col })); torso.position.y = 1.7; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd8c39a })); head.position.y = 2.65; g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.2), new THREE.MeshBasicMaterial({ color: team === 'blue' ? 0x9fe8ff : 0xffb09f })); visor.position.set(0, 2.65, 0.35); g.add(visor);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.35), new THREE.MeshLambertMaterial({ color: 0x222633 })); pack.position.set(0, 1.8, -0.55); g.add(pack);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 6), new THREE.MeshBasicMaterial({ color: 0x66d9ff, transparent: true, opacity: 0.9 }));
  flame.position.set(0, 1.1, -0.6); flame.rotation.x = Math.PI; flame.visible = false; g.add(flame); g.userData.flame = flame;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 1.5), new THREE.MeshLambertMaterial({ color: 0x14161c })); gun.position.set(0.5, 1.8, 0.7); g.add(gun);
  // shield bubble
  const bub = new THREE.Mesh(new THREE.SphereGeometry(1.7, 12, 10), new THREE.MeshBasicMaterial({ color: 0x66d9ff, transparent: true, opacity: 0.0, depthWrite: false }));
  bub.position.y = 1.6; g.add(bub); g.userData.bubble = bub;
  return g;
}

function makeBuggyMesh(team) {
  const g = new THREE.Group();
  const col = team === 'blue' ? 0x2e7bff : 0xff5040;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 4.2), new THREE.MeshLambertMaterial({ color: col })); body.position.y = 1.1; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 1.8), new THREE.MeshLambertMaterial({ color: 0x1c2030 })); cab.position.set(0, 1.8, -0.3); g.add(cab);
  const gunM = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 })); gunM.rotation.x = Math.PI / 2; gunM.position.set(0, 2.3, 1); g.add(gunM);
  const wg = new THREE.CylinderGeometry(0.65, 0.65, 0.5, 10); wg.rotateZ(Math.PI / 2);
  const wm = new THREE.MeshLambertMaterial({ color: 0x15161c });
  g.userData.wheels = [];
  for (const [sx, sz] of [[-1.3, 1.4], [1.3, 1.4], [-1.3, -1.4], [1.3, -1.4]]) {
    const w = new THREE.Mesh(wg, wm); w.position.set(sx, 0.65, sz); g.add(w); g.userData.wheels.push(w);
  }
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.25, 0.2), new THREE.MeshBasicMaterial({ color: 0xfff2b0 })); lamp.position.set(0, 1.2, 2.15); g.add(lamp);
  return g;
}
function makeTankMesh(team) {
  const g = new THREE.Group();
  const col = team === 'blue' ? 0x2a5fa8 : 0xa82a2a;
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 5.2), new THREE.MeshLambertMaterial({ color: col })); hull.position.y = 1.2; g.add(hull);
  const tur = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.9, 10), new THREE.MeshLambertMaterial({ color: 0x2b2f3a })); tur.position.y = 2.2; g.add(tur);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 4.4, 8), new THREE.MeshLambertMaterial({ color: 0x14161c }));
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 2.3, 2.8); g.add(barrel); g.userData.barrel = barrel;
  const tg = new THREE.BoxGeometry(1.1, 1.1, 5.6);
  const tm = new THREE.MeshLambertMaterial({ color: 0x1a1c22 });
  for (const sx of [-1.9, 1.9]) { const t = new THREE.Mesh(tg, tm); t.position.set(sx, 0.7, 0); g.add(t); }
  return g;
}
function makeWaspMesh(team) {
  const g = new THREE.Group();
  const col = team === 'blue' ? 0x53a8ff : 0xff7a5d;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 3.6), new THREE.MeshLambertMaterial({ color: col })); g.add(body);
  const cock = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshLambertMaterial({ color: 0x101828 })); cock.position.set(0, 0.5, 0.4); g.add(cock);
  for (const sx of [-1.5, 1.5]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 1.6), new THREE.MeshLambertMaterial({ color: 0x2b2f3a })); wing.position.set(sx, 0, -0.6); g.add(wing);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.2, 8), new THREE.MeshLambertMaterial({ color: 0x1c2030 })); pod.rotation.x = Math.PI / 2; pod.position.set(sx, -0.2, 0.2); g.add(pod);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 0.6, 8), new THREE.MeshBasicMaterial({ color: 0x66d9ff })); glow.rotation.x = Math.PI / 2; glow.position.set(sx, -0.2, -1.1); g.add(glow);
  }
  return g;
}

// ---------- game state ----------
const input = { f: 0, b: 0, l: 0, r: 0, jump: 0, jet: 0, sprint: 0, fire: 0 };
let yaw = 0, pitch = 0;
const WEAPONS = [
  { name: 'BR-55', dmg: 13, rate: 0.13, spread: 0.012, auto: true, range: 220, color: 0x9fe8ff },
  { name: 'SPINFUSOR', dmg: 60, rate: 0.9, spread: 0, auto: false, range: 300, color: 0x66ffcc },
  { name: 'LONGSHOT', dmg: 75, rate: 1.1, spread: 0.001, auto: false, range: 400, color: 0xffd34d },
];

const player = {
  isPlayer: true, team: 'blue', pos: new THREE.Vector3(0, 10, 180), vel: new THREE.Vector3(),
  yaw: 0, pitch: 0, hp: 100, maxHp: 100, shield: 75, maxShield: 75, shieldT: 0,
  jet: 100, skiing: false, onGround: false, alive: true, respawnT: 0, weapon: 0, fireCd: 0,
  vehicle: null, carrying: null, kills: 0, deaths: 0, speed: 0, credits: 150,
};
const bots = [];
const vehicles = [];
const projectiles = [];
const particles = [];
const tracers = [];
let scores = { blue: 0, red: 0 };
let matchT = 15 * 60, playing = false, over = false;
let flags = {};

function botName(i, team) {
  const pool = team === 'blue' ? ['Caboose', 'Tucker', 'Church', 'Simmons'] : ['Grif', 'Sarge', 'Donut', 'Lopez'];
  return pool[i % pool.length];
}

function spawnSoldierMesh(e) {
  if (!e.mesh) { e.mesh = makeSoldierMesh(e.team); scene.add(e.mesh); }
  e.mesh.visible = e.alive && !e.vehicle;
}

function respawn(e, first = false) {
  const info = baseInfo[e.team];
  const sp = info.spawns[Math.floor(Math.random() * info.spawns.length)];
  e.pos.set(sp.x + rand(-2, 2), sp.y + 1, sp.z + rand(-2, 2));
  e.vel.set(0, 0, 0); e.hp = e.maxHp || 100; e.shield = e.maxShield || 75;
  e.jet = 100; e.alive = true; e.carrying = null; e.fireCd = 0;
  if (e.isPlayer) { yaw = e.team === 'blue' ? 0 : Math.PI; pitch = 0; }
  else { e.think = rand(0, 0.5); e.role = e.role || (Math.random() < 0.5 ? 'cap' : Math.random() < 0.5 ? 'chase' : 'def'); e.stuck = 0; e.lastPos = e.pos.clone(); }
  spawnSoldierMesh(e);
  if (!first) burst(e.pos, e.team === 'blue' ? 0x66aaff : 0xff6666, 10);
}

// bots
for (let i = 0; i < 4; i++) bots.push({ team: 'blue', pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, hp: 100, maxHp: 100, shield: 75, maxShield: 75, shieldT: 9, jet: 100, alive: false, respawnT: rand(0, 2), weapon: i % 3, fireCd: 0, name: botName(i, 'blue'), role: i < 2 ? 'cap' : i === 2 ? 'chase' : 'def', kills: 0 });
for (let i = 0; i < 5; i++) bots.push({ team: 'red', pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, hp: 100, maxHp: 100, shield: 75, maxShield: 75, shieldT: 9, jet: 100, alive: false, respawnT: rand(0, 2), weapon: i % 3, fireCd: 0, name: botName(i, 'red'), role: i < 2 ? 'cap' : i === 2 ? 'chase' : 'def', kills: 0 });

// vehicles (at = optional delivery point override, used by the vehicle bay)
function spawnVehicle(kind, team, idx, at = null) {
  const pads = vehiclePads.filter(p => p.team === team);
  const pad = pads[idx % pads.length];
  let mesh = kind === 'buggy' ? makeBuggyMesh(team) : kind === 'tank' ? makeTankMesh(team) : makeWaspMesh(team);
  scene.add(mesh);
  // spread vehicles sharing a pad so they don't interpenetrate
  const lane = kind === 'buggy' ? -3 : kind === 'tank' ? 3 : 0.5;
  const p0 = new THREE.Vector3(pad.x + lane + (kind === 'wasp' ? idx * 2 : 0), pad.y + 1 + (kind === 'wasp' ? 1.5 : 0), pad.z);
  if (at) { p0.copy(at); }
  const v = {
    kind, team, mesh, pos: p0,
    vel: new THREE.Vector3(), yaw: team === 'blue' ? 0 : Math.PI, hp: kind === 'tank' ? 400 : kind === 'wasp' ? 220 : 260,
    maxHp: kind === 'tank' ? 400 : kind === 'wasp' ? 220 : 260,
    driver: null, fireCd: 0, dead: false, respawnT: 0, home: null, hoverH: 1,
  };
  v.home = v.pos.clone();
  mesh.position.copy(v.pos);
  mesh.rotation.y = v.yaw + (kind === 'wasp' ? 0 : Math.PI);
  vehicles.push(v); return v;
}
[['buggy', 'blue', 0], ['buggy', 'blue', 1], ['tank', 'blue', 0], ['wasp', 'blue', 1],
 ['buggy', 'red', 0], ['buggy', 'red', 1], ['tank', 'red', 0], ['wasp', 'red', 1]].forEach(([k, t, i]) => spawnVehicle(k, t, i));

// flags
function makeFlag(team) {
  const T = TEAM[team];
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 8), new THREE.MeshLambertMaterial({ color: 0xdadde5 })); pole.position.y = 3; g.add(pole);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshBasicMaterial({ color: T.color, side: THREE.DoubleSide }));
  cloth.position.set(1.35, 5, 0); g.add(cloth); g.userData.cloth = cloth;
  const light = new THREE.PointLight(T.color, 40, 40); light.position.y = 5; g.add(light);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 16, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: T.color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 8; g.add(beam);
  const p = baseInfo[team].flagPos.clone(); g.position.copy(p); scene.add(g);
  return { team, mesh: g, state: 'home', carrier: null, dropPos: null, dropT: 0, home: p.clone() };
}
flags.blue = makeFlag('blue'); flags.red = makeFlag('red');

// first-person gun
const gunGroup = new THREE.Group(); camera.add(gunGroup); scene.add(camera);
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.32), new THREE.MeshLambertMaterial({ color: 0x3a4358 })); body.position.set(0.24, -0.22, -0.5); gunGroup.add(body);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.06), new THREE.MeshLambertMaterial({ color: 0x222633 })); grip.position.set(0.24, -0.28, -0.38); gunGroup.add(grip);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.05), new THREE.MeshBasicMaterial({ color: 0x9fe8ff })); tip.position.set(0.24, -0.2, -0.68); gunGroup.add(tip); gunGroup.userData.tip = tip;
  const discRing = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 6, 14), new THREE.MeshBasicMaterial({ color: 0x66ffcc })); discRing.position.set(0.24, -0.22, -0.66); discRing.visible = false; gunGroup.add(discRing); gunGroup.userData.ring = discRing;
  // pull the whole viewmodel out + shrink so it reads as a proper FPS gun, not a wall
  gunGroup.scale.setScalar(0.55);
  gunGroup.position.set(0.1, 0.04, -0.45);
}

// ---------- particles / tracers ----------
const partGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
function burst(p, color, n = 12, spd = 10) {
  for (let i = 0; i < n; i++) {
    if (particles.length > 350) { const o = particles.shift(); scene.remove(o.mesh); }
    const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.copy(p);
    const v = new THREE.Vector3(rand(-1, 1), rand(0, 1.4), rand(-1, 1)).normalize().multiplyScalar(rand(spd * 0.3, spd));
    particles.push({ mesh: m, vel: v, life: rand(0.4, 1.1), max: 1 });
    scene.add(m);
  }
}
function tracer(a, b, color) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
  scene.add(l); tracers.push({ mesh: l, life: 0.12 });
}
function boom(p, big = 1) {
  burst(p, 0xff9d2e, 18 * big, 16 * big); burst(p, 0x555555, 10 * big, 8 * big); burst(p, 0xffd34d, 8 * big, 22 * big);
  sfx.boom();
}

// ---------- combat ----------
const killfeed = document.getElementById('killfeed');
function feed(html) {
  const d = document.createElement('div'); d.innerHTML = html; killfeed.prepend(d);
  while (killfeed.children.length > 6) killfeed.lastChild.remove();
  setTimeout(() => d.remove(), 6000);
}
function entityName(e) { return e.isPlayer ? 'YOU' : e.name; }
function damage(e, amt, killer, cause = '') {
  if (!e.alive || over || !playing) return;
  if (e.shield > 0) { const s = Math.min(e.shield, amt); e.shield -= s; amt -= s; e.shieldT = 0; e.mesh?.userData.bubble && (e.mesh.userData.bubble.material.opacity = 0.45); }
  e.hp -= amt;
  if (e.isPlayer) { sfx.hurt(); document.getElementById('hud').style.filter = 'brightness(1.4)'; setTimeout(() => document.getElementById('hud').style.filter = '', 90); }
  if (e.hp <= 0) kill(e, killer, cause);
}
function kill(e, killer, cause) {
  e.alive = false; e.respawnT = 3; e.hp = 0;
  burst(e.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xff3333, 16, 12);
  if (e.mesh) e.mesh.visible = false;
  // drop flag
  if (e.carrying) dropFlag(e.carrying, e.pos.clone());
  // eject from vehicle
  if (e.vehicle) exitVehicle(e, true);
  e.deaths = (e.deaths || 0) + 1;
  if (killer && killer !== e) killer.kills = (killer.kills || 0) + 1;
  const kn = killer ? entityName(killer) : '—';
  const vn = entityName(e);
  const kc = killer ? (killer.team === 'blue' ? '#5db4ff' : '#ff6b6b') : '#888';
  const vc = e.team === 'blue' ? '#5db4ff' : '#ff6b6b';
  let bonus = '';
  if (killer && killer.isPlayer && killer !== e) { player.credits += 100; bonus = ' <span style="color:#ffd34d">+100CR</span>'; }
  feed(`<b style="color:${kc}">${kn}</b> ${cause || 'fragged'} <b style="color:${vc}">${vn}</b>${bonus}`);
  if (e.isPlayer) {
    document.getElementById('respawn').classList.add('on');
    document.getElementById('respawnText').textContent = killer ? `${kn} got you ${cause}` : 'You died';
  }
}
function damageVehicle(v, amt, killer, cause = 'destroyed') {
  if (v.dead || !playing) return;
  v.hp -= amt;
  burst(v.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xffaa33, 6, 10);
  if (v.hp <= 0) {
    v.dead = true; v.respawnT = 15; boom(v.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 2);
    if (v.driver) { const d = v.driver; d.vehicle = null; d.pos.copy(v.pos).add(new THREE.Vector3(2, 2, 0)); d.vel.set(0, 4, 0); v.driver = null; damage(d, 25, killer, 'in explosion'); }
    v.mesh.visible = false;
    if (killer && killer.isPlayer) player.credits += 150;
    feed(`<b style="color:${killer?.team === 'blue' ? '#5db4ff' : '#ff6b6b'}">${killer ? entityName(killer) : '—'}</b> ${cause} <b>${v.kind.toUpperCase()}</b>${killer && killer.isPlayer ? ' <span style="color:#ffd34d">+150CR</span>' : ''}`);
  }
}

// flags logic
const msgEl = document.getElementById('msg');
let msgT = 0;
function showMsg(t, dur = 2.5) { msgEl.textContent = t; msgEl.style.opacity = 1; msgT = dur; }
function pickupFlag(flag, e) {
  flag.state = 'carried'; flag.carrier = e; e.carrying = flag;
  sfx.pickup(); burst(e.pos, flag.team === 'blue' ? 0x3388ff : 0xff3333, 10, 8);
  if (e.isPlayer && flag.team !== e.team) { player.credits += 50; showMsg('ENEMY FLAG TAKEN — RUN IT HOME! +50CR'); }
  else if (e.isPlayer) showMsg('FLAG RETURNED!');
  feed(`<b>${entityName(e)}</b> took the <b>${flag.team.toUpperCase()}</b> flag`);
}
function dropFlag(flag, pos) {
  flag.state = 'dropped'; flag.carrier = null; flag.dropPos = pos.clone(); flag.dropT = 30;
  if (flag.mesh) flag.mesh.position.copy(pos.clone().add(new THREE.Vector3(0, 0.5, 0)));
  const e = bots.concat([player]).find(x => x.carrying === flag); if (e) e.carrying = null;
}
function returnFlag(flag) {
  flag.state = 'home'; flag.carrier = null; flag.dropPos = null; flag.mesh.position.copy(flag.home);
}
function tryCapture(e) {
  const home = flags[e.team];
  if (e.carrying && home.state === 'home' && e.pos.distanceTo(home.home) < 6) {
    const taken = e.carrying; e.carrying = null;
    taken.state = 'home'; taken.carrier = null; taken.mesh.position.copy(taken.home);
    scores[e.team]++; sfx.capture();
    let cr = '';
    if (e.isPlayer) { player.credits += 500; cr = ' +500CR'; }
    showMsg(`${e.team.toUpperCase()} CAPTURES!  ${scores.blue} — ${scores.red}${cr}`, 3.5);
    feed(`<b style="color:${e.team === 'blue' ? '#5db4ff' : '#ff6b6b'}">${entityName(e)} CAPTURED the flag!</b> (${scores.blue}-${scores.red})`);
    burst(home.home, 0xffd34d, 30, 16);
    if (scores[e.team] >= 3) endMatch(e.team);
    return true;
  }
  return false;
}

// ---------- vehicles enter/exit ----------
const promptEl = document.getElementById('prompt');
function nearestVehicle(e, maxD = 4.5) {
  let best = null, bd = maxD;
  for (const v of vehicles) {
    if (v.dead || v.driver) continue;
    const d = e.pos.distanceTo(v.pos);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
function enterVehicle(e, v) {
  e.vehicle = v; v.driver = e;
  e.vel.set(0, 0, 0);
  if (e.mesh) e.mesh.visible = false;
  if (e.isPlayer) { showMsg(`${v.kind.toUpperCase()} — ${v.kind === 'wasp' ? 'W/S thrust · SPACE/C up/down' : 'WASD drive · CLICK fire'}`, 2.5); sfx.engine(); }
}
function exitVehicle(e, force = false) {
  const v = e.vehicle; if (!v) return;
  v.driver = null; e.vehicle = null;
  e.pos.copy(v.pos).add(new THREE.Vector3(2.5, 1.5, 0)); e.vel.set(0, 3, 0);
  if (e.alive && e.mesh) e.mesh.visible = true;
}

// ---------- vehicle bay: buy vehicles at base ----------
const VEH_COSTS = { buggy: 250, tank: 600, wasp: 800 };
const buyIdx = { blue: 2, red: 2 };
let buyOpen = false;
function nearOwnBase() {
  if (!playing || over) return false;
  const bz = TEAM[player.team].z;
  return Math.hypot(player.pos.x, player.pos.z - bz) < 48;
}
function toggleBuyMenu(force) {
  if (!playing || over) return;
  buyOpen = force !== undefined ? force : !buyOpen;
  el('buyMenu').classList.toggle('on', buyOpen);
  if (buyOpen) {
    el('buyCredits').textContent = player.credits;
    el('buyMsg').textContent = nearOwnBase() ? '' : '⚠ Must be at your base to buy!';
    document.querySelectorAll('#buyMenu .buyrow button').forEach(b => {
      b.disabled = player.credits < (VEH_COSTS[b.dataset.kind] || 1e9);
    });
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    refreshTouchVis();
  } else if (playing && !over && !isTouchUI() && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
  }
}
function buyVehicle(kind) {
  const msg = el('buyMsg');
  const say = t => { msg.textContent = t; };
  if (!playing || over || !player.alive) return false;
  const cost = VEH_COSTS[kind];
  if (cost === undefined) return false;
  if (!nearOwnBase()) { say('⚠ Must be at your base to buy!'); sfx.deny(); return false; }
  if (player.credits < cost) { say('Not enough credits — kills +100, captures +500!'); sfx.deny(); return false; }
  if (vehicles.filter(v => v.team === player.team && !v.dead).length >= 10) { say('Motor pool full (10 max)!'); sfx.deny(); return false; }
  // deliver to a free spot on the staging ridge in front of base (pads stay for stock vehicles)
  const bz = TEAM[player.team].z, dz = player.team === 'blue' ? -27 : 27;
  let spot = null;
  for (let k = 0; k < 8; k++) {
    const x = (((buyIdx[player.team] + k) % 8) - 3.5) * 4;
    const z = bz + dz;
    const y = groundY(x, z);
    const blocked = vehicles.some(v => !v.dead && Math.hypot(v.pos.x - x, v.pos.z - z) < 6);
    if (!blocked) { spot = new THREE.Vector3(x, y + 1 + (kind === 'wasp' ? 1.5 : 0), z); break; }
  }
  if (!spot) { say('Delivery zone blocked — move away from the ridge!'); sfx.deny(); return false; }
  buyIdx[player.team]++;
  player.credits -= cost;
  const v = spawnVehicle(kind, player.team, buyIdx[player.team], spot);
  burst(v.pos.clone().add(new THREE.Vector3(0, 2, 0)), 0xffd34d, 18, 10);
  sfx.engine();
  feed(`<b>YOU</b> bought a <b>${kind.toUpperCase()}</b> <span style="color:#ffd34d">-${cost}CR</span>`);
  showMsg(`${kind.toUpperCase()} DELIVERED TO PAD!`, 2);
  toggleBuyMenu(false);
  return true;
}

// ---------- shooting ----------
function muzzleWorld() {
  const d = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  return { origin: camera.position.clone(), dir: d };
}
function shootHitscan(owner, dmg, spread, range, color) {
  const { origin, dir } = owner.isPlayer && !owner.vehicle ? muzzleWorld() : (() => {
    const o = owner.pos.clone().add(new THREE.Vector3(0, 1.7, 0));
    const d = new THREE.Vector3(Math.sin(owner.yaw) * -1, 0, Math.cos(owner.yaw) * -1);
    if (!owner.isPlayer) d.y = 0.05;
    return { origin: o, dir: d.normalize() };
  })();
  dir.x += rand(-spread, spread); dir.y += rand(-spread, spread); dir.z += rand(-spread, spread); dir.normalize();
  const end = origin.clone().add(dir.clone().multiplyScalar(range));
  // find nearest victim
  let bestT = range, hitE = null, hitV = null, hitTur = null, hitP = end.clone();
  const testEntity = (e) => {
    if (e === owner || !e.alive || e.team === owner.team) return;
    const c = e.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
    const to = c.clone().sub(origin); const t = to.dot(dir);
    if (t < 0 || t > bestT) return;
    const perp = c.clone().sub(origin.clone().add(dir.clone().multiplyScalar(t)));
    if (perp.length() < (e.vehicle ? 2.5 : 1.6)) { bestT = t; hitE = e; hitV = null; hitTur = null; hitP = origin.clone().add(dir.clone().multiplyScalar(t)); }
  };
  bots.concat([player]).forEach(testEntity);
  for (const v of vehicles) {
    if (v.dead) continue;
    if (v.driver === owner) continue;
    const c = v.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
    const to = c.clone().sub(origin); const t = to.dot(dir);
    if (t < 0 || t > bestT) continue;
    const perp = c.clone().sub(origin.clone().add(dir.clone().multiplyScalar(t)));
    const rad = v.kind === 'tank' ? 2.8 : 2.2;
    if (perp.length() < rad) { bestT = t; hitV = v; hitE = null; hitTur = null; hitP = origin.clone().add(dir.clone().multiplyScalar(t)); }
  }
  for (const t of turrets) {
    if (!t.alive || t.team === owner.team) continue;
    const to = t.pos.clone().sub(origin); const tt = to.dot(dir);
    if (tt < 0 || tt > bestT) continue;
    const perp = t.pos.clone().sub(origin.clone().add(dir.clone().multiplyScalar(tt)));
    if (perp.length() < 2.2) { bestT = tt; hitTur = t; hitE = null; hitV = null; hitP = origin.clone().add(dir.clone().multiplyScalar(tt)); }
  }
  tracer(origin.clone().add(dir.clone().multiplyScalar(1.5)), hitP, color);
  if (hitE) { damage(hitE, dmg, owner, 'sniped'); if (owner.isPlayer) hitmark(); burst(hitP, 0xff3333, 5, 6); }
  else if (hitV) { damageVehicle(hitV, dmg * 1.4, owner); if (owner.isPlayer) hitmark(); }
  else if (hitTur) { hitTur.hp -= dmg * 1.5; burst(hitP, 0xffaa33, 6, 8); if (owner.isPlayer) hitmark(); if (hitTur.hp <= 0) { hitTur.alive = false; hitTur.mesh.visible = false; boom(hitTur.pos, 1.5); } }
  else burst(hitP, 0xaaaaaa, 3, 4);
}
function fireDisc(owner, origin, dir) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: 0x66ffcc }));
  m.position.copy(origin); scene.add(m);
  const light = new THREE.PointLight(0x66ffcc, 20, 20); m.add(light);
  projectiles.push({ mesh: m, vel: dir.clone().multiplyScalar(75).add(owner.vel ? owner.vel.clone().multiplyScalar(0.5) : new THREE.Vector3()), owner, team: owner.team, dmg: 60, splash: 40, radius: 7, life: 3, kind: 'disc' });
  sfx.disc();
}
function fireShell(owner, origin, dir, dmg = 110, color = 0xffaa33) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color }));
  m.position.copy(origin); scene.add(m);
  projectiles.push({ mesh: m, vel: dir.clone().multiplyScalar(90), owner, team: owner.team, dmg, splash: dmg * 0.6, radius: 8, life: 3, kind: 'shell' });
  sfx.disc();
}
function explode(p) {
  boom(p.mesh.position, p.kind === 'shell' ? 1.6 : 1.1);
  // splash
  for (const e of bots.concat([player])) {
    if (!e.alive || e === p.owner) continue;
    const d = e.pos.clone().add(new THREE.Vector3(0, 1, 0)).distanceTo(p.mesh.position);
    if (d < p.radius) {
      if (e.team !== p.team) damage(e, lerp(p.dmg, p.splash, d / p.radius), p.owner, 'disc\'d');
    } else if (d < p.radius * 0.6 && e.team === p.team) { /* no team damage at close? skip */ }
  }
  for (const v of vehicles) {
    if (v.dead || v.driver === p.owner) continue;
    if (v.pos.distanceTo(p.mesh.position) < p.radius + 1) damageVehicle(v, p.dmg, p.owner);
  }
  scene.remove(p.mesh);
}
const hitEl = document.getElementById('hitmarker');
function hitmark() { hitEl.classList.remove('show'); void hitEl.offsetWidth; hitEl.classList.add('show'); sfx.hit(); }

// ---------- input ----------
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
  if (!playing || over) return;
  if (e.code === 'Digit1') player.weapon = 0;
  if (e.code === 'Digit2') player.weapon = 1;
  if (e.code === 'Digit3') player.weapon = 2;
  if (e.code === 'KeyC' && !player.vehicle) toggleSki();
  if (e.code === 'KeyB') toggleBuyMenu();
  if (e.code === 'KeyE') useAction();
  if (e.code === 'KeyF' && player.carrying) { dropFlag(player.carrying, player.pos.clone()); showMsg('FLAG DROPPED'); }
});
function toggleSki() {
  if (!playing || over || player.vehicle) return;
  player.skiing = !player.skiing;
  document.getElementById('skiInd').style.display = player.skiing ? 'block' : 'none';
}
function useAction() {
  if (!playing || over || !player.alive) return;
  if (player.vehicle) exitVehicle(player);
  else { const v = nearestVehicle(player); if (v) enterVehicle(player, v); else sfx.deny(); }
}
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('mousedown', e => { if (e.button === 0) input.fire = 1; });
addEventListener('mouseup', e => { if (e.button === 0) input.fire = 0; });
let dragging = false, lx = 0, ly = 0;
canvas.addEventListener('mousedown', () => { dragging = true; });
addEventListener('mouseup', () => dragging = false);
addEventListener('mousemove', e => {
  if (!playing || over || !player.alive) return;
  const locked = document.pointerLockElement === canvas;
  if (locked) { yaw -= e.movementX * 0.0022; pitch -= e.movementY * 0.0022; }
  else if (dragging && player.vehicle) { yaw -= (e.clientX - lx) * 0.005; pitch -= (e.clientY - ly) * 0.005; }
  lx = e.clientX; ly = e.clientY;
  pitch = clamp(pitch, -1.45, 1.45);
});
canvas.addEventListener('click', () => {
  if (playing && !over && !buyOpen && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
});

// ---------- touch controls (mobile) ----------
const touch = { jx: 0, jy: 0, jet: false, skiHeld: false, fullTilt: false };
function isTouchUI() { return document.body.classList.contains('touch'); }
addEventListener('touchstart', () => { document.body.classList.add('touch'); }, { capture: true, once: true, passive: true });
function refreshTouchVis() {
  el('touch').classList.toggle('ingame', playing && !over && isTouchUI());
}
{
  const stick = document.getElementById('stick'), nub = document.getElementById('nub');
  let stickId = null, cx = 0, cy = 0;
  const R = 44;
  stick.addEventListener('touchstart', e => {
    e.preventDefault(); e.stopPropagation();
    const t = e.changedTouches[0]; stickId = t.identifier;
    const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
  }, { passive: false });
  stick.addEventListener('touchmove', e => {
    e.preventDefault(); e.stopPropagation();
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const m = Math.hypot(dx, dy);
      if (m > R) { dx *= R / m; dy *= R / m; }
      nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      touch.jx = dx / R; touch.jy = -dy / R;
      touch.fullTilt = m > R * 0.92;
    }
  }, { passive: false });
  const endStick = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      stickId = null; touch.jx = 0; touch.jy = 0; touch.fullTilt = false;
      nub.style.transform = 'translate(-50%,-50%)';
    }
  };
  stick.addEventListener('touchend', endStick); stick.addEventListener('touchcancel', endStick);
  // look-drag on the 3D view (right side; stick/buttons stopPropagation so they never reach here)
  let lookId = null, lx2 = 0, ly2 = 0;
  canvas.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.35) continue;
      if (lookId === null) { lookId = t.identifier; lx2 = t.clientX; ly2 = t.clientY; }
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId) continue;
      if (!playing || over || !player.alive) continue;
      yaw -= (t.clientX - lx2) * 0.0048; pitch -= (t.clientY - ly2) * 0.0048;
      pitch = clamp(pitch, -1.45, 1.45);
      lx2 = t.clientX; ly2 = t.clientY;
    }
    e.preventDefault();
  }, { passive: false });
  const endLook = e => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
  canvas.addEventListener('touchend', endLook); canvas.addEventListener('touchcancel', endLook);
  // buttons
  const hold = (id, down, up) => {
    const b = document.getElementById(id);
    b.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); down(); }, { passive: false });
    b.addEventListener('touchend', e => { e.preventDefault(); up && up(); });
  };
  const tap = (id, fn) => {
    const b = document.getElementById(id);
    b.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
    b.addEventListener('click', e => { e.preventDefault(); fn(); });
  };
  hold('tFire', () => input.fire = 1, () => input.fire = 0);
  hold('tJet', () => touch.jet = true, () => touch.jet = false);
  let skiT = 0;
  hold('tSki', () => { touch.skiHeld = true; skiT = performance.now(); }, () => {
    touch.skiHeld = false;
    if (performance.now() - skiT < 250 && !player.vehicle) toggleSki();
  });
  tap('tWpn', () => { if (playing && !over) { player.weapon = (player.weapon + 1) % 3; sfx.hit(); } });
  tap('tUse', () => useAction());
  tap('tBuy', () => toggleBuyMenu());
}

// menu
const menuEl = document.getElementById('menu'), hudEl = document.getElementById('hud');
document.getElementById('playBtn').addEventListener('click', () => {
  audio(); startMatch(); canvas.requestPointerLock?.();
});
document.getElementById('againBtn').addEventListener('click', () => {
  document.getElementById('endscreen').classList.remove('on'); startMatch();
});
document.querySelectorAll('#buyMenu .buyrow button').forEach(b => {
  b.addEventListener('click', () => buyVehicle(b.dataset.kind));
});
document.getElementById('buyClose').addEventListener('click', () => toggleBuyMenu(false));
function startMatch() {
  menuEl.classList.add('hidden'); hudEl.classList.add('on');
  scores = { blue: 0, red: 0 }; matchT = 15 * 60; over = false; playing = true;
  returnFlag(flags.blue); returnFlag(flags.red);
  for (const v of vehicles) { scene.remove(v.mesh); }
  vehicles.length = 0;
  [['buggy', 'blue', 0], ['buggy', 'blue', 1], ['tank', 'blue', 0], ['wasp', 'blue', 1],
   ['buggy', 'red', 0], ['buggy', 'red', 1], ['tank', 'red', 0], ['wasp', 'red', 1]].forEach(([k, t, i]) => spawnVehicle(k, t, i));
  for (const t of turrets) { t.alive = true; t.hp = t.maxHp; t.mesh.visible = true; }
  player.vehicle = null; player.carrying = null; player.credits = 150; player.kills = 0; player.deaths = 0;
  buyOpen = false; el('buyMenu').classList.remove('on');
  respawn(player, true);
  player.pos.copy(baseInfo.blue.spawns[0]); player.pos.y += 1;
  bots.forEach((b, i) => { b.alive = false; b.respawnT = i * 0.4; b.vehicle = null; b.carrying = null; });
  document.getElementById('respawn').classList.remove('on');
  showMsg('CAPTURE THE FLAG — FIRST TO 3!', 3.5);
  sfx.capture();
  refreshTouchVis();
}
function endMatch(winner) {
  over = true;
  document.getElementById('endTitle').textContent = winner === 'blue' ? '🔷 BLUE VICTORY' : '🔴 RED VICTORY';
  document.getElementById('endTitle').style.color = winner === 'blue' ? '#5db4ff' : '#ff6b6b';
  document.getElementById('endSub').textContent = `Final ${scores.blue} — ${scores.red} · You: ${player.kills} kills`;
  document.getElementById('endscreen').classList.add('on');
  el('buyMenu').classList.remove('on'); buyOpen = false;
  refreshTouchVis();
  document.exitPointerLock?.();
}

// ---------- per-frame updates ----------
function groundMove(e, dt, wishX, wishZ, accel, maxSpd, friction) {
  // wish in world space (already rotated)
  const wv = new THREE.Vector3(wishX, 0, wishZ);
  if (wv.lengthSq() > 0) {
    wv.normalize().multiplyScalar(accel * dt);
    e.vel.x += wv.x; e.vel.z += wv.z;
  }
  // friction
  const fr = e.skiing && e.onGround ? 0.25 : friction;
  e.vel.x *= (1 - Math.min(1, fr * dt)); e.vel.z *= (1 - Math.min(1, fr * dt));
  const hs = Math.hypot(e.vel.x, e.vel.z);
  if (hs > maxSpd) { e.vel.x *= maxSpd / hs; e.vel.z *= maxSpd / hs; }
}

function updatePlayer(dt) {
  if (!player.alive) {
    player.respawnT -= dt;
    if (player.respawnT <= 0) { respawn(player); document.getElementById('respawn').classList.remove('on'); }
    return;
  }
  // gather input (keyboard + touch stick)
  let F = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + touch.jy;
  let S = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + touch.jx;
  F = clamp(F, -1, 1); S = clamp(S, -1, 1);
  const sprint = (keys.ShiftLeft || keys.ShiftRight || touch.fullTilt) ? 1 : 0;
  const jetting = (keys.Space || touch.jet) ? 1 : 0;

  if (player.vehicle) { updateDrivenVehicle(player, dt, F, S, jetting, sprint); return; }

  player.yaw = yaw;
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  // forward is -Z rotated by yaw... define: dir = (−sin(yaw)? verify) use camera quaternion instead
  const fwd = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const wish = fwd.clone().multiplyScalar(F).add(right.clone().multiplyScalar(S));
  const gy = groundY(player.pos.x, player.pos.z);
  player.onGround = player.pos.y <= gy + 2.05;

  const maxSpd = player.skiing ? 34 : sprint ? 12.5 : 8.2;
  const accel = player.onGround ? (player.skiing ? 14 : 60) : 22;
  groundMove(player, dt, wish.x, wish.z, accel, maxSpd, player.onGround ? 6 : 0.15);

  // gravity + jetpack + jump
  player.vel.y -= 24 * dt;
  if (jetting && player.jet > 0) {
    player.vel.y += 42 * dt;
    player.jet = Math.max(0, player.jet - 32 * dt);
    if (player.mesh?.userData.flame) player.mesh.userData.flame.visible = true;
    if (Math.random() < 0.5) burst(player.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 0x66d9ff, 1, 3);
  } else {
    player.jet = Math.min(100, player.jet + 16 * dt);
    if (player.mesh?.userData.flame) player.mesh.userData.flame.visible = false;
  }
  // ski downhill boost
  if (player.skiing && player.onGround) {
    const e = 1.2;
    const gx = (terrainH(player.pos.x + e, player.pos.z) - terrainH(player.pos.x - e, player.pos.z)) / (2 * e);
    const gz = (terrainH(player.pos.x, player.pos.z + e) - terrainH(player.pos.x, player.pos.z - e)) / (2 * e);
    player.vel.x -= gx * 22 * dt; player.vel.z -= gz * 22 * dt;
  }

  player.pos.add(player.vel.clone().multiplyScalar(dt));
  // ground collide
  const g2 = groundY(player.pos.x, player.pos.z);
  if (player.pos.y < g2 + 1.8) {
    if (!player.onGround && player.vel.y < -18) burst(player.pos, 0xcccccc, 8, 6);
    player.pos.y = g2 + 1.8; player.vel.y = Math.max(0, player.vel.y);
    player.onGround = true;
  } else player.onGround = player.pos.y <= g2 + 2.1;
  // bounds
  player.pos.x = clamp(player.pos.x, -HALF + 5, HALF - 5);
  player.pos.z = clamp(player.pos.z, -HALF + 5, HALF - 5);

  // base heal + shield regen
  player.shieldT += dt;
  if (player.shieldT > 4) player.shield = Math.min(player.maxShield, player.shield + 22 * dt);
  const homeD = player.pos.distanceTo(baseInfo[player.team].flagPos);
  player.hp = Math.min(player.maxHp, player.hp + (homeD < 25 ? 14 : 2.2) * dt);
  if (player.mesh?.userData.bubble) player.mesh.userData.bubble.material.opacity *= 0.9;

  // fire
  player.fireCd -= dt;
  const W = WEAPONS[player.weapon];
  gunGroup.userData.tip.material.color.setHex(W.color);
  gunGroup.userData.ring.visible = player.weapon === 1;
  if (input.fire && player.fireCd <= 0) {
    if (!W.auto && player._held) { /* wait release */ }
    else {
      player.fireCd = W.rate; player._held = true;
      const { origin, dir } = muzzleWorld();
      if (player.weapon === 1) fireDisc(player, origin.clone().add(dir.clone().multiplyScalar(1.2)), dir);
      else { shootHitscan(player, W.dmg, W.spread, W.range, W.color); sfx[W.name === 'LONGSHOT' ? 'sniper' : 'rifle'](); }
      // recoil
      pitch += player.weapon === 2 ? 0.02 : 0.004;
    }
  }
  if (!input.fire) player._held = false;

  // flags
  for (const k of ['blue', 'red']) {
    const f = flags[k];
    const fp = f.state === 'home' ? f.home : f.state === 'dropped' ? f.dropPos : null;
    if (fp && player.pos.distanceTo(fp) < 3.2) {
      if (f.team !== player.team && !player.carrying) pickupFlag(f, player);
      else if (f.team === player.team && f.state === 'dropped') { returnFlag(f); player.credits += 150; showMsg('FLAG RETURNED! +150CR'); sfx.pickup(); }
    }
  }
  tryCapture(player);
  player.speed = Math.hypot(player.vel.x, player.vel.z) * 3.6;

  // camera FPS
  camera.position.copy(player.pos).add(new THREE.Vector3(0, 1.1, 0));
  camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  gunGroup.visible = true;
}

function updateDrivenVehicle(p, dt, F, S, jet, boost) {
  const v = p.vehicle;
  p.pos.copy(v.pos);
  // steering
  if (v.kind === 'wasp') {
    v.yaw -= S * 1.6 * dt;
    const fwd = new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw));
    // pitch via F moves forward/back, space/C vertical
    const up = ((keys.Space || touch.jet) ? 1 : 0) - ((keys.KeyC || touch.skiHeld) ? 1 : 0);
    const spd = boost ? 46 : 30;
    v.vel.lerp(fwd.clone().multiplyScalar(F * spd).add(new THREE.Vector3(0, up * 20, 0)), 1 - Math.exp(-2.2 * dt));
    v.pos.add(v.vel.clone().multiplyScalar(dt));
    v.pos.y = clamp(v.pos.y, groundY(v.pos.x, v.pos.z) + 2.5, 80);
    v.mesh.rotation.set(lerp(v.mesh.rotation.x, -F * 0.25, 0.1), v.yaw, lerp(v.mesh.rotation.z, S * 0.3, 0.1));
    // fire plasma
    v.fireCd -= dt;
    if (input.fire && v.fireCd <= 0) {
      v.fireCd = 0.28;
      const dir = new THREE.Vector3(-Math.sin(v.yaw), -0.05, -Math.cos(v.yaw));
      fireShell({ ...p, vel: v.vel, team: v.team }, v.pos.clone().add(new THREE.Vector3(0, 1, 0)).add(dir.clone().multiplyScalar(3)), dir, 26, 0x66d9ff);
    }
  } else {
    const accel = v.kind === 'tank' ? 16 : 30;
    const maxS = (v.kind === 'tank' ? 16 : 30) * (boost ? 1.4 : 1);
    v.yaw -= S * (v.kind === 'tank' ? 1.2 : 1.8) * dt * (F >= 0 ? 1 : -1);
    const fwd = new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw));
    v.vel.add(fwd.clone().multiplyScalar(F * accel * dt));
    v.vel.multiplyScalar(1 - Math.min(1, 1.6 * dt));
    if (jet) v.vel.multiplyScalar(1 - Math.min(1, 3 * dt)); // handbrake
    const hs = Math.hypot(v.vel.x, v.vel.z);
    if (hs > maxS) { v.vel.x *= maxS / hs; v.vel.z *= maxS / hs; }
    v.pos.x += v.vel.x * dt; v.pos.z += v.vel.z * dt;
    v.pos.x = clamp(v.pos.x, -HALF + 5, HALF - 5); v.pos.z = clamp(v.pos.z, -HALF + 5, HALF - 5);
    v.pos.y = groundY(v.pos.x, v.pos.z) + (v.kind === 'tank' ? 0.6 : 0.4);
    v.mesh.rotation.y = v.yaw + (v.kind === 'wasp' ? 0 : Math.PI);
    // wheels spin
    v.mesh.userData.wheels?.forEach(w => w.rotation.x += hs * dt * 1.2);
    v.fireCd -= dt;
    if (input.fire && v.fireCd <= 0) {
      if (v.kind === 'tank') {
        v.fireCd = 1.4;
        const dir = new THREE.Vector3(-Math.sin(v.yaw), 0.04, -Math.cos(v.yaw));
        fireShell({ ...p, vel: v.vel, team: v.team }, v.pos.clone().add(new THREE.Vector3(0, 2.4, 0)).add(dir.clone().multiplyScalar(4)), dir, 120, 0xffaa33);
        v.vel.add(dir.clone().multiplyScalar(-3)); // recoil
      } else {
        v.fireCd = 0.12;
        const dir = new THREE.Vector3(-Math.sin(v.yaw), 0.01, -Math.cos(v.yaw));
        shootHitscan({ ...p, pos: v.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), yaw: v.yaw, team: v.team, vehicle: v }, 9, 0.02, 160, 0xffe28a);
      }
    }
  }
  v.mesh.position.copy(v.pos);
  p.speed = Math.hypot(v.vel.x, v.vel.z) * 3.6;
  // chase cam (pulled back so base towers don't swallow it)
  const back = new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw)).multiplyScalar(v.kind === 'wasp' ? 14 : 11);
  const desired = v.pos.clone().add(new THREE.Vector3(0, v.kind === 'wasp' ? 5.5 : 5, 0)).add(back);
  camera.position.lerp(desired, 1 - Math.exp(-8 * dt));
  const look = v.pos.clone().add(new THREE.Vector3(0, 2, 0));
  camera.lookAt(look);
  yaw = v.yaw; // keep sync so exit faces forward
  gunGroup.visible = false;
  // vehicle damaged smoke
  if (v.hp < v.maxHp * 0.4 && Math.random() < 0.3) burst(v.pos.clone().add(new THREE.Vector3(0, 2, 0)), 0x333333, 1, 4);
}

// bots AI
function updateBot(b, dt) {
  if (!b.alive) {
    b.respawnT -= dt;
    if (b.respawnT <= 0 && playing && !over) respawn(b);
    return;
  }
  if (!playing || over) return;
  b.fireCd -= dt; b.shieldT += dt;
  if (b.shieldT > 4) b.shield = Math.min(b.maxShield, b.shield + 20 * dt);
  b.think = (b.think || 0) - dt;

  const enemyFlag = flags[b.team === 'blue' ? 'red' : 'blue'];
  const homeFlag = flags[b.team];
  // decide target
  let target = null;
  // if I carry, go home
  if (b.carrying) target = homeFlag.home.clone();
  // chaser: hunt enemy carrier
  else if (b.role === 'chase') {
    const ec = bots.concat([player]).find(e => e.alive && e.carrying && e.carrying.team === b.team);
    if (ec) target = ec.pos.clone();
    else if (enemyFlag.state === 'carried' && enemyFlag.carrier) target = enemyFlag.carrier.pos.clone();
    else target = enemyFlag.state === 'home' ? enemyFlag.home.clone() : enemyFlag.dropPos.clone();
  }
  else if (b.role === 'def') {
    // guard home, but chase nearby enemies / return dropped flag
    if (homeFlag.state === 'dropped') target = homeFlag.dropPos.clone();
    else {
      const foe = nearestFoe(b.pos, b.team, 55);
      if (foe) target = foe.pos.clone();
      else target = homeFlag.home.clone().add(new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)));
      if (b.pos.distanceTo(homeFlag.home) < 12 && !foe && Math.random() < 0.01) target = enemyFlag.home.clone(); // occasional push
    }
  }
  else { // cap
    if (enemyFlag.state === 'home') target = enemyFlag.home.clone();
    else if (enemyFlag.state === 'dropped') target = enemyFlag.dropPos.clone();
    else if (enemyFlag.carrier && enemyFlag.carrier.team === b.team) target = homeFlag.home.clone(); // escort
    else target = enemyFlag.home.clone();
    // if home flag dropped and close, detour
    if (homeFlag.state === 'dropped' && b.pos.distanceTo(homeFlag.dropPos) < 40) target = homeFlag.dropPos.clone();
  }

  // steer
  const to = target.clone().sub(b.pos); to.y = 0;
  const dist = to.length();
  const desiredYaw = Math.atan2(-to.x, -to.z);
  b.yaw += clamp(angDiff(b.yaw, desiredYaw), -2.4 * dt, 2.4 * dt);
  const fwd = new THREE.Vector3(-Math.sin(b.yaw), 0, -Math.cos(b.yaw));
  const spd = dist > 60 ? 11 : 8;
  b.vel.x = lerp(b.vel.x, fwd.x * spd, 1 - Math.exp(-2 * dt));
  b.vel.z = lerp(b.vel.z, fwd.z * spd, 1 - Math.exp(-2 * dt));
  // jetpack over hills / stuck / downhill ski feel
  const aheadH = terrainH(b.pos.x + fwd.x * 6, b.pos.z + fwd.z * 6);
  const curH = terrainH(b.pos.x, b.pos.z);
  b.stuck = (b.stuck || 0) + dt;
  if (b.stuck > 1) {
    const moved = b.pos.distanceTo(b.lastPos || b.pos);
    if (moved < 1.5 && dist > 8) { b.vel.y = 12; b.jet -= 10; } // hop
    b.lastPos = b.pos.clone(); b.stuck = 0;
  }
  if ((aheadH > curH + 2.5 || dist > 80) && b.jet > 20) b.vel.y += 40 * dt;
  else b.vel.y -= 24 * dt;
  b.jet = clamp(b.jet + (b.vel.y > 5 ? -30 * dt : 14 * dt), 0, 100);

  b.pos.add(b.vel.clone().multiplyScalar(dt));
  const g = groundY(b.pos.x, b.pos.z);
  if (b.pos.y < g + 1.8) { b.pos.y = g + 1.8; b.vel.y = Math.max(0, b.vel.y); }
  b.pos.x = clamp(b.pos.x, -HALF + 5, HALF - 5); b.pos.z = clamp(b.pos.z, -HALF + 5, HALF - 5);
  b.onGround = b.pos.y <= g + 2.1;

  // flag interactions
  for (const k of ['blue', 'red']) {
    const f = flags[k];
    const fp = f.state === 'home' ? f.home : f.state === 'dropped' ? f.dropPos : null;
    if (fp && b.pos.distanceTo(fp) < 3.2) {
      if (f.team !== b.team && !b.carrying && f.state !== 'carried') pickupFlag(f, b);
      else if (f.team === b.team && f.state === 'dropped') returnFlag(f);
    }
  }
  tryCapture(b);

  // combat: find foe
  if (b.think <= 0) {
    b.think = 0.25 + Math.random() * 0.3;
    b.foe = nearestFoe(b.pos, b.team, 110);
  }
  if (b.foe && (b.foe.alive === false || b.foe.dead)) b.foe = null;
  if (b.foe) {
    const fpos = b.foe.pos ? b.foe.pos.clone().add(new THREE.Vector3(0, 1.4, 0)) : b.foe.pos;
    const d = b.pos.distanceTo(b.foe.pos || b.foe.pos);
    // face foe if close, else face travel
    if (d < 55) b.yaw += clamp(angDiff(b.yaw, Math.atan2(-(fpos.x - b.pos.x), -(fpos.z - b.pos.z))), -3 * dt * 4, 3 * dt * 4);
    if (b.fireCd <= 0 && d < 100) {
      b.fireCd = b.weapon === 0 ? 0.35 : 1.2;
      const o = b.pos.clone().add(new THREE.Vector3(0, 1.7, 0));
      const dir = fpos.clone().sub(o).normalize();
      dir.x += rand(-0.05, 0.05); dir.y += rand(-0.03, 0.03); dir.z += rand(-0.05, 0.05); dir.normalize();
      if (b.weapon === 1) fireDisc(b, o, dir);
      else { shootHitscan({ ...b, yaw: b.yaw, isPlayer: false }, b.weapon === 2 ? 40 : 8, 0.03, 140, 0xff8888); }
      if (d < 60 && player.alive && b.foe === player) { /* pressure */ }
    }
  }

  // mesh
  if (b.mesh) {
    b.mesh.position.copy(b.pos).sub(new THREE.Vector3(0, 1.8, 0));
    b.mesh.rotation.y = b.yaw + Math.PI;
    b.mesh.userData.flame.visible = b.vel.y > 4;
    if (b.carrying) { b.mesh.position.y += Math.sin(performance.now() * 0.005) * 0.1; }
    // carried flag visual: attach small flag? use beam color pulse
  }
}
function nearestFoe(pos, team, maxD) {
  let best = null, bd = maxD;
  const cand = bots.concat([player]).filter(e => e.team !== team && e.alive);
  for (const e of cand) { const d = pos.distanceTo(e.pos); if (d < bd) { bd = d; best = e; } }
  // also consider enemy-driven vehicles
  for (const v of vehicles) {
    if (v.dead || v.team === team || !v.driver) continue;
    const d = pos.distanceTo(v.pos); if (d < bd) { bd = d; best = v.driver; }
  }
  return best;
}

// turrets
function updateTurrets(dt) {
  for (const t of turrets) {
    if (!t.alive) continue;
    t.cd -= dt;
    t.mesh.rotation.y += dt * 0.4;
    // target
    let best = null, bd = 95;
    for (const e of bots.concat([player])) {
      if (!e.alive || e.team === t.team) continue;
      const d = t.pos.distanceTo(e.pos);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      t.mesh.lookAt(best.pos.clone().add(new THREE.Vector3(0, 1.5, 0)));
      if (t.cd <= 0) {
        t.cd = 0.5;
        const o = t.pos.clone(), dir = best.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(o).normalize();
        tracer(o, best.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), 0xff4444);
        // hit chance scales with distance
        if (Math.random() < lerp(0.5, 0.12, bd / 95)) {
          if (best.vehicle) damageVehicle(best.vehicle, 14, { team: t.team, name: 'TURRET' });
          else damage(best, 11, { team: t.team, name: 'TURRET' }, 'zapped');
        }
        beep(300, 0.08, 'square', 0.04, -100);
      }
    }
  }
}

// projectiles & fx
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    p.vel.y -= 6 * dt;
    p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
    const mp = p.mesh.position;
    let hit = p.life <= 0 || mp.y < groundY(mp.x, mp.z) || Math.abs(mp.x) > HALF || Math.abs(mp.z) > HALF || mp.y > 200;
    if (!hit) {
      for (const e of bots.concat([player])) {
        if (e === p.owner || !e.alive || e.team === p.team) continue;
        if (mp.distanceTo(e.pos.clone().add(new THREE.Vector3(0, 1.2, 0))) < 1.8) { hit = true; break; }
      }
      if (!hit) for (const v of vehicles) {
        if (v.dead || v.driver === p.owner) continue;
        if (mp.distanceTo(v.pos.clone().add(new THREE.Vector3(0, 1, 0))) < 2.4) { damageVehicle(v, 30, p.owner); hit = true; break; }
      }
    }
    if (hit) { explode(p); projectiles.splice(i, 1); }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt;
    p.vel.y -= 12 * dt;
    p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
    p.mesh.material.opacity = clamp(p.life, 0, 1);
    p.mesh.rotation.x += dt * 3;
    if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); }
  }
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.life -= dt;
    t.mesh.material.opacity = clamp(t.life / 0.12, 0, 1);
    if (t.life <= 0) { scene.remove(t.mesh); t.mesh.geometry.dispose(); tracers.splice(i, 1); }
  }
}

// flags visual + timers
function updateFlags(dt) {
  for (const k of ['blue', 'red']) {
    const f = flags[k];
    if (f.state === 'carried' && f.carrier) {
      const cp = f.carrier.pos ? f.carrier.pos.clone().add(new THREE.Vector3(0, 2.5, 0)) : f.carrier.pos;
      f.mesh.position.lerp(cp, 0.4);
      if (!f.carrier.alive) dropFlag(f, f.carrier.pos.clone());
      if (f.carrier.vehicle) dropFlag(f, f.carrier.pos.clone()); // can't carry in vehicle (Halo rule-ish)
    } else if (f.state === 'dropped') {
      f.dropT -= dt;
      f.mesh.position.y = f.dropPos.y + 0.8 + Math.sin(performance.now() * 0.003) * 0.2;
      if (f.dropT <= 0) returnFlag(f);
    } else {
      f.mesh.position.copy(f.home);
    }
    f.mesh.userData.cloth.rotation.y = Math.sin(performance.now() * 0.003 + (k === 'blue' ? 0 : 2)) * 0.5;
  }
}

// vehicle respawn + idle
function updateVehicles(dt) {
  for (const v of vehicles) {
    if (v.dead) {
      v.respawnT -= dt;
      if (v.respawnT <= 0) {
        v.dead = false; v.hp = v.maxHp; v.pos.copy(v.home); v.vel.set(0, 0, 0); v.mesh.visible = true;
      }
      continue;
    }
    if (!v.driver) {
      // settle to ground, slow drift stop
      v.vel.multiplyScalar(1 - Math.min(1, 2 * dt));
      if (v.kind !== 'wasp') v.pos.y = groundY(v.pos.x, v.pos.z) + (v.kind === 'tank' ? 0.6 : 0.4);
      else v.pos.y = lerp(v.pos.y, groundY(v.pos.x, v.pos.z) + 2, dt);
      v.mesh.position.copy(v.pos); v.mesh.rotation.y = v.yaw + (v.kind === 'wasp' ? 0 : Math.PI);
    }
  }
}

// ---------- HUD ----------
const el = id => document.getElementById(id);
let hudT = 0;
function updateHUD(dt) {
  msgT -= dt;
  if (msgT <= 0) msgEl.style.opacity = 0;
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.12;
  el('shieldfill').style.width = (player.shield / player.maxShield * 100) + '%';
  el('healthfill').style.width = (player.hp / player.maxHp * 100) + '%';
  el('jetfill').style.width = player.jet + '%';
  el('speedo').innerHTML = `${Math.round(player.speed)} <small>km/h${player.skiing ? ' · SKI' : ''}${player.vehicle ? ' · ' + player.vehicle.kind.toUpperCase() : ''}</small>`;
  el('credits').textContent = player.credits;
  el('scoreBlue').textContent = scores.blue; el('scoreRed').textContent = scores.red;
  const t = Math.max(0, matchT);
  el('timer').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  for (let i = 0; i < 3; i++) el('w' + (i + 1)).classList.toggle('active', player.weapon === i);
  const fmt = f => f.state === 'home' ? 'HOME' : f.state === 'dropped' ? 'DROPPED!' : `TAKEN by ${entityName(f.carrier)}`;
  el('flagBlue').textContent = fmt(flags.blue); el('flagRed').textContent = fmt(flags.red);
  el('posLabel').textContent = player.carrying ? '⚑ YOU HAVE THE FLAG — GET HOME!' : '';
  // vehicle prompt (touch-aware labels)
  const T = isTouchUI();
  const nv = !player.vehicle && player.alive ? nearestVehicle(player) : null;
  promptEl.style.display = nv ? 'block' : 'none';
  if (nv) promptEl.textContent = T ? `Tap USE to enter ${nv.kind.toUpperCase()}` : `Press E to enter ${nv.team !== player.team ? 'CAPTURED ' : ''}${nv.kind.toUpperCase()} (${nv.team.toUpperCase()})`;
  const bp = el('buyPrompt');
  const showBuy = !player.vehicle && player.alive && !buyOpen && nearOwnBase();
  bp.style.display = showBuy ? 'block' : 'none';
  if (showBuy) bp.textContent = T ? `Tap BUY — vehicles from ${player.credits} CR` : `Press B — BUY VEHICLES (${player.credits} CR)`;
  const vh = el('vehHud');
  if (player.vehicle) { vh.style.display = 'block'; vh.textContent = T ? `${player.vehicle.kind.toUpperCase()} HP ${Math.max(0, Math.round(player.vehicle.hp))} — USE to exit` : `${player.vehicle.kind.toUpperCase()} HP ${Math.max(0, Math.round(player.vehicle.hp))} — E to exit`; }
  else vh.style.display = 'none';
  drawMinimap();
}
function drawMinimap() {
  const c = el('minimap'), ctx = c.getContext('2d');
  const S = c.width, toMap = (x, z) => [(x / MAP + 0.5) * S, (z / MAP + 0.5) * S];
  ctx.fillStyle = '#0d1526'; ctx.fillRect(0, 0, S, S);
  // bases
  for (const t of ['blue', 'red']) {
    const [bx, bz] = toMap(0, TEAM[t].z);
    ctx.fillStyle = t === 'blue' ? '#2e7bff' : '#ff4444';
    ctx.fillRect(bx - 12, bz - 12, 24, 24);
  }
  // flags
  for (const k of ['blue', 'red']) {
    const f = flags[k];
    const p = f.state === 'home' ? f.home : f.state === 'dropped' ? f.dropPos : f.carrier?.pos;
    if (!p) continue;
    const [x, y] = toMap(p.x, p.z);
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
  }
  // vehicles
  for (const v of vehicles) {
    if (v.dead) continue;
    const [x, y] = toMap(v.pos.x, v.pos.z);
    ctx.fillStyle = v.team === 'blue' ? '#9fc2ff' : '#ffb09f';
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
  // bots + player
  for (const b of bots.concat([player])) {
    if (!b.alive) continue;
    const [x, y] = toMap(b.pos.x, b.pos.z);
    ctx.fillStyle = b.isPlayer ? '#ffffff' : b.team === 'blue' ? '#5db4ff' : '#ff6b6b';
    ctx.beginPath(); ctx.arc(x, y, b.isPlayer ? 4 : 2.5, 0, 7); ctx.fill();
  }
  // view dir
  const [px, py] = toMap(player.pos.x, player.pos.z);
  ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(px, py);
  ctx.lineTo(px - Math.sin(yaw) * 14, py - Math.cos(yaw) * 14); ctx.stroke();
}

// ---------- menu orbit cam + main loop ----------
respawn(player, true); bots.forEach(b => { b.alive = false; b.respawnT = Math.random() * 2; });
const clock = new THREE.Clock();
let orbit = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  if (playing && !over) {
    matchT -= dt;
    if (matchT <= 0) endMatch(scores.blue === scores.red ? 'blue' : scores.blue > scores.red ? 'blue' : 'red');
    updatePlayer(dt);
    bots.forEach(b => updateBot(b, dt));
    updateTurrets(dt);
    updateProjectiles(dt);
    updateFlags(dt);
    updateVehicles(dt);
    updateHUD(dt);
    // flag carrier marker above head
    if (player.mesh) {
      player.mesh.position.copy(player.pos).sub(new THREE.Vector3(0, 1.8, 0));
      player.mesh.rotation.y = yaw + Math.PI;
      player.mesh.visible = false; // FPS: hide own body
    }
  } else if (!playing) {
    // menu orbit
    orbit += dt * 0.08;
    camera.position.set(Math.sin(orbit) * 220, 90, Math.cos(orbit) * 220);
    camera.lookAt(0, 10, 0);
    // idle anim: bots skirmish in background? just spin flag cloth + ring
    updateFlags(dt * 0.2); updateProjectiles(dt);
    bots.forEach(b => { if (b.mesh) { b.mesh.visible = false; } });
  } else {
    // over: slow orbit around winner base
    orbit += dt * 0.15;
    const bz = 195;
    camera.position.set(Math.sin(orbit) * 60, 30, bz + Math.cos(orbit) * 60);
    camera.lookAt(0, 6, bz);
    updateProjectiles(dt); updateFlags(dt);
  }
  // flag cloth wave + spire ring spin always
  renderer.render(scene, camera);
}
loop();

// expose for automated checks
window.__game = { player, bots, vehicles, flags, scores, gunGroup, camera, scene, touch, VEH_COSTS, buyVehicle, toggleBuyMenu, nearOwnBase, get playing() { return playing; }, startMatch };
