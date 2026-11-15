// The rules of building and of winning, with no scene objects: where a piece may go, and what a finished run means.
import { Box, clamp, v3, type Vec3 } from './math';
import { flatTop, partsOf, withArticle, type Kind } from './kinds';
import { turn, turnSize } from './orient';
import { obstaclePos, type Level, type Objective } from './levels';

export interface PieceState {
  kind: Kind;
  rot: number; // the orientation (see orient.ts): quarter turns on the board, and tips onto a side
  pos: Vec3; // the centre of the piece's bounding box
}

export interface Piece extends PieceState {
  id: number;
}

export interface Outcome {
  won: boolean;
  lines: string[];
  top: number;
  reached: boolean;
  stands: boolean;
}

export type PlanResult = { ok: true; pos: Vec3 } | { ok: false; pos: Vec3; why: string };

/** Pieces are placed on a quarter-unit grid: fine enough for balancing puzzles to have more than one answer. */
const GRID = 0.25;
/** How far under the goal height a top may rest (the physics settles within a hair of where a piece was put). */
export const REACH = 0.02;
const EPS = 1e-3;

export { turn };

/** The size of the box around a piece in the given orientation (centred on the piece's origin). */
export function extents(k: Kind, rot: number): Vec3 {
  let b: Box | null = null;
  for (const p of partsOf(k)) {
    const pb = Box.fromCenter(turn(p.center, rot), turnSize(p.size, rot));
    b = b ? b.encapsulate(pb) : pb;
  }
  return b!.size;
}

/** The boxes of a piece in the world, turned and moved to where it stands. */
export function worldParts(k: Kind, rot: number, pos: Vec3): Box[] {
  return partsOf(k).map((p) => {
    const c = turn(p.center, rot);
    return Box.fromCenter(v3(pos.x + c.x, pos.y + c.y, pos.z + c.z), turnSize(p.size, rot));
  });
}

export function pieceBounds(p: PieceState): Box {
  return Box.fromCenter(p.pos, extents(p.kind, p.rot));
}

function snap(v: number, size: number): number {
  const half = size / 2;
  return Math.round((v - half) / GRID) * GRID + half; // the piece's edges, not its centre, lie on the grid
}

function overlapsInPlan(a: Box, b: Box): boolean {
  return a.min.x < b.max.x - EPS && a.max.x > b.min.x + EPS && a.min.z < b.max.z - EPS && a.max.z > b.min.z + EPS;
}

function overlaps(a: Box, b: Box): boolean {
  return overlapsInPlan(a, b) && a.min.y < b.max.y - 0.02 && a.max.y > b.min.y + 0.02;
}

export class Board {
  readonly pieces: Piece[] = [];
  private nextId = 1;

  constructor(readonly level: Level) {}

  add(s: PieceState): Piece {
    const p: Piece = { id: this.nextId++, kind: s.kind, rot: s.rot, pos: { ...s.pos } };
    this.pieces.push(p);
    return p;
  }

  remove(p: Piece): void {
    const i = this.pieces.indexOf(p);
    if (i >= 0) this.pieces.splice(i, 1);
  }

  count(k: Kind): number {
    return this.pieces.filter((p) => p.kind === k).length;
  }

  remaining(k: Kind): number {
    return this.level.stockOf(k) - this.count(k);
  }

  /** Does a piece of this shape, occupying these bounds, count towards the goal? The named shape, standing over the zone. */
  qualifies(kind: Kind, b: Box): boolean {
    const g = this.level.goal;
    if (!g) return true;
    if (g.with && g.with !== kind) return false;
    // the piece counts when its middle is inside the zone (a piece on the edge, half outside, does not)
    const margin = 0.1;
    const c = b.center;
    return Math.abs(c.x - g.cx) <= g.w / 2 - margin && Math.abs(c.z - g.cz) <= g.d / 2 - margin;
  }

  /** Top of the highest piece that counts towards the goal. */
  heightOf(): number {
    let h = 0;
    for (const p of this.pieces) {
      const b = pieceBounds(p);
      if (this.qualifies(p.kind, b)) h = Math.max(h, b.max.y);
    }
    return h;
  }

  /**
   * Where a piece aimed at (hintX, hintZ) would stand: snapped to the grid, kept inside the zone, lowered until one of its
   * boxes rests on the highest surface under it. Not ok (with a reason) when nothing holds it up or it would sit inside another piece.
   * `level` is the height of the surface the pointer is on: only surfaces at or below it can hold the piece, which is
   * how a piece goes under an overhang (the pointer reaches the floor there) instead of on top of it.
   */
  plan(kind: Kind, rot: number, hintX: number, hintZ: number, level = Infinity): PlanResult {
    const e = extents(kind, rot);
    const zone = this.level.zone;
    const zs = zone.size;
    let x = snap(hintX, e.x);
    let z = snap(hintZ, e.z);
    if (zs.x >= e.x) x = clamp(x, zone.min.x + e.x / 2, zone.max.x - e.x / 2);
    if (zs.z >= e.z) z = clamp(z, zone.min.z + e.z / 2, zone.max.z - e.z / 2);

    // the surfaces something can stand on: platforms, and the flat tops of the pieces already placed
    const supports: Box[] = [];
    for (const p of this.level.platforms) supports.push(p.bounds);
    for (const o of this.level.obstacles) if (flatTop(o.kind)) supports.push(...worldParts(o.kind, o.rot, obstaclePos(o)));
    for (const q of this.pieces) if (flatTop(q.kind)) supports.push(...worldParts(q.kind, q.rot, q.pos));

    let y = -Infinity;
    for (const part of worldParts(kind, rot, v3(x, 0, z))) {
      const bottom = part.min.y; // relative to the piece's origin at height 0
      for (const s of supports) if (s.max.y <= level + 0.05 && overlapsInPlan(part, s)) y = Math.max(y, s.max.y - bottom);
    }

    if (y === -Infinity) return { ok: false, pos: v3(x, e.y / 2, z), why: 'Rien ne soutient la pièce' };

    const pos = v3(x, y, z);
    for (const part of worldParts(kind, rot, pos)) {
      for (const q of this.pieces) for (const other of worldParts(q.kind, q.rot, q.pos)) if (overlaps(part, other)) return { ok: false, pos, why: 'Emplacement occupé' };
      for (const o of this.level.obstacles)
        for (const other of worldParts(o.kind, o.rot, obstaclePos(o))) if (overlaps(part, other)) return { ok: false, pos, why: 'Emplacement occupé' };
    }
    if (pos.y + e.y / 2 > 14) return { ok: false, pos, why: 'Trop haut' };
    return { ok: true, pos };
  }

  /**
   * The plan for a piece that is turned where it stands: the same spot when it fits, else the nearest spot that does
   * (turning a long piece next to a wall of the zone or of another piece must not simply be refused).
   * `floor` is the height of the surface it stands on now.
   */
  planNear(kind: Kind, rot: number, x: number, z: number, floor: number): PlanResult {
    let best: PlanResult | null = null;
    const tries: Array<[number, number]> = [[0, 0]];
    for (let r = 1; r <= 8; r++) {
      const d = r * GRID;
      for (let i = -r; i <= r; i++) {
        tries.push([i * GRID, -d], [i * GRID, d]);
        if (Math.abs(i) !== r) tries.push([-d, i * GRID], [d, i * GRID]);
      }
    }
    for (const [dx, dz] of tries) {
      const r = this.plan(kind, rot, x + dx, z + dz, floor + 0.05);
      if (r.ok) return r;
      best ??= r;
    }
    for (const [dx, dz] of tries) {
      const r = this.plan(kind, rot, x + dx, z + dz);
      if (r.ok) return r;
    }
    return best!;
  }
  /**
   * The plan for a pointer on a surface at `level`; when nothing fits there (a plate over a gap: the pointer is on the floor of the gap,
   * but the plate would sit inside the stairs), the piece rests on the highest surface under it instead.
   */
  planAt(kind: Kind, rot: number, hintX: number, hintZ: number, level: number): PlanResult {
    const first = this.plan(kind, rot, hintX, hintZ, level);
    if (first.ok) return first;
    if (Number.isFinite(level)) {
      const high = this.plan(kind, rot, hintX, hintZ);
      if (high.ok) return high;
    }
    return first;
  }

  snapshot(): PieceState[] {
    return this.pieces.map((p) => ({ kind: p.kind, rot: p.rot, pos: { ...p.pos } }));
  }

  // ------------------------------------------------------------------ winning

  /** @param live Where each piece ended up (the physics moves them), in the same order as `pieces`. */
  evaluate(live: Box[], settled: boolean, fell: boolean): Outcome {
    const lines: string[] = [];
    let won = true;
    let top = 0;
    let reached = true;
    const goal = this.level.goal;
    if (goal) {
      for (let i = 0; i < live.length && i < this.pieces.length; i++) if (this.qualifies(this.pieces[i].kind, live[i])) top = Math.max(top, live[i].max.y);
      reached = top >= goal.height - REACH;
      const who = goal.with ? ' par ' + withArticle(goal.with) : '';
      lines.push(`${reached ? '[OK]' : '[X]'}  Zone atteinte${who} : ${top.toFixed(1)} sur ${goal.height}`);
      won = won && reached;
    }
    // whatever the goal, the construction has to stand: nothing may still be moving, nothing may have fallen off
    const stands = settled && !fell;
    lines.push(`${stands ? '[OK]' : '[X]'}  ${fell ? 'Une pièce est tombée' : settled ? 'La construction tient' : 'Ça bouge encore'}`);
    won = won && stands;
    return { won, lines, top, reached, stands };
  }
}

export function describeObjective(o: Objective): string {
  const w = o.with ? ` avec ${withArticle(o.with)} au sommet` : '';
  return `Atteindre la zone à ${o.height} unités de haut${w}`;
}
