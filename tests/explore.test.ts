// The random explorer, as a design tool: EXPLORE=1 npx vitest run tests/explore.test.ts   (EXPLORE_ONLY="title" to pick a level, EXPLORE_TRIALS=n)
// It is skipped in the normal run: it is for looking at levels, and it takes a while.
import { beforeAll, describe, it } from 'vitest';
import { buildLevels } from '../src/core/levels';
import { initPhysics } from '../src/physics/sim';
import { explore, shortWins } from './explore';

beforeAll(async () => {
  await initPhysics();
});

const on = !!process.env.EXPLORE;
const only = process.env.EXPLORE_ONLY?.toLowerCase();
const trials = Number(process.env.EXPLORE_TRIALS ?? 4000);

describe.skipIf(!on)('explorer', () => {
  const levels = buildLevels();
  levels.forEach((level, i) => {
    if (level.sandbox) return;
    if (only && !level.title.toLowerCase().includes(only)) return;
    it(`${i + 1}. ${level.title}`, () => {
      const t0 = Date.now();
      if (process.env.EXPLORE_MODE === 'short') {
        const max = Number(process.env.EXPLORE_MAX ?? 3);
        const w = shortWins(level, max, Number(process.env.EXPLORE_BUDGET ?? 3000));
        const by = new Map<number, number>();
        for (const x of w) by.set(x.count, (by.get(x.count) ?? 0) + 1);
        const counts = [...by].map(([c, n]) => `${c}p:${n}`).join(' ');
        console.log(`${String(i + 1).padStart(2)} ${level.title.padEnd(20)} | par ${level.par} | short wins (<= ${max} pieces): ${w.length} ${counts} | tipped ${w.filter((x) => x.tipped).length} | ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        const fewest = w.length ? Math.min(...w.map((x) => x.count)) : 0;
        for (const x of w.filter((y) => y.count === fewest).slice(0, 3)) console.log('   ', x.pieces.map((p) => `${p.kind}/r${p.rot}@${p.x},${p.z}`).join(' '));
        return;
      }
      const e = explore(level, trials, 7 + i);
      const best = e.wins.filter((w) => w.count === e.minPieces).slice(0, 1)[0];
      const line = [
        `${String(i + 1).padStart(2)} ${level.title.padEnd(20)}`,
        `rating ${level.rating}`,
        `par ${level.par}`,
        `trials ${e.trials} placed ${e.placedAll}`,
        `WINS ${e.distinct} (flat ${e.flatWins}, tipped ${e.tippedWins})`,
        `fewest ${e.minPieces}`,
        `families ${e.families.length}`,
        `${((Date.now() - t0) / 1000).toFixed(1)}s`,
      ].join(' | ');
      console.log(line);
      if (best) console.log('   best:', best.pieces.map((p) => `${p.kind}/r${p.rot}@${p.x},${p.z}`).join(' '));
      if (process.env.EXPLORE_FAMILIES) console.log('   families:', e.families.slice(0, 40).join('  '));
    }, 600000);
  });
});
