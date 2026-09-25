/**
 * audio.js — procedural WebAudio SFX + music for the kart game.
 *
 * Owned by Agent 4. Oscillators + filtered noise ONLY — no external files,
 * no assets, no libraries. Everything is guarded: safe to construct in
 * Node/SSR (becomes a silent no-op) and safe when the AudioContext is
 * blocked until a user gesture (call `unlock()` / `ensure()` on Start).
 *
 * Audio API:
 *   const audio = new GameAudio();      // or getSharedAudio()
 *   audio.unlock();                     // call from Start button / Enter
 *   audio.toggleMute(); audio.setMuted(m); // M key handled via bindMuteKey()
 *   audio.playPickup(); audio.playBoost(); audio.playHit(); audio.playShell();
 *   audio.playBanana(); audio.playBeep(final=false); audio.playGo();
 *   audio.updateEngine(speed01, { drifting, boosting }); // per-frame
 *   audio.startMusic(); audio.stopMusic();
 *   audio.bindMuteKey(); // toggles mute on 'M', returns unbind()
 *   audio.dispose();
 */

const NOTE = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

export class GameAudio {
  constructor(opts = {}) {
    this.opts = opts;
    this.muted = !!opts.muted;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.engine = null; // { osc, osc2, gain, filter }
    this.driftNode = null; // { src, gain, filter }
    this._musicTimer = null;
    this._musicStep = 0;
    this._noiseBuf = null;
    this._unbindMute = null;
  }

  get ready() { return !!this.ctx; }

  // ---- lifecycle ----
  /** Create/resume the AudioContext. Must be called from a user gesture. */
  unlock() { return this.ensure(); }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume?.().catch?.(() => {});
      return true;
    }
    try {
      const AC = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext))
        || (typeof globalThis !== 'undefined' && (globalThis.AudioContext || globalThis.webkitAudioContext));
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.35;
      this.musicGain.connect(this.master);
      if (this.ctx.state === 'suspended') this.ctx.resume?.().catch?.(() => {});
      this._startEngineNodes();
      return true;
    } catch {
      this.ctx = null;
      return false;
    }
  }

  setMuted(m) {
    this.muted = !!m;
    try {
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
      }
    } catch { /* ignore */ }
    return this.muted;
  }

  toggleMute() { return this.setMuted(!this.muted); }

  bindMuteKey(target) {
    const t = target || (typeof window !== 'undefined' ? window : null);
    if (!t?.addEventListener) return () => {};
    const h = (e) => {
      if (e.code === 'KeyM') { e.preventDefault?.(); this.toggleMute(); }
    };
    t.addEventListener('keydown', h);
    this._unbindMute = () => t.removeEventListener('keydown', h);
    return this._unbindMute;
  }

  // ---- helpers ----
  _noiseBuffer() {
    if (this._noiseBuf) return this._noiseBuf;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 1);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
    return buf;
  }

  _tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.15, vol = 0.3, delay = 0, dest = null }) {
    if (!this.ctx || this.muted === undefined) return;
    if (!this.ctx) return;
    try {
      const t0 = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (freqEnd && Number.isFinite(freqEnd)) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(dest || this.master);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    } catch { /* ignore */ }
  }

  _noise({ dur = 0.2, vol = 0.25, delay = 0, filterFreq = 1200, type = 'bandpass', q = 1 }) {
    if (!this.ctx) return;
    try {
      const t0 = this.ctx.currentTime + delay;
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuffer();
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = filterFreq;
      f.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f).connect(g).connect(this.master);
      src.start(t0);
      src.stop(t0 + dur + 0.05);
    } catch { /* ignore */ }
  }

  // ---- SFX (all procedural) ----
  playPickup() {
    if (!this.ensure()) return;
    this._tone({ freq: 660, freqEnd: 990, type: 'square', dur: 0.12, vol: 0.18 });
    this._tone({ freq: 1320, type: 'sine', dur: 0.1, vol: 0.15, delay: 0.07 });
  }

  playBoost() {
    if (!this.ensure()) return;
    this._noise({ dur: 0.45, vol: 0.3, filterFreq: 900, type: 'lowpass' });
    this._tone({ freq: 180, freqEnd: 720, type: 'sawtooth', dur: 0.45, vol: 0.2 });
  }

  playShell() {
    if (!this.ensure()) return;
    this._tone({ freq: 500, freqEnd: 220, type: 'square', dur: 0.18, vol: 0.2 });
  }

  playBanana() {
    if (!this.ensure()) return;
    this._tone({ freq: 900, freqEnd: 1400, type: 'triangle', dur: 0.1, vol: 0.2 });
  }

  playHit() {
    if (!this.ensure()) return;
    this._noise({ dur: 0.25, vol: 0.32, filterFreq: 2500, type: 'highpass' });
    this._tone({ freq: 220, freqEnd: 60, type: 'sawtooth', dur: 0.3, vol: 0.28 });
  }

  playStar() {
    if (!this.ensure()) return;
    [523, 659, 784, 1046, 1318].forEach((f, i) =>
      this._tone({ freq: f, type: 'square', dur: 0.14, vol: 0.16, delay: i * 0.08 }));
  }

  /** Countdown beep: low ticks, high final handled by playGo(). */
  playBeep(final = false) {
    if (!this.ensure()) return;
    this._tone({ freq: final ? 880 : 440, type: 'square', dur: final ? 0.4 : 0.15, vol: 0.25 });
  }

  playGo() {
    if (!this.ensure()) return;
    this._tone({ freq: 880, type: 'square', dur: 0.5, vol: 0.28 });
    this._tone({ freq: 1760, type: 'sine', dur: 0.4, vol: 0.12, delay: 0.02 });
  }

  playDrift() {
    if (!this.ensure()) return;
    this._noise({ dur: 0.18, vol: 0.2, filterFreq: 3000, type: 'bandpass', q: 2 });
  }

  // ---- engine hum + drift loop ----
  _startEngineNodes() {
    try {
      const ctx = this.ctx;
      const o1 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = 60;
      const o2 = ctx.createOscillator();
      o2.type = 'square';
      o2.frequency.value = 30;
      const g2 = ctx.createGain();
      g2.gain.value = 0.4;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 500;
      const g = ctx.createGain();
      g.gain.value = 0.0; // silent until updateEngine() is called
      o1.connect(filt);
      o2.connect(g2).connect(filt);
      filt.connect(g).connect(this.master);
      o1.start(); o2.start();

      // Looping drift noise (gain driven per-frame).
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer();
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2800; bp.Q.value = 1.5;
      const dg = ctx.createGain();
      dg.gain.value = 0;
      src.connect(bp).connect(dg).connect(this.master);
      src.start();

      this.engine = { osc: o1, osc2: o2, gain: g, filter: filt };
      this.driftNode = { src, gain: dg, filter: bp };
    } catch { /* ignore */ }
  }

  /**
   * Per-frame engine/drift mix.
   * @param {number} speed01 0..1 normalized speed
   * @param {object} flags { drifting, boosting }
   */
  updateEngine(speed01 = 0, flags = {}) {
    if (!this.ctx || !this.engine) return;
    try {
      const s = Math.max(0, Math.min(1, speed01));
      const t = this.ctx.currentTime;
      const base = 55 + s * 165 + (flags.boosting ? 40 : 0);
      this.engine.osc.frequency.setTargetAtTime(base, t, 0.05);
      this.engine.osc2.frequency.setTargetAtTime(base / 2, t, 0.05);
      this.engine.filter.frequency.setTargetAtTime(350 + s * 2200, t, 0.08);
      const target = this.muted ? 0 : 0.05 + s * 0.08;
      this.engine.gain.gain.setTargetAtTime(target, t, 0.08);
      if (this.driftNode) {
        const dTarget = this.muted ? 0 : (flags.drifting ? 0.16 : 0);
        this.driftNode.gain.gain.setTargetAtTime(dTarget, t, 0.06);
      }
    } catch { /* ignore */ }
  }

  // ---- background music: tiny procedural chiptune loop ----
  startMusic() {
    if (!this.ensure()) return false;
    if (this._musicTimer) return true;
    // I–V–vi–IV in A minor-ish: Am F C G, 8th-note bass + sparkle lead.
    const bass = [45, 45, 41, 41, 48, 48, 43, 43]; // A2 A2 F2 F2 C3 C3 G2 G2
    const lead = [69, 72, 76, 72, 77, 76, 74, 72, 69, 72, 76, 79, 77, 76, 74, 72];
    const stepDur = 0.21;
    const tick = () => {
      if (!this.ctx || this.muted) {
        // Keep time but stay silent while muted/blocked.
        this._musicStep++;
        return;
      }
      try {
        const i = this._musicStep % 8;
        const j = this._musicStep % 16;
        const t = this.ctx.currentTime;
        // Bass (triangle, soft).
        const bo = this.ctx.createOscillator();
        const bg = this.ctx.createGain();
        bo.type = 'triangle';
        bo.frequency.value = NOTE(bass[i]);
        bg.gain.setValueAtTime(0.22, t);
        bg.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 0.95);
        bo.connect(bg).connect(this.musicGain);
        bo.start(t); bo.stop(t + stepDur);
        // Lead sparkle every other step.
        if (this._musicStep % 2 === 0) {
          const lo = this.ctx.createOscillator();
          const lg = this.ctx.createGain();
          lo.type = 'square';
          lo.frequency.value = NOTE(lead[j]);
          lg.gain.setValueAtTime(0.07, t);
          lg.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.4);
          lo.connect(lg).connect(this.musicGain);
          lo.start(t); lo.stop(t + stepDur * 1.5);
        }
      } catch { /* ignore */ }
      this._musicStep++;
    };
    tick();
    this._musicTimer = setInterval(tick, stepDur * 1000);
    return true;
  }

  stopMusic() {
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
  }

  dispose() {
    this.stopMusic();
    try { this._unbindMute?.(); } catch { /* ignore */ }
    for (const n of [this.engine?.osc, this.engine?.osc2, this.driftNode?.src]) {
      try { n?.stop?.(); } catch { /* ignore */ }
    }
    try { this.ctx?.close?.(); } catch { /* ignore */ }
    this.ctx = null;
    this.engine = null;
    this.driftNode = null;
  }
}

let _shared = null;
export function getSharedAudio(opts) {
  if (!_shared) _shared = new GameAudio(opts);
  return _shared;
}

export default GameAudio;
