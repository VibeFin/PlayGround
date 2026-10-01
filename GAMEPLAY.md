# Dead Frequency

A browser-native, first-person co-op survival game built with Three.js, Web Audio, and WebSockets. You are stationed at Blackpine Relay in the Alpine exclusion zone. Survive escalating waves and resupply between rounds.

## Run

Use **Node.js 22.12 or newer** and npm. The npm commands below work in standard Windows, macOS and Linux shells.

```sh
npm install
npm run dev
```

Open **http://localhost:3000** in a modern desktop browser with WebGL enabled. A keyboard and mouse are required. Click **Deploy solo** to enter the field. The mouse is captured during play; Escape releases it.

```sh
npm run build
npm run preview
```

The production server serves the built app and its WebSocket co-op connection on the same port. Set `PORT` to override the default. For friends on other computers, expose this server through your hosting platform or a HTTPS reverse proxy with WebSocket forwarding. An ordinary static-only host cannot provide the co-op relay.

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look |
| Left mouse | Fire |
| Right mouse | Aim |
| Shift | Sprint |
| R | Reload |
| E | Use nearby supplies |
| Escape | Pause / release mouse |

In solo, pausing freezes the survival simulation. In co-op, the shared operation continues while a menu is open.

## Co-op

1. Everyone opens the same server address.
2. Select **Play with friends → Create a room**.
3. Share the room code. Teammates enter it under **Join frequency**.
4. The host selects **Deploy squad**.

Up to four survivors can share a room. The host owns the enemy simulation; other players send their shots and receive shared world snapshots. Guests wait for the host to deploy, and can also join an operation already in progress. The host is the squad's anchor: their defeat ends the shared operation. Guest defeats are individual. The room is temporary and is removed when the host leaves; connected survivors can continue locally as a solo operation.

## Settings & field notes

- Gear icon: master volume, mouse sensitivity, rendering quality, and reduced menu motion.
- Software WebGL renderers automatically receive a lower-resolution profile; new software-rendered sessions default to dynamic shadows off. Hardware rendering uses the full default profile.
- Speaker icon: mute audio.
- **Field guide**: control reference and survival advice.
- **[Field notes](/progress.html)**: live implementation and review status, refreshing every five seconds.

All environment, character, and weapon assets are generated procedurally. Sound is synthesized using the Web Audio API and begins only after interaction. Barlow Condensed and DM Sans interface fonts are bundled locally through Fontsource; gameplay needs no third-party asset service.

## Quality evidence

Implementation and independent running-game review results are tracked in `public/progress.json`. This is an original browser game inspired by round-based arcade horror, not a recreation or a claim of equivalence to a commercial Call of Duty release. No blind commercial-reference comparison has been performed.
