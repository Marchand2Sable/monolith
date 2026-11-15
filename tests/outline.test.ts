import { describe, expect, it } from 'vitest';
import { unionEdges } from '../src/render/outline';
import { partsOf } from '../src/core/kinds';
import { buildLevels, obstaclePos } from '../src/core/levels';
import { Box, v3 } from '../src/core/math';
import { sizeOf } from '../src/core/kinds';

const segments = (kind: Parameters<typeof partsOf>[0]): number => unionEdges(partsOf(kind)).length / 6;

describe('the outline of a shape (the goal picture)', () => {
  it('a cube has its twelve edges', () => {
    expect(segments('cube')).toBe(12);
  });
  it('the seams where the boxes of a shape meet are not drawn', () => {
    // an L, a T and an arch are each a flat outline of 6, 8 and 8 sides, seen on both faces, plus one edge per corner
    expect(segments('ell')).toBe(6 * 2 + 6);
    expect(segments('tee')).toBe(8 * 2 + 8);
    expect(segments('arch')).toBe(8 * 2 + 8);
  });
  it('every segment lies on the outside of the shape', () => {
    for (const kind of ['ell', 'tee', 'arch'] as const) {
      const pts = unionEdges(partsOf(kind));
      const size = sizeOf(kind);
      for (let i = 0; i < pts.length; i += 3) {
        expect(Math.abs(pts[i])).toBeLessThanOrEqual(size.x / 2 + 1e-6);
        expect(Math.abs(pts[i + 1])).toBeLessThanOrEqual(size.y / 2 + 1e-6);
        expect(Math.abs(pts[i + 2])).toBeLessThanOrEqual(size.z / 2 + 1e-6);
      }
    }
  });
});

describe('the pieces fixed on the board', () => {
  it('never pass through one another, nor through what the goal pictures', () => {
    for (const level of buildLevels()) {
      const boxes = level.obstacles.map((o) => {
        const p = obstaclePos(o);
        const e = (o.rot & 1) === 1 ? v3(sizeOf(o.kind).z, sizeOf(o.kind).y, sizeOf(o.kind).x) : sizeOf(o.kind);
        return { o, box: Box.fromCenter(p, e) };
      });
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].box, b = boxes[j].box;
          const overlap =
            Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > 1e-6 &&
            Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) > 1e-6 &&
            Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) > 1e-6;
          expect(overlap, `${level.title}: ${boxes[i].o.kind} and ${boxes[j].o.kind} overlap`).toBe(false);
        }
    }
  });
});
