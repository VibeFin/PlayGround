import * as THREE from 'three';
import { Game } from './core/Game.js';
import { Input } from './core/Input.js';

/**
 * main.js — renderer setup, fixed-timestep loop, resize, pause-on-blur.
 * Owned by Agent 1. Delegates world/kart/items/hud to Game.js (dynamic fallbacks).
 */

const app = document.getElementById('app');
const menuStatus = document.getElementById('menu-status');
const startBtn = document.getElementById('start-btn');
const pausedBanner = document.getElementById('paused-banner');
const countdownEl = document.getElementById('countdown');

// --- renderer (Three r160+ API: outputColorSpace + ACESFilmic) ---------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

// --- core modules ------------------------------------------------------------
const input = new Input(window);
const game = new Game({ renderer, input });

let running = true;
let lastFrame = performance.now() / 1000;
// Fixed timestep physics @ 60Hz with accumulator; render every rAF.
const STEP = 1 / 60;
let accumulator = 0;

function setStatus(text) {
  if (menuStatus) menuStatus.textContent = text;
}

function syncPauseBanner() {
  if (!pausedBanner) return;
  pausedBanner.classList.toggle('visible', game.state === 'paused');
}

game.onStateChange((s) => {
  syncPauseBanner();
  if (s === 'racing' && countdownEl) countdownEl.classList.add('hidden');
});

// --- resize (desktop 1280x720+ responsive) -------------------------------------
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  game.perspectiveCamera.aspect = w / h;
  game.perspectiveCamera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

// --- pause on blur / visibility -------------------------------------------------
function pauseOnHidden() {
  if (game.state === 'racing' || game.state === 'countdown') game.pause();
}
window.addEventListener('blur', pauseOnHidden);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseOnHidden();
});
pausedBanner?.addEventListener('click', () => game.resume());
renderer.domElement.addEventListener('click', () => {
  if (game.state === 'paused') game.resume();
});

// --- menu wiring -----------------------------------------------------------------
startBtn?.addEventListener('click', () => game.startRace());

// --- main loop --------------------------------------------------------------------
function frame() {
  requestAnimationFrame(frame);
  if (!running) return;
  const now = performance.now() / 1000;
  let frameDt = now - lastFrame;
  lastFrame = now;
  // Clamp huge gaps (tab switch) to avoid spiral of death.
  if (frameDt > 0.25) frameDt = 0.25;

  input.pollGamepad();

  accumulator += frameDt;
  let steps = 0;
  while (accumulator >= STEP && steps < 5) {
    game.update(STEP);
    accumulator -= STEP;
    steps += 1;
  }
  if (steps === 5) accumulator = 0; // drop backlog after hitches

  game.render(frameDt);
}

// --- boot --------------------------------------------------------------------------
try {
  setStatus('Loading world… (other agents can still be in progress)');
  await game.init();
  const missing = [
    game.track?.isFallback ? 'track' : null,
    game.player?.isFallback ? 'kart' : null,
    game.ai?.isFallback ? 'ai' : null,
    game.items?.isFallback ? 'items' : null,
    game.hud?.isFallback ? 'hud' : null
  ].filter(Boolean);
  if (missing.length === 0) {
    setStatus('Ready — press Enter or click START RACE.');
  } else {
    setStatus(`Running with built-in fallbacks for: ${missing.join(', ')}. Press Enter or click START RACE.`);
  }
  onResize();
  requestAnimationFrame(frame);
} catch (err) {
  console.error('[main] failed to boot', err);
  setStatus(`Failed to start: ${err?.message ?? err}`);
}

// Safety: Enter key also works when menu button focused (Input already queues it).
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && (game.state === 'menu' || game.state === 'finished')) {
    game.startRace();
  }
  if ((e.code === 'KeyP' || e.code === 'Escape') && game.state !== 'menu') {
    game.togglePause();
  }
});

export { game, input, renderer };
