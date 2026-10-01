# Independent arena / movement critique

**Verdict: FAIL — practical software-browser movement is severely slowed.**

Reviewed the live artifact at `http://localhost:3002` on 2026-10-01 using `playwright-cli -s=movement-critic open http://localhost:3002`, the supplied headed Chromium / SwiftShader wrapper, and a 1050×793 viewport (device DPR 1). No application code was changed. Read `docs/quality-bar.md`, inspected the actual pixels of `public/screenshots/reference-skiing.png`, and read the official [how-to guide](https://www.tribes3rivals.com/how-to-play). Combat was outside this review.

## Largest meaningful failure and exact reproduction

1. Open the URL with the command above and click **Deploy to Frostline**.
2. Leave `gameApp.testMode=false`. Hold normal keyboard **W + Shift + Space** for six wall-clock seconds, then release all three.
3. Measure `requestAnimationFrame` intervals and `gameApp.game.state.timeLeft`, alongside the actual player position, velocity, and energy. Do not use deterministic stepping for this performance test.

Latest live-build repeat: **18 rendered frames over 6.021 seconds = 2.99 FPS**, median interval **333.4 ms**, p95 **700 ms**. Only **0.900 simulation seconds** elapsed: roughly **15% of wall time**. Player moved from `(12,45.2,210)` to `(12,59.0975,205.9274)`, velocity became `(0,30.6,-8.9511)` m/s, and energy fell from 100 to 73. Input and `active=true` confirmed the keys were held and the match was running. This is visibly stuttery, slow-motion traversal, not a fluid downhill/jet loop.

An earlier six-second normal-key run measured 3.49 FPS and 1.05 simulation seconds; a render-only six-second sample measured 3.86 FPS. The builder's live polish reloaded the page during review, so the latest normal-input repeat, core physics tests, traversal, and final screenshot were repeated afterward. Latest renderer was already at pixel ratio **0.4** (420×284 drawing buffer for a 1050×711 arena) with **shadows disabled**. The slowdown therefore remained after that fallback. These are observations of this software-rendered session on the shared runner, not claims about hardware-GPU performance.

Secondary source inspection identifies `src/main.js`'s `frame()` clamping elapsed time to `Math.min(.05, ...)` before both simulation and rendering. At three frames/second this discards about 85% of elapsed game time, matching the measured loss. Builder should address practical rendering and elapsed-time handling together, then repeat normal-key wall-clock testing. Deterministic physics passing alone does not resolve this failure.

## Movement measurements — pass

Controlled tests explicitly used `testMode=true`, resets/teleports or injected initial velocity, and actual `world.update(1/120,input)` calls. They measured `player.velocity` and terrain-relative altitude, not just HUD text.

| Check | Observed latest-build result |
| --- | --- |
| Jets from reset spawn | After 1 s: +17.142 m altitude, vertical velocity 34 m/s, energy 100→70. After 4 s: +171.629 m altitude and energy 0. Continued hold cannot sustain lift; earlier full curve peaked and fell. |
| Recharge | After releasing jet for 6 s following the four-second burn: landed at terrain+2.2, energy 97; earlier longer release reached 100. |
| Downhill from rest, no directional propulsion | Teleported to `x=-400,z=80`, eye at terrain+2.2, zero velocity, grounded; ski-only horizontal speed at 1/2/3/4 s: **15.325 / 31.268 / 42.035 / 43.083 m/s**. |
| Low friction | Controlled flat base setup `(x=0,z=230)`, initial vx=25 m/s. After 0.5 s with no directional input: skiing **24.652 m/s** (98.6% retained), walking **3.383 m/s**. |
| Air momentum | Controlled airborne setup at `(0,terrainHeight(0,0)+180,0)`, velocity `(30,0,-40)`. After 2 s without input: `(29.289,-68,-39.051)`, horizontal speed **50→48.814 m/s**, retaining 97.6%. |

## Whole-arena traversal and ground clearance — pass

Reset to blue spawn, then used continuous waypoint-steered forward + skiing and conditional jets through `world.update(1/120,input)`. This was controlled input steering, **not normal keyboard play**; there were **no intermediate teleports**. Successfully reached within 12 m of all six goals:

- Red base `(0,-230)` in 9.617 simulation seconds.
- Northeast extent `(550,-550)` in another 11.658 s.
- Northwest extent `(-550,-550)` in another 17.008 s.
- Southwest extent `(-550,550)` in another 36.483 s.
- Southeast extent `(550,550)` in another 42.717 s.
- Blue base `(0,230)` in another 12.400 s.

Maximum horizontal speed was **114.224 m/s**. Minimum eye clearance over sampled terrain was **2.200 m** throughout; no terrain penetration occurred on this route. This establishes traversability of both bases and the broad hills perimeter under actual physics, rather than proving traversal is comfortable at the observed live FPS.

## Visual arena and controls — pass at the stated stylized bar

Inspected actual deployment and elevated-hillside screenshot pixels. This is a perspective 3D arena with a first-person launcher, foreground towers, opposing cyan/red base landmarks, overlapping snowy hills, rocks, and layered mountain silhouettes. Foreground/background scale and the continuously changing camera establish real depth. The alpine styling and readable tactical HUD satisfy the original small-prototype visual ambition. Snow surfaces are sparse and the 0.4 render scale is visibly jagged, but commercial-reference art fidelity is not the failure criterion.

Normal Deploy, Escape pause, Resume Match, and visible restart-button interaction worked. During a 1.2 s pause, player position and match time stayed unchanged. Resume restored `active=true`; restart reset spawn, energy to 100, and time to 480. Restart is a real button with `title="Restart match"`; the visible controls advertise movement, skiing, jets, and Escape. Browser console showed zero runtime errors; warnings were WebGL ReadPixels stalls.

## Evidence

- `public/screenshots/critic-movement.png`: actual latest-build screenshot, independently inspected. **Controlled screenshot setup:** teleported to `(-250, terrainHeight(-250,80)+85, 80)`, facing east with pitch -0.2, simulation frozen and movement input released. It shows both bases and layered arena depth; it is not a claim of a naturally reached keyboard viewpoint.
- `public/screenshots/reference-skiing.png`: inspected official tutorial reference frame.
- Session `movement-critic` closed after evidence capture.

**Disposition:** physical movement, traversal, and stylized visual arena pass; overall arena/movement experience fails until normal-input software-browser play stops losing most elapsed simulation time and becomes practically responsive.
