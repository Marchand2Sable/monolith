// Every known solution of every level must win, every trap must fail: played through the rules and the real physics, no screen.
import { beforeAll, describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { buildLevels, type Level, type Step } from '../src/core/levels';
import { initPhysics, runToEnd } from '../src/physics/sim';

beforeAll(async () => {
  await initPhysics();
});

export function play(level: Level, steps: Step[]) {
  const board = new Board(level);
  for (const s of steps) {
    const r = board.planAt(s.kind, s.rot, s.x, s.z, s.floor ?? Infinity);
    if (!r.ok) throw new Error(`cannot place ${s.kind} at ${s.x},${s.z}: ${r.why}`);
    board.add({ kind: s.kind, rot: s.rot, pos: r.pos });
  }
  const run = runToEnd(level, board.snapshot());
  const outcome = board.evaluate(run.live, run.settled, run.fell);
  run.sim.dispose();
  return outcome;
}

const levels = buildLevels();

describe('levels', () => {
  it('has the campaign, a sandbox and LEVEL 0 (the tutorial), the last two outside the campaign', () => {
    expect(levels.length).toBe(19);
    expect(levels[17].sandbox).toBe(true);
    expect(levels[18].tutorial).toBe(true);
    expect(levels.filter((l) => !l.special).length).toBe(17);
  });

  levels.forEach((level, li) => {
    if (level.sandbox) return;
    describe(`${li + 1}. ${level.title}`, () => {
      level.solutions.forEach((sol, si) => {
        it(`solution ${si + 1} wins`, () => {
          const o = play(level, sol);
          expect(o.won, o.lines.join(' | ')).toBe(true);
        });
      });
      level.traps.forEach((trap, ti) => {
        it(`trap ${ti + 1} fails`, () => {
          const o = play(level, trap);
          expect(o.won, o.lines.join(' | ')).toBe(false);
        });
      });
      it('does not win with nothing placed', () => {
        const o = play(level, []);
        expect(o.won, o.lines.join(' | ')).toBe(false);
      });
    });
  });
});
