// Room layouts. Authored layouts live in /world/<region>.json; any location without one gets a
// deterministic procedural layout from its biome, so every region of the game is explorable in 3D.
import { kitFor } from "./materials.js";
import { rng } from "./textures.js";

const regionCache = new Map();

export async function loadRegion(region) {
  if (!region) return null;
  if (regionCache.has(region)) return regionCache.get(region);
  const p = fetch(`/world/${region}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  regionCache.set(region, p);
  return p;
}

export async function layoutFor(loc) {
  const reg = await loadRegion(loc.region);
  const authored = reg?.locations?.[loc.id];
  if (authored) return { ...authored, authored: true, kit: authored.kit || reg.kit };
  return generateLayout(loc);
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function generateLayout(loc) {
  const kit = kitFor(loc.biome);
  const r = rng(hash(loc.id));
  const pick = (a) => a[Math.floor(r() * a.length)];
  const busy = loc.npcs.length + loc.features.length + (loc.shop ? 1 : 0) + (loc.rest ? 1 : 0);
  const shape = kit.shape;
  const outdoor = !!kit.sky;
  let W = 26 + Math.min(12, busy * 2) + Math.round(r() * 6), D = 22 + Math.min(10, busy * 2) + Math.round(r() * 6);
  if (shape === "tunnel") { W = 14; D = 34; }
  if (shape === "round") W = D = Math.max(W, D);
  const H = outdoor ? 0 : shape === "cavern" ? 11 : shape === "tunnel" ? 7 : 10;
  const props = [];
  const add = (type, x, z, extra = {}) => props.push({ type, pos: [x, z], rot: extra.rot ?? Math.round(r() * 360), ...extra });
  const lights = [];
  const inner = (m = 4) => [(r() - 0.5) * (W - m * 2), (r() - 0.5) * (D - m * 2)];

  switch (kit.name) {
    case "dwarf": case "foundry": case "ancient": case "vault": case "crypt": case "arcane": {
      if (shape === "round") {
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; add("column", Math.sin(a) * W * 0.36, Math.cos(a) * W * 0.36, { rot: 0, h: H }); }
        add("dais", 0, 0, { r: 3, rot: 0 });
      } else {
        const n = Math.max(2, Math.floor(D / 8));
        for (let i = 0; i < n; i++) {
          const z = -D / 2 + (D / n) * (i + 0.5);
          add(kit.name === "vault" || kit.name === "crypt" ? "column" : "pillar", -W * 0.3, z, { rot: 0, h: H });
          add(kit.name === "vault" || kit.name === "crypt" ? "column" : "pillar", W * 0.3, z, { rot: 0, h: H });
        }
      }
      if (kit.name === "foundry") { add("slag_pit", ...inner(6), { w: 6, d: 3, rot: 0 }); add("pipes", 0, -D / 2 + 0.6, { len: W - 4, rot: 0 }); add("crates", ...inner()); }
      if (kit.name === "vault") { add("pylon", -W * 0.18, 0, { rot: 0 }); add("pylon", W * 0.18, 0, { rot: 0 }); }
      if (kit.name === "crypt") for (let i = 0; i < 4; i++) add("sarcophagus", (i % 2 ? 1 : -1) * W * 0.18, -D * 0.25 + Math.floor(i / 2) * D * 0.35, { rot: 0 });
      if (kit.name === "arcane") { add("shelf", -W / 2 + 0.5, 0, { rot: 90 }); add("shelf", W / 2 - 0.5, 0, { rot: -90 }); add("rune_chains", 0, 0, { area: [W * 0.5, D * 0.5], top: H, n: 8, rot: 0 }); }
      if (kit.name === "dwarf") { add("statue", 0, -D / 2 + 2.5, { rot: 0 }); add("barrels", ...inner()); }
      for (let i = 0; i < 4; i++) { const [x, z] = inner(3); add("brazier", x, z, { light: i < 3 }); }
      break;
    }
    case "mine": case "deep": {
      for (let i = 0; i < 3; i++) add("supports", 0, -D / 3 + (i * D) / 3, { w: Math.min(W - 4, 8), rot: 0 });
      for (let i = 0; i < 5; i++) add("boulder", ...inner(3), { r: 0.8 + r() * 1.2, seed: i });
      for (let i = 0; i < 3; i++) add("crystals", ...inner(3), { light: i < 2 });
      add("rubble", ...inner(4), { n: 12, area: [4, 3] });
      if (r() < 0.6) add("rails", -W * 0.2, 0, { len: D - 4, rot: 0 });
      add("cart", -W * 0.2, D * 0.1, { rot: 0 });
      lights.push({ pos: [0, 5, 0], color: "#ffb070", intensity: 8, distance: 20 });
      break;
    }
    case "mountain": case "ash": {
      for (let i = 0; i < 7; i++) add("boulder", ...inner(3), { r: 1 + r() * 2, seed: i, mat: kit.name === "ash" ? "rock_ash" : "rock" });
      add("mountains", 0, 0, { rot: 0 });
      if (kit.name === "ash") for (let i = 0; i < 3; i++) add("slag_pit", ...inner(6), { w: 3 + r() * 3, d: 2 + r() * 2 });
      else add("campfire", ...inner(6), { lit: true });
      break;
    }
    case "town": {
      add("well", ...inner(8), { rot: 0 });
      for (let i = 0; i < 3; i++) add("stall", ...inner(6), { cloth: pick(["cloth_red", "cloth_blue", "cloth_green", "cloth_tan"]) });
      for (let i = 0; i < 4; i++) add("lamp", ...inner(3), { color: "#ffcf80", light: i < 2 });
      for (let i = 0; i < 3; i++) add("tree", ...inner(4), { h: 6 + r() * 3 });
      add("barrels", ...inner()); add("crates", ...inner());
      break;
    }
    case "forest": case "forest_dark": case "swamp": {
      for (let i = 0; i < 12; i++) add("tree", ...inner(3), { h: 6 + r() * 5, leaf: kit.trees });
      for (let i = 0; i < 8; i++) add("bush", ...inner(2), { leaf: kit.trees });
      for (let i = 0; i < 4; i++) add("boulder", ...inner(3), { r: 0.6 + r() * 1.2, seed: i });
      if (kit.water) for (let i = 0; i < 3; i++) add("water_pool", ...inner(6), { w: 4 + r() * 5, d: 3 + r() * 4 });
      if (r() < 0.5) add("campfire", ...inner(6), { lit: true });
      break;
    }
    case "interior": {
      add("hearth", 0, -D / 2 + 0.7, { rot: 0 });
      add("bar_counter", W / 2 - 3, 0, { w: 7, rot: 90 });
      for (let i = 0; i < 4; i++) add("table", -W * 0.2 + (i % 2) * W * 0.2, -D * 0.15 + Math.floor(i / 2) * D * 0.3, { rot: 0 });
      add("shelf", -W / 2 + 0.5, 0, { rot: 90 }); add("barrels", W / 2 - 1.5, D / 2 - 2, { rot: 0 });
      for (let i = 0; i < 3; i++) add("hanging_lamp", -W * 0.3 + i * W * 0.3, 0, { y: H - 3, top: H, light: i !== 1, rot: 0 });
      break;
    }
    case "sewer": {
      // The channel runs off-centre so the doorways (centred on each wall by default) stay dry.
      add("water_pool", -W * 0.2, 0, { w: W * 0.26, d: D - 2, rot: 0 });
      add("pipes", -W / 2 + 0.6, 0, { len: D - 4, rot: 90 });
      for (let i = 0; i < 3; i++) add("lamp", W * 0.3, -D / 3 + (i * D) / 3, { color: "#ffcf80", light: true, rot: 0 });
      add("crates", -W * 0.3, D * 0.3);
      break;
    }
  }
  if (!outdoor && !["mine", "deep", "sewer", "interior"].includes(kit.name) && lights.length === 0) {
    lights.push({ pos: [0, H - 2, 0], color: kit.name === "foundry" ? "#ff9a50" : "#ffd0a0", intensity: 10, distance: 26 });
  }
  return { shape, size: [W, D], height: H, props, lights, procedural: true };
}
