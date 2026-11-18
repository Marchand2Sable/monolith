// The whole game flow: it owns the board, the stage, the physics run, the save and the audio, and exposes what the interface draws and calls.
import { Board, REACH, extents, worldParts, type Outcome, type Piece, type PieceState } from '../core/board';
import { buildLevels, obstaclePos, type Level, type Step } from '../core/levels';
import { Box, v3, type Vec3 } from '../core/math';
import { shapeBoxes, volumeOf, type Kind } from '../core/kinds';
import { stepOrientation } from '../core/orient';
import { Sim, STEP, initPhysics } from '../physics/sim';
import { Stage } from '../render/stage';
import { Audio, type SoundName } from './audio';
import { ACHIEVEMENTS, Progress } from './save';
import { TUTORIAL, stepDone, stepOf, type TutorialState, type TutorialStep } from './tutorial';

export type State = 'menu' | 'build' | 'run' | 'done';
export type Page = 'splash' | 'title' | 'levels' | 'settings' | 'rewards' | 'ending';

export interface RunResult {
  won: boolean;
  eco: boolean;
  shard: boolean;
  newDone: boolean;
  newEco: boolean;
  newShard: boolean;
  pieces: number;
  par: number;
  achievements: number[];
  /** The level this win opened (its index), or -1 when it opened nothing new. */
  unlocked: number;
  /** The campaign so far: levels won out of all of them. */
  doneCount: number;
  total: number;
}

const emptyResult = (): RunResult => ({ won: false, eco: false, shard: false, newDone: false, newEco: false, newShard: false, pieces: 0, par: 0, achievements: [], unlocked: -1, doneCount: 0, total: 0 });

/** The number a level wears in the list: its place among the campaign levels (the sandbox and the lesson have none). */
export function campaignNumber(levels: Level[], index: number): number {
  let n = 0;
  for (let k = 0; k <= index && k < levels.length; k++) if (!levels[k].special) n++;
  return n;
}

interface Drag {
  kind: Kind;
  rot: number;
  from: Piece | null;
  before: PieceState[];
  valid: boolean;
  pos: Vec3;
  lastX: number;
  lastY: number;
  touch: boolean;
}

export class Game {
  readonly levels: Level[] = buildLevels();
  readonly progress = new Progress(this.levels);
  readonly audio = new Audio();
  readonly stage: Stage;

  state: State = 'menu';
  page: Page = 'title';
  pageTime = 0;
  paused = false;
  /** Which card the pause shows: the menu, the settings or the rewards. */
  pauseView: 'menu' | 'settings' | 'rewards' = 'menu';
  get pauseSettings(): boolean {
    return this.pauseView === 'settings';
  }
  set pauseSettings(on: boolean) {
    this.pauseView = on ? 'settings' : 'menu';
  }
  confirmErase = false;
  /** The interactive tutorial (LEVEL 0), while it runs. */
  tutorial: TutorialState | null = null;
  levelIndex = 0;
  level: Level = this.levels[0];
  board = new Board(this.levels[0]);
  selected: Piece | null = null;
  drag: Drag | null = null;
  outcome: Outcome | null = null;
  result: RunResult = emptyResult();
  resultTime = 0;
  introTime = 99;
  orbitMoved = 0;
  message = '';
  messageUntil = 0;
  toasts: string[] = [];
  toastText = '';
  toastTime = 0;
  fade = 1;
  version = 0; // bumped whenever something the interface shows has changed
  simTime = 0;
  shardTaken = false;
  frames = 0;
  /** Everything that went wrong at run time (the debug panel and the tests read it). */
  errors: string[] = [];

  private pending: (() => void) | null = null;
  private undoStack: PieceState[][] = [];
  private redoStack: PieceState[][] = [];
  private runStart: PieceState[] | null = null;
  private sim: Sim | null = null;
  private acc = 0;
  private panning = false;
  private orbiting = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private ids: number[] = []; // the piece ids of the run, in the order of the bodies
  ready: Promise<void>;

  constructor(canvas: HTMLCanvasElement) {
    this.stage = new Stage(canvas);
    this.audio.sound = this.progress.data.sound;
    this.audio.volume = this.progress.data.volume;
    this.stage.orbit.invert = this.progress.data.invert;
    this.ready = initPhysics().then(() => {
      this.loadLevel(0); // the board shows behind the title
      this.state = 'menu';
      this.touch();
    });
  }

  touch(): void {
    this.version++;
  }

  // ------------------------------------------------------------------ small helpers
  sfx(name: SoundName, volume = 1, pitch = 1): void {
    this.audio.play(name, volume, pitch);
  }

  say(text: string, seconds = 3): void {
    this.message = text;
    this.messageUntil = performance.now() + seconds * 1000;
    this.touch();
  }

  get busy(): boolean {
    return this.pending !== null || this.fade > 0.35;
  }

  /** Runs an action behind a quick fade to black. */
  go(action: () => void): void {
    if (this.pending) return;
    this.pending = action;
    this.sfx('whoosh', 0.6);
  }

  private commit(before: PieceState[]): void {
    this.undoStack.push(before);
    this.redoStack = [];
    this.touch();
  }

  // ------------------------------------------------------------------ levels
  private loadLevel(index: number): void {
    // a new level starts empty: the pieces of the previous one (still standing, falling or half-dragged) go with it
    this.cancelDrag();
    this.endSim();
    this.tutorial = null;
    this.levelIndex = index;
    this.level = this.levels[index];
    this.board = new Board(this.level);
    this.undoStack = [];
    this.redoStack = [];
    this.selected = null;
    this.runStart = null;
    this.outcome = null;
    this.shardTaken = false;
    this.stage.loadLevel(this.level, this.progress.theme);
    this.stage.shardVisible = true;
    this.state = 'build';
    this.say(this.level.sandbox ? 'Bac à sable : construisez librement.' : '', 3);
    this.touch();
  }

  /** Opens a level to play: board empty, view framed, intro banner. */
  startLevel(index: number): void {
    this.paused = false;
    this.pauseSettings = false;
    this.loadLevel(index);
    this.introTime = 0;
    this.orbitMoved = 0;
    this.result = emptyResult();
    this.touch();
  }

  restartLevel(): void {
    this.paused = false;
    this.pauseSettings = false;
    this.loadLevel(this.levelIndex);
    this.introTime = 99;
    if (this.level.tutorial) {
      this.tutorial = { step: 0 };
      this.enterStep();
    }
    this.touch();
  }

  // ------------------------------------------------------------------ the tutorial (LEVEL 0)
  /** True while the player plays with a finger (so the guide speaks of buttons, not keys). The first guess is the device; the last input wins. */
  usesTouch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  /** A step that asks for a gesture ends by itself a moment after it is made, unless the gesture was already made when the step began. */
  private tutorialAuto = false;
  private tutorialReadyTime = 0;

  private enterStep(): void {
    const s = this.tutorialStep;
    this.tutorialAuto = !!s && !!s.until && !stepDone(this, s);
    this.tutorialReadyTime = 0;
  }

  get tutorialIndex(): number {
    return this.levels.findIndex((l) => l.tutorial);
  }

  /** Opens LEVEL 0 with its guided steps. */
  startTutorial(): void {
    this.startLevel(this.tutorialIndex);
    this.introTime = 99;
    this.tutorial = { step: 0 };
    this.enterStep();
    this.touch();
  }

  get tutorialStep(): TutorialStep | null {
    return this.state === 'menu' ? null : stepOf(this);
  }

  /** Can "Suivant" be pressed: the step's gesture, when it asks for one, has been made. */
  get tutorialReady(): boolean {
    const s = this.tutorialStep;
    return !!s && stepDone(this, s);
  }

  /** The step shown over the result card is the last one: it only exists once the level is won. */
  tutorialNext(): void {
    const t = this.tutorial;
    if (!t || !this.tutorialReady) return;
    this.sfx('click', 0.6);
    if (t.step >= TUTORIAL.length - 1) {
      this.endTutorial();
      return;
    }
    t.step++;
    // a step that asks for a gesture already made is simply shown as done; one after a finished run waits for the result card
    this.enterStep();
    this.touch();
  }

  tutorialPrev(): void {
    const t = this.tutorial;
    if (!t || t.step === 0) return;
    this.sfx('click', 0.6);
    t.step--;
    this.enterStep();
    this.touch();
  }

  /** Closes the guide (finished or skipped): the level stays, and the lesson is counted as seen. */
  endTutorial(): void {
    if (!this.tutorial) return;
    this.tutorial = null;
    this.progress.data.tutorialDone = true;
    this.progress.save();
    this.sfx('click', 0.6);
    this.touch();
  }

  /** True while a step that only explains is on screen: the board and the buttons wait behind it. */
  get tutorialBlocks(): boolean {
    const s = this.tutorialStep;
    return !!s && !s.action && !this.paused;
  }
  openPage(p: Page): void {
    this.page = p;
    this.tutorial = null; // leaving for a menu ends the guide (the lesson can be started again)
    this.pageTime = 0;
    this.confirmErase = false;
    this.state = 'menu';
    this.sfx('click', 0.6);
    this.touch();
  }

  leaveToLevels(): void {
    this.paused = false;
    this.pauseSettings = false;
    this.loadLevel(0); // the board shows behind the menus
    this.openPage('levels');
  }

  /** Back to the title screen, from a level (pause, result) or from the end page. */
  leaveToTitle(): void {
    this.paused = false;
    this.pauseSettings = false;
    this.loadLevel(0);
    this.openPage('title');
  }

  nextAfterWin(): void {
    const next = this.level.tutorial ? 0 : this.levelIndex + 1; // the lesson leads to the first level
    if (next < this.levels.length && !this.levels[next].special) this.startLevel(next);
    else {
      this.loadLevel(0);
      this.openPage('ending');
    }
  }

  setPause(on: boolean): void {
    if (this.paused === on) return;
    this.paused = on;
    if (on) {
      this.cancelDrag();
      this.orbiting = false;
      this.panning = false;
    } else this.pauseSettings = false;
    this.sfx('click', 0.6);
    this.touch();
  }

  // ------------------------------------------------------------------ placing pieces
  private restore(states: PieceState[]): void {
    for (const p of this.board.pieces) this.stage.removePiece(p.id);
    this.board.pieces.length = 0;
    this.selected = null;
    for (const s of states) {
      const p = this.board.add(s);
      this.stage.addPiece(p.id, p.kind, p.rot, p.pos);
    }
    this.updateSelectionMark();
    this.touch();
  }

  undo(): void {
    if (this.state !== 'build' || !this.undoStack.length) return;
    this.redoStack.push(this.board.snapshot());
    this.restore(this.undoStack.pop()!);
    this.sfx('tick');
  }

  redo(): void {
    if (this.state !== 'build' || !this.redoStack.length) return;
    this.undoStack.push(this.board.snapshot());
    this.restore(this.redoStack.pop()!);
    this.sfx('tick');
  }

  clearBoard(): void {
    if (this.state !== 'build') {
      this.backToBuild();
      return;
    }
    if (!this.board.pieces.length) return;
    this.commit(this.board.snapshot());
    this.restore([]);
  }

  /**
   * Turns the piece in hand (or the selected one): `yaw` is the quarter turn on the board (Space), `lay` tips it onto its side (Shift+Space, T).
   * Both really change the piece's geometry: the footprint, the support and the collisions are planned again for the new shape.
   */
  rotateSelected(axis: 'yaw' | 'lay' = 'yaw', back = false): void {
    if (this.drag) {
      const next = stepOrientation(shapeBoxes(this.drag.kind), this.drag.rot, axis, back);
      if (next === this.drag.rot) this.say('Cette pièce a le même aspect dans tous les sens.', 1.5);
      this.drag.rot = next;
      this.sfx('tick');
      this.updateDrag(this.drag.lastX, this.drag.lastY);
      this.touch();
      return;
    }
    const sel = this.selected;
    if (this.state !== 'build' || !sel) {
      this.say(this.state === 'build' ? 'Touchez une pièce posée (ou tenez-en une) pour la tourner.' : 'Revenez à la construction pour tourner une pièce.');
      return;
    }
    const rot = stepOrientation(shapeBoxes(sel.kind), sel.rot, axis, back);
    if (rot === sel.rot) {
      this.say('Cette pièce a le même aspect dans tous les sens.', 1.5);
      return;
    }
    const before = this.board.snapshot();
    const index = this.board.pieces.indexOf(sel);
    this.board.remove(sel);
    const floor = sel.pos.y - extents(sel.kind, sel.rot).y / 2; // it keeps standing on what it stands on
    const r = this.board.planNear(sel.kind, rot, sel.pos.x, sel.pos.z, floor);
    this.board.pieces.splice(index, 0, sel);
    if (!r.ok) {
      this.say(r.why);
      this.sfx('error', 0.5);
      return;
    }
    this.commit(before);
    sel.rot = rot;
    sel.pos = r.pos;
    this.stage.movePiece(sel.id, rot, r.pos);
    this.updateSelectionMark();
    this.sfx('tick');
    this.touch();
  }
  deleteSelected(): void {
    if (this.state !== 'build' || !this.selected) return;
    this.commit(this.board.snapshot());
    this.board.remove(this.selected);
    this.stage.removePiece(this.selected.id);
    this.selected = null;
    this.updateSelectionMark();
    this.touch();
  }

  private updateSelectionMark(): void {
    this.stage.setSelection(this.selected ? { kind: this.selected.kind, rot: this.selected.rot, pos: this.selected.pos } : null);
  }

  // ------------------------------------------------------------------ drag and drop
  startDrag(kind: Kind, rot: number, from: Piece | null, x: number, y: number, touch: boolean): void {
    this.usesTouch = touch;
    const before = this.board.snapshot(); // taken before the piece leaves the board
    this.drag = { kind, rot, from, before, valid: false, pos: v3(0, 0, 0), lastX: x, lastY: y, touch };
    if (from) {
      this.board.remove(from);
      this.stage.setPieceVisible(from.id, false);
    }
    this.stage.clearGhost();
    this.updateDrag(x, y);
    this.touch();
  }

  cancelDrag(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.stage.clearGhost();
    if (d.from) {
      this.board.pieces.push(d.from);
      this.stage.setPieceVisible(d.from.id, true);
      this.selected = d.from;
      this.updateSelectionMark();
    }
    this.touch();
  }

  updateDrag(x: number, y: number): void {
    const d = this.drag;
    if (!d) return;
    d.lastX = x;
    d.lastY = y;
    const py = d.touch ? y - 90 : y; // a finger hides what is under it: the piece is held a little above the fingertip
    const ext = extents(d.kind, d.rot);
    let hint: Vec3;
    const hit = this.stage.pick(x, py);
    if (hit) {
      hint = { ...hit.point };
      if (Math.abs(hit.normal.y) < 0.5) {
        hint.x += (hit.normal.x * ext.x) / 2; // beside what it touches
        hint.z += (hit.normal.z * ext.z) / 2;
      }
    } else {
      const g = this.stage.groundPoint(x, py);
      if (!g) return;
      hint = g;
    }
    // the piece the goal asks for is drawn to the zone when it is brought near it: a bridge over a narrow gap cannot be aimed at by hand
    const goal = this.level.goal;
    if (goal && goal.with === d.kind && Math.abs(hint.x - goal.cx) < 1.3 && Math.abs(hint.z - goal.cz) < 1.3) {
      hint.x = goal.cx;
      hint.z = goal.cz;
    }
    const plan = this.board.planAt(d.kind, d.rot, hint.x, hint.z, hint.y);
    d.valid = plan.ok;
    d.pos = plan.pos;
    this.stage.setGhost(d.kind, d.rot, plan.ok);
    this.stage.placeGhost(plan.pos);
    if (!plan.ok) this.say(plan.why, 0.5);
  }

  endDrag(x: number, y: number, overUi: boolean): void {
    const d = this.drag;
    if (!d) return;
    this.updateDrag(x, y);
    const ok = d.valid && !overUi;
    const validAtDrop = d.valid;
    this.drag = null;
    this.stage.clearGhost();
    if (!ok) {
      if (d.from) {
        this.board.pieces.push(d.from);
        this.stage.setPieceVisible(d.from.id, true);
        this.selected = d.from;
        this.updateSelectionMark();
      }
      if (!overUi && d.from) this.say('Pièce remise en place');
      if (!overUi && !validAtDrop) this.sfx('error', 0.5);
      this.touch();
      return;
    }
    this.commit(d.before);
    if (d.from) {
      d.from.rot = d.rot;
      d.from.pos = d.pos;
      this.board.pieces.push(d.from);
      this.stage.movePiece(d.from.id, d.rot, d.pos);
      this.stage.setPieceVisible(d.from.id, true);
      this.selected = d.from;
      this.placed(d.from);
    } else {
      const piece = this.board.add({ kind: d.kind, rot: d.rot, pos: d.pos });
      this.stage.addPiece(piece.id, piece.kind, piece.rot, piece.pos);
      this.selected = piece;
      this.placed(piece);
    }
    this.updateSelectionMark();
    this.say('');
  }

  private placed(p: Piece): void {
    this.sfx('place', 0.8, 0.94 + Math.random() * 0.12);
    this.stage.placed(p.id, p.kind, p.rot, p.pos);
  }

  /** Plays one step of a known solution as the pointer would have (tests, the hint checker): true when it could be placed. */
  dropNear(step: Step): boolean {
    if (this.state !== 'build') return false;
    const r = this.board.planAt(step.kind, step.rot, step.x, step.z, step.floor ?? Infinity);
    if (!r.ok) return false;
    this.commit(this.board.snapshot());
    const piece = this.board.add({ kind: step.kind, rot: step.rot, pos: r.pos });
    this.stage.addPiece(piece.id, piece.kind, piece.rot, piece.pos);
    this.selected = piece;
    this.placed(piece);
    this.updateSelectionMark();
    return true;
  }

  // ------------------------------------------------------------------ simulation
  startSim(): void {
    if (this.state !== 'build' || this.drag) return;
    if (!this.board.pieces.length) {
      this.say('Posez au moins une pièce.');
      return;
    }
    this.runStart = this.board.snapshot();
    this.selected = null;
    this.updateSelectionMark();
    this.stage.settlePulses();
    this.ids = this.board.pieces.map((p) => p.id);
    this.sim = new Sim(this.level, this.runStart, {
      onImpact: (s) => {
        this.sfx('knock', 0.25 + 0.6 * s, 0.85 + Math.random() * 0.3);
        this.stage.orbit.shake(0.05 * s);
      },
    });
    this.stage.followSim(this.sim, this.ids);
    this.sfx('click', 0.7);
    this.simTime = 0;
    this.acc = 0;
    this.state = 'run';
    this.say('');
    this.touch();
  }

  private endSim(): void {
    this.stage.stopFollowing();
    if (this.sim) {
      this.sim.dispose();
      this.sim = null;
    }
  }

  private stepPhysics(dt: number): void {
    const sim = this.sim;
    if (!sim || this.state !== 'run') return;
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= STEP && n < 12) {
      this.acc -= STEP;
      n++;
      sim.step();
      this.simTime = sim.time;
      if (sim.finished) {
        this.finish();
        return;
      }
    }
  }

  private finish(): void {
    const sim = this.sim!;
    const live = sim.pieceBounds();
    this.outcome = this.board.evaluate(live, sim.settled, sim.fell);
    this.state = 'done';
    this.message = '';
    this.conclude();
    this.touch();
  }

  /** Top of the highest piece: where the pieces were put while building, where they really are once the physics has them. */
  liveHeight(): number {
    if (this.state !== 'run' && this.state !== 'done') return this.board.heightOf();
    let h = 0;
    for (const p of this.board.pieces) {
      const b = this.stage.viewBounds(p.id);
      if (b && this.board.qualifies(p.kind, b)) h = Math.max(h, b.max.y);
    }
    return h;
  }

  backToBuild(): void {
    this.shardTaken = false;
    this.stage.shardVisible = true;
    this.endSim();
    this.stage.buildObstacles(); // the ones that moved go back where the level has them
    if (this.runStart) this.restore(this.runStart);
    this.state = 'build';
    this.outcome = null;
    this.say('');
    this.touch();
  }

  /** Whether a piece, wherever it stands now, holds the shard (a little room is allowed around the piece). */
  private shardTouched(parts: Box[]): boolean {
    const s = this.level.shard;
    if (!s) return false;
    return parts.some((b) => b.expanded(0.24).contains(s));
  }

  /** The verdict is in: the medals and achievements it earns, the sound, the burst, the tremor. */
  private conclude(): void {
    this.resultTime = 0;
    this.result = emptyResult();
    const out = this.outcome!;
    this.result.won = out.won;
    if (this.level.sandbox) return;
    if (this.level.tutorial) {
      // the lesson has a verdict and a little celebration, but no medals and no record
      this.result.pieces = this.board.pieces.length;
      if (!out.won) {
        this.sfx('fail');
        this.stage.orbit.shake(0.1);
        return;
      }
      this.sfx('win');
      const g = this.level.goal!;
      this.stage.burst(v3(g.cx, g.height + 0.4, g.cz), this.progress.theme.accent);
      this.stage.orbit.push(0.93);
      return;
    }
    if (!out.won) {
      this.sfx('fail');
      this.stage.orbit.shake(0.14);
      return;
    }
    const p = this.progress;
    const i = this.levelIndex;
    const rec = p.rec(i);
    const wasDone = rec.done, wasEco = p.economical(i), wasShard = rec.shard;
    const parts: Box[] = [];
    for (const piece of this.board.pieces) parts.push(...this.stage.partBounds(piece.id));
    const shard = this.shardTouched(parts);
    const r = this.result;
    r.pieces = this.board.pieces.length;
    r.par = this.level.par;
    r.achievements = p.record(i, r.pieces, shard);
    r.shard = shard;
    r.eco = r.pieces <= r.par; // this run (the medal itself is kept once earned)
    r.newDone = !wasDone;
    r.newEco = r.eco && !wasEco;
    r.newShard = shard && !wasShard;
    const campaign = this.levels.map((l, k) => (l.special ? -1 : k)).filter((k) => k >= 0);
    r.total = campaign.length;
    r.doneCount = campaign.filter((k) => p.rec(k).done).length;
    const next = campaign[campaign.indexOf(i) + 1];
    if (r.newDone && next !== undefined && !wasDone) r.unlocked = next;
    p.data.tutorialDone = true;
    p.save();
    this.sfx('win');
    if (shard) {
      this.sfx('shard', 0.8);
      this.shardTaken = true;
      this.stage.shardVisible = false;
    }
    const g = this.level.goal!;
    let accent = p.theme.accent;
    if (accent[0] + accent[1] + accent[2] > 2.7) accent = [0.62, 0.95, 0.78];
    this.stage.burst(v3(g.cx, g.height + 0.4, g.cz), accent);
    this.stage.orbit.push(0.93);
    if (r.unlocked >= 0 && !p.data.freeMode) {
      this.toasts.push(`Niveau ${campaignNumber(this.levels, r.unlocked)} débloqué`);
      this.sfx('unlock', 0.6);
    }
    for (const a of r.achievements) {
      this.toasts.push('Accomplissement : ' + ACHIEVEMENTS[a].name);
      this.sfx('unlock', 0.7);
    }
  }

  // ------------------------------------------------------------------ settings
  applySettings(): void {
    const d = this.progress.data;
    this.audio.sound = d.sound;
    this.audio.volume = d.volume;
    this.audio.apply();
    this.stage.orbit.invert = d.invert;
    this.progress.save();
    this.touch();
  }

  setTheme(t: number): void {
    if (!this.progress.themeOpen(t)) return;
    this.progress.data.theme = t;
    this.progress.save();
    this.stage.setTheme(this.progress.theme);
    this.sfx('click', 0.6);
    this.touch();
  }

  eraseProgress(): void {
    this.progress.erase();
    this.stage.setTheme(this.progress.theme);
    this.confirmErase = false;
    this.saveNote = '';
    this.touch();
  }

  /** A line under the save buttons in the settings: what the last export or import did. */
  saveNote = '';

  /** Puts an exported save's progress in place of the current one. The page shows the outcome in `saveNote`. */
  importSave(text: string): boolean {
    const r = this.progress.importJson(text);
    this.saveNote = r.ok ? 'Progression importée.' : r.reason;
    if (r.ok) {
      this.stage.setTheme(this.progress.theme);
      this.applySettings();
    }
    this.touch();
    return r.ok;
  }

  // ------------------------------------------------------------------ frame
  /** Called every animation frame with the seconds since the last one. */
  tick(dt: number): void {
    this.frames++;
    // fade
    if (this.pending) {
      this.fade = Math.min(1, this.fade + dt / 0.16);
      if (this.fade >= 1) {
        const a = this.pending;
        this.pending = null;
        a();
      }
    } else this.fade = Math.max(0, this.fade - dt / 0.3);
    this.pageTime += dt;
    this.introTime += dt;
    if (this.state === 'done') this.resultTime += dt;
    if (this.toastTime > 0) this.toastTime -= dt;
    else if (this.toasts.length) {
      this.toastText = this.toasts.shift()!;
      this.toastTime = 3.2;
      this.touch();
    }
    if (this.message && performance.now() > this.messageUntil) {
      this.message = '';
      this.touch();
    }
    if (!this.paused) this.stepPhysics(dt);
    // the guide moves on by itself shortly after a gesture it asked for (the last step waits for "Terminer")
    if (this.tutorial && this.tutorialAuto && !this.paused && !this.busy && this.tutorial.step < TUTORIAL.length - 1 && this.tutorialReady) {
      this.tutorialReadyTime += dt;
      if (this.tutorialReadyTime >= 0.9) this.tutorialNext();
    } else this.tutorialReadyTime = 0;
    // the zone brightens while the goal is met
    if (this.level.goal && this.state !== 'menu') this.stage.setZoneMet(this.liveHeight() >= this.level.goal.height - REACH);
    else this.stage.setZoneMet(false);
    if (this.state === 'menu') this.stage.orbit.drift(this.page === 'title' || this.page === 'splash' ? 3 : 1.5, dt);
    this.stage.goalVisible = this.state !== 'menu';
    this.stage.glideGhost(dt);
    this.stage.render(dt);
  }

  // ------------------------------------------------------------------ pointer and keys (the interface forwards the events)
  /** Is the point over a piece of interface? Set by the interface layer. */
  overUi: (x: number, y: number) => boolean = () => false;

  pointerDown(id: number, x: number, y: number, button: number, touch: boolean): void {
    this.audio.unlock();
    this.usesTouch = touch;
    if (this.paused || this.busy) return;
    this.pointers.set(id, { x, y });
    if (this.pointers.size === 2) {
      // two fingers: pinch to zoom (the first finger alone is the mouse)
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.orbiting = false;
      if (this.drag) this.cancelDrag();
      return;
    }
    if (this.pointers.size > 2) return;
    if (button === 1 || button === 2) {
      this.panning = true;
      return;
    }
    if (button !== 0) return;
    if (this.state === 'build') {
      const hit = this.stage.pick(x, y);
      if (hit && hit.pieceId !== undefined) {
        const piece = this.board.pieces.find((p) => p.id === hit.pieceId);
        if (piece) {
          this.selected = piece;
          this.startDrag(piece.kind, piece.rot, piece, x, y, touch);
          return;
        }
      }
      this.selected = null;
      this.updateSelectionMark();
      this.touch();
    }
    this.orbiting = true; // nothing to take hold of: the drag turns the view
  }

  pointerMove(id: number, x: number, y: number, dx: number, dy: number): void {
    if (this.paused || this.busy) return;
    const p = this.pointers.get(id);
    if (p) {
      p.x = x;
      p.y = y;
    }
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const now = Math.hypot(a.x - b.x, a.y - b.y);
      this.stage.orbit.zoom(-(now - this.pinchDist) * 0.06);
      this.pinchDist = now;
      return;
    }
    if (this.drag) this.updateDrag(x, y);
    else if (this.orbiting) {
      this.stage.orbit.orbit(dx, dy);
      this.orbitMoved += Math.abs(dx) * 0.3;
    } else if (this.panning) this.stage.orbit.pan(dx, dy);
  }

  pointerUp(id: number, x: number, y: number): void {
    this.pointers.delete(id);
    if (this.pointers.size < 2) this.pinchDist = 0;
    if (this.drag) this.endDrag(x, y, this.overUi(x, y));
    this.orbiting = false;
    this.panning = false;
  }

  wheel(deltaY: number): void {
    if (this.paused || this.busy) return;
    this.stage.orbit.zoom(deltaY * 0.02);
  }

  /** Returns true when the key was used. */
  key(e: { key: string; code: string; ctrlKey: boolean; metaKey: boolean; shiftKey?: boolean }): boolean {
    this.audio.unlock();
    this.usesTouch = false;
    const ctrl = e.ctrlKey || e.metaKey;
    if ((this.paused && e.key !== 'Escape') || this.busy) return false;
    if (this.tutorialBlocks && e.key !== 'Escape') return false; // an explaining step: only Suivant moves on
    switch (e.key) {
      case ' ':
        // Space turns the piece (Shift+Space tips it onto its side); once the run has started it takes you back to building
        if (this.state === 'build') this.rotateSelected(e.shiftKey ? 'lay' : 'yaw');
        else if (this.state === 'run' || this.state === 'done') this.backToBuild();
        else return false;
        return true;
      case 'r':
      case 'R':
        if (ctrl) return false;
        if (this.state !== 'build') return false;
        this.rotateSelected('yaw', e.shiftKey);
        return true;
      case 't':
      case 'T':
      case 'f':
      case 'F':
        if (ctrl || this.state !== 'build') return false;
        this.rotateSelected('lay', e.shiftKey);
        return true;
      case 'Enter':
        if (this.state === 'build') this.startSim();
        else if (this.state === 'run' || this.state === 'done') this.backToBuild();
        else return false;
        return true;      case 'z':
      case 'Z':
        if (!ctrl) return false;
        this.undo();
        return true;
      case 'y':
      case 'Y':
        if (!ctrl) return false;
        this.redo();
        return true;
      case 'Delete':
      case 'Backspace':
        this.deleteSelected();
        return true;
      case 'ArrowLeft':
        this.stage.orbit.turnBy(45);
        this.orbitMoved += 45;
        return true;
      case 'ArrowRight':
        this.stage.orbit.turnBy(-45);
        this.orbitMoved += 45;
        return true;
      case 'Home':
        this.stage.orbit.resetView();
        return true;
      case 'Escape':
        if (this.drag) this.cancelDrag();
        else if (this.pauseView !== 'menu') {
          this.pauseView = 'menu';
          this.confirmErase = false;
          this.touch();
        } else if (this.state !== 'menu') this.setPause(!this.paused);
        return true;
      default:
        return false;
    }
  }

  // ------------------------------------------------------------------ for the interface and the tests
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get remainingByKind(): Array<{ kind: Kind; left: number; total: number }> {
    return this.level.available().map((k) => ({ kind: k, left: this.board.remaining(k), total: this.level.stockOf(k) }));
  }

  /** The bodies' masses are the shapes' volumes; exposed for the debug panel. */
  volume(kind: Kind): number {
    return volumeOf(kind);
  }

  /** The boxes of a fixed piece of the level (the tutorial points at it). */
  worldPartsOfObstacle(i: number): Box[] {
    const o = this.level.obstacles[i];
    return worldParts(o.kind, o.rot, obstaclePos(o));
  }

  worldPartsOf(p: Piece): Box[] {
    return worldParts(p.kind, p.rot, p.pos);
  }

  /** Development only: runs the physics to its verdict at once instead of in real time. */
  debugFinish(): void {
    const sim = this.sim;
    if (!sim || this.state !== 'run') return;
    while (!sim.finished && sim.time < 30) sim.step();
    this.simTime = sim.time;
    this.finish();
  }

  /** Debug panel only: ends the run with a forced verdict, to test the screens that follow. */
  debugForce(won: boolean): void {
    if (this.state === 'menu') return;
    if (this.state === 'build' && this.board.pieces.length === 0) this.say('Posez une pièce avant de forcer.');
    if (this.state === 'build') this.startSim();
    if (!this.sim) return;
    this.outcome = { won, lines: [won ? '[OK]  Zone atteinte (forcé)' : '[X]  Échec forcé'], top: 0, reached: won, stands: won };
    this.state = 'done';
    this.conclude();
    this.touch();
  }

  /** Plays a known solution through the same code as a hand would: for the tests, the debug panel and the hint checker. */
  playSolution(levelIndex: number, solution: number): boolean {
    this.startLevel(levelIndex);
    for (const s of this.levels[levelIndex].solutions[solution]) if (!this.dropNear(s)) return false;
    return true;
  }
}
