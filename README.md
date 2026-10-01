# PlayGround

## Warcraft 3D — Ashenfront

A playable Warcraft III-inspired browser skirmish, built with Three.js. Command the Azure Alliance, develop a working gold/lumber economy, and destroy the Crimson Stronghold.

```sh
npm install
npm run dev
```

Open **http://localhost:3002**. The game starts directly in the battlefield. Open **/progress.html** for build reviews, reference comparisons, screenshots and playtest evidence.

### Controls

| Action | Control |
| --- | --- |
| Select units | Left-click or drag a box; Shift adds/removes |
| Move / gather / attack target | Right-click ground / gold mine or tree / enemy |
| Attack-move | A, then click the battlefield |
| Move / stop / gather | M / S / G |
| Build with a selected Peasant | B barracks, F farm, T tower; click to place |
| Select the army | Ctrl+A or the Army button |
| Focus/select the hero | Space |
| Hero ability | Q |
| Pan / zoom | Arrow keys, middle-button drag / mouse wheel |
| Return home | H |
| Control groups | Ctrl+1–3 saves, 1–3 recalls |
| Cancel / help | Esc / F1 |
| Mute / unmute synthesized game cues | N |

The command card also exposes the actions as clickable buttons. Farms increase supply, the Town Hall trains Peasants, and Barracks train Footmen and Archers. Workers must physically carry resources home. Enemy raids escalate over time; protect your Town Hall while building an army. The skirmish ends when either headquarters falls and can be restarted from the HUD.

### Verification

```sh
npm test
npm run build
```

Browser evidence and independent builder/critic reviews are documented in `docs/`. This environment uses Chromium with SwiftShader CPU software rendering. Original procedural models are used; gameplay references are attributed on the progress page.

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Remixed using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/VibeFin/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/VibeFin/PlayGround)

- 🎮 [Open the project](https://omgithub.com/VibeFin/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=VibeFin%2FPlayGround).
- 💻 [Explore the source](https://github.com/VibeFin/PlayGround).
- 🛠️ [Check build runs](https://github.com/VibeFin/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/VibeFin/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/VibeFin).
- 🌍 [Create with OMGithub](https://omgithub.com).
- 🧬 [Explore the remix source](https://github.com/VibeFin/PlayGround).
<!-- omgithub:readme:end -->
