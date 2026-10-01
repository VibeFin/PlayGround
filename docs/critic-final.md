# Independent final integration critique — Tribes: Frontier

**Verdict: PASS — practical playable real-3D Tribes-style movement and CTF prototype.**

Reviewed the live artifact at `http://localhost:3002` on 2026-10-01 as a fresh-context final integration critic. Read `docs/quality-bar.md`, the movement FAIL, and the combat PASS with its objective defects. No application code changed. This verdict uses independent browser measurements and inspected screenshot pixels, rather than accepting the lead's performance claims. The bar is the focused playable prototype, not commercial AAA fidelity.

## Browser and method

- Opened exactly `playwright-cli -s=final-critic open http://localhost:3002`, with the supplied wrapper and no explicit configuration. Used one browser/session and one tab throughout.
- Desktop viewport **1440×900**; responsive viewport **390×844**. Actual WebGL renderer query returned **ANGLE / Mesa Vulkan / llvmpipe (LLVM 20.1.2)**: CPU software rendering, not hardware acceleration. The measured desktop gameplay runs used renderer pixel ratio **0.6**.
- Clicked **DEPLOY TO FROSTLINE** normally before any gameplay setup hooks. Deployment obtained pointer lock. Used Playwright's actual keyboard/mouse input for W, Shift, Space, arrow-look, LMB, Escape, and R; clicked Resume, Restart, Field Manual, and Play Again normally.
- Normal-input performance tests left `testMode=false` and did not teleport, alter the clock, or inject movement. RAF timestamps measured rendering cadence; `game.state.timeLeft` measured simulation elapsed time. Small ratios above 100% reflect the RAF/clock sample boundary, roughly one frame, not a meaningful speedup.
- **Controlled tests are explicitly artificial:** blocked capture, recovery, and ally carrier used `testMode=true`, teleports, bot isolation with `launchDelay/cooldown=999`, a lethal bot damage hook, and `step(1/60)` loops. Match-end setup shortened the clock and set a score before restoring automatic simulation. These are state-transition tests, not unassisted wins.

## 1. Normal movement, responsiveness, and energy — PASS

Exact primary reproduction: deploy normally at 1440×900, press normal **R** to reset, then hold **W + Shift + Space + ArrowRight + LMB** together for six wall-clock seconds. Sample RAF and match clock during the hold, then release every key and mouse button.

| Independent test | Measured result |
| --- | --- |
| Combined six-second movement/jet/fire/look | **155 frames / 6.0119 wall seconds = 25.782 FPS**. Median frame interval **33.4 ms**, p95 **50.1 ms**. Match consumed **6.0330 game seconds**, ratio **100.35%**. Active throughout; held inputs confirmed. |
| Actual combined-input response | Player moved from **(12,45.2,210)** to **(51.526,217.137,205.769)**. Yaw **0 → −7.855 radians** under arrow-look. Energy **100 → 0**; peak **5 concurrent projectiles**. After continued depleted jet hold, vertical velocity was **−33.715 m/s**: jets did not provide endless lift. |
| Separate normal W + Shift, six seconds | **149 frames / 6.0125 seconds = 24.782 FPS**; **6.0831 game seconds**, ratio **101.17%**. Grounded downhill route progressed from blue spawn to **(17.240,23.201,−54.729)**. Horizontal speed at approximately 1/2/3/4/5/6 seconds: **24.98 / 37.15 / 47.93 / 55.53 / 62.74 / 67.46 m/s**. |
| Ski coast after releasing propulsion | Released **W**, retained **Shift** for one second: speed **67.46 → 56.56 m/s**, while traveling to **(12.316,31.655,−114.714)** uphill. Forward input was zero. Momentum persists without propulsion; this changing slope is not a flat-friction benchmark. |
| Normal energy burn/recharge | Reset with normal R, held Space **4.2 s**: energy **0**, y **222.557**. Released Space for **6.2 s**: energy **100**, landed at spawn y **45.2**, grounded with vertical velocity **0**. No physics stepping/teleport used. |

Both measured runs comfortably clear the requested **90% time-consumption** and approximately **18 FPS** rejection thresholds in this single software browser. The prior 15%-speed, 3-FPS failure is resolved. Visible motion and view rotation respond continuously, with ordinary low-FPS software-rendering judder rather than severe slow motion.

Inspected the initial desktop screenshot, deployed views, and saved normal-play screenshot pixels. The arena is a genuine perspective 3D landscape: near pylons/base platforms, opposing red/cyan landmarks, snowy hills, rocks, layered mountain silhouettes, and a first-person launcher. Moving downhill and ascending changed depth, landmark scale, and camera position. This is neither a static backdrop nor a blank canvas.

## 2. Corrected objective guidance and capture gate — PASS

Exact controlled blocked-capture reproduction:

1. After ordinary deployment, freeze automatic simulation with `gameApp.testMode=true`; restart gameplay/reset player and clear movement/fire input.
2. Isolate bots at `(500, terrainHeight(500,500)+2.2, 500)` with `launchDelay=cooldown=999`.
3. Put player at red flag plus 2.2 m and `red-0` at blue flag plus 2.2 m; advance **one 1/60 s step**. Real pickup logic assigns red carrier **`player`** and blue carrier **`red-0`**.
4. Move red-0 to `(100, terrainHeight(100,0)+2.2, 0)`. Move player to blue base `(0, terrainHeight(0,230)+2.2, 230)`, zero velocity, yaw 0, pitch −0.05. Advance **60 × 1/60 s**.

Observed: blue score remained **0**, red still carried by player, blue still carried by red-0. Objective visibly says **“RECOVER BLUE FLAG TO UNLOCK CAPTURE.”** Cyan marker says **“RECOVER FLAG / 251 M”** and points at the stolen blue flag; independently calculated distance **251.400 m**. Red marker is hidden while the player carries red. The requested final screenshot preserves this **still-blocked** state.

Follow-up controlled recovery: lethal `damageBot(red-0,200,'player')` dropped blue; player touching the drop returned blue home. Objective changed to **“FLAG SECURED. RETURN TO BLUE BASE.”**, marker **RETURN HERE** now pointed toward the home base. Player touching blue base then scored **1**, with red reset home.

Separate ally-carrier setup: restart/isolate bots, teleport **blue-0** onto red flag and step, then move the carrier toward midfield. Actual red carrier **blue-0**, blue flag home. Visible objective **“ESCORT YOUR CARRIER. DEFEND BLUE BASE.”** and red marker **“ESCORT CARRIER / 228 M”**, with **“Ally 1 took the Red flag!”** notification. Inspected the rendered ally-carrier screenshot as well as the DOM text. Both previously misleading objective cases are repaired.

Normal active play also exhibited real opposition: armor fell to **37**, flags changed state, and red scored **0–1** without score/flag manipulation during the lifecycle sequence. Normal LMB produced rendered cyan traveling discs. Detailed projectile/splash/respawn acceptance remains documented in the separate combat critique; this final review revalidated the integration and changed guidance rather than claiming to repeat every combat test.

## 3. Match lifecycle, manual, and cleared input — PASS

- **Before deployment:** at responsive reload, time stayed **480**, player stayed **(12,45.2,210)**, active false; confirmed again after a 1.1-second wait.
- **Escape pause with held movement/fire:** pressed Escape while W, Shift, and LMB were held, then released them. Time stayed exactly **454.2344** and position exactly **(12.2784,45.2,207.4824)** across a **1.3-second** paused interval. Active false; forward/right/look zero and ski/jet/fire false. Visible pause panel offered **RESUME MATCH**.
- **Normal Resume click:** active true, pointer lock restored, clock advanced, and all movement/fire inputs remained cleared. No stuck W, ski, jet, look, or firing behavior observed.
- **Field Manual:** desktop and 390×844 actual screenshot pixels show readable mouse/arrow-look, WASD, skiing, jets/recharge, projectile/splash, capture-home requirement, first-to-3, Escape and R instructions. In the manual, time/position stayed exactly unchanged over **1.1 s**, active false. Close worked.
- **Normal Restart button:** reset score **0–0**, time **480**, spawn **(12,45.2,210)**, health/energy **100**, both flags home, active true, all inputs cleared.
- **Controlled finite-match endpoint:** set `timeLeft=.12`, blue score 1, restore `testMode=false`. Automatic frames displayed **MATCH COMPLETE / FRONTIER SECURED / 1–0 / PLAY AGAIN**; ended true, active false, time zero. Another **1.1 s** did not move player or clock.
- **Normal Play Again click:** ended false, active true, pointer lock restored, score **0–0**, both flags home, health/energy **100**, timer reset then naturally advanced (sample **479.1834**).
- Browser console queries returned **zero runtime errors**. Initial software WebGL warnings did not block play.

## 4. Live progress page and reference transparency — PASS

Navigated the same browser tab to **`http://localhost:3002/progress.html`**, inspected the full-page screenshot pixels, DOM, images and network responses. The page renders the quality pieces, prior failure, disclosed controlled tests, normal-input evidence, and reference comparison. At review time it correctly labels final integration **IN REVIEW** and movement **RETESTING**, rather than pretending this verdict already existed.

- Initial JSON and periodic requests returned **200**. Observed successive `progress.json?t=...` requests separated by **15,000 ms** and independently captured a successful refresh in a **16-second** observation window.
- All four evidence images loaded, decoded, and returned **200**, with no 404: `arena.png` **1440×900**, `live-flight.png` **1440×900**, `critic-movement.png` **1050×793**, `reference-skiing.png` **847×501**.
- Captions distinguish normal play from the controlled elevated viewpoint. The reference frame is attributed to the official tutorial/Prophecy Games; source links are visible. The page explicitly discloses that IGN playback required sign-in and that prototype art/class/weapon scope is simpler.
- Independently inspected the actual official reference screenshot pixels: first-person disc launcher, downhill corridor, ski indicator, health/energy and speed **147**. The prototype preserves the recognizable movement/jet/projectile/CTF loop in original simpler alpine visuals; it does not match the commercial game's detailed art.
- Progress page console: **zero errors**.

## 5. Responsive layout — PASS with modest caveat

At **390×844**, inspected actual initial, deployed, and Field Manual screenshots. No horizontal document overflow. Deploy and manual buttons remain reachable; score/time, armor/energy, speed, objective and keyboard control strip remain visible. The manual provides comfortably readable explanations. Radar and toast crowd the upper area somewhat, and footer key labels are very small, but core desktop-oriented gameplay information is not blocked.

This was a **viewport resize, not touch-device emulation**: `(pointer:coarse)` measured **false**. No claim is made that coarse-pointer touch buttons or touch gestures were tested. Desktop mouse/keyboard is the stated primary mode.

## Largest remaining gap — non-blocking HUD contrast

**Reproduction:** use the controlled blocked-capture steps above, face midfield from blue base, and inspect the cyan **RECOVER FLAG / 251 M** label over bright snow. Its small pale cyan/white text blends into the snow more than the dark-backed objective box. The same contrast weakness appears in normal airborne play, where some small white HUD labels sit over a light horizon; phone-width footer labels are also tiny. The diamond, objective box and distances are still usable, so this does not overturn the practical-playability pass. A stronger text backing/outline would be the most meaningful next polish improvement. Software-rendered geometry remains visibly jagged and motion is approximately 25 FPS; both are acceptable at the specified prototype bar.

## Saved evidence and cleanup

- **[`public/screenshots/final-playtest.png`](../public/screenshots/final-playtest.png)** — 1440×900 actual rendered **controlled, simulation-frozen blocked-capture** setup described above. Player carries red at blue base, own blue is stolen, score remains 0–0, recovered guidance is visible. This is not a naturally achieved keyboard match state.
- **[`public/screenshots/final-normal-play.png`](../public/screenshots/final-normal-play.png)** — 1440×900 actual **normal-input play**, without teleports, clock/score setup, or testMode: Deploy, W+Shift downhill for 3 seconds, add Space for 1.8 seconds, then LMB. Pixels show airborne perspective, first-person launcher, a cyan disc, active bots, speed **236 km/h**, and partially spent jet energy. Post-screenshot state sampling occurred later, so its values are not asserted to match every captured HUD digit.
- **[`public/screenshots/final-responsive.png`](../public/screenshots/final-responsive.png)** — 390×844 deployed layout, normal deployment, no deterministic setup.
- Session **`final-critic` closed** after review. `playwright-cli list` returned **`(no browsers)`**.

**Final disposition:** PASS. Independent software-browser retesting resolves the prior slow-time failure; corrected objective priority/markers, lifecycle, active-state input handling, actual 3D visuals, responsive readability and live evidence page meet the requested integration bar.
