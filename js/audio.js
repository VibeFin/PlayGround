// tiny synth SFX (no assets)
let ctx = null, enabled = true;
export function setSoundEnabled(v) { enabled = v; }
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq, dur = 0.12, type = 'sine', vol = 0.18, slide = 0) {
  if (!enabled) return;
  try {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + dur);
  } catch (e) { /* no audio */ }
}
export const sfx = {
  jump() { tone(420, 0.14, 'square', 0.1, 260); },
  bead() { tone(880, 0.12, 'sine', 0.16, 440); setTimeout(() => tone(1320, 0.1, 'sine', 0.12), 60); },
  flower() { [660, 830, 990, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.16), i * 80)); },
  check() { tone(520, 0.15, 'triangle', 0.16, 200); },
  hurt() { tone(200, 0.25, 'sawtooth', 0.16, -120); },
  shape() { tone(300, 0.2, 'sine', 0.18, 500); setTimeout(() => tone(600, 0.12, 'sine', 0.12, 300), 90); },
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.18), i * 110)); },
  click() { tone(700, 0.05, 'square', 0.07); },
  place() { tone(500, 0.07, 'square', 0.1, 150); },
};
