# Tribes: Frontier — acceptance bar

## Reference
- [IGN: Tribes 3 Rivals — 7 minutes of official gameplay](https://www.youtube.com/watch?v=P9bvc1RyeME)
- [Official how-to-play: skiing, jets, CTF](https://www.tribes3rivals.com/how-to-play)

The recognizable loop is downhill acceleration → low-friction skiing → energy-limited jetpack flight → airborne projectile engagements → flag grab and high-speed return. This build is an original small browser interpretation of that loop.

## Independently judgeable pieces
1. **Arena + movement**: real perspective 3D terrain, traversable opposing bases, visible depth/landmarks, first-person view; downhill skiing increases speed, momentum survives release/flight, jetpack gains altitude and consumes/recharges energy. Critic must inspect the running artifact and exercise the physics.
2. **Combat + CTF**: visible traveling explosive discs, meaningful health/damage, active opposing bots and allied teammates, flags can be taken/dropped/returned/captured, own flag must be home to score; death/respawn, finite match and working restart. Critic must inspect the running artifact and validate actual state transitions.
3. **Integrated experience**: immersive designed HUD with objective markers, health/energy/speed/score/time, visible controls, start/pause/restart; no blocking runtime errors. Screenshots of actual rendered arena and playtest evidence on a live progress page.

## Reference inspection notes
The official `HowToSki` gameplay video is publicly playable on the how-to-play page. Its 5-second frame shows downhill skiing at a speed reading of 147, a first-person disc launcher, a ski-engaged label and visible health/energy. Inspected the full 7.77-second clip in a real Chromium browser and saved an attributed frame at `public/screenshots/reference-skiing.png`. The IGN seven-minute gameplay reference was located; direct YouTube playback asked for sign-in, so the official playable clip and official guide are the inspected reference sources.

The prototype must match the reference's *observable loop*: speed increases on a slope, the camera travels through a volumetric landscape, the jetpack has an energy tradeoff, and the disc travels before impact. Visual ambition is an original stylized alpine arena with clear team bases and a readable tactical HUD.

## Critic protocol
- Fresh-context critics are separate from the builder for each piece.
- Inspect actual screenshot pixels; reject blank canvas, static background, or controls without functioning gameplay.
- Use normal input at least once; use deterministic browser hooks for targeted hard-to-reach transitions, explicitly disclosing setup.
- Record measured observations and largest meaningful failure rather than relying on source-code review alone.
- Send failure back to the builder and repeat browser verification after the fix. Pass means the acceptance bar above is met, not fidelity to a full commercial title.

## Shared implementation contract
`src/world.js` exports `createWorld(canvas)`. It returns `{scene,camera,renderer,player,terrainHeight,update,render,resize,resetPlayer,bases}`. Uses Three.js. Arena is x/z centered, bounds ±650, blue base z=230, red base z=-230. `bases.blue/red` are THREE.Vector3 ground positions. Player properties: `position`, `velocity` (Vector3), `health` (100), `energy` (100), `yaw`, `pitch`, `grounded`. Position is eye/upper body at terrain + 2.2. Starts blue base facing -z (yaw=0).

`world.update(dt,input)` consumes `{forward,right,ski,jet,jump,lookX,lookY}`, look deltas in pixels; moves camera with player. `resetPlayer(position?)` resets player. `render(dt)` renders. World terrainHeight includes flattened base areas.

`src/gameplay.js` exports `createGame(world,onEvent)`. Returns `{state,update(dt,input),restart()}`. `input.fire` fires discs, `input.grenade` is optional. Gameplay owns bots, flags, projectiles, health, respawn and match. State `{blueScore,redScore,timeLeft,playerKills,ended,respawnIn,flags:{blue,red},bots,projectiles}`; flags have `{status:'home'|'carried'|'dropped',position,carrier}`. Call `onEvent({type,text,...})` for meaningful events. Expose `state.ammo` and `state.weaponCooldown` if useful. First to 3 or 8-minute match. Attack bots must actually seek flags and fight.

Lead owns app/input/UI/styles/progress page. Builders own separate modules and should not edit each other's files. Critics are fresh-context independent agents, browser sessions named per critic. Test API `window.gameApp = {world,game,input,start,restart,step,testMode}`. `testMode=true` freezes automatic simulation for repeatable checks; `step(dt)` drives actual world and game updates. The game remains rendered. Any test setup/teleports must be labeled in evidence.
