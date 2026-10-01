# Ashenfront implementation contract

Vanilla ES modules, Vite, Three.js. Modules own files independently.

## Simulation (`src/game.js`)
Exports `Game`, `DEFS`, `MAP_SIZE=110`.
`new Game()` starts a ready-to-play skirmish. `game.state` includes:
`entities: []`, `gold`, `lumber`, `food`, `foodCap`, `time` (seconds), `status` (`playing|victory|defeat`), `message` (string), `events: []` (recent short strings), `kills`.
Entities: `{id,kind,team,x,z,hp,maxHp,radius, ...}`. Teams: `player|enemy|neutral`.
Kinds: `worker|footman|archer|hero|hall|barracks|farm|tower|stronghold|goldmine|tree`.
Optional `buildProgress` 0..1, `queue` array, `order: {type,x,z,targetId}`, `attackFlash` seconds, `facing` radians, `carrying` amount, `resource` amount. Completed buildings omit buildProgress or set 1. Dead entities are removed.
`DEFS[kind]`: `{name, description, maxHp, radius, gold?, lumber?, food?, buildTime?, trainTime?, damage?, range?, speed?}`.
Methods: `update(dt)`, `reset()`, `command(ids, {type:'move|attack|gather|stop|attackMove', x?, z?, targetId?})`, `build(kind,x,z,workerIds)` returns boolean; `train(buildingId,kind)` returns boolean; `canAfford(kind)` boolean. `upgrade()` optional for weapon upgrade, `cast(heroId,x,z)` optional hero power. All methods reject invalid orders gracefully with state.message.
Home hall (-28,26), enemy stronghold (29,-28), resources near home. Initial army includes hero, 4 footmen, 4 workers; some workers initially gathering. Initial resources allow at least a farm or barracks. Skirmish should be winnable in ~5 minutes and loseable if ignored. Enemy raids not before 90 seconds. No terrain collisions required except buildings/mine.

## View (`src/world.js`)
Exports `WorldView` class. `new WorldView(container, game)` creates renderer canvas appended to container.
Methods: `update(dt, selectedIds)` reads game.state; `resize()`; `screenToGround(clientX,clientY)` returns `{x,z}` or null; `pick(clientX,clientY)` returns entity id or null; `project(x,z)` returns client `{x,y}`; `pan(dx,dz)`; `focus(x,z)`; `zoom(delta)`; `setBuildPreview(kind, point, valid)` (kind null clears); `dispose()` optional.
Properties: `canvas`, `camera`, `renderer`, `center: {x,z}`. Render navigation ground actual 3D geometry with stylized detailed blue player castle/army, red enemy encampment, grassy hills, forest, paths, mine, ambient particles, shadows, readable selection rings/hp. Show move/attack indicator through `ping(x,z,type='move')` optional. Build preview real geometry.

## Interface (`index.html`, `src/style.css`, `src/ui.js`, `public/progress.html`)
`index.html` includes `#battlefield` full viewport scene, `#app` UI overlay, loads `/src/main.js` and stylesheet.
Exports `createUI(game, actions)` returns `{update(selectedIds, mode), showHelp(), hideHelp()}`. Actions: `train(kind)`, `build(kind)` enters placement, `command(type)` (`move|attackMove|stop|gather`), `restart()`, `focusHome()`, `selectArmy()`, `togglePause()`, `cast()`, `focus(x,z)`. UI should handle button click events itself; renderer input handles canvas only. HUD shows resource state/clock/status/minimap/selected portrait and useful context-sensitive actions with costs. Default selection hero. Mode string `select|move|attackMove|gather|build:kind`. Mini map actual entity positions, clicking calls actions.focus world coordinates. Accessible help and restart. `public/progress.html` independent tasteful simple progress page links screenshot images `/evidence/...` and references, with build/critic/live playtest evidence populated later by lead. No fabricated passed checks. `createUI` returns `destroy` optional.

## Integration (`src/main.js` owned by lead)
RAF update clamp dt <= 0.05 (pause handled here), WorldView then UI. DOM canvas click/drag selection, shift additive, right-click contextual command, WASD/arrow navigation, wheel zoom, M move, A attack move, B barracks build, F farm build, H home, Space hero focus, Esc cancel, Ctrl+A army, keys 1-3 selection control groups optional. `window.__game`, `window.__view` exposed for evidence and deterministic test assistance. Actual browser interactions required in tests. Build placement click then return select mode. Start directly in playable scene with concise dismissible hints, not blocking splash.
