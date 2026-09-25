// Synthesised sound cues (WebAudio) so the game ships no audio assets. Every cue is a named hook;
// swapping in recorded sounds later only means changing play().
let ctx = null, master = null, ambGain = null, ambNodes = [], muted = false, volume = 0.5;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : volume;
  master.connect(ctx.destination);
  ambGain = ctx.createGain();
  ambGain.gain.value = 0.0;
  ambGain.connect(master);
  return ctx;
}

export function unlockAudio() {
  const c = ensure();
  if (c && c.state === "suspended") c.resume();
}

export function setMuted(m) {
  muted = !!m;
  if (master) master.gain.value = muted ? 0 : volume;
}

let noiseBuf = null;
function noise() {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function env(g, t, a, d, peak) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(freq, dur, { type = "sine", peak = 0.3, slide = 0, delay = 0, attack = 0.005 } = {}) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  env(g, t, attack, dur, peak);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + attack + 0.05);
}

function hiss(dur, { freq = 1200, q = 1, peak = 0.3, type = "bandpass", slide = 0, delay = 0, attack = 0.005 } = {}) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noise(); s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  const g = ctx.createGain(); env(g, t, attack, dur, peak);
  s.connect(f).connect(g).connect(master);
  s.start(t); s.stop(t + dur + attack + 0.05);
}

const CUES = {
  step: () => hiss(0.07, { freq: 220, q: 0.8, peak: 0.05, type: "lowpass" }),
  ui: () => tone(660, 0.06, { type: "triangle", peak: 0.08 }),
  interact: () => { tone(420, 0.1, { type: "triangle", peak: 0.1 }); tone(630, 0.12, { type: "triangle", peak: 0.08, delay: 0.06 }); },
  door: () => { hiss(0.6, { freq: 180, q: 0.6, peak: 0.18, type: "lowpass", slide: 0.5 }); tone(70, 0.5, { type: "sine", peak: 0.15, slide: 0.7 }); },
  swing: () => hiss(0.18, { freq: 900, q: 1.5, peak: 0.18, slide: 2.5 }),
  hit: () => { hiss(0.12, { freq: 500, q: 0.7, peak: 0.3, type: "lowpass" }); tone(110, 0.12, { type: "square", peak: 0.08, slide: 0.5 }); },
  crit: () => { hiss(0.2, { freq: 700, q: 0.7, peak: 0.35, type: "lowpass" }); tone(160, 0.2, { type: "sawtooth", peak: 0.1, slide: 0.4 }); },
  miss: () => hiss(0.15, { freq: 1600, q: 2, peak: 0.08, slide: 1.8 }),
  block: () => { tone(900, 0.15, { type: "triangle", peak: 0.12 }); tone(1300, 0.2, { type: "sine", peak: 0.06, delay: 0.01 }); },
  cast: () => { tone(300, 0.5, { type: "sine", peak: 0.12, slide: 2.5, attack: 0.08 }); hiss(0.4, { freq: 3000, q: 4, peak: 0.04, attack: 0.1 }); },
  fire: () => { hiss(0.5, { freq: 600, q: 0.6, peak: 0.3, type: "lowpass", slide: 0.4 }); tone(90, 0.3, { type: "sawtooth", peak: 0.06, slide: 0.6 }); },
  frost: () => { [1800, 2400, 3100].forEach((f, i) => tone(f, 0.25, { type: "sine", peak: 0.05, delay: i * 0.04 })); hiss(0.3, { freq: 5000, q: 3, peak: 0.06 }); },
  lightning: () => { hiss(0.35, { freq: 2500, q: 0.4, peak: 0.3, type: "highpass" }); tone(60, 0.4, { type: "square", peak: 0.08, slide: 0.5 }); },
  arcane: () => { tone(520, 0.35, { type: "triangle", peak: 0.1, slide: 1.8 }); tone(780, 0.35, { type: "sine", peak: 0.06, slide: 1.5, delay: 0.03 }); },
  poison: () => { hiss(0.4, { freq: 400, q: 6, peak: 0.12, slide: 0.6 }); },
  shadow: () => { tone(80, 0.5, { type: "sawtooth", peak: 0.08, slide: 0.6 }); hiss(0.5, { freq: 300, q: 3, peak: 0.1, slide: 0.5 }); },
  heal: () => { [523, 659, 784].forEach((f, i) => tone(f, 0.4, { type: "sine", peak: 0.08, delay: i * 0.07 })); },
  buff: () => { tone(392, 0.3, { type: "triangle", peak: 0.08, slide: 1.5 }); tone(587, 0.3, { type: "triangle", peak: 0.06, delay: 0.08 }); },
  death: () => { tone(200, 0.6, { type: "sawtooth", peak: 0.08, slide: 0.3 }); hiss(0.5, { freq: 300, q: 0.5, peak: 0.12, type: "lowpass", slide: 0.3 }); },
  roar: () => { tone(90, 0.6, { type: "sawtooth", peak: 0.12, slide: 0.7 }); hiss(0.6, { freq: 400, q: 0.8, peak: 0.15, type: "lowpass" }); },
  victory: () => { [392, 494, 587, 784].forEach((f, i) => tone(f, 0.35, { type: "triangle", peak: 0.1, delay: i * 0.12 })); },
  achievement: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, { type: "triangle", peak: 0.09, delay: i * 0.09 })); tone(1568, 0.8, { type: "sine", peak: 0.05, delay: 0.4 }); },
  level: () => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.45, { type: "square", peak: 0.04, delay: i * 0.08 })); },
  quest: () => { tone(440, 0.3, { type: "triangle", peak: 0.08 }); tone(660, 0.4, { type: "triangle", peak: 0.08, delay: 0.12 }); },
  error: () => tone(160, 0.2, { type: "square", peak: 0.06 }),
};

export function play(name) {
  if (muted) return;
  const c = ensure();
  if (!c || c.state !== "running") return;
  (CUES[name] || CUES.ui)();
}

// A quiet ambience bed per region kit: low hum for halls and furnaces, wind outdoors, drips in mines.
export function ambience(kind) {
  const c = ensure();
  if (!c) return;
  for (const n of ambNodes) { try { n.stop(); } catch { /* already stopped */ } }
  ambNodes = [];
  const t = c.currentTime;
  ambGain.gain.cancelScheduledValues(t);
  ambGain.gain.setValueAtTime(ambGain.gain.value, t);
  ambGain.gain.linearRampToValueAtTime(0.0, t + 0.4);
  if (!kind) return;
  const outdoor = ["mountain", "town", "forest", "forest_dark", "swamp", "ash"].includes(kind);
  const s = c.createBufferSource(); s.buffer = noise(); s.loop = true;
  const f = c.createBiquadFilter(); f.type = outdoor ? "bandpass" : "lowpass"; f.frequency.value = outdoor ? 500 : 140; f.Q.value = outdoor ? 0.4 : 0.7;
  s.connect(f).connect(ambGain); s.start(); ambNodes.push(s);
  if (!outdoor) {
    const o = c.createOscillator(); o.type = "sine"; o.frequency.value = kind === "foundry" ? 48 : kind === "dwarf" || kind === "arcane" ? 55 : 42;
    const og = c.createGain(); og.gain.value = 0.25;
    o.connect(og).connect(ambGain); o.start(); ambNodes.push(o);
  }
  ambGain.gain.linearRampToValueAtTime(outdoor ? 0.18 : 0.22, t + 2);
}
