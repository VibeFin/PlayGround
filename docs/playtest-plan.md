# Running-artifact playtest plan

## Input/economy pass

Use `playwright-cli -s=lead run-code --filename=tests/browser-input.playtest.js` against the Vite server on port 3002. The test must select the worker through canvas picking, assign gold and lumber gathering with actual right-clicks, build a farm using F and an actual placement click, move the hero, select the army and issue attack-move with A. It also checks camera pan, wheel zoom and the visible restart control.

The test can call fixed simulation ticks to shorten waits, but may not grant resources, increase unit statistics, damage enemy entities or directly set win/lose status. Report this time advancement explicitly with evidence.

## Complete skirmish pass

1. Restart with the visible control.
2. Harvest resources and construct production/supply buildings.
3. Train a mixed army through the command card or documented hotkeys.
4. Navigate to the enemy via the minimap; attack-move the army and use the hero ability in combat.
5. Inspect the actual victory overlay and destroyed headquarters, then restart and verify a fresh base, original resources and zero elapsed battle time.
6. Verify a separate defeat with enemy combat, followed by the same reset path.

## Presentation and HUD pass

Inspect screenshots at 1440×900 and 1280×800. Check unit/building silhouettes, 3D navigation, selected unit health and ring, construction, spell/combat feedback, mine/forest gathering, minimap location and command cost feedback. Inspect the actual Warcraft III reference screenshots side by side with the game.

## Independent critique

Fresh critics for gameplay, presentation and interface each open their own browser session. They evaluate the artifact against `docs/quality-bar.md`, identify the three largest concrete issues, and provide their own actual input/screenshot evidence. Highest-impact issues are fixed and re-inspected; an implementation author's assurance is not a passing check.

## Completion records

- Screenshot paths and descriptions on `/progress.html`.
- Actual playtest results with the method described.
- Critic findings, corrections and final verdicts.
- `npm test` and `npm run build` output.
- Explicit reference comparison, with original source links.
