/**
 * assets/curb.js — procedural curb + start/finish-line textures.
 *
 * Original IP (100% canvas-generated, no binaries, no external art).
 * Standalone: imports `three` only.
 *
 * - makeCurbTexture: classic red/white racing curb blocks with chipped-
 *   paint speckle and edge grime. Repeats along U (direction of travel).
 * - makeFinishTexture: checkered start/finish line.
 *
 * @example
 * import { makeCurbTexture, makeFinishTexture } from '../../assets/curb.js';
 * curbMat.map = makeCurbTexture({ blocks: 12 });
 * lineMat.map = makeFinishTexture();
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

function speckle(ctx, size, rand, n, colors) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(rand() * colors.length) | 0];
    ctx.fillRect((rand() * size) | 0, (rand() * size) | 0, 1 + ((rand() * 2) | 0), 1);
  }
}

/**
 * @param {object} [opts]
 * @param {number} [opts.size=256]
 * @param {number} [opts.seed=9001]
 * @param {number} [opts.blocks=8] red/white block pairs across U
 * @param {string} [opts.red='#d23b2e'] @param {string} [opts.white='#e8e8e8']
 * @returns {THREE.CanvasTexture}
 */
export function makeCurbTexture(opts = {}) {
  const { size = 256, seed = 9001, blocks = 8, red = '#d23b2e', white = '#e8e8e8' } = opts;
  const rand = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  const bw = size / blocks;
  for (let b = 0; b < blocks; b++) {
    ctx.fillStyle = b % 2 ? white : red;
    ctx.fillRect(Math.floor(b * bw), 0, Math.ceil(bw) + 1, size);
  }

  // Chipped paint: dark pits + light scuffs.
  speckle(ctx, size, rand, 900, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.20)', 'rgba(60,60,60,0.25)']);

  // Top highlight + bottom grime (curb profile shading).
  const shade = ctx.createLinearGradient(0, 0, 0, size);
  shade.addColorStop(0, 'rgba(255,255,255,0.22)');
  shade.addColorStop(0.25, 'rgba(255,255,255,0)');
  shade.addColorStop(0.8, 'rgba(0,0,0,0.08)');
  shade.addColorStop(1, 'rgba(0,0,0,0.30)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);

  // Block seams.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let b = 0; b <= blocks; b++) ctx.fillRect(Math.floor((b * size) / blocks), 0, 2, size);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Checkered start/finish line.
 * @param {object} [opts]
 * @param {number} [opts.size=256] @param {number} [opts.cells=8] squares per side
 * @returns {THREE.CanvasTexture}
 */
export function makeFinishTexture(opts = {}) {
  const { size = 256, cells = 8 } = opts;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const cell = size / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#111114' : '#f4f4f4';
      ctx.fillRect(Math.floor(x * cell), Math.floor(y * cell), Math.ceil(cell) + 1, Math.ceil(cell) + 1);
    }
  }
  // Subtle wear so it doesn't look CG-flat.
  const rand = mulberry32(777);
  speckle(ctx, size, rand, 500, ['rgba(0,0,0,0.18)', 'rgba(255,255,255,0.10)']);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
