export class Input {
  up = false;
  down = false;
  left = false;
  right = false;
  /** Shift held (sprint on the bike; the on-foot explorer reads Shift itself for running). */
  sprint = false;
  /**
   * Touch joystick axes, -1..1. `ay` > 0 pushes forward (pedal / walk ahead),
   * `ay` < 0 brakes / steps back; `ax` > 0 steers / strafes right.
   * Written by TouchControls; keyboard state above is OR-ed with these by consumers.
   */
  ax = 0;
  ay = 0;

  constructor(onFirst: () => void, onToggleView: () => void = () => {}) {
    const set = (code: string, v: boolean) => {
      switch (code) {
        case "KeyW":
        case "ArrowUp":
          this.up = v;
          return true;
        case "KeyS":
        case "ArrowDown":
          this.down = v;
          return true;
        case "KeyA":
        case "ArrowLeft":
          this.left = v;
          return true;
        case "KeyD":
        case "ArrowRight":
          this.right = v;
          return true;
        case "ShiftLeft":
        case "ShiftRight":
          this.sprint = v;
          return false;
      }
      return false;
    };
    addEventListener("keydown", (e) => {
      onFirst();
      if (e.code === "KeyV" && !e.repeat) onToggleView();
      if (set(e.code, true)) e.preventDefault();
    });
    addEventListener("keyup", (e) => {
      set(e.code, false);
    });
    addEventListener("pointerdown", onFirst);
    addEventListener("blur", () => {
      this.up = this.down = this.left = this.right = this.sprint = false;
      this.ax = this.ay = 0;
    });
  }
}
