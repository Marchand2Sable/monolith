// Orientations: every piece can be turned on the board (yaw) and tipped onto its side (lay). The planning, the scene and the physics must agree.
import { describe, expect, it } from 'vitest';
import { Board, extents, worldParts } from '../src/core/board';
import { ALL_KINDS, partsOf, shapeBoxes, sizeOf, volumeOf } from '../src/core/kinds';
import { buildLevels } from '../src/core/levels';
import { Box, v3 } from '../src/core/math';
import { ORIENTATIONS, POSES, distinctOrientations, layOf, orient, quatOf, spin, stepOrientation, turn, yawOf } from '../src/core/orient';
import { Sim, initPhysics, liveBox } from '../src/physics/sim';

const levels = buildLevels();
const sandbox = levels.find((l) => l.sandbox)!;

const rotate = (q: { x: number; y: number; z: number; w: number }, p: { x: number; y: number; z: number }) => {
  const xx = q.x * q.x, yy = q.y * q.y, zz = q.z * q.z;
  const xy = q.x * q.y, xz = q.x * q.z, yz = q.y * q.z;
  const wx = q.w * q.x, wy = q.w * q.y, wz = q.w * q.z;
  return v3(
    (1 - 2 * (yy + zz)) * p.x + 2 * (xy - wz) * p.y + 2 * (xz + wy) * p.z,
    2 * (xy + wz) * p.x + (1 - 2 * (xx + zz)) * p.y + 2 * (yz - wx) * p.z,
    2 * (xz - wy) * p.x + 2 * (yz + wx) * p.y + (1 - 2 * (xx + yy)) * p.z,
  );
};

describe('orientations', () => {
  it('spin: a full cycle comes back, on each axis, both ways', () => {
    for (let r = 0; r < ORIENTATIONS; r++) {
      for (const axis of ['yaw', 'lay'] as const) {
        let x = r;
        for (let i = 0; i < (axis === 'yaw' ? 4 : POSES); i++) x = spin(x, axis);
        expect(x).toBe(r);
        expect(spin(spin(r, axis), axis, true)).toBe(r);
      }
      expect(orient(yawOf(r), layOf(r))).toBe(r);
    }
  });
  it('the old quarter turns (0..3) are unchanged', () => {
    expect(extents('beam', 1)).toEqual(v3(1, 1, 3));
    expect(extents('stairs', 2)).toEqual(sizeOf('stairs'));
  });
  it('laying a standing pillar puts it on its side; laying twice stands it up again upside down', () => {
    expect(extents('pillar', 0)).toEqual(v3(1, 2, 1));
    const lying = extents('pillar', orient(0, 1));
    expect(lying.x).toBeCloseTo(1);
    expect(lying.y).toBeCloseTo(1);
    expect(lying.z).toBeCloseTo(2);
    const lyingAlongX = extents('pillar', orient(1, 1));
    expect(lyingAlongX.x).toBeCloseTo(2);
    expect(lyingAlongX.y).toBeCloseTo(1);
  });
  it('the quaternion turns a vector exactly as `turn` does, for all 16 orientations', () => {
    for (let r = 0; r < ORIENTATIONS; r++) {
      for (const v of [v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1), v3(1, 2, -3)]) {
        const a = turn(v, r);
        const b = rotate(quatOf(r), v);
        expect(b.x).toBeCloseTo(a.x, 6);
        expect(b.y).toBeCloseTo(a.y, 6);
        expect(b.z).toBeCloseTo(a.z, 6);
      }
    }
  });
  it('every piece keeps its volume and a centred bounding box in every orientation', () => {
    for (const k of ALL_KINDS) {
      for (let r = 0; r < ORIENTATIONS; r++) {
        const parts = worldParts(k, r, v3(0, 0, 0));
        const vol = parts.reduce((s, b) => s + b.size.x * b.size.y * b.size.z, 0);
        expect(vol).toBeCloseTo(partsOf(k).reduce((s, p) => s + p.size.x * p.size.y * p.size.z, 0));
        const all = parts.reduce((b, p) => b.encapsulate(p), parts[0].clone());
        expect(all.center.x).toBeCloseTo(0);
        expect(all.center.y).toBeCloseTo(0);
        expect(all.center.z).toBeCloseTo(0);
        const e = extents(k, r);
        expect(all.size.x).toBeCloseTo(e.x);
        expect(all.size.y).toBeCloseTo(e.y);
        expect(all.size.z).toBeCloseTo(e.z);
      }
    }
  });
  it('the number of different shapes of each piece', () => {
    const n = (k: (typeof ALL_KINDS)[number]) => distinctOrientations(shapeBoxes(k)).length;
    expect(n('cube')).toBe(1);
    expect(n('pillar')).toBe(3);
    expect(n('beam')).toBe(3);
    expect(n('plate')).toBe(6); // three different lengths: six ways round
    expect(n('arch')).toBeGreaterThan(4);
    expect(n('stairs')).toBeGreaterThan(8);
  });
  it('there are exactly 24 different orientations of an asymmetric piece, all reachable from 0 with Space and T', () => {
    const stairs = shapeBoxes('stairs');
    expect(distinctOrientations(stairs).length).toBe(24);
    const seen = new Set<number>([0]);
    const queue = [0];
    while (queue.length) {
      const r = queue.pop()!;
      for (const axis of ['yaw', 'lay'] as const) {
        const n = stepOrientation(stairs, r, axis);
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBe(24);
  });
  it('a beam can be stood on end with the keys (it was never possible before)', () => {
    const beam = shapeBoxes('beam');
    const heights = new Set<number>();
    const seen = new Set<number>([0]);
    const queue = [0];
    while (queue.length) {
      const r = queue.pop()!;
      heights.add(extents('beam', r).y);
      for (const axis of ['yaw', 'lay'] as const) {
        const n = stepOrientation(beam, r, axis);
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect([...heights].sort()).toEqual([1, 3]);
  });
});

describe('orientations and the physics', () => {
  it('the planned boxes are where the physics puts the body (every piece, every orientation)', async () => {
    await initPhysics();
    for (const k of ALL_KINDS) {
      if (k === 'prism') continue; // a roof: its collider is the triangle, not the envelope (checked below)
      for (let r = 0; r < ORIENTATIONS; r++) {
        const plan = new Board(sandbox).plan(k, r, 0, 0);
        expect(plan.ok, `${k} r${r} can be placed on the platform: ${plan.ok ? '' : (plan as { why: string }).why}`).toBe(true);
        const sim = new Sim(sandbox, [{ kind: k, rot: r, pos: plan.pos }]);
        const planned = worldParts(k, r, plan.pos).reduce((b, p) => b.encapsulate(p), worldParts(k, r, plan.pos)[0].clone());
        const live = sim.pieceBounds()[0];
        for (const axis of ['x', 'y', 'z'] as const) {
          expect(live.min[axis]).toBeCloseTo(planned.min[axis], 3);
          expect(live.max[axis]).toBeCloseTo(planned.max[axis], 3);
        }
        sim.dispose();
      }
    }
  });
  it('a piece put down flat in any orientation stays where it was put (flat-bottomed ones)', async () => {
    await initPhysics();
    for (const k of ALL_KINDS) {
      if (k === 'prism') continue;
      for (let r = 0; r < ORIENTATIONS; r++) {
        const b = new Board(sandbox);
        const plan = b.plan(k, r, 0, 0);
        if (!plan.ok) continue;
        // a piece whose lowest boxes do not cover its centre of mass would tip: only test the ones that stand
        const parts = worldParts(k, r, plan.pos);
        const low = Math.min(...parts.map((p) => p.min.y));
        const feet = parts.filter((p) => Math.abs(p.min.y - low) < 1e-6);
        let mass = 0, cx = 0, cz = 0;
        for (const p of parts) {
          const m = p.size.x * p.size.y * p.size.z;
          mass += m;
          cx += m * p.center.x;
          cz += m * p.center.z;
        }
        cx /= mass;
        cz /= mass;
        const sx0 = Math.min(...feet.map((p) => p.min.x)), sx1 = Math.max(...feet.map((p) => p.max.x));
        const sz0 = Math.min(...feet.map((p) => p.min.z)), sz1 = Math.max(...feet.map((p) => p.max.z));
        const stands = cx > sx0 + 0.05 && cx < sx1 - 0.05 && cz > sz0 + 0.05 && cz < sz1 - 0.05;
        if (!stands) continue;
        const sim = new Sim(sandbox, [{ kind: k, rot: r, pos: plan.pos }]);
        for (let i = 0; i < 300; i++) sim.step();
        const end = sim.pieceBounds()[0];
        const start = worldParts(k, r, plan.pos).reduce((bb, p) => bb.encapsulate(p), worldParts(k, r, plan.pos)[0].clone());
        expect(Math.abs(end.center.x - start.center.x), `${k} r${r} x`).toBeLessThan(0.06);
        expect(Math.abs(end.center.y - start.center.y), `${k} r${r} y`).toBeLessThan(0.06);
        expect(Math.abs(end.center.z - start.center.z), `${k} r${r} z`).toBeLessThan(0.06);
        sim.dispose();
      }
    }
  });
  it('a laid prism: the roof collider and the envelope agree on the turned bounds', async () => {
    await initPhysics();
    for (let r = 0; r < ORIENTATIONS; r++) {
      const plan = new Board(sandbox).plan('prism', r, 0, 0);
      expect(plan.ok).toBe(true);
      const sim = new Sim(sandbox, [{ kind: 'prism', rot: r, pos: plan.pos }]);
      const planned = Box.fromCenter(plan.pos, extents('prism', r));
      const live = sim.pieceBounds()[0];
      expect(live.size.x).toBeCloseTo(planned.size.x, 3);
      expect(live.size.y).toBeCloseTo(planned.size.y, 3);
      expect(live.size.z).toBeCloseTo(planned.size.z, 3);
      sim.dispose();
    }
    expect(volumeOf('prism')).toBe(1);
    expect(liveBox('cube', v3(0, 0, 0), quatOf(5)).size.x).toBeCloseTo(1);
  });
});