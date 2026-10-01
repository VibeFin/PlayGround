# WRECKAGE — review bar

This is an original, procedural Three.js browser derby. Wreckfest and FlatOut are references for readable chaos, physical weight, and satisfying consequences, not a verified quality equivalence.

## Independently judgeable pieces

1. **Acceleration and braking:** builds speed progressively; braking reverses only after shedding momentum.
2. **Steering and grip:** intuitive at low and high speeds; no teleportation; handbrake changes handling.
3. **Contact resolution:** cars and arena boundaries separate reliably; strong impacts transfer momentum.
4. **Damage:** closing speed and impact region matter; visible damage progresses; wrecks stay wrecked.
5. **Nitro:** useful speed advantage, finite reserve, predictable regeneration.
6. **AI targeting:** rivals fight each other and the player, keep moving, recover from blocked paths.
7. **Match rules:** ready, countdown, live, pause, victory/defeat, and clean restart are observable.
8. **Vehicle identity:** readable silhouette, cage, wheels, racing numbers, worn materials.
9. **Arena:** believable scale, barrier and track readability, atmospheric depth, stadium details.
10. **Chase camera:** stable orientation, anticipates movement, changes view, keeps car visible.
11. **Impact feedback:** contact produces synchronized sound, dust/debris, restrained shake, score feedback.
12. **Sound:** gesture-initiated, engine responds to speed, mute works, pause silences engine.
13. **HUD:** health, boost, time, score, speed, and opponents remain readable.
14. **Onboarding and input:** actual control guide; keyboard and touch; no stuck input after focus loss.
15. **Presentation:** cohesive typography, contrast, responsive composition, purposeful menu.
16. **Technical reliability:** production build, finite-state simulation tests, no runtime errors, actual geometry renders.

## Review protocol

- Reviewers open the running game independently and inspect screenshots and actual input-driven behavior.
- Reviewers receive the address and bar, not a builder's conclusions.
- Record concrete observations and the single largest current gap; address critical findings and re-test.
- A fresh integration reviewer checks the full flow after major changes.
- Do not call a screenshot inspection a playtest, or CPU SwiftShader rendering hardware acceleration.
- No playable reference builds are supplied; no actual blind side-by-side superiority result can be asserted.

## Evidence

### First independent wave

Two fresh-context agents inspected the running production build, rather than source or builder summaries. They drove with keyboard and emulated multitouch, opened controls, switched camera, paused/resumed, restarted, and inspected actual captured images at 1440×900, 960×600, and 390×844.

Their verdict was **below Wreckfest/FlatOut quality**, with these actionable findings:

| Finding | Implemented response |
| --- | --- |
| Simulation ran roughly eight times slower than wall time on the CPU renderer | Separate bounded real-time accumulation from visual interpolation; fixed 60 Hz simulation with internal 120 Hz substeps |
| Mobile objective overlapped score | Dedicated mobile HUD rows; smaller objective; peripheral minimap |
| Foreground fence obstructed chase view | Keep chase camera inside arena bounds and raise it when compressed against a boundary |
| Missing mobile help and camera control | Mobile driver briefing, touch camera button, GAS/REV labels, touch-specific nitro hint |
| Damage communicated primarily through UI | Correct health units; stronger local crumpling; transient damped suspension; four rival body profiles |
| Minimap overlaid nearby vehicle contact | Move radar to the left edge on desktop and upper-right on portrait screens |
| Generic hit messages obscured outcome | Separate incoming armor loss from earned destruction points and combos |
| 960×600 menu copy crowded cards | Short-viewport typography and spacing adjustments |

An additional simulation balance check found a passive player winning at 61 seconds with 60.6 HP. AI now adds bounded anti-camping pressure and endgame pursuit. Regression runs demonstrate an idle loss at 57.47 seconds and an active-driving win at 81.02 seconds with 49.9 HP and one takedown. All original 16 physics regressions plus three new balance regressions pass.

### Integration measurements

- Second-wave browser run measured **5.4667 simulation seconds over 5.5266 wall-clock seconds**, using actual keyboard input.
- Countdown entered gameplay in **3.56 wall-clock seconds** in a separate run.
- Earned **201 destruction points** through actual car contact in the captured driving run.
- Software rendering remains substantially below a smooth gaming frame rate. The browser launch configuration requests SwiftShader, but the independently queried actual renderer was **ANGLE/Mesa llvmpipe**. These are CPU-rendered tests; hardware-GPU performance has not been measured.
- Software quality tier uses lower-detail peripheral geometry, Lambert-lit arena/rivals, spatial crowd batches, cached static shadows, and contact patches beneath vehicles. The player keeps detailed wheels and materials.

### Evidence locations

Review reports and screenshots were produced under `/tmp/opencode/` during this session:

- `critic-play-notes.md` and `critic-play-*.png`
- `critic-visual-report.md` and `critic-visual-*.png`
- `wreckage-menu-wave2.png`, `wreckage-play-wave2.png`

### Fresh whole-game integration wave

A third, fresh-context reviewer completed natural desktop and touch losses and restarted both through the results UI. Desktop results were **823 destruction / 0 wrecks / 50 seconds**; mobile results were **156 / 0 / 35 seconds**. All ten cars, health, boost, time and score reset correctly. Actual keyboard and simultaneous touch inputs exercised nitro, steering, reverse, handbrake, camera, pause, help and restart. No mobile HUD/control overlap was observed at 390×844. Both camera views kept the car visible in the sampled near-barrier situations. Simulation state froze exactly while paused.

The reviewer still rejected practical playability on the tested CPU runtime: a sustained desktop interval delivered **0.89 fps** and only **0.714× wall-time progression**, despite better short measurements. Portrait reached **5.54 fps** with approximately real-time simulation. Those results supersede any suggestion that the short second-wave timing sample established sustained performance.

The follow-up changes target those specific failures:

- Detect software rendering before renderer creation and disable expensive multisample anti-aliasing there.
- Cap the in-game software framebuffer at roughly 150,000 pixels while keeping HTML/UI at native resolution; the menu gets a higher-resolution overview, and hardware settings retain anti-aliasing and higher resolution.
- Allow bounded fixed-step catch-up across longer stalls without dropping time at the former one-second cutoff.
- Provide touch-specific briefing text and explicit simultaneous-control instructions.
- Enlarge mobile header controls to 44×44 pixels and freeze camera easing during pause.
- Correct minimap handedness; fade particles by alpha; limit audio peaks and disconnect finished one-shot audio nodes.

A focused sustained-drive recheck is recorded below after execution.

### Compositor profiling and correction

The first focused recheck confirmed **0.9952× simulation timing**, corrected touch onboarding, 44-pixel header targets, and exact paused camera/state freeze. It still measured only **0.9965 fps** across 38.13 seconds, even with anti-aliasing disabled and a 489×306 drawing buffer. Lower resolution alone did not solve responsiveness.

Frame-stage profiling then showed physics and vehicle updates typically taking only a few milliseconds. Hiding arena, car, or particle geometry did not restore throughput. Disabling expensive CSS compositor effects restored about **12.8 fps** in a 22-second diagnostic run. The implemented fix replaces the fullscreen blurred impact shadow with a radial gradient, bakes grain into a bitmap, removes opponent-label filter layers, and disables backdrop blur/grain in the CPU tier. Temporary layer-isolation controls were removed; read-only CPU timings remain in diagnostics.

With all actual game geometry and effects enabled, the builder's follow-up drive measured **33.25 simulation seconds over 33.2619 wall seconds**, averaging **10.97 fps** at 1280×800. This is a substantial improvement over the one-fps failure, but it is still below a smooth gaming frame rate.

### Final independent production recheck

A fourth fresh-context reviewer checked the rebuilt production preview without reading source, prior reports, or review criteria. Using real keyboard input at 1280×800, it measured **34.17 simulation seconds over 34.16 wall seconds**, with **375 rendered frames for approximately 11.0 fps**. The drive included steering and ended in a player wreck at 65.79 seconds with five cars alive, proving contact. Pause froze the simulation exactly, restart returned cleanly to live play, and the browser reported **zero console errors** with only llvmpipe `ReadPixels` warnings. The reviewer judged the loop playable end-to-end, while retaining visual fluidity on CPU-only rendering as the largest remaining gap. No hardware-GPU or reference-game comparison was made.

### Automated verification

`npm test` currently passes **32 tests**: 19 simulation regressions and 13 vehicle regressions. Vehicle coverage includes the corrected health scale, four regional deformation paths, exact reset restoration, cross-car isolation, damped suspension response at two update rates, variant silhouettes, finite malformed-input handling, grounded contact shadows, and reduced-geometry software rivals preserving damage/fire behavior.

`npm run build` produces the production site successfully. Vite emits an advisory about the Three.js vendor chunk exceeding 500 kB; the vendor chunk is approximately 181 kB gzip. The application code is split into its own much smaller chunk.

### Scope limits

This is a procedural browser-scale game, with planar rigid-body dynamics and regional visual deformation. It does not implement commercial soft-body destruction, vehicle rollover physics, a campaign, multiplayer, licensed car assets, or a verified audio/handling comparison with the reference games. Synthesized sound is implemented; browser tests check its controls, not subjective audio fidelity. No blind side-by-side superiority result has been established.
