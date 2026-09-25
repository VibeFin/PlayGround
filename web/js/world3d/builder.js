// Accumulates static geometry for a room and merges it per material at the end, so a room with
// hundreds of props renders in a few dozen draw calls. Animated parts stay separate ("dynamic").
import * as THREE from "three";
import { mergeGeometries } from "three/addons/BufferGeometryUtils.js";
import { mat } from "./materials.js";

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

export function boxGeo(w, h, d, texel = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (texel) {
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / texel, (uv.getY(k) * dims[f][1]) / texel);
    }
  }
  return g;
}

export function cylGeo(rt, rb, h, seg = 12, texel = 2, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  if (texel) {
    const uv = g.attributes.uv, circ = Math.PI * 2 * Math.max(rt, rb);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circ) / texel, (uv.getY(i) * h) / texel);
  }
  return g;
}

export class Builder {
  constructor({ col, quality = "medium" }) {
    this.col = col;
    this.quality = quality;
    this.parts = new Map();
    this.inst = new Map();
    this.group = new THREE.Group();
    this.dynamic = new THREE.Group();
    this.group.add(this.dynamic);
    this.lights = [];
    this.emitters = [];
    this.tickers = [];
    this.xf = new THREE.Matrix4();
    this.rot = 0;
    this.scale = 1;
    this.ox = 0; this.oz = 0; this.oy = 0;
  }

  begin(x = 0, z = 0, rotDeg = 0, scale = 1, y = 0) {
    this.rot = (rotDeg * Math.PI) / 180;
    this.scale = scale;
    this.ox = x; this.oz = z; this.oy = y;
    this.xf.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, this.rot, 0)), _s.set(scale, scale, scale));
    return this;
  }

  // Local prefab coordinates -> world.
  world(x, z, y = 0) {
    const c = Math.cos(this.rot), s = Math.sin(this.rot), k = this.scale;
    return { x: this.ox + (c * x + s * z) * k, z: this.oz + (-s * x + c * z) * k, y: this.oy + y * k };
  }

  add(geo, matName, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    geo.applyMatrix4(_m.premultiply(this.xf));
    if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    let list = this.parts.get(matName);
    if (!list) this.parts.set(matName, (list = []));
    list.push(geo);
    return geo;
  }

  box(m, w, h, d, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, texel = 2) { return this.add(boxGeo(w, h, d, texel), m, x, y, z, rx, ry, rz); }
  cyl(m, rt, rb, h, x = 0, y = 0, z = 0, seg = 12, rx = 0, rz = 0, ry = 0) { return this.add(cylGeo(rt, rb, h, seg), m, x, y, z, rx, ry, rz); }
  sphere(m, r, x = 0, y = 0, z = 0, seg = 10, sy = 1) { return this.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)), m, x, y, z, 0, 0, 0, 1, sy, 1); }
  cone(m, r, h, x = 0, y = 0, z = 0, seg = 10, rx = 0, rz = 0, ry = 0) { return this.add(new THREE.ConeGeometry(r, h, seg), m, x, y, z, rx, ry, rz); }
  torus(m, R, r, x = 0, y = 0, z = 0, rx = Math.PI / 2, seg = 24, ry = 0) { return this.add(new THREE.TorusGeometry(R, r, 6, seg), m, x, y, z, rx, ry, 0); }
  rock(m, r, x = 0, y = 0, z = 0, seed = 0) {
    const g = new THREE.DodecahedronGeometry(r, 0);
    const a = seed * 2.39996;
    return this.add(g, m, x, y, z, a, a * 1.7, a * 0.6, 1 + 0.3 * Math.sin(a), 0.6 + 0.3 * Math.cos(a * 1.3), 1);
  }

  // Instanced parts for small repeated elements (bars, links, rubble).
  instance(key, makeGeo, m, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    let e = this.inst.get(key + "|" + m);
    if (!e) this.inst.set(key + "|" + m, (e = { geo: makeGeo(), mat: m, list: [] }));
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    e.list.push(_m.clone().premultiply(this.xf));
  }

  colBox(w, d, x = 0, z = 0, ry = 0, opts = {}) {
    const p = this.world(x, z);
    return this.col.box(p.x, p.z, w * this.scale, d * this.scale, this.rot + ry, { ...opts, h: (opts.h ?? 3) * this.scale });
  }

  colCircle(r, x = 0, z = 0, opts = {}) {
    const p = this.world(x, z);
    return this.col.circle(p.x, p.z, r * this.scale, { ...opts, h: (opts.h ?? 3) * this.scale });
  }

  light(color, intensity, distance, x = 0, y = 2, z = 0, opts = {}) {
    const p = this.world(x, z, y);
    const l = { color, intensity, distance: distance * this.scale, x: p.x, y: p.y, z: p.z, flicker: opts.flicker || 0, shadow: !!opts.shadow, prio: opts.prio ?? intensity };
    this.lights.push(l);
    return l;
  }

  emit(type, x, y, z, area = [2, 2, 2], count = null) {
    const p = this.world(x, z, y);
    const k = this.scale;
    this.emitters.push({ type, x: p.x, y: p.y, z: p.z, area: [area[0] * k, area[1] * k, area[2] * k], count });
  }

  // A non-merged object placed in prefab space (for animation or per-object state).
  dyn(obj, x = 0, y = 0, z = 0, ry = 0) {
    const p = this.world(x, z, y);
    obj.position.set(p.x, p.y, p.z);
    obj.rotation.y += this.rot + ry;
    obj.scale.multiplyScalar(this.scale);
    this.dynamic.add(obj);
    return obj;
  }

  tick(fn) { this.tickers.push(fn); }

  build({ shadows = false } = {}) {
    for (const [m, list] of this.parts) {
      const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
      for (const x of list) if (x !== g) x.dispose();
      if (!g) continue;
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat(m));
      mesh.receiveShadow = true;
      mesh.castShadow = shadows && !mat(m).transparent;
      mesh.matrixAutoUpdate = false;
      mesh.name = "static:" + m;
      this.group.add(mesh);
    }
    for (const e of this.inst.values()) {
      const im = new THREE.InstancedMesh(e.geo, mat(e.mat), e.list.length);
      e.list.forEach((mx, i) => im.setMatrixAt(i, mx));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = shadows;
      im.receiveShadow = true;
      im.name = "inst:" + e.mat;
      this.group.add(im);
    }
    this.parts.clear();
    this.inst.clear();
    return this.group;
  }
}
