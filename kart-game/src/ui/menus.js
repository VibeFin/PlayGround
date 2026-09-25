/**
 * menus.js — title / pause / results menus + game-state machine.
 *
 * Owned by Agent 4. No framework, pure DOM. Works with the #menu and
 * #paused-banner elements from index.html; creates fallbacks otherwise.
 * Safe when scene/karts are missing (menus never touch the 3D world).
 *
 * States: MENU -> COUNTDOWN -> RACING -> FINISHED, plus PAUSED overlay.
 * Pause toggling: Esc / P (also wired to Input.consumePausePressed by main.js).
 * Character select: kart color swatches, exposed via `selectedColor`.
 *
 * Menus API:
 *   const menus = new Menus({ onStart, onResume, onRestart, onQuit, onColor });
 *   menus.show('MENU' | 'COUNTDOWN' | 'RACING' | 'PAUSED' | 'FINISHED');
 *   menus.setStatus('Loading…');
 *   menus.showResults(rows);  // forwards to HUD when available
 *   menus.bindPauseKeys(activeRef); // Esc/P handling, returns unbind()
 *   menus.selectedColor; menus.attachHud(hud); menus.destroy();
 */

export const GameStates = Object.freeze({
  MENU: 'MENU',
  COUNTDOWN: 'COUNTDOWN',
  RACING: 'RACING',
  PAUSED: 'PAUSED',
  FINISHED: 'FINISHED',
});

export const KART_COLORS = ['#e33e2b', '#2b7de3', '#2bd95f', '#ffcf3f', '#b44de3', '#ff7ab8', '#ffffff', '#222831'];

function $(id) {
  try { return typeof document !== 'undefined' && document.getElementById(id); }
  catch { return null; }
}

export class Menus {
  constructor(callbacks = {}) {
    this.cb = callbacks || {};
    this.state = GameStates.MENU;
    this.selectedColor = callbacks.initialColor || KART_COLORS[0];
    this.hud = callbacks.hud || null;
    this._paused = false;

    if (typeof document === 'undefined') return; // logic-only

    this.menuEl = $('menu') || this._makeMenuShell();
    this.statusEl = $('menu-status');
    this.startBtn = $('start-btn');
    this.pauseEl = $('paused-banner') || this._makePauseShell();

    this._ensureColorSelect();
    this._wireButtons();
  }

  attachHud(hud) { this.hud = hud || null; }

  _makeMenuShell() {
    const d = document.createElement('div');
    d.id = 'menu';
    d.innerHTML = `<h1>KART<span>·</span>GAME</h1>
      <p>WASD / Arrows to drive · Space = item / drift · R = reset · Enter = start.</p>
      <button id="start-btn" type="button">START RACE (Enter)</button>
      <p id="menu-status"></p>`;
    document.body.appendChild(d);
    return d;
  }

  _makePauseShell() {
    const d = document.createElement('div');
    d.id = 'paused-banner';
    d.textContent = 'PAUSED — press P / Esc to resume';
    document.body.appendChild(d);
    return d;
  }

  _ensureColorSelect() {
    if (!this.menuEl || this.menuEl.querySelector('[data-colors]')) return;
    const wrap = document.createElement('div');
    wrap.setAttribute('data-colors', '1');
    wrap.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:center;pointer-events:auto;flex-wrap:wrap';
    const label = document.createElement('span');
    label.textContent = 'KART:';
    label.style.cssText = 'font-weight:800;font-size:14px;letter-spacing:1px;opacity:.9';
    wrap.appendChild(label);
    this._swatches = [];
    KART_COLORS.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = c;
      b.setAttribute('aria-label', 'kart color ' + c);
      b.style.cssText = `width:30px;height:30px;border-radius:50%;padding:0;background:${c};` +
        `border:${i === 0 ? '3px solid #ffcf3f' : '2px solid rgba(255,255,255,.5)'}`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectColor(c);
      });
      wrap.appendChild(b);
      this._swatches.push(b);
    });
    const anchor = this.startBtn || this.statusEl;
    try { this.menuEl.insertBefore(wrap, anchor); }
    catch { this.menuEl.appendChild(wrap); }
    this.selectColor(this.selectedColor, true);
  }

  selectColor(color, silent = false) {
    this.selectedColor = color;
    if (this._swatches) {
      this._swatches.forEach((b) => {
        const on = b.title === color;
        b.style.border = on ? '3px solid #ffcf3f' : '2px solid rgba(255,255,255,.5)';
      });
    }
    if (!silent) {
      try { this.cb.onColor?.(color); } catch { /* ignore */ }
    }
  }

  _wireButtons() {
    this._onStartClick = () => { try { this.cb.onStart?.(this.selectedColor); } catch { /* ignore */ } };
    this.startBtn?.addEventListener('click', this._onStartClick);
    this._onPauseClick = () => { try { this.cb.onResume?.(); } catch { /* ignore */ } };
    this.pauseEl?.addEventListener('click', this._onPauseClick);

    // Extra pause-menu actions injected once (Resume / Restart / Quit).
    if (this.pauseEl && !this.pauseEl.querySelector('[data-pause-btns]')) {
      const row = document.createElement('div');
      row.setAttribute('data-pause-btns', '1');
      row.style.cssText = 'display:flex;gap:10px;margin-top:16px;pointer-events:auto';
      const mk = (label, fn) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.style.cssText = 'cursor:pointer;border:0;border-radius:10px;padding:10px 22px;font-size:16px;font-weight:800;background:#ffcf3f;color:#1a1a1a';
        b.addEventListener('click', (e) => { e.stopPropagation(); try { fn?.(); } catch { /* ignore */ } });
        return b;
      };
      row.appendChild(mk('RESUME', () => this.cb.onResume?.()));
      row.appendChild(mk('RESTART', () => this.cb.onRestart?.()));
      row.appendChild(mk('QUIT', () => this.cb.onQuit?.()));
      // Stack vertically under the banner text.
      this.pauseEl.style.flexDirection = 'column';
      this.pauseEl.appendChild(row);
    }
  }

  /** Switch overlay visibility for a game state. Returns the state. */
  show(state) {
    this.state = state;
    if (typeof document === 'undefined') return state;
    const racing = state === GameStates.RACING || state === GameStates.COUNTDOWN;
    this.menuEl?.classList.toggle('hidden', state !== GameStates.MENU && state !== GameStates.FINISHED ? true : false);
    // FINISHED reuses the HUD results card; keep the title menu hidden then.
    if (state === GameStates.FINISHED) this.menuEl?.classList.add('hidden');
    if (state === GameStates.MENU) this.menuEl?.classList.remove('hidden');
    if (state === GameStates.RACING || state === GameStates.COUNTDOWN) this.menuEl?.classList.add('hidden');
    this.setPaused(state === GameStates.PAUSED);
    void racing;
    return state;
  }

  setPaused(paused) {
    this._paused = !!paused;
    this.pauseEl?.classList.toggle('visible', this._paused);
  }

  get paused() { return this._paused; }

  setStatus(text) {
    if (this.statusEl && typeof text === 'string') this.statusEl.textContent = text;
  }

  showTitle(status) {
    if (status !== undefined) this.setStatus(status);
    return this.show(GameStates.MENU);
  }

  showResults(rows, title = '🏁 RESULTS') {
    this.show(GameStates.FINISHED);
    if (this.hud?.showResults) this.hud.showResults(rows, { title });
  }

  hideResults() {
    this.hud?.hideResults?.();
  }

  /**
   * Esc/P global handler. activeRef: () => true when pausing is allowed
   * (e.g. state is RACING or PAUSED). onToggle(paused) performs the switch.
   * Returns an unbind function.
   */
  bindPauseKeys(activeRef, onToggle) {
    if (typeof window === 'undefined') return () => {};
    const handler = (e) => {
      if (e.code !== 'Escape' && e.code !== 'KeyP') return;
      if (e.code === 'Escape' && e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      let active = true;
      try { active = activeRef ? activeRef() : true; } catch { active = true; }
      if (!active) return;
      e.preventDefault();
      try { onToggle?.(!this._paused); } catch { /* ignore */ }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }

  destroy() {
    this.startBtn?.removeEventListener('click', this._onStartClick);
    this.pauseEl?.removeEventListener('click', this._onPauseClick);
  }
}

export default Menus;
