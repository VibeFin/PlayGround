# Spline Rush — readable rewrite

A clean-room, human-readable re-implementation of
**[spline-rush.vercel.app](https://spline-rush.vercel.app)**
(“Spline Rush — Find your limit.”), reverse-engineered from its shipped
minified Vite bundle (`assets/index-*.js`, ~1.1 MB: Three.js + ~95 KB of
game code) and stylesheet (`assets/index-*.css`).

Six procedural spline circuits, five arcade cars, quick race / time trial /
championship, personal-best ghosts, replay, day cycle, weather, procedural
audio. Verified in a real browser: menu → countdown → racing → pause →
results, with screenshots in `/tmp/opencode/shots/`.

## Run it

```bash
npm install
npm run dev      # http://localhost:3002
npm run build    # production bundle in dist/
```

## Layout

| File | What it is | Minified origin |
|---|---|---|
| `index.html` | Canvas + UI root + fatal box | original `index.html` |
| `src/main.js` | Boot, game loop, `window.splineRush` handle | `uV()` + `zV()` |
| `src/config/tracks.js` | 6 tracks, exact control points, tunnels, championship rotation | `HI` + `UI` |
| `src/config/cars.js` | 5 cars, body proportions, engine profiles, paints | `nL` + `rL` + `eB` |
| `src/config/modes.js` | Modes, quality presets, points, defaults | `Iz` + `Lz` + `yz` |
| `src/core/spline-track.js` | Catmull-Rom loop, frames/banking, road/terrain/barriers/biome meshes, minimap | `$I()` + `CL/SL` + mesh builders |
| `src/core/vehicle.js` | Lofted hull, glasshouse, lights, wings, spoked wheels with brakes, roll/pitch, brake-light boost | `oL`/`fL` + `pL` + `TL` |
| `src/core/physics.js` | Fixed-step arcade physics, surfaces, collisions, laps | `hV` + `AL` + `LL` + `DV`, `EL/DL` |
| `src/core/world.js` | Scene, sun/shadows, fog, day cycle, weather | `Sz()` + `A()` |
| `src/core/follow-camera.js` | Chase / hood / onboard + menu orbit | `DB` + `RB.update` |
| `src/core/audio.js` | Worklet combustion engine, noise loops, reverb, music, SFX | `iB` + worklet `tB`, `nB`/`rB` |
| `src/core/ghost.js` | `localStorage` personal bests @ 20 Hz | `sB`/`cB`/`lB`/`uB`/`dB` |
| `src/core/replay.js` | 30 Hz replay recorder, capped 5400 frames | `AB` + `MB` |
| `src/core/input.js` | Keyboard + touch + gamepad | `aB` + `oB` + `spline:control` |
| `src/core/game.js` | State machine, grid, AI, laps, championship, HUD sync | `yB/SB/bB/gB/xB`, `gV/_V/jV/MV/NV`, `RV` |
| `src/ui/menu.js` | Menu, garage/settings drawers, pause/results overlays | `zz()` + `kz/Az` |
| `src/ui/hud.js` | Position/lap/timing, leaderboard, minimap, speedo, touch | `showHUD` branch |
| `src/ui/icons.js` | Stroke icon set | `kz` + `Az()` |
| `src/styles.css` | Beautified shipped stylesheet, class-for-class | `assets/index-*.css` |

## Deliberate simplifications

- **WebGL instead of WebGPU/TSL**: the original targets Three.js
  WebGPU (`WebGPURenderer`, node materials, GTAO/SSR/bloom/god-rays).
  This rewrite uses plain `WebGLRenderer` with the same art direction
  (warm sun, height-tinted fog, day cycle, wet weather) so the code stays
  readable and runs everywhere.
- **Audio**: the per-emitter HRTF graph is simplified to a shared mix;
  the `spline-rush-combustion` worklet itself is reproduced verbatim.
- **Particles/skids/rain-GPU**: omitted; hooks (`quality.rain`,
  `particles`) are kept in the presets for a future pass.

## Controls

WASD / arrows drive · Space handbrake · C camera · R reset · Esc pause ·
gamepad stick + RT/LT · touch buttons on coarse pointers.
