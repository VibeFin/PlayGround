/**
 * fx/particles.js — pooled GPU point sprites + skid-mark ribbons.
 *
 * Original IP. Standalone: imports `three` only (no repo-local imports).
 *
 * Design goals:
 *  - ZERO allocations per frame: all buffers preallocated, ring-buffer
 *    spawn cursor, module-scope scratch vectors, no `new` in update().
 *  - One THREE.Points draw call per effect (drift smoke, boost flames,
 *    confetti) + one draw call for both skid strips.
 *  - Per-particle size / alpha / color via custom shader attributes.
 *
 * Integration (main.js):
 * @example
 * import { ParticleSystem } from './fx/particles.js';
 * const fx = new ParticleSystem({ parent: scene });
 * // per frame:
 * if (drifting) fx.driftTick(wheelPos, kartVel, intensity, dt);
 * if (boosting) fx.boostTick(exhaustPos, forward, strength, dt);
 * if (drifting) fx.pushSkid(leftWheelPos, rightWheelPos, intensity);
 * else fx.endSlide();
 * fx.update(dt);
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// tiny helpers (inlined so this file stays standalone)
// ---------------------------------------------------------------------------

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Deterministic PRNG (mulberry32) — visual variety without Math.random GC. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Module-scope scratch vectors — shared by every pool, never reallocated.
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();

// ---------------------------------------------------------------------------
// sprite texture (generated once per pool, reused forever)
// ---------------------------------------------------------------------------

function makeSoftSprite(size = 64, hardness = 0.35) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(
    size / 2, size / 2, size * 0.04,
    size / 2, size / 2, size * 0.5
  );
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(hardness, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const POINTS_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (240.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const POINTS_FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  float a = tex.a * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * tex.rgb, a);
}
`;

// ---------------------------------------------------------------------------
// PooledPoints — fixed-capacity THREE.Points pool, ring-buffer spawning
// ---------------------------------------------------------------------------

export class PooledPoints {
  /**
   * @param {object} opts
   * @param {number} [opts.capacity=256]
   * @param {THREE.Blending} [opts.blending=THREE.NormalBlending]
   * @param {number} [opts.gravity=0]   world-space Y accel (negative = falls)
   * @param {number} [opts.drag=1.0]     velocity retention per second (exp)
   * @param {number} [opts.spriteHardness=0.35]
   * @param {boolean} [opts.depthWrite=false]
   */
  constructor(opts = {}) {
    const {
      capacity = 256,
      blending = THREE.NormalBlending,
      gravity = 0,
      drag = 1.0,
      spriteHardness = 0.35,
      depthWrite = false,
    } = opts;

    this.capacity = capacity;
    this.gravity = gravity;
    this.drag = drag;
    this.cursor = 0;
    this.alive = 0;
    this.rand = mulberry32(capacity * 7919 + 13);

    // Simulation state (preallocated, reused forever).
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity); // remaining seconds (<=0 = dead)
    this.maxLife = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity); // spawn size (world units)
    this.grow = new Float32Array(capacity); // size delta per second
    this.baseAlpha = new Float32Array(capacity);
    this.seed = new Float32Array(capacity); // per-particle random phase

    // Render attributes (views into the same memory where possible).
    this.aColor = new Float32Array(capacity * 3);
    this.aSize = new Float32Array(capacity);
    this.aAlpha = new Float32Array(capacity);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.aColor, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.aAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    // Tight bounding sphere so frustum culling never kills the pool.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10000);
    this.geometry = geo;

    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: makeSoftSprite(64, spriteHardness) } },
      vertexShader: POINTS_VERT,
      fragmentShader: POINTS_FRAG,
      transparent: true,
      depthWrite,
      blending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  /** Spawn one particle. All params are plain numbers — no allocation. */
  spawn(px, py, pz, vx, vy, vz, life, size0, grow, r, g, b, alpha) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const i3 = i * 3;
    this.pos[i3] = px; this.pos[i3 + 1] = py; this.pos[i3 + 2] = pz;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life > 0 ? life : 1;
    this.size0[i] = size0;
    this.grow[i] = grow;
    this.baseAlpha[i] = alpha;
    this.seed[i] = this.rand() * Math.PI * 2;
    this.aColor[i3] = r; this.aColor[i3 + 1] = g; this.aColor[i3 + 2] = b;
    if (this.alive < this.capacity) this.alive++;
  }

  /** Advance simulation. Zero allocations. */
  update(dt) {
    if (this.alive === 0) return;
    const dragK = this.drag >= 1 ? 1 : Math.exp(-(1 - this.drag) * 8 * dt);
    const grav = this.gravity * dt;
    let alive = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) {
        if (this.aAlpha[i] !== 0) this.aAlpha[i] = 0;
        continue;
      }
      alive++;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.aAlpha[i] = 0;
        this.aSize[i] = 0;
        continue;
      }
      this.vel[i3] *= dragK;
      this.vel[i3 + 1] = this.vel[i3 + 1] * dragK + grav;
      this.vel[i3 + 2] *= dragK;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = 1 - this.life[i] / this.maxLife[i]; // 0 spawn → 1 death
      const fadeIn = t < 0.15 ? t / 0.15 : 1;
      this.aAlpha[i] = this.baseAlpha[i] * fadeIn * (1 - t * t);
      this.aSize[i] = this.size0[i] + this.grow[i] * t;
    }
    this.alive = alive;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }

  reset() {
    this.life.fill(0);
    this.aAlpha.fill(0);
    this.aSize.fill(0);
    this.alive = 0;
    this.geometry.attributes.aAlpha.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.uniforms.uMap.value.dispose();
    this.material.dispose();
  }
}

// ---------------------------------------------------------------------------
// SkidMarks — fading dual ribbon trail (left + right wheels), one draw call
// ---------------------------------------------------------------------------

const SKID_VERT = /* glsl */ `
attribute float aAlpha;
varying float vAlpha;
void main() {
  vAlpha = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKID_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  if (vAlpha < 0.004) discard;
  gl_FragColor = vec4(uColor, vAlpha);
}
`;

export class SkidMarks {
  /**
   * @param {object} opts
   * @param {number} [opts.maxSamples=220] samples kept per wheel strip
   * @param {number} [opts.width=0.16] ribbon half-width in world units
   * @param {number} [opts.fadeTime=2.2] seconds until a mark fully fades
   * @param {number} [opts.maxAlpha=0.55]
   * @param {number} [opts.yLift=0.03] height above ground to avoid z-fighting
   */
  constructor(opts = {}) {
    const {
      maxSamples = 220,
      width = 0.16,
      fadeTime = 2.2,
      maxAlpha = 0.55,
      yLift = 0.03,
    } = opts;
    this.maxSamples = maxSamples;
    this.width = width;
    this.fadeTime = fadeTime;
    this.maxAlpha = maxAlpha;
    this.yLift = yLift;

    // Two strips (0 = left, 1 = right). Each sample = center + sideways dir.
    this.center = [new Float32Array(maxSamples * 3), new Float32Array(maxSamples * 3)];
    this.side = [new Float32Array(maxSamples * 3), new Float32Array(maxSamples * 3)];
    this.age = [new Float32Array(maxSamples), new Float32Array(maxSamples)];
    this.head = [0, 0];
    this.count = [0, 0];
    this.sliding = false;
    this.minDistSq = 0.04; // min squared spacing between samples (0.2m)

    const vertsPerStrip = maxSamples * 2;
    const totalVerts = vertsPerStrip * 2;
    this.positions = new Float32Array(totalVerts * 3);
    this.alphas = new Float32Array(totalVerts);

    const idx = new Uint32Array(maxSamples * 2 * 6);
    let k = 0;
    for (let s = 0; s < 2; s++) {
      const base = s * vertsPerStrip;
      for (let i = 0; i < maxSamples - 1; i++) {
        const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx[k++] = a; idx[k++] = b; idx[k++] = c;
        idx[k++] = b; idx[k++] = d; idx[k++] = c;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10000);
    this.geometry = geo;

    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x14151a) } },
      vertexShader: SKID_VERT,
      fragmentShader: SKID_FRAG,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  beginSlide() {
    this.sliding = true;
  }

  endSlide() {
    this.sliding = false;
  }

  /**
   * Push one sample per wheel. Call every frame while drifting & grounded.
   * Positions are THREE.Vector3-like ({x,y,z}); sideways is the kart's
   * lateral axis (THREE.Vector3-like). No allocation.
   */
  pushSkid(leftPos, rightPos, sideways, strength = 1) {
    if (!this.sliding) return;
    this._pushOne(0, leftPos, sideways, strength);
    this._pushOne(1, rightPos, sideways, strength);
  }

  _pushOne(strip, p, sideways, strength) {
    const n = this.count[strip];
    const head = this.head[strip];
    if (n > 0) {
      const prev = (head + this.maxSamples - 1) % this.maxSamples;
      const dx = p.x - this.center[strip][prev * 3];
      const dy = p.y - this.center[strip][prev * 3 + 1];
      const dz = p.z - this.center[strip][prev * 3 + 2];
      if (dx * dx + dy * dy + dz * dz < this.minDistSq) return;
    }
    const i3 = head * 3;
    this.center[strip][i3] = p.x;
    this.center[strip][i3 + 1] = p.y + this.yLift;
    this.center[strip][i3 + 2] = p.z;
    // Normalize sideways once into the stored dir.
    _v0.set(sideways.x, 0, sideways.z);
    if (_v0.lengthSq() < 1e-6) _v0.set(1, 0, 0);
    _v0.normalize().multiplyScalar(this.width);
    this.side[strip][i3] = _v0.x;
    this.side[strip][i3 + 1] = 0;
    this.side[strip][i3 + 2] = _v0.z;
    this.age[strip][head] = -strength; // negative = fresh, magnitude = alpha scale
    this.head[strip] = (head + 1) % this.maxSamples;
    if (this.count[strip] < this.maxSamples) this.count[strip]++;
  }

  /** Age marks and rebuild ribbon vertices. Zero allocations. */
  update(dt) {
    let any = false;
    for (let s = 0; s < 2; s++) if (this.count[s] > 0) { any = true; break; }
    if (!any) {
      if (this.alphas[0] !== 0 || this.alphas[1] !== 0) {
        this.alphas.fill(0);
        this.geometry.attributes.aAlpha.needsUpdate = true;
      }
      return;
    }
    const vertsPerStrip = this.maxSamples * 2;
    for (let s = 0; s < 2; s++) {
      const n = this.count[s];
      const head = this.head[s];
      // Oldest sample first so the strip runs oldest → newest.
      const start = (head - n + this.maxSamples) % this.maxSamples;
      for (let j = 0; j < this.maxSamples; j++) {
        const vBase = (s * vertsPerStrip + j * 2);
        if (j < n) {
          const si = (start + j) % this.maxSamples;
          let a = this.age[s][si];
          if (a < 0) a = -a; // first frame after spawn
          a += dt;
          this.age[s][si] = a;
          const fade = clamp01(1 - a / this.fadeTime);
          const alpha = fade * fade * this.maxAlpha;
          const c3 = si * 3;
          const cx = this.center[s][c3], cy = this.center[s][c3 + 1], cz = this.center[s][c3 + 2];
          const sx = this.side[s][c3], sz = this.side[s][c3 + 2];
          const p3 = vBase * 3;
          this.positions[p3] = cx - sx; this.positions[p3 + 1] = cy; this.positions[p3 + 2] = cz - sz;
          this.positions[p3 + 3] = cx + sx; this.positions[p3 + 4] = cy; this.positions[p3 + 5] = cz + sz;
          // Taper the two newest verts so the ribbon tip has no hard quad edge.
          const tip = j === n - 1 ? 0.35 : 1;
          this.alphas[vBase] = alpha * tip;
          this.alphas[vBase + 1] = alpha * tip;
        } else {
          this.alphas[vBase] = 0;
          this.alphas[vBase + 1] = 0;
        }
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }

  reset() {
    this.count[0] = 0; this.count[1] = 0;
    this.head[0] = 0; this.head[1] = 0;
    this.sliding = false;
    this.alphas.fill(0);
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ---------------------------------------------------------------------------
// ParticleSystem — one facade for main.js
// ---------------------------------------------------------------------------

const CONFETTI_PALETTE = [
  [1, 0.25, 0.35], [1, 0.8, 0.2], [0.3, 0.85, 1],
  [0.45, 1, 0.5], [0.75, 0.45, 1], [1, 1, 1], [1, 0.5, 0.15],
];

export class ParticleSystem {
  /**
   * @param {object} opts
   * @param {THREE.Object3D} opts.parent scene (or group) to attach to
   */
  constructor(opts = {}) {
    const { parent = null } = opts;
    this.smoke = new PooledPoints({
      capacity: 384, blending: THREE.NormalBlending,
      gravity: 1.2, drag: 0.55, spriteHardness: 0.22,
    });
    this.flames = new PooledPoints({
      capacity: 256, blending: THREE.AdditiveBlending,
      gravity: 0.5, drag: 0.8, spriteHardness: 0.45,
    });
    this.confetti = new PooledPoints({
      capacity: 512, blending: THREE.NormalBlending,
      gravity: -9.5, drag: 0.985, spriteHardness: 0.8,
    });
    this.skids = new SkidMarks();

    this.smokeAcc = 0;
    this.flameAcc = 0;

    if (parent) this.addToScene(parent);
  }

  addToScene(parent) {
    parent.add(this.smoke.points);
    parent.add(this.flames.points);
    parent.add(this.confetti.points);
    parent.add(this.skids.mesh);
  }

  /**
   * Drift smoke puffs behind a wheel. Rate-limited internally so main.js
   * can call it every frame while drifting. No allocation.
   */
  driftTick(wx, wy, wz, vx, vy, vz, intensity, dt) {
    this.smokeAcc += dt * (30 + 90 * clamp01(intensity));
    const r = this.smoke.rand;
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1;
      const jx = (r() - 0.5) * 0.5, jz = (r() - 0.5) * 0.5;
      const shade = 0.75 + r() * 0.2;
      // Mini-turbo sparks tint the smoke blue/orange at high charge.
      let sr = shade, sg = shade, sb = shade;
      if (intensity > 0.66) { sr = 0.5; sg = 0.75; sb = 1; }
      else if (intensity > 0.33) { sr = 1; sg = 0.75; sb = 0.4; }
      this.smoke.spawn(
        wx + jx, wy + 0.15 * r(), wz + jz,
        vx * 0.25 + (r() - 0.5) * 2.2,
        1.2 + r() * 1.8,
        vz * 0.25 + (r() - 0.5) * 2.2,
        0.55 + r() * 0.45,
        0.9 + r() * 0.5, 2.4 + r() * 1.6,
        sr, sg, sb, 0.5
      );
    }
  }

  /** Boost exhaust flames. `strength` 0..1 scales rate + size. */
  boostTick(ex, ey, ez, dx, dy, dz, strength, dt) {
    this.flameAcc += dt * (40 + 140 * clamp01(strength));
    const r = this.flames.rand;
    while (this.flameAcc >= 1) {
      this.flameAcc -= 1;
      const hot = r();
      const cr = 1, cg = 0.35 + hot * 0.5, cb = 0.08 + hot * 0.15;
      this.flames.spawn(
        ex + (r() - 0.5) * 0.25, ey + (r() - 0.5) * 0.2, ez + (r() - 0.5) * 0.25,
        -dx * (6 + r() * 5) + (r() - 0.5) * 1.5,
        0.8 + r() * 1.4,
        -dz * (6 + r() * 5) + (r() - 0.5) * 1.5,
        0.28 + r() * 0.28,
        (0.55 + r() * 0.45) * (0.7 + 0.6 * strength), -0.9,
        cr, cg, cb, 0.9
      );
    }
  }

  /** Celebration burst (race finish / podium). allocation-free loop. */
  confettiBurst(cx, cy, cz, count = 120, power = 7) {
    const r = this.confetti.rand;
    let n = Math.min(count, this.confetti.capacity);
    while (n-- > 0) {
      const c = CONFETTI_PALETTE[(r() * CONFETTI_PALETTE.length) | 0];
      const a = r() * Math.PI * 2;
      const sp = (0.35 + r() * 0.65) * power;
      this.confetti.spawn(
        cx + (r() - 0.5) * 2, cy + r() * 1.5, cz + (r() - 0.5) * 2,
        Math.cos(a) * sp, 4 + r() * power, Math.sin(a) * sp,
        1.6 + r() * 1.4,
        0.35 + r() * 0.3, -0.12,
        c[0], c[1], c[2], 1
      );
    }
  }

  beginSlide() { this.skids.beginSlide(); }
  endSlide() { this.skids.endSlide(); }

  /** Forward wheel sample positions + kart lateral axis to the skid ribbons. */
  pushSkid(leftPos, rightPos, sideways, strength) {
    this.skids.pushSkid(leftPos, rightPos, sideways, strength);
  }

  /** Advance ALL effects. Call once per frame with clamped dt. */
  update(dt) {
    const h = dt > 0.05 ? 0.05 : dt; // clamp: tab-switch spikes can't tunnel sim
    this.smoke.update(h);
    this.flames.update(h);
    // Confetti flutter: cheap sin wobble applied via velocity is skipped;
    // gravity + drag already give a convincing fall. (kept simple = fast)
    this.confetti.update(h);
    this.skids.update(h);
  }

  reset() {
    this.smoke.reset();
    this.flames.reset();
    this.confetti.reset();
    this.skids.reset();
    this.smokeAcc = 0;
    this.flameAcc = 0;
  }

  dispose() {
    this.smoke.dispose();
    this.flames.dispose();
    this.confetti.dispose();
    this.skids.dispose();
  }
}
