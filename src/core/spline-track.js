/**
 * Procedural spline track.
 * Readable rewrite of minified `$I()` + `CL/SL/T()` sampling + mesh builders.
 *
 * Coordinate frame: `s` = arclength along centreline (metres, wraps),
 * `lateral` = metres right of centreline, `heading` = yaw vs tangent.
 */
import * as THREE from 'three';
import { TRACK_CONTROL_POINTS, TUNNEL_ZONES, getTrack } from '../config/tracks.js';

export const TRACK_WIDTH = 14;
export const OVAL_WIDTH = 17;

export function wrapDistance(s, length) {
  return ((s % length) + length) % length;
}

/** Signed shortest delta from a -> b along a loop of `length`. */
export function signedDelta(a, b, length) {
  let d = (b - a) % length;
  if (d > length / 2) d -= length;
  if (d < -length / 2) d += length;
  return d;
}

function terrainRoughness(x, z) {
  return (
    Math.sin(x * 0.012 + Math.sin(z * 0.009) * 2) * 0.5 +
    Math.sin(z * 0.019 + x * 0.007) * 0.28 +
    Math.sin(x * 0.039 - z * 0.031) * 0.12
  );
}

export class SplineTrack {
  constructor(trackId = 'coast') {
    this.id = trackId;
    this.meta = getTrack(trackId);
    this.width = trackId === 'oval' ? OVAL_WIDTH : TRACK_WIDTH;
    this.halfWidth = this.width / 2;
    this.group = new THREE.Group();
    this.group.name = `track-${trackId}`;
    this.localLights = [];
    this.tunnelZones = (TUNNEL_ZONES[trackId] ?? []).map(([a, b]) => [a, b]);
    this.buildCurve();
    this.buildFrames();
    this.buildMeshes();
  }

  buildCurve() {
    const pts = TRACK_CONTROL_POINTS[this.id].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
    this.curve.arcLengthDivisions = 4096;
    this.length = this.curve.getLength();
  }

  buildFrames() {
    // One frame every ~2 m, mirroring `f = ceil(d / 2)` in the original.
    const count = Math.ceil(this.length / 2);
    this.frames = [];
    const pos = new THREE.Vector3();
    const tan = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3();
    const up2 = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const u = i / count;
      this.curve.getPointAt(u, pos);
      this.curve.getTangentAt(u, tan);
      right.crossVectors(tan, up).normalize();
      up2.crossVectors(right, tan).normalize();
      // Curvature estimate from tangent change; drives banking.
      const u2 = (u + 1 / count) % 1;
      const tan2 = this.curve.getTangentAt(u2, new THREE.Vector3());
      const curvature = signedAngleXZ(tan, tan2) * count;
      const bankScale = this.id === 'oval' ? 76 : 20;
      const bankLimit = this.id === 'oval' ? 0.32 : 0.115;
      const bank = THREE.MathUtils.clamp(-curvature * bankScale * 0.01, -bankLimit, bankLimit);
      this.frames.push({
        position: pos.clone(),
        tangent: tan.clone(),
        right: right.clone(),
        up: up2.clone(),
        curvature,
        bank,
      });
    }
  }

  /** Sample centreline frame at arclength `s` (interpolated). */
  sample(s) {
    const n = this.frames.length;
    const wrapped = wrapDistance(s, this.length);
    const f = (wrapped / this.length) * n;
    const i0 = Math.floor(f) % n;
    const i1 = (i0 + 1) % n;
    const t = f - Math.floor(f);
    const a = this.frames[i0];
    const b = this.frames[i1];
    return {
      position: a.position.clone().lerp(b.position, t),
      tangent: a.tangent.clone().lerp(b.tangent, t).normalize(),
      right: a.right.clone().lerp(b.right, t).normalize(),
      up: a.up.clone().lerp(b.up, t).normalize(),
      curvature: THREE.MathUtils.lerp(a.curvature, b.curvature, t),
      bank: THREE.MathUtils.lerp(a.bank, b.bank, t),
    };
  }

  /** World position for (s, lateral, heightAboveRoad). */
  toWorld(s, lateral = 0, height = 0) {
    const f = this.sample(s);
    return f.position
      .clone()
      .addScaledVector(f.right, lateral)
      .addScaledVector(f.up, height);
  }

  surfaceAt(lateral) {
    const edge = Math.abs(lateral) - this.halfWidth;
    if (edge < -0.3) return 'asphalt';
    if (edge < 0.8) return 'kerb';
    if (edge < 3.8) return 'grass';
    return 'gravel';
  }

  inTunnel(s) {
    const u = wrapDistance(s, this.length) / this.length;
    return this.tunnelZones.some(([a, b]) => u >= a && u <= b);
  }

  nearestCorner(u) {
    let best = null;
    let bestDist = Infinity;
    for (const c of this.meta.corners) {
      const d = Math.abs(u - c.s);
      const wrapped = Math.min(d, 1 - d);
      if (wrapped < bestDist) {
        bestDist = wrapped;
        best = c;
      }
    }
    return bestDist * this.length < 75 ? best : null;
  }

  minimapPoints(count = 80) {
    const pts = this.curve.getPoints(count);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const span = Math.max(maxX - minX, maxZ - minZ) || 1;
    return pts.map((p) => ({
      x: 0.5 + ((p.x - (minX + maxX) / 2) / span) * 0.86,
      y: 0.5 + ((p.z - (minZ + maxZ) / 2) / span) * 0.86,
    }));
  }

  buildMeshes() {
    this.buildRoad();
    this.buildTerrain();
    this.buildBarriers();
    this.buildBiomeProps();
    this.buildStartLine();
  }

  buildRoad() {
    const segments = this.frames.length;
    const across = 12;
    const positions = [];
    const uvs = [];
    const indices = [];
    for (let i = 0; i <= segments; i++) {
      const f = this.frames[i % segments];
      for (let j = 0; j <= across; j++) {
        const lat = (j / across - 0.5) * this.width;
        const bankLift = Math.abs(lat) * Math.tan(f.bank);
        const p = f.position.clone().addScaledVector(f.right, lat).addScaledVector(f.up, bankLift + 0.02);
        positions.push(p.x, p.y, p.z);
        uvs.push(j / across, i / 8);
      }
    }
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < across; j++) {
        const a = i * (across + 1) + j;
        const b = a + across + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: '#33373a', roughness: 0.92, metalness: 0.02 });
    const road = new THREE.Mesh(geo, mat);
    road.receiveShadow = true;
    road.name = 'road';
    this.group.add(road);
    this.roadMesh = road;

    // Centre dashes: thin white boxes every ~12 m.
    const dashGeo = new THREE.BoxGeometry(0.28, 0.02, 3);
    const dashMat = new THREE.MeshBasicMaterial({ color: '#cfd6cd' });
    const dashCount = Math.floor(this.length / 12);
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
    const m = new THREE.Matrix4();
    for (let i = 0; i < dashCount; i++) {
      const p = this.toWorld((i / dashCount) * this.length, 0, 0.05);
      const f = this.sample((i / dashCount) * this.length);
      const look = p.clone().add(f.tangent);
      m.lookAt(p, look, f.up);
      m.setPosition(p);
      dashes.setMatrixAt(i, m);
    }
    this.group.add(dashes);
  }

  buildTerrain() {
    // Big ground disc tinted per biome, displaced by cheap noise.
    const geo = new THREE.PlaneGeometry(2400, 2400, 48, 48);
    geo.rotateX(-Math.PI / 2);
    const posAttr = geo.attributes.position;
    const biomeTint = { coast: '#5d7a5e', mountain: '#6a7078', desert: '#b98d5f', forest: '#3e6b41', city: '#2a2f33', oval: '#5a7050' };
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const d = terrainRoughness(x, z);
      const amp = this.id === 'mountain' ? 75 : this.id === 'desert' ? 28 : this.id === 'forest' ? 31 : 20;
      posAttr.setY(i, -2 + d * amp * 0.12 - Math.min(100, Math.hypot(x, z)) * 0.002);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: biomeTint[this.id] ?? '#55604f', roughness: 1 });
    const ground = new THREE.Mesh(geo, mat);
    ground.position.y = -2.2;
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  buildBarriers() {
    // Low walls just outside the road edge — also the collision limit.
    const mat = new THREE.MeshStandardMaterial({ color: '#c8cfc6', roughness: 0.6 });
    const neon = this.id === 'city';
    const barrierMat = neon
      ? new THREE.MeshStandardMaterial({ color: '#f783d8', emissive: '#a02070', emissiveIntensity: 0.7 })
      : mat;
    const geo = new THREE.BoxGeometry(0.5, 0.9, 4);
    const count = Math.floor(this.length / 4);
    const inst = new THREE.InstancedMesh(geo, barrierMat, count * 2);
    const m = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < count; i++) {
      const s = (i / count) * this.length;
      for (const side of [-1, 1]) {
        const lat = side * (this.halfWidth + (this.id === 'oval' ? 3.5 : 4.6));
        const p = this.toWorld(s, lat, 0.45);
        const f = this.sample(s);
        const look = p.clone().add(f.tangent);
        m.lookAt(p, look, f.up);
        m.setPosition(p);
        inst.setMatrixAt(k++, m);
      }
    }
    inst.castShadow = false;
    this.group.add(inst);
  }

  buildBiomeProps() {
    // Cheap readable stand-ins for the original's instanced forests /
    // canyon rocks / city towers / floodlights. Counts scale with quality
    // in world.js; here we build the medium-density set.
    const rng = mulberry32(1637 + TRACKS_INDEX[this.id] * 721);
    const dummy = new THREE.Object3D();
    if (this.id === 'forest' || this.id === 'mountain' || this.id === 'coast') {
      const treeGeo = new THREE.ConeGeometry(2.2, 9, 6);
      const treeMat = new THREE.MeshStandardMaterial({ color: this.id === 'coast' ? '#3f6b4a' : '#2d5233', roughness: 1 });
      const trunkGeo = new THREE.CylinderGeometry(0.4, 0.5, 2.5, 5);
      const trunkMat = new THREE.MeshStandardMaterial({ color: '#4a3a28', roughness: 1 });
      const trees = new THREE.InstancedMesh(treeGeo, treeMat, 350);
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, 350);
      for (let i = 0; i < 350; i++) {
        const s = rng() * this.length;
        const side = rng() > 0.5 ? 1 : -1;
        const lat = side * (this.halfWidth + 8 + rng() * 90);
        const p = this.toWorld(s, lat, 0);
        p.y = Math.max(p.y, -1) + 4;
        dummy.position.copy(p);
        dummy.rotation.set(0, rng() * Math.PI, 0);
        dummy.updateMatrix();
        trees.setMatrixAt(i, dummy.matrix);
        dummy.position.y -= 5;
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);
      }
      trees.castShadow = true;
      this.group.add(trees, trunks);
    }
    if (this.id === 'desert' || this.id === 'mountain') {
      const rockGeo = new THREE.DodecahedronGeometry(4, 0);
      const rockMat = new THREE.MeshStandardMaterial({ color: this.id === 'desert' ? '#a9764f' : '#7d838c', roughness: 1, flatShading: true });
      const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 120);
      for (let i = 0; i < 120; i++) {
        const s = rng() * this.length;
        const side = rng() > 0.5 ? 1 : -1;
        const p = this.toWorld(s, side * (this.halfWidth + 20 + rng() * 150), 0);
        dummy.position.copy(p);
        dummy.scale.setScalar(0.5 + rng() * 2.2);
        dummy.rotation.set(rng(), rng() * 3, rng());
        dummy.updateMatrix();
        rocks.setMatrixAt(i, dummy.matrix);
        dummy.scale.setScalar(1);
      }
      rocks.castShadow = true;
      this.group.add(rocks);
    }
    if (this.id === 'city') {
      const towerGeo = new THREE.BoxGeometry(18, 90, 18);
      const towerMat = new THREE.MeshStandardMaterial({ color: '#1c232b', roughness: 0.4, metalness: 0.4, emissive: '#123', emissiveIntensity: 0.25 });
      const towers = new THREE.InstancedMesh(towerGeo, towerMat, 60);
      for (let i = 0; i < 60; i++) {
        const s = rng() * this.length;
        const side = rng() > 0.5 ? 1 : -1;
        const p = this.toWorld(s, side * (this.halfWidth + 30 + rng() * 120), 30);
        dummy.position.copy(p);
        dummy.rotation.set(0, rng() * Math.PI, 0);
        dummy.updateMatrix();
        towers.setMatrixAt(i, dummy.matrix);
      }
      this.group.add(towers);
      // A few coloured point lights for the night vibe (capped by quality in world.js).
      for (let i = 0; i < 6; i++) {
        const s = (i / 6) * this.length;
        const light = new THREE.PointLight(i % 2 ? 0xf783d8 : 0x4ce4d2, 60, 90, 1.8);
        light.position.copy(this.toWorld(s, 0, 12));
        this.group.add(light);
        this.localLights.push(light);
      }
    }
  }

  buildStartLine() {
    const geo = new THREE.PlaneGeometry(this.width, 2.4);
    const mat = new THREE.MeshBasicMaterial({ color: '#e8ece2' });
    const line = new THREE.Mesh(geo, mat);
    const p = this.toWorld(0, 0, 0.04);
    const f = this.sample(0);
    line.position.copy(p);
    line.lookAt(p.clone().add(f.tangent));
    line.rotateX(-Math.PI / 2);
    this.group.add(line);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((mm) => mm.dispose());
    });
  }
}

/** Minimap polyline for a track id without building any meshes. */
export function trackMinimapPoints(trackId, count = 80) {
  const controls = TRACK_CONTROL_POINTS[trackId].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(controls, true, 'centripetal', 0.5);
  const pts = curve.getPoints(count);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const span = Math.max(maxX - minX, maxZ - minZ) || 1;
  return pts.map((p) => ({
    x: 0.5 + ((p.x - (minX + maxX) / 2) / span) * 0.86,
    y: 0.5 + ((p.z - (minZ + maxZ) / 2) / span) * 0.86,
  }));
}

const TRACKS_INDEX = { coast: 0, mountain: 1, desert: 2, forest: 3, city: 4, oval: 5 };

export function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let e = t;
    e = Math.imul(e ^ (e >>> 15), e | 1);
    e ^= e + Math.imul(e ^ (e >>> 7), e | 61);
    return ((e ^ (e >>> 14)) >>> 0) / 4294967296;
  };
}

function signedAngleXZ(a, b) {
  return Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);
}
