# Genex asset queue — Strike Protocol (runs after YOU sign in)

Sign-in pending: `npx genex auth` with code B8BP-KZB6.
After that, run these (each prints ./assets path — wire it, game auto-picks them up):

```bash
npx genex doctor
# hero rifle (viewmodel + world)
npx genex model "tactical AK-style rifle, desert tan, front toward +Z" --low-poly --no-wait
# CT + T soldiers (rigged, then locomotion)
npx genex character "CT special forces operator, blue fatigues, helmet, tactical vest" --direct-text --no-wait
npx genex creature "desert insurgent fighter, tan scarf, tactical vest" --no-wait
# ground + wall tiling sets
npx genex texture "sun-baked desert sand with subtle pebbles" --terrain --no-wait
npx genex texture "weathered middle-eastern plaster wall, sandy beige" --terrain --no-wait
# audio
npx genex sfx "punchy automatic rifle gunshot, desert echo" --no-wait
npx genex sfx "dry reload magazine click-clack" --no-wait
npx genex sfx "distant desert wind ambience loop" --loop --no-wait
npx genex music "tense tactical electronic loop, seamless, no intro or outro" --duration 90 --no-wait
npx genex wait --all
```

Costs: model ~46cr, character ~64cr, creature ~46cr, textures 9cr each,
sfx 2cr each, music ~27cr. Check `npx genex doctor` for balance first.
Game works NOW with code-built art; generated files override via ./assets/manifest.json.
