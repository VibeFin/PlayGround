/**
 * Unified keyboard + touch + gamepad input.
 * The original maps touch buttons to KeyA/D/S/W via `aB`; we keep a single
 * `{ steer, throttle, brake, handbrake }` frame consumed by physics.
 */
export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, brake: false, gas: false };
    this.cameraPressed = false;
    this.onPause = null;
    this.onReset = null;
    this.onCamera = null;
    this.onAnyGesture = null;
    this.attach();
  }

  attach() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.emitGesture();
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPause?.();
      if (e.code === 'KeyR') this.onReset?.();
      if (e.code === 'KeyC') this.onCamera?.();
      if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('spline:control', (e) => {
      const { control, pressed } = e.detail ?? {};
      if (control in this.touch) this.touch[control] = !!pressed;
      this.emitGesture();
    });
  }

  emitGesture() {
    this.onAnyGesture?.();
  }

  setTouch(control, pressed) {
    if (control in this.touch) this.touch[control] = !!pressed;
  }

  /** Poll gamepad each frame; merges stick/trigger state. */
  pollGamepad(frame) {
    try {
      const pads = navigator.getGamepads?.() ?? [];
      const gp = [...pads].find((p) => p?.connected);
      if (!gp) return frame;
      const dz = (v) => (Math.abs(v) < 0.08 ? 0 : v);
      const steer = dz(gp.axes[0] ?? 0);
      if (steer) frame.steer = steering_clamp(steer);
      const rt = gp.buttons[7]?.value ?? 0;
      const lt = gp.buttons[6]?.value ?? 0;
      if (rt > 0.05) frame.throttle = Math.max(frame.throttle, rt);
      if (lt > 0.05) frame.brake = Math.max(frame.brake, lt);
      if (gp.buttons[0]?.pressed) frame.handbrake = true;
      return frame;
    } catch {
      return frame;
    }
  }

  frame() {
    const k = this.keys;
    const left = k.has('KeyA') || k.has('ArrowLeft') || this.touch.left;
    const right = k.has('KeyD') || k.has('ArrowRight') || this.touch.right;
    const gas = k.has('KeyW') || k.has('ArrowUp') || this.touch.gas;
    const brake = k.has('KeyS') || k.has('ArrowDown') || this.touch.brake;
    const out = {
      steer: (left ? -1 : 0) + (right ? 1 : 0),
      throttle: gas ? 1 : 0,
      brake: brake ? 1 : 0,
      handbrake: k.has('Space'),
    };
    return this.pollGamepad(out);
  }
}

function steering_clamp(v) {
  return Math.max(-1, Math.min(1, v));
}
