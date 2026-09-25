/**
 * Input.js — keyboard (+ optional gamepad) state for the kart game.
 *
 * Owned by Agent 1. Other agents: read via `input.state` or `input.consume*()`.
 *
 * Bindings:
 *  - WASD / Arrows : throttle + steering
 *  - Space         : item use / drift (edge-triggered via consumeItemPressed)
 *  - R             : reset (edge-triggered via consumeResetPressed)
 *  - Enter         : start / confirm (edge-triggered via consumeStartPressed)
 *  - P / Esc       : pause (edge-triggered via consumePausePressed)
 */

export class Input {
  constructor(target = window) {
    this.target = target;
    /** Continuous state, read every physics tick. */
    this.state = {
      throttle: 0, // -1..1 (forward positive)
      steer: 0,    // -1..1 (right positive)
      drift: false,
      boost: false
    };

    this._keys = new Set();
    this._itemQueued = false;
    this._resetQueued = false;
    this._startQueued = false;
    this._pauseQueued = false;
    this._enabled = true;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);

    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup', this._onKeyUp);
    // Key events on window also fire for buttons; blur clears held keys.
    if (typeof window !== 'undefined') window.addEventListener('blur', this._onBlur);
  }

  setEnabled(enabled) {
    this._enabled = enabled;
    if (!enabled) this._clearAll();
  }

  get enabled() {
    return this._enabled;
  }

  _onKeyDown(e) {
    // Avoid scrolling with game keys.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.repeat) return;
    this._keys.add(e.code);
    if (e.code === 'Space') this._itemQueued = true;
    if (e.code === 'KeyR') this._resetQueued = true;
    if (e.code === 'Enter') this._startQueued = true;
    if (e.code === 'KeyP' || e.code === 'Escape') this._pauseQueued = true;
    this._recompute();
  }

  _onKeyUp(e) {
    this._keys.delete(e.code);
    this._recompute();
  }

  _onBlur() {
    this._clearAll();
  }

  _clearAll() {
    this._keys.clear();
    this.state.throttle = 0;
    this.state.steer = 0;
    this.state.drift = false;
    // Keep edge-triggered queues? Drop them on blur to avoid stale presses.
    this._itemQueued = false;
    this._resetQueued = false;
    this._startQueued = false;
  }

  _recompute() {
    const k = this._keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    const back = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const left = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const right = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
    this.state.throttle = fwd - back;
    this.state.steer = right - left;
    this.state.drift = k.has('Space');
    this.state.boost = k.has('ShiftLeft') || k.has('ShiftRight');
    void this._enabled;
  }

  /**
   * Merge an optional polled gamepad into continuous state.
   * Call once per frame (render loop does this automatically).
   */
  pollGamepad() {
    try {
      const pads = typeof navigator !== 'undefined' && navigator.getGamepads
        ? navigator.getGamepads()
        : [];
      const gp = pads && [...pads].find((p) => p && p.connected);
      if (!gp) return;
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      const lx = dz(gp.axes[0] ?? 0);
      const rt = gp.buttons[7]?.value ?? 0; // RT
      const lt = gp.buttons[6]?.value ?? 0; // LT
      const a = gp.buttons[0]?.pressed;     // A
      if (rt + lt > 0.05 || a) {
        const padThrottle = (a ? 1 : rt) - lt;
        if (padThrottle !== 0) this.state.throttle = Math.max(-1, Math.min(1, padThrottle));
      }
      if (Math.abs(lx) > 0.01) this.state.steer = Math.max(-1, Math.min(1, lx));
      if (gp.buttons[1]?.pressed || gp.buttons[5]?.pressed) this._itemQueued = true;
      if (gp.buttons[9]?.pressed) this._startQueued = true;
      if (gp.buttons[3]?.pressed) this._resetQueued = true;
    } catch {
      /* gamepad unavailable — ignore */
    }
  }

  /** Edge-triggered: true once per Space press. */
  consumeItemPressed() {
    const v = this._itemQueued;
    this._itemQueued = false;
    return v;
  }

  /** Edge-triggered: true once per R press. */
  consumeResetPressed() {
    const v = this._resetQueued;
    this._resetQueued = false;
    return v;
  }

  /** Edge-triggered: true once per Enter press. */
  consumeStartPressed() {
    const v = this._startQueued;
    this._startQueued = false;
    return v;
  }

  /** Edge-triggered: true once per P/Esc press. */
  consumePausePressed() {
    const v = this._pauseQueued;
    this._pauseQueued = false;
    return v;
  }

  /** Test helper / external hook: simulate an item press. */
  queueItemPress() {
    this._itemQueued = true;
  }

  /** Test helper / external hook: simulate a start press. */
  queueStartPress() {
    this._startQueued = true;
  }

  dispose() {
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('keyup', this._onKeyUp);
    if (typeof window !== 'undefined') window.removeEventListener('blur', this._onBlur);
  }
}
