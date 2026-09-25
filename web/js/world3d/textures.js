// Procedurally painted canvas textures. Everything visual in the world is generated here or from
// primitive geometry, so the project ships no third-party art.
import * as THREE from "three";

const cache = new Map();

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")];
}

function finish(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function noise(g, size, r, amount, alpha = 0.08) {
  for (let i = 0; i < amount; i++) {
    const v = r() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
    const s = 1 + r() * 3;
    g.fillRect(r() * size, r() * size, s, s);
  }
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
}

const PAINTERS = {
  // Grey tones are baked light; materials tint them per region.
  blocks(g, s, r) {
    g.fillStyle = "#8c8883"; g.fillRect(0, 0, s, s);
    const rows = 4, h = s / rows;
    for (let y = 0; y < rows; y++) {
      const cols = 2 + (y % 2);
      const off = (y % 2) * (s / cols / 2);
      for (let x = -1; x < cols + 1; x++) {
        const w = s / cols;
        const l = 0.78 + r() * 0.32;
        g.fillStyle = shade("#9a9690", l);
        g.fillRect(x * w + off + 3, y * h + 3, w - 6, h - 6);
        g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(x * w + off + 3, y * h + 3, w - 6, 3);
        g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x * w + off + 3, y * h + h - 6, w - 6, 3);
      }
    }
    noise(g, s, r, 5000, 0.12);
  },
  flagstone(g, s, r) {
    g.fillStyle = "#5c5751"; g.fillRect(0, 0, s, s);
    const n = 4, w = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const l = 0.75 + r() * 0.35;
      g.fillStyle = shade("#8d8780", l);
      g.fillRect(x * w + 2, y * w + 2, w - 4, w - 4);
      if (r() < 0.3) {
        g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x * w + r() * w, y * w); g.lineTo(x * w + r() * w, y * w + w); g.stroke();
      }
    }
    noise(g, s, r, 6000, 0.1);
  },
  rock(g, s, r) {
    g.fillStyle = "#6f6a64"; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      const l = 0.6 + r() * 0.6;
      g.fillStyle = shade("#7c766f", l);
      g.beginPath();
      const x = r() * s, y = r() * s, rad = 6 + r() * 30;
      g.ellipse(x, y, rad, rad * (0.4 + r() * 0.6), r() * 3, 0, 7);
      g.fill();
    }
    g.strokeStyle = "rgba(0,0,0,.25)";
    for (let i = 0; i < 40; i++) {
      g.lineWidth = 1 + r() * 2;
      g.beginPath(); let x = r() * s, y = r() * s; g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 40; y += (r() - 0.3) * 30; g.lineTo(x, y); }
      g.stroke();
    }
    noise(g, s, r, 7000, 0.14);
  },
  metal(g, s, r) {
    g.fillStyle = "#77787a"; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 2) { g.fillStyle = `rgba(255,255,255,${r() * 0.05})`; g.fillRect(0, y, s, 1); }
    g.fillStyle = "rgba(0,0,0,.3)";
    for (const y of [0, s / 2]) g.fillRect(0, y, s, 3);
    for (let x = 8; x < s; x += 32) for (const y of [10, s / 2 + 10]) {
      g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
      g.fillStyle = "rgba(255,255,255,.25)"; g.beginPath(); g.arc(x - 1, y - 1, 2, 0, 7); g.fill();
    }
    noise(g, s, r, 3000, 0.1);
  },
  wood(g, s, r) {
    g.fillStyle = "#7a5a3a"; g.fillRect(0, 0, s, s);
    const planks = 4, w = s / planks;
    for (let i = 0; i < planks; i++) {
      g.fillStyle = shade("#8a6642", 0.75 + r() * 0.35); g.fillRect(i * w + 1, 0, w - 2, s);
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(40,20,5,${0.1 + r() * 0.2})`; g.lineWidth = 1;
        g.beginPath(); const x = i * w + r() * w; g.moveTo(x, 0);
        g.bezierCurveTo(x + (r() - 0.5) * 12, s / 3, x + (r() - 0.5) * 12, (2 * s) / 3, x + (r() - 0.5) * 6, s); g.stroke();
      }
      g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(i * w, 0, 2, s);
    }
    noise(g, s, r, 2500, 0.08);
  },
  cloth(g, s, r) {
    g.fillStyle = "#b0aaa2"; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 3) { g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.05})`; g.fillRect(0, y, s, 1); }
    for (let x = 0; x < s; x += 3) { g.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.04})`; g.fillRect(x, 0, 1, s); }
    g.fillStyle = "rgba(0,0,0,.15)"; g.fillRect(0, s * 0.8, s, s * 0.06);
  },
  // Dwarven rune band: pale glyphs on black, used as an emissive map.
  runes(g, s, r) {
    g.fillStyle = "#000"; g.fillRect(0, 0, s, s);
    const n = 8, w = s / n;
    g.strokeStyle = "#fff"; g.lineCap = "square";
    for (let i = 0; i < n; i++) {
      g.lineWidth = 3;
      const x0 = i * w + w * 0.25, x1 = i * w + w * 0.75, y0 = s * 0.2, y1 = s * 0.8;
      g.beginPath(); g.moveTo(x0 + (x1 - x0) / 2, y0); g.lineTo(x0 + (x1 - x0) / 2, y1);
      for (let k = 0; k < 2 + Math.floor(r() * 2); k++) {
        const y = y0 + r() * (y1 - y0), side = r() < 0.5 ? x0 : x1;
        g.moveTo(x0 + (x1 - x0) / 2, y); g.lineTo(side, y + (r() - 0.5) * w * 0.8);
      }
      g.stroke();
    }
    g.fillStyle = "#fff"; g.fillRect(0, 2, s, 2); g.fillRect(0, s - 4, s, 2);
  },
  glow(g, s) {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.55)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  },
  spark(g, s) {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.12, "rgba(255,255,255,.9)");
    gr.addColorStop(0.35, "rgba(255,255,255,.15)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.fillStyle = "rgba(255,255,255,.7)";
    g.fillRect(s / 2 - 1, s * 0.1, 2, s * 0.8); g.fillRect(s * 0.1, s / 2 - 1, s * 0.8, 2);
  },
  ring(g, s) {
    g.strokeStyle = "#fff"; g.lineWidth = s * 0.06;
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.42, 0, 7); g.stroke();
    g.globalAlpha = 0.35; g.lineWidth = s * 0.14; g.beginPath(); g.arc(s / 2, s / 2, s * 0.42, 0, 7); g.stroke();
  },
  // Soft darkness for the ends of door corridors so exits read as "leads somewhere".
  fade(g, s) {
    const gr = g.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,1)");
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  },
  grass(g, s, r) {
    g.fillStyle = "#4d5e33"; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = shade("#5f7a3a", 0.6 + r() * 0.7);
      g.fillRect(r() * s, r() * s, 1 + r() * 2, 2 + r() * 5);
    }
    noise(g, s, r, 2000, 0.1);
  },
  dirt(g, s, r) {
    g.fillStyle = "#6b5a45"; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1600; i++) { g.fillStyle = shade("#7a6750", 0.6 + r() * 0.7); const z = 1 + r() * 4; g.fillRect(r() * s, r() * s, z, z); }
    noise(g, s, r, 4000, 0.12);
  },
  water(g, s, r) {
    g.fillStyle = "#1d3a44"; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(180,230,255,${0.05 + r() * 0.12})`; g.lineWidth = 1 + r();
      const x = r() * s, y = r() * s; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 4, x + 24 + r() * 20, y); g.stroke();
    }
  },
  mural(g, s, r) {
    const sky = g.createLinearGradient(0, 0, 0, s);
    sky.addColorStop(0, "#3a5b86"); sky.addColorStop(0.6, "#c99b66"); sky.addColorStop(1, "#5a4636");
    g.fillStyle = sky; g.fillRect(0, 0, s, s);
    g.fillStyle = "#3a3440";
    g.beginPath(); g.moveTo(0, s * 0.7);
    for (let x = 0; x <= s; x += s / 8) g.lineTo(x, s * (0.35 + r() * 0.3));
    g.lineTo(s, s); g.lineTo(0, s); g.fill();
    g.fillStyle = "#f3e7c8"; g.beginPath(); g.arc(s * 0.75, s * 0.22, s * 0.07, 0, 7); g.fill();
    // Dwarves with hammers raised to the sky, painted in a flat, old style.
    for (let i = 0; i < 5; i++) {
      const x = s * (0.12 + i * 0.18), y = s * 0.8;
      g.fillStyle = "#2a1c14"; g.fillRect(x - 10, y - 38, 20, 38); g.beginPath(); g.arc(x, y - 46, 9, 0, 7); g.fill();
      g.strokeStyle = "#2a1c14"; g.lineWidth = 4; g.beginPath(); g.moveTo(x + 8, y - 30); g.lineTo(x + 18, y - 64); g.stroke();
      g.fillRect(x + 10, y - 72, 18, 9);
    }
    noise(g, s, r, 5000, 0.18);
    g.strokeStyle = "rgba(0,0,0,.4)"; g.lineWidth = 2;
    for (let i = 0; i < 20; i++) { g.beginPath(); const x = r() * s, y = r() * s; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 60, y + r() * 50); g.stroke(); }
  },
  sky(g, s) {
    const gr = g.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, "#1b2a44"); gr.addColorStop(0.55, "#5b6f8c"); gr.addColorStop(0.8, "#c99a6a"); gr.addColorStop(1, "#40302a");
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  },
};

export function tex(name, { srgb = true } = {}) {
  const key = `${name}:${srgb}`;
  if (cache.has(key)) return cache.get(key);
  const painter = PAINTERS[name];
  if (!painter) throw new Error(`Unknown texture: ${name}`);
  const size = ["glow", "spark", "ring"].includes(name) ? 64 : name === "fade" ? 32 : 256;
  const [c, g] = canvas(size);
  painter(g, size, rng(name.length * 7919 + name.charCodeAt(0)));
  const t = finish(c, { srgb, repeat: !["glow", "spark", "ring", "fade"].includes(name) });
  cache.set(key, t);
  return t;
}

// A small texture with text, used for signs and banners in the world.
export function textTexture(text, { w = 512, h = 128, color = "#f0d9a8", bg = null, font = "bold 56px Georgia, serif" } = {}) {
  const key = `text:${text}:${w}:${h}:${color}:${bg}:${font}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.font = font; g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2, w - 20);
  const t = finish(c, { repeat: false });
  cache.set(key, t);
  return t;
}

export const TEXTURE_NAMES = Object.keys(PAINTERS);
