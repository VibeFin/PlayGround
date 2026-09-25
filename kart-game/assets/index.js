/**
 * assets/index.js — one-stop shop for procedural track textures.
 *
 * Original IP (100% canvas-generated, no binaries, no external art).
 * Standalone: imports `three` only (plus sibling generators).
 *
 * @example
 * import { makeAllTrackTextures } from '../../assets/index.js';
 * const tex = makeAllTrackTextures();
 * roadMat.map = tex.asphalt; grassMat.map = tex.grass; ...
 */

import * as THREE from 'three';
import { makeAsphaltTexture } from './asphalt.js';
import { makeGrassTexture } from './grass.js';
import { makeCurbTexture, makeFinishTexture } from './curb.js';

export { makeAsphaltTexture } from './asphalt.js';
export { makeGrassTexture } from './grass.js';
export { makeCurbTexture, makeFinishTexture } from './curb.js';

/**
 * Build the full track texture set with sensible track defaults.
 * @param {object} [opts] forwarded sizes/repeats
 * @returns {{asphalt: THREE.CanvasTexture, grass: THREE.CanvasTexture,
 *           curb: THREE.CanvasTexture, finish: THREE.CanvasTexture}}
 */
export function makeAllTrackTextures(opts = {}) {
  return {
    asphalt: makeAsphaltTexture(opts.asphalt ?? { repeat: [6, 18] }),
    grass: makeGrassTexture(opts.grass ?? { repeat: [24, 24] }),
    curb: makeCurbTexture(opts.curb ?? { blocks: 8 }),
    finish: makeFinishTexture(opts.finish ?? {}),
  };
}

/** Dispose a set created by makeAllTrackTextures. */
export function disposeTrackTextures(set) {
  if (!set) return;
  for (const k of Object.keys(set)) {
    try { set[k]?.dispose(); } catch { /* noop */ }
  }
}

export { THREE };
