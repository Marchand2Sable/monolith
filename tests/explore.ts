// A random explorer: it builds thousands of random constructions on a level, plays each one through the real physics, and keeps
// the winners. It answers the design questions no hand-made list can: how many different ways does a level really have,
// does it need the new gestures (standing a piece up), is there a way with fewer pieces than the "économe" par?
import { Board, extents } from '../src/core/board';
import type { Level } from '../src/core/levels';
import { ALL_KINDS, shapeBoxes, type Kind } from '../src/core/kinds';
import { rng } from '../src/core/math';
import { distinctOrientations, layOf } from '../src/core/orient';
import { runToEnd } from '../src/physics/sim';

export interface Win {
  pieces: Array<{ kind: Kind; rot: number; x: number; y: number; z: number }>;
  count: number;
  /** Does the build use a piece that is tipped (not just turned on the board)? */
  tipped: boolean;
}

export interface Exploration {
  trials: number;
  placedAll: number;
  wins: Win[];
  /** Distinct winning builds, by what is where (rounded). */
  distinct: number;
  /** Distinct winning sets of pieces (shape only, positions and turns ignored). */
  families: string[];
  minPieces: number;
  tippedWins: number;
  /** Wins that use no piece tipped at all. */
  flatWins: number;
}

/**
 * Every build of at most `maxPieces` pieces around the goal's column (the pieces stacked, side by side, in every orientation), cut short by
 * what the stock can still reach: the short ways to win that a designer is likely to miss. Stops after `budget` simulations.
 */
export function shortWins(level: Level, maxPieces: number, budget = 4000, spread = 1, nodeBudget = 150000): Win[] {
  const goal = level.goal!;
  const kinds = ALL_KINDS.filter((k) => level.stockOf(k) > 0);
  const orients = new Map<Kind, number[]>(kinds.map((k) => [k, distinctOrientations(shapeBoxes(k))]));
  const maxExt = new Map<Kind, number>(kinds.map((k) => [k, Math.max(...orients.get(k)!.map((r) => extents(k, r).y))]));
  const wins: Win[] = [];
  const seen = new Set<string>();
  let sims = 0;
  let nodes = 0;
  const offs: number[] = [];
  for (let d = -spread; d <= spread + 1e-9; d += 0.5) offs.push(Math.round(d * 100) / 100);
  const topOf = (board: Board): number => {
    let top = 0;
    for (const o of level.obstacles) top = Math.max(top, extents(o.kind, o.rot).y + o.bottom);
    for (const p of board.pieces) top = Math.max(top, p.pos.y + extents(p.kind, p.rot).y / 2);
    return top;
  };
  const dfs = (board: Board, left: number): void => {
    if (sims >= budget || nodes >= nodeBudget) return;
    // can what is left reach the goal at all?
    const order = kinds.filter((k) => board.remaining(k) > 0);
    if (!order.length || left === 0) return;
    const reach = topOf(board) + Math.max(...order.map((k) => maxExt.get(k)!)) * left;
    if (reach < goal.height - 0.02) return;
    for (const kind of order) {
      for (const rot of orients.get(kind)!) {
        for (const dx of offs) {
          for (const dz of offs) {
            nodes++;
            const plan = board.plan(kind, rot, goal.cx + dx, goal.cz + dz);
            if (!plan.ok) continue;
            const p = board.add({ kind, rot, pos: plan.pos });
            if (board.heightOf() >= goal.height - 0.02) {
              const sig = board.pieces
                .map((q) => `${q.kind}${q.rot}@${q.pos.x.toFixed(2)},${q.pos.y.toFixed(2)},${q.pos.z.toFixed(2)}`)
                .sort()
                .join(';');
              if (!seen.has(sig)) {
                seen.add(sig);
                sims++;
                const run = runToEnd(level, board.snapshot());
                const outcome = board.evaluate(run.live, run.settled, run.fell);
                run.sim.dispose();
                if (outcome.won) {
                  const pieces = board.pieces.map((q) => ({ kind: q.kind, rot: q.rot, x: q.pos.x, y: q.pos.y, z: q.pos.z }));
                  wins.push({ pieces, count: pieces.length, tipped: pieces.some((q) => layOf(q.rot) !== 0 && extents(q.kind, q.rot).y !== extents(q.kind, 0).y) });
                }
              }
            } else dfs(board, left - 1);
            board.remove(p);
            if (sims >= budget || nodes >= nodeBudget) return;
          }
        }
      }
    }
  };
  dfs(new Board(level), maxPieces);
  return wins;
}

export function explore(level: Level, trials: number, seed = 1, maxPieces = 8): Exploration {
  const rand = rng(seed);
  const wins: Win[] = [];
  const seen = new Set<string>();
  const kinds = ALL_KINDS.filter((k) => level.stockOf(k) > 0);
  const orients = new Map<Kind, number[]>(kinds.map((k) => [k, distinctOrientations(shapeBoxes(k))]));
  const goal = level.goal!;
  let placedAll = 0;
  const zone = level.zone;
  for (let t = 0; t < trials; t++) {
    const board = new Board(level);
    const n = 1 + Math.floor(rand() * Math.min(maxPieces, kinds.reduce((s, k) => s + level.stockOf(k), 0)));
    let ok = true;
    for (let i = 0; i < n; i++) {
      const avail = kinds.filter((k) => board.remaining(k) > 0);
      if (!avail.length) break;
      // a goal that names a shape: that shape is likely to be wanted
      const kind = goal.with && board.count(goal.with) === 0 && rand() < 0.5 && avail.includes(goal.with) ? goal.with : avail[Math.floor(rand() * avail.length)];
      const os = orients.get(kind)!;
      const rot = os[Math.floor(rand() * os.length)];
      // mostly near the goal's column, sometimes anywhere on the board, sometimes right beside a piece already there
      let x: number, z: number;
      const r = rand();
      if (r < 0.55) {
        x = goal.cx + (rand() - 0.5) * 3;
        z = goal.cz + (rand() - 0.5) * 3;
      } else if (r < 0.8 && board.pieces.length) {
        const q = board.pieces[Math.floor(rand() * board.pieces.length)];
        x = q.pos.x + (rand() - 0.5) * 2.5;
        z = q.pos.z + (rand() - 0.5) * 2.5;
      } else {
        x = zone.min.x + rand() * zone.size.x;
        z = zone.min.z + rand() * zone.size.z;
      }
      const plan = board.plan(kind, rot, x, z);
      if (!plan.ok) {
        ok = false;
        break;
      }
      board.add({ kind, rot, pos: plan.pos });
    }
    if (!ok || !board.pieces.length) continue;
    placedAll++;
    if (board.heightOf() < goal.height - 0.02) continue; // cheap filter: it must at least reach the goal as built
    const run = runToEnd(level, board.snapshot());
    const outcome = board.evaluate(run.live, run.settled, run.fell);
    run.sim.dispose();
    if (!outcome.won) continue;
    const pieces = board.pieces.map((p) => ({ kind: p.kind, rot: p.rot, x: p.pos.x, y: p.pos.y, z: p.pos.z }));
    const key = pieces
      .map((p) => `${p.kind}${p.rot}@${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`)
      .sort()
      .join(';');
    if (seen.has(key)) continue;
    seen.add(key);
    wins.push({ pieces, count: pieces.length, tipped: pieces.some((p) => layOf(p.rot) !== 0 && extents(p.kind, p.rot).y !== extents(p.kind, 0).y) });
  }
  const families = [
    ...new Set(
      wins.map((w) =>
        w.pieces
          .map((p) => p.kind)
          .sort()
          .join('+'),
      ),
    ),
  ].sort();
  return {
    trials,
    placedAll,
    wins,
    distinct: wins.length,
    families,
    minPieces: wins.length ? Math.min(...wins.map((w) => w.count)) : 0,
    tippedWins: wins.filter((w) => w.tipped).length,
    flatWins: wins.filter((w) => !w.tipped).length,
  };
}
