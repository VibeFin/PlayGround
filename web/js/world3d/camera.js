// Third-person spring-arm camera. Orbit with right/middle drag (or left drag on empty ground),
// zoom with the wheel. The arm shortens against walls and never rises through the ceiling.
import * as THREE from "three";

const _d = new THREE.Vector3();

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.mode = "follow";
    this.yaw = Math.PI;       // camera sits at target + (sin yaw, ., cos yaw) * dist
    this.pitch = 0.42;
    this.dist = 7;
    this.curDist = 7;
    this.target = new THREE.Vector3();
    this.goal = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.shakeAmt = 0;
    this.invertY = false;
    this.speed = 1;
    this.limits = { minPitch: -0.15, maxPitch: 1.25, minDist: 2.2, maxDist: 13 };
    this.onClick = null;
    this.onHover = null;
    this.drag = null;
    this.lastUserInput = 0;
    this.autoYaw = null;
    this._bind();
  }

  _bind() {
    const el = this.dom;
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture?.(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, button: e.button, moved: 0, id: e.pointerId };
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.drag) { this.onHover?.(e.clientX, e.clientY); return; }
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
      this.drag.moved += Math.abs(dx) + Math.abs(dy);
      if (this.drag.moved > 4) {
        const k = 0.005 * this.speed;
        this.yaw -= dx * k;
        this.pitch += (this.invertY ? -dy : dy) * k;
        this.pitch = Math.max(this.limits.minPitch, Math.min(this.limits.maxPitch, this.pitch));
        this.lastUserInput = performance.now();
        this.autoYaw = null;
      }
    });
    const end = (e) => {
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      if (d.moved <= 4 && d.button === 0) this.onClick?.(e.clientX, e.clientY);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", () => { this.drag = null; });
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.dist *= Math.exp(Math.sign(e.deltaY) * 0.12);
      this.dist = Math.max(this.limits.minDist, Math.min(this.limits.maxDist, this.dist));
      this.lastUserInput = performance.now();
    }, { passive: false });
  }

  get dragging() { return !!this.drag && this.drag.moved > 4; }

  // Ground-plane forward/right vectors for camera-relative movement.
  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }

  setMode(mode, opts = {}) {
    if (mode === this.mode && !opts.force) return;
    this.mode = mode;
    if (mode === "follow") { this.limits = { minPitch: -0.15, maxPitch: 1.25, minDist: 2.2, maxDist: 13 }; if (opts.dist) this.dist = opts.dist; }
    if (mode === "tactical") { this.limits = { minPitch: 0.25, maxPitch: 1.3, minDist: 7, maxDist: 20 }; this.dist = opts.dist ?? 12.5; this.pitch = opts.pitch ?? 0.62; if (opts.yaw !== undefined) this.autoYaw = opts.yaw; }
    if (mode === "dialogue") { this.limits = { minPitch: -0.1, maxPitch: 0.8, minDist: 2.5, maxDist: 7 }; this.dist = opts.dist ?? 4.2; this.pitch = 0.14; if (opts.yaw !== undefined) this.autoYaw = opts.yaw; }
    if (mode === "showcase") {
      this.limits = { minPitch: 0, maxPitch: 0.9, minDist: 3, maxDist: 40 };
      this.dist = opts.dist ?? 18; this.pitch = opts.pitch ?? 0.3;
      this.spin = opts.spin ?? true;
      if (opts.yaw !== undefined) this.yaw = opts.yaw;
    }
  }

  snap() { this.target.copy(this.goal); this.curDist = this.dist; }

  shake(a) { this.shakeAmt = Math.min(0.6, this.shakeAmt + a); }

  update(dt, col, ceiling) {
    if (this.autoYaw !== null) {
      const d = Math.atan2(Math.sin(this.autoYaw - this.yaw), Math.cos(this.autoYaw - this.yaw));
      this.yaw += d * Math.min(1, dt * 3);
      if (Math.abs(d) < 0.01) this.autoYaw = null;
    }
    if (this.mode === "showcase" && this.spin && !this.dragging) this.yaw += dt * 0.05;
    this.target.lerp(this.goal, Math.min(1, dt * (this.mode === "follow" ? 14 : 4)));
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    _d.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    let allowed = this.dist;
    if (col) {
      const far = this.target.clone().addScaledVector(_d, this.dist);
      const t = col.raycast(this.target, far, 0.35);
      allowed = Math.max(0.9, this.dist * t - 0.25);
    }
    if (ceiling > 0 && sp > 0.01) allowed = Math.min(allowed, Math.max(0.9, (ceiling - 0.6 - this.target.y) / sp));
    if (sp < -0.01) allowed = Math.min(allowed, Math.max(0.9, (this.target.y - 0.25) / -sp));
    // Pull in quickly when blocked, ease back out slowly: no popping through walls.
    const k = allowed < this.curDist ? 20 : 3;
    this.curDist += (allowed - this.curDist) * Math.min(1, dt * k);
    if (this.curDist > allowed + 0.4) this.curDist = allowed + 0.4;
    this.camera.position.copy(this.target).addScaledVector(_d, this.curDist);
    if (this.shakeAmt > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.pow(0.001, dt);
    }
    this.lookAt.copy(this.target);
    this.camera.lookAt(this.lookAt);
  }
}
