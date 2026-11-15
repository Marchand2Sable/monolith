// The physics of a run: every piece (the player's and the level's fixed ones) becomes a rigid body, and gravity judges.
// It runs on Rapier (3D, WebAssembly) and has no knowledge of the screen, so the game and the tests simulate the very same way.
import RAPIER from '@dimforge/rapier3d-compat';
import { Box, v3, type Vec3 } from '../core/math';
import { partsOf, volumeOf, type Kind } from '../core/kinds';
import { extents, worldParts, type PieceState } from '../core/board';
import { obstaclePos, type Level } from '../core/levels';
import { quatOf } from '../core/orient';

let ready: Promise<void> | null = null;

/** Loads the physics engine (once). Must be awaited before the first `Sim`. */
export function initPhysics(): Promise<void> {
  if (!ready) ready = RAPIER.init();
  return ready;
}

export const STEP = 1 / 100;
export const MAX_RUN = 15; // seconds: a run that never settles is stopped
const FRICTION = 0.75;
const PLATFORM_FRICTION = 0.6;

export interface Body {
  kind: Kind;
  rot: number;
  fixed: boolean; // a piece of the level rather than the player's
  body: RAPIER.RigidBody;
  frozen: boolean; // a fixed piece that went over the edge is out of the game
}

export interface SimOptions {
  /** Called when two things hit hard enough to be heard: strength 0..1. */
  onImpact?: (strength: number) => void;
}

export class Sim {
  readonly world: RAPIER.World;
  readonly pieces: Body[] = []; // the player's, in the order given
  readonly fixed: Body[] = []; // the level's, in the order of level.obstacles
  time = 0;
  still = 0;
  fell = false;
  private lastVel = new Map<number, Vec3>();
  private lastImpact = -1;

  constructor(
    readonly level: Level,
    placed: PieceState[],
    private opts: SimOptions = {},
  ) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const ip = this.world.integrationParameters;
    ip.dt = STEP;
    ip.numSolverIterations = 40; // tall stacks need many iterations to stay put
    ip.numAdditionalFrictionIterations = 8;
    ip.numInternalPgsIterations = 2;

    for (const p of level.platforms) {
      const s = p.bounds.size;
      const c = p.bounds.center;
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(c.x, c.y, c.z));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(s.x / 2, s.y / 2, s.z / 2).setFriction(PLATFORM_FRICTION).setRestitution(0), body);
    }
    for (const o of level.obstacles) this.fixed.push(this.makeBody(o.kind, o.rot, obstaclePos(o), true));
    for (const s of placed) this.pieces.push(this.makeBody(s.kind, s.rot, s.pos, false));
  }

  private makeBody(kind: Kind, rot: number, pos: Vec3, fixed: boolean): Body {
    const q = quatOf(rot);
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation(q)
      .setCanSleep(false)
      .setLinearDamping(0.02)
      .setAngularDamping(0.05);
    const body = this.world.createRigidBody(desc);
    if (kind === 'prism') {
      // a roof: a triangle 2 wide and 1 high, 1 deep
      const pts = new Float32Array([-1, -0.5, 0.5, 1, -0.5, 0.5, 0, 0.5, 0.5, -1, -0.5, -0.5, 1, -0.5, -0.5, 0, 0.5, -0.5]);
      const hull = RAPIER.ColliderDesc.convexHull(pts);
      if (!hull) throw new Error('prism hull');
      this.world.createCollider(hull.setFriction(FRICTION).setRestitution(0).setMass(volumeOf('prism')), body);
    } else {
      for (const p of partsOf(kind)) {
        const mass = p.size.x * p.size.y * p.size.z; // uniform density: each box weighs its volume
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(p.size.x / 2, p.size.y / 2, p.size.z / 2)
            .setTranslation(p.center.x, p.center.y, p.center.z)
            .setFriction(FRICTION)
            .setRestitution(0)
            .setMass(mass),
          body,
        );
      }
    }
    return { kind, rot, fixed, body, frozen: false };
  }

  /** One physics step of 1/100 s. */
  step(): void {
    this.world.step();
    this.time += STEP;
    let moving = false;
    for (const b of this.pieces) {
      const p = b.body.translation();
      if (p.y < -2.5) this.fell = true;
      if (this.isMoving(b)) moving = true;
      this.listenForImpact(b);
    }
    for (const b of this.fixed) {
      if (b.frozen) continue;
      // a fixed piece that went over the edge is out of the game: it must not keep the run going for ever
      if (b.body.translation().y < -6) {
        b.frozen = true;
        b.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
        continue;
      }
      if (this.isMoving(b)) moving = true;
      this.listenForImpact(b);
    }
    this.still = moving ? 0 : this.still + STEP;
  }

  private isMoving(b: Body): boolean {
    const v = b.body.linvel();
    const w = b.body.angvel();
    return v.x * v.x + v.y * v.y + v.z * v.z > 0.0025 || w.x * w.x + w.y * w.y + w.z * w.z > 0.01;
  }

  private listenForImpact(b: Body): void {
    if (!this.opts.onImpact) return;
    const v = b.body.linvel();
    const id = b.body.handle;
    const prev = this.lastVel.get(id);
    this.lastVel.set(id, { x: v.x, y: v.y, z: v.z });
    if (!prev) return;
    // what gravity alone would have changed is not an impact
    const dx = v.x - prev.x;
    const dy = v.y - prev.y + 9.81 * STEP;
    const dz = v.z - prev.z;
    const dv = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dv > 0.9 && this.time - this.lastImpact > 0.07) {
      this.lastImpact = this.time;
      this.opts.onImpact(Math.min(1, dv / 6));
    }
  }

  /** True when the run has a verdict (the level's own end conditions, as the Unity game had them). */
  get finished(): boolean {
    if (this.level.sandbox) return false; // free building has no verdict
    return this.still >= this.level.stillSeconds || this.time > MAX_RUN || (this.fell && this.time > 1.5);
  }

  get settled(): boolean {
    return this.still >= this.level.stillSeconds;
  }

  /** Where a body really is: the box around everything it is made of. */
  liveBounds(b: Body): Box {
    return liveBox(b.kind, b.body.translation(), b.body.rotation());
  }

  pieceBounds(): Box[] {
    return this.pieces.map((b) => this.liveBounds(b));
  }

  dispose(): void {
    this.world.free();
  }
}

/** The world-space box around a piece placed at `t` with rotation `q`. */
export function liveBox(kind: Kind, t: Vec3, q: { x: number; y: number; z: number; w: number }): Box {
  let box: Box | null = null;
  const xx = q.x * q.x, yy = q.y * q.y, zz = q.z * q.z;
  const xy = q.x * q.y, xz = q.x * q.z, yz = q.y * q.z;
  const wx = q.w * q.x, wy = q.w * q.y, wz = q.w * q.z;
  const rotate = (p: Vec3): Vec3 =>
    v3(
      (1 - 2 * (yy + zz)) * p.x + 2 * (xy - wz) * p.y + 2 * (xz + wy) * p.z,
      2 * (xy + wz) * p.x + (1 - 2 * (xx + zz)) * p.y + 2 * (yz - wx) * p.z,
      2 * (xz - wy) * p.x + 2 * (yz + wx) * p.y + (1 - 2 * (xx + yy)) * p.z,
    );
  for (const part of partsOf(kind)) {
    for (let i = 0; i < 8; i++) {
      const corner = v3(
        part.center.x + ((i & 1) !== 0 ? 1 : -1) * part.size.x / 2,
        part.center.y + ((i & 2) !== 0 ? 1 : -1) * part.size.y / 2,
        part.center.z + ((i & 4) !== 0 ? 1 : -1) * part.size.z / 2,
      );
      const r = rotate(corner);
      const w = v3(t.x + r.x, t.y + r.y, t.z + r.z);
      const pb = new Box(w, { ...w });
      box = box ? box.encapsulate(pb) : pb;
    }
  }
  return box!;
}

export { extents, worldParts };

/** Plays a whole run to its verdict without a screen: what the tests (and a hint checker) use. */
export function runToEnd(level: Level, placed: PieceState[]): { sim: Sim; live: Box[]; settled: boolean; fell: boolean } {
  const sim = new Sim(level, placed);
  while (!sim.finished && sim.time < MAX_RUN + 1) sim.step();
  const live = sim.pieceBounds();
  const out = { sim, live, settled: sim.settled, fell: sim.fell };
  return out;
}
