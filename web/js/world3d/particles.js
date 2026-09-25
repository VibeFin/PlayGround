// Ambient particle fields animated entirely on the GPU: each field is one draw call and costs no
// per-frame CPU work beyond updating a time uniform.
import * as THREE from "three";
import { tex } from "./textures.js";

const TYPES = {
  embers: { color: "#ff8a3a", vel: [0, 1.1, 0], size: 0.13, sway: 0.35, alpha: 1, additive: true },
  motes: { color: "#8ff0ff", vel: [0, 0.22, 0], size: 0.11, sway: 0.7, alpha: 0.9, additive: true },
  dust: { color: "#d8c8a8", vel: [0.05, -0.04, 0.02], size: 0.07, sway: 0.4, alpha: 0.35, additive: false },
  snow: { color: "#ffffff", vel: [0.5, -1.3, 0.25], size: 0.13, sway: 0.6, alpha: 0.85, additive: false },
  ash: { color: "#b8a8a0", vel: [0.25, -0.35, 0.1], size: 0.1, sway: 0.5, alpha: 0.6, additive: false },
  steam: { color: "#e0e0e0", vel: [0, 0.9, 0], size: 0.7, sway: 0.2, alpha: 0.12, additive: false },
  spores: { color: "#c8f08a", vel: [0, 0.12, 0], size: 0.09, sway: 0.9, alpha: 0.8, additive: true },
};

const VERT = `
attribute float aSeed;
uniform float uTime, uSize, uSway, uPixel;
uniform vec3 uArea, uCenter, uVel;
varying float vAlpha;
void main() {
  vec3 m = fract(position + uVel * uTime / max(uArea, vec3(0.001)));
  vec3 wp = uCenter + (m - 0.5) * uArea;
  wp.x += sin(uTime * 0.7 + aSeed * 6.283) * uSway;
  wp.z += cos(uTime * 0.53 + aSeed * 3.1) * uSway;
  float edge = smoothstep(0.0, 0.12, m.y) * smoothstep(1.0, 0.85, m.y);
  vAlpha = edge * (0.55 + 0.45 * sin(uTime * 2.3 + aSeed * 20.0));
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  gl_PointSize = uSize * uPixel * (320.0 / max(0.5, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
uniform sampler2D uTex;
uniform vec3 uColor;
uniform float uAlpha;
varying float vAlpha;
void main() {
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(uColor, t.a * vAlpha * uAlpha);
}`;

export function makeField(type, center, area, count, pixelRatio = 1) {
  const def = TYPES[type];
  if (!def) return null;
  const n = count ?? Math.min(400, Math.max(10, Math.round(area[0] * area[1] * area[2] * 0.04)));
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = Math.random(); pos[i * 3 + 1] = Math.random(); pos[i * 3 + 2] = Math.random();
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    blending: def.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uTime: { value: Math.random() * 100 }, uSize: { value: def.size }, uSway: { value: def.sway }, uPixel: { value: pixelRatio },
      uArea: { value: new THREE.Vector3(...area) }, uCenter: { value: new THREE.Vector3(center.x, center.y + area[1] / 2, center.z) },
      uVel: { value: new THREE.Vector3(...def.vel) }, uTex: { value: tex("glow") },
      uColor: { value: new THREE.Color(def.color) }, uAlpha: { value: def.alpha },
    },
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.userData.tick = (dt) => { m.uniforms.uTime.value += dt; };
  return pts;
}

export const FIELD_TYPES = Object.keys(TYPES);
