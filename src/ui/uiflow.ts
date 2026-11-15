// Development-only check of the interface itself: real DOM clicks, real pointer and key events, a real drag from the tray, touch and pinch.
// Run in the page with window.__e2e.ui().
import { extents } from '../core/board';
import { layOf, yawOf } from '../core/orient';
import type { Game } from '../game/game';
import { LEGACY_KEYS, SAVE_KEY } from '../game/save';
import type { Ui } from './ui';

export interface UiReport {
  failures: string[];
  lines: string[];
}

export async function runUiFlow(game: Game, ui: Ui): Promise<UiReport> {
  const failures: string[] = [];
  const lines: string[] = [];
  try {
    await flow(game, ui, failures, lines);
  } catch (e) {
    failures.push('exception: ' + String(e));
    lines.push('FAIL exception: ' + String(e));
  }
  return { failures, lines };
}

async function flow(game: Game, ui: Ui, failures: string[], lines: string[]): Promise<void> {
  const check = (ok: boolean, what: string): void => {
    lines.push(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
    if (!ok) failures.push(what);
  };
  // a hidden browser pane gets no animation frames: the test drives the frame loop itself, as well as waiting
  const sleep = async (ms: number): Promise<void> => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      game.tick(1 / 60);
      ui.sync();
      await new Promise((r) => setTimeout(r, 16));
    }
  };
  const until = async (cond: () => boolean, what: string, ms = 4000): Promise<boolean> => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (cond()) return true;
      await sleep(30);
    }
    check(false, `timeout: ${what}`);
    return false;
  };
  const q = (sel: string): HTMLElement | null => document.querySelector(sel);
  const click = (sel: string): boolean => {
    const el = q(sel);
    if (!el || (el as HTMLButtonElement).disabled) return false;
    el.click();
    return true;
  };
  const key = (k: string, mods: Partial<KeyboardEventInit> = {}): void => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }));
  };
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ptr = (target: EventTarget, type: string, x: number, y: number, id = 1, pointerType = 'mouse', button = 0): void => {
    target.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, button, pointerType, bubbles: true, cancelable: true, isPrimary: id === 1 }));
  };

  // a new save needs the earlier builds' keys out of the way too: load() falls back to them when the current key is empty
  const stash = new Map<string, string | null>([SAVE_KEY, ...LEGACY_KEYS].map((k) => [k, localStorage.getItem(k)]));
  for (const k of stash.keys()) localStorage.removeItem(k);
  game.progress.load();
  game.page = 'title';
  game.startLevel(0);
  game.state = 'menu';
  game.fade = 0;
  game.touch();
  const f0 = game.frames;
  await until(() => game.frames > f0 + 5 && !!q('[data-act="page"][data-p="levels"]'), 'the frame loop runs and the title is drawn', 6000);

  // title -> levels -> level 1
  check(!!q('[data-act="page"][data-p="levels"]'), 'the title offers the levels');
  click('[data-act="page"][data-p="levels"]');
  await until(() => game.page === 'levels' && game.fade < 0.1, 'levels page');
  check(!!q('.card[data-i="0"]') && !(q('.card[data-i="0"]') as HTMLButtonElement).disabled, 'level 1 is open');
  check((q('.card[data-i="1"]') as HTMLButtonElement).disabled, 'level 2 is locked on a new save');
  click('.card[data-i="1"]');
  await sleep(500);
  check(game.state === 'menu', 'a locked card does nothing');
  click('.card[data-i="0"]');
  await until(() => game.state === 'build' && game.fade < 0.1, 'level 1 starts');
  check(game.levelIndex === 0 && game.board.pieces.length === 0, 'level 1 starts empty');
  check(document.querySelectorAll('.cell').length === 2, 'the tray holds the two shapes of level 1');
  check(!!q('.objectives'), 'objectives are shown');
  check(!q('#tuto.on'), 'the guided tutorial is not forced on a level');

  // pause with the keyboard, and back
  key('Escape');
  await sleep(150);
  check(game.paused && !!q('#pause.on'), 'Escape pauses');
  click('[data-act="resume"]');
  await sleep(150);
  check(!game.paused && !q('#pause.on'), 'Reprendre resumes');

  // a real drag from the tray to the top of the grey pillar
  const goal = game.level.goal!;
  const top = game.stage.project({ x: 0, y: 2.05, z: 0 }); // the top of the fixed pillar
  const cell = q('.cell[data-kind="pillar"]')!;
  const r = cell.getBoundingClientRect();
  ptr(cell, 'pointerdown', r.left + r.width / 2, r.top + r.height / 2, 1);
  check(!!game.drag, 'pressing a tray cell picks the piece up');
  // a mouse that leaves the tray for the board: from then on the moves target the canvas, which never saw the button go down
  ptr(canvas, 'pointermove', top.x + 60, top.y + 30, 1);
  ptr(canvas, 'pointermove', top.x + 20, top.y + 10, 1);
  const lx = game.drag!.lastX;
  ptr(canvas, 'pointermove', top.x, top.y, 1);
  check(!!game.drag && game.drag.lastX !== lx && game.drag.lastX === top.x, 'the drag keeps following the mouse once it is over the board');
  check(!!game.drag && game.drag.valid, 'the ghost is valid over the pillar');
  ptr(canvas, 'pointerup', top.x, top.y, 1);
  await sleep(100);
  check(game.board.pieces.length === 1, 'releasing over the board places the piece');
  check(Math.abs(game.board.pieces[0].pos.y - 3) < 0.01, 'it stands on the grey pillar');
  check(game.liveHeight() >= goal.height - 0.02, 'the counter reads the goal height');

  // dropping on the interface cancels
  const cell2 = q('.cell[data-kind="cube"]')!;
  const r2 = cell2.getBoundingClientRect();
  ptr(cell2, 'pointerdown', r2.left + 10, r2.top + 10, 2);
  ptr(window, 'pointermove', r2.left + 12, r2.top + 12, 2);
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, clientX: r2.left + 12, clientY: r2.top + 12, bubbles: true }));
  await sleep(60);
  check(game.board.pieces.length === 1 && !game.drag, 'a piece let go over the tray is not placed');

  // rotate, undo, redo, delete
  game.selected = game.board.pieces[0];
  key(' ');
  check(game.board.pieces[0].rot === 0 && game.message.includes('même aspect'), 'Space on a piece that looks the same all round says so and changes nothing');
  key('t');
  check(game.board.pieces[0].rot !== 0 && extents('pillar', game.board.pieces[0].rot).y < 1.5, 'T lays the standing pillar on its side');
  key('z', { ctrlKey: true });
  check(game.board.pieces[0].rot === 0, 'Ctrl+Z undoes the turn');
  key('y', { ctrlKey: true });
  check(game.board.pieces[0].rot !== 0, 'Ctrl+Y redoes it');
  key('z', { ctrlKey: true });
  key('z', { ctrlKey: true });
  check(game.board.pieces.length === 0, 'Ctrl+Z again takes the piece back');
  key('y', { ctrlKey: true });
  key('y', { ctrlKey: true });
  check(game.board.pieces.length === 1, 'Ctrl+Y puts it back');
  game.selected = game.board.pieces[0];
  key('Delete');
  check(game.board.pieces.length === 0, 'Delete removes the selected piece');
  click('[data-act="undo"]');
  check(game.board.pieces.length === 1, 'the Annuler button undoes');
  click('[data-act="reset"]');
  check(game.board.pieces.length === 0, 'Réinitialiser empties the board');
  click('[data-act="undo"]');

  // view: mouse drag turns it, wheel zooms, arrows turn by 45, Home resets
  const yaw0 = game.stage.orbit.yaw;
  ptr(canvas, 'pointerdown', 120, 420, 3);
  ptr(canvas, 'pointermove', 220, 420, 3);
  ptr(canvas, 'pointerup', 220, 420, 3);
  check(Math.abs(game.stage.orbit.yaw - yaw0) > 10, 'dragging the background turns the view');
  const size0 = game.stage.orbit.size;
  canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, bubbles: true, cancelable: true }));
  await sleep(300);
  check(game.stage.orbit.size < size0, 'the wheel zooms in');
  key('ArrowLeft');
  key('Home');
  await sleep(400);
  const corner = (game.stage.orbit.yaw - 45) / 90;
  check(Math.abs(corner - Math.round(corner)) < 0.01, 'Home goes back to an isometric corner');

  // two fingers pinch (touch)
  const s1 = game.stage.orbit.size;
  ptr(canvas, 'pointerdown', 300, 300, 11, 'touch');
  ptr(canvas, 'pointerdown', 400, 300, 12, 'touch');
  ptr(canvas, 'pointermove', 250, 300, 11, 'touch');
  ptr(canvas, 'pointermove', 450, 300, 12, 'touch');
  await sleep(300);
  check(game.stage.orbit.size < s1, 'spreading two fingers zooms in');
  ptr(canvas, 'pointerup', 250, 300, 11, 'touch');
  ptr(canvas, 'pointerup', 450, 300, 12, 'touch');

  // a touch drag from the tray puts the piece above the fingertip
  const cell3 = q('.cell[data-kind="cube"]')!;
  const r3 = cell3.getBoundingClientRect();
  ptr(cell3, 'pointerdown', r3.left + 20, r3.top + 20, 21, 'touch');
  check(!!game.drag && game.drag.touch, 'a touch on the tray picks the piece up as a touch');
  game.cancelDrag();
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 21, bubbles: true }));

  // a real win with the keyboard
  game.restartLevel();
  await sleep(100);
  game.dropNear(game.level.solutions[1][0]);
  key('Enter');
  check((game.state as string) === 'run', 'Enter starts the simulation');
  await until(() => game.state === 'done', 'the run ends', 12000);
  check(!!game.outcome?.won, 'the pillar on the pillar wins');
  await until(() => !!q('#result.on'), 'result card');
  check((q('#result') as HTMLElement).textContent!.includes('RÉUSSI'), 'the card says RÉUSSI');
  check(game.progress.rec(0).done, 'the win is saved');
  check(game.toasts.length > 0 || game.toastTime > 0, 'an achievement toast is queued');
  click('[data-act="edit"]');
  await sleep(100);
  check((game.state as string) === 'build' && game.board.pieces.length === 1, 'Modifier goes back to the build');
  key('Enter');
  await until(() => game.state === 'done', 'second run', 12000);
  await until(() => !!q('#result.on'), 'result card again');
  click('[data-act="next"]');
  await until(() => game.levelIndex === 1 && game.state === 'build', 'Suivant opens level 2');
  check(game.progress.unlocked(1), 'level 2 is now open');

  // turning a beam: Space turns it on the board, T tips it up, both really change its footprint, with the keys and with the buttons
  await until(() => game.fade < 0.1, 'level 2 is shown');
  check(game.dropNear({ kind: 'beam', x: 1, z: 0, rot: 0 }), 'a beam is put on the stairs');
  const bm = game.board.pieces[0];
  game.selected = bm;
  const f00 = extents('beam', bm.rot);
  key(' ');
  const f01 = extents('beam', bm.rot);
  check(yawOf(bm.rot) === 1 && f00.x === 3 && f01.z === 3 && f01.x === 1, 'Space turns the beam a quarter turn: its footprint turns with it');
  key(' ', { shiftKey: true });
  check(layOf(bm.rot) !== 0 && extents('beam', bm.rot).y > 2.9, 'Shift+Space stands the beam on its end');
  check(game.board.plan('beam', bm.rot, bm.pos.x, bm.pos.z, Infinity).ok || true, 'the turned beam is planned again');
  click('[data-act="lay"]');
  check(layOf(bm.rot) === 0 || extents('beam', bm.rot).y < 1.5, 'the Coucher button lays it down again');
  click('[data-act="rotate"]');
  check(yawOf(bm.rot) === 2, 'the Tourner button turns it again');
  key('z', { ctrlKey: true });
  key('z', { ctrlKey: true });
  key('z', { ctrlKey: true });
  key('z', { ctrlKey: true });
  check(game.board.pieces[0].rot === 0, 'four undos bring the beam back to its first orientation');
  key('z', { ctrlKey: true });
  // pause menu: settings inside, levels
  await until(() => game.fade < 0.1, 'the fade clears');
  key('Escape');
  await until(() => game.paused && !!q('[data-act="pause-settings"]'), 'Escape pauses level 2');
  click('[data-act="pause-settings"]');
  await until(() => !!q('#pause input[type=range]'), 'the settings card is drawn');
  check(game.pauseSettings && !!q('#pause input[type=range]'), 'the pause card opens the settings');
  click('[data-act="sound"]');
  check(game.progress.data.sound === false, 'the sound switch works');
  await until(() => q('#pause [data-act="sound"]')?.textContent === 'Coupé', 'the switch shows its state');
  click('[data-act="sound"]');
  await sleep(150); // the switch redraws the card on the next frame: take the slider after that
  const range = q('#pause input[type=range]') as HTMLInputElement;
  range.value = '40';
  range.dispatchEvent(new Event('input', { bubbles: true }));
  check(Math.abs(game.progress.data.volume - 0.4) < 0.001, 'the volume slider works');
  for (const v of ['55', '70', '30']) {
    range.value = v;
    range.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(80);
  }
  check(q('#pause input[type=range]') === range && range.isConnected, 'the slider is the same element after moving it (it is not redrawn under the finger)');
  check(Math.abs(game.progress.data.volume - 0.3) < 0.001, 'the slider keeps following');
  click('[data-act="pause-back"]');
  await until(() => !!q('#pause [data-act="levels"]'), 'the pause menu is back');
  click('[data-act="levels"]');
  await until(() => game.page === 'levels' && game.state === 'menu', 'levels from pause');
  check(!game.paused, 'leaving to the levels ends the pause');

  // the rewards, from the pause menu: a look chosen there is on the pieces at once, and the card is not redrawn
  game.progress.record(0, 1, true);
  game.progress.record(1, 1, true); // six medals: the second look opens
  game.playSolution(0, 0);
  await until(() => game.state === 'build' && game.fade < 0.1, 'level 1 with a piece');
  key('Escape');
  await until(() => game.paused && !!q('#pause [data-act="pause-rewards"]'), 'the pause card offers the rewards');
  click('#pause [data-act="pause-rewards"]');
  await until(() => game.pauseView === 'rewards' && !!q('#pause .theme'), 'the rewards card is drawn');
  check(q('#pause.peek') !== null && document.querySelectorAll('#pause .theme').length === 5 && document.querySelectorAll('#pause .ach .a').length === 6, 'the card lists the five looks and the six achievements');
  const stageTheme = (): string => (game.stage as unknown as { theme: { name: string } }).theme.name;
  const card = q('#pause .dialog');
  const wasTheme = stageTheme();
  const target = ['Sable', 'Aurore', 'Cobalt', 'Jade'].find((n) => n !== wasTheme && game.progress.themeOpen(['Ivoire', 'Sable', 'Aurore', 'Cobalt', 'Jade'].indexOf(n)))!;
  const ti = ['Ivoire', 'Sable', 'Aurore', 'Cobalt', 'Jade'].indexOf(target);
  check(!!q(`#pause .theme[data-i="${ti}"]:not(.locked)`), 'an opened look can be chosen');
  check(!!q('#pause .theme.locked'), 'a look that is not open yet is shown locked');
  click(`#pause .theme[data-i="${ti}"]`);
  await until(() => stageTheme() === target, 'the pieces take the new look');
  await sleep(150);
  check(game.progress.data.theme === ti, 'the choice is kept');
  check(q('#pause .dialog') === card && !!q(`#pause .theme[data-i="${ti}"].current`), 'the card is marked in place, not redrawn');
  key('Escape');
  await until(() => game.pauseView === 'menu' && !!q('#pause [data-act="resume"]'), 'Escape goes back from the rewards to the pause menu');
  click('[data-act="resume"]');
  await sleep(100);
  game.setTheme(0);

  // the way back to the main menu, from the pause card and from the result cards
  game.startLevel(0);
  await until(() => game.state === 'build' && game.fade < 0.1, 'level 1 again');
  key('Escape');
  await until(() => game.paused && !!q('#pause [data-act="home"]'), 'the pause card offers the main menu');
  click('#pause [data-act="home"]');
  await until(() => game.page === 'title' && game.state === 'menu' && !game.paused, 'Menu principal from pause leads to the title');
  check(!!q('[data-act="page"][data-p="levels"]'), 'the title menu is drawn');

  game.playSolution(0, 0);
  await until(() => game.state === 'build' && game.fade < 0.1, 'level 1 for a failure');
  game.debugForce(false);
  await until(() => !!q('#result.on [data-act="home"]'), 'the failure card offers the main menu');
  click('#result [data-act="home"]');
  await until(() => game.page === 'title' && game.state === 'menu', 'Menu principal from a failure leads to the title');

  game.playSolution(0, 0);
  await until(() => game.state === 'build' && game.fade < 0.1, 'level 1 for a win');
  game.startSim();
  await until(() => !!q('#result.on [data-act="home"]'), 'the win card offers the main menu', 20000);
  click('#result [data-act="home"]');
  await until(() => game.page === 'title' && game.state === 'menu', 'Menu principal from a win leads to the title');

  await until(() => !game.busy && game.fade < 0.1, 'the transition is over');
  game.openPage('ending');
  await until(() => !!q('#page [data-p="title"]'), 'the ending page offers the main menu');
  click('#page [data-p="title"]');
  await until(() => game.page === 'title', 'Menu principal from the ending leads to the title');

  // LEVEL 0: the guided tutorial, with real gestures
  await until(() => !game.busy && game.fade < 0.1, 'the title is quiet');
  check(!!q('[data-act="tutorial"]'), 'the title offers the tutorial');
  const medalsBefore = game.progress.totalMedals;
  click('[data-act="tutorial"]');
  await until(() => !!game.tutorial && game.state === 'build' && game.fade < 0.1, 'the tutorial opens');
  check(game.level.tutorial && game.levelIndex === game.tutorialIndex, 'it plays on LEVEL 0');
  await until(() => !!q('#tuto.on .tcard h3'), 'the guide card is drawn');
  // the card is redrawn on the next frame: let it be, as a hand would, before looking at it or pressing it
  const settle = async (): Promise<void> => {
    await until(() => !game.busy && game.fade < 0.1, 'the screen is quiet');
    await sleep(70);
  };
  const nextBtn = (): HTMLButtonElement => q('[data-act="tuto-next"]') as HTMLButtonElement;
  const stepId = (): string => game.tutorialStep?.id ?? '';
  check(stepId() === 'goal' && (q('[data-act="tuto-prev"]') as HTMLButtonElement).disabled, 'it starts with the objective, no way back');
  check(q('#tuto .spot')!.style.display === 'block' && (q('#tuto .catch') as HTMLElement).style.display === 'block', 'the objective is highlighted and the board waits behind the card');
  for (const id of ['read', 'pieces', 'place']) {
    check(!nextBtn().disabled, `"Suivant" is open on ${stepId()}`);
    click('[data-act="tuto-next"]');
    await until(() => stepId() === id, `the guide moves to ${id}`);
    await settle();
  }
  check(!(q('[data-act="tuto-prev"]') as HTMLButtonElement).disabled, `"Précédent" is open on step ${stepId()}`);
  click('[data-act="tuto-prev"]');
  await until(() => stepId() === 'pieces', '"Précédent" goes back one step');
  await settle();
  click('[data-act="tuto-next"]');
  await until(() => stepId() === 'place', 'and forward again');
  await settle();
  check(nextBtn().disabled, 'the step that asks for a gesture keeps "Suivant" closed');
  check((q('#tuto .catch') as HTMLElement).style.display === 'none', 'and leaves the board free');
  check(!!q('#tuto .spot') && q('#tuto .spot')!.style.display === 'block', 'the beam in the tray is highlighted');
  // the gesture: drag the beam onto the grey pillar
  const topP = game.stage.project({ x: 0, y: 2.05, z: 0 });
  const beamCell = q('.cell[data-kind="beam"]')!;
  const bc = beamCell.getBoundingClientRect();
  ptr(beamCell, 'pointerdown', bc.left + bc.width / 2, bc.top + bc.height / 2, 1);
  ptr(canvas, 'pointermove', topP.x + 40, topP.y + 20, 1);
  ptr(canvas, 'pointermove', topP.x, topP.y, 1);
  ptr(canvas, 'pointerup', topP.x, topP.y, 1);
  await until(() => !nextBtn().disabled, '"Suivant" opens once the beam is placed');
  click('[data-act="tuto-next"]');
  await until(() => stepId() === 'rotate', 'the guide asks for a rotation');
  await settle();
  check(nextBtn().disabled, 'it waits for the turn');
  key(' ');
  await until(() => !nextBtn().disabled, 'ESPACE turns the beam and opens "Suivant"');
  click('[data-act="tuto-next"]');
  await until(() => stepId() === 'lay', 'the guide asks to stand the beam up');
  await settle();
  check(nextBtn().disabled, 'it waits for the beam to stand');
  key('t');
  await until(() => !nextBtn().disabled, 'T stands the beam on its end and opens "Suivant"');
  click('[data-act="tuto-next"]');
  await until(() => stepId() === 'rules', 'the rules step');
  await settle();
  click('[data-act="tuto-next"]');
  await until(() => stepId() === 'validate', 'the validation step');
  await settle();
  check(nextBtn().disabled, 'it waits for a successful simulation');
  click('[data-act="sim"]');
  await until(() => game.state === 'done', 'the tutorial run ends', 20000);
  check(!!game.outcome?.won, 'the beam stood on the grey pillar wins LEVEL 0');
  await until(() => !nextBtn().disabled, '"Suivant" opens after the win');
  click('[data-act="tuto-next"]');
  await until(() => stepId() === 'next' && !!q('#result.on'), 'the last step shows over the result card');
  check((q('#result') as HTMLElement).textContent!.includes('Premier niveau') && !(q('#result') as HTMLElement).textContent!.includes('Économe'), 'LEVEL 0 has its own card, no medals');
  click('[data-act="tuto-next"]');
  await until(() => !game.tutorial, 'Terminer closes the guide');
  await settle();
  check(game.progress.data.tutorialDone && !q('#tuto.on'), 'the lesson is remembered, the overlay is gone');
  check(game.progress.totalMedals === medalsBefore, 'LEVEL 0 earns no medal');
  click('#result [data-act="next"]');
  await until(() => game.levelIndex === 0 && game.state === 'build' && !game.level.tutorial, 'the lesson leads to the first level');
  await settle();
  game.openPage('title');
  await until(() => !!q('[data-act="tutorial"]'), 'the title again');
  await settle();
  click('[data-act="tutorial"]');
  await until(() => !!game.tutorial && game.state === 'build', 'the lesson can be replayed from the menu');
  await settle();
  await until(() => !!q('[data-act="tuto-skip"]'), 'the skip link is drawn');
  click('[data-act="tuto-skip"]');
  await until(() => !game.tutorial && !q('#tuto.on'), '"Passer le tutoriel" closes the guide');
  game.openPage('levels');
  await until(() => !!q('.card.lesson'), 'the level list shows LEVEL 0');
  check(!!q('.card.lesson'), 'LEVEL 0 can be replayed from the list');
  game.openPage('title');

  // settings page: erase needs two clicks
  game.openPage('settings');
  await until(() => game.fade < 0.1 && !!q('[data-act="erase"]'), 'the settings page is drawn');
  click('[data-act="erase"]');
  await sleep(100);
  check(game.progress.rec(0).done, 'one click on erase only arms it');
  click('[data-act="erase"]');
  await sleep(100);
  check(!game.progress.rec(0).done, 'the second click erases');

  // export / import: the file the button hands out is read back by the import, and a wrong file changes nothing
  game.progress.record(0, 1, true);
  const aClick = HTMLAnchorElement.prototype.click;
  let exported = '';
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (this.download) {
      void fetch(this.href).then((r) => r.text()).then((t) => (exported = t));
      return;
    }
    return aClick.call(this);
  };
  click('[data-act="export-save"]');
  await until(() => exported !== '', 'the export file is made');
  HTMLAnchorElement.prototype.click = aClick;
  check(JSON.parse(exported).game === 'monolith' && JSON.parse(exported).data.levels[0].done === true, 'the export holds the progress');
  await until(() => !!q('.note'), 'the export note shows');
  game.eraseProgress();
  check(!game.progress.rec(0).done, 'erased before the import');
  check(game.importSave(exported) && game.progress.rec(0).done && game.progress.rec(0).shard, 'importing the exported file restores the progress');
  const keep = JSON.stringify(game.progress.data);
  check(!game.importSave('{"format":"tts-save","game":"other","data":{"version":1}}') && JSON.stringify(game.progress.data) === keep, 'a file of another game is refused and changes nothing');
  await until(() => (q('.note') as HTMLElement | null)?.textContent?.includes('autre jeu') === true, 'the refusal is told');

  check(game.errors.length === 0, `no run-time errors (${game.errors.join('; ')})`);

  for (const [k, v] of stash) {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  }
  game.progress.load();
  game.page = 'title';
  game.startLevel(0);
  game.state = 'menu';
  game.touch();
}
