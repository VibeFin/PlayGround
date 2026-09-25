# Ashes of Aether — Act I: The Unravelling

A single-player, turn-based high-fantasy RPG that runs in your browser, played as an explorable 3D world (with a classic text interface one click away).

The Aether — the magic that lights the world's lamps, heals its sick and binds its wards — has started to misbehave. You create a hero (3 races × 3 classes), start in your people's homeland, and follow three separate threads of the same disaster. At around level 4–5 they converge, and the wider world opens up. Act I ends in the Aether Vault (levels 10–12) with a puzzle descent, a multi-phase boss, a revelation and a choice between three endings. After that you see the **ASHES OF AETHER — ACT II** banner and can keep playing in the same world.

## Tech

- **Engine:** Python 3.10+, standard library only. All rules, content and state live on the server side in the `ashes` package.
- **Frontend:** plain HTML/CSS and ES-module JavaScript, with no build step and no framework. The browser only renders the view model that the engine sends and posts actions back.
- **3D client:** [Three.js](https://threejs.org) r186, vendored under `web/vendor/three/` (MIT, see [THIRD_PARTY.md](THIRD_PARTY.md)) and loaded through an import map. All art and sound is generated in code, so there are no asset files to download.
- **Transport:** a tiny `http.server` JSON API on `127.0.0.1`.
- **Dependencies:** none to install. `pytest` is optional; the tests are plain `unittest`. The 3D view needs a browser with WebGL 2; without it the game starts in the text interface automatically.

## Install and run

```bash
python3 run.py                 # starts the server and opens http://127.0.0.1:8765
```

| Option | Meaning |
|---|---|
| `--port N` | First port to try (default 8765). If it is taken, the next free port is used and printed. |
| `--host H` | Bind address (default `127.0.0.1`). |
| `--no-browser` | Don't open a browser tab. |
| `--data-dir DIR` | Where saves and settings go (default `./saves`, or `$ASHES_DATA_DIR`). |
| `--seed N` | Fixed RNG seed, for reproducible testing. |
| `--dev` | Enables the developer panel and `debug_*` actions (also `ASHES_DEV=1`). Off for normal play. |

Stop the server with Ctrl+C. The game state lives in the server process, so the page can be reloaded freely; multiple tabs share the same game.

**Interface:** the game opens in 3D. `Menu → Settings → Interface` switches to the text interface and back (or open `/?ui=text` / `/?ui=3d`); the choice is remembered in the browser. Both interfaces drive the same engine and share saves.

## Controls

- Everything is clickable.
- **Panels:** `C` character, `I` inventory, `K` skills, `J` quests, `L` journal, `H` achievements.
- **Esc:** closes the top overlay, leaves a conversation or shop, or opens the menu.
- **3D exploration:**
  - `WASD` / arrow keys move relative to the camera (hold `Shift` to walk slowly), or click the ground to walk there.
  - Drag to orbit the camera, mouse wheel to zoom.
  - `E` (or clicking) interacts with whatever is highlighted: people, points of interest, shops, beds, map tables. Walking through an open doorway moves you to the next location; locked ones say why.
  - `F` searches the area. Click the location name (top-left) to re-read its description.
- **Dialogue:** number keys choose an answer. Conversations that decide the story cannot be skipped.
- **Combat:**
  - `1`–`9` use abilities and `A` attacks; either one opens targeting when needed. In 3D, click an enemy (or its card) to target it.
  - `D` defends.
  - `Enter` dismisses the result card.
- **Settings:** difficulty, autosave, text size, animations and sound, plus in 3D: quality (Low / Medium / High, where High adds shadows), camera speed and inverted camera Y.

## Tests

```bash
python3 -m pytest -q tests/             # full suite (~30 s; includes 9 complete playthroughs)
ASHES_QUICK=1 python3 -m pytest -q tests/   # one playthrough instead of nine
python3 -m unittest discover tests      # without pytest
```

| File | What it covers |
|---|---|
| `test_character.py` | Content validation, creation rules for every race/class, leveling, skill trees and respec, equipment, serialization. |
| `test_combat.py` | Barriers, reach and rows, misdirection, stuns, immunities, difficulty scaling, boss flee rules, costs and cooldowns. |
| `test_game.py` | World and tutorials for all 9 combos, shops, inns, travel gating, defeat and respawn, required story dialogues, the ending and Act II, and save robustness. Also fuzz tests that throw thousands of random or garbage actions at the engine, at the start and mid-campaign. |
| `test_server.py` | Session handling, settings persistence, and the real HTTP server on a random port: static files, path traversal, API errors and size limits. |
| `test_playthrough.py` | A scripted bot plays the whole of Act I with each of the 9 race/class combinations. It asserts every story milestone, the world opening by level 7, the Vault at levels 10–14, the Act II banner, and that the world stays playable afterward. |
| `test_combat_events.py` | The structured combat event feed the 3D client animates from: ordering, and HP/death/status events agreeing with the authoritative combat state for all 9 combos. |
| `test_scene_state.py` | Avatar position (`set_position`), save format v2 and v1 migration, garbage/stale positions, and that every `debug_*` action is rejected unless the server runs with `--dev`. |
| `test_scene_layouts.py` | The authored 3D layouts in `web/world/*.json` against the engine: every Kharum-Dûr location, exit, NPC and feature is placed, nothing unknown is placed, and every prop type exists in `prefabs.js`. |
| `test_3d_flow.py` | The 3D milestone flow through the HTTP session, using the same actions the 3D client sends: Dwarf Fighter → Forgehall fight, XP and achievement → Durga → The Ninth Deep advances → market → galleries → a real random fight → save with position → reload in a fresh session → continue. |

The browser side has its own smoke test: with the server in `--dev` mode and a game in progress, open `/?selftest=1`. It tours all 68 locations in 3D, checks each room against the engine (doors, NPC anchors, features, clear doorway approaches), runs fights through the combat presenter and checks for GPU memory leaks. The result is shown bottom-left and stored in `window.__selftest`.

## Saves

- **Location:** `saves/` (or `--data-dir`).
- **Slots:** `slot1`–`slot5` are manual saves. `auto` is written when you rest, enter a new region and reach the ending (autosave can be turned off in Settings).
- **Format:** JSON with a version number; older versions are migrated on load. Version 2 adds `scene_pos` (where the avatar stood, and which way it faced), so a reload puts you back on the same spot. Version 1 saves load unchanged and start at the room's entrance.
- **Safety:**
  - Writes are atomic (write to a temp file, then rename). The previous version is kept as `<slot>.json.bak` and used automatically if the main file is corrupt.
  - A failed load leaves your current game untouched.
  - Ids that no longer exist in the content (for example a removed item or location) are skipped on load instead of crashing. An unknown location falls back to your homeland.
- **Restrictions:** you can save while exploring or shopping, but not during combat or conversations.
- **Settings:** difficulty, autosave, text size, animations, sound and the 3D options are stored in `settings.json` next to the saves.

## Game systems

- **Races:**

| Race | Homeland | Strengths | Weakness |
|---|---|---|---|
| Human | Valewatch | Versatile, Ambitious (+10% XP), Silver Tongue | Aether-Dull |
| Elf | Sylvara | Ley-Sight, Fey Grace, Old Blood | Slender Frame |
| Dwarf | Kharum-Dûr | Stoneblood, Deep Endurance, Stubborn | Heavy-Footed & Earthbound |

  Each race also has a racial ability and attribute modifiers.
- **Classes:** Fighter (Vanguard / Berserker / Weaponmaster), Mage (Elementalist / Arcanist / Mystic) and Rogue (Assassin / Trickster / Ranger). Each class has a trait and a three-branch skill tree of about 18 nodes, with tiers gated by level and by points spent in the branch. Respec is available at trainers.
- **Stats:** six D&D-style attributes drive the derived stats: HP/MP/SP, hit, crit, dodge, armor, spell power, initiative, per-element resistances, perception and persuasion. You get attribute points and skill points on level-up.
- **Leveling:** the level cap is 15, and Act I is tuned for levels 1–12. XP comes from combat, quests, discovering places, lore, puzzles, persuasion and achievements.
- **Combat:**
  - Turn-based on initiative, with front and back rows: melee only reaches the front row.
  - Statuses: damage over time, crowd control, buffs, barriers, and taunt/misdirection.
  - Elemental resistances and immunities.
  - Enemy AI that heals, protects allies and telegraphs charged attacks (⚠).
  - 14 bosses with phases and mechanics (conduits, attunements, summons, enrage).
  - You can flee from normal fights. Defeat sends you back to your last rest with about 10% gold lost and nothing else.
- **Items:**
  - Equipment slots: head, chest, hands, legs, feet, main hand, off hand, two rings and an amulet.
  - Rarities Common → Uncommon → Rare → Epic → Legendary, plus 26 hand-made unique items. Affixes are generated by tier.
  - Also consumables, bombs, key items and readable lore.
- **World:**
  - 68 locations in 11 regions, with travel between hubs.
  - Searchable areas (perception checks), environmental puzzles, shops, inns, stables and trainers.
  - Room text and NPCs react to story flags.
- **Quests:** 26 in total: main, side, faction, exploration and hidden. Many have choices with consequences, and those consequences are reflected in the epilogue.
- **Factions and NPCs:** 6 factions with reputation tiers that change dialogue and prices. 45 dialogue trees with persuasion checks, humor and secrets.
- **Achievements:** 70 in total, 29 of them secret (many are jokes). Each one gets a prominent "NEW ACHIEVEMENT" banner.
- **Difficulty:** Story, Normal and Hard. It can be changed at any time.

## Project structure

```
run.py                  launcher (CLI options above)
ashes/
  server.py             HTTP server + session (one Game per server process)
  engine/               rules — no content hard-coded here
    game.py             Game: state, action dispatch (act_*), exploration, travel, rest, endings
    combat.py           turn-based combat, damage, statuses
    ai.py               enemy decision making
    character.py        player character, leveling, skills, equipment
    stats.py            attribute → derived-stat math
    items.py            item generation (tiers, rarities, affixes, uniques)
    quests.py           quest state machine
    dialogue.py         dialogue trees and checks
    rules.py            condition checks and effect application shared by all content
    save.py             atomic, versioned, backed-up save slots
    view.py             builds the JSON view model sent to the browser
    validate.py         cross-reference validator for all content
  data/                 content only: races, classes, skills/, items, enemies, statuses,
                        world/ (one file per region), quests/, dialogue/, factions, lore,
                        achievements, story (endings and epilogue)
web/
  index.html            page shell + import map for Three.js
  css/                  style.css (panels, text UI), world3d.css (3D HUD, labels, prompts)
  js/app.js             boot, API loop, interface switch (+ api.js, util.js, dev.js, screens/*)
  js/world3d/           the 3D client (see below)
  world/                authored 3D layouts, one JSON file per region (kharum.json today)
  vendor/three/         Three.js r186 + LICENSE (see THIRD_PARTY.md)
tests/                  unittest suite + bot.py (the autoplayer used by playthrough tests)
tools/                  dev utilities (see below)
```

**Adding content:** content is plain Python dicts under `ashes/data/`. `ashes.engine.validate` checks every cross-reference (items, enemies, flags, quests, dialogue targets, conditions). It runs as part of the test suite, so a typo in content fails a test instead of crashing mid-game.

## 3D client architecture

The Python engine stays the only authority on game state. The 3D client is another way of *presenting* the view model and *sending* the same actions the text interface sends (`talk`, `choose`, `examine`, `move`, `attack`, `use_skill`, `buy`, `rest`, …). It never decides outcomes: a door that is locked in the engine is locked in 3D, dialogue checks are rolled by the engine, and combat is resolved by the engine before any animation plays.

- **Rooms.** `room.js` builds each location from two inputs. The engine view decides *what* exists (exits, NPCs, features, shops, rest), and a layout decides only *where*. Layouts come from `web/world/<region>.json` when authored (all 13 Kharum-Dûr locations are). Any other location gets a deterministic procedural layout from its biome (`layouts.js`), so the whole game is explorable in 3D. Static geometry is merged per material (`builder.js`), and collision is 2D circles and boxes on the ground plane (`collision.js`).
- **Avatar and camera.** `characters.js` builds a low-poly body from your race, class and equipment. `player.js` moves it with WASD or click-to-move. `camera.js` is a spring-arm third-person camera that shortens against walls. Your position and facing are reported to the engine with `set_position` (throttled) and saved as `scene_pos`.
- **Interaction.** `interact.js` is one registry for everything usable (NPCs, features, exits, shops, beds, map tables), and every entry's `activate()` is an existing engine action. Walking through an open doorway sends `move`. The DOM HUD, panels, dialogue and shops are the same screens as the text interface, drawn over the canvas.
- **NPCs.** `npc.js` places NPCs at layout anchors, with nameplates and quest markers (`!` / `?`) from the view model (`labels.js`). They idle and turn to face you.
- **Combat.** The engine returns a structured, ordered event feed for each round (attacks, damage, heals, statuses, deaths). `combat3d.js` lays out the fight tactically and plays the feed back, with effects from `fx.js` and floating numbers. It then reconciles with the authoritative state, so a skipped or interrupted animation can never desync HP. Enemy bodies are picked by id, then by engine tags (`enemies3d.js`).
- **Adding a layout.** Add an entry keyed by location id to a `web/world/<region>.json` file, with a room shape, door placements for each exit, NPC and feature anchors, and props from `prefabs.js`. `tests/test_scene_layouts.py` fails if the layout drifts from the engine data. Load it in dev mode and run the self-test to check doorways are reachable.
- **Performance.** A typical room is around 100 draw calls and well under 20k triangles (the Emberfall square measured 96 draw calls and 7.5k triangles). Particles animate on the GPU, and models and materials are disposed on room changes (the self-test checks for leaks). The Quality setting controls shadows, pixel ratio and light count.

## Developer tools

Run these from the project root with `PYTHONPATH=.`:

| Command | Purpose |
|---|---|
| `python3 tools/runbot.py [race cls] [--seed N]` | The bot plays Act I and prints a timeline (levels, deaths, milestones). |
| `python3 tools/makesave.py <data_dir> <slot> <flag> [race cls]` | The bot plays until a story flag is set and writes a save there, which is handy for testing late-game content in the browser. |
| `python3 tools/simfight.py`, `tools/dps.py`, `tools/xptally.py` | Balance helpers: simulated fights, damage per ability, XP budget per region. |

**In-game dev panel.** Start the server with `--dev`, then press `` ` `` (backquote) in the browser. The panel can:

- teleport to any location, optionally *peaceful*, which skips an arrival ambush;
- start any encounter, and end the current fight;
- set your level, grant XP, heal, set story flags or quest stages, and reset the current location;
- inspect the engine state;
- show colliders and layout anchors in 3D.

Every button goes through an engine `debug_*` action. Without `--dev` the panel does not exist and the server rejects those actions as unknown, so normal play can't reach them. `/?selftest=1` runs the browser smoke test described under Tests.

## Known limitations

- All visuals are procedural low-poly geometry with canvas-painted textures, and the sound is simple synthesised WebAudio cues. There are no recorded sounds, music or hand-made models.
- Only Kharum-Dûr (13 locations) has hand-authored 3D layouts. The other regions' rooms are generated from their biome. They are complete and playable, but less distinctive.
- Rooms are single-floor: stairs and shafts are doorways to other locations, not climbable geometry. There is no jumping.
- In some embedded or software-rendered browsers the frame rate is capped at around 30 fps. Use Quality: Low on weak GPUs.
- The hero fights alone; there are no party companions. Summons exist, but only as abilities.
- The server holds a single game session and is meant to run locally. It is not hardened for multi-user or public hosting.
- Act II is a banner and a hook, not content. The post-ending world keeps its side quests, achievements and reactive NPCs, but no new story.
- Balance has been tuned with the bot across all 9 combos and several seeds. Elf Fighters (low CON, melee) remain the most punishing combination, and some fights are swingy on Hard.
- Keyboard play covers the main flows, but not every panel control has a shortcut.

## Future work

- Act II: the other Vaults hinted at by the star chart, and consequences carried over from the Act I ending.
- Companions and party combat.
- Hand-authored 3D layouts for the other regions, recorded sound and music, and richer character models.
- Crafting from the existing materials, and more unique items.
- A controller- and screen-reader-first pass over every panel.
