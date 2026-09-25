// Procedural low-poly humanoids with a small bone hierarchy and a code-driven animator.
// Race sets proportions; class/role sets outfit; equipment sets the weapon in hand.
import * as THREE from "three";
import { mat } from "./materials.js";

const RACE = {
  human: { leg: 0.88, torso: 0.6, head: 0.13, shoulder: 0.21, bulk: 1, skin: "#d9a784", hair: "#5a3a22" },
  elf: { leg: 0.98, torso: 0.64, head: 0.12, shoulder: 0.185, bulk: 0.82, skin: "#ecd0b0", hair: "#e3d28e", ears: true },
  dwarf: { leg: 0.5, torso: 0.56, head: 0.145, shoulder: 0.27, bulk: 1.4, skin: "#c98f6a", hair: "#9a4526", beard: true },
};

const FEMALE = new Set(["durga", "hilde", "olga", "maren", "elsbeth", "ysolde", "sylwen", "lirael", "naeris", "ketta", "orla", "ilvane"]);

const m = (c) => mat(c);

function capsule(r, len, color, seg = 6) {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len), 3, seg);
  g.translate(0, -len / 2 - r * 0.5, 0);
  return new THREE.Mesh(g, m(color));
}

function mesh(g, color) { return new THREE.Mesh(g, typeof color === "string" ? m(color) : color); }

export function lookForPlayer(p, equipment) {
  const main = equipment?.main_hand, off = equipment?.off_hand;
  return {
    race: p.race, cls: p.cls, name: p.name,
    female: FEMALE.has((p.name || "").toLowerCase()),
    weapon: main?.wtype || { fighter: "sword", mage: "staff", rogue: "dagger" }[p.cls],
    twoHanded: main?.hands === 2,
    offhand: offhandKind(off, p.cls, main),
  };
}

function offhandKind(off, cls, main) {
  if (!off) return cls === "rogue" && main?.wtype === "dagger" ? "dagger" : null;
  const s = `${off.id} ${off.name}`.toLowerCase();
  if (/tome|book|quill|grimoire|codex/.test(s)) return "tome";
  if (/orb|focus|lantern/.test(s)) return "orb";
  if (/dagger|knife|dirk/.test(s)) return "dagger";
  return "shield";
}

// NPC looks: authored in the region layout when given, otherwise inferred from title and region.
export function lookForNpc(npc, region, override = {}) {
  const t = `${npc.title || ""} ${npc.name}`.toLowerCase();
  const first = (npc.name || "").split(/\s+/).pop().toLowerCase();
  let role = "commoner";
  if (/smith/.test(t)) role = "smith";
  else if (/foreman|miner|delver/.test(t)) role = "worker";
  else if (/captain|warden|guard|deepwarden|keeper of the deepgate|sergeant|knight/.test(t)) role = "guard";
  else if (/rune|mage|scholar|archiv|sage|keeper of the runehall|lorekeeper/.test(t)) role = "scholar";
  else if (/brew|proprietor|innkeep|tavern|cook/.test(t)) role = "brewer";
  else if (/guild|master|merchant|trader|elder|lord|lady/.test(t)) role = "merchant";
  const race = { kharum: "dwarf", sylvara: "elf" }[region] || "human";
  return { race, role, female: FEMALE.has(first) || FEMALE.has((npc.id || "").split("_").pop()), name: npc.name, ...override };
}

const ROLE = {
  smith: { body: "#6b4a30", accent: "#3a2a1c", apron: "#4a3526", weapon: "hammer", hair: null },
  worker: { body: "#7a5e3e", accent: "#4a3a2a", helm: "cap", weapon: "hammer" },
  guard: { body: "#5d5e62", accent: "#8a2a22", helm: "helm", weapon: "axe", offhand: "shield", armored: true },
  scholar: { body: "#2e4f6e", accent: "#c9a24a", robe: true, weapon: "staff" },
  brewer: { body: "#8a6a3a", accent: "#e0d2b0", apron: "#d8c8a0", weapon: "tankard" },
  merchant: { body: "#6a2f3a", accent: "#e8b04a", coat: true },
  commoner: { body: "#6f6a52", accent: "#4a3a2a" },
};

const CLS = {
  fighter: { body: "#6a6c70", accent: { dwarf: "#8a2a22", human: "#2d4e7e", elf: "#3f6a3a" }, armored: true, helm: "helm", offhand: "shield" },
  mage: { body: { dwarf: "#5a2a2a", human: "#2e3f78", elf: "#e6e0d0" }, accent: "#c9a24a", robe: true, hood: true },
  rogue: { body: "#3a3026", accent: "#2f3a30", hood: true, scarf: true },
};

export function buildHumanoid(look) {
  const race = RACE[look.race] || RACE.human;
  const s = look.scale || 1;
  const bulk = race.bulk * (look.bulk || 1);
  const style = look.cls ? CLS[look.cls] : ROLE[look.role] || ROLE.commoner;
  const pick = (v) => (typeof v === "object" && v ? v[look.race] || Object.values(v)[0] : v);
  const bodyC = look.body || pick(style.body), accentC = look.accent || pick(style.accent);
  const skin = look.skin || race.skin, hair = look.hair || race.hair;
  const armored = look.armored ?? style.armored;
  const robe = look.robe ?? style.robe;

  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const legLen = race.leg, torsoLen = race.torso, hr = race.head;

  const hips = new THREE.Group(); hips.position.y = legLen; rig.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  const tw = 0.17 * bulk, td = 0.12 * bulk;
  const chestG = new THREE.CylinderGeometry(tw * 1.12, tw * 0.9, torsoLen, 8, 1);
  chestG.translate(0, torsoLen / 2, 0); chestG.scale(1, 1, td / tw);
  torso.add(mesh(chestG, armored ? "iron" : bodyC));
  const belt = mesh(new THREE.CylinderGeometry(tw * 0.95, tw * 0.95, 0.07, 8), "#3a2a1c");
  belt.scale.z = td / tw; belt.position.y = 0.05; torso.add(belt);
  if (armored) {
    const tabard = mesh(new THREE.BoxGeometry(tw * 1.1, torsoLen * 0.9, 0.02), accentC);
    tabard.position.set(0, torsoLen * 0.2, td + 0.015); torso.add(tabard);
  }
  if (look.apron || style.apron) {
    const apron = mesh(new THREE.BoxGeometry(tw * 1.5, torsoLen * 0.8 + legLen * 0.5, 0.02), look.apron || style.apron);
    apron.position.set(0, torsoLen * 0.3 - legLen * 0.25, td + 0.02); torso.add(apron);
  }
  if (look.coat || style.coat) {
    const coat = mesh(new THREE.CylinderGeometry(tw * 1.0, tw * 1.35, legLen * 0.6, 8, 1, true), bodyC);
    coat.position.y = -legLen * 0.3; coat.scale.z = td / tw; torso.add(coat);
    const chain = mesh(new THREE.TorusGeometry(tw * 0.8, 0.012, 4, 16, Math.PI), "gold");
    chain.position.set(0, torsoLen * 0.82, td * 0.5); chain.rotation.set(0.9, 0, Math.PI); torso.add(chain);
  }
  let skirt = null;
  if (robe) {
    skirt = mesh(new THREE.CylinderGeometry(tw * 0.95, tw * 1.6, legLen * 0.96, 10, 1, true), bodyC);
    skirt.material = m(bodyC);
    skirt.position.y = -legLen * 0.48; skirt.scale.z = 0.85; hips.add(skirt);
    const trim = mesh(new THREE.CylinderGeometry(tw * 1.62, tw * 1.62, 0.05, 10, 1, true), accentC);
    trim.position.y = -legLen * 0.47; skirt.add(trim);
  }

  const neck = new THREE.Group(); neck.position.y = torsoLen; torso.add(neck);
  const head = new THREE.Group(); head.position.y = hr * 0.7; neck.add(head);
  const headM = mesh(new THREE.IcosahedronGeometry(hr, 1), skin); headM.position.y = hr * 0.6; headM.scale.set(0.95, 1.05, 1); head.add(headM);
  for (const sx of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(hr * 0.1, 4, 3), "#1a1410");
    eye.position.set(sx * hr * 0.35, hr * 0.7, hr * 0.88); head.add(eye);
  }
  const nose = mesh(new THREE.ConeGeometry(hr * 0.14, hr * 0.35, 4), skin);
  nose.position.set(0, hr * 0.52, hr * 0.98); nose.rotation.x = Math.PI / 2; head.add(nose);
  if (race.ears) for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(hr * 0.13, hr * 0.7, 4), skin);
    ear.position.set(sx * hr * 0.98, hr * 0.7, -hr * 0.1); ear.rotation.set(-0.3, 0, -sx * 1.1); head.add(ear);
  }
  const helm = look.helm ?? style.helm;
  const hood = look.hood ?? style.hood;
  if (helm === "helm") {
    const hm = mesh(new THREE.SphereGeometry(hr * 1.1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), "iron");
    hm.position.y = hr * 0.62; head.add(hm);
    const guard = mesh(new THREE.BoxGeometry(hr * 0.16, hr * 0.7, hr * 0.12), "iron");
    guard.position.set(0, hr * 0.6, hr * 1.05); head.add(guard);
    if (look.race === "dwarf") for (const sx of [-1, 1]) {
      const crest = mesh(new THREE.ConeGeometry(hr * 0.12, hr * 0.6, 5), "bronze");
      crest.position.set(sx * hr * 0.9, hr * 1.1, 0); crest.rotation.z = -sx * 0.9; head.add(crest);
    }
  } else if (helm === "cap") {
    const cap = mesh(new THREE.SphereGeometry(hr * 1.08, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.45), "#8a6a2a");
    cap.position.y = hr * 0.68; head.add(cap);
    const lamp = mesh(new THREE.SphereGeometry(hr * 0.18, 6, 4), "aether");
    lamp.position.set(0, hr * 1.4, hr * 0.85); head.add(lamp);
  } else if (hood) {
    const hd = mesh(new THREE.SphereGeometry(hr * 1.22, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.62), accentC === "#c9a24a" ? bodyC : accentC);
    hd.position.set(0, hr * 0.55, -hr * 0.12); head.add(hd);
  } else if (hair) {
    const hm = mesh(new THREE.SphereGeometry(hr * 1.06, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), hair);
    hm.position.set(0, hr * 0.66, -hr * 0.05); head.add(hm);
    if (look.female || look.race === "elf") {
      const tail = mesh(new THREE.CylinderGeometry(hr * 0.35, hr * 0.12, hr * (look.race === "elf" ? 3 : 2.2), 6), hair);
      tail.position.set(0, -hr * 0.3, -hr * 0.9); tail.rotation.x = 0.25; head.add(tail);
    }
  }
  if (race.beard && !look.female && look.beard !== false) {
    const beard = mesh(new THREE.ConeGeometry(hr * 0.85, hr * 2.2, 7), look.beardColor || hair);
    beard.position.set(0, -hr * 0.35, hr * 0.55); beard.rotation.x = Math.PI + 0.25; head.add(beard);
    const mus = mesh(new THREE.BoxGeometry(hr * 1.1, hr * 0.2, hr * 0.3), look.beardColor || hair);
    mus.position.set(0, hr * 0.33, hr * 0.92); head.add(mus);
  } else if (race.beard && look.female) {
    for (const sx of [-1, 1]) {
      const braid = mesh(new THREE.CylinderGeometry(hr * 0.16, hr * 0.1, hr * 2.4, 5), hair);
      braid.position.set(sx * hr * 0.85, -hr * 0.2, hr * 0.1); head.add(braid);
    }
    if (look.beard === "braided") {
      const bc = look.beardColor || hair;
      const plait = mesh(new THREE.CylinderGeometry(hr * 0.26, hr * 0.12, hr * 2.0, 6), bc);
      plait.position.set(0, -hr * 1.05, hr * 0.72); plait.rotation.x = 0.22; head.add(plait);
      const chin = mesh(new THREE.ConeGeometry(hr * 0.7, hr * 0.8, 7), bc);
      chin.position.set(0, -hr * 0.3, hr * 0.62); chin.rotation.x = Math.PI + 0.3; head.add(chin);
      const clasp = mesh(new THREE.CylinderGeometry(hr * 0.2, hr * 0.2, hr * 0.25, 6), "#c9a24a");
      clasp.position.set(0, -hr * 1.6, hr * 0.84); head.add(clasp);
    }
  }
  if (look.scarf ?? style.scarf) {
    const sc = mesh(new THREE.CylinderGeometry(hr * 0.95, hr * 1.1, hr * 0.6, 8), accentC);
    sc.position.y = hr * 0.15; head.add(sc);
  }

  const limbR = 0.055 * Math.sqrt(bulk);
  const upper = 0.3 * (look.race === "dwarf" ? 0.85 : 1), fore = 0.27 * (look.race === "dwarf" ? 0.85 : 1);
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sx * race.shoulder * Math.sqrt(bulk), torsoLen * 0.9, 0); torso.add(sh);
    const ua = capsule(limbR, upper - limbR, armored ? "iron" : bodyC); sh.add(ua);
    if (armored) { const pad = mesh(new THREE.SphereGeometry(limbR * 2.2, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), "iron"); pad.position.y = 0.02; sh.add(pad); }
    const el = new THREE.Group(); el.position.y = -upper; sh.add(el);
    el.add(capsule(limbR * 0.9, fore - limbR, robe ? bodyC : armored ? "iron_dark" : skin));
    const hand = new THREE.Group(); hand.position.y = -fore - 0.02; el.add(hand);
    hand.add(mesh(new THREE.SphereGeometry(limbR * 1.2, 6, 4), armored ? "iron_dark" : skin));
    arms.push({ sh, el, hand });
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * tw * 0.5, 0, 0); hips.add(hip);
    const lr = limbR * 1.25;
    hip.add(capsule(lr, legLen * 0.5 - lr, armored ? "iron_dark" : look.legs || "#3a3026"));
    const knee = new THREE.Group(); knee.position.y = -legLen * 0.5; hip.add(knee);
    knee.add(capsule(lr * 0.9, legLen * 0.45 - lr, armored ? "iron" : "#4a3a2a"));
    const foot = mesh(new THREE.BoxGeometry(lr * 2, lr * 1.3, lr * 3.6), "#2a1e14");
    foot.position.set(0, -legLen * 0.5 + lr * 0.6, lr * 0.8); knee.add(foot);
    legs.push({ hip, knee });
  }

  // Weapons. Local +z of the hand points forward when the arm hangs; blades lie along it.
  const weapon = look.weapon ?? style.weapon;
  const offhand = look.offhand ?? (look.cls ? (look.cls === "fighter" && !look.twoHanded ? "shield" : null) : style.offhand);
  const wg = buildWeapon(weapon, look);
  if (wg) arms[1].hand.add(wg);
  const og = buildOffhand(offhand);
  if (og) arms[0].hand.add(og);

  root.scale.setScalar(s);
  const height = (legLen + torsoLen + hr * 2.2) * s;
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.baseMat = o.material; } });
  const parts = { rig, hips, torso, neck, head, armL: arms[0], armR: arms[1], legL: legs[0], legR: legs[1], skirt };
  const model = { root, parts, height, legLen, radius: 0.35 * s * Math.sqrt(bulk), look, weaponKind: weapon, ranged: weapon === "bow" || weapon === "wand",
    tip: wg?.userData.tip || arms[1].hand };
  model.anim = new HumanAnimator(model);
  return model;
}

function buildWeapon(kind, look) {
  const g = new THREE.Group();
  switch (kind) {
    case "sword": {
      const len = look.twoHanded ? 1.2 : 0.8;
      const blade = mesh(new THREE.BoxGeometry(0.06, 0.015, len), "iron"); blade.position.z = len / 2 + 0.1; g.add(blade);
      const guard = mesh(new THREE.BoxGeometry(0.26, 0.04, 0.04), "bronze"); guard.position.z = 0.08; g.add(guard);
      const grip = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 5), "leather"); grip.rotation.x = Math.PI / 2; g.add(grip);
      break;
    }
    case "axe": {
      const len = look.twoHanded ? 1.1 : 0.7;
      const haft = mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 5), "wood_dark"); haft.rotation.x = Math.PI / 2; haft.position.z = len / 2 - 0.1; g.add(haft);
      const head = mesh(new THREE.BoxGeometry(0.03, 0.32, 0.2), "iron"); head.position.set(0, 0.12, len - 0.18); g.add(head);
      break;
    }
    case "hammer": case "mace": {
      const haft = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 5), "wood_dark"); haft.rotation.x = Math.PI / 2; haft.position.z = 0.22; g.add(haft);
      const head = mesh(kind === "mace" ? new THREE.DodecahedronGeometry(0.1, 0) : new THREE.BoxGeometry(0.14, 0.14, 0.24), "iron");
      head.position.z = 0.5; if (kind === "hammer") head.rotation.x = Math.PI / 2; g.add(head);
      break;
    }
    case "dagger": {
      const blade = mesh(new THREE.BoxGeometry(0.04, 0.012, 0.32), "iron"); blade.position.z = 0.2; g.add(blade);
      const guard = mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), "bronze"); guard.position.z = 0.04; g.add(guard);
      break;
    }
    case "staff": {
      const st = mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.7, 6), "wood_dark"); st.position.y = 0.35; g.add(st);
      const orb = mesh(new THREE.OctahedronGeometry(0.08, 0), "aether"); orb.position.y = 1.25; g.add(orb);
      g.userData.tip = orb;
      break;
    }
    case "wand": {
      const w = mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.35, 5), "wood_dark"); w.rotation.x = Math.PI / 2; w.position.z = 0.15; g.add(w);
      const tip = mesh(new THREE.SphereGeometry(0.03, 6, 4), "aether"); tip.position.z = 0.34; g.add(tip);
      g.userData.tip = tip;
      break;
    }
    case "bow": {
      const bow = mesh(new THREE.TorusGeometry(0.55, 0.018, 4, 16, Math.PI * 0.9), "wood_dark");
      bow.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.05); bow.position.z = -0.05; g.add(bow);
      break;
    }
    case "tankard": {
      const t = mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.16, 8), "copper"); t.position.set(0, 0, 0.05); g.add(t);
      break;
    }
    default: return null;
  }
  return g;
}

function buildOffhand(kind) {
  const g = new THREE.Group();
  if (kind === "shield") {
    const sh = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 10), "wood");
    sh.rotation.z = Math.PI / 2; sh.position.set(-0.06, 0.05, 0.05); g.add(sh);
    const rim = mesh(new THREE.TorusGeometry(0.3, 0.02, 4, 12), "iron"); rim.rotation.y = Math.PI / 2; rim.position.copy(sh.position); g.add(rim);
    const boss = mesh(new THREE.SphereGeometry(0.07, 6, 4), "bronze"); boss.position.set(-0.1, 0.05, 0.05); g.add(boss);
  } else if (kind === "tome") {
    const b = mesh(new THREE.BoxGeometry(0.18, 0.05, 0.24), "cloth_red"); b.position.z = 0.08; g.add(b);
  } else if (kind === "orb") {
    const o = mesh(new THREE.SphereGeometry(0.08, 8, 6), "aether"); o.position.set(0, 0.04, 0.08); g.add(o);
  } else if (kind === "dagger") {
    const blade = mesh(new THREE.BoxGeometry(0.04, 0.012, 0.3), "iron"); blade.position.z = 0.18; g.add(blade);
  } else return null;
  return g;
}

const ease = (t) => t * t * (3 - 2 * t);
const bump = (t) => Math.sin(Math.PI * Math.max(0, Math.min(1, t)));

// One-shot actions: dur (s), impact (fraction), pose(t) -> additive joint offsets.
const ACTIONS = {
  attack: { dur: 0.7, impact: 0.52, pose: (t) => {
    const up = t < 0.42 ? ease(t / 0.42) : t < 0.6 ? 1 - ease((t - 0.42) / 0.18) * 1.6 : -0.6 * (1 - ease((t - 0.6) / 0.4));
    return { armRx: -2.4 * Math.max(0, up) + (up < 0 ? up * 0.5 : 0), foreRx: -0.6 * bump(t), torsoY: 0.45 * (t < 0.42 ? ease(t / 0.42) : 1 - ease(Math.min(1, (t - 0.42) / 0.3)) * 1.6), torsoX: 0.25 * bump((t - 0.35) / 0.5) };
  } },
  shoot: { dur: 0.85, impact: 0.62, pose: (t) => ({ armLx: -1.5 * bump(t / 1.1), armLz: 0, armRx: -1.4 * bump(t / 1.1), foreRx: -1.6 * ease(Math.min(1, t / 0.6)) * (t < 0.62 ? 1 : 1 - (t - 0.62) / 0.38), torsoY: -0.5 * bump(t) }) },
  cast: { dur: 0.95, impact: 0.58, pose: (t) => {
    const k = t < 0.5 ? ease(t / 0.5) : 1 - ease((t - 0.5) / 0.5) * 0.9;
    return { armRx: -1.9 * k - (t > 0.5 && t < 0.7 ? 0.5 : 0), armLx: -1.5 * k, armLz: -0.3 * k, torsoX: -0.15 * k + (t > 0.55 ? 0.2 * bump((t - 0.55) / 0.3) : 0) };
  } },
  hit: { dur: 0.4, impact: 0, pose: (t) => ({ torsoX: -0.4 * bump(t), headX: -0.3 * bump(t), armRx: 0.4 * bump(t), armLx: 0.4 * bump(t) }) },
  defend: { dur: 0.8, impact: 0.3, pose: (t) => ({ armLx: -1.4 * bump(t * 0.8 + 0.1), armLz: 0.5 * bump(t), hipsY: -0.08 * bump(t), torsoX: 0.2 * bump(t) }) },
  item: { dur: 0.8, impact: 0.55, pose: (t) => ({ armRx: -2.2 * bump(t), foreRx: -1.4 * bump(t), headX: -0.3 * bump((t - 0.3) / 0.5) }) },
  talk: { dur: 1.4, impact: 0, pose: (t) => ({ armRx: -0.8 * bump(t), foreRx: -0.9 * bump(t), armRz: 0.2 * Math.sin(t * 12) * bump(t), headY: 0.15 * Math.sin(t * 6) }) },
  victory: { dur: 1.3, impact: 0, pose: (t) => ({ armRx: -3.0 * bump(t), foreRx: -0.2, torsoX: -0.1 * bump(t) }) },
  die: { dur: 1.0, impact: 1, hold: true, pose: (t) => ({ fall: -1.5 * ease(t), hipsY: -0.1 * ease(t), armRx: -1 * ease(t), armLx: -1.2 * ease(t), headX: -0.4 * ease(t) }) },
  interact: { dur: 0.7, impact: 0.5, pose: (t) => ({ armRx: -1.2 * bump(t), foreRx: -0.4 * bump(t), torsoX: 0.3 * bump(t) }) },
  cheer: { dur: 1.1, impact: 0, pose: (t) => ({ armRx: -2.8 * bump(t), armLx: -2.8 * bump(t), hipsY: 0.05 * bump(t * 2) }) },
};

export class HumanAnimator {
  constructor(model) {
    this.m = model;
    this.t = Math.random() * 10;
    this.phase = 0;
    this.action = null;
    this.dead = false;
    this.lookYaw = 0;
  }

  play(name, speed = 1) {
    const a = ACTIONS[name];
    if (!a || (this.dead && name !== "revive")) return Promise.resolve();
    if (name === "die") this.dead = true;
    return new Promise((resolve) => {
      if (this.action) this.action.resolve();
      this.action = { a, name, t: 0, speed, resolve };
    });
  }

  impactDelay(name, speed = 1) { const a = ACTIONS[name]; return a ? (a.dur * a.impact) / speed : 0; }

  revive() { this.dead = false; this.action = null; this.m.parts.rig.rotation.x = 0; }

  update(dt, moveSpeed = 0) {
    this.t += dt;
    const p = this.m.parts;
    const walk = Math.min(1.4, moveSpeed / 3.5);
    this.phase += dt * (4 + moveSpeed * 2.1) * (walk > 0.05 ? 1 : 0);
    const sw = Math.sin(this.phase);
    const o = { armRx: -sw * 0.55 * walk, armLx: sw * 0.55 * walk, armRz: 0, armLz: 0, foreRx: -0.25 - 0.3 * walk, foreLx: -0.25 - 0.3 * walk,
      legRx: sw * 0.7 * walk, legLx: -sw * 0.7 * walk, kneeR: Math.max(0, -Math.cos(this.phase)) * 0.9 * walk, kneeL: Math.max(0, Math.cos(this.phase)) * 0.9 * walk,
      torsoX: 0.08 * walk, torsoY: 0, headX: 0, headY: this.lookYaw, hipsY: Math.abs(Math.cos(this.phase)) * 0.04 * walk - 0.02 * walk, fall: 0 };
    const br = Math.sin(this.t * 1.8) * (1 - walk);
    o.torsoX += br * 0.015; o.armRz += br * 0.02; o.armLz -= br * 0.02;
    if (this.action) {
      const A = this.action;
      A.t += (dt * A.speed) / A.a.dur;
      const tt = Math.min(1, A.t);
      const d = A.a.pose(tt);
      for (const k in d) o[k] = (o[k] || 0) + d[k];
      if (A.t >= 1) {
        if (!A.a.hold) this.action = null;
        else A.t = 1;
        A.resolve();
        if (A.a.hold) A.resolve = () => {};
      }
    }
    p.hips.position.y = this.m.legLen + o.hipsY;
    p.torso.rotation.set(o.torsoX, o.torsoY, 0);
    p.head.rotation.set(o.headX, o.headY, 0);
    p.armR.sh.rotation.set(o.armRx, 0, -0.08 + o.armRz);
    p.armL.sh.rotation.set(o.armLx, 0, 0.08 + o.armLz);
    p.armR.el.rotation.x = o.foreRx;
    p.armL.el.rotation.x = o.foreLx;
    if (p.legR) {
      p.legR.hip.rotation.x = o.legRx; p.legL.hip.rotation.x = o.legLx;
      p.legR.knee.rotation.x = o.kneeR; p.legL.knee.rotation.x = o.kneeL;
    }
    p.rig.rotation.x = o.fall;
    if (p.skirt) p.skirt.rotation.x = -0.12 * walk * sw;
    for (const f of this.m.extraTick || []) f(this.t);
  }
}

// Free a discarded model's GPU buffers. Named materials come from the shared cache and stay alive.
export function disposeModel(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    o.userData.tintMat?.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const mm of mats) if (!mm.name) mm.dispose();
  });
}

// Tint every mesh of a model toward a colour (hit flashes, frozen, stealth). amount 0 restores.
export function tintModel(root, color, amount, opacity = 1) {
  root.traverse((o) => {
    if (!o.isMesh || !o.userData.baseMat) return;
    const base = o.userData.baseMat;
    if (amount <= 0 && opacity >= 1) { o.material = base; return; }
    if (!o.userData.tintMat) o.userData.tintMat = base.clone();
    const tm = o.userData.tintMat;
    tm.color.copy(base.color).lerp(new THREE.Color(color), amount);
    if (tm.emissive) tm.emissive.set(color).multiplyScalar(amount * 0.6);
    tm.transparent = opacity < 1 || base.transparent;
    tm.opacity = Math.min(base.opacity ?? 1, opacity);
    o.material = tm;
  });
}
