// The interface: pages, HUD, result card, pause. Plain DOM over the canvas; every section is redrawn only when what it shows has changed.
import { describeObjective } from '../core/board';
import { nameOf, type Kind } from '../core/kinds';
import { campaignNumber, type Game } from '../game/game';
import { ACHIEVEMENTS, THEMES } from '../game/save';
import { renderIcons } from '../render/pieces';
import { TUTORIAL, say } from '../game/tutorial';
import { buildLabel } from '../buildinfo';
import { Box3, Vector3 } from 'three';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const num = (n: number): string => (Math.round(n * 10) / 10).toString();

const ICONS: Record<string, string> = {
  pause: '<svg viewBox="0 0 16 16"><path d="M5 3v10M11 3v10"/></svg>',
  undo: '<svg viewBox="0 0 16 16"><path d="M6 3 2.5 6.5 6 10M3 6.5h6.5a4 4 0 0 1 0 8H7"/></svg>',
  redo: '<svg viewBox="0 0 16 16"><path d="M10 3l3.5 3.5L10 10M13 6.5H6.5a4 4 0 0 0 0 8H9"/></svg>',
  rotate: '<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.8-3.8M13 2v3.5H9.5"/></svg>',
  lay: '<svg viewBox="0 0 16 16"><path d="M2.5 10.2 8 13.2l5.5-3-5.5-3z"/><path d="M8 7.2V1.8M5.8 4 8 1.8 10.2 4"/></svg>',
  play: '<svg viewBox="0 0 16 16"><path d="M5 2.8v10.4L13.2 8z"/></svg>',
  stop: '<svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9"/></svg>',
  reset: '<svg viewBox="0 0 16 16"><path d="M3 4h10M6 4V2.5h4V4M4.5 4l.6 9h5.8l.6-9"/></svg>',
};

const medal = (on: boolean, fresh = false): string => `<i class="medal${on ? ' on' : ''}${fresh ? ' new' : ''}"></i>`;

export class Ui {
  private root: HTMLElement;
  private keys = new Map<string, string>();
  private icons: Record<Kind, string> | null = null;
  private iconTheme = -1;
  private el: Record<string, HTMLElement> = {};
  private counter!: HTMLElement;

  constructor(
    private game: Game,
    root: HTMLElement,
  ) {
    this.root = root;
    root.innerHTML = `
      <div id="splash" class="ui-block"></div>
      <div id="page"></div>
      <div id="hud">
        <div class="top-left"></div>
        <div class="tray ui-block"></div>
        <div class="actions"></div>
        <div class="counter" hidden></div>
        <div class="message hidden"></div>
        <div class="banner-slot"></div>
      </div>
      <div id="tuto"><div class="catch ui-block"></div><div class="spot"></div><div class="tcard ui-block"></div></div>
      <div class="veil" id="result"></div>
      <div class="veil" id="pause"></div>
      <div id="toast-slot"></div>
      <div id="fade"></div>`;
    for (const id of ['splash', 'page', 'hud', 'result', 'pause', 'fade', 'toast-slot']) this.el[id] = root.querySelector('#' + id) as HTMLElement;
    this.el.topLeft = root.querySelector('.top-left') as HTMLElement;
    this.el.tray = root.querySelector('.tray') as HTMLElement;
    this.el.actions = root.querySelector('.actions') as HTMLElement;
    this.el.tuto = root.querySelector('#tuto') as HTMLElement;
    this.el.tcard = root.querySelector('.tcard') as HTMLElement;
    this.el.spot = root.querySelector('.spot') as HTMLElement;
    this.el.catch = root.querySelector('#tuto .catch') as HTMLElement;
    this.el.message = root.querySelector('.message') as HTMLElement;
    this.el.banner = root.querySelector('.banner-slot') as HTMLElement;
    this.counter = root.querySelector('.counter') as HTMLElement;

    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('input', (e) => this.onInput(e));
    root.addEventListener('change', (e) => this.onChange(e));
    root.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    game.overUi = (x, y) => !!document.elementFromPoint(x, y)?.closest('.ui-block');
  }

  /** Redraws a section only when its key changed. */
  private section(name: string, key: string, draw: () => void): void {
    if (this.keys.get(name) === key) return;
    this.keys.set(name, key);
    draw();
  }

  // ------------------------------------------------------------------ per frame
  sync(): void {
    const g = this.game;
    const d = g.progress.data;
    this.root.style.setProperty('--accent', this.accent());

    // splash
    const splashOn = g.page === 'splash' && g.state === 'menu';
    this.section('splash', String(splashOn), () => {
      this.el.splash.className = 'ui-block' + (splashOn ? ' on' : '');
      this.el.splash.innerHTML = splashOn
        ? '<div class="studio">TWO <b>TONE</b></div><div class="sub">INDEPENDENT GAME STUDIO</div><div class="sub">PRESENTS</div><div class="tag">A GAME ABOUT BALANCE</div>'
        : '';
    });

    // pages
    const pageOn = g.state === 'menu' && g.page !== 'splash';
    const pageKey = [pageOn, g.page, g.confirmErase, g.saveNote, d.sound, d.invert, d.freeMode, d.theme, d.achievements, JSON.stringify(d.levels)].join('|');
    this.section('page', pageKey, () => this.drawPage(pageOn));

    // hud
    const inGame = g.state !== 'menu';
    this.el.hud.classList.toggle('on', inGame);
    if (inGame) this.drawHud();

    // result and pause
    const resultOn = g.state === 'done' && !g.paused && g.resultTime > 0.55 && !g.level.sandbox;
    this.drawTutorial();
    this.section('result', [resultOn, g.version].join('|'), () => this.drawResult(resultOn));
    this.el.hud.classList.toggle('resulting', resultOn);
    const pauseOn = g.paused;
    this.section('pause', [pauseOn, g.pauseView, d.sound, d.invert, d.freeMode, g.confirmErase, g.saveNote].join('|'), () => this.drawPause(pauseOn));
    if (pauseOn && g.pauseView === 'rewards') this.markThemes(this.el.pause);

    // toast
    this.section('toast', g.toastTime > 0 ? g.toastText + g.toastTime.toFixed(0) : '', () => {
      this.el['toast-slot'].innerHTML = g.toastTime > 0 && g.toastText ? `<div class="toast" data-k="${Math.random()}">${esc(g.toastText)}</div>` : '';
    });
    this.el.fade.style.opacity = String(g.fade);
    this.placeCounter();
  }

  private accent(): string {
    let a = this.game.progress.theme.accent;
    if (a[0] + a[1] + a[2] > 2.7) a = [0.62, 0.95, 0.78];
    return `rgb(${Math.round(a[0] * 255)},${Math.round(a[1] * 255)},${Math.round(a[2] * 255)})`;
  }

  // ------------------------------------------------------------------ pages
  private drawPage(on: boolean): void {
    const g = this.game;
    const el = this.el.page;
    el.className = on ? `on ${g.page}` : '';
    if (!on) {
      el.innerHTML = '';
      return;
    }
    const p = g.progress;
    let html = '';
    switch (g.page) {
      case 'title':
        html = `<div class="panel title-wrap ui-block-none">
          <div class="logo caps">Monolith</div>
          <div class="menu">
            <button class="btn ui-block${p.data.tutorialDone ? '' : ' primary'}" data-act="tutorial">Tutoriel</button>
            <button class="btn ui-block${p.data.tutorialDone ? ' primary' : ''}" data-act="page" data-p="levels">Niveaux</button>
            <button class="btn ui-block" data-act="page" data-p="rewards">Récompenses</button>
            <button class="btn ui-block" data-act="page" data-p="settings">Réglages</button>
          </div>
          <div class="small foot">Two Tone &nbsp;·&nbsp; première édition</div></div>`;
        break;
      case 'levels': {
        const cards = g.levels
          .map((l, i) => {
            if (l.special) return '';
            const open = p.unlocked(i);
            const max = p.maxMedalsOf(i);
            const m = p.medals(i);
            const ms = Array.from({ length: max }, (_, k) => medal(k < m)).join('');
            const dots = Array.from({ length: 10 }, (_, k) => `<i class="${k < l.rating ? 'on' : ''}"></i>`).join('');
            return `<button class="card ui-block${open ? '' : ' locked'}" data-act="level" data-i="${i}" ${open ? '' : 'disabled aria-disabled="true"'}>
              <span class="num">${String(i + 1).padStart(2, '0')}</span>
              <span class="name">${esc(l.title)}</span>
              <span class="place">${esc(l.subtitle)}</span>
              <span class="row"><span class="medals">${ms}</span><span class="dots" title="Difficulté">${dots}</span></span></button>`;
          })
          .join('');
        const sb = g.levels.findIndex((l) => l.sandbox);
        html = `<div class="panel"><h1>NIVEAUX</h1>
          <div class="small count">${p.totalMedals} / ${p.maxMedals} médailles</div>
          <div class="cards">
            <button class="card lesson ui-block" data-act="tutorial"><span class="num">00</span><span class="name">Tutoriel</span><span class="place">Les gestes de base, pas à pas</span><span class="row"><span class="small">${p.data.tutorialDone ? 'Vu' : 'Pour commencer'}</span></span></button>
            ${cards}
            <button class="card sandbox ui-block" data-act="level" data-i="${sb}"><span class="name">Bac à sable</span><span class="place">Construire librement, sans objectif.</span></button></div>
          <div class="nav"><button class="btn ui-block" data-act="page" data-p="title">Retour</button></div></div>`;
        break;
      }
      case 'settings':
        html = `<div class="panel" style="max-width:640px"><h1>RÉGLAGES</h1>${this.settingsRows()}
          <div class="help">Glisser le fond : tourner la vue · clic droit : déplacer · molette ou pincement : zoom<br>Espace : tourner la pièce · T ou Maj+Espace : la coucher / la dresser · Entrée : simuler · Ctrl+Z / Ctrl+Y : annuler / rétablir · Échap : pause</div>
          <div class="nav"><button class="btn ui-block" data-act="page" data-p="title">Retour</button></div></div>`;
        break;
      case 'rewards':
        html = `<div class="panel" style="max-width:720px"><h1>RÉCOMPENSES</h1>${this.rewardsBody()}
          <div class="nav"><button class="btn ui-block" data-act="page" data-p="title">Retour</button></div></div>`;
        break;
      case 'ending': {
        const missing = p.totalMedals < p.maxMedals;
        html = `<div class="panel" style="max-width:560px"><h1>MONOLITH</h1>
          <div class="ending-text"><b>Le monolithe tient debout.</b>${missing ? "Des médailles manquent : l'économie de pièces, les éclats cachés." : 'Rien ne manque.'}</div>
          <div class="nav"><button class="btn ui-block primary" data-act="page" data-p="levels">Revoir les niveaux</button><button class="btn ui-block" data-act="page" data-p="title">Menu principal</button></div>
          <div class="small" style="text-align:center">Two Tone · merci d'avoir joué</div></div>`;
        break;
      }
      default:
        break;
    }
    el.innerHTML = html;
  }

  /** The looks and the achievements: the body of the rewards page, and of the same card in the pause menu. */
  private rewardsBody(): string {
    const p = this.game.progress;
    const d = p.data;
    const themes = THEMES.map((t, i) => {
      const open = p.themeOpen(i);
      const c = `rgb(${t.tint.map((v) => Math.round(v * 232)).join(',')})`;
      const a = `rgb(${t.accent.map((v) => Math.round(v * 255)).join(',')})`;
      return `<button class="theme ui-block${open ? '' : ' locked'}${d.theme === i ? ' current' : ''}" data-act="theme" data-i="${i}" ${open ? '' : 'disabled'}>
            <span class="sw" style="background:${c}"><i style="background:${a}"></i></span>
            <span class="caps" style="font-size:12px">${t.name}</span>
            <span class="small">${this.themeLabel(i)}</span></button>`;
    }).join('');
    const ach = ACHIEVEMENTS.map((a, i) => `<div class="a${p.has(i) ? '' : ' off'}">${medal(p.has(i))}<div><b>${esc(a.name)}</b><span>${esc(a.text)}</span></div></div>`).join('');
    return `<div class="small count">${p.totalMedals} / ${p.maxMedals} médailles</div>
          <div class="themes">${themes}</div><div class="ach">${ach}</div>`;
  }

  private themeLabel(i: number): string {
    const p = this.game.progress;
    return p.themeOpen(i) ? (p.data.theme === i ? 'Choisi' : 'Ouvert') : THEMES[i].medals + ' médailles';
  }

  /** Marks the chosen look in place: the card is not redrawn, so the scene behind can be watched changing. */
  private markThemes(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('.theme').forEach((b) => {
      const i = Number(b.dataset.i);
      b.classList.toggle('current', this.game.progress.data.theme === i);
      const label = b.querySelector('.small');
      const text = this.themeLabel(i);
      if (label && label.textContent !== text) label.textContent = text;
    });
  }

  /** Hands the save to the player as a file. The progress stays tied to this browser and this site: the file is how it travels. */
  private exportSave(): void {
    const g = this.game;
    try {
      const blob = new Blob([g.progress.exportJson()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `monolith-save-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      g.saveNote = 'Fichier de sauvegarde créé.';
    } catch {
      g.saveNote = "L'export a échoué dans ce navigateur.";
    }
    g.touch();
  }

  /** Asks for a save file and puts its progress in place of the current one (the replaced progress is kept aside). */
  private importSave(): void {
    const g = this.game;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      void file
        .text()
        .then((text) => g.importSave(text))
        .catch(() => {
          g.saveNote = 'Lecture du fichier impossible.';
          g.touch();
        });
    });
    input.click();
  }

  private settingsRows(): string {
    const g = this.game;
    const d = g.progress.data;
    const tog = (act: string, on: boolean, a = 'Oui', b = 'Non'): string => `<button class="toggle ui-block${on ? ' on' : ''}" data-act="${act}">${on ? a : b}</button>`;
    return `<div class="rows ui-block">
      <div class="r"><span>Son</span>${tog('sound', d.sound, 'Activé', 'Coupé')}</div>
      <div class="r"><span>Volume</span><input type="range" min="0" max="100" value="${Math.round(d.volume * 100)}" data-input="volume" aria-label="Volume"></div>
      <div class="r"><span>Rotation de la vue</span>${tog('invert', d.invert, 'Inversée', 'Normale')}</div>
      <div class="r"><span>Niveaux</span>${tog('free', d.freeMode, 'Tous ouverts', 'Progressifs')}</div>
      <div class="r"><span>Sauvegarde</span><span class="pair"><button class="toggle ui-block" data-act="export-save">Exporter</button><button class="toggle ui-block" data-act="import-save">Importer</button></span></div>
      ${g.saveNote ? `<div class="r note" role="status"><span>${g.saveNote}</span></div>` : ''}
      <div class="r"><span>Progression</span><button class="toggle danger${g.confirmErase ? ' armed' : ''} ui-block" data-act="erase" style="min-width:230px">${g.confirmErase ? 'Cliquer encore : effacer' : 'Effacer la progression'}</button></div>
      <div class="r build"><span>Version</span><span class="ver">${buildLabel()}</span></div>
    </div>`;
  }

  // ------------------------------------------------------------------ hud
  private drawHud(): void {
    const g = this.game;
    const p = g.progress;
    const l = g.level;
    const rec = p.rec(g.levelIndex);
    const live = g.liveHeight();
    const goal = l.goal;
    const met = !!goal && live >= goal.height - 0.02;

    // top left: pause + objectives
    const okey = [g.levelIndex, g.state, met, g.board.pieces.length, rec.shard, g.shardTaken, rec.done, rec.best].join('|');
    this.section('objectives', okey, () => {
      let obj = '';
      if (l.sandbox) obj = '<div class="objectives ui-block"><span class="t caps small">Bac à sable</span><div class="o dim">Construisez librement. Entrée : simuler.</div></div>';
      else if (goal) {
        const eco = g.board.pieces.length <= l.par && rec.done ? true : false;
        const shardLine = l.shard ? (rec.shard || g.shardTaken ? `<div class="o done">${medal(true)}<span>Éclat saisi</span></div>` : `<div class="o dim">${medal(false)}<span>Un éclat flotte sur ce plateau</span></div>`) : '';
        obj = `<div class="objectives ui-block"><span class="t caps small">Objectifs</span>
          <div class="o${met ? ' done' : ''}">${medal(met)}<span>${esc(describeObjective(goal))}</span></div>
          ${l.tutorial ? '' : `<div class="o dim">${medal(p.economical(g.levelIndex) || eco)}<span>Économe : ${l.par} pièces ou moins <b style="font-weight:400;color:var(--paper)">(${g.board.pieces.length})</b></span></div>`}
          ${shardLine}
          ${l.hint ? `<div class="hint">${esc(l.hint)}</div>` : ''}</div>`;
      }
      this.el.topLeft.innerHTML = `<button class="icon-btn ui-block" data-act="pause" aria-label="Pause">${ICONS.pause}</button>${obj}`;
    });

    // tray
    if (this.iconTheme !== p.data.theme || !this.icons) {
      this.icons = renderIcons(p.theme);
      this.iconTheme = p.data.theme;
      this.keys.delete('tray');
    }
    const tkey = g.remainingByKind.map((r) => r.kind + r.left).join(',') + '|' + g.state + '|' + g.levelIndex + '|' + this.iconTheme;
    this.section('tray', tkey, () => {
      this.el.tray.innerHTML = g.remainingByKind
        .map((r) => `<button class="cell ui-block${r.left <= 0 || g.state !== 'build' ? ' empty' : ''}" data-kind="${r.kind}" aria-label="${nameOf(r.kind)}"><span class="nm">${nameOf(r.kind)}</span><img src="${this.icons![r.kind]}" alt="" draggable="false"><span class="n">×${r.left}</span></button>`)
        .join('');
    });

    // actions
    const running = g.state === 'run' || g.state === 'done';
    const akey = [g.state, g.version, g.selected ? 1 : 0].join('|');
    this.section('actions', akey, () => {
      const b = (act: string, icon: string, label: string, enabled = true, main = false, key = ''): string =>
        `<button class="dia ui-block${main ? ' main' : ''}" data-act="${act}" aria-label="${label}"${key ? ` title="${label} (${key})"` : ''}${enabled ? '' : ' disabled'}><span class="sq">${ICONS[icon]}</span><span class="l">${label}</span></button>`;
      const building = g.state === 'build';
      this.el.actions.innerHTML =
        b('undo', 'undo', 'Annuler', building && g.canUndo) +
        b('rotate', 'rotate', 'Tourner', building, false, 'Espace') +
        b('lay', 'lay', 'Coucher', building, false, 'T') +
        b('sim', running ? 'stop' : 'play', running ? 'Arrêter' : 'Simuler', true, true) +
        b('redo', 'redo', 'Rétablir', building && g.canRedo) +
        b('reset', 'reset', 'Réinitialiser');
    });

    // message
    const msg = g.message;
    this.section('message', msg, () => {
      this.el.message.textContent = msg;
      this.el.message.classList.toggle('hidden', !msg);
    });

    // intro banner
    const bannerOn = g.introTime < 3.4 && !g.level.special && g.state !== 'menu';
    this.section('banner', bannerOn ? 'on' + g.levelIndex + Math.floor(g.version / 100000) : 'off', () => {
      this.el.banner.innerHTML = bannerOn
        ? `<div class="banner"><span class="n">NIVEAU ${String(g.levelIndex + 1).padStart(2, '0')}</span><span class="t">${esc(l.title)}</span><span class="s">${esc(l.subtitle)}</span></div>`
        : '';
    });
    if (g.introTime >= 3.4 && this.keys.get('banner') !== 'off') this.keys.set('banner', '');

    this.counterState = { goal: goal ? goal.height : 0, live, met, show: !!goal && g.state !== 'menu' && !g.paused };
  }

  private counterState = { goal: 0, live: 0, met: false, show: false };

  /** The "n / goal" label stays above the zone, whichever way the view is turned. */
  private placeCounter(): void {
    const c = this.counterState;
    const g = this.game;
    const goal = g.level.goal;
    if (!c.show || !goal) {
      this.counter.hidden = true;
      return;
    }
    this.counter.hidden = false;
    const pt = g.stage.project({ x: goal.cx, y: goal.height + 0.1, z: goal.cz });
    this.counter.style.transform = `translate(${Math.round(pt.x)}px, ${Math.round(pt.y)}px) translate(-50%, -150%)`;
    this.counter.style.left = '0px';
    this.counter.style.top = '0px';
    const text = `${num(Math.min(c.live, 99))} / ${num(c.goal)}`;
    if (this.counter.textContent !== text) this.counter.textContent = text;
    this.counter.classList.toggle('met', c.met);
  }

  // ------------------------------------------------------------------ the tutorial (LEVEL 0)
  private spotKey = '';
  private focusLevel = -1;

  /** The highlighted rectangle of a step (in screen pixels), or null when it has nothing to show. */
  private targetRect(target: string): { x: number; y: number; w: number; h: number } | null {
    const g = this.game;
    const fromPoints = (pts: Array<{ x: number; y: number; z: number }>): { x: number; y: number; w: number; h: number } => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of pts) {
        const s = g.stage.project(p);
        x0 = Math.min(x0, s.x);
        y0 = Math.min(y0, s.y);
        x1 = Math.max(x1, s.x);
        y1 = Math.max(y1, s.y);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };
    const corners = (b: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }) => {
      const out: Array<{ x: number; y: number; z: number }> = [];
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push({ x, y, z });
      return out;
    };
    if (!target) return null;
    if (target === 'zone') {
      const z = g.level.goal;
      if (!z) return null;
      return fromPoints(corners({ min: { x: z.cx - z.w / 2, y: z.height, z: z.cz - z.d / 2 }, max: { x: z.cx + z.w / 2, y: z.height + 1.2, z: z.cz + z.d / 2 } }));
    }
    if (target === 'fixed') {
      const o = g.level.obstacles[0];
      if (!o) return null;
      const pts = g.worldPartsOfObstacle(0).flatMap((b) => corners(b));
      return fromPoints(pts);
    }
    const el = this.root.querySelector(target) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  /** Draws the guide: a dimmed screen with a hole on the highlighted element, and a card with the explanation and the buttons. */
  private drawTutorial(): void {
    const g = this.game;
    const step = g.paused ? null : g.tutorialStep;
    const tuto = this.el.tuto;
    tuto.classList.toggle('on', !!step);
    this.root.classList.toggle('tutoring', !!step);
    if (!step) {
      this.keys.set('tutorial', '');
      g.stage.orbit.inset = null; // nothing covers the scene any more: it takes the whole screen back
      this.focusLevel = -1;
      return;
    }
    const ready = g.tutorialReady;
    const waiting = step.waiting ? step.waiting(g) : null;
    const index = g.tutorial!.step;
    const key = [index, ready, waiting ?? '', g.state, g.outcome?.won ?? '', g.usesTouch].join('|');
    this.section('tutorial', key, () => {
      const total = TUTORIAL.length;
      const text = esc(say(step.text, g)).replace(/\{([^}]+)\}/g, '<kbd>$1</kbd>');
      const act = step.action ? say(step.action, g) : undefined;
      const action = waiting ?? act;
      const dots = Array.from({ length: total }, (_, k) => `<i class="${k < index ? 'was' : k === index ? 'now' : ''}"></i>`).join('');
      const isLast = index >= total - 1;
      this.el.tcard.className = 'tcard ui-block' + (step.id === 'next' ? ' top' : '');
      this.el.tcard.innerHTML = `<div class="tstep"><span class="dots" aria-label="Étape ${index + 1} sur ${total}">${dots}</span><button class="tskip" data-act="tuto-skip">${isLast ? '' : 'Passer le tutoriel'}</button></div>
        <h3>${esc(step.title)}</h3><p>${text}</p>
        ${action ? `<div class="tdo${ready ? ' ok' : ''}">${ready ? '✓ Bien joué' : '▸ ' + esc(action).replace(/\{([^}]+)\}/g, '<kbd>$1</kbd>')}</div>` : ''}
        <div class="tbtns"><button class="btn ui-block" data-act="tuto-prev"${index === 0 ? ' disabled' : ''}>Précédent</button>
          <button class="btn ui-block primary" data-act="tuto-next"${ready ? '' : ' disabled'}>${esc(step.next ?? 'Suivant')}</button></div>`;
    });
    // the card never hides the level: the scene is fitted into what the card leaves free (shrunk if it must be, slid, eased)
    const cr = this.el.tcard.getBoundingClientRect();
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (this.focusLevel !== g.levelIndex) {
      // what the guide is about: the goal, the fixed pieces and the room around them to build in (not the board's far corners)
      this.focusLevel = g.levelIndex;
      const goal = g.level.goal;
      const box = new Box3();
      if (goal) {
        box.expandByPoint(new Vector3(goal.cx - goal.w / 2, 0, goal.cz - goal.d / 2));
        box.expandByPoint(new Vector3(goal.cx + goal.w / 2, goal.height + 1.5, goal.cz + goal.d / 2));
      }
      g.level.obstacles.forEach((_, i) => g.worldPartsOfObstacle(i).forEach((p) => box.expandByPoint(new Vector3(p.min.x, p.min.y, p.min.z)).expandByPoint(new Vector3(p.max.x, p.max.y, p.max.z))));
      g.stage.orbit.focus = box.isEmpty() ? null : box.expandByVector(new Vector3(1.6, 0, 1.6));
    }
    if (cr.width > 0 && cr.height > 0) {
      if (cr.width < W * 0.6 && (cr.left < W * 0.12 || cr.right > W * 0.88)) {
        // a card in a corner (a low, wide screen): the scene takes the other side, clear of the column of pieces at the right edge
        const tray = this.root.querySelector('.tray')?.getBoundingClientRect();
        const trayRight = tray && tray.width > 0 && tray.left > W / 2 ? W - tray.left : 0;
        g.stage.orbit.inset =
          cr.left > W / 2 ? { top: 0, bottom: 90, left: 0, right: W - cr.left } : { top: 0, bottom: 90, left: cr.right, right: trayRight };
      } else if (!this.el.tcard.classList.contains('top')) {
        g.stage.orbit.inset = { top: 56, bottom: H - cr.top, left: 0, right: 0 };
      } else {
        const tray = this.root.querySelector('.tray')?.getBoundingClientRect();
        g.stage.orbit.inset = { top: cr.bottom, bottom: tray && tray.top > H / 2 ? H - tray.top : 150, left: 0, right: 0 };
      }
    }
    // the spotlight follows its target every frame (the 3D ones move with the view); the catcher keeps the board quiet while a step only explains
    const rect = this.targetRect(step.target);
    const pad = 8;
    const sk = rect ? [Math.round(rect.x), Math.round(rect.y), Math.round(rect.w), Math.round(rect.h)].join(',') : '-';
    const full = `${sk}|${g.tutorialBlocks}`;
    if (full !== this.spotKey) {
      this.spotKey = full;
      const s = this.el.spot;
      if (rect) {
        s.style.display = 'block';
        s.style.left = `${Math.round(rect.x - pad)}px`;
        s.style.top = `${Math.round(rect.y - pad)}px`;
        s.style.width = `${Math.round(rect.w + pad * 2)}px`;
        s.style.height = `${Math.round(rect.h + pad * 2)}px`;
      } else s.style.display = 'none';
      this.el.catch.classList.toggle('dim', !rect);
      this.el.catch.style.display = g.tutorialBlocks ? 'block' : 'none';
    }
  }

  // ------------------------------------------------------------------ result and pause
  private drawResult(on: boolean): void {
    const g = this.game;
    const el = this.el.result;
    el.classList.toggle('on', on);
    if (!on) {
      el.innerHTML = '';
      return;
    }
    const r = g.result;
    const out = g.outcome!;
    const lines = out.lines.map((ln) => {
      const ok = ln.startsWith('[OK]');
      return `<div class="${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✕'} ${esc(ln.replace(/^\[(OK|X)\]\s*/, ''))}</div>`;
    });
    const last = !g.level.tutorial && !(g.levels[g.levelIndex + 1] && !g.levels[g.levelIndex + 1].special);
    let body: string;
    if (r.won && g.level.tutorial) {
      body = `<h2>RÉUSSI</h2><div class="lines">${lines.join('')}</div>
        <div class="note">Vous maîtrisez les gestes de base : placer, tourner, dresser, simuler.</div>
        <div class="btns"><button class="btn ui-block primary wide" data-act="next">Premier niveau</button>
          <button class="btn ui-block" data-act="edit">Modifier</button><button class="btn ui-block" data-act="restart">Rejouer</button>
          <button class="btn ui-block wide" data-act="levels">Niveaux</button><button class="btn ui-block wide" data-act="home">Menu principal</button></div>`;
    } else if (r.won) {
      const rec = g.progress.rec(g.levelIndex);
      body = `<h2>RÉUSSI</h2><div class="lines">${lines.join('')}</div>
        <div class="medalrow">
          <div class="mi on${r.newDone ? ' new' : ''}">${medal(true, r.newDone)}<span>Réussi</span></div>
          <div class="mi${g.progress.economical(g.levelIndex) ? ' on' : ''}${r.newEco ? ' new' : ''}">${medal(g.progress.economical(g.levelIndex), r.newEco)}<span>Économe</span><span style="letter-spacing:.1em">${r.pieces} / ${r.par}</span>${g.progress.economical(g.levelIndex) && !r.eco ? '<span class="kept">déjà obtenue</span>' : ''}</div>
          ${g.level.shard ? `<div class="mi${rec.shard ? ' on' : ''}${r.newShard ? ' new' : ''}">${medal(rec.shard, r.newShard)}<span>Éclat</span></div>` : ''}
        </div>
        <div class="note">${r.unlocked >= 0 && !g.progress.data.freeMode ? `Niveau ${campaignNumber(g.levels, r.unlocked)} débloqué · ` : ''}Campagne : ${r.doneCount} / ${r.total}</div>
        <div class="btns"><button class="btn ui-block primary wide" data-act="next">${last ? 'Terminer' : 'Suivant'}</button>
          <button class="btn ui-block" data-act="edit">Modifier</button><button class="btn ui-block" data-act="restart">Recommencer</button>
          <button class="btn ui-block wide" data-act="levels">Niveaux</button><button class="btn ui-block wide" data-act="home">Menu principal</button></div>`;
    } else {
      body = `<h2>ÉCHEC</h2><div class="lines">${lines.join('')}</div><div class="note">Rien n'est perdu : modifiez la construction et relancez.</div>
        <div class="btns"><button class="btn ui-block primary wide" data-act="edit">Modifier</button>
          <button class="btn ui-block" data-act="restart">Recommencer</button><button class="btn ui-block" data-act="levels">Niveaux</button>
          <button class="btn ui-block wide" data-act="home">Menu principal</button></div>`;
    }
    el.innerHTML = `<div class="dialog ui-block${r.won ? ' won' : ''}">${body}</div>`;
  }

  private drawPause(on: boolean): void {
    const g = this.game;
    const el = this.el.pause;
    el.classList.toggle('on', on);
    el.classList.toggle('peek', on && g.pauseView === 'rewards'); // the scene stays in view: the looks change in front of the player
    if (!on) {
      el.innerHTML = '';
      return;
    }
    if (g.pauseView === 'rewards') {
      el.innerHTML = `<div class="dialog ui-block"><h2>RÉCOMPENSES</h2>${this.rewardsBody()}<div class="btns"><button class="btn ui-block wide" data-act="pause-back">Retour</button></div></div>`;
      return;
    }
    if (g.pauseSettings) {
      el.innerHTML = `<div class="dialog ui-block" style="width:min(520px,100%)"><h2>RÉGLAGES</h2>${this.settingsRows()}<div class="btns"><button class="btn ui-block wide" data-act="pause-back">Retour</button></div></div>`;
      return;
    }
    el.innerHTML = `<div class="dialog ui-block"><h2>PAUSE</h2>
      <div class="btns"><button class="btn ui-block primary wide" data-act="resume">Reprendre</button>
      <button class="btn ui-block wide" data-act="restart">Recommencer</button>
      <button class="btn ui-block wide" data-act="pause-rewards">Récompenses</button>
      <button class="btn ui-block wide" data-act="pause-settings">Réglages</button>
      <button class="btn ui-block wide" data-act="levels">Niveaux</button>
      <button class="btn ui-block wide" data-act="home">Menu principal</button></div></div>`;
  }

  // ------------------------------------------------------------------ events
  private onPointerDown(e: PointerEvent): void {
    this.game.audio.unlock();
    const cell = (e.target as HTMLElement).closest('.cell') as HTMLElement | null;
    if (cell && !cell.classList.contains('empty')) {
      e.preventDefault();
      if (this.game.state !== 'build' || this.game.busy || this.game.paused) return;
      const kind = cell.dataset.kind as Kind;
      this.game.startDrag(kind, 0, null, e.clientX, e.clientY, e.pointerType === 'touch');
    }
  }

  private onInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    if (t.dataset.input === 'volume') {
      this.game.progress.data.volume = Number(t.value) / 100;
      this.game.applySettings(); // the slider is not redrawn: replacing it under the finger would end the drag
    }
  }

  /** The slider was let go: a click at the new volume, so it can be heard. */
  private onChange(e: Event): void {
    if ((e.target as HTMLInputElement).dataset.input === 'volume') this.game.sfx('click');
  }

  private onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    const g = this.game;
    g.audio.unlock();
    if (g.page === 'splash' && g.state === 'menu' && (e.target as HTMLElement).closest('#splash')) {
      g.openPage('title');
      return;
    }
    if (!t || g.busy) return;
    const act = t.dataset.act!;
    const d = g.progress.data;
    switch (act) {
      case 'page': {
        const p = t.dataset.p as 'title' | 'levels' | 'settings' | 'rewards';
        g.go(() => g.openPage(p));
        break;
      }
      case 'level': {
        const i = Number(t.dataset.i);
        if (!g.progress.unlocked(i)) return;
        g.go(() => g.startLevel(i));
        break;
      }
      case 'tutorial':
        g.go(() => g.startTutorial());
        break;
      case 'tuto-next':
        g.tutorialNext();
        break;
      case 'tuto-prev':
        g.tutorialPrev();
        break;
      case 'tuto-skip':
        g.endTutorial();
        break;
      case 'lay':
        g.rotateSelected('lay');
        break;
      case 'sound':
        d.sound = !d.sound;
        g.applySettings();
        g.sfx('click', 0.6);
        break;
      case 'invert':
        d.invert = !d.invert;
        g.applySettings();
        g.sfx('click', 0.6);
        break;
      case 'free':
        d.freeMode = !d.freeMode;
        g.applySettings();
        g.sfx('click', 0.6);
        break;
      case 'export-save':
        this.exportSave();
        break;
      case 'import-save':
        this.importSave();
        break;
      case 'erase':
        if (g.confirmErase) g.eraseProgress();
        else {
          g.confirmErase = true;
          g.touch();
        }
        g.sfx('click', 0.6);
        break;
      case 'theme':
        g.setTheme(Number(t.dataset.i));
        break;
      case 'pause':
        g.setPause(true);
        break;
      case 'resume':
        g.setPause(false);
        break;
      case 'pause-settings':
        g.pauseSettings = true;
        g.sfx('click', 0.6);
        g.touch();
        break;
      case 'pause-rewards':
        g.pauseView = 'rewards';
        g.sfx('click', 0.6);
        g.touch();
        break;
      case 'pause-back':
        g.pauseView = 'menu';
        g.confirmErase = false;
        g.sfx('click', 0.6);
        g.touch();
        break;
      case 'undo':
        g.undo();
        break;
      case 'redo':
        g.redo();
        break;
      case 'rotate':
        g.rotateSelected('yaw');
        break;
      case 'sim':
        if (g.state === 'build') g.startSim();
        else g.backToBuild();
        break;
      case 'reset':
        g.clearBoard();
        break;
      case 'edit':
        g.backToBuild();
        break;
      case 'restart':
        g.go(() => g.restartLevel());
        break;
      case 'levels':
        g.go(() => g.leaveToLevels());
        break;
      case 'home':
        g.go(() => g.leaveToTitle());
        break;
      case 'next':
        g.go(() => g.nextAfterWin());
        break;
      default:
        break;
    }
  }
}
