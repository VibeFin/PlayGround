# WRECKAGE — Full Contact Motorsport

A playable Three.js demolition derby: ten battered V8s, one industrial dirt arena, and one survivor. Procedurally built vehicles and scenery, regional body damage, opponent AI, nitro, synthesized engine and collision audio, dirt trails, debris, and a cinematic chase camera.

## Run

```sh
npm install
npm run dev
```

Open **http://localhost:3000**. The live build progress page is **http://localhost:3000/progress.html**.

```sh
npm run build  # production output in dist/
npm run preview
npm test       # physics and vehicle regression tests
```

## Play

Click **Enter the carnage**. After the countdown, wreck the other nine cars and protect your own. If time expires, the healthiest remaining car wins.

| Input | Action |
| --- | --- |
| W / ↑ | Accelerate |
| S / ↓ | Brake, then reverse |
| A D / ← → | Steer |
| Space | Handbrake |
| Shift | Nitro; regenerates when released |
| C | Switch chase-camera distance |
| Esc | Pause / resume |
| M | Toggle audio |

Touch buttons appear on touch-capable devices. Losing browser focus pauses the derby automatically. Restart and return-to-menu actions are available in the pause and results screens.

The compact camera button also switches views on touch devices. The mobile footer opens the driver briefing. Destruction points reward effective attacks; orange armor-loss feedback indicates damage received.

## Structure

- `src/simulation.js` — vehicle dynamics, collision response, damage, opponent AI, scoring, and event rules.
- `src/vehicles.js` — procedural stock cars and progressive damage presentation.
- `src/arena.js` — dirt arena, trackside dressing, stands, and industrial scenery.
- `src/main.js` — renderer, lighting, chase camera, controls, UI, and game lifecycle.
- `src/effects.js` — pooled dust, sparks, impact fragments, and tire marks.
- `src/audio.js` — locally synthesized engine, gravel, impact, and countdown sound.
- `public/progress.html` — auto-refreshing workshop status.
- `QUALITY.md` — independent review criteria and verification record.

This is an original browser-scale game inspired by the demolition-derby genre. The simulation is planar rigid-body dynamics with visual body deformation, rather than a commercial soft-body vehicle simulator. No Wreckfest or FlatOut assets are used. All game geometry, material textures, and audio are generated locally; the interface requests Barlow fonts from Google Fonts and has local fallbacks.

**Verification:** 32 automated regression tests pass. Independent browser reviewers exercised keyboard and emulated touch input, collisions, boost, pause/resume, camera switching, restart, and a full player-wreck match. The final production recheck measured real-time simulation with approximately 11 fps on CPU-only llvmpipe rendering and zero console errors. Review findings and follow-up fixes are documented in `QUALITY.md`. Browser validation used CPU software rendering; smooth hardware-accelerated performance and equivalence to the commercial references have not been established.

The renderer automatically selects a reduced-detail, lower-resolution gameplay path for detected software renderers. Interface text stays at native resolution. The standard hardware path retains detailed materials, anti-aliasing and dynamic shadows. Read-only runtime diagnostics are available through `window.__WRECKAGE__.getSnapshot()` in the browser console.

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/VibeFin/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/VibeFin/PlayGround)

- 🎮 [Open the project](https://omgithub.com/VibeFin/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=VibeFin%2FPlayGround).
- 💻 [Explore the source](https://github.com/VibeFin/PlayGround).
- 🛠️ [Check build runs](https://github.com/VibeFin/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/VibeFin/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/VibeFin).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->
