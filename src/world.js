import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// All art is generated locally. Static details are batched by material and foliage
// is instanced; the only articulated objects are soldiers and fluttering banners.
const SIZE = 110;
const HALF = SIZE / 2;
const UNIT_KINDS = new Set(['worker', 'footman', 'archer', 'hero']);
const BUILDING_KINDS = new Set(['hall', 'barracks', 'farm', 'tower', 'stronghold']);
const clamp = THREE.MathUtils.clamp;
const UP = new THREE.Vector3(0, 1, 0);
const tmpObject = new THREE.Object3D();
const tmpVector = new THREE.Vector3();
const tmpColor = new THREE.Color();

function randomGenerator(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let n = Math.imul(seed ^ seed >>> 15, 1 | seed);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function heightAt(x, z) {
  const home = 1 - Math.exp(-((x + 28) ** 2 + (z - 26) ** 2) / 220);
  const enemy = 1 - Math.exp(-((x - 29) ** 2 + (z + 28) ** 2) / 160);
  const waves = Math.sin(x * 0.095 + z * 0.035) * 0.65
    + Math.cos(z * 0.11 - x * 0.035) * 0.48
    + Math.sin(x * 0.24 + z * 0.19) * 0.18;
  return waves * home * enemy - 0.1;
}

function roofGeometry() {
  // A pitched roof with genuinely deep eaves, rather than a cube painted blue.
  const p = [
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5,
    0.5, 0, 0.5, -0.5, 0, 0.5, 0, 1, 0.5,
    -0.5, 0, 0.5, -0.5, 0, -0.5, 0, 1, -0.5,
    -0.5, 0, 0.5, 0, 1, -0.5, 0, 1, 0.5,
    0.5, 0, -0.5, 0.5, 0, 0.5, 0, 1, 0.5,
    0.5, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5,
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 0, -0.5,
    -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, -0.5,
  ];
  // The slopes face outward/up; reverse the template's triangle winding.
  for (let i = 0; i < p.length; i += 9) {
    for (let axis = 0; axis < 3; axis++) {
      const n = p[i + 3 + axis];
      p[i + 3 + axis] = p[i + 6 + axis];
      p[i + 6 + axis] = n;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(p.length / 3 * 2).fill(0), 2));
  g.computeVertexNormals();
  return g;
}

class Art {
  constructor() {
    this.materials = new Map();
    this.geometries = {
      box: new THREE.BoxGeometry(1, 1, 1),
      round: new THREE.CylinderGeometry(1, 1, 1, 10),
      cone: new THREE.ConeGeometry(1, 1, 8),
      pyramid: new THREE.ConeGeometry(1, 1, 4),
      ball: new THREE.IcosahedronGeometry(1, 1),
      rock: new THREE.IcosahedronGeometry(1, 0),
      roof: roofGeometry(),
      torus: new THREE.TorusGeometry(1, 0.12, 5, 14),
    };
    this.stone = this.mat('#b6b49a');
    this.lightStone = this.mat('#e0d7b7');
    this.darkStone = this.mat('#73796d');
    this.wood = this.mat('#614737');
    this.woodLight = this.mat('#a17b4c');
    this.dark = this.mat('#29343a');
    this.gold = this.mat('#dcb452', { metalness: 0.35, roughness: 0.48 });
    this.skin = this.mat('#e0b28b');
    this.steel = this.mat('#b9cfce', { metalness: 0.45, roughness: 0.4 });
    this.glow = this.mat('#ffd27c', { emissive: '#ffa735', emissiveIntensity: 0.7 });
    this.unitMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.66, metalness: 0.14 });
    this.materials.set('unit-vertex-colors', this.unitMaterial);
  }

  mat(color, extra = {}) {
    const key = color + JSON.stringify(extra);
    if (!this.materials.has(key)) {
      this.materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.88, flatShading: true, ...extra }));
    }
    return this.materials.get(key);
  }

  palette(team) {
    const enemy = team === 'enemy';
    return {
      cloth: this.mat(enemy ? '#a63735' : '#285f9e'),
      roof: this.mat(enemy ? '#842f39' : '#304f80'),
      bright: this.mat(enemy ? '#e35442' : '#4b94d2'),
      stone: enemy ? this.mat('#8b8d86') : this.stone,
      gold: this.gold,
    };
  }

  batch() { return new Map(); }

  part(batch, shape, material, position, scale, rotation = [0, 0, 0]) {
    const geometry = this.geometries[shape].clone();
    tmpObject.position.set(...position);
    tmpObject.scale.set(...scale);
    tmpObject.rotation.set(...rotation);
    tmpObject.updateMatrix();
    geometry.applyMatrix4(tmpObject.matrix);
    const geometries = batch.get(material) || [];
    geometries.push(geometry);
    batch.set(material, geometries);
  }

  beam(batch, material, a, b, width = 0.12) {
    const start = new THREE.Vector3(...a);
    const finish = new THREE.Vector3(...b);
    const direction = finish.clone().sub(start);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    this.part(batch, 'box', material, start.add(finish).multiplyScalar(0.5).toArray(),
      [width, direction.length(), width], [e.x, e.y, e.z]);
  }

  finish(batch, parent = new THREE.Group(), shadow = true) {
    for (const [material, geometries] of batch) {
      const converted = geometries.map(source => source.index ? source.toNonIndexed() : source);
      const g = mergeGeometries(converted);
      for (let i = 0; i < converted.length; i++) {
        if (converted[i] !== geometries[i]) converted[i].dispose();
      }
      for (const source of geometries) source.dispose();
      const mesh = new THREE.Mesh(g, material);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    return parent;
  }

  finishColored(batch, parent) {
    const pieces = [];
    for (const [material, geometries] of batch) {
      const color = material.color;
      for (const source of geometries) {
        const geometry = source.index ? source.toNonIndexed() : source;
        const count = geometry.attributes.position.count;
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        pieces.push(geometry);
        if (geometry !== source) source.dispose();
      }
    }
    const merged = mergeGeometries(pieces);
    for (const geometry of pieces) geometry.dispose();
    const mesh = new THREE.Mesh(merged, this.unitMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return parent;
  }

  window(batch, x, y, z, width = 0.42, height = 0.7, side = false) {
    const rotation = side ? [0, Math.PI / 2, 0] : [0, 0, 0];
    this.part(batch, 'box', this.dark, [x, y, z], [width + 0.18, height + 0.18, 0.1], rotation);
    this.part(batch, 'box', this.glow, [x + (side ? 0.065 : 0), y, z + (side ? 0 : 0.065)], [width, height, 0.08], rotation);
    this.part(batch, 'box', this.gold, [x + (side ? 0.12 : 0), y, z + (side ? 0 : 0.12)], [0.07, height, 0.07], rotation);
  }

  roofTiles(batch, width, height, depth, baseY, material) {
    // Long courses of overlapping slate catch the sun across each pitched slope.
    for (const side of [-1, 1]) {
      for (let course = 1; course < 6; course++) {
        const t = course / 6;
        const x = side * width / 2 * (1 - t);
        const y = baseY + height * t + 0.025;
        this.beam(batch, material, [x, y, -depth / 2], [x, y, depth / 2], 0.045);
      }
    }
  }

  flag(parent, team, x, y, z, height = 1.6) {
    const palette = this.palette(team);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, height, 6), this.gold);
    pole.position.set(x, y + height / 2, z);
    parent.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.63, 4, 2), palette.cloth);
    flag.material = flag.material.clone();
    flag.material.side = THREE.DoubleSide;
    flag.position.set(x + 0.48, y + height - 0.38, z);
    flag.userData.banner = true;
    parent.add(flag);
    const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), this.gold);
    emblem.scale.set(1, 1.7, 0.18);
    emblem.position.copy(flag.position);
    emblem.position.z += 0.035;
    parent.add(emblem);
  }

  building(kind, team, radius = 3) {
    const group = new THREE.Group();
    const b = this.batch();
    const p = this.palette(team);
    const add = (shape, material, pos, size, rot) => this.part(b, shape, material, pos, size, rot);
    const beam = (a, c, w = 0.12, mat = this.wood) => this.beam(b, mat, a, c, w);
    let top = 5;

    if (kind === 'hall' || kind === 'stronghold') {
      const enemy = kind === 'stronghold';
      const width = enemy ? 6.5 : 6.2;
      add('box', this.darkStone, [0, 0.22, 0], [width + 1, 0.45, 5.8]);
      add('box', p.stone, [0, 1.95, 0], [width, 3.5, 4.7]);
      add('box', this.lightStone, [0, 0.65, 0], [width + 0.18, 0.3, 4.85]);
      add('box', this.gold, [0, 3.55, 0], [width + 0.18, 0.16, 4.88]);
      add('roof', p.roof, [0, 3.65, 0], [width + 0.95, 2.15, 5.75]);
      this.roofTiles(b, width + 0.95, 2.15, 5.75, 3.65, p.bright);
      beam([0, 5.85, -2.95], [0, 5.85, 2.95], 0.13, this.gold);
      // Timber framing, masonry buttresses, and bands make the hall legible from above.
      for (const x of [-2.5, -1.3, 1.3, 2.5]) {
        add('box', this.wood, [x, 2.0, 2.4], [0.15, 3.1, 0.14]);
        if (Math.abs(x) > 2) add('box', this.lightStone, [x, 1.0, 2.65], [0.65, 1.85, 0.65]);
        this.window(b, x, 2.5, 2.47, 0.45, 0.8);
      }
      for (const side of [-1, 1]) {
        for (const z of [-1.4, 0, 1.4]) {
          add('box', this.wood, [side * (width / 2 + 0.02), 2, z], [0.15, 3.1, 0.16]);
          if (side > 0) this.window(b, width / 2 + 0.06, 2.4, z, 0.5, 0.8, true);
        }
        // Blue/gold copper-roofed corner towers.
        const x = side * 2.85;
        add('round', this.lightStone, [x, 2.25, -1.7], [0.85, 4.5, 0.85]);
        add('round', this.gold, [x, 4.3, -1.7], [0.94, 0.18, 0.94]);
        add('cone', p.roof, [x, 5.25, -1.7], [1.22, 2.0, 1.22]);
        add('ball', this.gold, [x, 6.32, -1.7], [0.16, 0.2, 0.16]);
      }
      // Raised entrance porch with individually stepped approach.
      add('box', this.dark, [0, 1.25, 2.43], [1.55, 2.35, 0.12]);
      add('box', this.woodLight, [0, 1.15, 2.53], [1.28, 2.12, 0.1]);
      for (const x of [-0.35, 0.35]) add('box', this.gold, [x, 1.1, 2.62], [0.09, 1.9, 0.07]);
      for (const x of [-1.12, 1.12]) add('box', this.lightStone, [x, 1.3, 3.03], [0.4, 2.6, 0.45]);
      add('roof', p.roof, [0, 2.62, 3.05], [2.9, 1.1, 1.85]);
      for (let i = 0; i < 4; i++) add('box', this.lightStone, [0, 0.12 + i * 0.1, 4.1 - i * 0.31], [2.55, 0.23 + i * 0.2, 0.6]);
      // Roof dormers face the initial camera.
      for (const z of [-1.35, 1.35]) {
        add('box', p.stone, [2.0, 4.45, z], [0.8, 0.75, 0.8]);
        add('roof', p.roof, [2, 4.85, z], [1.15, 0.6, 1.1], [0, Math.PI / 2, 0]);
        this.window(b, 2.46, 4.48, z, 0.35, 0.45, true);
      }
      add('box', this.darkStone, [-1.8, 4.85, -0.65], [0.5, 2.1, 0.62]);
      add('box', this.lightStone, [-1.8, 5.91, -0.65], [0.72, 0.2, 0.8]);
      if (enemy) {
        // The hostile citadel has a fortified silhouette of its own: two low
        // crenellated bastions flank the approach beneath the crimson keep.
        for (const side of [-1, 1]) {
          const x = side * 3.45;
          add('round', this.darkStone, [x, 1.2, 2.1], [0.95, 2.4, 0.95]);
          add('round', p.stone, [x, 2.48, 2.1], [1.07, 0.25, 1.07]);
          for (let i = 0; i < 8; i++) {
            const a = i / 8 * Math.PI * 2;
            add('box', this.lightStone, [x + Math.cos(a) * 0.9, 2.8, 2.1 + Math.sin(a) * 0.9], [0.35, 0.5, 0.35], [0, -a, 0]);
          }
          add('box', p.cloth, [x, 1.9, 3.06], [0.55, 0.9, 0.08]);
          add('box', this.gold, [x, 1.9, 3.11], [0.08, 0.62, 0.03]);
          this.flag(group, team, x, 2.65, 2.1, 1.6);
        }
      }
      this.flag(group, team, 0, 5.85, 0, 2.2);
      top = 8.15;
    } else if (kind === 'barracks') {
      add('box', this.darkStone, [0, 0.18, 0], [6.3, 0.4, 4.5]);
      add('box', p.stone, [0, 1.35, 0], [5.8, 2.5, 3.8]);
      add('roof', p.roof, [0, 2.6, 0], [6.7, 1.8, 4.7]);
      this.roofTiles(b, 6.7, 1.8, 4.7, 2.6, p.bright);
      beam([0, 4.45, -2.4], [0, 4.45, 2.4], 0.14, this.gold);
      for (const x of [-2.7, -1.5, 1.5, 2.7]) {
        add('box', this.wood, [x, 1.4, 1.97], [0.18, 2.5, 0.16]);
        if (Math.abs(x) < 2) this.window(b, x, 1.65, 2.0, 0.5, 0.7);
      }
      add('box', this.dark, [0, 1.1, 1.96], [1.75, 2.1, 0.12]);
      add('box', this.woodLight, [0, 1, 2.03], [1.5, 1.9, 0.12]);
      for (let i = -2; i <= 2; i++) add('box', this.wood, [i * 0.29, 1, 2.11], [0.035, 1.9, 0.04]);
      for (const x of [-3.35, 3.35]) {
        add('box', this.lightStone, [x, 1.65, -0.4], [1.1, 3.3, 1.3]);
        add('roof', p.roof, [x, 3.35, -0.4], [1.5, 0.95, 1.7]);
      }
      // Crossed steel swords and a shield over the doors.
      add('ball', p.cloth, [0, 2.62, 2.28], [0.4, 0.53, 0.1]);
      for (const sign of [-1, 1]) beam([sign * 0.5, 2.15, 2.2], [-sign * 0.5, 3.05, 2.2], 0.085, this.steel);
      // Weapon racks and target outside the barracks.
      for (const x of [-2.2, -1.45]) beam([x, 0.1, 3.05], [x, 1.7, 3.05], 0.12);
      beam([-2.3, 1.3, 3.05], [-1.35, 1.3, 3.05], 0.12);
      for (let i = 0; i < 3; i++) {
        beam([-2.15 + i * 0.3, 0.2, 3.2], [-2.15 + i * 0.3, 2.0, 3.2], 0.05, this.woodLight);
        add('cone', this.steel, [-2.15 + i * 0.3, 2.05, 3.2], [0.08, 0.25, 0.08]);
      }
      add('round', this.woodLight, [2.4, 0.5, 2.8], [0.45, 0.85, 0.45]);
      this.flag(group, team, -3.35, 4.25, -0.4);
      top = 5.9;
    } else if (kind === 'farm') {
      add('box', this.darkStone, [0, 0.15, 0], [3.6, 0.3, 3]);
      add('box', this.lightStone, [0, 1.03, 0], [3.15, 1.8, 2.55]);
      add('roof', p.roof, [0, 1.95, 0], [3.9, 1.4, 3.35]);
      this.roofTiles(b, 3.9, 1.4, 3.35, 1.95, p.bright);
      for (const x of [-1.4, 0, 1.4]) add('box', this.wood, [x, 1.04, 1.32], [0.13, 1.75, 0.12]);
      beam([-1.4, 0.3, 1.34], [-0.2, 1.75, 1.34], 0.08);
      beam([1.4, 0.3, 1.34], [0.2, 1.75, 1.34], 0.08);
      add('box', this.woodLight, [0, 0.78, 1.38], [0.7, 1.35, 0.08]);
      this.window(b, 0.9, 1.22, 1.36, 0.38, 0.45);
      add('box', this.darkStone, [0.95, 2.6, -0.55], [0.42, 1.75, 0.48]);
      // Wheat plot, small fence, hay bales, and a supply barrel.
      add('box', this.mat('#66513c'), [-2.65, 0.04, 0], [1.5, 0.1, 3.0]);
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          add('cone', this.mat('#c5b565'), [-3.13 + col * 0.43, 0.4, -1.05 + row * 0.5], [0.15, 0.65, 0.15]);
        }
      }
      for (const z of [-1.6, 1.6]) {
        for (const x of [-3.45, -2.6, -1.8]) add('box', this.woodLight, [x, 0.43, z], [0.1, 0.8, 0.1]);
        beam([-3.45, 0.48, z], [-1.8, 0.48, z], 0.09, this.woodLight);
      }
      add('round', this.mat('#ccac64'), [2.05, 0.45, -0.5], [0.55, 0.85, 0.55], [0, 0, Math.PI / 2]);
      add('round', this.woodLight, [1.85, 0.4, 1.15], [0.35, 0.7, 0.35]);
      top = 3.55;
    } else if (kind === 'tower') {
      add('box', this.darkStone, [0, 0.2, 0], [2.6, 0.4, 2.6]);
      add('box', p.stone, [0, 2.25, 0], [1.9, 4.5, 1.9]);
      for (const x of [-0.88, 0.88]) for (const z of [-0.88, 0.88]) {
        add('box', this.lightStone, [x, 2.3, z], [0.28, 4.55, 0.28]);
      }
      for (const y of [0.7, 2.5, 4.3]) add('box', this.lightStone, [0, y, 0], [2.12, 0.15, 2.12]);
      this.window(b, 0, 3.25, 0.98, 0.3, 0.8);
      this.window(b, 0.98, 3.25, 0, 0.3, 0.8, true);
      add('box', this.wood, [0, 4.65, 0], [3, 0.35, 3]);
      for (const x of [-1.25, 1.25]) for (const z of [-1.25, 1.25]) {
        add('box', this.woodLight, [x, 5.25, z], [0.16, 1.4, 0.16]);
      }
      for (const side of [-1, 1]) {
        add('box', p.cloth, [0, 5.05, side * 1.43], [2.9, 0.5, 0.1]);
        add('box', p.cloth, [side * 1.43, 5.05, 0], [0.1, 0.5, 2.9]);
      }
      add('roof', p.roof, [0, 5.85, 0], [3.6, 1.6, 3.6]);
      beam([0, 7.5, -1.8], [0, 7.5, 1.8], 0.1, this.gold);
      this.flag(group, team, 0, 7.45, 0, 1.3);
      top = 8.8;
    }
    this.finish(b, group);
    group.userData.height = top;
    group.userData.radius = radius;
    return group;
  }

  mine(radius = 3) {
    const group = new THREE.Group();
    const b = this.batch();
    const random = randomGenerator(441);
    for (let i = 0; i < 17; i++) {
      const a = i / 17 * Math.PI * 2;
      const r = i < 8 ? 2.0 : 2.9;
      const s = 1.0 + random();
      this.part(b, 'rock', i % 3 ? this.darkStone : this.stone,
        [Math.cos(a) * r, s * 0.6, Math.sin(a) * r - 0.8], [s, s * 1.15, s], [0.1, a, 0.2]);
    }
    this.part(b, 'rock', this.darkStone, [0, 2.1, -0.8], [3.5, 2.6, 2.7]);
    this.part(b, 'box', this.dark, [0, 1.05, 2.03], [2.0, 2.2, 0.11]);
    for (const x of [-1.16, 1.16]) this.part(b, 'box', this.woodLight, [x, 1.25, 2.2], [0.32, 2.6, 0.4], [0, 0, -x * 0.035]);
    this.part(b, 'box', this.woodLight, [0, 2.47, 2.2], [2.8, 0.4, 0.5]);
    for (const x of [-0.6, 0.6]) this.beam(b, this.steel, [x, 0.08, 1.5], [x, 0.08, 5.1], 0.09);
    for (let z = 2; z < 5; z += 0.5) this.part(b, 'box', this.wood, [0, 0.06, z], [1.65, 0.09, 0.16]);
    this.part(b, 'box', this.wood, [1.8, 0.52, 3.4], [0.9, 0.8, 1.25]);
    for (const z of [2.95, 3.85]) for (const x of [1.3, 2.3]) {
      this.part(b, 'round', this.dark, [x, 0.27, z], [0.26, 0.12, 0.26], [0, 0, Math.PI / 2]);
    }
    for (let i = 0; i < 7; i++) this.part(b, 'rock', this.gold,
      [1.8 + (random() - 0.5) * 0.5, 0.95 + random() * 0.2, 3.4 + (random() - 0.5) * 0.6], [0.18, 0.18, 0.22]);
    this.part(b, 'box', this.gold, [-1.17, 1.8, 2.48], [0.3, 0.48, 0.28]);
    this.part(b, 'box', this.glow, [-1.17, 1.8, 2.65], [0.2, 0.32, 0.12]);
    this.finish(b, group);
    group.userData.height = 4.5;
    group.userData.radius = radius;
    return group;
  }

  unit(kind, team) {
    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);
    const b = this.batch();
    const p = this.palette(team);
    const hero = kind === 'hero';
    const worker = kind === 'worker';
    const archer = kind === 'archer';
    const armor = worker ? this.mat('#b8a077') : archer ? this.mat('#658269') : this.steel;
    const add = (shape, material, pos, size, rot) => this.part(b, shape, material, pos, size, rot);
    // Local +Z is forward. Shapes read as heads, shoulders, tabards and boots.
    add('round', armor, [0, 1.08, 0], [0.29, 0.62, 0.23]);
    add('box', p.cloth, [0, 0.91, 0.19], [0.32, 0.64, 0.055]);
    add('box', this.gold, [0, 0.84, 0.235], [0.06, 0.4, 0.035]);
    add('box', this.wood, [0, 0.86, 0], [0.6, 0.11, 0.48]);
    add('box', this.gold, [0, 0.86, 0.25], [0.12, 0.12, 0.06]);
    add('ball', this.skin, [0, 1.57, 0.025], [0.24, 0.28, 0.22]);
    add('rock', this.skin, [0, 1.54, 0.24], [0.07, 0.075, 0.07]);
    for (const x of [-0.085, 0.085]) add('box', this.dark, [x, 1.63, 0.226], [0.05, 0.035, 0.015]);
    if (worker) {
      add('ball', this.mat('#704c31'), [0, 1.73, -0.025], [0.255, 0.17, 0.23]);
      add('box', this.woodLight, [0, 1.32, 0.22], [0.38, 0.28, 0.06]);
      add('ball', this.mat('#856643'), [0, 1.01, -0.3], [0.31, 0.37, 0.19]);
    } else if (archer) {
      add('cone', p.cloth, [0, 1.84, -0.03], [0.3, 0.43, 0.28], [-0.12, 0, 0]);
      add('round', this.wood, [0.17, 1.14, -0.3], [0.12, 0.63, 0.12], [-0.3, 0, 0.2]);
      for (let i = 0; i < 3; i++) add('box', this.lightStone, [0.12 + i * 0.055, 1.62, -0.38], [0.025, 0.27, 0.04], [-0.3, 0, 0.2]);
    } else {
      add('ball', this.steel, [0, 1.77, -0.015], [0.275, 0.21, 0.26]);
      add('box', this.steel, [0, 1.62, 0.245], [0.46, 0.08, 0.06]);
      add('box', p.cloth, [0, 1.91, -0.05], [0.08, hero ? 0.48 : 0.26, 0.3]);
      for (const x of [-0.36, 0.36]) add('ball', hero ? this.gold : this.steel, [x, 1.34, 0], [0.24, 0.19, 0.26]);
    }
    if (hero) {
      add('roof', p.cloth, [0, 0.75, -0.32], [0.8, 0.8, 0.15], [0.12, 0, 0]);
      add('ball', this.mat('#80d4ff', { emissive: '#389bd9', emissiveIntensity: 1.2 }), [0, 1.2, 0.26], [0.11, 0.15, 0.07]);
    } else if (kind === 'footman') {
      add('box', p.cloth, [0, 1.0, -0.25], [0.48, 0.68, 0.07], [0.14, 0, 0]);
      add('box', this.gold, [0, 0.69, -0.3], [0.48, 0.055, 0.08]);
    }
    this.finishColored(b, body);
    const limbs = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.17, 0.77, 0);
      const lb = this.batch();
      this.part(lb, 'round', this.dark, [0, -0.24, 0], [0.115, 0.48, 0.11]);
      this.part(lb, 'box', this.dark, [0, -0.62, 0.08], [0.24, 0.23, 0.37]);
      this.finishColored(lb, leg);
      body.add(leg);
      limbs.push(leg);
    }
    const arms = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.37, 1.3, 0);
      const ab = this.batch();
      this.part(ab, 'round', armor, [0, -0.2, 0], [0.105, 0.43, 0.105], [0.1, 0, side * 0.13]);
      this.part(ab, 'ball', this.skin, [side * 0.03, -0.46, 0.05], [0.12, 0.13, 0.12]);
      if (side > 0) {
        if (worker) {
          this.beam(ab, this.woodLight, [0, -0.65, 0.06], [0, 0.27, 0.06], 0.065);
          this.beam(ab, this.steel, [-0.3, 0.23, 0.06], [0.3, 0.32, 0.06], 0.09);
        } else if (archer) {
          this.beam(ab, this.woodLight, [0, -0.5, 0.08], [0, -0.5, 0.95], 0.04);
          this.part(ab, 'cone', this.steel, [0, -0.5, 1.02], [0.06, 0.18, 0.06], [Math.PI / 2, 0, 0]);
        } else {
          this.beam(ab, this.wood, [0, -0.62, 0.05], [0, -0.35, 0.05], 0.09);
          this.beam(ab, this.gold, [-0.22, -0.32, 0.05], [0.22, -0.32, 0.05], 0.08);
          this.part(ab, 'box', hero ? this.mat('#bceeff', { emissive: '#378ed1', emissiveIntensity: 0.55 }) : this.steel,
            [0, 0.2, 0.05], [0.12, hero ? 1.2 : 0.95, 0.06]);
          this.part(ab, 'cone', this.steel, [0, hero ? 0.88 : 0.74, 0.05], [0.08, 0.26, 0.055]);
        }
      } else if (!worker && !archer) {
        this.part(ab, 'ball', this.gold, [-0.12, -0.31, 0.18], [0.39, 0.5, 0.12]);
        this.part(ab, 'ball', p.cloth, [-0.13, -0.31, 0.27], [0.33, 0.43, 0.055]);
        this.part(ab, 'box', this.gold, [-0.13, -0.31, 0.325], [0.07, 0.55, 0.035]);
        this.part(ab, 'box', this.gold, [-0.13, -0.31, 0.325], [0.37, 0.07, 0.035]);
      } else if (archer && side < 0) {
        this.part(ab, 'torus', this.woodLight, [0, -0.24, 0.32], [0.3, 0.58, 0.3], [0, Math.PI / 2, 0]);
        this.beam(ab, this.lightStone, [0, 0.35, 0.32], [0, -0.83, 0.32], 0.015);
      }
      this.finishColored(ab, arm);
      body.add(arm);
      arms.push(arm);
    }
    if (hero) group.scale.setScalar(1.25);
    group.userData = { body, limbs, arms, height: hero ? 2.95 : 2.25, radius: hero ? 0.9 : 0.65 };
    return group;
  }

  dispose() {
    for (const material of this.materials.values()) material.dispose();
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
  }
}

export class WorldView {
  constructor(container, game) {
    this.container = container;
    this.game = game;
    this.art = new Art();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#a7bbc2');
    this.scene.fog = new THREE.Fog('#a7bbc2', 95, 190);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    const gl = this.renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const device = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
    this.softwareRenderer = /swiftshader|llvmpipe|softpipe|software/i.test(device);
    this.renderer.setPixelRatio(this.softwareRenderer ? 0.85 : Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.shadowTime = 0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.touchAction = 'none';
    this.canvas.setAttribute('aria-label', 'Ashenfront three-dimensional battlefield');
    container.appendChild(this.canvas);
    this.camera = new THREE.OrthographicCamera(-30, 30, 25, -25, 0.1, 250);
    this.center = { x: -25, z: 22 };
    this.viewSize = 40;
    this.time = 0;
    this.visuals = new Map();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pings = [];
    this.projectiles = [];
    this.preview = null;
    this.treeSignature = '';
    this._lights();
    this._terrain();
    this._roads();
    this._forest();
    this._details();
    this._overlays();
    this._particles();
    this.resize();
    this.update(0, []);
  }

  _lights() {
    this.scene.add(new THREE.HemisphereLight('#d8e9eb', '#536344', 1.6));
    this.sun = new THREE.DirectionalLight('#ffe3b3', 2.7);
    this.sun.position.set(-35, 65, 25);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -43, right: 43, top: 43, bottom: -43, near: 1, far: 150 });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.06;
    this.sun.shadow.radius = 2;
    this.scene.add(this.sun, this.sun.target);
    const rim = new THREE.DirectionalLight('#a5c8ea', 0.75);
    rim.position.set(30, 30, -45);
    this.scene.add(rim);
  }

  _terrain() {
    const geometry = new THREE.PlaneGeometry(SIZE, SIZE, 90, 90);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const colors = [];
    const random = randomGenerator(94);
    const green = new THREE.Color('#466d3e');
    const light = new THREE.Color('#688442');
    const dark = new THREE.Color('#355940');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      positions.setY(i, heightAt(x, z));
      const value = Math.sin(x * 0.18) * Math.cos(z * 0.14) * 0.5 + random() * 0.22;
      tmpColor.copy(green).lerp(value > 0 ? light : dark, Math.abs(value));
      colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    this.ground = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    // Continue the landscape beyond the 110m playable map. This scenery is not
    // pickable, and keeps the initial base view framed by land rather than void.
    const outerVertices = [], outerColors = [];
    const rings = [HALF, 64, 75, 88, 105];
    const point = (side, r, t) => {
      const v = -r + t * r * 2;
      const [x, z] = side === 0 ? [v, -r] : side === 1 ? [r, v] : side === 2 ? [-v, r] : [-r, -v];
      const rise = Math.max(0, Math.max(Math.abs(x), Math.abs(z)) - HALF) * 0.05;
      return [x, heightAt(x, z) + rise * (0.8 + Math.sin(x * 0.06 + z * 0.08)), z];
    };
    const triangle = (a, b, c) => {
      const normalY = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      for (const p of normalY > 0 ? [a, b, c] : [a, c, b]) {
        outerVertices.push(...p);
        const value = Math.sin(p[0] * 0.18) * Math.cos(p[2] * 0.14) * 0.5;
        tmpColor.copy(green).lerp(value > 0 ? light : dark, Math.abs(value));
        outerColors.push(tmpColor.r, tmpColor.g, tmpColor.b);
      }
    };
    for (let band = 0; band < rings.length - 1; band++) {
      for (let side = 0; side < 4; side++) for (let i = 0; i < 90; i++) {
        const a = point(side, rings[band], i / 90), b = point(side, rings[band], (i + 1) / 90);
        const c = point(side, rings[band + 1], i / 90), d = point(side, rings[band + 1], (i + 1) / 90);
        triangle(a, b, c);
        triangle(b, d, c);
      }
    }
    const outerGeometry = new THREE.BufferGeometry();
    outerGeometry.setAttribute('position', new THREE.Float32BufferAttribute(outerVertices, 3));
    outerGeometry.setAttribute('color', new THREE.Float32BufferAttribute(outerColors, 3));
    outerGeometry.computeVertexNormals();
    const outerTerrain = new THREE.Mesh(outerGeometry, this.ground.material);
    outerTerrain.receiveShadow = true;
    this.scene.add(outerTerrain);
    // A softly lit foundation edge makes the map feel like a tangible landscape.
    const edge = new THREE.Mesh(new THREE.BoxGeometry(SIZE, 3, SIZE), this.art.mat('#48513c'));
    edge.position.y = -3.2;
    edge.receiveShadow = true;
    this.scene.add(edge);
    const skirtVertices = [];
    const boundaries = [[[-HALF, -HALF], [HALF, -HALF]], [[HALF, -HALF], [HALF, HALF]],
      [[HALF, HALF], [-HALF, HALF]], [[-HALF, HALF], [-HALF, -HALF]]];
    for (const [a, b] of boundaries) {
      for (let i = 0; i < 90; i++) {
        const x1 = THREE.MathUtils.lerp(a[0], b[0], i / 90), z1 = THREE.MathUtils.lerp(a[1], b[1], i / 90);
        const x2 = THREE.MathUtils.lerp(a[0], b[0], (i + 1) / 90), z2 = THREE.MathUtils.lerp(a[1], b[1], (i + 1) / 90);
        const top1 = [x1, heightAt(x1, z1) - 0.01, z1], top2 = [x2, heightAt(x2, z2) - 0.01, z2];
        const bottom1 = [x1, -1.71, z1], bottom2 = [x2, -1.71, z2];
        skirtVertices.push(...top1, ...bottom1, ...top2, ...top2, ...bottom1, ...bottom2);
      }
    }
    const skirtGeometry = new THREE.BufferGeometry();
    skirtGeometry.setAttribute('position', new THREE.Float32BufferAttribute(skirtVertices, 3));
    skirtGeometry.computeVertexNormals();
    this.scene.add(new THREE.Mesh(skirtGeometry, this.art.mat('#586246', { side: THREE.DoubleSide })));
    const horizon = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), this.art.mat('#87947b'));
    horizon.rotation.x = -Math.PI / 2;
    horizon.position.y = -3.85;
    this.scene.add(horizon);
  }

  _ribbon(points, width, color) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const vertices = [], colors = [], uv = [];
    const c = new THREE.Color(color);
    const count = 90;
    for (let i = 0; i < count; i++) {
      const make = t => {
        const p = curve.getPoint(t);
        const tangent = curve.getTangent(t);
        const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(width / 2);
        const w = 0.96 + Math.sin(t * 95) * 0.075 + Math.sin(t * 271) * 0.02;
        side.multiplyScalar(w);
        return [p.clone().add(side), p.clone().sub(side)];
      };
      const a = make(i / count), b = make((i + 1) / count);
      for (const point of [a[0], b[0], a[1], a[1], b[0], b[1]]) {
        vertices.push(point.x, heightAt(point.x, point.z) + 0.035, point.z);
        const shade = 0.92 + Math.sin(point.x * 2 + point.z * 3) * 0.035;
        colors.push(c.r * shade, c.g * shade, c.b * shade);
        uv.push(0, 0);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  _roads() {
    const entities = this.game.state.entities;
    const hall = entities.find(e => e.kind === 'hall') || { x: -28, z: 26 };
    this._ribbon([[hall.x, hall.z + 4], [-24, 31], [-16, 29], [-11, 18], [-7, 8], [4, -4], [15, -13], [29, -24]], 2.9, '#a09469');
    const mine = entities.find(e => e.kind === 'goldmine');
    if (mine) this._ribbon([[hall.x, hall.z + 4], [hall.x - 6, hall.z + 5], [mine.x, mine.z + 4.5]], 1.6, '#948663');
    for (const e of entities.filter(e => BUILDING_KINDS.has(e.kind) && e.team === 'player' && e.kind !== 'hall')) {
      this._ribbon([[hall.x, hall.z + 4], [(e.x + hall.x) / 2, (e.z + hall.z) / 2 + 3], [e.x, e.z + 2.8]], 1.2, '#9c906b');
    }
    // Small cobbles are batched into a single mesh, irregular rather than a grid.
    const b = this.art.batch(), random = randomGenerator(76);
    for (let i = 0; i < 200; i++) {
      const x = hall.x + (random() - 0.5) * 12;
      const z = hall.z + 3.5 + (random() - 0.5) * 7;
      if ((x - hall.x) ** 2 / 36 + (z - hall.z - 3.5) ** 2 / 13 > 1) continue;
      this.art.part(b, 'rock', this.art.mat(i % 3 ? '#95977c' : '#b0ad8a'), [x, heightAt(x, z) + 0.035, z],
        [0.14 + random() * 0.15, 0.035, 0.18 + random() * 0.17], [0, random() * 6.28, 0]);
    }
    this.scene.add(this.art.finish(b, new THREE.Group(), false));
    this._settlementDetails(hall);
  }

  _settlementDetails(hall) {
    const b = this.art.batch();
    const p = this.art.palette('player');
    const add = (shape, material, offset, scale, rotation) => {
      const x = hall.x + offset[0], z = hall.z + offset[2];
      this.art.part(b, shape, material, [x, heightAt(x, z) + offset[1], z], scale, rotation);
    };
    // Gate lanterns, supply stacks, and a little covered well give the starting
    // settlement a lived-in silhouette without inventing simulation buildings.
    for (const side of [-1, 1]) {
      add('round', this.art.darkStone, [side * 3.1, 0.18, 5], [0.35, 0.35, 0.35]);
      add('round', this.art.wood, [side * 3.1, 1.4, 5], [0.075, 2.5, 0.075]);
      add('box', this.art.gold, [side * 3.1, 2.48, 5], [0.37, 0.48, 0.37]);
      add('box', this.art.glow, [side * 3.1, 2.48, 5.02], [0.26, 0.32, 0.3]);
      add('pyramid', this.art.dark, [side * 3.1, 2.82, 5], [0.38, 0.25, 0.38], [0, Math.PI / 4, 0]);
    }
    for (const [x, z, s] of [[-4.8, -2.4, 0.7], [-4.6, -3.3, 0.85], [-5.4, -2.8, 0.65]]) {
      add('box', this.art.woodLight, [x, s / 2, z], [s, s, s]);
      for (const side of [-1, 1]) {
        add('box', this.art.wood, [x + side * s * 0.42, s / 2, z + s * 0.51], [0.08, s, 0.055]);
        add('box', this.art.wood, [x, s / 2 + side * s * 0.42, z + s * 0.51], [s, 0.08, 0.055]);
      }
    }
    for (let i = 0; i < 5; i++) {
      add('round', this.art.wood, [-5.3 + (i % 3) * 0.3, 0.2 + Math.floor(i / 3) * 0.27, -4.4], [0.14, 1.8, 0.14], [Math.PI / 2, 0, 0]);
      add('round', this.art.woodLight, [-5.3 + (i % 3) * 0.3, 0.2 + Math.floor(i / 3) * 0.27, -3.49], [0.12, 0.04, 0.12], [Math.PI / 2, 0, 0]);
    }
    add('round', this.art.dark, [4.6, 0.45, 1], [0.58, 0.8, 0.58]);
    for (let y = 0.1; y < 0.9; y += 0.2) add('torus', this.art.lightStone, [4.6, y, 1], [0.66, 0.66, 0.66], [Math.PI / 2, 0, 0]);
    for (const x of [3.9, 5.3]) add('box', this.art.wood, [x, 1.1, 1], [0.12, 2.15, 0.12]);
    add('roof', p.roof, [4.6, 2.15, 1], [1.95, 0.6, 1.7]);
    add('round', this.art.woodLight, [4.6, 1.25, 1], [0.18, 0.33, 0.18]);
    add('box', this.art.gold, [4.6, 1.73, 1], [0.025, 0.7, 0.025]);
    this.scene.add(this.art.finish(b));
  }

  _treeInstances(count) {
    const make = (g, color) => {
      const mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color, flatShading: true }), count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return mesh;
    };
    return {
      trunk: make(new THREE.CylinderGeometry(0.12, 0.2, 1, 5), '#6d5940'),
      lower: make(new THREE.ConeGeometry(1, 1, 7), '#315e46'),
      middle: make(new THREE.ConeGeometry(1, 1, 7), '#3b704d'),
      upper: make(new THREE.ConeGeometry(1, 1, 7), '#4d7e53'),
      broad: make(new THREE.IcosahedronGeometry(1, 1), '#4e7845'),
      broadTop: make(new THREE.IcosahedronGeometry(1, 1), '#658649'),
    };
  }

  _putTree(batch, i, x, z, size, variant, rotation = 0) {
    const y = heightAt(x, z);
    const set = (mesh, pos, scale, rot = 0) => {
      tmpObject.position.set(...pos);
      tmpObject.scale.set(...scale);
      tmpObject.rotation.set(0, rot, 0);
      tmpObject.updateMatrix();
      mesh.setMatrixAt(i, tmpObject.matrix);
    };
    set(batch.trunk, [x, y + size * 1.05, z], [size, size * 2.1, size], rotation);
    if (variant < 0.7) {
      set(batch.lower, [x, y + size * 2.1, z], [size * 1.15, size * 2.55, size * 1.15], rotation);
      set(batch.middle, [x, y + size * 2.95, z], [size * 0.98, size * 2.4, size * 0.98], rotation + 0.3);
      set(batch.upper, [x, y + size * 3.85, z], [size * 0.73, size * 2.2, size * 0.73], rotation + 0.7);
      set(batch.broad, [x, y, z], [0, 0, 0]);
      set(batch.broadTop, [x, y, z], [0, 0, 0]);
    } else {
      for (const mesh of [batch.lower, batch.middle, batch.upper]) set(mesh, [x, y, z], [0, 0, 0]);
      set(batch.broad, [x + size * 0.3, y + size * 2.5, z], [size * 1.45, size * 1.3, size * 1.3], rotation);
      set(batch.broadTop, [x - size * 0.45, y + size * 3.2, z - size * 0.2], [size * 1.22, size * 1.2, size * 1.28], rotation + 0.8);
    }
    const tint = 0.9 + variant * 0.15;
    for (const mesh of Object.values(batch)) {
      tmpColor.setRGB(tint, tint, tint);
      mesh.setColorAt(i, tmpColor);
    }
  }

  _forest() {
    const random = randomGenerator(370);
    const entities = this.game.state.entities;
    this.staticTrees = [];
    // Forest boundaries leave the entire central corridor open and retain every
    // simulation-owned tree exactly at its real gatherable position.
    const clusters = [[-48, -35, 10], [-43, -15, 7], [-49, 10, 6], [-40, 47, 6],
      [-20, 49, 7], [0, 48, 6], [20, 43, 8], [45, 30, 9], [49, 6, 7],
      [46, -43, 6], [10, -48, 8], [-12, -43, 9], [-30, -47, 6],
      [-63, -12, 10], [-64, 12, 10], [-63, 36, 10], [-50, 60, 8], [60, -18, 9]];
    for (const [cx, cz, spread] of clusters) {
      for (let j = 0; j < 32; j++) {
        const a = random() * Math.PI * 2, r = Math.sqrt(random()) * spread;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (Math.abs(x) > 82 || Math.abs(z) > 82) continue;
        if (entities.some(e => Math.hypot(e.x - x, e.z - z) < (e.kind === 'tree' ? 2.6 : (e.radius || 1) + 4.5))) continue;
        this.staticTrees.push({ x, z, s: 0.82 + random() * 0.75, v: random(), r: random() * 6.28 });
      }
    }
    const batch = this._treeInstances(this.staticTrees.length);
    this.staticForest = batch;
    this.staticTrees.forEach((t, i) => this._putTree(batch, i, t.x, t.z, t.s, t.v, t.r));
    for (const mesh of Object.values(batch)) mesh.instanceMatrix.needsUpdate = true;
    this.resourceTrees = this._treeInstances(1024);
    for (const mesh of Object.values(this.resourceTrees)) mesh.count = 0;
  }

  _refreshStaticForest() {
    if (!this.staticForest) return;
    let count = 0;
    for (const tree of this.staticTrees) {
      tmpVector.set(tree.x, heightAt(tree.x, tree.z) + tree.s * 2, tree.z).project(this.camera);
      // Include an ample border for tall crowns and offscreen shadow casters.
      if (Math.abs(tmpVector.x) > 1.35 || Math.abs(tmpVector.y) > 1.5) continue;
      this._putTree(this.staticForest, count++, tree.x, tree.z, tree.s, tree.v, tree.r);
    }
    for (const mesh of Object.values(this.staticForest)) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  _details() {
    const random = randomGenerator(208);
    const entities = this.game.state.entities;
    const grassPositions = [], flowerPositions = [], rockBatch = this.art.batch();
    // Crossed sculpted blades: one draw call for all meadow grass, no alpha sorting.
    const grassGeometry = new THREE.BufferGeometry();
    grassGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.19, 0, 0, 0.01, 0.5, 0.03, 0.04, 0, 0,
      0.1, 0, -0.14, -0.02, 0.35, 0.03, 0.06, 0, 0.15,
      -0.04, 0, 0.1, -0.16, 0.29, 0.04, -0.2, 0, -0.04,
    ], 3));
    grassGeometry.computeVertexNormals();
    for (let i = 0; i < 2100; i++) {
      const x = (random() - 0.5) * 106, z = (random() - 0.5) * 106;
      if (entities.some(e => e.kind !== 'tree' && Math.hypot(e.x - x, e.z - z) < (e.radius || 1) + 2.3)) continue;
      // Keep the main road readable.
      if (Math.abs(x + z) < 3.2 && z < 22) continue;
      grassPositions.push({ x, z, s: 0.4 + random() * 0.7, a: random() * 6.28 });
      if (i % 13 === 0) flowerPositions.push({ x, z, s: random() });
      if (i % 38 === 0) {
        const s = 0.22 + random() * 0.65;
        this.art.part(rockBatch, 'rock', this.art.mat(i % 2 ? '#868d78' : '#a0a28a'),
          [x, heightAt(x, z) + s * 0.22, z], [s, s * 0.5, s * 0.7], [0, random() * 6.28, 0]);
      }
    }
    const grass = new THREE.InstancedMesh(grassGeometry, this.art.mat('#7b9550', { side: THREE.DoubleSide }), grassPositions.length);
    grass.receiveShadow = true;
    grassPositions.forEach((p, i) => {
      tmpObject.position.set(p.x, heightAt(p.x, p.z) + 0.02, p.z);
      tmpObject.rotation.set(0, p.a, 0);
      tmpObject.scale.setScalar(p.s);
      tmpObject.updateMatrix();
      grass.setMatrixAt(i, tmpObject.matrix);
      tmpColor.setHSL(0.22 + p.s * 0.025, 0.35, 0.37 + p.s * 0.07);
      grass.setColorAt(i, tmpColor);
    });
    // Wayfinding landmarks: three weathered rock spires stand clear of the
    // main diagonal corridor, bases, and resource lines (decor only).
    for (const [x, z, s, tint] of [[-3, -33, 3.4, '#7d8471'], [-39, -3, 4.1, '#8f937c'], [15, 31, 2.8, '#7d8471']]) {
      if (entities.some(e => e.kind !== 'tree' && Math.hypot(e.x - x, e.z - z) < (e.radius || 1) + 5)) continue;
      this.art.part(rockBatch, 'rock', this.art.mat(tint),
        [x, heightAt(x, z) + s * 0.85, z], [s * 0.75, s * 1.9, s * 0.75], [0.2, 0.7, 0.1]);
      this.art.part(rockBatch, 'rock', this.art.mat('#a0a28a'),
        [x + s * 0.5, heightAt(x + s * 0.5, z + s * 0.4) + s * 0.2, z + s * 0.4], [s * 0.5, s * 0.45, s * 0.55], [0, 1.9, 0]);
    }
    this.scene.add(grass, this.art.finish(rockBatch, new THREE.Group(), false));
    const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 0), this.art.mat('#e8d9a0'), flowerPositions.length);
    flowerPositions.forEach((p, i) => {
      tmpObject.position.set(p.x, heightAt(p.x, p.z) + 0.22, p.z);
      tmpObject.rotation.set(0, p.s * 6.28, 0);
      tmpObject.scale.set(1, 0.5, 1);
      tmpObject.updateMatrix();
      flowers.setMatrixAt(i, tmpObject.matrix);
      flowers.setColorAt(i, new THREE.Color(p.s > 0.5 ? '#e8d18a' : '#a6b8dc'));
    });
    this.scene.add(flowers);
    // A distant ridge adds a landscape silhouette when surveying map edges.
    const ridge = this.art.batch();
    for (let i = 0; i < 14; i++) {
      const x = -65 + i * 11;
      this.art.part(ridge, 'rock', this.art.mat(i % 2 ? '#6a7e78' : '#768780'), [x, -1, -66 - random() * 8],
        [7 + random() * 7, 5 + random() * 9, 6 + random() * 5], [0, random() * 3, 0]);
    }
    this.scene.add(this.art.finish(ridge, new THREE.Group(), false));
  }

  _overlays() {
    const basic = params => new THREE.MeshBasicMaterial({ ...params, toneMapped: false });
    this.rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.92, 1, 56), basic({ color: '#ffffff', side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }), 256);
    this.rings.frustumCulled = false;
    this.rings.count = 0;
    this.scene.add(this.rings);
    this.hpBack = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), basic({ color: '#13272b', depthTest: false }), 256);
    this.hpFill = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), basic({ color: '#ffffff', depthTest: false }), 256);
    for (const mesh of [this.hpBack, this.hpFill]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = 20;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh);
    }
    this.hpFill.renderOrder = 21;
    this.heroAuras = new THREE.InstancedMesh(new THREE.RingGeometry(0.75, 1, 48), basic({ color: '#56b8ff', transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }), 32);
    this.heroAuras.frustumCulled = false;
    this.heroAuras.count = 0;
    this.scene.add(this.heroAuras);
    this.combatFlashes = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.3, 0), basic({ color: '#ffe9af', transparent: true, opacity: 0.9 }), 128);
    this.combatFlashes.frustumCulled = false;
    this.combatFlashes.count = 0;
    this.scene.add(this.combatFlashes);
    const shaft = new THREE.CylinderGeometry(0.025, 0.025, 0.7, 4).toNonIndexed();
    const head = new THREE.ConeGeometry(0.07, 0.18, 4).toNonIndexed();
    head.translate(0, 0.42, 0);
    this.arrows = new THREE.InstancedMesh(mergeGeometries([shaft, head]), basic({ color: '#ffddb0' }), 96);
    shaft.dispose();
    head.dispose();
    this.arrows.frustumCulled = false;
    this.arrows.count = 0;
    this.scene.add(this.arrows);
    this.heroRunes = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.09, 0), basic({ color: '#9bddff', transparent: true, opacity: 0.85 }), 256);
    this.heroRunes.count = 0;
    this.heroRunes.frustumCulled = false;
    this.scene.add(this.heroRunes);
  }

  _particles() {
    const random = randomGenerator(81), positions = [];
    this.particleOrigins = [];
    for (let i = 0; i < 55; i++) {
      const origin = { x: -28 + (random() - 0.5) * 55, z: 23 + (random() - 0.5) * 48, y: 1 + random() * 4, phase: random() * 6.28 };
      this.particleOrigins.push(origin);
      positions.push(origin.x, heightAt(origin.x, origin.z) + origin.y, origin.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.particles = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#e5dca1', size: 0.12, transparent: true, opacity: 0.5, depthWrite: false }));
    this.scene.add(this.particles);
  }

  _scaffold(e) {
    const group = new THREE.Group(), b = this.art.batch();
    const radius = Math.max(2, e.radius || 3);
    const width = radius * 1.2;
    const h = e.kind === 'tower' ? 7 : e.kind === 'farm' ? 3.3 : 5;
    for (const x of [-width, width]) for (const z of [-width, width]) {
      this.art.beam(b, this.art.woodLight, [x, 0, z], [x, h, z], 0.13);
    }
    for (let y = 0.8; y < h; y += 1.35) {
      for (const side of [-1, 1]) {
        this.art.beam(b, this.art.woodLight, [-width, y, side * width], [width, y, side * width], 0.11);
        this.art.beam(b, this.art.woodLight, [side * width, y, -width], [side * width, y, width], 0.11);
        this.art.part(b, 'box', this.art.wood, [side * width, y - 0.09, 0], [0.6, 0.12, width * 2]);
      }
    }
    this.art.beam(b, this.art.woodLight, [-width, 0.2, width], [width, h, width], 0.09);
    this.art.beam(b, this.art.woodLight, [width, 0.2, -width], [width, h, width], 0.09);
    // Ladder with separate rungs.
    for (const x of [width - 0.3, width + 0.3]) this.art.beam(b, this.art.wood, [x, 0.1, width + 0.3], [x, h, width], 0.07);
    for (let y = 0.3; y < h; y += 0.35) this.art.beam(b, this.art.woodLight, [width - 0.3, y, width + 0.3 * (1 - y / h)], [width + 0.3, y, width + 0.3 * (1 - y / h)], 0.055);
    return this.art.finish(b, group);
  }

  _createVisual(e) {
    let model;
    if (UNIT_KINDS.has(e.kind)) model = this.art.unit(e.kind, e.team);
    else if (e.kind === 'goldmine') model = this.art.mine(e.radius);
    else if (BUILDING_KINDS.has(e.kind)) model = this.art.building(e.kind, e.team, e.radius);
    else return null;
    const root = new THREE.Group();
    // Fortress-scale presence for the final objective; selection rings and HP
    // bars keep using entity radius, so readability math is unchanged.
    if (e.kind === 'stronghold') model.scale.multiplyScalar(1.22);
    root.add(model);
    root.userData.entityId = e.id;
    this.scene.add(root);
    const visual = { root, model, kind: e.kind, team: e.team, lastX: e.x, lastZ: e.z, movement: 0, phase: Number(e.id) * 0.93 || 0, banners: [], progressMaterials: null };
    model.traverse(object => { if (object.userData.banner) visual.banners.push(object); });
    if (BUILDING_KINDS.has(e.kind) && (e.buildProgress ?? 1) < 1) {
      visual.scaffold = this._scaffold(e);
      root.add(visual.scaffold);
      visual.progressMaterials = [];
      model.traverse(object => {
        if (!object.isMesh || object.userData.banner) return;
        object.material = object.material.clone();
        object.material.alphaHash = true;
        object.material.opacity = 0.55;
        visual.progressMaterials.push(object.material);
      });
    }
    this.visuals.set(e.id, visual);
    this.renderer.shadowMap.needsUpdate = true;
    return visual;
  }

  _disposeObject(object, sharedMaterials = true) {
    object.traverse(child => {
      if (!child.isMesh) return;
      child.geometry.dispose();
      if (!sharedMaterials || child.userData.banner) child.material.dispose();
    });
    object.removeFromParent();
  }

  _syncTrees(entities) {
    const trees = entities.filter(e => e.kind === 'tree');
    const signature = trees.map(e => `${e.id}:${e.x}:${e.z}`).join('|');
    if (signature === this.treeSignature) return;
    this.treeSignature = signature;
    this.renderer.shadowMap.needsUpdate = true;
    this.treeEntities = trees.slice(0, 1024);
    this.treeEntities.forEach((e, i) => {
      const hash = Math.abs(Math.sin(e.x * 127.1 + e.z * 311.7));
      this._putTree(this.resourceTrees, i, e.x, e.z, 0.85 + hash * 0.42, hash, hash * Math.PI * 2);
    });
    for (const mesh of Object.values(this.resourceTrees)) {
      mesh.count = this.treeEntities.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  update(dt = 0, selectedIds = []) {
    this.time += Math.max(0, dt);
    this.shadowTime += Math.max(0, dt);
    const entities = this.game.state.entities;
    const selected = new Set(selectedIds || []);
    this._syncTrees(entities);
    const liveIds = new Set(entities.map(e => e.id));
    for (const [id, visual] of this.visuals) {
      const entity = entities.find(e => e.id === id);
      if (!liveIds.has(id) || entity.kind !== visual.kind || entity.team !== visual.team) {
        this._disposeObject(visual.root);
        visual.progressMaterials?.forEach(material => material.dispose());
        this.visuals.delete(id);
        this.shadowDirty = true;
      }
    }
    let ringCount = 0, hpCount = 0, auraCount = 0, flashCount = 0, runeCount = 0;
    for (const e of entities) {
      if (e.kind === 'tree') {
        if (selected.has(e.id) && ringCount < 256) this._ring(e, ringCount++, Math.max(1.1, e.radius || 1));
        continue;
      }
      const v = this.visuals.get(e.id) || this._createVisual(e);
      if (!v) continue;
      const h = heightAt(e.x, e.z);
      v.root.position.set(e.x, h, e.z);
      const attackFlash = e.attackFlash || 0;
      if (attackFlash > 0 && (attackFlash > (v.lastAttackFlash || 0) + 0.02 || !v.lastAttackFlash)
        && ['archer', 'tower', 'stronghold'].includes(e.kind)) {
        const target = entities.find(t => t.id === e.order?.targetId) || entities
          .filter(t => t.team !== e.team && t.team !== 'neutral' && Math.hypot(t.x - e.x, t.z - e.z) < 15)
          .sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z))[0];
        if (target && this.projectiles.length < 96) {
          this.projectiles.push({
            from: new THREE.Vector3(e.x, h + (e.kind === 'archer' ? 1.25 : 5), e.z),
            to: new THREE.Vector3(target.x, heightAt(target.x, target.z) + 1.0, target.z),
            age: 0, duration: 0.22 + Math.hypot(target.x - e.x, target.z - e.z) * 0.025,
          });
        }
      }
      v.lastAttackFlash = attackFlash;
      if ((e.spellFlash || 0) > (v.lastSpellFlash || 0) + 0.04) this.ping(e.spellX ?? e.x, e.spellZ ?? e.z, 'spell');
      v.lastSpellFlash = e.spellFlash || 0;
      if (UNIT_KINDS.has(e.kind)) {
        const dx = e.x - v.lastX, dz = e.z - v.lastZ;
        const moved = Math.hypot(dx, dz);
        const moving = moved > 0.002 && moved < 4;
        if (moving || attackFlash > 0) this.shadowDirty = true;
        v.movement = THREE.MathUtils.damp(v.movement, moving ? 1 : 0, 12, dt);
        v.phase += moved * 2.9;
        const desiredFacing = Number.isFinite(e.facing) ? e.facing : moving ? Math.atan2(dx, dz) : v.root.rotation.y;
        const delta = Math.atan2(Math.sin(desiredFacing - v.root.rotation.y), Math.cos(desiredFacing - v.root.rotation.y));
        v.root.rotation.y += delta * Math.min(1, dt * 16 + (dt === 0 ? 1 : 0));
        const { body, limbs, arms } = v.model.userData;
        const step = Math.sin(v.phase);
        body.position.y = Math.abs(Math.cos(v.phase)) * 0.06 * v.movement + Math.sin(this.time * 2.3 + e.x) * 0.012;
        limbs[0].rotation.x = step * 0.65 * v.movement;
        limbs[1].rotation.x = -step * 0.65 * v.movement;
        arms[0].rotation.x = -step * 0.45 * v.movement;
        arms[1].rotation.x = step * 0.45 * v.movement;
        const working = ['gather', 'attack', 'build'].includes(e.order?.type);
        const attack = (e.attackFlash || 0) > 0;
        if (working && !moving) arms[1].rotation.x = -0.4 + Math.sin(this.time * (e.kind === 'worker' ? 5 : 3.5)) * 0.35;
        if (attack) {
          arms[1].rotation.x = -1.1 + Math.sin(this.time * 24) * 0.65;
          body.rotation.y = Math.sin(this.time * 24) * 0.13;
          if (e.kind === 'archer') arms[0].rotation.x = -1.3;
        } else body.rotation.y = THREE.MathUtils.damp(body.rotation.y, 0, 12, dt);
        // A full satchel becomes a clear gold bundle on the worker's back.
        if (e.kind === 'worker' && e.carrying > 0 && !v.bundle) {
          v.bundle = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), this.art.gold);
          v.bundle.position.set(0, 1.15, -0.48);
          body.add(v.bundle);
        }
        if (v.bundle) v.bundle.visible = e.carrying > 0;
        v.lastX = e.x;
        v.lastZ = e.z;
      }
      for (let i = 0; i < v.banners.length; i++) {
        const flag = v.banners[i];
        const attr = flag.geometry.attributes.position;
        for (let n = 0; n < attr.count; n++) {
          const x = attr.getX(n);
          attr.setZ(n, Math.sin(this.time * 2.8 + x * 6 + e.x) * 0.12 * (x + 0.48));
        }
        attr.needsUpdate = true;
      }
      const progress = clamp(e.buildProgress ?? 1, 0, 1);
      if (v.scaffold) {
        this.shadowDirty = true;
        v.model.scale.y = Math.max(0.08, progress);
        for (const material of v.progressMaterials) material.opacity = 0.35 + progress * 0.65;
        if (progress >= 1) {
          this._disposeObject(v.scaffold);
          v.scaffold = null;
          for (const material of v.progressMaterials) {
            material.alphaHash = false;
            material.opacity = 1;
            material.needsUpdate = true;
          }
        }
      }
      if (selected.has(e.id) && ringCount < 256) this._ring(e, ringCount++, Math.max(e.radius || 0.7, 0.8) + 0.25);
      if (e.kind === 'hero' && auraCount < 32) {
        tmpObject.position.set(e.x, h + 0.08, e.z);
        tmpObject.rotation.set(-Math.PI / 2, 0, this.time * 0.3);
        tmpObject.scale.setScalar(1.24 + Math.sin(this.time * 2) * 0.08);
        tmpObject.updateMatrix();
        this.heroAuras.setMatrixAt(auraCount++, tmpObject.matrix);
        for (let i = 0; i < 8 && runeCount < 256; i++) {
          const angle = i / 8 * Math.PI * 2 + this.time * 0.25;
          tmpObject.position.set(e.x + Math.cos(angle) * 1.3, h + 0.20 + Math.sin(this.time * 2 + angle) * 0.06, e.z + Math.sin(angle) * 1.3);
          tmpObject.rotation.set(0, angle, 0);
          tmpObject.scale.set(0.6, 1.4, 0.6);
          tmpObject.updateMatrix();
          this.heroRunes.setMatrixAt(runeCount++, tmpObject.matrix);
        }
      }
      if ((selected.has(e.id) || e.hp < e.maxHp || progress < 1) && hpCount < 256) {
        const barY = h + v.model.userData.height * (v.scaffold ? Math.max(0.25, progress) : 1) + 0.55;
        const width = UNIT_KINDS.has(e.kind) ? 1.65 : 3.3;
        this._hp(e, hpCount++, barY, width, progress);
      }
      if ((e.attackFlash || 0) > 0 && UNIT_KINDS.has(e.kind) && flashCount < 128) {
        const facing = v.root.rotation.y;
        tmpObject.position.set(e.x + Math.sin(facing) * 0.95, h + 1.2, e.z + Math.cos(facing) * 0.95);
        tmpObject.rotation.set(this.time * 8, this.time * 12, 0.3);
        tmpObject.scale.setScalar(0.5 + Math.abs(Math.sin(this.time * 28)) * 0.6);
        tmpObject.updateMatrix();
        this.combatFlashes.setMatrixAt(flashCount++, tmpObject.matrix);
      }
    }
    let arrowCount = 0;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const arrow = this.projectiles[i];
      arrow.age += dt;
      if (arrow.age >= arrow.duration) { this.projectiles.splice(i, 1); continue; }
      const t = arrow.age / arrow.duration;
      tmpObject.position.copy(arrow.from).lerp(arrow.to, t);
      tmpObject.position.y += Math.sin(t * Math.PI) * 0.6;
      tmpVector.copy(arrow.to).sub(arrow.from);
      tmpVector.y += Math.cos(t * Math.PI) * 0.6 * Math.PI;
      tmpObject.quaternion.setFromUnitVectors(UP, tmpVector.normalize());
      tmpObject.scale.setScalar(1);
      tmpObject.updateMatrix();
      this.arrows.setMatrixAt(arrowCount++, tmpObject.matrix);
    }
    for (const [mesh, count] of [[this.rings, ringCount], [this.hpBack, hpCount], [this.hpFill, hpCount], [this.heroAuras, auraCount], [this.heroRunes, runeCount], [this.combatFlashes, flashCount], [this.arrows, arrowCount]]) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const ping = this.pings[i];
      ping.age += dt;
      ping.mesh.scale.setScalar(0.7 + ping.age * (ping.spell ? 11 : 2.8));
      ping.mesh.material.opacity = Math.max(0, 1 - ping.age / (ping.spell ? 0.8 : 0.9));
      if (ping.age >= (ping.spell ? 0.8 : 0.9)) {
        this._disposeObject(ping.mesh, false);
        this.pings.splice(i, 1);
      }
    }
    const particlePositions = this.particles.geometry.attributes.position;
    this.particleOrigins.forEach((p, i) => {
      particlePositions.setXYZ(i, p.x + Math.sin(this.time * 0.3 + p.phase),
        heightAt(p.x, p.z) + p.y + Math.sin(this.time * 0.5 + p.phase) * 0.4,
        p.z + Math.cos(this.time * 0.22 + p.phase) * 0.8);
    });
    particlePositions.needsUpdate = true;
    if (this.shadowDirty && this.shadowTime >= 0.18) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowDirty = false;
      this.shadowTime = 0;
    }
    this.renderer.render(this.scene, this.camera);
  }

  _ring(e, index, radius) {
    tmpObject.position.set(e.x, heightAt(e.x, e.z) + 0.10, e.z);
    tmpObject.rotation.set(-Math.PI / 2, 0, 0);
    tmpObject.scale.setScalar(radius);
    tmpObject.updateMatrix();
    this.rings.setMatrixAt(index, tmpObject.matrix);
    this.rings.setColorAt(index, tmpColor.set(e.team === 'enemy' ? '#ff7868' : e.team === 'neutral' ? '#f3d777' : '#8df4b2'));
  }

  _hp(e, i, y, width, progress) {
    tmpObject.position.set(e.x, y, e.z);
    tmpObject.quaternion.copy(this.camera.quaternion);
    tmpObject.scale.set(width, 0.18, 1);
    tmpObject.updateMatrix();
    this.hpBack.setMatrixAt(i, tmpObject.matrix);
    const ratio = clamp(progress < 1 ? progress : e.hp / Math.max(1, e.maxHp), 0.001, 1);
    tmpVector.set((ratio - 1) * (width - 0.08) / 2, 0, 0.012).applyQuaternion(this.camera.quaternion);
    tmpObject.position.add(tmpVector);
    tmpObject.scale.set((width - 0.08) * ratio, 0.105, 1);
    tmpObject.updateMatrix();
    this.hpFill.setMatrixAt(i, tmpObject.matrix);
    this.hpFill.setColorAt(i, tmpColor.set(progress < 1 ? '#eac368' : e.team === 'enemy' ? '#eb6860' : ratio < 0.3 ? '#e79a5a' : '#87d785'));
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, rect.width || window.innerWidth);
    const height = Math.max(1, rect.height || window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.aspect = width / height;
    this._camera();
  }

  _camera() {
    this.camera.left = -this.viewSize * this.aspect / 2;
    this.camera.right = this.viewSize * this.aspect / 2;
    this.camera.top = this.viewSize / 2;
    this.camera.bottom = -this.viewSize / 2;
    this.camera.position.set(this.center.x + 42, 58, this.center.z + 42);
    this.camera.lookAt(this.center.x, 0, this.center.z);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this._refreshStaticForest();
    // Follow the camera with a stable-sized shadow frustum instead of spending
    // the 1024 map on an entire battlefield that is mostly off screen.
    this.sun.position.set(this.center.x - 35, 65, this.center.z + 25);
    this.sun.target.position.set(this.center.x, 0, this.center.z);
    this.sun.target.updateMatrixWorld();
    this.renderer.shadowMap.needsUpdate = true;
  }

  pan(dx, dz) {
    this.focus(this.center.x + dx, this.center.z + dz);
  }

  focus(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this.center.x = clamp(x, -HALF + 5, HALF - 5);
    this.center.z = clamp(z, -HALF + 5, HALF - 5);
    this._camera();
  }

  zoom(delta) {
    if (!Number.isFinite(delta)) return;
    this.viewSize = clamp(this.viewSize * Math.exp(clamp(delta, -1000, 1000) * 0.001), 25, 84);
    this._camera();
  }

  _screenRay(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return false;
    this.pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return true;
  }

  screenToGround(clientX, clientY) {
    if (!this._screenRay(clientX, clientY)) return null;
    const hit = this.raycaster.intersectObject(this.ground, false)[0];
    return hit ? { x: hit.point.x, z: hit.point.z } : null;
  }

  pick(clientX, clientY) {
    if (!this._screenRay(clientX, clientY)) return null;
    const roots = [...this.visuals.values()].map(v => v.root);
    const hits = this.raycaster.intersectObjects([...roots, ...Object.values(this.resourceTrees)], true);
    for (const hit of hits) {
      if (hit.instanceId !== undefined) {
        const entity = this.treeEntities?.[hit.instanceId];
        if (entity) return entity.id;
      }
      let object = hit.object;
      while (object) {
        if (object.userData.entityId !== undefined) return object.userData.entityId;
        object = object.parent;
      }
    }
    // A few pixels of tolerance make small infantry easy to command at far zoom.
    let nearest = null, distance = Infinity;
    for (const e of this.game.state.entities) {
      if (!UNIT_KINDS.has(e.kind)) continue;
      const p = this.project(e.x, e.z);
      const d = Math.hypot(p.x - clientX, p.y - clientY);
      if (d < 13 && d < distance) { nearest = e.id; distance = d; }
    }
    return nearest;
  }

  project(x, z) {
    const rect = this.canvas.getBoundingClientRect();
    tmpVector.set(x, heightAt(x, z), z).project(this.camera);
    return { x: rect.left + (tmpVector.x + 1) * rect.width / 2, y: rect.top + (1 - tmpVector.y) * rect.height / 2 };
  }

  setBuildPreview(kind, point, valid = true) {
    if (!kind || !point || !BUILDING_KINDS.has(kind)) {
      if (this.preview) {
        this._disposeObject(this.preview.model, false);
        this._disposeObject(this.preview.ring, false);
        this.preview = null;
      }
      return;
    }
    if (this.preview?.kind !== kind) {
      this.setBuildPreview(null);
      const model = this.art.building(kind, 'player');
      model.traverse(object => {
        if (!object.isMesh) return;
        object.material = new THREE.MeshBasicMaterial({ color: '#92e4c7', transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
        object.castShadow = false;
        object.receiveShadow = false;
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 56), new THREE.MeshBasicMaterial({ color: '#83e6a9', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(kind === 'farm' ? 2.8 : kind === 'tower' ? 2 : 4.1);
      this.scene.add(model, ring);
      this.preview = { kind, model, ring };
    }
    const color = valid ? '#81edbe' : '#f07565';
    this.preview.model.position.set(point.x, heightAt(point.x, point.z), point.z);
    this.preview.model.traverse(object => { if (object.isMesh) object.material.color.set(color); });
    this.preview.ring.position.set(point.x, heightAt(point.x, point.z) + 0.12, point.z);
    this.preview.ring.material.color.set(color);
  }

  ping(x, z, type = 'move') {
    const spell = type === 'spell';
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48), new THREE.MeshBasicMaterial({
      color: spell ? '#ffe098' : type.toLowerCase().includes('attack') ? '#ff8470' : '#b3ecd0', transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, heightAt(x, z) + 0.14, z);
    this.scene.add(mesh);
    this.pings.push({ mesh, age: 0, spell });
    if (this.pings.length > 12) {
      const old = this.pings.shift();
      this._disposeObject(old.mesh, false);
    }
  }

  dispose() {
    this.scene.traverse(object => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    this.art.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    this.visuals.clear();
  }
}
