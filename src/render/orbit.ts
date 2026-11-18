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
  private viewW = 800;
  /** The box the level occupies (the board and the height it holds): what has to stay visible inside the inset. */
  private bounds: THREE.Box3 | null = null;
  /**
   * The part of the screen the scene may use, in pixels cut off each side. While something covers part of the screen (the tutorial's card)
   * the scene is shrunk if it has to be, and slid, to sit entirely in what is left. Null: the whole screen.
   */
  inset: { top: number; bottom: number; left: number; right: number } | null = null;
  /** What has to fit inside the inset when it is narrower than the whole level (the tutorial cares about the build area, not the board's far corners). Null: the whole level. */
  focus: THREE.Box3 | null = null;
  private fitZoom = 1; // the scene's scale inside the inset (1 = as framed)
  private fitX = 0; // the slide, in pixels (positive: the scene goes right / down)
  private fitY = 0;

  setViewport(width: number, height: number): void {
    this.aspect = width / Math.max(1, height);
    this.viewH = height;
    this.viewW = width;
  }

  /** Frame a scene of the given width (world units) and centre. `top` is the height the scene has to hold. */
  frame(centre: THREE.Vector3, width: number, top: number): void {
    // the view has to hold the board's diamond and the tallest tower on it: about 0.82 screen units per world unit of height
    const half = width / 2;
    this.bounds = new THREE.Box3(new THREE.Vector3(centre.x - half, 0, centre.z - half), new THREE.Vector3(centre.x + half, top + 0.5, centre.z + half));
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
    this.fit(dt, shown);
  }

  /**
   * Fits the scene into the inset: measures where the level's box falls on the screen as framed, then slides (and shrinks, only if it does
   * not fit) the view so the box lands inside what the inset leaves. Eased, so a card appearing or changing size never makes the scene jump.
   */
  private fit(dt: number, shown: number): void {
    const cam = this.camera;
    const W = this.viewW;
    const H = this.viewH;
    let goalZoom = 1;
    let goalX = 0;
    let goalY = 0;
    const inset = this.inset;
    const b = this.focus ?? this.bounds;
    if (inset && b && W > 0 && H > 0) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const v = new THREE.Vector3();
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        v.set(x, y, z).project(cam);
        const sx = (v.x * 0.5 + 0.5) * W;
        const sy = (-v.y * 0.5 + 0.5) * H;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
        y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      const m = 8; // a little air between the scene and whatever covers the rest
      const fx0 = inset.left + m, fx1 = W - inset.right - m, fy0 = inset.top + m, fy1 = H - inset.bottom - m;
      const fw = Math.max(40, fx1 - fx0), fh = Math.max(40, fy1 - fy0);
      goalZoom = clamp(Math.min(1, fw / Math.max(1, x1 - x0), fh / Math.max(1, y1 - y0)), 0.4, 1);
      // zooming is about the screen centre: where the box centre lands after it, then how far to slide it to the middle of the free part
      const cx = W / 2 + goalZoom * ((x0 + x1) / 2 - W / 2);
      const cy = H / 2 + goalZoom * ((y0 + y1) / 2 - H / 2);
      goalX = (fx0 + fx1) / 2 - cx;
      goalY = (fy0 + fy1) / 2 - cy;
    }
    const k = 1 - Math.exp(-9 * dt);
    this.fitZoom = lerp(this.fitZoom, goalZoom, k);
    this.fitX = lerp(this.fitX, goalX, k);
    this.fitY = lerp(this.fitY, goalY, k);
    if (Math.abs(this.fitZoom - 1) < 1e-4 && Math.abs(this.fitX) < 0.05 && Math.abs(this.fitY) < 0.05 && !inset) {
      this.fitZoom = 1; this.fitX = 0; this.fitY = 0;
      return;
    }
    const s = shown / this.fitZoom;
    const perPx = (2 * s) / H; // world units per screen pixel
    cam.left = -s * this.aspect - this.fitX * perPx;
    cam.right = s * this.aspect - this.fitX * perPx;
    cam.top = s + this.fitY * perPx;
    cam.bottom = -s + this.fitY * perPx;
    cam.updateProjectionMatrix();
  }

  /** The size of the view being drawn right now (world units, half height). */
  get shown(): number {
    return this.size * Math.max(1, 1.15 / this.aspect);
  }
}
