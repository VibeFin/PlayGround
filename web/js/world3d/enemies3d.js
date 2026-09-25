// Enemy archetypes. Every combat unit gets a model chosen by explicit id overrides first, then by
// its engine tags, so new enemies added to the data automatically get a sensible body.
import * as THREE from "three";
import { mat } from "./materials.js";
import { buildHumanoid, HumanAnimator } from "./characters.js";
import { glowSprite } from "./prefabs.js";
import { tex } from "./textures.js";

const TAU = Math.PI * 2;
const mesh = (g, c) => new THREE.Mesh(g, typeof c === "string" ? mat(c) : c);
const ease = (t) => t * t * (3 - 2 * t);
const bump = (t) => Math.sin(Math.PI * Math.max(0, Math.min(1, t)));

function glowMat(color, opacity = 0.9) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}

// Humanoid enemies: looks by id/tags.
const HUMANOID_LOOKS = {
  dockside_thug: { race: "human", role: "commoner", body: "#3a4a4e", accent: "#1f2a2e", weapon: "mace", lantern: true },
  lantern_cutpurse: { race: "human", cls: "rogue", body: "#2e3a3e", accent: "#3a5058", weapon: "dagger", lantern: true },
  lantern_hexer: { race: "human", cls: "mage", body: "#1f3a44", accent: "#7fd4e6", weapon: "wand", lantern: true },
  brannoc: { race: "human", role: "guard", body: "#3a4a4e", accent: "#e8b04a", weapon: "hammer", bulk: 1.5, lantern: true },
  unbound_spellblade: { race: "human", cls: "fighter", body: "#3a2f4a", accent: "#7fd4e6", weapon: "sword", armored: false, helm: null, hood: true },
  unbound_acolyte: { race: "human", cls: "mage", body: "#3a2f4a", accent: "#7fd4e6", weapon: "staff" },
  vessa_crane: { race: "human", cls: "fighter", body: "#2a2238", accent: "#9ff4ff", weapon: "sword", armored: false, female: true, helm: null },
  unbound_tapper: { race: "elf", cls: "mage", body: "#3a2f4a", accent: "#9ae07a", weapon: "staff" },
  naerys: { race: "elf", cls: "mage", body: "#2f3a2a", accent: "#9ae07a", weapon: "staff", female: true, hood: false },
  unbound_excavator: { race: "dwarf", role: "worker", body: "#5a4a3a", accent: "#7fd4e6", weapon: "hammer" },
  excavator_blaster: { race: "dwarf", role: "worker", body: "#5a4030", accent: "#e0672a", weapon: "tankard", bomb: true },
  unbound_foreman: { race: "dwarf", role: "guard", body: "#4a4038", accent: "#7fd4e6", weapon: "axe", helm: "cap" },
  bandit_cutthroat: { race: "human", cls: "rogue", body: "#4a3526", accent: "#9a2a22", weapon: "dagger", redcap: true },
  bandit_archer: { race: "human", cls: "rogue", body: "#4a3a26", accent: "#9a2a22", weapon: "bow", redcap: true },
  redcap_brute: { race: "human", role: "commoner", body: "#5a3a26", accent: "#9a2a22", weapon: "axe", bulk: 1.5, redcap: true, twoHanded: true },
  redcap_mott: { race: "human", role: "guard", body: "#6a2a22", accent: "#e8b04a", weapon: "axe", bulk: 1.3, redcap: true },
  ilvane_morrow: { race: "human", cls: "mage", body: "#1a2230", accent: "#9ff4ff", weapon: "staff", hood: false, threads: true },
};

const UNDEAD_LOOKS = {
  drowned_scribe: { cls: "mage", body: "#2a3a3a", weapon: "tome" },
  bone_archer: { cls: "rogue", body: "#3a3430", weapon: "bow", hood: false },
  highway_ghoul: { role: "commoner", body: "#3a3a2e", weapon: null },
  drowned_acolyte: { cls: "mage", body: "#233036", weapon: "staff" },
  ashbound_knight: { cls: "fighter", body: "#3a302c", accent: "#5a2a1a", weapon: "sword" },
  bellwraith: { cls: "mage", body: "#202028", weapon: "mace", bulk: 1.3 },
};

export function buildEnemy(u) {
  const id = u.enemy_id || "";
  const tags = new Set(u.tags || []);
  let model;
  if (id in HUMANOID_LOOKS) model = humanoidEnemy(HUMANOID_LOOKS[id]);
  else if (id === "grast_rig") model = colossus();
  else if (id === "mirror_double") model = illusion();
  else if (id === "stormcrow") model = bird();
  else if (id === "magma_slug") model = slug();
  else if (id === "scarecrow" || id === "harvest_lord") model = scarecrow(id === "harvest_lord");
  else if (id === "forge_drone" || id === "aether_leech") model = drone(id === "aether_leech" ? "#7fd4e6" : "#ff8a3a");
  else if (id === "anchor_chain") model = chainObject();
  else if (id === "siphon_coil" || id === "aether_conduit") model = coil(id === "aether_conduit");
  else if (id === "warden_pylon") model = pylon();
  else if (id in UNDEAD_LOOKS || (tags.has("undead") && !tags.has("spirit"))) model = undead(UNDEAD_LOOKS[id] || {});
  else if (tags.has("swarm")) model = swarm(tags.has("spirit") ? "#bfe8ff" : "#6a5a40");
  else if (tags.has("spider")) model = spider(id);
  else if (tags.has("crawler")) model = crawler(id === "crawler_spitter");
  else if (tags.has("construct")) model = golem(id);
  else if (tags.has("plant")) model = plant(id);
  else if (tags.has("spirit") || tags.has("aether")) model = wisp(id);
  else if (tags.has("beast")) model = quadruped(id, tags);
  else if (tags.has("object")) model = pylon();
  else if (tags.has("humanoid")) model = humanoidEnemy({ race: "human", role: "commoner" });
  else model = wisp(id);
  model.enemyId = id;
  const scale = (u.is_boss ? 1.5 : 1) * (model.baseScale || 1);
  model.root.scale.multiplyScalar(scale);
  model.height *= scale;
  model.radius *= scale;
  if (u.is_boss) addAura(model);
  return model;
}

function humanoidEnemy(look) {
  const m = buildHumanoid(look);
  const torso = m.parts.torso, head = m.parts.head;
  if (look.lantern) {
    const l = mesh(new THREE.SphereGeometry(0.07, 6, 4), "aether");
    l.position.set(0.18, 0.1, 0.12); torso.add(l);
    const g = glowSprite("#8ff0ff", 0.6, 0.7); g.position.copy(l.position); torso.add(g);
  }
  if (look.redcap) {
    const cap = mesh(new THREE.ConeGeometry(0.15, 0.3, 6), "#b0302a"); cap.position.set(0, 0.28, -0.02); cap.rotation.x = -0.4; head.add(cap);
  }
  if (look.bomb) {
    const b = mesh(new THREE.SphereGeometry(0.09, 8, 6), "iron_dark"); b.position.set(0, 0, 0.1); m.parts.armR.hand.add(b);
    const f = glowSprite("#ffb040", 0.3, 1); f.position.set(0, 0.1, 0.1); m.parts.armR.hand.add(f);
  }
  if (look.threads) {
    for (let i = 0; i < 5; i++) {
      const t = mesh(new THREE.TorusGeometry(0.5 + i * 0.12, 0.006, 3, 32), glowMat("#9ff4ff", 0.7));
      t.rotation.set(Math.random() * 3, Math.random() * 3, 0); t.position.y = 0.4; torso.add(t);
      m.extraTick = (m.extraTick || []).concat((tt) => { t.rotation.x += 0.004 * (i + 1); t.rotation.y += 0.006; });
    }
  }
  return m;
}

function undead(look) {
  const m = buildHumanoid({ race: "human", skin: "#c9c2ae", hair: null, ...look, beard: false });
  for (const sx of [-1, 1]) {
    const e = glowSprite("#8ff0ff", 0.12, 1);
    e.position.set(sx * 0.045, 0.1, 0.12); m.parts.head.add(e);
  }
  m.parts.torso.rotation.x = 0.15;
  return m;
}

function illusion() {
  const m = buildHumanoid({ race: "human", cls: "fighter", body: "#7fd4e6", accent: "#bff6ff" });
  m.root.traverse((o) => { if (o.isMesh) { o.material = glowMat("#9fe8ff", 0.35); o.userData.baseMat = o.material; } });
  return m;
}

// A generic creature animator: lunges, recoils, collapses; archetypes add their own idle motion.
const CREATURE = {
  attack: { dur: 0.6, impact: 0.5, pose: (t) => ({ z: 0.7 * bump((t - 0.2) / 0.6), pitch: 0.3 * bump((t - 0.2) / 0.6) - 0.15 * bump(t / 0.3) }) },
  shoot: { dur: 0.7, impact: 0.55, pose: (t) => ({ z: -0.2 * bump(t / 0.5) + 0.2 * bump((t - 0.5) / 0.3), pitch: -0.2 * bump(t / 0.5) }) },
  cast: { dur: 0.9, impact: 0.55, pose: (t) => ({ y: 0.35 * bump(t), spin: 0.8 * bump(t), glow: bump(t) }) },
  hit: { dur: 0.4, impact: 0, pose: (t) => ({ z: -0.25 * bump(t), shake: 0.15 * Math.sin(t * 40) * bump(t) }) },
  defend: { dur: 0.7, impact: 0.3, pose: (t) => ({ y: -0.1 * bump(t), pitch: -0.2 * bump(t) }) },
  victory: { dur: 1, impact: 0, pose: (t) => ({ y: 0.25 * bump(t) }) },
  interact: { dur: 0.5, impact: 0.5, pose: () => ({}) },
  item: { dur: 0.6, impact: 0.5, pose: (t) => ({ y: 0.1 * bump(t) }) },
  talk: { dur: 1, impact: 0, pose: () => ({}) },
  die: { dur: 0.9, impact: 1, hold: true, pose: (t) => ({ roll: 1.4 * ease(t), y: -0.25 * ease(t), sink: ease(t) }) },
};

class CreatureAnimator {
  constructor(model, { idle, float = 0 } = {}) {
    this.m = model; this.idle = idle; this.float = float;
    this.t = Math.random() * 10; this.action = null; this.dead = false; this.lookYaw = 0;
  }
  play(name, speed = 1) {
    const a = CREATURE[name] || CREATURE.attack;
    if (this.dead) return Promise.resolve();
    if (name === "die") this.dead = true;
    return new Promise((resolve) => { if (this.action) this.action.resolve(); this.action = { a, t: 0, speed, resolve }; });
  }
  impactDelay(name, speed = 1) { const a = CREATURE[name] || CREATURE.attack; return (a.dur * a.impact) / speed; }
  revive() { this.dead = false; this.action = null; }
  update(dt, moveSpeed = 0) {
    this.t += dt;
    const o = { z: 0, y: 0, pitch: 0, roll: 0, shake: 0, spin: 0, glow: 0, sink: 0 };
    if (this.action) {
      const A = this.action;
      A.t += (dt * A.speed) / A.a.dur;
      Object.assign(o, A.a.pose(Math.min(1, A.t)));
      if (A.t >= 1) { if (!A.a.hold) this.action = null; else A.t = 1; A.resolve(); if (A.a.hold) A.resolve = () => {}; }
    }
    const body = this.m.parts.body;
    const fl = this.float && !this.dead ? this.float + Math.sin(this.t * 2) * 0.12 : this.float * (1 - o.sink);
    body.position.set(o.shake, fl + o.y, o.z);
    body.rotation.set(o.pitch, o.spin, o.roll + (this.float ? 0 : 0));
    if (this.idle) this.idle(this.t, moveSpeed, o, dt);
    for (const f of this.m.extraTick || []) f(this.t);
  }
}

function creature(body, { height, radius, idle, float = 0, ranged = false, tip = null, baseScale = 1 }) {
  const root = new THREE.Group();
  root.add(body);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.baseMat = o.material; } });
  const model = { root, parts: { body }, height, radius, ranged, baseScale, tip: tip || body };
  model.anim = new CreatureAnimator(model, { idle, float });
  return model;
}

function legs(body, n, spread, len, color, y, thickness = 0.03) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, k = Math.floor(i / 2), nk = Math.ceil(n / 2);
    const z = ((k - (nk - 1) / 2) / Math.max(1, nk - 1)) * spread;
    const hip = new THREE.Group(); hip.position.set(side * 0.12, y, z); body.add(hip);
    const up = mesh(new THREE.CylinderGeometry(thickness, thickness, len, 4), color);
    up.position.set(side * len * 0.4, len * 0.25, 0); up.rotation.z = -side * 1.0; hip.add(up);
    const lo = mesh(new THREE.CylinderGeometry(thickness * 0.8, thickness * 0.4, len * 1.1, 4), color);
    lo.position.set(side * len * 0.85, -len * 0.05, 0); lo.rotation.z = side * 0.45; hip.add(lo);
    out.push({ hip, side, phase: k * 1.7 + (side > 0 ? Math.PI : 0) });
  }
  return out;
}

function crawler(spitter) {
  const body = new THREE.Group();
  const c = spitter ? "#4a4a2a" : "#4a3a2a";
  const ab = mesh(new THREE.SphereGeometry(0.32, 8, 6), c); ab.scale.set(1, 0.7, 1.4); ab.position.set(0, 0.42, -0.35); body.add(ab);
  const th = mesh(new THREE.SphereGeometry(0.24, 8, 6), c); th.scale.set(1, 0.8, 1.1); th.position.set(0, 0.42, 0.1); body.add(th);
  const hd = mesh(new THREE.SphereGeometry(0.17, 8, 6), "#3a2a1c"); hd.position.set(0, 0.4, 0.42); body.add(hd);
  for (const s of [-1, 1]) {
    const mand = mesh(new THREE.ConeGeometry(0.04, 0.22, 4), "bone"); mand.position.set(s * 0.08, 0.35, 0.6); mand.rotation.set(Math.PI / 2, 0, s * 0.4); body.add(mand);
    const eye = glowSprite(spitter ? "#b0ff60" : "#ff9a3a", 0.1, 1); eye.position.set(s * 0.08, 0.47, 0.55); body.add(eye);
  }
  if (spitter) { const sac = mesh(new THREE.SphereGeometry(0.2, 8, 6), glowMat("#9aff50", 0.7)); sac.position.set(0, 0.62, -0.45); body.add(sac); }
  const L = legs(body, 6, 0.6, 0.35, "#2a1e14", 0.4);
  return creature(body, { height: 0.8, radius: 0.55, ranged: spitter, idle: (t, v, o) => {
    for (const l of L) l.hip.rotation.x = Math.sin(t * (v > 0.1 ? 14 : 3) + l.phase) * (v > 0.1 ? 0.5 : 0.08) + o.z * 0.4 * Math.sin(l.phase);
  } });
}

function spider(id) {
  const clock = id === "clockwork_spider";
  const c = clock ? "bronze" : id === "grey_widow" ? "#2a2a30" : "#34402a";
  const body = new THREE.Group();
  const ab = mesh(new THREE.SphereGeometry(0.42, 10, 8), c); ab.position.set(0, 0.62, -0.45); ab.scale.set(1, 0.85, 1.1); body.add(ab);
  const ce = mesh(new THREE.SphereGeometry(0.26, 8, 6), clock ? "iron_dark" : c); ce.position.set(0, 0.55, 0.12); body.add(ce);
  if (id === "grey_widow") { const mk = mesh(new THREE.OctahedronGeometry(0.1, 0), "#b02020"); mk.position.set(0, 0.95, -0.45); body.add(mk); }
  if (clock) { const core = glowSprite("#ffb040", 0.5, 0.9); core.position.set(0, 0.62, -0.45); body.add(core); }
  for (let i = 0; i < 4; i++) { const e = glowSprite(id === "blight_spider" ? "#b0ff60" : "#ff3030", 0.08, 1); e.position.set((i - 1.5) * 0.06, 0.66, 0.36); body.add(e); }
  const L = legs(body, 8, 0.7, 0.55, clock ? "iron_dark" : "#1e1e18", 0.55, 0.035);
  return creature(body, { height: 1.1, radius: 0.8, idle: (t, v, o) => {
    for (const l of L) l.hip.rotation.x = Math.sin(t * (v > 0.1 ? 12 : 2) + l.phase) * (v > 0.1 ? 0.45 : 0.06) + o.z * 0.3;
  } });
}

function quadruped(id, tags) {
  const P = {
    canal_rat: { c: "#5a4a3a", s: 0.55, snout: 1.4 }, thorn_wolf: { c: "#4a5a3a", s: 1, spikes: true }, dire_wolf: { c: "#4a4440", s: 1.25 },
    canal_lurker: { c: "#2e4a44", s: 1.1, snout: 1.6, low: true }, old_gnasher: { c: "#5a4a3a", s: 1.1 },
  }[id] || { c: tags.has("vermin") ? "#5a4a3a" : "#4a4440", s: tags.has("vermin") ? 0.55 : 1 };
  const body = new THREE.Group();
  const s = P.s;
  const torso = mesh(new THREE.CapsuleGeometry(0.22 * s, 0.6 * s, 3, 8), P.c); torso.rotation.x = Math.PI / 2; torso.position.y = (P.low ? 0.35 : 0.62) * s; body.add(torso);
  const head = new THREE.Group(); head.position.set(0, (P.low ? 0.4 : 0.78) * s, 0.55 * s); body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.17 * s, 8, 6), P.c));
  const sn = mesh(new THREE.ConeGeometry(0.1 * s, 0.3 * s * (P.snout || 1), 6), P.c); sn.rotation.x = Math.PI / 2; sn.position.z = 0.2 * s; head.add(sn);
  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.05 * s, 0.14 * s, 4), P.c); ear.position.set(sx * 0.09 * s, 0.14 * s, -0.02); head.add(ear);
    const eye = glowSprite(id === "canal_lurker" ? "#80ffd0" : "#ffcf60", 0.07 * s, 1); eye.position.set(sx * 0.07 * s, 0.05 * s, 0.14 * s); head.add(eye);
  }
  if (P.spikes) for (let i = 0; i < 6; i++) { const sp = mesh(new THREE.ConeGeometry(0.04, 0.2, 4), "#6a7a3a"); sp.position.set(0, 0.85, 0.3 - i * 0.14); sp.rotation.x = -0.4; body.add(sp); }
  const tail = mesh(new THREE.CylinderGeometry(0.02 * s, 0.05 * s, 0.5 * s, 5), P.c); tail.position.set(0, 0.62 * s, -0.6 * s); tail.rotation.x = -1; body.add(tail);
  const L = [];
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hip = new THREE.Group(); hip.position.set(x * 0.13 * s, (P.low ? 0.3 : 0.55) * s, z * 0.3 * s); body.add(hip);
    const lg = mesh(new THREE.CylinderGeometry(0.05 * s, 0.035 * s, (P.low ? 0.3 : 0.55) * s, 5), P.c); lg.position.y = -(P.low ? 0.15 : 0.27) * s; hip.add(lg);
    L.push({ hip, ph: (x * z > 0 ? 0 : Math.PI) });
  }
  return creature(body, { height: 1 * s, radius: 0.55 * s, idle: (t, v, o) => {
    for (const l of L) l.hip.rotation.x = Math.sin(t * (v > 0.1 ? 11 : 0) + l.ph) * 0.6;
    head.rotation.x = Math.sin(t * 1.3) * 0.08 - o.pitch * 0.5;
    tail.rotation.z = Math.sin(t * 3) * 0.3;
  } });
}

function slug() {
  const body = new THREE.Group();
  const b = mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 10), new THREE.MeshStandardMaterial({ color: "#3a1a0c", emissive: "#ff5a12", emissiveIntensity: 0.9, roughness: 0.6, emissiveMap: tex("rock", { srgb: false }) }));
  b.rotation.x = Math.PI / 2; b.position.y = 0.3; b.scale.set(1, 1, 0.6); body.add(b);
  const g = glowSprite("#ff7a2a", 1.8, 0.4); g.position.y = 0.4; body.add(g);
  for (const s of [-1, 1]) { const st = mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 4), "#3a1a0c"); st.position.set(s * 0.1, 0.62, 0.55); st.rotation.x = 0.4; body.add(st); }
  return creature(body, { height: 0.7, radius: 0.6, idle: (t) => { b.scale.x = 1 + Math.sin(t * 3) * 0.06; } });
}

function golem(id) {
  const variant = { rune_golem: ["stone", "rune", "#6fe3ff"], ironbound_sentinel: ["iron_dark", "rune", "#6fe3ff"], ward_sentinel: ["stone_pale", "rune", "#6fe3ff"],
    vault_sentinel: ["stone_pale", "rune_gold", "#ffd070"], hollow_warden: ["bronze", "rune", "#9ff4ff"] }[id] || ["iron_dark", "rune", "#ff9a50"];
  const [bodyM, runeM, glow] = variant;
  const root = new THREE.Group();
  const rig = new THREE.Group(); root.add(rig);
  const hips = new THREE.Group(); rig.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  const chest = mesh(new THREE.BoxGeometry(1.1, 0.95, 0.7), bodyM); chest.position.y = 0.55; torso.add(chest);
  const band = mesh(new THREE.BoxGeometry(1.12, 0.14, 0.72), runeM); band.position.y = 0.3; torso.add(band);
  const core = glowSprite(glow, 0.9, 0.9); core.position.set(0, 0.6, 0.38); torso.add(core);
  const neck = new THREE.Group(); neck.position.y = 1.05; torso.add(neck);
  const head = new THREE.Group(); neck.add(head);
  const hm = mesh(new THREE.BoxGeometry(0.42, 0.36, 0.42), bodyM); hm.position.y = 0.18; head.add(hm);
  const eye = glowSprite(glow, 0.3, 1); eye.position.set(0, 0.2, 0.23); head.add(eye);
  const arm = (sx) => {
    const sh = new THREE.Group(); sh.position.set(sx * 0.72, 0.9, 0); torso.add(sh);
    const ua = mesh(new THREE.BoxGeometry(0.34, 0.6, 0.34), bodyM); ua.position.y = -0.3; sh.add(ua);
    const el = new THREE.Group(); el.position.y = -0.6; sh.add(el);
    const fa = mesh(new THREE.BoxGeometry(0.4, 0.65, 0.4), bodyM); fa.position.y = -0.3; el.add(fa);
    const hand = new THREE.Group(); hand.position.y = -0.7; el.add(hand);
    hand.add(mesh(new THREE.BoxGeometry(0.46, 0.3, 0.46), bodyM));
    return { sh, el, hand };
  };
  const leg = (sx) => {
    const hip = new THREE.Group(); hip.position.set(sx * 0.3, 0, 0); hips.add(hip);
    const th = mesh(new THREE.BoxGeometry(0.36, 0.5, 0.36), bodyM); th.position.y = -0.25; hip.add(th);
    const knee = new THREE.Group(); knee.position.y = -0.5; hip.add(knee);
    const sn = mesh(new THREE.BoxGeometry(0.42, 0.5, 0.5), bodyM); sn.position.set(0, -0.25, 0.04); knee.add(sn);
    return { hip, knee };
  };
  const parts = { rig, hips, torso, neck, head, armL: arm(-1), armR: arm(1), legL: leg(-1), legR: leg(1), skirt: null };
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.baseMat = o.material; } });
  const model = { root, parts, height: 2.4, legLen: 1.0, radius: 0.8, tip: parts.armR.hand, baseScale: 1 };
  model.anim = new HumanAnimator(model);
  return model;
}

function colossus() {
  const g = golem("grast_rig");
  const cab = mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.5, 8, 1, true), mat("bronze")); cab.material = mat("bronze"); cab.position.set(0, 1.25, 0.1);
  g.parts.torso.add(cab);
  const pilot = buildHumanoid({ race: "dwarf", role: "guard", helm: "cap", body: "#4a4038" });
  pilot.root.scale.setScalar(0.55); pilot.root.position.set(0, 0.95, 0.1); g.parts.torso.add(pilot.root);
  g.parts.head.visible = false;
  const hammer = mesh(new THREE.BoxGeometry(0.5, 0.5, 0.8), "iron"); hammer.position.set(0, -0.3, 0.3); g.parts.armR.hand.add(hammer);
  g.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.baseMat = o.material; } });
  g.extraTick = [(t) => pilot.anim.update(1 / 60, 0)];
  g.baseScale = 1.1;
  return g;
}

function wisp(id) {
  const color = id === "corrupted_dryad" ? "#9ae07a" : id === "barrow_shade" || id === "ash_wraith" ? "#b0a0c0" : id === "bound_matriarch" ? "#d0b0ff" : id === "lattice_spark" ? "#fff27a" : "#8ff0ff";
  const body = new THREE.Group();
  const core = mesh(new THREE.IcosahedronGeometry(0.2, 1), glowMat(color, 1)); body.add(core);
  const shell = mesh(new THREE.IcosahedronGeometry(0.38, 1), glowMat(color, 0.25)); body.add(shell);
  const halo = glowSprite(color, 1.6, 0.7); body.add(halo);
  const motes = [];
  for (let i = 0; i < 6; i++) { const mo = glowSprite(color, 0.18, 0.9); body.add(mo); motes.push(mo); }
  if (id === "barrow_shade" || id === "ash_wraith" || id === "bound_matriarch") {
    const robe = mesh(new THREE.ConeGeometry(0.4, 1.3, 8, 1, true), glowMat(color, 0.25)); robe.position.y = -0.55; robe.rotation.x = Math.PI; robe.rotation.x = 0; body.add(robe);
  }
  return creature(body, { height: 1.8, radius: 0.5, float: 1.3, ranged: true, tip: core, idle: (t, v, o) => {
    shell.rotation.set(t * 0.7, t, 0);
    motes.forEach((mo, i) => { const a = t * 2 + (i / motes.length) * TAU; mo.position.set(Math.cos(a) * 0.55, Math.sin(a * 1.3) * 0.25, Math.sin(a) * 0.55); });
    halo.material.opacity = 0.55 + 0.25 * Math.sin(t * 3) + o.glow * 0.4;
  } });
}

function drone(color) {
  const body = new THREE.Group();
  body.add(mesh(new THREE.SphereGeometry(0.3, 10, 8), "bronze"));
  const ring = mesh(new THREE.TorusGeometry(0.45, 0.04, 4, 16), "iron_dark"); ring.rotation.x = Math.PI / 2; body.add(ring);
  const eye = glowSprite(color, 0.5, 1); eye.position.z = 0.28; body.add(eye);
  const rotors = [];
  for (let i = 0; i < 3; i++) { const r = mesh(new THREE.BoxGeometry(0.5, 0.02, 0.06), "iron"); const a = (i / 3) * TAU; r.position.set(Math.cos(a) * 0.45, 0.1, Math.sin(a) * 0.45); body.add(r); rotors.push(r); }
  return creature(body, { height: 1.8, radius: 0.5, float: 1.4, ranged: true, tip: eye, idle: (t) => { rotors.forEach((r) => { r.rotation.y = t * 30; }); ring.rotation.z = t; } });
}

function bird() {
  const body = new THREE.Group();
  const b = mesh(new THREE.SphereGeometry(0.35, 8, 6), "#2a2a38"); b.scale.set(0.8, 0.8, 1.4); body.add(b);
  const hd = mesh(new THREE.SphereGeometry(0.18, 8, 6), "#2a2a38"); hd.position.set(0, 0.15, 0.45); body.add(hd);
  const beak = mesh(new THREE.ConeGeometry(0.06, 0.25, 4), "gold"); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.12, 0.66); body.add(beak);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.2, 0.1, 0); body.add(w);
    const wm = mesh(new THREE.BoxGeometry(1.2, 0.03, 0.5), "#2a2a38"); wm.position.x = s * 0.6; w.add(wm);
    const sp = glowSprite("#d7c8ff", 0.4, 0.8); sp.position.x = s * 1.1; w.add(sp);
    wings.push({ w, s });
  }
  return creature(body, { height: 2, radius: 0.8, float: 1.6, ranged: true, tip: beak, idle: (t) => { for (const { w, s } of wings) w.rotation.z = s * Math.sin(t * 8) * 0.6; } });
}

function plant(id) {
  const boss = id === "rotbloom", warden = id === "thornbound_warden";
  const body = new THREE.Group();
  const stem = mesh(new THREE.CylinderGeometry(0.08, 0.18, warden ? 2 : 1.1, 6), "bark"); stem.position.y = warden ? 1 : 0.55; body.add(stem);
  const leaves = [];
  for (let i = 0; i < (warden ? 8 : 5); i++) {
    const l = mesh(new THREE.ConeGeometry(0.12, 0.8, 4), warden ? "foliage_dark" : "foliage_rot");
    const a = (i / 5) * TAU; l.position.set(Math.cos(a) * 0.3, 0.3 + (i % 3) * 0.3, Math.sin(a) * 0.3); l.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); body.add(l); leaves.push(l);
  }
  const bulb = mesh(new THREE.DodecahedronGeometry(warden ? 0.35 : 0.3, 0), boss ? "#8a3a5a" : warden ? "foliage" : "#6a5a2a"); bulb.position.y = warden ? 2.1 : 1.2; body.add(bulb);
  const eye = glowSprite(boss ? "#e080ff" : "#c8f08a", 0.5, 0.9); eye.position.copy(bulb.position); eye.position.z += 0.3; body.add(eye);
  return creature(body, { height: warden ? 2.4 : 1.5, radius: 0.6, tip: bulb, idle: (t, v, o) => {
    body.rotation.z = Math.sin(t * 1.2) * 0.06 + o.roll;
    leaves.forEach((l, i) => { l.rotation.y = Math.sin(t * 2 + i) * 0.2; });
  } });
}

function scarecrow(lord) {
  const m = buildHumanoid({ race: "human", role: "commoner", body: lord ? "#6a4a1a" : "#8a7a4a", skin: "#c9a86a", hair: null, weapon: lord ? "axe" : null });
  const hat = mesh(new THREE.ConeGeometry(0.25, 0.35, 8), "#5a4a2a"); hat.position.y = 0.3; m.parts.head.add(hat);
  const brim = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.02, 10), "#5a4a2a"); brim.position.y = 0.16; m.parts.head.add(brim);
  for (const sx of [-1, 1]) { const e = glowSprite("#ffb040", 0.12, 1); e.position.set(sx * 0.05, 0.1, 0.12); m.parts.head.add(e); }
  m.root.traverse((o) => { if (o.isMesh) o.userData.baseMat = o.material; });
  return m;
}

function swarm(color) {
  const body = new THREE.Group();
  const n = 40;
  const im = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.05, 0), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 }), n);
  body.add(im);
  const seeds = Array.from({ length: n }, () => [Math.random() * TAU, Math.random() * TAU, 0.2 + Math.random() * 0.6, 0.5 + Math.random()]);
  const d = new THREE.Object3D();
  return creature(body, { height: 1.6, radius: 0.7, float: 1.0, idle: (t, v, o) => {
    seeds.forEach(([a, b, r, s], i) => {
      d.position.set(Math.cos(a + t * s * 2) * r, Math.sin(b + t * s * 3) * r * 0.6, Math.sin(a + t * s * 2) * r);
      d.rotation.set(t * 5 + i, t * 3, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
  } });
}

function pylon() {
  const body = new THREE.Group();
  body.add(Object.assign(mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.4, 6), "iron_dark"), { position: new THREE.Vector3(0, 0.2, 0) }));
  const cr = mesh(new THREE.OctahedronGeometry(0.35, 0), "aether_crystal"); cr.scale.set(1, 2.4, 1); cr.position.y = 1.4; body.add(cr);
  const g = glowSprite("#8ff0ff", 2, 0.6); g.position.y = 1.4; body.add(g);
  return creature(body, { height: 2.4, radius: 0.6, ranged: true, tip: cr, idle: (t, v, o) => { cr.rotation.y = t * 0.8; g.material.opacity = 0.5 + 0.2 * Math.sin(t * 4) + o.glow * 0.4; } });
}

function coil(conduit) {
  const body = new THREE.Group();
  body.add(Object.assign(mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.5, 8), "iron_dark"), { position: new THREE.Vector3(0, 0.25, 0) }));
  const col = mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.8, 8), "copper"); col.position.y = 1.3; body.add(col);
  const rings = [];
  for (let i = 0; i < 4; i++) { const r = mesh(new THREE.TorusGeometry(0.4 - i * 0.05, 0.05, 4, 16), conduit ? "gold" : "copper"); r.rotation.x = Math.PI / 2; r.position.y = 0.7 + i * 0.4; body.add(r); rings.push(r); }
  const top = glowSprite("#8ff0ff", 1.2, 0.8); top.position.y = 2.3; body.add(top);
  return creature(body, { height: 2.4, radius: 0.7, ranged: true, tip: top, idle: (t) => { rings.forEach((r, i) => { r.position.y = 0.7 + i * 0.4 + Math.sin(t * 3 + i) * 0.05; }); } });
}

function chainObject() {
  const body = new THREE.Group();
  for (let i = 0; i < 10; i++) { const l = mesh(new THREE.TorusGeometry(0.14, 0.04, 4, 10), "iron_dark"); l.position.y = 0.2 + i * 0.22; l.rotation.y = (i % 2) * Math.PI / 2; body.add(l); }
  const anchor = mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), "stone_dark"); anchor.position.y = 0.15; body.add(anchor);
  const g = glowSprite("#d0b0ff", 1, 0.5); g.position.y = 1.2; body.add(g);
  return creature(body, { height: 2.4, radius: 0.5, tip: g, idle: (t) => { body.rotation.z = Math.sin(t * 1.5) * 0.04; } });
}

function addAura(model) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.05, 40), new THREE.MeshBasicMaterial({ color: "#ff7a3a", transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
  const r = model.radius / model.root.scale.x * 1.6;
  ring.scale.setScalar(r);
  model.root.add(ring);
  const glow = glowSprite("#ff9a50", r * 2.5, 0.25); glow.position.y = 0.2; model.root.add(glow);
  const prev = model.extraTick || [];
  model.extraTick = [...prev, (t) => { ring.rotation.z = t * 0.5; ring.material.opacity = 0.4 + 0.2 * Math.sin(t * 3); }];
  model.aura = ring;
}
