// The outline of a shape made of several boxes: only the edges of the whole, none of the seams where the boxes meet.
// Pure geometry (no Three.js), so the tests can read it.
import type { Vec3 } from '../core/math';

interface Part {
  center: Vec3;
  size: Vec3;
}

const EPS = 1e-6;
const DELTA = 0.01;

/** Segments (x1,y1,z1,x2,y2,z2 ...) along the outer edges of the union of the boxes. */
export function unionEdges(parts: readonly Part[]): number[] {
  const boxes = parts.map((p) => ({
    min: [p.center.x - p.size.x / 2, p.center.y - p.size.y / 2, p.center.z - p.size.z / 2],
    max: [p.center.x + p.size.x / 2, p.center.y + p.size.y / 2, p.center.z + p.size.z / 2],
  }));
  const filled = (q: number[]): boolean => boxes.some((b) => q[0] > b.min[0] - EPS && q[0] < b.max[0] + EPS && q[1] > b.min[1] - EPS && q[1] < b.max[1] + EPS && q[2] > b.min[2] - EPS && q[2] < b.max[2] + EPS);
  const r = (v: number): number => Math.round(v * 1e4) / 1e4;

  // every piece of every box edge, cut where any box starts or ends along it
  const seen = new Set<string>();
  const kept = new Map<string, { axis: number; b: number; c: number; t0: number; t1: number }[]>();
  for (const box of boxes) {
    for (let a = 0; a < 3; a++) {
      const [ia, ib] = [0, 1, 2].filter((i) => i !== a);
      const cuts = new Set<number>();
      for (const o of boxes) {
        cuts.add(r(o.min[a]));
        cuts.add(r(o.max[a]));
      }
      const ts = [...cuts].filter((t) => t >= r(box.min[a]) - EPS && t <= r(box.max[a]) + EPS).sort((x, y) => x - y);
      for (const bv of [box.min[ia], box.max[ia]]) {
        for (const cv of [box.min[ib], box.max[ib]]) {
          for (let k = 0; k + 1 < ts.length; k++) {
            const t0 = ts[k], t1 = ts[k + 1];
            const key = `${a}|${r(bv)}|${r(cv)}|${t0}|${t1}`;
            if (seen.has(key)) continue;
            seen.add(key);
            // the four quarters of space around the piece: an edge of the whole has one or three of them filled (or two, diagonally)
            const o: boolean[] = [];
            for (const [sb, sc] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
              const q = [0, 0, 0];
              q[a] = (t0 + t1) / 2;
              q[ia] = bv + sb * DELTA;
              q[ib] = cv + sc * DELTA;
              o.push(filled(q));
            }
            const n = o.filter(Boolean).length;
            const diagonal = n === 2 && o[0] === o[3];
            if (n === 1 || n === 3 || diagonal) {
              const line = `${a}|${r(bv)}|${r(cv)}`;
              if (!kept.has(line)) kept.set(line, []);
              kept.get(line)!.push({ axis: a, b: bv, c: cv, t0, t1 });
            }
          }
        }
      }
    }
  }

  // one segment per run of touching pieces on a line, so a dashed line is not restarted at every cut
  const out: number[] = [];
  for (const pieces of kept.values()) {
    pieces.sort((x, y) => x.t0 - y.t0);
    let cur = { ...pieces[0] };
    const flush = (): void => {
      const p0 = [0, 0, 0], p1 = [0, 0, 0];
      const [ia, ib] = [0, 1, 2].filter((i) => i !== cur.axis);
      p0[cur.axis] = cur.t0;
      p1[cur.axis] = cur.t1;
      p0[ia] = p1[ia] = cur.b;
      p0[ib] = p1[ib] = cur.c;
      out.push(...p0, ...p1);
    };
    for (let i = 1; i < pieces.length; i++) {
      if (Math.abs(pieces[i].t0 - cur.t1) < 1e-4) cur.t1 = pieces[i].t1;
      else {
        flush();
        cur = { ...pieces[i] };
      }
    }
    flush();
  }
  return out;
}
