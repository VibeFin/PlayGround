/**
 * fx/postfx.js — cheap fullscreen speed/vignette overlay + CSS fallback.
 *
 * Original IP. Standalone: imports `three` only (no repo-local imports).
 *
 * Two layers, both optional and both degrade gracefully:
 *  1. PostFX — a transparent fullscreen triangle rendered ON TOP of the
 *     already-rendered frame (no render targets, no EffectComposer, one
 *     extra draw call). Vignette + radial speed lines + boost edge-glow,
 *     all procedural in-shader. If shader compilation fails it disables
 *     itself and main.js keeps running.
 *  2. SpeedOverlay — pure DOM/CSS overlay (no WebGL at all) that main.js
 *     can use instead of / alongside PostFX. Costs ~zero GPU.
 *
 * NOTE: camera FOV kick already lives in the camera module; these effects
 * are the extra "sense of speed" layer.
 *
 * Integration (main.js):
 * @example
 * import { PostFX, SpeedOverlay } from './fx/postfx.js';
 * const post = new PostFX(renderer);          // safe: never throws
 * const cssSpeed = new SpeedOverlay();        // CSS layer, independent
 * // per frame:
 * const s = clamp01(speed / topSpeed);
 * post.setSpeed(s, boosting ? 1 : 0);
 * cssSpeed.setIntensity(s);
 * renderer.render(scene, camera);             // main render first
 * post.render(dt);                            // overlay on top (no-op if disabled)
 */

import * as THREE from 'three';

const OVERLAY_VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
  // Fullscreen triangle: positions supplied by a 3-vertex BufferGeometry.
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.99999, 1.0);
}
`;

const OVERLAY_FRAG = /* glsl */ `
uniform float uTime;      // seconds, wraps
uniform float uSpeed;     // 0..1 normalized kart speed
uniform float uBoost;     // 0..1 boost flash envelope
uniform float uVignette;  // base vignette strength 0..1
uniform float uAspect;    // viewport width / height
varying vec2 vNdc;

// cheap hash without textures
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  // Centered coords: x divided by aspect so r is circular on any viewport.
  vec2 c = vec2(vNdc.x / max(uAspect, 0.0001), vNdc.y);
  float r = length(c);

  // --- vignette (always on, subtle) ---
  float vig = smoothstep(0.95, 0.35, r);
  vec3 col = vec3(0.0, 0.0, 0.02);
  float alpha = (1.0 - vig) * (0.28 + 0.42 * uVignette);

  // --- radial speed lines: angular hash bands scrolling outward ---
  float ang = atan(c.y, c.x) / 6.2831853 + 0.5;      // 0..1 around center
  float band = floor(ang * 90.0);                     // 90 angular slots
  float rnd = hash(vec2(band, floor(uTime * 3.0)));
  float streak = step(0.82, rnd);                     // ~18% of slots lit
  float outer = smoothstep(0.45, 0.95, r);            // only near edges
  float flow = fract(r * 2.0 - uTime * (1.5 + 4.0 * uSpeed));
  float line = streak * outer * smoothstep(0.75, 1.0, flow);
  float speedAmt = uSpeed * uSpeed;                   // quadratic feel
  col += vec3(0.9, 0.95, 1.0) * line * (0.55 * speedAmt);
  alpha += line * 0.5 * speedAmt;

  // --- boost edge glow (warm) ---
  float edge = smoothstep(0.35, 0.95, r);
  col += vec3(1.0, 0.55, 0.2) * edge * uBoost * 0.6;
  alpha += edge * uBoost * 0.35;

  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}
`;

export class PostFX {
  /**
   * Never throws: any failure (no WebGL, shader error) leaves the instance
   * in disabled state where render() is a no-op.
   * @param {THREE.WebGLRenderer} renderer
   * @param {object} [opts]
   * @param {number} [opts.vignette=0.6] base vignette 0..1
   */
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.enabled = false;
    this.vignette = opts.vignette ?? 0.6;
    this.speed = 0;
    this.boost = 0;
    this.time = 0;

    try {
      if (!renderer || !renderer.domElement) return;
      this.material = new THREE.ShaderMaterial({
        vertexShader: OVERLAY_VERT,
        fragmentShader: OVERLAY_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: 0 },
          uBoost: { value: 0 },
          uVignette: { value: this.vignette },
          uAspect: { value: 16 / 9 },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      // Bufferless-friendly triangle: 3 clips-space verts covering the screen.
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        -1, -1, 0, 3, -1, 0, -1, 3, 0,
      ]), 3));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);
      this.mesh = new THREE.Mesh(geo, this.material);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 9999;
      this.scene = new THREE.Scene();
      this.scene.add(this.mesh);
      // Dummy camera — vertex shader ignores matrices, but three requires one.
      this.camera = new THREE.Camera();
      this.enabled = true;
    } catch {
      this.enabled = false;
    }
  }

  static isSupported() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  }

  setEnabled(on) {
    this.enabled = !!on && !!this.material;
  }

  /** @param {number} s normalized speed 0..1 @param {number} b boost 0..1 */
  setSpeed(s, b = 0) {
    this.speed = s < 0 ? 0 : s > 1 ? 1 : s;
    this.boost = b < 0 ? 0 : b > 1 ? 1 : b;
  }

  setVignette(v) {
    this.vignette = v;
    if (this.material) this.material.uniforms.uVignette.value = v;
  }

  /**
   * Draw the overlay. Call AFTER the main scene render.
   * No-op (zero cost beyond a branch) when disabled/failed.
   */
  render(dt = 0.016) {
    if (!this.enabled || !this.renderer || !this.material) return;
    try {
      this.time = (this.time + dt) % 3600;
      const u = this.material.uniforms;
      u.uTime.value = this.time;
      // Smooth the uniforms on the PostFX side so main.js can pass raw values.
      u.uSpeed.value += (this.speed - u.uSpeed.value) * 0.12;
      u.uBoost.value += (this.boost - u.uBoost.value) * 0.08;
      const size = this.renderer.getSize(new THREE.Vector2());
      u.uAspect.value = size.x / Math.max(1, size.y);
      const prevAutoClear = this.renderer.autoClear;
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.scene, this.camera);
      this.renderer.autoClear = prevAutoClear;
    } catch {
      this.enabled = false; // degrade gracefully, once
    }
  }

  dispose() {
    this.enabled = false;
    try {
      this.mesh?.geometry.dispose();
      this.material?.dispose();
    } catch { /* already gone */ }
    this.material = null;
  }
}

// ---------------------------------------------------------------------------
// SpeedOverlay — pure CSS speed effect (no WebGL, works everywhere)
// ---------------------------------------------------------------------------

const CSS_ID = 'kg-speed-overlay-style';
const CSS_TEXT = `
.kg-speed-overlay{position:fixed;inset:0;pointer-events:none;z-index:9;
opacity:0;transition:opacity .18s linear;--kg-speed:0}
.kg-speed-overlay .kg-vig{position:absolute;inset:0;
box-shadow:inset 0 0 calc(60px + var(--kg-speed)*140px) rgba(0,0,10,.85)}
.kg-speed-overlay .kg-streaks{position:absolute;inset:-12%;
background:repeating-conic-gradient(from 0deg at 50% 50%,
rgba(255,255,255,.55) 0deg .6deg,transparent .6deg 7deg);
-webkit-mask-image:radial-gradient(circle at 50% 50%,transparent 42%,#000 78%);
mask-image:radial-gradient(circle at 50% 50%,transparent 42%,#000 78%);
opacity:calc(var(--kg-speed)*.8);
animation:kg-streak-spin .5s linear infinite}
.kg-speed-overlay .kg-boost{position:absolute;inset:0;opacity:0;transition:opacity .12s linear;
box-shadow:inset 0 0 120px 40px rgba(255,140,30,.55)}
.kg-speed-overlay.kg-boosting .kg-boost{opacity:1}
@keyframes kg-streak-spin{to{transform:rotate(2.5deg) scale(1.03)}}
@media (prefers-reduced-motion:reduce){.kg-speed-overlay .kg-streaks{animation:none}}
`;

export class SpeedOverlay {
  /**
   * @param {object} [opts]
   * @param {HTMLElement} [opts.parent=document.body]
   * @param {number} [opts.zIndex=9]
   */
  constructor(opts = {}) {
    this.intensity = 0;
    this.el = null;
    try {
      const parent = opts.parent ?? document.body;
      if (!document.getElementById(CSS_ID)) {
        const st = document.createElement('style');
        st.id = CSS_ID;
        st.textContent = CSS_TEXT;
        document.head.appendChild(st);
      }
      const el = document.createElement('div');
      el.className = 'kg-speed-overlay';
      el.style.zIndex = String(opts.zIndex ?? 9);
      el.innerHTML = '<div class="kg-vig"></div><div class="kg-streaks"></div><div class="kg-boost"></div>';
      parent.appendChild(el);
      this.el = el;
    } catch {
      this.el = null; // headless / SSR: all methods become no-ops
    }
  }

  /** @param {number} v 0..1 normalized speed @param {boolean} [boosting] */
  setIntensity(v, boosting = false) {
    const c = v < 0 ? 0 : v > 1 ? 1 : v;
    this.intensity = c;
    if (!this.el) return;
    this.el.style.opacity = c < 0.25 ? '0' : String(((c - 0.25) / 0.75).toFixed(3));
    this.el.style.setProperty('--kg-speed', c.toFixed(3));
    this.el.classList.toggle('kg-boosting', !!boosting && c > 0.3);
  }

  dispose() {
    try { this.el?.remove(); } catch { /* noop */ }
    this.el = null;
  }
}
