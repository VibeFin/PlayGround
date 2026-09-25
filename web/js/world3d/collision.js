// 2D collision on the ground plane: circles and oriented boxes. Rooms are single-floor, so this
// is enough for movement, and it is fast and predictable (no physics engine needed).
import * as THREE from "three";

export class CollisionWorld {
  constructor() { this.items = []; }

  clear() { this.items.length = 0; }

  circle(x, z, r, opts = {}) {
    const c = { type: "c", x, z, r, h: opts.h ?? 3, cam: opts.cam ?? false, tag: opts.tag || "" };
    this.items.push(c);
    return c;
  }

  // (x, z) is the centre; w/d are full extents before rotation; rot is a Three.js Y rotation.
  box(x, z, w, d, rot = 0, opts = {}) {
    const b = { type: "b", x, z, hw: w / 2, hd: d / 2, rot, c: Math.cos(rot), s: Math.sin(rot),
      h: opts.h ?? 3, cam: opts.cam ?? false, tag: opts.tag || "" };
    this.items.push(b);
    return b;
  }

  remove(item) {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
  }

  // Push a circle of radius r at p = {x, z} out of every collider; returns true if anything was hit.
  resolve(p, r, ignore = null) {
    let hit = false;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const it of this.items) {
        if (it === ignore || it.off) continue;
        if (it.type === "c") {
          const dx = p.x - it.x, dz = p.z - it.z, rr = r + it.r;
          const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr) continue;
          const d = Math.sqrt(d2) || 1e-4;
          const push = rr - d;
          p.x += (dx / d) * push; p.z += (dz / d) * push;
          moved = hit = true;
        } else {
          const dx = p.x - it.x, dz = p.z - it.z;
          const lx = it.c * dx - it.s * dz, lz = it.s * dx + it.c * dz;
          if (Math.abs(lx) > it.hw + r || Math.abs(lz) > it.hd + r) continue;
          const cx = Math.max(-it.hw, Math.min(it.hw, lx)), cz = Math.max(-it.hd, Math.min(it.hd, lz));
          let ox = lx - cx, oz = lz - cz;
          let d = Math.hypot(ox, oz), push;
          if (d > 1e-5) {
            if (d >= r) continue;
            push = r - d; ox /= d; oz /= d;
          } else {
            // Centre is inside the box: leave along the shallowest axis.
            const px = it.hw - Math.abs(lx), pz = it.hd - Math.abs(lz);
            if (px < pz) { ox = Math.sign(lx) || 1; oz = 0; push = px + r; } else { ox = 0; oz = Math.sign(lz) || 1; push = pz + r; }
          }
          const wx = it.c * ox + it.s * oz, wz = -it.s * ox + it.c * oz;
          p.x += wx * push; p.z += wz * push;
          moved = hit = true;
        }
      }
      if (!moved) break;
    }
    return hit;
  }

  blocked(x, z, r) {
    const p = { x, z };
    return this.resolve(p, r) && Math.hypot(p.x - x, p.z - z) > 0.01;
  }

  // Fraction [0..1] along a->b (3D points) before the first camera-blocking collider.
  raycast(a, b, pad = 0.3) {
    let best = 1;
    const dx = b.x - a.x, dz = b.z - a.z;
    for (const it of this.items) {
      if (!it.cam || it.off) continue;
      let t;
      if (it.type === "c") {
        const fx = a.x - it.x, fz = a.z - it.z, R = it.r + pad;
        const A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - R * R;
        if (C < 0) continue; // camera target inside (e.g. hugging a pillar): ignore rather than snap
        const disc = B * B - 4 * A * C;
        if (disc < 0 || A < 1e-8) continue;
        t = (-B - Math.sqrt(disc)) / (2 * A);
      } else {
        const ax = a.x - it.x, az = a.z - it.z;
        const lx = it.c * ax - it.s * az, lz = it.s * ax + it.c * az;
        const ldx = it.c * dx - it.s * dz, ldz = it.s * dx + it.c * dz;
        const hw = it.hw + pad, hd = it.hd + pad;
        if (Math.abs(lx) < hw && Math.abs(lz) < hd) continue;
        let t0 = 0, t1 = 1;
        const slab = (o, d, h) => {
          if (Math.abs(d) < 1e-8) return Math.abs(o) <= h;
          let n = (-h - o) / d, f = (h - o) / d;
          if (n > f) [n, f] = [f, n];
          t0 = Math.max(t0, n); t1 = Math.min(t1, f);
          return t0 <= t1;
        };
        if (!slab(lx, ldx, hw) || !slab(lz, ldz, hd)) continue;
        t = t0;
      }
      if (t >= 0 && t < best) {
        const y = a.y + (b.y - a.y) * t;
        if (y < it.h + pad) best = t;
      }
    }
    return best;
  }

  debugMesh() {
    const pts = [];
    const push = (x1, z1, x2, z2, y) => { pts.push(x1, y, z1, x2, y, z2); };
    for (const it of this.items) {
      for (const y of [0.05, Math.min(it.h, 4)]) {
        if (it.type === "c") {
          const n = 16;
          for (let i = 0; i < n; i++) {
            const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
            push(it.x + Math.cos(a0) * it.r, it.z + Math.sin(a0) * it.r, it.x + Math.cos(a1) * it.r, it.z + Math.sin(a1) * it.r, y);
          }
        } else {
          const corners = [[-it.hw, -it.hd], [it.hw, -it.hd], [it.hw, it.hd], [-it.hw, it.hd]].map(([lx, lz]) =>
            [it.x + it.c * lx + it.s * lz, it.z - it.s * lx + it.c * lz]);
          for (let i = 0; i < 4; i++) { const p = corners[i], q = corners[(i + 1) % 4]; push(p[0], p[1], q[0], q[1], y); }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xff3366, depthTest: false, transparent: true, opacity: 0.8 }));
    m.renderOrder = 999;
    return m;
  }
}
