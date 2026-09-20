/**
 * Menu / drawer / overlay DOM (readable rewrite of minified `zz()` factory).
 * Owns: menu-screen, garage + settings drawers, pause / results overlays,
 * replay banner, loading bar, event feed. HUD race numbers live in hud.js.
 */
import { TRACKS } from '../config/tracks.js';
import { CARS, FACTORY_PAINTS } from '../config/cars.js';
import { MODES, QUALITY_DESCRIPTIONS } from '../config/modes.js';
import { icon, escapeHtml } from './icons.js';

export class MenuUI {
  constructor(root, callbacks) {
    this.root = root;
    this.cb = callbacks;
    this.mode = 'quick';
    this.render();
  }

  render() {
    this.root.innerHTML = `
      <main class="menu-screen" id="menu-screen" aria-label="Spline Rush main menu">
        <header class="topbar">
          <div class="brand">
            <svg class="brand-mark" viewBox="0 0 38 34" aria-hidden="true"><path d="M22 2H10L2 17h11l-4 15 19-18h-11z" fill="currentColor"/></svg>
            <span class="brand-name">SPLINE<span>RUSH</span></span>
            <span class="brand-divider"></span>
            <span class="brand-caption">PURE DRIVING INSTINCT</span>
          </div>
          <nav class="nav" aria-label="Main">
            <button class="nav-button active" data-action="race">${icon('flag')}RACE</button>
            <button class="nav-button" data-action="garage">${icon('garage')}GARAGE</button>
            <button class="nav-button" data-action="settings">${icon('settings')}SETTINGS</button>
            <span class="live-pill"><span class="live-dot"></span><span id="renderer-backend">LIVE RENDER</span></span>
            <button class="sound-button" data-action="audio" aria-label="Toggle audio">${icon('sound')}</button>
          </nav>
        </header>
        <div class="menu-main">
          <div class="hero-copy">
            <p class="release-tag"><span class="tag-line"></span>THE ROAD IS YOURS TO TAKE</p>
            <h1 class="hero-title">SPLINE<span>RUSH.</span></h1>
            <p class="hero-tagline">Find your line. Feel the limit.</p>
            <div class="mode-tabs" role="tablist" aria-label="Race mode">
              ${Object.entries(MODES).map(([id, m]) => `
                <button class="mode-tab ${id === this.mode ? 'active' : ''}" role="tab" data-mode="${id}">${m.label}</button>`).join('')}
            </div>
            <p class="mode-description" id="mode-description">${escapeHtml(MODES[this.mode].description)}</p>
            <div class="start-row">
              <button class="primary-button" data-action="start">START ENGINE ${icon('arrow')}</button>
              <span class="start-key"><kbd>ENTER ↵</kbd>TO RACE</span>
            </div>
          </div>
          <p class="hero-edition">ENGINEERED FOR THE APEX</p>
          <div class="hero-car-label">
            <span class="car-label-line"></span>
            <div><div class="hero-car-name" id="hero-car-name">APEX R</div>
            <div class="hero-car-sub" id="hero-car-sub">612 HP / 326 KM/H / RWD</div></div>
            <button data-action="garage" aria-label="Choose your car">${icon('arrow')}</button>
          </div>
        </div>
        <section class="track-section" aria-label="Select circuit">
          <div class="section-label">
            <span class="eyebrow">CHOOSE YOUR CIRCUIT <span id="track-counter">01 / 06</span></span>
            <span class="track-condition" id="track-condition">2.3 KM / COASTAL DAY</span>
          </div>
          <div class="track-grid" id="track-grid">
            ${TRACKS.map((t, i) => `
              <button class="track-card ${i === 0 ? 'active' : ''}" data-track="${t.id}" aria-label="Race at ${t.name}">
                <span class="track-index">0${i + 1}</span>
                <span class="track-selected-icon">${icon('check')}</span>
                <svg class="track-map" viewBox="0 0 130 70" aria-hidden="true"><polyline data-minimap="${t.id}" points="" fill="none" stroke="currentColor" stroke-width="3"/></svg>
                <span class="track-name">${t.name}</span>
                <span class="track-meta"><span>${t.biome.toUpperCase()}</span><span>${t.lengthLabel.toUpperCase()}</span></span>
              </button>`).join('')}
          </div>
        </section>
        <footer class="footer">
          <div class="footer-controls">
            <span class="footer-control keyboard-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> DRIVE</span>
            <span class="footer-control keyboard-hint"><kbd>SPACE</kbd> HANDBRAKE</span>
            <span class="footer-control"><kbd>C</kbd> CAMERA</span>
            <span class="footer-control"><kbd>ESC</kbd> PAUSE</span>
            <span class="footer-control touch-hint" style="display:none">TOUCH CONTROLS ENABLED</span>
            <span class="footer-control" id="gamepad-hint">GAMEPAD READY</span>
          </div>
          <div class="footer-build"><strong id="menu-quality">HIGH QUALITY</strong><span>6 CIRCUITS / 5 MACHINES / NO LIMITS</span></div>
        </footer>
      </main>
      <div id="race-hud" hidden></div>
      <div id="pause-overlay" hidden></div>
      <div id="results-overlay" hidden></div>
      <div id="replay-banner" class="replay-banner" hidden><span>● RACE REPLAY</span><button data-action="end-replay">BACK TO RESULTS</button></div>
      <div id="drawer-backdrop" class="drawer-backdrop" hidden><aside class="drawer" role="dialog" aria-modal="true" id="drawer"></aside></div>
      <div id="loading" class="loading" hidden></div>
      <div id="loading-text" class="loading-text" hidden></div>
    `;
    this.bind();
  }

  bind() {
    this.root.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      const modeBtn = e.target.closest('[data-mode]');
      const trackBtn = e.target.closest('[data-track]');
      const carBtn = e.target.closest('[data-car]');
      const paintBtn = e.target.closest('[data-paint]');
      const qualityBtn = e.target.closest('[data-quality]');
      if (modeBtn) this.cb.onMode?.(modeBtn.dataset.mode);
      else if (trackBtn) this.cb.onTrack?.(trackBtn.dataset.track);
      else if (carBtn) this.cb.onCar?.(carBtn.dataset.car);
      else if (paintBtn) this.cb.onPaint?.(paintBtn.dataset.paint);
      else if (qualityBtn) this.cb.onQuality?.(qualityBtn.dataset.quality);
      else if (actionBtn) this.cb.onAction?.(actionBtn.dataset.action, actionBtn);
    });
    this.root.addEventListener('change', (e) => {
      const el = e.target;
      if (el.matches('[data-setting]')) this.cb.onSetting?.(el.dataset.setting, el.type === 'checkbox' ? el.checked : parseFloat(el.value));
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && !document.getElementById('menu-screen')?.hidden) {
        if (document.activeElement?.tagName !== 'BUTTON') this.cb.onAction?.('start');
      }
    });
  }

  // -- live updates -------------------------------------------------------
  setMode(mode) {
    this.mode = mode;
    this.root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    const desc = document.getElementById('mode-description');
    if (desc) desc.textContent = MODES[mode].description;
  }

  setTrack(trackId) {
    const idx = TRACKS.findIndex((t) => t.id === trackId);
    this.root.querySelectorAll('[data-track]').forEach((b) => b.classList.toggle('active', b.dataset.track === trackId));
    const t = TRACKS[idx];
    const counter = document.getElementById('track-counter');
    const cond = document.getElementById('track-condition');
    if (counter) counter.textContent = `0${idx + 1} / 06`;
    if (cond) cond.textContent = `${t.lengthLabel.toUpperCase()} / ${t.biome.toUpperCase()}`;
  }

  setHeroCar(car) {
    const name = document.getElementById('hero-car-name');
    const sub = document.getElementById('hero-car-sub');
    if (name) name.textContent = car.name;
    if (sub) sub.textContent = `${car.power} HP / ${car.maxSpeed} KM/H / ${car.drivetrain}`;
  }

  setMinimap(trackId, points) {
    const poly = this.root.querySelector(`[data-minimap="${trackId}"]`);
    if (poly) poly.setAttribute('points', points.map((p) => `${(p.x * 130).toFixed(1)},${(p.y * 70).toFixed(1)}`).join(' '));
  }

  setBackend(label) {
    const el = document.getElementById('renderer-backend');
    if (el) el.textContent = label;
  }

  setLoading(text, visible = true) {
    const bar = document.getElementById('loading');
    const label = document.getElementById('loading-text');
    if (bar) bar.hidden = !visible;
    if (label) {
      label.hidden = !visible;
      label.textContent = text ?? '';
    }
  }

  showMenu(visible) {
    document.getElementById('menu-screen').hidden = !visible;
  }

  // -- drawers ------------------------------------------------------------
  openGarage(activeCar, activePaint) {
    const car = CARS.find((c) => c.id === activeCar) ?? CARS[0];
    this.openDrawer('THE GARAGE.', `
      <p class="drawer-caption">Five different ways to chase the horizon. Pick your weapon, then pick your paint.</p>
      <div class="garage-list">
        ${CARS.map((c, i) => `
          <button class="garage-car ${c.id === activeCar ? 'active' : ''}" data-car="${c.id}">
            <span class="garage-car-index">0${i + 1}</span>
            <span class="garage-car-detail"><span class="garage-car-name">${c.name}</span><br>
            <span class="garage-car-meta">${c.power} HP · ${c.subtitle}</span></span>
            ${icon('check')}
          </button>`).join('')}
      </div>
      <p class="eyebrow">FACTORY FINISH</p>
      <div class="paint-options">
        ${FACTORY_PAINTS.map((p) => `<button class="paint-swatch ${p === activePaint ? 'active' : ''}" data-paint="${p}" style="--paint:${p}" aria-label="Paint ${p}"></button>`).join('')}
      </div>
      <div class="garage-stats">
        <div class="garage-stat"><span>HORSEPOWER</span><strong>${car.power}</strong></div>
        <div class="garage-stat"><span>TOP SPEED</span><strong>${car.maxSpeed}</strong></div>
        <div class="garage-stat"><span>WEIGHT KG</span><strong>${car.mass}</strong></div>
      </div>
      <button class="primary-button drawer-done" data-action="close-drawer">READY TO RACE ${icon('arrow')}</button>
    `);
  }

  openSettings(settings) {
    this.openDrawer('YOUR SETUP.', `
      <p class="drawer-caption">Graphics, assists and sound. Everything saves to this browser.</p>
      <p class="eyebrow">GRAPHICS QUALITY</p>
      <div class="quality-options">
        ${['low', 'medium', 'high', 'ultra'].map((q) => `<button class="quality-button ${settings.quality === q ? 'active' : ''}" data-quality="${q}">${q.toUpperCase()}</button>`).join('')}
      </div>
      <p class="quality-description">${escapeHtml(QUALITY_DESCRIPTIONS[settings.quality])}</p>
      <div class="setting-group">
        <label class="setting-row"><span>Adaptive quality<span class="setting-description">Drop resolution under load to hold frame rate.</span></span><input type="checkbox" data-setting="adaptive" ${settings.adaptive ? 'checked' : ''}></label>
        <label class="setting-row"><span>ABS<span class="setting-description">Stronger, more stable braking.</span></span><input type="checkbox" data-setting="abs" ${settings.abs ? 'checked' : ''}></label>
        <label class="setting-row"><span>Traction control<span class="setting-description">Tames wheelspin off the dry line.</span></span><input type="checkbox" data-setting="traction" ${settings.traction ? 'checked' : ''}></label>
        <label class="setting-row"><span>Master volume<span class="setting-description">Engine, tyres, crowd and music.</span></span><input type="range" min="0" max="1" step="0.05" value="${settings.volume}" data-setting="volume"></label>
        <label class="setting-row"><span>Dynamic music<span class="setting-description">A tiny pentatonic box that plays faster when you do.</span></span><input type="checkbox" data-setting="music" ${settings.music ? 'checked' : ''}></label>
      </div>
      <p class="eyebrow">THE CONTROLS</p>
      <div class="help-grid">
        <div><kbd>W A S D</kbd> DRIVE</div><div><kbd>SPACE</kbd> HANDBRAKE</div>
        <div><kbd>C</kbd> CAMERA</div><div><kbd>R</kbd> RESET CAR</div>
        <div><kbd>ESC</kbd> PAUSE</div><div><kbd>RT / LT</kbd> GAMEPAD</div>
      </div>
      <button class="primary-button drawer-done" data-action="close-drawer">DONE ${icon('arrow')}</button>
    `);
  }

  openDrawer(title, bodyHtml) {
    document.getElementById('drawer-backdrop').hidden = false;
    document.getElementById('drawer').innerHTML = `
      <div class="drawer-head"><h2 class="drawer-title">${title}</h2>
      <button class="icon-button" data-action="close-drawer" aria-label="Close">${icon('close')}</button></div>${bodyHtml}`;
    document.getElementById('drawer').querySelector('button')?.focus();
  }

  closeDrawer() {
    document.getElementById('drawer-backdrop').hidden = true;
  }

  showPause(timeTrial) {
    const el = document.getElementById('pause-overlay');
    el.hidden = false;
    el.innerHTML = `
      <div class="overlay"><div class="overlay-card">
        <div class="eyebrow lime">IN THE PITS.</div>
        <h2 class="overlay-title">TAKE A BREATHER.</h2>
        <p class="overlay-copy">The clock is stopped. Your tyres are cooling.</p>
        <div class="overlay-buttons">
          <button class="primary-button" data-action="resume">BACK TO RACE ${icon('arrow')}</button>
          <div class="overlay-split">
            <button class="secondary-button" data-action="restart">RESTART</button>
            <button class="secondary-button" data-action="menu">MAIN MENU</button>
          </div>
          ${timeTrial ? `<button class="secondary-button" data-action="continue">FINISH SESSION</button>` : ''}
        </div>
      </div></div>`;
    el.querySelector('button')?.focus();
  }

  hidePause() {
    document.getElementById('pause-overlay').hidden = true;
    document.getElementById('pause-overlay').innerHTML = '';
  }

  showResults({ title, headline, copy, stats, rows, canContinue, isQualifying }) {
    const el = document.getElementById('results-overlay');
    el.hidden = false;
    el.innerHTML = `
      <div class="overlay"><div class="overlay-card">
        <div class="eyebrow lime">${escapeHtml(title)}</div>
        <h2 class="overlay-title">${escapeHtml(headline)}</h2>
        <p class="overlay-copy">${escapeHtml(copy)}</p>
        <div class="result-stats">${stats.map((s) => `<div class="result-stat"><span>${escapeHtml(s.label)}</span><strong>${s.value}</strong></div>`).join('')}</div>
        ${rows?.length ? `<div class="result-table">${rows.map((r) => `<div class="${r.isPlayer ? 'player' : ''}"><span>${escapeHtml(r.left)}</span><span>${escapeHtml(r.right)}</span></div>`).join('')}</div>` : ''}
        <div class="overlay-buttons">
          ${canContinue
            ? `<button class="primary-button" data-action="continue">${isQualifying ? 'GO TO THE GRID' : 'NEXT RACE'} ${icon('arrow')}</button>`
            : `<button class="primary-button" data-action="restart">RACE AGAIN ${icon('arrow')}</button>`}
          <div class="overlay-split">
            <button class="secondary-button" data-action="replay">${icon('replay')} WATCH REPLAY</button>
            <button class="secondary-button" data-action="menu">MAIN MENU</button>
          </div>
        </div>
      </div></div>`;
    el.querySelector('button')?.focus();
  }

  hideResults() {
    document.getElementById('results-overlay').hidden = true;
    document.getElementById('results-overlay').innerHTML = '';
  }

  setReplayBanner(visible) {
    document.getElementById('replay-banner').hidden = !visible;
  }

  fatal(message) {
    const el = document.getElementById('fatal-error');
    el.hidden = false;
    el.textContent = message;
  }
}
