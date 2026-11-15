// Development-only debug panel (toggle with the ` key): pick a level, play a known solution, force a verdict, read the board and the errors.
// This file is only imported when `import.meta.env.DEV` is true, so it is not part of the player build.
import type { Game } from '../game/game';
import type { Ui } from './ui';

export function installDebug(game: Game, root: HTMLElement, ui: Ui): void {
  const panel = document.createElement('div');
  panel.id = 'debug';
  root.appendChild(panel);
  (window as unknown as { __monolith: Game }).__monolith = game;
  // a hidden browser pane gets no animation frames: this advances the game by hand (seconds of game time)
  (window as unknown as { __pump: (s: number) => void }).__pump = (s) => {
    for (let i = 0; i < Math.round(s * 60); i++) {
      game.tick(1 / 60);
      ui.sync();
    }
  };
  (window as unknown as { __ui: unknown }).__ui = ui;
  (window as unknown as { __e2e: unknown }).__e2e = {
    run: async (only?: number) => (await import('./e2e')).runE2e(game, only),
    ui: async () => (await import('./uiflow')).runUiFlow(game, ui),
  };

  const draw = (): void => {
    const g = game;
    const levelOptions = g.levels.map((l, i) => `<option value="${i}"${i === g.levelIndex ? ' selected' : ''}>${i + 1}. ${l.title}</option>`).join('');
    const sols = g.level.solutions.map((_, i) => `<button data-sol="${i}">sol ${i + 1}</button>`).join('');
    const pieces = g.board.pieces.map((p) => `${p.kind} r${p.rot} (${p.pos.x.toFixed(2)}, ${p.pos.y.toFixed(2)}, ${p.pos.z.toFixed(2)})`).join('\n');
    panel.innerHTML = `
      <b>MONOLITH debug</b> · état <b>${g.state}</b> · page ${g.page} · fps ${fps.toFixed(0)}
      <h4>Niveau</h4><select data-level>${levelOptions}</select> <button data-act="reload">Réinitialiser</button>
      <h4>Solutions connues</h4>${sols || '—'} <button data-act="run">Simuler</button>
      <h4>Validation</h4><button data-act="win">Forcer réussite</button><button data-act="fail">Forcer échec</button><button data-act="unlock">Tout ouvrir</button>
      <h4>Données</h4><pre>hauteur ${g.liveHeight().toFixed(2)} / ${g.level.goal?.height ?? '—'}
zone ${g.level.goal ? `(${g.level.goal.cx}, ${g.level.goal.cz}) ${g.level.goal.w}×${g.level.goal.d}${g.level.goal.with ? ' avec ' + g.level.goal.with : ''}` : '—'}
pièces ${g.board.pieces.length}  par ${g.level.par}
${pieces}</pre>
      <h4>Erreurs (${g.errors.length})</h4><pre>${g.errors.slice(-6).join('\n') || 'aucune'}</pre>`;
  };

  let fps = 60;
  let lastT = performance.now();
  let n = 0;
  setInterval(() => {
    const t = performance.now();
    fps = (g_frames() * 1000) / (t - lastT);
    lastT = t;
    n = 0;
    if (panel.classList.contains('on')) draw();
  }, 500);
  let lastFrames = 0;
  const g_frames = (): number => {
    const d = game.frames - lastFrames;
    lastFrames = game.frames;
    n++;
    return d;
  };
  void n;

  panel.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement;
    if (t.dataset.level !== undefined) game.startLevel(Number(t.value));
    draw();
  });
  panel.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button');
    if (!t) return;
    if (t.dataset.sol !== undefined) game.playSolution(game.levelIndex, Number(t.dataset.sol));
    switch (t.dataset.act) {
      case 'reload':
        game.restartLevel();
        break;
      case 'run':
        game.startSim();
        break;
      case 'win':
        game.debugForce(true);
        break;
      case 'fail':
        game.debugForce(false);
        break;
      case 'unlock':
        game.progress.data.freeMode = true;
        game.progress.save();
        break;
      default:
        break;
    }
    draw();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === '`') {
      panel.classList.toggle('on');
      draw();
    }
  });
  if (new URLSearchParams(location.search).has('debug')) {
    panel.classList.add('on');
    draw();
  }
}
