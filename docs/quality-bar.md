# Ashenfront quality bar

## Real gameplay references

- [Warcraft III Human defense screenshot](https://classic.hiveworkshop.com/war3/images/human/screens/ss007.jpg), linked from the legacy Blizzard strategy guide preserved by Hive Workshop. Inspect the elevated 3D camera, distinct colored armies, selection circles, overhead health, player base, compact minimap, portrait and command card.
- [Human expansion defense screenshot](https://classic.hiveworkshop.com/war3/images/human/screens/ss022.jpg). Inspect buildings with distinct silhouettes, trees forming the map edges, towers supporting an army, and usable battle space.
- [Resource gameplay and worker return loop](https://classic.hiveworkshop.com/war3/basics/resources.shtml): gold/lumber are gathered by workers and brought to the town hall; spent resources produce units and buildings.
- [Grubby Human vs Orc gameplay, Twisted Meadows](https://www.youtube.com/watch?v=JpwWD2v3d9E): linked gameplay reference for the base-production / army-control / hero-spell loop. A link is not a claim that we watched the entire video.

## Independently judgeable pieces

1. **Gameplay** — Select workers and an army; command move, gather and attack; spend actual gathered resources; build farms/barracks/towers; queue units; defend against raids; defeat the enemy stronghold; lose the hall; restart cleanly. Resource returns and construction must visibly take time.
2. **Battlefield** — Real WebGL 3D scene. Camera pans/zooms and minimap navigation work. Architecture and units have distinct readable silhouettes and team colors. Animated movement, selection rings, health and combat feedback communicate state. No empty scene, static hero image or placeholder cubes.
3. **Command interface** — Persistent resources, objective, clock, minimap, selection information, costs, contextual buttons, visible help and restart. Army and base remain visible without excessive panel obstruction. Disabled states and order feedback explain failures.

## Verification process

Each piece has a dedicated builder and a separate fresh-context critic. Critics must open the running browser artifact and inspect actual interactions/screenshots. Lead fixes highest-impact meaningful gaps then requests independent reinspection. Completion evidence includes screenshots, actual DOM/canvas input checks, a complete win/restart loop, automated simulation checks, production build and reference comparison. SwiftShader in this environment is CPU software rendering.
