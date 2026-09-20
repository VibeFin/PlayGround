/**
 * Race HUD: position/lap/timing, leaderboard, event feed, countdown,
 * speedometer, delta-vs-ghost, minimap canvas, touch controls.
 * Readable rewrite of the `showHUD` branch of minified `zz()`.
 */
import { icon, escapeHtml } from './icons.js';
import { formatLapTime } from '../core/physics.js';

export class Hud {
  constructor() {
    this.events = [];
  }

  get el() {
    return document.getElementById('race-hud');
  }

  show() {
    const el = this.el;
    if (!el) return;
    el.hidden = false;
    el.innerHTML = `
      <div class="hud">
        <div class="hud-top">
          <div class="hud-position">
            <div><div class="position-number">P<span id="hud-position">1</span><span id="hud-total">/9</span></div>
            <div class="hud-position-label" id="hud-position-label">POSITION</div></div>
            <div class="hud-lap"><div class="hud-position-label">LAP</div><div class="hud-lap-number"><span id="hud-lap">1</span> / <span id="hud-laps">3</span></div></div>
          </div>
          <div class="hud-top-right">
            <div class="hud-time-panel">
              <span class="time-label">CURRENT</span><span class="time-value time-main" id="hud-time">0:00.000</span>
              <span class="time-label">PERSONAL BEST</span><span class="time-value" id="hud-best">--:--.---</span>
              <div class="hud-sectors" id="hud-sectors"><span class="sector">S1 --</span><span class="sector">S2 --</span><span class="sector">S3 --</span></div>
            </div>
            <div class="hud-actions">
              <button class="icon-button" data-action="pause" aria-label="Pause race">${icon('pause')}</button>
              <button class="icon-button" data-action="camera" aria-label="Change camera">${icon('camera')}</button>
            </div>
          </div>
        </div>
        <div class="hud-centre"><div class="countdown" id="countdown"></div><div class="race-message" id="race-message"></div></div>
        <div class="leaderboard" id="leaderboard"></div>
        <div class="event-feed" id="event-feed" aria-live="polite"></div>
        <div class="hud-bottom">
          <div class="minimap-panel">
            <div class="corner-name" id="corner-name"></div>
            <canvas class="minimap" id="minimap" width="388" height="308" aria-label="Circuit map and car positions"></canvas>
            <div class="hud-bottom-info"><span id="hud-quality">HIGH</span><span id="hud-fps">60 FPS</span><span id="hud-weather">DRY</span></div>
          </div>
          <div class="delta-panel"><div class="delta-value" id="hud-delta">+0.000</div><div class="delta-label">VS PERSONAL BEST</div></div>
          <div class="speedometer">
            <svg class="rpm-arc" viewBox="0 0 230 150"><path class="rpm-track" d="M20 117A97 97 0 0 1 210 117"/><path class="rpm-value" id="rpm-value" d="M20 117A97 97 0 0 1 210 117" pathLength="258"/></svg>
            <div class="speed-value" id="hud-speed">0</div>
            <div class="speed-unit">KM/H</div>
            <div class="gear-value" id="hud-gear">1</div>
            <div class="gear-caption">GEAR</div>
            <div class="car-state"><span id="hud-tc">TC</span><span id="hud-abs">ABS</span><span id="hud-damage">BODY 100%</span></div>
          </div>
        </div>
        <div class="mobile-controls">
          <div class="mobile-controls-group">
            <button class="touch-control" data-control="left" aria-label="Steer left">◀</button>
            <button class="touch-control" data-control="right" aria-label="Steer right">▶</button>
          </div>
          <div class="mobile-controls-group">
            <button class="touch-control brake" data-control="brake">BRAKE</button>
            <button class="touch-control gas" data-control="gas">GAS ↑</button>
          </div>
        </div>
      </div>`;
    this.bindTouch();
  }

  hide() {
    const el = this.el;
    if (!el) return;
    el.hidden = true;
    el.innerHTML = '';
  }

  bindTouch() {
    this.el?.querySelectorAll('[data-control]').forEach((btn) => {
      const control = btn.dataset.control === 'gas' ? 'gas' : btn.dataset.control;
      const down = (e) => {
        e.preventDefault();
        btn.classList.add('pressed');
        document.dispatchEvent(new CustomEvent('spline:control', { detail: { control, pressed: true } }));
      };
      const up = () => {
        btn.classList.remove('pressed');
        document.dispatchEvent(new CustomEvent('spline:control', { detail: { control, pressed: false } }));
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    });
  }

  setCountdown(text) {
    const el = document.getElementById('countdown');
    if (el) el.textContent = text;
  }

  setMessage(text) {
    const el = document.getElementById('race-message');
    if (el) el.textContent = text;
  }

  event(text) {
    this.events.push({ text, at: performance.now() });
    this.events = this.events.slice(-4);
    const feed = document.getElementById('event-feed');
    if (feed) feed.innerHTML = this.events.map((e) => `<div class="event-item">${escapeHtml(e.text)}</div>`).join('');
  }

  update(state) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('hud-position', String(state.position));
    set('hud-total', `/${state.total}`);
    set('hud-lap', String(state.lap));
    set('hud-laps', state.lapsLabel);
    set('hud-time', formatLapTime(state.currentLapTime));
    set('hud-best', formatLapTime(state.bestLap));
    set('hud-speed', String(Math.round(Math.abs(state.speed) * 3.6)));
    set('hud-gear', String(state.gear));
    set('hud-delta', (state.delta >= 0 ? '+' : '') + state.delta.toFixed(3));
    set('hud-fps', `${Math.round(state.fps)} FPS`);
    set('hud-weather', state.wet ? 'WET' : 'DRY');
    set('corner-name', state.corner ?? '');
    const dmg = document.getElementById('hud-damage');
    if (dmg) dmg.textContent = `BODY ${Math.round((1 - state.damage) * 100)}%`;
    const rpm = document.getElementById('rpm-value');
    if (rpm) {
      const frac = Math.min(1, state.rpm / state.redline);
      rpm.style.strokeDashoffset = String(258 * (1 - frac));
      rpm.style.stroke = frac > 0.91 ? '#ff8161' : 'var(--lime)';
    }
    const lb = document.getElementById('leaderboard');
    if (lb && state.leaderboard) {
      lb.innerHTML = state.leaderboard.map((r) => `
        <div class="leaderboard-row ${r.isPlayer ? 'player' : ''}">
          <span>${r.position}</span><span>${escapeHtml(r.name)}</span><span class="gap">${escapeHtml(r.gap)}</span>
        </div>`).join('');
    }
    const sectors = document.getElementById('hud-sectors');
    if (sectors && state.sectorTexts) {
      sectors.innerHTML = state.sectorTexts.map((t, i) => `<span class="sector ${state.sectorDone?.[i] ? 'complete' : ''}">${t}</span>`).join('');
    }
  }

  drawMinimap(path, cars, ghost) {
    const canvas = document.getElementById('minimap');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#1b241d';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    path.forEach((p, i) => {
      const x = p.x * W, y = p.y * H;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#d9e4d2';
    ctx.stroke();
    const dot = (u, lateral, color, r) => {
      const idx = Math.floor((((u % 1) + 1) % 1) * path.length) % path.length;
      const p = path[idx];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, r, 0, Math.PI * 2);
      ctx.fill();
    };
    if (ghost) dot(ghost.u, 0, '#7ceaff', 5);
    for (const c of cars) {
      if (c.isPlayer) continue;
      dot(c.u, 0, '#e8ece2', 5);
    }
    const player = cars.find((c) => c.isPlayer);
    if (player) {
      dot(player.u, 0, '#0c120c', 9);
      dot(player.u, 0, '#d0ff58', 7);
    }
  }
}
