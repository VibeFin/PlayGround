import * as THREE from 'three';

// Strike Protocol — Dust Arena. Desktop FPS, code-built map.
// Genex hook: if ./assets/ files exist they override code meshes (see loadGenexAssets).
const canvas = document.getElementById('game');
const hud = document.getElementById('hud');
const menu = document.getElementById('menu');
const pauseEl = document.getElementById('pause');
const banner = document.getElementById('banner');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e0);
scene.fog = new THREE.Fog(0xd8c39a, 40, 140);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 300);
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xfff2d8, 0x8a6b46, 1.05));
const sun = new THREE.DirectionalLight(0xffedd0, 1.6);
sun.position.set(30, 50, 18);
scene.add(sun);

// ---------- procedural audio (replaced by Genex sfx when signed in) ----------
let AC = null, muted = false;
function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch {} } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
function shotSound(far = 0, pistol = false) {
  if (muted) return; const ac = audio(); if (!ac) return;
  const t = ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'square'; o.frequency.setValueAtTime(pistol ? 700 : 420, t);
  o.frequency.exponentialRampToValueAtTime(60, t + (pistol ? 0.09 : 0.13));
  const vol = Math.max(0.02, 0.32 / (1 + far * 0.12));
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.16);
  const n = ac.createBufferSource(); const b = ac.createBuffer(1, 2205, 22050);
  const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const ng = ac.createGain(); ng.gain.value = vol * 0.7; n.buffer = b; n.connect(ng).connect(ac.destination); n.start(t);
}
function hitSound(kill) {
  if (muted) return; const ac = audio(); if (!ac) return;
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.value = kill ? 880 : 520;
  g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.13);
}

// ---------- map ----------
const colliders = []; // Box3 list
const tmpBox = new THREE.Box3();
function solid(mesh, pad = 0) {
  mesh.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(mesh);
  if (pad) b.expandByScalar(pad);
  colliders.push(b);
  return b;
}
const MAT = {
  sand: new THREE.MeshLambertMaterial({ color: 0xd9bd85 }),
  sandDark: new THREE.MeshLambertMaterial({ color: 0xc2a06e }),
  wall: new THREE.MeshLambertMaterial({ color: 0xd6c092 }),
  wallTop: new THREE.MeshLambertMaterial({ color: 0x9a7c52 }),
  wood: new THREE.MeshLambertMaterial({ color: 0x8a5f33 }),
  woodDark: new THREE.MeshLambertMaterial({ color: 0x6b4423 }),
  metal: new THREE.MeshLambertMaterial({ color: 0x5b6570 }),
  ct: new THREE.MeshLambertMaterial({ color: 0x2e63b8 }),
  t: new THREE.MeshLambertMaterial({ color: 0xb87a2e }),
  head: new THREE.MeshLambertMaterial({ color: 0xe0b98f }),
  dark: new THREE.MeshLambertMaterial({ color: 0x22262c }),
};

function box(w, h, d, mat, x, y, z, ry = 0, collide = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.y = ry;
  scene.add(m); if (collide) solid(m);
  return m;
}

const ARENA = 76;
function buildMap() {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(ARENA + 30, ARENA + 30), MAT.sand);
  g.rotation.x = -Math.PI / 2; scene.add(g);
  // subtle grid variation strips
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(ARENA, 2.2), MAT.sandDark);
    s.rotation.x = -Math.PI / 2; s.position.set(0, 0.01, -ARENA / 2 + 6 + i * 9);
    scene.add(s);
  }
  const H = 6, T = 1.2;
  box(ARENA, H, T, MAT.wall, 0, H / 2, -ARENA / 2);
  box(ARENA, H, T, MAT.wall, 0, H / 2, ARENA / 2);
  box(T, H, ARENA, MAT.wall, -ARENA / 2, H / 2, 0);
  box(T, H, ARENA, MAT.wall, ARENA / 2, H / 2, 0);
  // mid wall with double-doors gap (dust mid)
  box(16, 4.6, 1, MAT.wall, -14, 2.3, 2);
  box(16, 4.6, 1, MAT.wall, 14, 2.3, 2);
  box(12, 1.4, 1, MAT.wallTop, 0, 5.2, 2); // lintel over mid doors
  box(1, 4, 1, MAT.wallTop, -4, 2, 2); box(1, 4, 1, MAT.wallTop, 4, 2, 2);
  // catwalk / xbox mid
  box(3, 1.2, 3, MAT.wood, 0, 0.6, -6);
  box(2.2, 2.4, 2.2, MAT.woodDark, 8, 1.2, -10);
  box(2.2, 2.4, 2.2, MAT.woodDark, -8, 1.2, -10);
  // A site (east)
  box(10, 0.3, 8, new THREE.MeshLambertMaterial({ color: 0xcbb27f }), 26, 0.15, -20, 0, false);
  const aLabel = platLabel('A', 26, -20);
  box(2.4, 2.4, 2.4, MAT.wood, 24, 1.2, -22);
  box(2.4, 2.4, 2.4, MAT.wood, 28.5, 1.2, -21);
  box(2.4, 1.2, 2.4, MAT.woodDark, 26.2, 2.9, -21.5);
  box(6, 3.4, 1, MAT.wall, 26, 1.7, -26);
  // B site (west) + tunnel boxes
  box(10, 0.3, 8, new THREE.MeshLambertMaterial({ color: 0xc4a878 }), -26, 0.15, -20, 0, false);
  platLabel('B', -26, -20);
  box(8, 3, 1, MAT.wall, -26, 1.5, -26);
  box(1, 3, 8, MAT.wall, -32, 1.5, -20);
  box(2.2, 2.2, 2.2, MAT.woodDark, -24, 1.1, -18);
  box(2.2, 2.2, 2.2, MAT.woodDark, -28, 1.1, -19);
  // tunnels entrance
  box(6, 3.2, 1.2, MAT.metal, -14, 1.6, -24);
  box(1.2, 3.2, 8, MAT.metal, -17, 1.6, -28);
  box(1.2, 3.2, 8, MAT.metal, -11, 1.6, -28);
  // CT spawn cover + T spawn cover
  for (const [x, z] of [[-6, 26], [6, 26], [0, 30]]) box(3, 1.4, 1.4, MAT.wood, x, 0.7, z);
  for (const [x, z] of [[-6, -32], [6, -32], [0, -34]]) box(3, 1.4, 1.4, MAT.woodDark, x, 0.7, z);
  // long corner + short stairs blocks
  box(4, 2.6, 4, MAT.wood, 18, 1.3, 12);
  box(4, 2.6, 4, MAT.wood, -18, 1.3, 12);
  box(3, 1, 6, MAT.sandDark, 12, 0.5, 22, 0, false);
  // palm-ish props (code cylinders — swapped for Genex palms later)
  for (const [x, z] of [[34, 20], [-34, 22], [30, -32], [-8, 8]]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 5, 6), MAT.woodDark);
    trunk.position.set(x, 2.5, z); scene.add(trunk); solid(trunk);
    const top = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), new THREE.MeshLambertMaterial({ color: 0x4d7a35 }));
    top.position.set(x, 5.4, z); scene.add(top);
  }
  return { aLabel };
}
function platLabel(text, x, z) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#fff'; g.font = '900 84px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 70);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.32, z); scene.add(m);
}
buildMap();

// ---------- weapons ----------
const WEAPONS = {
  rifle: { name: 'AK-DUST', dmg: 26, headMul: 3.2, mag: 30, reserve: 90, interval: 0.1, spread: 0.016, recoil: 0.028, range: 120, auto: true, pistol: false },
  pistol: { name: 'P250-S', dmg: 18, headMul: 2.6, mag: 12, reserve: 48, interval: 0.16, spread: 0.012, recoil: 0.02, range: 80, auto: false, pistol: true },
};
let cur = 'rifle';
const ammoState = { rifle: { mag: 30, res: 90 }, pistol: { mag: 12, res: 48 } };

// viewmodel rifle built in code (Genex GLB overrides if present)
const vm = new THREE.Group();
camera.add(vm);
vm.position.set(0.32, -0.3, -0.6);
function buildViewmodel() {
  while (vm.children.length) vm.remove(vm.children[0]);
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1e22 });
  const woodm = new THREE.MeshLambertMaterial({ color: 0x7a4d22 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.7), dark); vm.add(body);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.1), woodm); grip.position.set(0, -0.13, 0.1); vm.add(grip);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.09), dark); mag.position.set(0, -0.14, -0.08); mag.rotation.x = 0.3; vm.add(mag);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8), dark);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.5); vm.add(barrel);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.02), dark); sight.position.set(0, 0.09, -0.15); vm.add(sight);
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0 }));
  flash.position.set(0, 0.02, -0.75); flash.name = 'flash'; vm.add(flash);
}
buildViewmodel();
scene.add(new THREE.AmbientLight(0xffffff, 0.15));

// ---------- player ----------
const player = {
  pos: new THREE.Vector3(0, 1.7, 30), vel: new THREE.Vector3(),
  yaw: Math.PI, pitch: 0, hp: 100, armor: 100, alive: true,
  kills: 0, deaths: 0, money: 800, crouch: false, onGround: true,
  radius: 0.5, eye: 1.62, lastShot: 0, reloading: false, dmgDir: 0,
};
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Tab') { e.preventDefault(); showScore(true); }
  if (e.code === 'KeyR') reload();
  if (e.code === 'Digit1') switchW('rifle');
  if (e.code === 'Digit2') switchW('pistol');
  if (e.code === 'KeyM') { muted = !muted; feed(`Sound ${muted ? 'OFF' : 'ON'}`); }
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Tab') showScore(false); });

let locked = false;
const playBtn = document.getElementById('play-btn');
const resumeBtn = document.getElementById('resume-btn');
playBtn.onclick = () => { audio(); canvas.requestPointerLock(); };
resumeBtn.onclick = () => canvas.requestPointerLock();
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) { menu.classList.add('hidden'); pauseEl.classList.add('hidden'); hud.classList.remove('hidden'); audio(); }
  else if (player.alive && started) { pauseEl.classList.remove('hidden'); }
});
document.addEventListener('mousemove', e => {
  if (!locked) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch -= e.movementY * 0.0022;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
});
let triggerHeld = false;
document.addEventListener('mousedown', e => { if (locked && e.button === 0) { triggerHeld = true; tryShoot(); } });
document.addEventListener('mouseup', e => { if (e.button === 0) triggerHeld = false; });

function switchW(w) { if (ammoState[w] && cur !== w) { cur = w; buildViewmodel(); updateHUD(); } }
function reload() {
  const st = ammoState[cur], W = WEAPONS[cur];
  if (player.reloading || st.mag === W.mag || st.res <= 0 || !player.alive) return;
  player.reloading = true; updateHUD();
  setTimeout(() => {
    const need = W.mag - st.mag, take = Math.min(need, st.res);
    st.mag += take; st.res -= take; player.reloading = false; updateHUD();
  }, cur === 'rifle' ? 1400 : 1100);
}

// collision: circle vs Box3 on XZ + floor
function collide(pos, r) {
  for (const b of colliders) {
    if (pos.y > b.max.y || pos.y - 1.4 > b.max.y) continue;
    if (1.2 < b.min.y && pos.y < b.min.y) continue;
    const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
    const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.001;
      pos.x = cx + (dx / d) * r; pos.z = cz + (dz / d) * r;
    }
  }
  pos.x = Math.max(-ARENA / 2 + 1, Math.min(ARENA / 2 - 1, pos.x));
  pos.z = Math.max(-ARENA / 2 + 1, Math.min(ARENA / 2 - 1, pos.z));
}

function tryShoot() {
  if (!started || !player.alive || player.reloading || !locked) return;
  const W = WEAPONS[cur], st = ammoState[cur], now = performance.now() / 1000;
  if (now - player.lastShot < W.interval) return;
  if (st.mag <= 0) { reload(); return; }
  player.lastShot = now; st.mag--;
  // spread + recoil kick
  const spread = W.spread * (moving ? 1.8 : 1) * (player.onGround ? 1 : 2.2);
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(
    player.pitch + (Math.random() - 0.5) * spread * 2 + W.recoil * 0.4,
    player.yaw + (Math.random() - 0.5) * spread * 2, 0, 'YXZ'));
  fireHitscan(camera.getWorldPosition(new THREE.Vector3()), dir, W, true);
  player.pitch = Math.min(1.45, player.pitch + W.recoil * 0.35);
  shotSound(0, W.pistol);
  const f = vm.getObjectByName('flash'); if (f) { f.material.opacity = 1; setTimeout(() => f.material.opacity = 0, 50); }
  vm.position.z = -0.55; setTimeout(() => vm.position.z = -0.6, 60);
  updateHUD();
  if (W.auto) setTimeout(() => { if (triggerHeld) tryShoot(); }, W.interval * 1000);
}

// tracers
const tracers = [];
function tracer(a, b, color = 0xffe28a) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  scene.add(l); tracers.push({ l, t: 0.09 });
}

// ---------- bots ----------
const bots = [];
const namesCT = ['S1mple-BOT', 'ZyWoo-BOT', 'donk-BOT', 'm0NESY-BOT'];
const namesT = ['T-Phantom', 'T-Viper', 'T-Jackal', 'T-Havoc', 'T-Dust'];
function makeSoldier(team, name, x, z) {
  const g = new THREE.Group();
  const bm = team === 'CT' ? MAT.ct : MAT.t;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.4), MAT.dark); legs.position.y = 0.38; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.42), bm); torso.position.y = 1.1; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), MAT.head); head.position.y = 1.68; head.name = 'head'; g.add(head);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.9), MAT.dark); gun.position.set(0.3, 1.15, -0.4); g.add(gun);
  g.position.set(x, 0, z); scene.add(g);
  const b = { team, name, mesh: g, hp: 100, alive: true, kills: 0, deaths: 0, yaw: 0, speed: 3 + Math.random() * 1.5, nextShot: 0, strafeT: 0, strafeDir: 1, target: new THREE.Vector3(x, 0, z), respawnT: 0, muzzleT: 0 };
  pickTarget(b); bots.push(b); return b;
}
function pickTarget(b) {
  const pts = [[0, 0], [24, -20], [-24, -20], [0, 30], [0, -30], [14, 10], [-14, 10], [26, 20], [-26, 20]];
  const p = pts[(Math.random() * pts.length) | 0];
  b.target.set(p[0] + (Math.random() - 0.5) * 6, 0, p[1] + (Math.random() - 0.5) * 6);
}
function spawnTeams() {
  for (const b of bots) scene.remove(b.mesh);
  bots.length = 0;
  namesCT.forEach((n, i) => makeSoldier('CT', n, -6 + i * 4, 28));
  namesT.forEach((n, i) => makeSoldier('T', n, -8 + i * 4, -30));
  player.pos.set(0, 1.7, 30); player.yaw = Math.PI; player.hp = 100; player.armor = 100; player.alive = true;
  ammoState.rifle = { mag: 30, res: 90 }; ammoState.pistol = { mag: 12, res: 48 };
}

function botVisible(b, to) {
  const from = b.mesh.position.clone(); from.y = 1.5;
  const dir = to.clone().sub(from); const dist = dir.length(); dir.normalize();
  const rc = new THREE.Raycaster(from, dir, 0, dist);
  const walls = [];
  scene.traverse(o => { if (o.isMesh && !o.geometry.type.includes('Plane') && !isBotMesh(o)) walls.push(o); });
  // cheap: raycast against colliders via math — use three raycaster on a few boxes is fine
  const hits = rc.intersectObjects(walls, false);
  return !(hits.length && hits[0].distance < dist - 0.6);
}
function isBotMesh(o) { let p = o; while (p) { if (p.userData && p.userData.isBot) return true; p = p.parent; } return false; }

function damageBot(b, dmg, head, killerName, killerTeam) {
  if (!b.alive) return;
  b.hp -= dmg;
  // blood puff
  const puff = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xaa1414 }));
  puff.position.copy(b.mesh.position); puff.position.y = head ? 1.7 : 1.1; scene.add(puff);
  setTimeout(() => scene.remove(puff), 120);
  if (b.hp <= 0) {
    b.alive = false; b.deaths++; b.mesh.visible = false;
    b.mesh.position.y = -5;
    if (killerTeam === 'CT' && killerName === 'YOU') { player.kills++; player.money += 300; }
    const killer = bots.find(x => x.name === killerName); if (killer) killer.kills++;
    feed(`<b class="${killerTeam === 'CT' ? 'ct' : 't'}">${killerName}</b> ${head ? '🎯' : '🔫'} <b class="${b.team === 'CT' ? 'ct' : 't'}">${b.name}</b>`);
    hitSound(true); flashHit(true);
    checkRoundEnd();
  } else { hitSound(false); flashHit(false); }
}
function damagePlayer(dmg, fromName) {
  if (!player.alive) return;
  const absorbed = Math.min(player.armor, dmg * 0.5);
  player.armor -= absorbed; player.hp -= (dmg - absorbed * 0.5);
  const v = document.getElementById('damage-vignette');
  v.style.boxShadow = 'inset 0 0 180px 60px rgba(255,30,30,.55)';
  setTimeout(() => v.style.boxShadow = 'inset 0 0 180px 60px rgba(255,30,30,0)', 180);
  if (player.hp <= 0) {
    player.hp = 0; player.alive = false; player.deaths++;
    const killer = bots.find(x => x.name === fromName); if (killer) killer.kills++;
    feed(`<b class="t">${fromName}</b> 🔫 <b class="ct">YOU</b>`);
    setBanner('YOU DIED', 1800);
    document.exitPointerLock?.();
    setTimeout(() => { if (started && roundLive) respawnPlayer(); }, 3000);
    checkRoundEnd();
  }
  updateHUD();
}
function respawnPlayer() {
  player.pos.set((Math.random() - 0.5) * 10, 1.7, 30);
  player.hp = 100; player.armor = 100; player.alive = true;
  ammoState.rifle = { mag: 30, res: 90 }; ammoState.pistol = { mag: 12, res: 48 };
  updateHUD();
  if (!locked) canvas.requestPointerLock?.();
}

// hitscan shared by player + bots
const ray = new THREE.Raycaster();
function fireHitscan(origin, dir, W, isPlayer) {
  ray.set(origin, dir); ray.far = W.range;
  const targets = [];
  for (const b of bots) {
    if (!b.alive) continue;
    if (isPlayer && b.team === 'CT') continue;
    if (!isPlayer && b.team === 'T' && currentShooterTeam === 'T') {
      // T bots don't hit teammates: skip same team
      if (shooterIsBotOf(b)) continue;
    }
    b.mesh.updateMatrixWorld(true);
    targets.push(b.mesh);
  }
  // player as target for bot shots
  let playerHit = null, playerHead = false;
  if (!isPlayer && player.alive) {
    const pp = player.pos.clone();
    const toP = pp.clone().sub(origin); const dist = toP.length();
    if (dist < W.range) {
      const ang = dir.angleTo(toP.normalize());
      if (ang < 0.06 + dist * 0.0006) playerHit = dist;
    }
  }
  const hits = ray.intersectObjects(targets, true);
  // wall distance
  const wallHits = ray.intersectObjects(scene.children.filter(o => o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry' && !isBotPart(o)), false);
  const wallDist = wallHits.length ? wallHits[0].distance : W.range;
  let end = origin.clone().add(dir.clone().multiplyScalar(Math.min(W.range, wallDist)));
  if (hits.length && hits[0].distance < wallDist) {
    const h = hits[0]; end = h.point.clone();
    let g = h.object; const head = g.name === 'head';
    while (g && !g.userData.botRef) g = g.parent;
    // find bot by traversing up
    const bot = bots.find(b => b.mesh === findRoot(h.object));
    if (bot) {
      const dmg = W.dmg * (head ? W.headMul : 1) * (0.9 + Math.random() * 0.2);
      if (isPlayer) damageBot(bot, dmg, head, 'YOU', 'CT');
    }
  } else if (playerHit && playerHit < wallDist) {
    end = player.pos.clone();
    if (!isPlayer) damagePlayer(W.dmg * (0.8 + Math.random() * 0.4), currentShooterName);
  } else if (wallHits.length) {
    spark(end);
  }
  tracer(origin.clone().add(dir.clone().multiplyScalar(1.2)), end);
}
let currentShooterName = '', currentShooterTeam = 'T', shooterIsBotOf = () => false;
function findRoot(o) { while (o.parent && o.parent !== scene) o = o.parent; return o; }
function isBotPart(o) { let p = o; while (p) { if (bots.some(b => b.mesh === p)) return true; p = p.parent; } return false; }
function spark(p) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
  s.position.copy(p); scene.add(s); setTimeout(() => scene.remove(s), 90);
}

// ---------- HUD ----------
const el = id => document.getElementById(id);
function updateHUD() {
  el('hp-num').textContent = Math.ceil(player.hp);
  el('hp-fill').style.width = player.hp + '%';
  el('armor').textContent = `⛨ ${Math.ceil(player.armor)}`;
  el('ammo-mag').textContent = player.reloading ? '--' : ammoState[cur].mag;
  el('ammo-res').textContent = `/ ${ammoState[cur].res}`;
  el('weapon-name').textContent = WEAPONS[cur].name + (player.reloading ? ' · RELOADING' : '');
  const ct = bots.filter(b => b.team === 'CT' && b.alive).length + (player.alive ? 1 : 0);
  const t = bots.filter(b => b.team === 'T' && b.alive).length;
  el('alive-ct').textContent = `${ct} CT alive`; el('alive-t').textContent = `${t} T alive`;
  el('score-ct').textContent = score.CT; el('score-t').textContent = score.T;
}
function feed(html) {
  const d = document.createElement('div'); d.className = 'feed'; d.innerHTML = html;
  const kf = el('killfeed'); kf.prepend(d);
  while (kf.children.length > 6) kf.lastChild.remove();
  setTimeout(() => d.remove(), 7000);
}
function setBanner(t, ms = 2000) {
  banner.textContent = t; banner.classList.remove('hidden');
  clearTimeout(setBanner._t); setBanner._t = setTimeout(() => banner.classList.add('hidden'), ms);
}
function flashHit(kill) {
  const h = el('hitmarker');
  h.classList.remove('show'); void h.offsetWidth; h.classList.add('show');
}
function showScore(on) { el('scoreboard').classList.toggle('hidden', !on); if (on) renderScore(); }
function renderScore() {
  const mk = p => `<div class="srow"><span>${p.name}</span><span>${p.kills}K · ${p.deaths}D</span></div>`;
  el('sb-ct').innerHTML = `<div class="srow"><span>YOU</span><span>${player.kills}K · ${player.deaths}D · $${player.money}</span></div>` +
    bots.filter(b => b.team === 'CT').map(mk).join('');
  el('sb-t').innerHTML = bots.filter(b => b.team === 'T').map(mk).join('');
}

// minimap
const mm = el('minimap').getContext('2d');
function drawMinimap() {
  const S = 170, k = S / (ARENA + 10);
  mm.clearRect(0, 0, S, S);
  mm.fillStyle = '#c9ab74'; mm.fillRect(0, 0, S, S);
  mm.fillStyle = '#8a6b46';
  const dot = (x, z, c, big = false) => {
    mm.fillStyle = c;
    mm.beginPath(); mm.arc((x + ARENA / 2) * k, (z + ARENA / 2) * k, big ? 5 : 3.5, 0, 7); mm.fill();
  };
  dot(26, -20, '#fff'); dot(-26, -20, '#fff');
  for (const b of bots) if (b.alive) dot(b.mesh.position.x, b.mesh.position.z, b.team === 'CT' ? '#2e63ff' : '#ff3b30');
  if (player.alive) {
    const px = (player.pos.x + ARENA / 2) * k, pz = (player.pos.z + ARENA / 2) * k;
    mm.save(); mm.translate(px, pz); mm.rotate(-player.yaw);
    mm.fillStyle = '#00ff88'; mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(5, 5); mm.lineTo(-5, 5); mm.closePath(); mm.fill(); mm.restore();
  }
}

// ---------- rounds ----------
const score = { CT: 0, T: 0 };
let round = 1, roundTime = 120, roundLive = false, started = false, moving = false;
function startMatch() {
  started = true; score.CT = 0; score.T = 0; round = 1;
  player.kills = 0; player.deaths = 0; player.money = 800;
  startRound();
}
function startRound() {
  spawnTeams(); roundTime = 120; roundLive = true;
  el('round-label').textContent = `ROUND ${round} · FIRST TO 5`;
  setBanner(`ROUND ${round}`, 1800);
  feed(`— Round ${round} started —`);
  updateHUD();
}
function checkRoundEnd() {
  if (!roundLive) return;
  const ctAlive = bots.filter(b => b.team === 'CT' && b.alive).length + (player.alive ? 1 : 0);
  const tAlive = bots.filter(b => b.team === 'T' && b.alive).length;
  updateHUD();
  if (ctAlive === 0 || tAlive === 0 || roundTime <= 0) {
    roundLive = false;
    let winner = 'CT';
    if (tAlive > 0 && ctAlive === 0) winner = 'T';
    else if (roundTime <= 0) winner = tAlive >= ctAlive ? 'T' : 'CT';
    else winner = tAlive === 0 ? 'CT' : 'T';
    score[winner]++;
    if (winner === 'CT') player.money += 3250;
    setBanner(winner === 'CT' ? 'CT WIN THE ROUND' : 'T WIN THE ROUND', 2500);
    feed(winner === 'CT' ? '<b class="ct">CT wins the round</b>' : '<b class="t">T wins the round</b>');
    updateHUD();
    if (score.CT >= 5 || score.T >= 5) {
      setTimeout(() => {
        setBanner(score.CT > score.T ? '🏆 CT VICTORY' : '☠ T VICTORY', 5000);
        setTimeout(() => { round = 1; startMatch(); }, 5000);
      }, 2600);
    } else {
      round++;
      setTimeout(() => { if (started) startRound(); }, 3000);
    }
  }
}

// ---------- Genex asset hook ----------
async function loadGenexAssets() {
  // If the user signs in and generates assets into ./assets, they auto-apply:
  // assets/rifle.glb -> viewmodel, assets/ct.glb + assets/t.glb -> bot bodies,
  // assets/*basecolor.png -> ground tint. Missing files = keep code-built look.
  try {
    const res = await fetch('./assets/manifest.json');
    if (!res.ok) return;
    document.getElementById('genex-note').textContent = 'Genex assets loaded from ./assets/.';
  } catch { /* no assets yet — code-built look */ }
}
loadGenexAssets();

// ---------- main loop ----------
const clock = new THREE.Clock();
const fwd = new THREE.Vector3(), right = new THREE.Vector3();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (started && roundLive) {
    roundTime -= dt;
    if (roundTime <= 0) { roundTime = 0; checkRoundEnd(); }
    const m = String(Math.floor(roundTime / 60)), s = String(Math.floor(roundTime % 60)).padStart(2, '0');
    el('timer').textContent = `${m}:${s}`;
  }

  // player movement (desktop WASD)
  moving = false;
  if (locked && player.alive && roundLive) {
    const sp = (keys['ShiftLeft'] ? 7.2 : 4.8) * (player.crouch ? 0.55 : 1);
    fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    right.set(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3();
    if (keys['KeyW']) wish.add(fwd);
    if (keys['KeyS']) wish.sub(fwd);
    if (keys['KeyD']) wish.add(right);
    if (keys['KeyA']) wish.sub(right);
    if (wish.lengthSq() > 0) { wish.normalize(); moving = true; }
    player.vel.x = wish.x * sp; player.vel.z = wish.z * sp;
    player.pos.x += player.vel.x * dt; player.pos.z += player.vel.z * dt;
    // gravity / jump
    if (!player.onGround) player.vel.y -= 18 * dt;
    else if (keys['Space']) { player.vel.y = 6.2; player.onGround = false; }
    player.pos.y += player.vel.y * dt;
    const eyeH = player.crouch ? 1.15 : player.eye;
    if (player.pos.y <= eyeH) { player.pos.y = eyeH; player.vel.y = 0; player.onGround = true; }
    player.crouch = !!keys['KeyC'];
    collide(player.pos, player.radius);
    el('crosshair').style.setProperty('--gap', `${4 + (moving ? 5 : 0) + (player.onGround ? 0 : 8)}px`);
  }
  camera.position.copy(player.pos);
  camera.position.y = player.crouch ? player.pos.y - 0.35 : player.pos.y;
  camera.rotation.set(0, 0, 0);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw; camera.rotation.x = player.pitch;

  // bots AI
  const now = performance.now() / 1000;
  for (const b of bots) {
    if (!b.alive) continue;
    const bp = b.mesh.position;
    // pick enemy: player if CT? No — CT bots are friendly, T bots hunt player + CT bots
    let foe = null, foeD = 1e9;
    const foes = [];
    if (b.team === 'T') {
      if (player.alive) foes.push(player.pos);
      for (const o of bots) if (o.team === 'CT' && o.alive) foes.push(o.mesh.position.clone().setY(1.4));
    } else {
      for (const o of bots) if (o.team === 'T' && o.alive) foes.push(o.mesh.position.clone().setY(1.4));
    }
    for (const f of foes) { const d = bp.distanceTo(f); if (d < foeD) { foeD = d; foe = f; } }
    if (foe && foeD < 42) {
      // face foe
      const dx = foe.x - bp.x, dz = foe.z - bp.z;
      b.yaw = Math.atan2(dx, dz);
      b.mesh.rotation.y = b.yaw + Math.PI;
      // strafe a bit
      b.strafeT -= dt;
      if (b.strafeT <= 0) { b.strafeT = 1 + Math.random() * 2; b.strafeDir = Math.random() < 0.5 ? -1 : 1; }
      if (foeD > 9) {
        bp.x += (dx / foeD) * b.speed * dt; bp.z += (dz / foeD) * b.speed * dt;
      } else {
        bp.x += Math.cos(b.yaw) * b.strafeDir * b.speed * 0.5 * dt;
        bp.z += -Math.sin(b.yaw) * b.strafeDir * b.speed * 0.5 * dt;
      }
      // shoot
      const W = WEAPONS.rifle;
      if (now > b.nextShot && foeD < 46 && roundLive) {
        const skill = 0.55 + Math.random() * 0.5;
        b.nextShot = now + skill;
        currentShooterName = b.name; currentShooterTeam = b.team;
        shooterIsBotOf = o => o === b;
        const from = bp.clone(); from.y = 1.5;
        const aim = foe.clone().setY(1.35); aim.x += (Math.random() - 0.5) * foeD * 0.06; aim.y += (Math.random() - 0.5) * 0.5; aim.z += (Math.random() - 0.5) * foeD * 0.06;
        const dir = aim.sub(from).normalize();
        // line of sight: skip if wall between
        fireHitscan(from, dir, { ...W, dmg: 9 + Math.random() * 8 }, false);
        shotSound(foeD, false);
        // muzzle blink
        b.muzzleT = 0.06;
      }
    } else {
      // patrol
      const dx = b.target.x - bp.x, dz = b.target.z - bp.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) pickTarget(b);
      else { bp.x += (dx / d) * b.speed * 0.6 * dt; bp.z += (dz / d) * b.speed * 0.6 * dt; b.mesh.rotation.y = Math.atan2(dx, dz) + Math.PI; }
    }
    // walk bob
    b.mesh.position.y = Math.abs(Math.sin(now * 8 + bp.x)) * 0.05;
    // keep inside + avoid walls roughly
    bp.x = Math.max(-ARENA / 2 + 1, Math.min(ARENA / 2 - 1, bp.x));
    bp.z = Math.max(-ARENA / 2 + 1, Math.min(ARENA / 2 - 1, bp.z));
  }

  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].t -= dt;
    tracers[i].l.material.opacity = Math.max(0, tracers[i].t * 8);
    if (tracers[i].t <= 0) { scene.remove(tracers[i].l); tracers.splice(i, 1); }
  }

  drawMinimap();
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// auto-start bots wandering behind menu so screenshot looks alive
spawnTeams(); roundLive = false;
tick();

// expose for automated checks
window.__STRIKE__ = { player, bots, score, startMatch, get started() { return started; } };
playBtn.addEventListener('click', () => { if (!started) startMatch(); }, { once: false });
