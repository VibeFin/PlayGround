import type { Input } from "./input";

/**
 * Touch controls for phones and tablets.
 *
 * - Left thumb stick: push up to pedal (walk ahead on foot), down to brake,
 *   sideways to steer. Writes the analog axes on {@link Input} that the bike
 *   controller and the on-foot locomotion already consume.
 * - Drag on the scene: look around while riding (the on-foot orbit camera
 *   already drags via its own pointer handlers, so look drags are skipped
 *   there to avoid turning twice).
 * - Buttons: Shift-style sprint hold, F / C / V / T / bell / mute via
 *   synthetic key events (so the existing key handlers stay the single
 *   source of truth), plus a pause toggle wired by the caller.
 *
 * Everything is built in code (no index.html markup): `attach()` no-ops on
 * devices without touch unless `?touch=1` forces the UI (for testing).
 */
export interface TouchHooks {
  /** First-gesture work (audio start). */
  onFirst: () => void;
  /** Riding look deltas, in CSS px (wired to ChaseCam.lookBy by the caller). */
  onLook: (dx: number, dy: number) => void;
  /** True while she is walking (look drags are left to the orbit camera). */
  isOnFoot: () => boolean;
  /** Pause button. */
  onPauseToggle: () => void;
  /** Pinch-zoom scale factor while on foot (wired to the orbit camera). */
  onPinch?: (factor: number) => void;
}

/** True when the touch UI should show (touch device, or forced by ?touch=1/0). */
export function touchUI(): boolean {
  const forced = new URLSearchParams(location.search).get("touch");
  if (forced === "1") return true;
  if (forced === "0") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches;
}

const STICK_R = 52;
const DEAD = 0.14;

function key(code: string): void {
  for (const type of ["keydown", "keyup"]) {
    window.dispatchEvent(
      new KeyboardEvent(type, { code, bubbles: true, cancelable: true }),
    );
  }
}

function buzz(ms = 8): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}

export class TouchControls {
  /** True when the touch UI is shown (touch device or ?touch=1, and not ?touch=0). */
  readonly active: boolean;
  private root: HTMLDivElement | null = null;
  private knob: HTMLDivElement | null = null;
  private stickId: number | null = null;
  private lookId: number | null = null;
  private lastLX = 0;
  private lastLY = 0;
  private pinchD = 0;

  constructor(
    private readonly input: Input,
    private readonly hooks: TouchHooks,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.active = touchUI();
  }

  /** Build the overlay. Call once; show() decides visibility per game state. */
  attach(): void {
    if (!this.active || this.root) return;
    const style = document.createElement("style");
    style.id = "touch-css";
    style.textContent = `
      #touch { position: fixed; inset: 0; z-index: 8; pointer-events: none;
        font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
        user-select: none; -webkit-user-select: none; touch-action: none; }
      #touch.hidden { display: none; }
      #tstick { position: absolute; left: max(18px, env(safe-area-inset-left)); bottom: max(26px, env(safe-area-inset-bottom));
        width: 124px; height: 124px; border-radius: 50%; pointer-events: auto; touch-action: none;
        background: radial-gradient(circle, rgba(246,239,220,0.16), rgba(246,239,220,0.07) 70%, transparent);
        border: 1.5px solid rgba(255,252,240,0.4); box-shadow: 0 1px 6px rgba(40,30,20,0.25), inset 0 0 12px rgba(255,252,240,0.08); }
      #tknob { position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; border-radius: 50%;
        transform: translate(-50%, -50%); background: radial-gradient(circle at 35% 30%, rgba(255,253,245,0.85), rgba(240,228,200,0.75));
        border: 1.5px solid rgba(90,80,65,0.5); box-shadow: 0 2px 8px rgba(40,30,20,0.35); }
      #tbtns { position: absolute; right: max(14px, env(safe-area-inset-right)); bottom: max(22px, env(safe-area-inset-bottom));
        display: grid; grid-template-columns: repeat(3, 52px); gap: 10px; pointer-events: auto; }
      #tbtns button, #tpause { pointer-events: auto; touch-action: none;
        width: 52px; height: 52px; border-radius: 50%; border: 1.5px solid rgba(255,252,240,0.45);
        background: rgba(46,42,51,0.42); color: #fff8e8; font: inherit; font-size: 15px; letter-spacing: 0.02em;
        text-shadow: 0 1px 2px rgba(0,0,0,0.5); backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); }
      #tbtns button:active, #tpause:active { background: rgba(185,70,60,0.6); }
      #tbtns button.held { background: rgba(185,70,60,0.6); }
      #tbtns button.small { font-size: 12px; }
      #tpause { position: absolute; top: max(12px, env(safe-area-inset-top)); right: max(14px, env(safe-area-inset-right));
        width: 44px; height: 44px; font-size: 14px; }
      @media (orientation: landscape) {
        #tstick { bottom: max(16px, env(safe-area-inset-bottom)); }
        #tbtns { bottom: max(14px, env(safe-area-inset-bottom)); }
      }
    `;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "touch";
    root.className = "hidden";
    root.innerHTML = `
      <div id="tstick" aria-label="Ride stick"><div id="tknob"></div></div>
      <div id="tbtns">
        <button data-k="sprint" aria-label="Sprint">»</button>
        <button data-k="KeyF" aria-label="Walk or ride">F</button>
        <button data-k="KeyV" aria-label="First or third person">V</button>
        <button data-k="KeyC" aria-label="Cinematic camera">C</button>
        <button data-k="KeyT" aria-label="Time of day">T</button>
        <button data-k="KeyB" aria-label="Bell">♪</button>
      </div>
      <button id="tpause" aria-label="Pause">II</button>
    `;
    document.body.appendChild(root);
    this.root = root;
    this.knob = root.querySelector("#tknob");

    const stick = root.querySelector<HTMLElement>("#tstick")!;
    stick.addEventListener("touchstart", this.onStickStart, { passive: false });
    stick.addEventListener("touchmove", this.onStickMove, { passive: false });
    stick.addEventListener("touchend", this.onStickEnd);
    stick.addEventListener("touchcancel", this.onStickEnd);
    // Mouse fallback (for ?touch=1 on desktop): drag the stick with the mouse.
    stick.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && this.stickId === null) {
        this.stickId = -1;
        this.moveStick(e.clientX, e.clientY);
        const mv = (m: PointerEvent) => this.moveStick(m.clientX, m.clientY);
        const up = () => {
          removeEventListener("pointermove", mv);
          removeEventListener("pointerup", up);
          this.stickId = null;
          this.centerStick();
        };
        addEventListener("pointermove", mv);
        addEventListener("pointerup", up);
      }
    });

    for (const b of root.querySelectorAll<HTMLButtonElement>("#tbtns button")) {
      const code = b.dataset.k!;
      if (code === "sprint") {
        const on = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          this.hooks.onFirst();
          this.input.sprint = true;
          b.classList.add("held");
          buzz();
        };
        const off = (e: Event) => {
          e.preventDefault();
          this.input.sprint = false;
          b.classList.remove("held");
        };
        b.addEventListener("touchstart", on, { passive: false });
        b.addEventListener("touchend", off);
        b.addEventListener("touchcancel", off);
        b.addEventListener("mousedown", on);
        b.addEventListener("mouseup", off);
        b.addEventListener("mouseleave", off);
      } else {
        const tap = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          this.hooks.onFirst();
          key(code);
          buzz();
        };
        b.addEventListener("touchstart", tap, { passive: false });
        b.addEventListener("mousedown", tap);
      }
    }
    const pause = root.querySelector("#tpause")!;
    const pTap = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.hooks.onPauseToggle();
      buzz();
    };
    pause.addEventListener("touchstart", pTap, { passive: false });
    pause.addEventListener("mousedown", pTap);

    // Look drags on the scene (riding only; on foot the orbit camera drags).
    // Pinch (two fingers) zooms the on-foot orbit camera instead of looking.
    this.canvas.addEventListener("touchstart", this.onLookStart, { passive: false });
    this.canvas.addEventListener("touchmove", this.onLookMove, { passive: false });
    this.canvas.addEventListener("touchend", this.onLookEnd);
    this.canvas.addEventListener("touchcancel", this.onLookEnd);
  }

  /** Show or hide the overlay (loader up, paused, …). */
  show(v: boolean): void {
    this.root?.classList.toggle("hidden", !v);
    if (!v) {
      this.input.ax = this.input.ay = 0;
      this.input.sprint = false;
      this.stickId = this.lookId = null;
      this.pinchD = 0;
      this.centerStick();
    }
  }

  /** Test hook: current joystick deflection. */
  get joy(): { x: number; y: number } {
    return { x: this.input.ax, y: this.input.ay };
  }

  // -- thumb stick -----------------------------------------------------------

  private readonly onStickStart = (e: TouchEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    this.hooks.onFirst();
    const t = e.changedTouches[0];
    this.stickId = t.identifier;
    this.moveStick(t.clientX, t.clientY);
  };

  private readonly onStickMove = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        e.preventDefault();
        this.moveStick(t.clientX, t.clientY);
      }
    }
  };

  private readonly onStickEnd = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        this.stickId = null;
        this.centerStick();
      }
    }
  };

  private moveStick(cx: number, cy: number): void {
    const el = this.root?.querySelector("#tstick");
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = (cx - (r.left + r.width / 2)) / STICK_R;
    let dy = (cy - (r.top + r.height / 2)) / STICK_R;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    // Up on the stick (negative screen dy) is forward.
    const ax = Math.abs(dx) < DEAD ? 0 : (dx - Math.sign(dx) * DEAD) / (1 - DEAD);
    const ay = Math.abs(dy) < DEAD ? 0 : (-dy - Math.sign(-dy) * DEAD) / (1 - DEAD);
    this.input.ax = Math.max(-1, Math.min(1, ax));
    this.input.ay = Math.max(-1, Math.min(1, ay));
    if (this.knob) {
      this.knob.style.transform = `translate(calc(-50% + ${dx * 34}px), calc(-50% + ${dy * 34}px))`;
    }
  }

  private centerStick(): void {
    this.input.ax = this.input.ay = 0;
    if (this.knob) this.knob.style.transform = "translate(-50%, -50%)";
  }

  // -- look + pinch ----------------------------------------------------------

  private readonly onLookStart = (e: TouchEvent): void => {
    this.hooks.onFirst();
    if (e.touches.length === 2) {
      // Pinch takes over: stop any look in progress.
      this.lookId = null;
      this.pinchD = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      e.preventDefault();
      return;
    }
    if (this.lookId !== null || this.hooks.isOnFoot()) return;
    const t = e.changedTouches[0];
    this.lookId = t.identifier;
    this.lastLX = t.clientX;
    this.lastLY = t.clientY;
  };

  private readonly onLookMove = (e: TouchEvent): void => {
    if (e.touches.length === 2 && this.hooks.isOnFoot()) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      if (this.pinchD > 0) this.hooks.onPinch?.(this.pinchD / Math.max(1, d));
      this.pinchD = d;
      e.preventDefault();
      return;
    }
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.lookId) {
        this.hooks.onLook(t.clientX - this.lastLX, t.clientY - this.lastLY);
        this.lastLX = t.clientX;
        this.lastLY = t.clientY;
        e.preventDefault();
      }
    }
  };

  private readonly onLookEnd = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.lookId) this.lookId = null;
    }
    if (e.touches.length < 2) this.pinchD = 0;
  };
}
