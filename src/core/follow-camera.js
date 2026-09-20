/**
 * Chase / hood / onboard cameras + menu orbit.
 * Minified `DB` (0/1/2) + `RB.update` chase look-ahead
 * `sample(s + 18 + speed * 0.25)`.
 */
import * as THREE from 'three';

export const CAMERA_MODES = ['CHASE', 'HOOD', 'ONBOARD'];

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = 0;
    this.pos = new THREE.Vector3(0, 5, -12);
    this.look = new THREE.Vector3();
  }

  cycle() {
    this.mode = (this.mode + 1) % CAMERA_MODES.length;
    return CAMERA_MODES[this.mode];
  }

  update(track, car, dt) {
    const frame = track.sample(car.s);
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z) + car.heading;
    const ahead = track.sample(car.s + 18 + Math.max(0, car.speed) * 0.25);

    if (this.mode === 1) {
      // Hood: glued to the bonnet.
      this.pos.copy(frame.position).addScaledVector(frame.right, car.lateral * 0.9).addScaledVector(frame.up, 1.25).addScaledVector(frame.tangent, 1.2);
      this.look.copy(ahead.position).add(new THREE.Vector3(0, 0.8, 0));
    } else if (this.mode === 2) {
      this.pos.copy(frame.position).addScaledVector(frame.right, car.lateral * 0.9).addScaledVector(frame.up, 1.05).addScaledVector(frame.tangent, -0.4);
      this.look.copy(ahead.position).add(new THREE.Vector3(0, 0.9, 0));
    } else {
      const back = 8.5 + Math.max(0, car.speed) * 0.045;
      const up = 3.1 + Math.max(0, car.speed) * 0.008;
      const desired = frame.position
        .clone()
        .addScaledVector(frame.right, car.lateral * 0.85 - Math.sin(yaw - Math.atan2(frame.tangent.x, frame.tangent.z)) * 0)
        .addScaledVector(frame.tangent, -back)
        .addScaledVector(frame.up, up);
      // Rotate offset by heading so slides feel alive.
      const offset = desired.clone().sub(frame.position);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), car.heading * 0.5);
      this.pos.lerp(frame.position.clone().add(offset), 1 - Math.exp(-dt * 6));
      this.look.lerp(ahead.position.clone().add(new THREE.Vector3(0, 1.1, 0)), 1 - Math.exp(-dt * 8));
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    this.camera.up.set(0, 1, 0);
  }

  /** Slow orbit around a parked show car (menu state). */
  orbitMenu(dt, target, radius = 9, height = 2.6) {
    const t = performance.now() / 1000 * 0.22;
    this.pos.set(target.x + Math.cos(t) * radius, target.y + height, target.z + Math.sin(t) * radius);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(target.x, target.y + 0.8, target.z);
  }
}
