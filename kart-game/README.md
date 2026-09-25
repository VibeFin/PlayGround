# KART·GAME — Three.js Mario Kart–style Racer

An arcade kart racer built with **Three.js + Vite**. All art is **original IP**:
every texture is generated at runtime on `<canvas>`, every driver is an
original character, and all effects are procedural shaders/particles.
No Nintendo assets, names, or music are used anywhere.

## Run

```bash
npm install
npm run dev
```

Then open the printed URL (default <http://localhost:5173>).
Desktop 1280×720+ recommended. Production build: `npm run build`, preview with `npm run preview`.

## Controls

| Input | Action |
|---|---|
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake / reverse |
| `A` `D` / `←` `→` | Steer |
| `Space` (tap) | Use held item |
| `Space` (hold + steer) | Drift (release for mini-turbo boost) |
| `R` | Reset kart to track |
| `Enter` | Start race / confirm |
| `Esc` / `P` | Pause |

**Drift → boost:** hold drift through a corner; smoke turns orange, then blue —
release to fire the charged mini-turbo. Blue sparks = biggest boost.

## Project structure

```
kart-game/
├── index.html          # HUD, menu, minimap, overlays
├── assets/             # procedural canvas textures (Agent 5, no binaries)
│   ├── asphalt.js      # makeAsphaltTexture — tarmac + speckle + tire wear
│   ├── grass.js        # makeGrassTexture — blades, mow stripes, patches
│   ├── curb.js         # makeCurbTexture / makeFinishTexture — curbs + checker
│   └── index.js        # makeAllTrackTextures() convenience set
├── src/
│   ├── main.js         # game bootstrap + loop (integration point)
│   ├── core/           # camera, input, utils
│   ├── kart/           # kart physics / mesh
│   ├── world/          # track, collision, minimap
│   ├── items/          # pickups / projectiles
│   ├── audio/          # engine + SFX (WebAudio, procedural)
│   ├── ui/             # menus, HUD bindings
│   └── fx/             # effects (Agent 5)
│       ├── particles.js  # pooled drift smoke, boost flames, confetti, skid marks
│       ├── postfx.js     # fullscreen vignette/speed-lines + CSS speed overlay
│       └── characters.js # 8 original drivers (Rocco, Beppo, Stella, …)
└── README.md           # this file
```

### FX module notes (for integrators)

- `ParticleSystem.update(dt)` advances smoke + flames + confetti + skid fade.
  Call `driftTick()` / `boostTick()` while active, `pushSkid()` while drifting.
- `PostFX.render(dt)` draws the overlay **after** the main render; it
  self-disables on any GL failure. `SpeedOverlay` is the zero-WebGL CSS twin.
- Textures repeat seamlessly — set `repeat` per mesh size and go.

## Credits

- Built by 5 cooperating agents: core/loop, kart physics, world/track,
  items/audio/UI, and **FX + procedural assets + docs (Agent 5)**.
- Engine: [Three.js](https://threejs.org/) · bundler: [Vite](https://vitejs.dev/).
- All drivers, textures, shaders, and sounds are original works created for
  this project. No third-party game IP is included.
