import * as THREE from 'three';

// ---------- procedural clay fingerprint texture ----------
let _texCache = null;
export function clayTexture(base = '#ffffff') {
  if (!_texCache) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    // fingerprint swirls
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, r = 8 + Math.random() * 26;
      g.strokeStyle = `rgba(0,0,0,${0.035 + Math.random() * 0.05})`;
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      for (let a = 0; a < Math.PI * 2; a += 0.25) {
        const rr = r + Math.sin(a * 3 + i) * 3;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        a === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.stroke();
    }
    // speckle
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 1.4, 1.4);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    _texCache = t;
  }
  return _texCache;
}

const matCache = new Map();
export function clayMat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color, roughness: 0.95, metalness: 0.0,
    map: clayTexture(), emissive: opts.emissive || 0x000000,
    emissiveIntensity: opts.glow || 0,
    transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
  });
  matCache.set(key, m);
  return m;
}

// handmade look: jitter vertices slightly.
// hash-based so coincident (duplicated) vertices move identically — no cracks.
export function handMake(geo, amt = 0.06) {
  const p = geo.attributes.position;
  const hash = (x, y, z) => {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return (s - Math.floor(s) - 0.5) * 2; // -1..1
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i,
      x + hash(x, y, z) * amt * 0.5,
      y + hash(y, z, x) * amt * 0.5,
      z + hash(z, x, y) * amt * 0.5);
  }
  geo.computeVertexNormals();
  return geo;
}

export function clayBox(w, h, d, color, jitter = 0.07) {
  const geo = handMake(new THREE.BoxGeometry(w, h, d, 2, 2, 2), jitter);
  const mesh = new THREE.Mesh(geo, clayMat(color));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
export function clayBall(r, color, jitter = 0.05) {
  const geo = handMake(new THREE.SphereGeometry(r, 14, 11), jitter);
  const mesh = new THREE.Mesh(geo, clayMat(color));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// wedge ramp mesh pointing +x (low at -x, high at +x), footprint w(x)*h*d
export function clayRamp(w, h, d, color) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, h); shape.lineTo(-w / 2, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
  geo.translate(0, 0, -d / 2);
  handMake(geo, 0.05);
  const mesh = new THREE.Mesh(geo, clayMat(color));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// ---------- explorer kid ----------
export function buildKid() {
  const g = new THREE.Group();
  const skin = 0xf2b880, shirt = 0x3fa7ff, pants = 0x6b4a2f, cap = 0xe14b32;
  const body = clayBox(0.62, 0.7, 0.4, shirt); body.position.y = 1.05; g.add(body);
  const pack = clayBox(0.4, 0.5, 0.22, 0x8a5a2b); pack.position.set(0, 1.05, -0.3); g.add(pack);
  const head = clayBall(0.34, skin); head.position.y = 1.75; g.add(head);
  const nose = clayBall(0.07, 0xd98a52, 0.01); nose.position.set(0, 1.72, 0.33); g.add(nose);
  const eL = clayBall(0.055, 0x221510, 0.005); eL.position.set(-0.12, 1.82, 0.29); g.add(eL);
  const eR = eL.clone(); eR.position.x = 0.12; g.add(eR);
  const hat = clayBall(0.2, cap); hat.scale.set(1.15, 0.55, 1.15); hat.position.y = 2.02; g.add(hat);
  const brim = new THREE.Mesh(handMake(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 12), 0.02), clayMat(cap));
  brim.position.y = 1.95; brim.castShadow = true; g.add(brim);
  const scarf = clayBox(0.5, 0.14, 0.44, 0xffd23f, 0.03); scarf.position.y = 1.45; g.add(scarf);
  const mkLimb = (w, l, c) => { const m = clayBox(w, l, w, c, 0.03); m.geometry.translate(0, -l / 2, 0); m.castShadow = true; return m; };
  const armL = mkLimb(0.18, 0.62, shirt); armL.position.set(-0.42, 1.32, 0); g.add(armL);
  const armR = mkLimb(0.18, 0.62, shirt); armR.position.set(0.42, 1.32, 0); g.add(armR);
  const legL = mkLimb(0.22, 0.62, pants); legL.position.set(-0.16, 0.72, 0); g.add(legL);
  const legR = mkLimb(0.22, 0.62, pants); legR.position.set(0.16, 0.72, 0); g.add(legR);
  g.userData = { armL, armR, legL, legR, body, head };
  return g;
}

// ---------- pickups / props ----------
export function buildBead() {
  const grp = new THREE.Group();
  const bead = new THREE.Mesh(handMake(new THREE.TorusGeometry(0.28, 0.13, 10, 18), 0.02),
    new THREE.MeshStandardMaterial({ color: 0x35e0ff, roughness: 0.35, metalness: 0.1, emissive: 0x0a5a66, emissiveIntensity: 0.7 }));
  bead.castShadow = true; grp.add(bead);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.14 }));
  grp.add(glow);
  grp.userData.bead = bead;
  return grp;
}
export function buildFlower() {
  const grp = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.9, 8), clayMat(0x3f9e3f));
  stem.position.y = 0.45; grp.add(stem);
  for (let i = 0; i < 6; i++) {
    const p = clayBall(0.2, 0xff5fa2, 0.02);
    const a = i / 6 * Math.PI * 2;
    p.position.set(Math.cos(a) * 0.3, 1.0, Math.sin(a) * 0.3); grp.add(p);
  }
  const core = clayBall(0.2, 0xffe14d, 0.02); core.position.y = 1.0; grp.add(core);
  grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return grp;
}
export function buildFlag(check = false) {
  const grp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 8), clayMat(0x7a4a22));
  pole.position.y = 1.3; pole.castShadow = true; grp.add(pole);
  const flag = clayBox(0.9, 0.55, 0.06, check ? 0x57b24a : 0xcccccc, 0.03);
  flag.position.set(0.5, 2.2, 0); grp.add(flag);
  grp.userData.flag = flag;
  return grp;
}
export function buildGoal() {
  const grp = new THREE.Group();
  const mk = (x) => { const p = clayBox(0.7, 4.2, 0.7, 0xffd23f); p.position.set(x, 2.1, 0); grp.add(p); };
  mk(-2); mk(2);
  const top = clayBox(4.7, 0.7, 0.7, 0xffd23f); top.position.y = 4.3; grp.add(top);
  const orb = clayBall(0.55, 0xfff2ad, 0.02);
  orb.material = new THREE.MeshStandardMaterial({ color: 0xffe14d, emissive: 0xaa7700, emissiveIntensity: 1 });
  orb.position.y = 3.5; grp.add(orb);
  grp.userData.orb = orb;
  return grp;
}
export function buildSpike() {
  const grp = new THREE.Group();
  const base = clayBox(1.4, 0.3, 1.4, 0x5a5a66, 0.04); base.position.y = 0.15; grp.add(base);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const s = new THREE.Mesh(handMake(new THREE.ConeGeometry(0.22, 0.9, 7), 0.02), clayMat(0xd8d8e2));
    s.position.set(i * 0.42, 0.7, j * 0.42); s.castShadow = true; grp.add(s);
  }
  return grp;
}
export function buildSoftClay() {
  // glowing soft blob base; shape meshes swapped by game
  const grp = new THREE.Group();
  const blob = clayBall(0.9, 0xb47aff, 0.12);
  blob.material = new THREE.MeshStandardMaterial({ color: 0xb47aff, roughness: 0.8, emissive: 0x5a2bb0, emissiveIntensity: 0.55, map: clayTexture() });
  blob.scale.set(1.2, 0.75, 1.2); blob.position.y = 0.5; blob.castShadow = true;
  grp.add(blob);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.09, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xd9b8ff }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.12; grp.add(ring);
  grp.userData.blob = blob; grp.userData.ring = ring;
  return grp;
}
