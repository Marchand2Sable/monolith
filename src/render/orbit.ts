// An orthographic camera that turns all the way round the scene (360 degrees), tilts between a low and a high
// angle, zooms and pans. It starts in the true isometric view: 45 degrees round, 35.264 degrees down.
import * as THREE from 'three';
import { clamp, lerp } from '../core/math';

export const ISO_YAW = 45;
export const ISO_PITCH = 35.264;
const DISTANCE = 60; // orthographic: only the clip range cares
const MIN_PITCH = 8;
const MAX_PITCH = 85;
const DEG = Math.PI / 180;

export class OrbitCamera {
  readonly camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 260);
  target = new THREE.Vector3(0, 1.5, 0);
  invert = false; // the settings: dragging the other way turns the view
  yaw = ISO_YAW;
  pitch = ISO_PITCH;
  size = 8;
  private yawGoal = ISO_YAW;
  private pitchGoal = ISO_PITCH;
  private sizeGoal = 8;
  private targetGoal = new THREE.Vector3(0, 1.5, 0);
  private shakeAmount = 0;
  private aspect = 1;
  private viewH = 600;

  setViewport(width: number, height: number): void {
    this.aspect = width / Math.max(1, height);
    this.viewH = height;
  }

  /** Frame a scene of the given width (world units) and centre. `top` is the height the scene has to hold. */
  frame(centre: THREE.Vector3, width: number, top: number): void {
    // the view has to hold the board's diamond and the tallest tower on it: about 0.82 screen units per world unit of height
    const c = centre.clone();
    c.y = top * 0.45;
    this.target.copy(c);
    this.targetGoal.copy(c);
    this.size = this.sizeGoal = Math.max(5, width * 0.62 + 1.5, 0.41 * (top + width) + 1.8);
    this.resetView();
    this.yaw = this.yawGoal;
    this.pitch = this.pitchGoal;
  }

  resetView(): void {
    // the nearest isometric corner, so a reset never spins the long way round
    this.yawGoal = Math.round((this.yawGoal - ISO_YAW) / 90) * 90 + ISO_YAW;
    this.pitchGoal = ISO_PITCH;
  }

  orbit(dx: number, dy: number): void {
    // dragging right brings the front of the scene round to the right (Three.js is right-handed, Unity was left-handed: the sign is the opposite of the Unity game's)
    this.yawGoal += dx * 0.3 * (this.invert ? 1 : -1);
    this.pitchGoal = clamp(this.pitchGoal + dy * 0.25, MIN_PITCH, MAX_PITCH);
    this.yaw = this.yawGoal;
    this.pitch = this.pitchGoal;
  }

  /** A short tremor of the view (a collapse, a failure); it dies away by itself. */
  shake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** A slow turn all by itself (behind the title). */
  drift(degreesPerSecond: number, dt: number): void {
    this.yawGoal += degreesPerSecond * dt;
    this.yaw = this.yawGoal;
  }

  /** A nudge towards or away from the scene (the end of a level). */
  push(zoomFactor: number): void {
    this.sizeGoal = clamp(this.sizeGoal * zoomFactor, 3, 24);
  }

  turnBy(degrees: number): void {
    this.yawGoal += degrees;
  }

  zoom(wheel: number): void {
    this.sizeGoal = clamp(this.sizeGoal * Math.exp(wheel * 0.05), 3, 24);
  }

  pan(dx: number, dy: number): void {
    const perPixel = (2 * this.size) / Math.max(1, this.viewH);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.targetGoal.addScaledVector(right, -dx * perPixel).addScaledVector(up, dy * perPixel);
    this.targetGoal.y = clamp(this.targetGoal.y, -2, 12);
    this.target.copy(this.targetGoal);
  }

  /** The direction the camera looks along (unit). */
  get forward(): THREE.Vector3 {
    const y = this.yaw * DEG;
    const p = this.pitch * DEG;
    return new THREE.Vector3(Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p));
  }

  /** Moves the camera towards where it is being asked to be. `time` is wall-clock seconds (for the tremor). */
  update(dt: number, time: number): void {
    const k = 1 - Math.exp(-12 * dt);
    this.yaw = lerp(this.yaw, this.yawGoal, k);
    this.pitch = lerp(this.pitch, this.pitchGoal, k);
    this.size = lerp(this.size, this.sizeGoal, k);
    this.target.lerp(this.targetGoal, k);
    const f = this.forward;
    const cam = this.camera;
    cam.position.copy(this.target).addScaledVector(f, -DISTANCE);
    cam.lookAt(this.target);
    cam.updateMatrixWorld(true);
    if (this.shakeAmount > 0.001) {
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      cam.position.addScaledVector(right, Math.sin(time * 63) * this.shakeAmount).addScaledVector(up, Math.sin(time * 51) * this.shakeAmount);
      cam.updateMatrixWorld(true);
      this.shakeAmount = lerp(this.shakeAmount, 0, 1 - Math.exp(-7 * dt));
    }
    // a tall (phone) screen is limited by its width: the same scene needs a taller view to fit across
    const shown = this.size * Math.max(1, 1.15 / this.aspect);
    cam.left = -shown * this.aspect;
    cam.right = shown * this.aspect;
    cam.top = shown;
    cam.bottom = -shown;
    cam.updateProjectionMatrix();
  }

  /** The size of the view being drawn right now (world units, half height). */
  get shown(): number {
    return this.size * Math.max(1, 1.15 / this.aspect);
  }
}
