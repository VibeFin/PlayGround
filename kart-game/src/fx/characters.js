/**
 * fx/characters.js — 8 original kart drivers (no Nintendo IP).
 *
 * Standalone: imports `three` only (no repo-local imports).
 *
 * Each driver is a color variant + name + kart livery + arcade stats.
 * Names, titles and designs are original creations for this project —
 * any resemblance to other kart games is coincidental color theory.
 *
 * Integration (main.js):
 * @example
 * import { DRIVERS, getDriver, createDriverMesh } from './fx/characters.js';
 * const def = getDriver(selectedIndex);          // menu / AI assignment
 * const mesh = createDriverMesh(selectedIndex);  // sits in kart at y≈0.55
 * kartGroup.add(mesh);
 */

import * as THREE from 'three';

export const DRIVER_COUNT = 8;

/**
 * @typedef {object} DriverDef
 * @property {string} id
 * @property {string} name
 * @property {string} title
 * @property {number} suit   hex — racing suit
 * @property {number} cap    hex — helmet/cap
 * @property {number} kart   hex — suggested kart body livery
 * @property {number} skin   hex — skin tone
 * @property {number} accent hex — gloves/scarf/visor trim
 * @property {'light'|'medium'|'heavy'} weight
 * @property {{top:number, accel:number, grip:number}} stats arcade 0..1
 */

export const DRIVERS = [
  {
    id: 'rocco', name: 'Rocco', title: 'The Red Comet',
    suit: 0xd23b2e, cap: 0xd23b2e, kart: 0xd23b2e,
    skin: 0xf2c49b, accent: 0xffcf3f, weight: 'medium',
    stats: { top: 0.72, accel: 0.72, grip: 0.72 },
  },
  {
    id: 'beppo', name: 'Beppo', title: 'Blue Bolt',
    suit: 0x2e6fd2, cap: 0x2e6fd2, kart: 0x2e6fd2,
    skin: 0xf2c49b, accent: 0xffffff, weight: 'medium',
    stats: { top: 0.68, accel: 0.76, grip: 0.74 },
  },
  {
    id: 'stella', name: 'Stella', title: 'Starlight Sprinter',
    suit: 0xf2b90d, cap: 0xf2b90d, kart: 0xf2b90d,
    skin: 0x8a5a3b, accent: 0xffffff, weight: 'light',
    stats: { top: 0.64, accel: 0.88, grip: 0.78 },
  },
  {
    id: 'pippa', name: 'Pippa', title: 'Turbo Petal',
    suit: 0xe86aa5, cap: 0xe86aa5, kart: 0xe86aa5,
    skin: 0xf7d7b5, accent: 0x7de3ff, weight: 'light',
    stats: { top: 0.62, accel: 0.9, grip: 0.8 },
  },
  {
    id: 'grom', name: 'Grom', title: 'Gentle Thunder',
    suit: 0x3fa34d, cap: 0x2b7a38, kart: 0x3fa34d,
    skin: 0x6b4a30, accent: 0xffcf3f, weight: 'heavy',
    stats: { top: 0.86, accel: 0.55, grip: 0.66 },
  },
  {
    id: 'nuvola', name: 'Nuvola', title: 'Cloud Dancer',
    suit: 0xe8f1f5, cap: 0x7de3ff, kart: 0x7de3ff,
    skin: 0xf2c49b, accent: 0x2e6fd2, weight: 'light',
    stats: { top: 0.66, accel: 0.82, grip: 0.84 },
  },
  {
    id: 'fulmine', name: 'Fulmine', title: 'Violet Voltage',
    suit: 0x7a3fd1, cap: 0x5a2ba8, kart: 0x7a3fd1,
    skin: 0xc98e5f, accent: 0xffe14d, weight: 'medium',
    stats: { top: 0.76, accel: 0.68, grip: 0.7 },
  },
  {
    id: 'turbo', name: 'Turbo', title: 'Ember Express',
    suit: 0xe06a1b, cap: 0xb33c12, kart: 0xe06a1b,
    skin: 0x5a3a26, accent: 0x2b2b2b, weight: 'heavy',
    stats: { top: 0.88, accel: 0.52, grip: 0.62 },
  },
];

/** Clamp any integer to a valid driver index (wraps for AI grids). */
export function driverIndex(i) {
  const n = DRIVER_COUNT;
  return ((i % n) + n) % n;
}

/** @param {number} i @returns {DriverDef} */
export function getDriver(i) {
  return DRIVERS[driverIndex(i)];
}

// Shared geometries — built once, reused by every driver mesh.
let _geo = null;
function sharedGeo() {
  if (_geo) return _geo;
  _geo = {
    torso: new THREE.CapsuleGeometry(0.21, 0.3, 6, 12),
    head: new THREE.SphereGeometry(0.17, 20, 14),
    helmet: new THREE.SphereGeometry(0.195, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    brim: new THREE.CylinderGeometry(0.2, 0.22, 0.05, 16),
    visor: new THREE.BoxGeometry(0.24, 0.09, 0.06),
    arm: new THREE.CapsuleGeometry(0.07, 0.3, 4, 8),
    scarf: new THREE.TorusGeometry(0.14, 0.045, 8, 16),
  };
  return _geo;
}

/**
 * Build a charming low-poly driver (~7 meshes, Lambert materials).
 * Sized to sit in a kart: total height ≈ 0.75. Origin at seat (butt).
 * @param {number} i driver index (wraps)
 * @param {object} [opts]
 * @param {boolean} [opts.shadow=true] castShadow on parts
 * @returns {THREE.Group} with `userData.driver = DriverDef`
 */
export function createDriverMesh(i, opts = {}) {
  const def = getDriver(i);
  const g = sharedGeo();
  const shadow = opts.shadow ?? true;

  const matSuit = new THREE.MeshLambertMaterial({ color: def.suit });
  const matCap = new THREE.MeshLambertMaterial({ color: def.cap });
  const matSkin = new THREE.MeshLambertMaterial({ color: def.skin });
  const matAccent = new THREE.MeshLambertMaterial({ color: def.accent });

  const root = new THREE.Group();
  root.userData.driver = def;

  const add = (geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = shadow;
    root.add(m);
    return m;
  };

  add(g.torso, matSuit, 0, 0.32, 0);                    // torso
  add(g.scarf, matAccent, 0, 0.52, 0, Math.PI / 2);     // collar/scarf
  add(g.head, matSkin, 0, 0.68, 0.01);                  // head
  add(g.helmet, matCap, 0, 0.71, 0.01);                 // helmet dome
  add(g.brim, matCap, 0, 0.7, 0.17, 0.12);              // helmet brim
  add(g.visor, matAccent, 0, 0.66, 0.15);               // goggles
  add(g.arm, matSuit, -0.26, 0.3, 0.22, 1.1, 0, 0.25);  // left arm → wheel
  add(g.arm, matSuit, 0.26, 0.3, 0.22, 1.1, 0, -0.25);  // right arm → wheel

  return root;
}

/** Dispose the materials of a driver mesh (geometries are shared). */
export function disposeDriverMesh(root) {
  if (!root) return;
  root.traverse((o) => {
    if (o.isMesh && o.material && !o.material._shared) o.material.dispose();
  });
}
