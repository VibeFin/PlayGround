/**
 * hud.js — DOM-overlay HUD for the kart game (no framework, no assets).
 *
 * Owned by Agent 4. Binds to the IDs already present in index.html
 * (#hud-lap, #hud-time, #hud-pos, #hud-message, #hud-item, #hud-speed,
 * #countdown, #minimap) and creates them if a host page omits them.
 *
 * HUD API:
 *   const hud = new HUD();
 *   hud.update(state);        // per-frame
 *   hud.showCountdown('3'|'2'|'1'|'GO!'|null);
 *   hud.setMessage('...', secs?);
 *   hud.showResults(results); // results: [{ name, time, isPlayer }]
 *   hud.hideResults();
 *   hud.destroy();
 *
 * update(state) fields (all optional — guards apply):
 *   { speed, speedKmh, lap, totalLaps, position, totalKarts,
 *     item, roulette, time, countdown, message,
 *     trackData, karts, playerIndex }
 */

import { formatRaceTime, ordinal } from '../core/Utils.js';
import { normalizeTrackPoints } from '../items/items.js';

export function getKartProgress(kart, lapScale = 100000) {
  if (!kart || typeof kart !== 'object') return -Infinity;
  if (Number.isFinite(kart.totalProgress)) return kart.totalProgress;
  if (Number.isFinite(kart.raceProgress)) return kart.raceProgress;
  const lap = Number.isFinite(kart.lap) ? kart.lap : 1;
  const prog = Number.isFinite(kart.progress) ? kart.progress
    : Number.isFinite(kart.checkpoint) ? kart.checkpoint
    : Number.isFinite(kart.distance) ? kart.distance : 0;
  return (lap - 1) * lapScale + prog;
}

/** Position calc from race progress: 1 = leader. Missing data -> 1. */
export function calculatePosition(karts, playerIndex = 0) {
  if (!Array.isArray(karts) || karts.length === 0) return 1;
  const me = getKartProgress(karts[playerIndex] ?? karts[0]);
  let pos = 1;
  for (let i = 0; i < karts.length; i++) {
    if (i === (playerIndex ?? 0)) continue;
    if (getKartProgress(karts[i]) > me) pos++;
  }
  return pos;
}

const ITEM_LABEL = { mushroom: '🍄 BOOST', shell: '🟢 SHELL', banana: '🍌 PEEL', star: '⭐ STAR' };

function el(id, tag, parent, style) {
  let n = typeof document !== 'undefined' && document.getElementById(id);
  if (n) return n;
  if (typeof document === 'undefined') return null;
  n = document.createElement(tag || 'div');
  n.id = id;
  if (style) n.setAttribute('style', style);
  (parent || document.body).appendChild(n);
  return n;
}

export class HUD {
  constructor(opts = {}) {
    this.opts = opts;
    this.totalLaps = opts.totalLaps ?? 3;
    this._msgTimer = 0;
    this._lastCountdown = null;

    if (typeof document === 'undefined') return; // logic-only (tests/SSR)

    const css = `
      #hud{position:fixed;inset:0;pointer-events:none;z-index:10;color:#fff;
        font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
        text-shadow:0 2px 6px rgba(0,0,0,.75)}
      #hud-top{position:absolute;top:12px;left:16px;right:16px;display:flex;
        justify-content:space-between;align-items:flex-start;
        font-size:22px;font-weight:800}
      #hud-lap,#hud-time,#hud-pos{background:rgba(0,0,0,.5);padding:8px 14px;border-radius:10px}
      #hud-pos{color:#ffcf3f}
      #hud-message{position:absolute;top:20%;width:100%;text-align:center;
        font-size:44px;font-weight:900;letter-spacing:1px}
      #hud-item{position:absolute;bottom:18px;left:20px;font-size:24px;font-weight:800;
        background:rgba(0,0,0,.55);padding:10px 18px;border-radius:12px;min-width:150px;text-align:center}
      #hud-item.roulette{outline:3px solid #ffcf3f;animation:hudpop .12s infinite alternate}
      @keyframes hudpop{from{transform:scale(1)}to{transform:scale(1.07)}}
      #hud-speed{position:absolute;bottom:18px;right:20px;font-size:30px;font-weight:900;
        background:rgba(0,0,0,.55);padding:10px 18px;border-radius:12px}
      #hud-results{position:fixed;inset:0;z-index:30;display:none;align-items:center;
        justify-content:center;background:rgba(5,8,20,.82);pointer-events:auto}
      #hud-results.visible{display:flex}
      #hud-results .card{background:#141b33;border:1px solid rgba(255,255,255,.2);
        border-radius:16px;padding:28px 36px;min-width:320px;text-align:center;color:#fff}
      #hud-results h2{font-size:34px;margin-bottom:12px}
      #hud-results ol{text-align:left;font-size:20px;line-height:1.9;margin:0 0 16px;padding-left:28px}
      #hud-results button{cursor:pointer;border:0;border-radius:10px;padding:10px 26px;
        font-size:18px;font-weight:800;background:#ffcf3f;color:#1a1a1a}
    `;
    if (!document.getElementById('hud-style-agent4')) {
      const s = document.createElement('style');
      s.id = 'hud-style-agent4';
      s.textContent = css;
      document.head.appendChild(s);
    }

    this.root = el('hud', 'div', document.body);
    this.lapEl = document.getElementById('hud-lap') || el('hud-lap', 'div', this.root);
    this.timeEl = document.getElementById('hud-time') || el('hud-time', 'div', this.root);
    this.posEl = document.getElementById('hud-pos') || el('hud-pos', 'div', this.root);
    this.msgEl = document.getElementById('hud-message') || el('hud-message', 'div', this.root);
    this.itemEl = document.getElementById('hud-item') || el('hud-item', 'div', this.root);
    this.speedEl = document.getElementById('hud-speed') || el('hud-speed', 'div', this.root);
    this.countdownEl = document.getElementById('countdown') || el('countdown', 'div', document.body);
    this.mapEl = document.getElementById('minimap') || el('minimap', 'canvas', document.body);
    try {
      this.mapCtx = this.mapEl.getContext?.('2d') || null;
    } catch { this.mapCtx = null; }

    if (!document.getElementById('hud-results')) {
      const ov = document.createElement('div');
      ov.id = 'hud-results';
      ov.innerHTML = `<div class="card"><h2>🏁 RESULTS</h2><ol></ol><button type="button">RACE AGAIN (Enter)</button></div>`;
      document.body.appendChild(ov);
      ov.querySelector('button')?.addEventListener('click', () => {
        this.hideResults();
        this.opts.onRestart?.();
      });
    }
    this.resultsEl = document.getElementById('hud-results');
  }

  update(state = {}) {
    if (typeof document === 'undefined') return;
    const totalLaps = state.totalLaps ?? this.totalLaps ?? 3;
    const totalKarts = state.totalKarts ?? state.karts?.length ?? 8;

    // Speed (accept m/s or preformatted km/h).
    let kmh = state.speedKmh;
    if (!Number.isFinite(kmh)) {
      const ms = Number.isFinite(state.speed) ? state.speed : 0;
      kmh = Math.max(0, ms * 3.6);
    }
    if (this.speedEl) this.speedEl.textContent = `${Math.round(kmh)} km/h`;

    // Lap X/3.
    const lap = Math.max(1, Math.min(totalLaps, Math.round(state.lap ?? 1)));
    if (this.lapEl) this.lapEl.textContent = `LAP ${lap}/${totalLaps}`;

    // Position 1/8 from race progress when not given explicitly.
    let pos = state.position;
    if (!Number.isFinite(pos)) {
      pos = calculatePosition(state.karts, state.playerIndex ?? 0);
    }
    if (this.posEl) this.posEl.textContent = ordinal(Math.max(1, Math.min(totalKarts, pos)));

    // Race clock.
    if (this.timeEl && Number.isFinite(state.time)) {
      try { this.timeEl.textContent = formatRaceTime(state.time); }
      catch { this.timeEl.textContent = `${state.time.toFixed(1)}s`; }
    }

    // Item slot + 1s roulette flicker.
    if (this.itemEl) {
      const r = state.roulette;
      if (r) {
        const label = ITEM_LABEL[r.display] || '🎁 ???';
        this.itemEl.textContent = `🎁 ${label}`;
        this.itemEl.classList.add('roulette');
      } else {
        this.itemEl.classList.remove('roulette');
        this.itemEl.textContent = state.item ? `ITEM: ${ITEM_LABEL[state.item] || state.item}` : 'ITEM: —';
      }
    }

    // Transient center message.
    if (typeof state.message === 'string' && state.message && this.msgEl) {
      this.msgEl.textContent = state.message;
    }

    // Countdown mirror (menus own the state machine; HUD just renders).
    if (state.countdown !== undefined) this.showCountdown(state.countdown);

    // Minimap: trackData path + dots.
    this.drawMinimap(state.trackData, state.karts, state.playerIndex ?? 0);
  }

  showCountdown(text) {
    if (!this.countdownEl) { this._lastCountdown = text; return; }
    if (text == null || text === '') {
      this.countdownEl.classList.add('hidden');
      this.countdownEl.textContent = '';
    } else {
      this.countdownEl.classList.remove('hidden');
      this.countdownEl.textContent = String(text);
    }
    this._lastCountdown = text;
  }

  setMessage(text, secs = 2) {
    if (this.msgEl) this.msgEl.textContent = text || '';
    this._msgTimer = secs;
    void this._msgTimer;
  }

  drawMinimap(trackData, karts, playerIndex = 0) {
    const ctx = this.mapCtx;
    const canvas = this.mapEl;
    if (!ctx || !canvas) return;
    const W = canvas.width || 180; const H = canvas.height || 180;
    ctx.clearRect(0, 0, W, H);

    let pts = [];
    try { pts = normalizeTrackPoints(trackData); } catch { pts = []; }
    if (pts.length < 2) {
      // Fallback oval so the minimap never renders empty.
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(W / 2, H / 2, W * 0.32, H * 0.36, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
      const pad = 14;
      const sx = (W - pad * 2) / Math.max(1e-6, maxX - minX);
      const sz = (H - pad * 2) / Math.max(1e-6, maxZ - minZ);
      const s = Math.min(sx, sz);
      const ox = pad + (W - pad * 2 - (maxX - minX) * s) / 2;
      const oy = pad + (H - pad * 2 - (maxZ - minZ) * s) / 2;
      const map = (x, z) => [ox + (x - minX) * s, oy + (z - minZ) * s];

      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,.28)';
      ctx.lineWidth = 9;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [cx, cy] = map(p.x, p.z);
        if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      ctx.stroke();

      if (Array.isArray(karts)) {
        karts.forEach((k, i) => {
          const p = k?.position || k?.pos;
          if (!p) return;
          const [cx, cy] = map(p.x || 0, p.z || 0);
          ctx.fillStyle = i === playerIndex ? '#ffcf3f' : (k?.color || '#4da3ff');
          ctx.beginPath();
          ctx.arc(cx, cy, i === playerIndex ? 5 : 3.5, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
  }

  /** Results screen. rows: [{ name, time, isPlayer }]. Sorted by time. */
  showResults(rows = [], opts = {}) {
    if (!this.resultsEl) return;
    const list = this.resultsEl.querySelector('ol');
    const sorted = [...rows].sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9));
    if (list) {
      list.innerHTML = '';
      sorted.forEach((r, i) => {
        const li = document.createElement('li');
        let t = '';
        try { t = formatRaceTime(r.time ?? 0); } catch { t = `${r.time ?? 0}s`; }
        li.textContent = `${ordinal(i + 1)} — ${r.name || 'Racer ' + (i + 1)}  ${t}${r.isPlayer ? '  ◀ YOU' : ''}`;
        if (r.isPlayer) li.style.color = '#ffcf3f';
        list.appendChild(li);
      });
    }
    const title = this.resultsEl.querySelector('h2');
    if (title && opts.title) title.textContent = opts.title;
    this.resultsEl.classList.add('visible');
  }

  hideResults() {
    this.resultsEl?.classList.remove('visible');
  }

  destroy() {
    this.resultsEl?.classList.remove('visible');
    this.showCountdown(null);
  }
}

export default HUD;
