import * as THREE from 'three';
import { damp, lerpAngle } from './Utils.js';

/**
 * Camera.js — smoothed chase camera with look-ahead + boost FOV kick.
 *
 * Usage:
 *   const cam = new ChaseCamera(camera, { offset, lookAhead, ... });
 *   cam.snapTo(targetPos, targetYaw);   // on spawn / reset (no smoothing jump)
 *   cam.setBoost(true/false);           // enables FOV kick
 *   cam.update(dt, targetPos, targetYaw, speedKmh);
 */
export class ChaseCamera {
  constructor(camera, options = {}) {
    this.camera = camera;
    this.offset = options.offset ?? new THREE.Vector3(0, 4.2, -8.5);
    this.lookAhead = options.lookAhead ?? 6.0;
    this.lookHeight = options.lookHeight ?? 1.6;
    this.positionLambda = options.positionLambda ?? 6.0;
    this.lookLambda = options.lookLambda ?? 8.0;
    this.baseFov = options.baseFov ?? camera.fov ?? 62;
    this.boostFov = options.boostFov ?? this.baseFov + 12;
    this.fovLambda = options.fovLambda ?? 4.0;

    this._currentPos = new THREE.Vector3();
    this._currentLook = new THREE.Vector3();
    this._yaw = 0;
    this._initialized = false;
    this._boosting = false;
    this._fov = this.baseFov;

    this._tmpDesired = new THREE.Vector3();
    this._tmpLook = new THREE.Vector3();
    this._tmpOffset = new THREE.Vector3();
  }

  setBoost(boosting) {
    this._boosting = !!boosting;
  }

  get boosting() {
    return this._boosting;
  }

  /** Teleport camera behind the kart (spawn / reset). */
  snapTo(targetPos, targetYaw) {
    this._yaw = targetYaw;
    this._tmpOffset.copy(this.offset).applyAxisAngle(new THREE.Vector3(0, 1, 0), targetYaw);
    this._currentPos.copy(targetPos).add(this._tmpOffset);
    this._tmpLook.set(
      targetPos.x + Math.sin(targetYaw) * this.lookAhead,
      targetPos.y + this.lookHeight,
      targetPos.z + Math.cos(targetYaw) * this.lookAhead
    );
    this._currentLook.copy(this._tmpLook);
    this.camera.position.copy(this._currentPos);
    this.camera.lookAt(this._currentLook);
    this._initialized = true;
  }

  /**
   * @param {number} dt seconds (render delta)
   * @param {THREE.Vector3} targetPos kart world position
   * @param {number} targetYaw kart heading (radians, 0 = +Z)
   * @param {number} speedKmh used for extra look-ahead scaling
   */
  update(dt, targetPos, targetYaw, speedKmh = 0) {
    const safeDt = Math.min(Math.max(dt, 0), 0.1);
    if (!this._initialized) this.snapTo(targetPos, targetYaw);

    this._yaw = lerpAngle(this._yaw, targetYaw, 1 - Math.exp(-this.positionLambda * safeDt));

    const up = new THREE.Vector3(0, 1, 0);
    this._tmpOffset.copy(this.offset).applyAxisAngle(up, this._yaw);
    this._tmpDesired.copy(targetPos).add(this._tmpOffset);

    this._currentPos.x = damp(this._currentPos.x, this._tmpDesired.x, this.positionLambda, safeDt);
    this._currentPos.y = damp(this._currentPos.y, this._tmpDesired.y, this.positionLambda, safeDt);
    this._currentPos.z = damp(this._currentPos.z, this._tmpDesired.z, this.positionLambda, safeDt);

    const aheadScale = 1 + Math.min(Math.max(speedKmh, 0), 120) / 120;
    this._tmpLook.set(
      targetPos.x + Math.sin(this._yaw) * this.lookAhead * aheadScale,
      targetPos.y + this.lookHeight,
      targetPos.z + Math.cos(this._yaw) * this.lookAhead * aheadScale
    );
    this._currentLook.x = damp(this._currentLook.x, this._tmpLook.x, this.lookLambda, safeDt);
    this._currentLook.y = damp(this._currentLook.y, this._tmpLook.y, this.lookLambda, safeDt);
    this._currentLook.z = damp(this._currentLook.z, this._tmpLook.z, this.lookLambda, safeDt);

    this.camera.position.copy(this._currentPos);
    this.camera.lookAt(this._currentLook);

    const targetFov = this._boosting ? this.boostFov : this.baseFov;
    this._fov = damp(this._fov, targetFov, this.fovLambda, safeDt);
    if (Math.abs(this.camera.fov - this._fov) > 0.01) {
      this.camera.fov = this._fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
