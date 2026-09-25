// Player movement: WASD relative to the camera, or click-to-move. Collision uses the room's 2D
// collision world, so the avatar slides along walls instead of sticking.
import * as THREE from "three";
import { play } from "./audio.js";

const SPEED = { dwarf: 4.3, human: 4.7, elf: 5.1 };
const KEYS = { w: "f", arrowup: "f", s: "b", arrowdown: "b", a: "l", arrowleft: "l", d: "r", arrowright: "r" };

export class PlayerController {
  constructor() {
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.keys = new Set();
    this.walk = false;
    this.path = null;
    this.radius = 0.42;
    this.race = "human";
    this.stepT = 0;
    this.moved = 0;
    this._down = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const k = KEYS[e.key.toLowerCase()];
      if (k) { this.keys.add(k); this.path = null; }
      if (e.key === "Shift") this.walk = true;
    };
    this._up = (e) => {
      const k = KEYS[e.key.toLowerCase()];
      if (k) this.keys.delete(k);
      if (e.key === "Shift") this.walk = false;
    };
    this._blur = () => { this.keys.clear(); this.walk = false; };
    window.addEventListener("keydown", this._down);
    window.addEventListener("keyup", this._up);
    window.addEventListener("blur", this._blur);
  }

  dispose() {
    window.removeEventListener("keydown", this._down);
    window.removeEventListener("keyup", this._up);
    window.removeEventListener("blur", this._blur);
  }

  place(x, z, yaw) { this.pos.set(x, 0, z); this.yaw = yaw; this.path = null; this.speed = 0; }

  moveTo(x, z, { stop = 0.3, onArrive = null } = {}) {
    this.path = { x, z, stop, onArrive, best: Infinity, stuck: 0 };
  }

  cancel() { this.path = null; this.keys.clear(); }

  update(dt, cam, col, enabled) {
    let ix = 0, iz = 0;
    if (enabled) {
      const f = cam.forward();
      const r = { x: -f.z, z: f.x };
      if (this.keys.has("f")) { ix += f.x; iz += f.z; }
      if (this.keys.has("b")) { ix -= f.x; iz -= f.z; }
      if (this.keys.has("r")) { ix += r.x; iz += r.z; }
      if (this.keys.has("l")) { ix -= r.x; iz -= r.z; }
      if (!ix && !iz && this.path) {
        const dx = this.path.x - this.pos.x, dz = this.path.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d <= this.path.stop) {
          const cb = this.path.onArrive; this.path = null; cb?.();
        } else {
          ix = dx / d; iz = dz / d;
          if (d < this.path.best - 0.05) { this.path.best = d; this.path.stuck = 0; } else if ((this.path.stuck += dt) > 0.7) {
            const cb = this.path.onArrive, near = d < this.path.stop + 1.8;
            this.path = null;
            if (near) cb?.();
          }
        }
      }
    } else {
      this.path = null;
    }
    const len = Math.hypot(ix, iz);
    const max = (SPEED[this.race] || 4.7) * (this.walk ? 0.45 : 1);
    const want = len > 0 ? max : 0;
    this.speed += (want - this.speed) * Math.min(1, dt * (want > this.speed ? 10 : 14));
    if (len > 0) {
      ix /= len; iz /= len;
      const target = Math.atan2(ix, iz);
      const d = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
      this.yaw += d * Math.min(1, dt * 12);
      this.dir = { x: ix, z: iz };
    }
    if (this.speed > 0.01 && this.dir) {
      const p = { x: this.pos.x + this.dir.x * this.speed * dt, z: this.pos.z + this.dir.z * this.speed * dt };
      col?.resolve(p, this.radius);
      const moved = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      this.moved += moved;
      this.pos.x = p.x; this.pos.z = p.z;
      this.actualSpeed = moved / Math.max(1e-4, dt);
      this.stepT += moved;
      if (this.stepT > (this.race === "dwarf" ? 0.7 : 0.9)) { this.stepT = 0; play("step"); }
    } else this.actualSpeed = 0;
    return this.actualSpeed;
  }
}
