// Cached materials. Merged static geometry is grouped by material name, so the fewer distinct
// materials a room uses, the fewer draw calls it costs.
import * as THREE from "three";
import { tex } from "./textures.js";

const cache = new Map();

const DEFS = {
  stone: () => std({ map: "blocks", color: "#b3a99c", roughness: 0.92 }),
  stone_dark: () => std({ map: "blocks", color: "#6e665d", roughness: 0.95 }),
  stone_red: () => std({ map: "blocks", color: "#b48a70", roughness: 0.9 }),
  stone_pale: () => std({ map: "blocks", color: "#d9d2c4", roughness: 0.85 }),
  floor: () => std({ map: "flagstone", color: "#a39a8e", roughness: 0.95 }),
  floor_dark: () => std({ map: "flagstone", color: "#6a635a", roughness: 0.95 }),
  rock: () => std({ map: "rock", color: "#8a8077", roughness: 1 }),
  rock_dark: () => std({ map: "rock", color: "#524c47", roughness: 1 }),
  rock_ash: () => std({ map: "rock", color: "#5a5250", roughness: 1 }),
  dirt: () => std({ map: "dirt", color: "#9c8a72", roughness: 1 }),
  grass: () => std({ map: "grass", color: "#9fb07a", roughness: 1 }),
  moss: () => std({ map: "grass", color: "#6f8a52", roughness: 1 }),
  wood: () => std({ map: "wood", color: "#a7825c", roughness: 0.85 }),
  wood_dark: () => std({ map: "wood", color: "#5e4632", roughness: 0.9 }),
  iron: () => std({ map: "metal", color: "#5d5e62", roughness: 0.55, metalness: 0.75 }),
  iron_dark: () => std({ map: "metal", color: "#35363a", roughness: 0.6, metalness: 0.7 }),
  bronze: () => std({ map: "metal", color: "#b98a4a", roughness: 0.4, metalness: 0.85 }),
  copper: () => std({ map: "metal", color: "#c07850", roughness: 0.35, metalness: 0.85 }),
  gold: () => std({ color: "#e8b04a", roughness: 0.3, metalness: 1 }),
  cloth_red: () => std({ map: "cloth", color: "#9a3a2c", roughness: 1, side: THREE.DoubleSide }),
  cloth_blue: () => std({ map: "cloth", color: "#35557e", roughness: 1, side: THREE.DoubleSide }),
  cloth_green: () => std({ map: "cloth", color: "#4d6b3a", roughness: 1, side: THREE.DoubleSide }),
  cloth_tan: () => std({ map: "cloth", color: "#b89a6a", roughness: 1, side: THREE.DoubleSide }),
  cloth_purple: () => std({ map: "cloth", color: "#5a3f78", roughness: 1, side: THREE.DoubleSide }),
  leather: () => std({ color: "#6b4a30", roughness: 0.8 }),
  bone: () => std({ color: "#d8cdb4", roughness: 0.8 }),
  paper: () => std({ color: "#e0d2b0", roughness: 1 }),
  foliage: () => std({ color: "#4f6f35", roughness: 1, flatShading: true }),
  foliage_dark: () => std({ color: "#2f4a2a", roughness: 1, flatShading: true }),
  foliage_rot: () => std({ color: "#4d4a30", roughness: 1, flatShading: true }),
  bark: () => std({ map: "wood", color: "#6b5440", roughness: 1 }),
  water: () => std({ map: "water", color: "#6fa6b8", roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 }),
  mural: () => std({ map: "mural", color: "#ffffff", roughness: 1, repeat: false }),
  void: () => new THREE.MeshBasicMaterial({ color: 0x000000 }),
  fade: () => new THREE.MeshBasicMaterial({ map: tex("fade"), transparent: true, depthWrite: false, color: 0x000000 }),
  // Emissive "light-bearing" materials. These carry the Aether identity: cold cyan light in warm stone.
  aether: () => new THREE.MeshBasicMaterial({ color: "#8ff0ff" }),
  aether_dim: () => std({ color: "#1d4a55", emissive: "#2aa7c4", emissiveIntensity: 0.9, roughness: 0.4 }),
  aether_crystal: () => std({ color: "#5fd6ea", emissive: "#3ec6e0", emissiveIntensity: 1.2, roughness: 0.2, flatShading: true, transparent: true, opacity: 0.9 }),
  ember: () => new THREE.MeshBasicMaterial({ color: "#ff8a3a" }),
  ember_dim: () => std({ color: "#3a1a0c", emissive: "#e0521a", emissiveIntensity: 1.4, roughness: 0.9 }),
  slag: () => std({ map: "rock", color: "#3a1a0c", emissive: "#ff5a12", emissiveIntensity: 1.1, emissiveMap: "rock" }),
  rune: () => std({ map: "runes", color: "#2a2724", emissive: "#6fe3ff", emissiveIntensity: 1.3, emissiveMap: "runes", srgbEmissive: false }),
  rune_dead: () => std({ map: "runes", color: "#2a2724", emissive: "#23454d", emissiveIntensity: 0.6, emissiveMap: "runes" }),
  rune_gold: () => std({ map: "runes", color: "#2a2724", emissive: "#f0b24a", emissiveIntensity: 1.2, emissiveMap: "runes" }),
  lamp_warm: () => new THREE.MeshBasicMaterial({ color: "#ffcf80" }),
  glass: () => std({ color: "#9fc6cc", roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.35 }),
  shadow_blob: () => new THREE.MeshBasicMaterial({ map: tex("glow"), color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
};

function std(o) {
  const p = { color: o.color, roughness: o.roughness ?? 0.9, metalness: o.metalness ?? 0 };
  if (o.map) p.map = tex(o.map);
  if (o.emissive) { p.emissive = new THREE.Color(o.emissive); p.emissiveIntensity = o.emissiveIntensity ?? 1; }
  if (o.emissiveMap) p.emissiveMap = tex(o.emissiveMap, { srgb: false });
  if (o.flatShading) p.flatShading = true;
  if (o.transparent) { p.transparent = true; p.opacity = o.opacity; }
  if (o.side) p.side = o.side;
  return new THREE.MeshStandardMaterial(p);
}

export function mat(name) {
  let m = cache.get(name);
  if (m) return m;
  if (name.startsWith("#")) {
    m = new THREE.MeshStandardMaterial({ color: name, roughness: 0.8, flatShading: true });
  } else {
    const def = DEFS[name];
    if (!def) throw new Error(`Unknown material: ${name}`);
    m = def();
  }
  m.name = name;
  cache.set(name, m);
  return m;
}

export const hasMaterial = (name) => name.startsWith("#") || name in DEFS;
export const MATERIAL_NAMES = Object.keys(DEFS);

// Per-region art direction: which materials build the shell, and how the space is lit.
export const KITS = {
  dwarf: { wall: "stone", floor: "floor", trim: "stone_dark", ceil: "rock_dark", accent: "bronze", rune: "rune",
    ambient: ["#6a5a4a", "#1a120c", 0.9], fog: ["#1a120d", 0.018], key: null, door: "arch", particles: "dust" },
  arcane: { wall: "stone_pale", floor: "floor", trim: "stone_dark", ceil: "rock_dark", accent: "bronze", rune: "rune",
    ambient: ["#4f6a78", "#101418", 1.0], fog: ["#0e1418", 0.02], key: null, door: "arch", particles: "motes" },
  mine: { wall: "rock", floor: "dirt", trim: "wood_dark", ceil: "rock_dark", accent: "wood", rune: "rune_dead",
    ambient: ["#5a4a3a", "#0c0907", 0.75], fog: ["#0d0a08", 0.035], key: null, door: "tunnel", particles: "dust" },
  deep: { wall: "rock_dark", floor: "floor_dark", trim: "iron_dark", ceil: "rock_dark", accent: "iron", rune: "rune",
    ambient: ["#3a4450", "#07080a", 0.6], fog: ["#06080a", 0.04], key: null, door: "tunnel", particles: "motes" },
  ancient: { wall: "stone_dark", floor: "floor_dark", trim: "iron_dark", ceil: "rock_dark", accent: "bronze", rune: "rune",
    ambient: ["#2e4a55", "#050709", 0.7], fog: ["#05080a", 0.03], key: null, door: "gate", particles: "motes" },
  foundry: { wall: "stone_red", floor: "floor_dark", trim: "iron_dark", ceil: "rock_dark", accent: "copper", rune: "rune_gold",
    ambient: ["#7a4a2a", "#120805", 0.85], fog: ["#1a0c06", 0.028], key: null, door: "gate", particles: "embers" },
  mountain: { wall: "rock", floor: "floor", trim: "stone_dark", ceil: null, accent: "bronze", rune: "rune",
    ambient: ["#9fb4d0", "#3a3028", 1.1], fog: ["#8a9ab0", 0.012], key: ["#ffe2b8", 1.6], sky: true, door: "gate", particles: "snow" },
  town: { wall: "stone_pale", floor: "floor", trim: "wood_dark", ceil: null, accent: "wood", rune: "rune_dead",
    ambient: ["#b0c0d8", "#4a4030", 1.2], fog: ["#9aa6b4", 0.012], key: ["#fff0d0", 1.8], sky: true, door: "arch", particles: null },
  forest: { wall: "rock", floor: "grass", trim: "bark", ceil: null, accent: "wood", rune: "rune",
    ambient: ["#a0c0a0", "#2a3020", 1.0], fog: ["#5a7060", 0.022], key: ["#f0f0c0", 1.4], sky: true, door: "trail", particles: "motes", trees: "foliage" },
  forest_dark: { wall: "rock_dark", floor: "moss", trim: "bark", ceil: null, accent: "wood_dark", rune: "rune",
    ambient: ["#607060", "#10140c", 0.8], fog: ["#1c261c", 0.04], key: ["#c0d0a0", 0.7], sky: true, door: "trail", particles: "motes", trees: "foliage_dark" },
  swamp: { wall: "rock_dark", floor: "moss", trim: "bark", ceil: null, accent: "wood_dark", rune: "rune",
    ambient: ["#7a8a70", "#1a1c12", 0.9], fog: ["#3a4434", 0.035], key: ["#d8d8b0", 0.9], sky: true, door: "trail", particles: "motes", trees: "foliage_rot", water: true },
  crypt: { wall: "stone_dark", floor: "floor_dark", trim: "stone_dark", ceil: "rock_dark", accent: "iron", rune: "rune",
    ambient: ["#40485a", "#060608", 0.7], fog: ["#07080c", 0.035], key: null, door: "arch", particles: "dust" },
  sewer: { wall: "stone_dark", floor: "floor_dark", trim: "iron_dark", ceil: "stone_dark", accent: "copper", rune: "rune_dead",
    ambient: ["#4a5a4a", "#080a08", 0.75], fog: ["#0c100c", 0.035], key: null, door: "tunnel", particles: "dust", water: true },
  interior: { wall: "wood", floor: "wood_dark", trim: "wood_dark", ceil: "wood_dark", accent: "bronze", rune: "rune_dead",
    ambient: ["#8a6a4a", "#1a120c", 1.0], fog: ["#1a120c", 0.02], key: null, door: "door", particles: "dust" },
  ash: { wall: "rock_ash", floor: "rock_ash", trim: "rock_dark", ceil: null, accent: "iron", rune: "rune",
    ambient: ["#a08070", "#301814", 1.0], fog: ["#4a3530", 0.03], key: ["#ffb080", 1.2], sky: true, door: "trail", particles: "ash" },
  vault: { wall: "stone_pale", floor: "floor", trim: "bronze", ceil: "stone_dark", accent: "gold", rune: "rune",
    ambient: ["#5a7a88", "#0a0c10", 0.9], fog: ["#0c1418", 0.022], key: null, door: "gate", particles: "motes" },
};

// Biomes (engine data) to kits (client art direction) and default room shape.
export const BIOME_KIT = {
  dwarf_hall: ["dwarf", "hall"], dwarf_arcane: ["arcane", "round"], mine: ["mine", "cavern"],
  mine_deep: ["deep", "cavern"], vault_ancient: ["ancient", "round"], foundry: ["foundry", "hall"],
  mountain: ["mountain", "terrace"], mountain_peak: ["mountain", "terrace"],
  city: ["town", "plaza"], city_arcane: ["town", "plaza"], city_gate: ["town", "plaza"], city_river: ["town", "plaza"],
  town: ["town", "plaza"], village: ["town", "plaza"], farmland: ["town", "plaza"], road: ["forest", "glade"],
  hillfort: ["town", "plaza"], guildhall: ["interior", "hall"], tavern: ["interior", "hall"],
  forest: ["forest", "glade"], forest_city: ["forest", "glade"], forest_arcane: ["forest", "glade"],
  forest_dark: ["forest_dark", "glade"], forest_mist: ["forest_dark", "glade"], forest_rot: ["swamp", "glade"],
  marsh: ["swamp", "glade"], barrow: ["crypt", "tunnel"], chapel_drowned: ["crypt", "hall"],
  sewer: ["sewer", "tunnel"], sewer_machine: ["sewer", "hall"], archive: ["vault", "hall"],
  ash: ["ash", "glade"], tower_ancient: ["arcane", "round"],
  vault: ["vault", "hall"], vault_archive: ["vault", "hall"], vault_heart: ["vault", "round"], vault_lattice: ["vault", "round"],
};

export function kitFor(biome) {
  const [kit, shape] = BIOME_KIT[biome] || ["dwarf", "hall"];
  return { name: kit, shape, ...KITS[kit] };
}
