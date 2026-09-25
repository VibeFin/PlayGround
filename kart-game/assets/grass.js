/**
 * assets/grass.js — procedural grass texture (infield / runoff).
 *
 * Original IP (100% canvas-generated, no binaries, no external art).
 * Standalone: imports `three` only.
 *
 * Layers: green base → wrapped macro patches (mow stripes + dry spots) →
 * thousands of tiny blade strokes in varied greens → sparse clover dots.
 *
 * @example
 * import { makeGrassTexture } from '../../assets/grass.js';
 * grassMat.map = makeGrassTexture({ repeat: [30, 30] });
 */

import * as THREE from 'three';

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

function wrappedEllipse(ctx, size, x, y, rx, ry, color) {
  ctx.fillStyle = color;
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      ctx.beginPath();
      ctx.ellipse(x + ox * size, y + oy * size, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * @param {object} [opts]
 * @param {number} [opts.size=512]
 * @param {number} [opts.seed=4242]
 * @param {[number, number]} [opts.repeat=[24, 24]]
 * @param {string} [opts.base='#4a8f3c']
 * @returns {THREE.CanvasTexture}
 */
export function makeGrassTexture(opts = {}) {
  const { size = 512, seed = 4242, repeat = [24, 24], base = '#4a8f3c' } = opts;
  const rand = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Mow stripes (vertical bands, tile-safe: stripe count divides size).
  const stripes = 8;
  for (let s = 0; s < stripes; s++) {
    if (s % 2) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect((s * size) / stripes, 0, size / stripes, size);
  }

  // Macro patches: lush dark + dry yellow-green (wrapped → seamless).
  for (let i = 0; i < 30; i++) {
    const x = rand() * size, y = rand() * size;
    const rx = size * (0.05 + rand() * 0.14), ry = size * (0.04 + rand() * 0.1);
    wrappedEllipse(ctx, size, x, y, rx, ry,
      rand() > 0.45 ? 'rgba(20,70,20,0.10)' : 'rgba(190,200,90,0.08)');
  }

  // Blade strokes: short 1–2px vertical ticks in varied greens.
  const greens = ['#5da24a', '#3f7d33', '#6cb257', '#356b2a', '#79bd60'];
  for (let i = 0; i < size * 22; i++) {
    const x = (rand() * size) | 0, y = (rand() * size) | 0;
    ctx.strokeStyle = greens[(rand() * greens.length) | 0];
    ctx.globalAlpha = 0.35 + rand() * 0.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 2, y - 1 - rand() * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Sparse clover / tiny flowers.
  for (let i = 0; i < 90; i++) {
    const x = rand() * size, y = rand() * size;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.7)' : 'rgba(255,235,120,0.8)';
    ctx.fillRect(x | 0, y | 0, 2, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
