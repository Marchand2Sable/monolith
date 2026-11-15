// Entry point: wires the canvas, the pointer, the keyboard and the frame loop to the game.
import './ui/style.css';
import { Game } from './game/game';
import { Ui } from './ui/ui';
import { showFatal, installErrorHandlers } from './errors';
import { BUILD, buildLabel } from './buildinfo';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

async function start(): Promise<void> {
  // which build is running, for a bug report: in the page's data and the console, never over the game itself
  document.documentElement.dataset.version = BUILD.version;
  document.documentElement.dataset.channel = BUILD.channel;
  console.info(`MONOLITH ${buildLabel()}`);
  let game: Game;
  try {
    game = new Game(canvas);
  } catch (e) {
    showFatal(uiRoot, "Le rendu 3D n'a pas pu démarrer (WebGL indisponible ?).", e);
    return;
  }
  installErrorHandlers(game.errors);
  const ui = new Ui(game, uiRoot);
  const params = new URLSearchParams(location.search);

  const resize = (): void => {
    game.stage.resize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  resize();

  // pointer: the canvas takes the events that no piece of interface took
  const last = new Map<number, { x: number; y: number }>();
  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus({ preventScroll: true });
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* a synthetic pointer (tests) cannot be captured: the events still reach the canvas */
    }
    last.set(e.pointerId, { x: e.clientX, y: e.clientY });
    game.pointerDown(e.pointerId, e.clientX, e.clientY, e.button, e.pointerType === 'touch');
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = last.get(e.pointerId);
    if (!p) return;
    game.pointerMove(e.pointerId, e.clientX, e.clientY, e.clientX - p.x, e.clientY - p.y);
    p.x = e.clientX;
    p.y = e.clientY;
  });
  const up = (e: PointerEvent): void => {
    last.delete(e.pointerId);
    game.pointerUp(e.pointerId, e.clientX, e.clientY);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    game.wheel(e.deltaY);
  }, { passive: false });

  // a piece dragged out of the tray: its pointer went down on the interface, so the canvas never saw it go down and its own
  // handlers ignore it. The window follows the move wherever it goes (over the board too: with a mouse the events then target
  // the canvas) and takes the release. A drag that began on the canvas (moving a placed piece) is the canvas's own.
  window.addEventListener('pointermove', (e) => {
    if (game.drag && !last.has(e.pointerId)) game.updateDrag(e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', (e) => {
    if (game.drag) game.endDrag(e.clientX, e.clientY, game.overUi(e.clientX, e.clientY));
  });
  window.addEventListener('pointercancel', () => game.cancelDrag());

  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement | null)?.tagName === 'INPUT' && e.key !== 'Escape') return;
    if (game.key(e)) e.preventDefault();
  });
  window.addEventListener('blur', () => game.cancelDrag());
  // a tab hidden mid-run keeps its physics: nothing to do, the frame loop simply stops being called

  await game.ready;
  // the studio splash shows on a player's first view; developers skip it (add ?splash to see it, ?nosplash to skip it)
  const showSplash = params.has('splash') || (!params.has('nosplash') && !import.meta.env.DEV);
  game.page = showSplash ? 'splash' : 'title';
  if (showSplash) setTimeout(() => game.page === 'splash' && game.state === 'menu' && game.go(() => game.openPage('title')), 3600);
  game.fade = showSplash ? 0 : 1;
  game.touch();

  if (import.meta.env.DEV) {
    const { installDebug } = await import('./ui/debug');
    installDebug(game, uiRoot, ui);
  }

  let prev = performance.now();
  const frame = (t: number): void => {
    const dt = Math.min(0.1, (t - prev) / 1000);
    prev = t;
    try {
      game.tick(dt);
      ui.sync();
    } catch (e) {
      game.errors.push(String(e));
      console.error(e);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void start();
