// stations.js — orbital station bases, several per system.
//
// Each system holds STATIONS_PER_SYSTEM stations at seeded ring positions
// around the system origin (systemIndex * 40000, 0, 0). Stations are places,
// not scenery: a keep-out sphere bounces the ship off, and a dock bubble
// around each one repairs shields fast and hull slowly.
//
// The station body is a Sketchfab GLB (see assets/models/station.glb +
// station.glb.attribution.json — "Low-Poly Space Station - 3December" by
// Šimon Ustal, CC Attribution, loaded via the project's vendored
// GLTFLoader). If the GLB cannot be fetched before boot finishes, a
// procedural fallback station (same footprint, shared materials) stands in
// for the whole session, so a late network never mutates the scene
// mid-run — which is also what keeps the prewarm tripwire quiet.
//
// DETERMINISM: positions, names, scales and phases all draw from
// G.rngFor('stations'/'station-names' + sys), streams nothing else touches.
// update() is driven by G.time, so fixed-step runs agree. The GLB load only
// affects WHICH body mesh is built, and boot awaits it (bounded) before the
// prewarm sweep, so harness captures always see the same variant.
//
// LIGHTS: stations carry none — beacons are additive sprites. A light would
// change the program every material compiles to and belongs in prewarm's
// WORLD_STATES; sprites cost no such dimension.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const STATIONS_PER_SYSTEM = 5;
const DOCK_RADIUS = 340;      // repair bubble around the station centre
const SHIP_R = 6;             // matches flight.js asteroid body radius
const SHIELD_REPAIR = 22;     // shield pts/s inside the bubble (beats the 14/s field regen)
const HULL_REPAIR = 2.5;      // hull pts/s inside the bubble (the hull never heals elsewhere)
const MODEL_URL = new URL('../assets/models/station.glb', import.meta.url);
// Generous on purpose: the isolated probe measured ~6 s under SwiftShader
// (software-GL texture path); real Chrome hardware does it in milliseconds.
// Harness and human boot both gate on ready(), so waiting costs nothing but
// wall clock, while a premature timeout would silently downgrade the fleet.
const READY_TIMEOUT_MS = 30000;

const NAME_A = ['Kepler', 'Tycho', 'Vance', 'Meridian', 'Halcyon', 'Cobalt', 'Drift', 'Farlight'];
const NAME_B = ['Dock', 'Gate', 'Hold', 'Yard', 'Harbor', 'Spire'];

function labelSprite(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 26px "Avenir Next Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillText(text, 130, 42);
  g.fillStyle = 'rgba(255,230,200,0.92)';
  g.fillText(text, 128, 40);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, depthWrite: false, transparent: true, opacity: 0.92,
  }));
  sp.scale.set(150, 37.5, 1);
  return sp;
}

function beaconTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,200,140,1)');
  gr.addColorStop(0.35, 'rgba(255,160,80,0.55)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Procedural fallback: spine + habitat ring + solar wings + window strip.
// Same ~120u footprint as the normalised GLB body. Shared geometries and
// materials across all fallback stations: 4 draws each.
let _fbGeo = null, _fbMats = null;
function fallbackBody() {
  if (!_fbGeo) {
    _fbGeo = {
      spine: new THREE.CylinderGeometry(6, 6, 110, 10),
      ring: new THREE.TorusGeometry(34, 5, 8, 28),
      wing: new THREE.BoxGeometry(64, 1.2, 18),
      strip: new THREE.BoxGeometry(12.5, 12.5, 40),
    };
    _fbMats = {
      hull: new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.45, metalness: 0.75 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.6, metalness: 0.6 }),
      solar: new THREE.MeshStandardMaterial({ color: 0x1a3a6e, roughness: 0.35, metalness: 0.4 }),
      glow: new THREE.MeshBasicMaterial({ color: 0xffc890 }),
    };
  }
  const grp = new THREE.Group();
  const spine = new THREE.Mesh(_fbGeo.spine, _fbMats.hull);
  spine.rotation.x = Math.PI / 2;
  grp.add(spine);
  const ring = new THREE.Mesh(_fbGeo.ring, _fbMats.dark);
  grp.add(ring);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(_fbGeo.wing, _fbMats.solar);
    wing.position.set(s * 52, 0, 0);
    grp.add(wing);
  }
  const strip = new THREE.Mesh(_fbGeo.strip, _fbMats.glow);
  strip.position.y = 8;
  grp.add(strip);
  return grp;
}

export function initStations(G) {
  const group = new THREE.Group();
  group.name = 'stations';
  // Space-owned: planet entry hides the whole space group, so stations vanish
  // with the sky. Warp-tunnel hiding is handled in update() (charge shows
  // them, tunnel does not).
  G.space.group.add(group);

  const beaconTex = beaconTexture();
  const stations = []; // { root, body, beacon, label, name, keepout, phase, docked }

  let glbBody = null;   // normalised GLB body template (cloned per station)
  let modelRadius = 60; // bounding-sphere radius of the body template

  function normaliseGLB(gltfScene) {
    // Strip anything that would change the renderer's light set or camera.
    gltfScene.traverse((o) => {
      if (o.isLight || o.isCamera) o.removeFromParent();
    });
    const keep = [];
    gltfScene.children.slice().forEach((c) => { gltfScene.remove(c); keep.push(c); });
    const wrap = new THREE.Group();
    for (const c of keep) wrap.add(c);
    // Fit inside a ~120u footprint so docks and keep-outs match the fallback.
    const box = new THREE.Box3().setFromObject(wrap);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const s = 60 / Math.max(1, sphere.radius);
    wrap.scale.setScalar(s);
    // Re-centre on the bounding-sphere centre so rotation + labels sit true.
    const c = sphere.center.multiplyScalar(s);
    wrap.position.sub(c);
    wrap.updateMatrixWorld(true);
    const r2 = new THREE.Box3().setFromObject(wrap).getBoundingSphere(new THREE.Sphere());
    return { body: wrap, radius: r2.radius };
  }

  function buildBody() {
    if (glbBody) return glbBody.clone(true);
    return fallbackBody();
  }

  function setSystem(sys) {
    // Clear and rebuild: repositioning only, no new geometry/materials, so
    // the mid-warp call costs one frame of transforms, not a pipeline.
    for (const st of stations) group.remove(st.root);
    stations.length = 0;
    const rng = G.rngFor('stations' + sys);
    const nrng = G.rngFor('station-names' + sys);
    const ox = sys * 40000;
    for (let i = 0; i < STATIONS_PER_SYSTEM; i++) {
      // Ring 2200–6000u out, ±800u up; station 0 rides closer (900–1400u) so
      // every system opens with a base in plausible view.
      const a = rng() * Math.PI * 2;
      const r = i === 0 ? 900 + rng() * 500 : 2200 + rng() * 3800;
      const pos = new THREE.Vector3(
        ox + Math.cos(a) * r,
        (rng() - 0.5) * 1600,
        Math.sin(a) * r,
      );
      const root = new THREE.Group();
      root.position.copy(pos);
      root.rotation.y = rng() * Math.PI * 2;
      const body = buildBody();
      const sc = 0.9 + rng() * 0.35;
      body.scale.setScalar(sc);
      root.add(body);
      const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
        map: beaconTex, blending: THREE.AdditiveBlending, depthWrite: false,
        transparent: true, opacity: 0.9,
      }));
      beacon.scale.set(26, 26, 1);
      beacon.position.y = 78 * sc;
      root.add(beacon);
      const name = NAME_A[(nrng() * NAME_A.length) | 0] + ' ' + NAME_B[(nrng() * NAME_B.length) | 0];
      const label = labelSprite(name);
      label.position.y = 100 * sc;
      root.add(label);
      group.add(root);
      stations.push({
        root, beacon, name,
        keepout: modelRadius * sc + 14,
        phase: rng() * Math.PI * 2,
        docked: false,
      });
    }
  }

  const _to = new THREE.Vector3();
  function nearest() {
    let best = null, bd = Infinity;
    for (const st of stations) {
      const d = st.root.position.distanceTo(G.player.pos);
      if (d < bd) { bd = d; best = st; }
    }
    return best ? { station: best, dist: bd } : { station: null, dist: Infinity };
  }

  function update(dt, t) {
    // Posed captures stay byte-identical to pre-station builds: moments never
    // see a base. (At full health the dock would no-op, but a keep-out push
    // or a label sprite in frame would still move posed pixels.)
    if (G.momentMode) { group.visible = false; return; }
    // Warp tunnel owns the frame: hide. Charge phase keeps them (they are the
    // thing you are leaving). Planet mode is owned by space.setVisible.
    if (G.mode === 'space') group.visible = G.state !== 'warp';
    if (!group.visible) return;
    const P = G.player;
    for (const st of stations) {
      st.root.rotation.y += dt * 0.03;
      const pulse = 0.75 + 0.25 * Math.sin(t * 2.4 + st.phase);
      st.beacon.material.opacity = 0.55 + 0.35 * pulse;
      const bs = 22 + 8 * pulse;
      st.beacon.scale.set(bs, bs, 1);
      if (G.mode !== 'space' || G.state === 'warp' || G.state === 'destroyed') {
        st.docked = false;
        continue;
      }
      _to.copy(P.pos).sub(st.root.position);
      const d = _to.length();
      // Keep-out: bounce off the hull, no damage — bases are not asteroids.
      const minD = st.keepout + SHIP_R;
      if (d < minD) {
        if (d > 1e-6) _to.multiplyScalar(1 / d); else _to.set(0, 1, 0);
        P.pos.copy(st.root.position).addScaledVector(_to, minD);
        if (P.vel) {
          const vn = P.vel.dot(_to);
          if (vn < 0) P.vel.addScaledVector(_to, -vn * 1.3);
        }
      }
      // Dock bubble: fast shield repair, slow hull repair, entry counted.
      if (d < DOCK_RADIUS) {
        if (!st.docked) {
          st.docked = true;
          G.telemetryData.stationsDocked = (G.telemetryData.stationsDocked || 0) + 1;
        }
        if (P.shield !== undefined) P.shield = Math.min(100, P.shield + SHIELD_REPAIR * dt);
        if (P.hull !== undefined) P.hull = Math.min(100, P.hull + HULL_REPAIR * dt);
      } else {
        st.docked = false;
      }
    }
  }

  // Boot: procedural bodies now (the prewarm sweep warms them); the GLB
  // settles async and rebuilds BEFORE prewarm — ready() bounds the wait so a
  // dead network can never hang boot, and a late GLB is ignored rather than
  // mutating the warmed scene mid-run.
  setSystem(0);
  if (G.momentMode) group.visible = false;
  G.telemetryData.stationsDocked = 0;
  const loadInfo = { mode: 'fallback', error: null }; // surfaced for harness checks
  let _resolveReady;
  const ready = new Promise((res) => { _resolveReady = res; });
  let settled = false;
  const settleFallback = (why) => {
    if (settled) return;
    settled = true;
    loadInfo.error = why;
    setSystem(G.systemIndex);
    _resolveReady(true);
  };
  const timer = setTimeout(() => {
    errors_push('stations-glb-timeout: procedural fallback kept');
    settleFallback('timeout');
  }, READY_TIMEOUT_MS);
  new GLTFLoader().loadAsync(MODEL_URL.href).then(
    (gltf) => {
      clearTimeout(timer);
      if (settled) return; // boot already moved on; never mutate a warmed scene
      settled = true;
      try {
        const n = normaliseGLB(gltf.scene);
        glbBody = n.body;
        modelRadius = n.radius;
        loadInfo.mode = 'glb';
      } catch (e) {
        loadInfo.error = 'normalise: ' + String(e && e.message || e);
        errors_push('stations-glb-normalise: ' + loadInfo.error);
      }
      setSystem(G.systemIndex);
      _resolveReady(true);
    },
    (err) => {
      clearTimeout(timer);
      const m = String(err && err.message || err);
      errors_push('stations-glb-load: ' + m);
      settleFallback('load: ' + m);
    },
  );

  function errors_push(m) {
    try {
      window.dispatchEvent(new CustomEvent('ir-station-note', { detail: m }));
    } catch (e) { /* harness: no listeners, no DOM dependency */ }
    if (G.noteSpike) G.noteSpike('stations:' + m.split(':')[0]);
  }

  const S = { group, stations, setSystem, update, nearest, ready, loadInfo, count: STATIONS_PER_SYSTEM };
  G.stations = S;
  return S;
}
