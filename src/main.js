/**
 * Boot: wire canvas -> world -> UI -> game loop.
 * Mirrors minified `uV()` boot + `zV()` animation loop + `window.splineRush`
 * debug handle.
 */
import { World } from './core/world.js';
import { Game } from './core/game.js';
import { MenuUI } from './ui/menu.js';
import { Hud } from './ui/hud.js';
import { GameAudio } from './core/audio.js';
import { Input } from './core/input.js';
import { getCar } from './config/cars.js';
import { resetCarToTrack } from './core/physics.js';
import { QUALITY_PRESETS } from './config/modes.js';

const canvas = document.querySelector('#game-canvas');
const uiRoot = document.querySelector('#ui-root');
const fatalBox = document.querySelector('#fatal-error');

function fatal(err) {
  console.error(err);
  fatalBox.hidden = false;
  fatalBox.textContent = `Something broke on the grid: ${err?.message ?? err}`;
}

async function boot() {
  const world = new World(canvas);
  const audio = new GameAudio();
  const input = new Input();
  const hud = new Hud();

  let game;
  const ui = new MenuUI(uiRoot, {
    onMode: (mode) => {
      game.selection.mode = mode;
      ui.setMode(mode);
    },
    onTrack: (trackId) => {
      game.selection.trackId = trackId;
      game.setTrack(trackId);
      ui.setMinimap(trackId, game.track.minimapPoints());
    },
    onCar: (carId) => {
      game.selection.carId = carId;
      game.refreshShowCar();
      ui.openGarage(carId, game.selection.paint);
    },
    onPaint: (paint) => {
      game.selection.paint = paint;
      game.refreshShowCar();
      ui.openGarage(game.selection.carId, paint);
    },
    onQuality: (q) => {
      game.settings.quality = q;
      game.persistSettings();
      world.setQuality(q, QUALITY_PRESETS);
      document.getElementById('menu-quality').textContent = `${q.toUpperCase()} QUALITY`;
      ui.openSettings(game.settings);
    },
    onSetting: (key, value) => {
      game.settings[key] = value;
      game.persistSettings();
      audio.setSettings({ volume: game.settings.volume, music: game.settings.music });
    },
    onAction: async (action) => {
      try {
        if (action === 'start') await game.startRace();
        else if (action === 'garage') ui.openGarage(game.selection.carId, game.selection.paint);
        else if (action === 'settings') ui.openSettings(game.settings);
        else if (action === 'close-drawer') ui.closeDrawer();
        else if (action === 'audio') {
          await audio.start();
          const on = audio.toggle();
          document.querySelector('[data-action="audio"]').innerHTML =
            on ? '<svg class="icon" viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6l-5 4H4z"/></svg>'
               : '<svg class="icon" viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6l-5 4H4zm12 3l5 5m0-5l-5 5"/></svg>';
        }
        else if (action === 'pause') game.pause();
        else if (action === 'resume') game.resume();
        else if (action === 'restart') { ui.hidePause(); await game.startRace(); }
        else if (action === 'menu') game.toMenu();
        else if (action === 'continue') { ui.hidePause(); game.continueFromResults(); }
        else if (action === 'replay') game.watchReplay();
        else if (action === 'end-replay') game.endReplay();
        else if (action === 'camera') {
          const label = game.cameraRig.cycle();
          hud.event(`CAMERA · ${label}`);
        }
      } catch (err) {
        fatal(err);
      }
    },
  });

  game = new Game(world, ui, hud, audio, input);
  Object.assign(game.settings, game.settings);
  world.setQuality(game.settings.quality, QUALITY_PRESETS);
  audio.volume = game.settings.volume;
  audio.musicEnabled = game.settings.music;

  input.onPause = () => {
    if (game.state === 'paused') game.resume();
    else game.pause();
  };
  input.onReset = () => {
    if (game.state === 'racing' && game.cars[0]) resetCarToTrack(game.cars[0].state);
  };
  input.onCamera = () => {
    if (['racing', 'countdown'].includes(game.state)) hud.event(`CAMERA · ${game.cameraRig.cycle()}`);
  };
  input.onAnyGesture = () => audio.start().catch(() => {});

  window.addEventListener('resize', () => world.resize());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'racing') {
      game.pause();
      hud.event('Race paused — tab hidden');
    }
  });

  game.toMenu();
  ui.setHeroCar(getCar(game.selection.carId));

  // Debug handle mirrors `window.splineRush` in the original bundle.
  window.splineRush = {
    get state() { return game.state; },
    get track() { return { id: game.track?.id, length: game.track?.length }; },
    get player() { return game.cars[0]?.state ?? null; },
    get stats() { return world.getStats(); },
  };

  let last = performance.now() / 1000;
  world.renderer.setAnimationLoop(() => {
    try {
      const now = performance.now() / 1000;
      let dt = Math.min(0.1, Math.max(0, now - last));
      last = now;
      if (document.hidden) return;
      game.update(dt);
    } catch (err) {
      fatal(err);
      world.renderer.setAnimationLoop(null);
    }
  });
}

boot().catch(fatal);
