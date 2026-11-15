// Development-only end-to-end check, run inside the real page (real rendering, real physics, real save): window.__e2e.run().
// It plays every known solution and trap of every level through the same code a hand would reach, and reads the verdict.
import type { Game } from '../game/game';
import { SAVE_KEY } from '../game/save';

export interface E2eReport {
  total: number;
  failures: string[];
  lines: string[];
  ms: number;
}

export async function runE2e(game: Game, only?: number): Promise<E2eReport> {
  const t0 = performance.now();
  const failures: string[] = [];
  const lines: string[] = [];
  const check = (ok: boolean, what: string): void => {
    lines.push(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
    if (!ok) failures.push(what);
  };
  const saveBefore = localStorage.getItem(SAVE_KEY);
  game.progress.data.freeMode = true;
  game.page = 'levels';
  const idle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  for (let li = 0; li < game.levels.length; li++) {
    if (only !== undefined && li !== only) continue;
    const level = game.levels[li];
    const runOne = async (steps: typeof level.solutions[number], expectWin: boolean, name: string): Promise<void> => {
      game.startLevel(li);
      let placed = true;
      for (const s of steps) placed = game.dropNear(s) && placed;
      if (!placed) {
        check(false, `${name}: a step could not be placed`);
        return;
      }
      game.startSim();
      if (game.state !== 'run') {
        check(false, `${name}: the run did not start`);
        return;
      }
      game.debugFinish();
      await idle();
      check((game.state as string) === 'done', `${name}: the run ended`);
      check(game.outcome?.won === expectWin, `${name}: ${expectWin ? 'wins' : 'fails'} (${game.outcome?.lines.join(' | ')})`);
      if (expectWin) check(game.result.pieces === steps.length, `${name}: result counts ${steps.length} pieces`);
      game.backToBuild();
      check(game.board.pieces.length === steps.length, `${name}: "Modifier" brings the build back`);
    };
    for (let s = 0; s < level.solutions.length; s++) await runOne(level.solutions[s], true, `L${li + 1} ${level.title} solution ${s + 1}`);
    for (let t = 0; t < level.traps.length; t++) await runOne(level.traps[t], false, `L${li + 1} ${level.title} trap ${t + 1}`);
  }

  // saving survives a reload of the save
  const snapshot = JSON.stringify(game.progress.data.levels);
  game.progress.load();
  check(JSON.stringify(game.progress.data.levels) === snapshot, 'the save reads back identical');
  check(game.errors.length === 0, `no run-time errors (${game.errors.join('; ')})`);

  // put the player's real save back
  if (saveBefore === null) localStorage.removeItem(SAVE_KEY);
  else localStorage.setItem(SAVE_KEY, saveBefore);
  game.progress.load();
  game.page = 'title';
  game.startLevel(0);
  game.state = 'menu';
  game.touch();
  return { total: lines.length, failures, lines, ms: Math.round(performance.now() - t0) };
}
