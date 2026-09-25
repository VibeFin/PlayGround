/**
 * assets/asphalt.js — procedural AAA-on-cheap asphalt texture.
 *
 * Original IP (100% canvas-generated, no binaries, no external art).
 * Standalone: imports `three` only.
 *
 * Layers: base tarmac tone → large soft tonal patches (wrapped so the
 * texture tiles seamlessly) → fine aggregate speckle → faint tire-wear
 * darkening along the driving direction → subtle top highlight noise.
 *
 * @example
 * import { makeAsphaltTexture } from '../../assets/asphalt.js';
 * const map = makeAsphaltTexture({ size: 512, repeat: [8, 24] });
 * roadMat.map = map;
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

/** Draw a soft blob 9× (wrapped) so edges tile seamlessly. */
function wrappedBlob(ctx, size, x, y, r, color) {
  ctx.fillStyle = color;
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      ctx.beginPath();
      ctx.arc(x + ox * size, y + oy * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * @param {object} [opts]
 * @param {number} [opts.size=512] canvas pixels (square)
 * @param {number} [opts.seed=1337]
 * @param {[number, number]} [opts.repeat=[6, 18]] texture repeat (u, v)
 * @param {string} [opts.base='#3b3e46'] tarmac base color
 * @returns {THREE.CanvasTexture}
 */
export function makeAsphaltTexture(opts = {}) {
  const { size = 512, seed = 1337, repeat = [6, 18], base = '#3b3e46' } = opts;
  const rand = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Large tonal patches (wrapped → seamless).
  for (let i = 0; i < 26; i++) {
    const x = rand() * size, y = rand() * size;
    const r = size * (0.06 + rand() * 0.16);
    const light = rand() > 0.5;
    wrappedBlob(ctx, size, x, y, r, light ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.07)');
  }

  // Aggregate speckle: thousands of 1px stones, light + dark.
  for (let i = 0; i < size * 14; i++) {
    const x = (rand() * size) | 0, y = (rand() * size) | 0;
    const v = rand();
    ctx.fillStyle = v > 0.6 ? 'rgba(255,255,255,0.10)' : v > 0.25 ? 'rgba(0,0,0,0.16)' : 'rgba(160,170,190,0.12)';
    ctx.fillRect(x, y, 1 + ((rand() * 2) | 0), 1);
  }

  // Faint center tire-wear bands along V (direction of travel).
  const bandGrad = ctx.createLinearGradient(0, 0, size, 0);
  bandGrad.addColorStop(0, 'rgba(0,0,0,0)');
  bandGrad.addColorStop(0.3, 'rgba(0,0,0,0.10)');
  bandGrad.addColorStop(0.5, 'rgba(0,0,0,0.02)');
  bandGrad.addColorStop(0.7, 'rgba(0,0,0,0.10)');
  bandGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bandGrad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
