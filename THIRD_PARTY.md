# Third-party components and assets

Ashes of Aether ships exactly one third-party component. Everything else — code, world layouts,
textures, models, animation, sound and text — is original to this project.

## Three.js

| | |
|---|---|
| Version | r186 |
| Files | `web/vendor/three/three.module.js`, `web/vendor/three/three.core.js`, `web/vendor/three/addons/BufferGeometryUtils.js` |
| Licence | MIT — full text in `web/vendor/three/LICENSE` |
| Copyright | 2010–2026 Three.js Authors |
| Source | <https://github.com/mrdoob/three.js> (unmodified release builds) |
| Used for | WebGL rendering, scene graph, maths, geometry merging |

The files are vendored (not fetched from a CDN) so the game runs offline, and are loaded through the
import map in `web/index.html`. To upgrade, replace the three files above with the same files from a
newer release and keep `LICENSE` in sync.

## Original assets (no third-party licence applies)

| Kind | Where it comes from |
|---|---|
| Textures | Painted at runtime onto canvases by `web/js/world3d/textures.js`. |
| Environment models | Built from primitive geometry by `web/js/world3d/prefabs.js` and `room.js`. |
| Characters and enemies | Procedural low-poly rigs in `characters.js` / `enemies3d.js`, animated in code. |
| Sound | Synthesised at runtime with the WebAudio API in `audio.js`; no audio files ship. |
| Fonts | The page uses the visitor's installed serif fonts (Georgia etc.); no font files ship. |
| World layouts | Hand-authored in `web/world/*.json` for this game. |

## Adding assets later

Any new file under `web/` that was not created for this project must be added to this document with
its licence, author, source URL and the files it covers, and its licence text must ship next to it.
Only permissively licensed material (MIT, BSD, Apache-2.0, CC0, CC-BY with attribution recorded here)
is acceptable; assets extracted from other games are not.
