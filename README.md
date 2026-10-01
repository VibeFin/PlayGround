# PlayGround

## Wreckyard — 3D demolition derby

A playable browser demolition derby inspired by the full-contact racing of Wreckfest and FlatOut. Choose one of three battered muscle cars, pick an arena atmosphere, and take on seven AI drivers in a three-minute last-car-standing match.

### Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Use `npm run build` for the production build and `npm run preview` to preview it.

### Controls

| Key | Action |
| --- | --- |
| W / ↑ | Accelerate |
| S / ↓ | Brake and reverse |
| A / D or ← / → | Steer |
| Space | Handbrake |
| Shift | Recharging nitro boost |
| F (hold) | Fire the minigun |
| E | Launch a rocket |
| R | Unstick and reorient your car |
| Esc | Pause |
| Enter | Start a derby from the lobby |

Touch driving controls are available on small screens. Enable synthesized engine and impact audio with the speaker button.

### Armed derby

Every car carries a hood-mounted minigun and twin rocket pods. Both fire forward, so steer to aim. Hold **F** for rapid-fire tracers; the minigun overheats at 100% and resumes after cooling to 35%. Release the trigger to cool it sooner. Press or hold **E** to launch rockets with direct-hit and nearby splash damage. The four-round rack automatically reloads in eight seconds; launches have a 1.2-second cooldown. Your own rockets do not damage your car.

The weapon HUD shows minigun heat, remaining rockets, and reload progress. Hold either on-screen weapon button with a mouse or touch to fire. AI rivals shoot when their target is lined up, and weapon takedowns count toward your match results and leaderboard.

Takedowns trigger a car-sized fireball, an expanding shockwave, flying body panels and a detached wheel, a bass-heavy explosion, and a large elimination banner. Destroyed cars remain as burning, smoking wrecks for 30 seconds. The camera briefly follows your victim, and match results wait for the destruction payoff. A rival you damage who crashes out within five seconds also counts as your takedown.

Collisions damage and deform the cars. Eliminate the other drivers to win; if time runs out, the surviving car with the highest percentage of remaining integrity wins. Results are saved to a local leaderboard on your device.

Built with Three.js and Vite. Cars, arena geometry, dirt textures, decals, and visual effects are generated in code; no external game assets are required.

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
