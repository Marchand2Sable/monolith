// What the player keeps: which levels are done, with which medals, the achievements, the chosen look and the settings.
// Stored as one JSON string in localStorage. No scene objects here, so the rules (medals, locks, achievements) can be tested alone.
import type { Level } from '../core/levels';
import { clamp } from '../core/math';

export interface LevelRecord {
  id: string; // the level's title: the campaign can grow without the records of the players moving to another level
  done: boolean;
  best: number; // fewest pieces of a win, 0 while not won
  shard: boolean; // the hidden shard was found in a win
}

/**
 * The shape of what is stored. It moves on its own, apart from the version of the game: raise it only when the stored data
 * changes shape, and add the step that carries older data up in MIGRATIONS (see docs/SAVE_SYSTEM.md).
 */
export const SAVE_SCHEMA = 1;
/** The studio's key: `tts:<game id>:save:v<schema>`. The game id is fixed and does not follow the title on the page. */
export const SAVE_KEY = 'tts:monolith:save:v1';
/** Keys earlier builds wrote to. They are read when the current key is empty, and never deleted (they stay as a copy). */
export const LEGACY_KEYS = ['monolith3d.save.v1'];
/** The wrapper of an exported file. */
export const EXPORT_FORMAT = 'tts-save';
export const EXPORT_GAME = 'monolith';
const EXPORT_MAX_BYTES = 256 * 1024;

/** Steps that carry a save from schema n to n + 1. Empty while the schema is still 1. */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {};

export interface SaveData {
  version: number;
  levels: LevelRecord[];
  achievements: number; // one bit per achievement
  volume: number;
  sound: boolean;
  invert: boolean; // dragging the other way turns the view
  freeMode: boolean; // every level open from the start
  theme: number;
  tutorialDone: boolean;
}

export interface Achievement {
  name: string;
  text: string;
}

/** A look for the pieces, opened by the number of medals earned. */
export interface Theme {
  name: string;
  medals: number; // needed to open it
  tint: [number, number, number]; // multiplies the pieces' colours
  accent: [number, number, number]; // the dashed zone and the shard
}

export const ACHIEVEMENTS: Achievement[] = [
  { name: 'Premier pas', text: 'Réussir le premier niveau.' },
  { name: 'Économe', text: 'Réussir trois niveaux avec le moins de pièces possible.' },
  { name: "Chasseur d'éclats", text: 'Saisir trois éclats.' },
  { name: 'Sans faute', text: "Obtenir les trois médailles d'un même niveau." },
  { name: 'Architecte', text: 'Réussir tous les niveaux.' },
  { name: 'Collectionneur', text: 'Saisir tous les éclats.' },
];

export const THEMES: Theme[] = [
  { name: 'Ivoire', medals: 0, tint: [1, 1, 1], accent: [0.96, 0.96, 0.94] },
  { name: 'Sable', medals: 4, tint: [1.0, 0.9, 0.76], accent: [1.0, 0.86, 0.55] },
  { name: 'Aurore', medals: 9, tint: [1.0, 0.82, 0.8], accent: [1.0, 0.62, 0.58] },
  { name: 'Cobalt', medals: 15, tint: [0.78, 0.86, 1.0], accent: [0.55, 0.75, 1.0] },
  { name: 'Jade', medals: 21, tint: [0.78, 0.95, 0.86], accent: [0.5, 0.95, 0.72] },
];

/** The campaign as the first saves knew it: records without an id are matched to levels by this order. */
const LEGACY_ORDER = [
  'Premier pas', "L'escalier", 'La clef de voûte', "Sous l'arche", 'Les marches', 'La tour de Pise', "L'équerre", 'Le gouffre', 'Le pont brisé', 'Le surplomb', 'Le té', 'Le balancier', "L'éboulement", 'Les ruines',
];

export interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function defaultStore(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // private mode, blocked storage: the game still runs, it just does not remember
  }
}

/** Carries stored data up to the current schema. Returns null for what cannot be read (not an object, no version, from a newer game). */
export function migrate(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  let d = raw as Record<string, unknown>;
  let v = d.version;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > SAVE_SCHEMA) return null;
  while (v < SAVE_SCHEMA) {
    const step = MIGRATIONS[v];
    if (!step) return null;
    d = step(d);
    v++;
    d.version = v;
  }
  return d;
}

const freshData = (): SaveData => ({
  version: SAVE_SCHEMA,
  levels: [],
  achievements: 0,
  volume: 0.8,
  sound: true,
  invert: false,
  freeMode: false,
  theme: 0,
  tutorialDone: false,
});

export class Progress {
  data: SaveData = freshData();
  private lastMedals = 0;

  constructor(
    private levels: Level[],
    private key = SAVE_KEY,
    private store: Store | null = defaultStore(),
    private legacyKeys: string[] = key === SAVE_KEY ? LEGACY_KEYS : [],
  ) {
    this.load();
  }

  /** Where a copy goes when stored data cannot be read or is about to be replaced: it is set aside, never thrown away. */
  private setAside(suffix: string, json: string): void {
    try {
      this.store?.setItem(`${this.key}:${suffix}`, json);
    } catch {
      /* nothing more to do */
    }
  }

  /**
   * Reads the save. Order: the current key, then the keys of earlier builds (the progress moves to the current key on the first
   * save, the old copy stays). Stored data that cannot be read (damaged, or written by a newer game) is set aside under
   * `<key>:unreadable` before a fresh start can overwrite it.
   */
  load(): void {
    this.data = freshData();
    this.recovered = false;
    try {
      let json = this.store?.getItem(this.key) ?? null;
      if (!json) {
        for (const k of this.legacyKeys) {
          json = this.store?.getItem(k) ?? null;
          if (json) break;
        }
      }
      if (json) {
        let read: Record<string, unknown> | null = null;
        try {
          read = migrate(JSON.parse(json));
        } catch {
          read = null;
        }
        if (read) this.data = { ...freshData(), ...(read as Partial<SaveData>) };
        else {
          this.recovered = true;
          this.setAside('unreadable', json);
        }
      }
    } catch {
      this.data = freshData();
    }
    this.fit();
    this.refresh();
  }

  /** True when the stored data could not be read and the game started fresh (a copy is under `<key>:unreadable`). */
  recovered = false;

  /** The whole save as a file's text: what to keep, send to another device, or put back later. */
  exportJson(): string {
    return JSON.stringify({ format: EXPORT_FORMAT, game: EXPORT_GAME, schema: SAVE_SCHEMA, exportedAt: new Date().toISOString(), data: this.data }, null, 2);
  }

  /**
   * Replaces the progress with an exported file's. Checked first: nothing changes unless the file is a MONOLITH save of this
   * schema or an older one. The progress it replaces is set aside under `<key>:before-import`.
   */
  importJson(text: string): { ok: true } | { ok: false; reason: string } {
    if (text.length > EXPORT_MAX_BYTES) return { ok: false, reason: 'Fichier trop gros.' };
    let file: unknown;
    try {
      file = JSON.parse(text);
    } catch {
      return { ok: false, reason: "Ce fichier n'est pas une sauvegarde." };
    }
    const f = file as { format?: unknown; game?: unknown; data?: unknown } | null;
    if (!f || f.format !== EXPORT_FORMAT) return { ok: false, reason: "Ce fichier n'est pas une sauvegarde TWO TONE." };
    if (f.game !== EXPORT_GAME) return { ok: false, reason: 'Cette sauvegarde est celle d’un autre jeu.' };
    const read = migrate(f.data);
    if (!read) return { ok: false, reason: 'Sauvegarde illisible ou trop récente pour cette version.' };
    this.setAside('before-import', JSON.stringify(this.data));
    this.data = { ...freshData(), ...(read as Partial<SaveData>) };
    this.fit();
    this.refresh();
    return { ok: true };
  }

  /** Makes the records match the number of levels, and the settings stay inside their range (a damaged save must not break the game). */
  fit(): void {
    const d = this.data;
    const list: LevelRecord[] = [];
    const old: unknown[] = Array.isArray(d.levels) ? d.levels : [];
    const byId = new Map<string, Partial<LevelRecord>>();
    old.forEach((o, k) => {
      const rec = o as Partial<LevelRecord> | undefined;
      if (!rec) return;
      const id = typeof rec.id === 'string' ? rec.id : LEGACY_ORDER[k]; // a record from before ids: its place in the old order says which level it is
      if (id) byId.set(id, rec);
    });
    for (let i = 0; i < this.levels.length; i++) {
      const id = this.levels[i].title;
      const rec = byId.get(id);
      list.push({
        id,
        done: !!rec?.done,
        best: Math.max(0, Math.floor(Number(rec?.best) || 0)),
        shard: !!rec?.shard,
      });
    }
    d.levels = list;
    d.volume = clamp(Number(d.volume) || 0, 0, 1);
    d.theme = clamp(Math.floor(Number(d.theme) || 0), 0, THEMES.length - 1);
    d.achievements = Math.floor(Number(d.achievements) || 0) & ((1 << ACHIEVEMENTS.length) - 1);
    d.sound = d.sound !== false;
  }

  save(): void {
    try {
      this.store?.setItem(this.key, JSON.stringify(this.data));
    } catch {
      /* quota or blocked: ignore */
    }
  }

  /** The progress goes, the settings stay. */
  erase(): void {
    const keep = this.data;
    this.data = { ...freshData(), volume: keep.volume, sound: keep.sound, invert: keep.invert };
    this.fit();
    this.refresh();
  }

  get theme(): Theme {
    return THEMES[clamp(this.data.theme, 0, THEMES.length - 1)];
  }

  rec(i: number): LevelRecord {
    return this.data.levels[clamp(i, 0, this.data.levels.length - 1)];
  }

  economical(i: number): boolean {
    const r = this.rec(i);
    const par = this.levels[i].par;
    return r.done && par > 0 && r.best > 0 && r.best <= par;
  }

  /** The medals of a level, 0 to 3: won, won with few pieces, won with the hidden shard. */
  medals(i: number): number {
    const r = this.rec(i);
    return (r.done ? 1 : 0) + (this.economical(i) ? 1 : 0) + (r.shard ? 1 : 0);
  }

  maxMedalsOf(i: number): number {
    return this.levels[i].shard ? 3 : 2;
  }

  get totalMedals(): number {
    let n = 0;
    this.levels.forEach((l, i) => {
      if (!l.special) n += this.medals(i);
    });
    return n;
  }

  get maxMedals(): number {
    let n = 0;
    for (const l of this.levels) if (!l.special) n += l.shard ? 3 : 2;
    return n;
  }

  /** A level opens when the one before it is won (the first, and the sandbox, are always open; free mode opens everything). */
  unlocked(i: number): boolean {
    if (this.data.freeMode || i === 0 || this.levels[i].special) return true;
    return this.rec(i - 1).done;
  }

  themeOpen(t: number): boolean {
    return t === 0 || this.lastMedals >= THEMES[t].medals;
  }

  /** Notes a win. Returns the achievements it opens (as indices). */
  record(i: number, pieces: number, shard: boolean): number[] {
    const r = this.rec(i);
    r.done = true;
    r.best = r.best === 0 ? pieces : Math.min(r.best, pieces);
    r.shard = r.shard || shard;
    return this.refresh();
  }

  /** Opens the achievements whose condition now holds, saves, and returns the new ones. */
  refresh(): number[] {
    this.lastMedals = this.totalMedals;
    if (this.data.theme > 0 && !this.themeOpen(this.data.theme)) this.data.theme = 0; // a stored look that is not open (a hand-edited or damaged save)
    let playable = 0, done = 0, eco = 0, shards = 0, shardLevels = 0;
    let perfect = false;
    this.levels.forEach((l, i) => {
      if (l.special) return;
      playable++;
      if (this.rec(i).done) done++;
      if (this.economical(i)) eco++;
      if (l.shard) shardLevels++;
      if (this.rec(i).shard) shards++;
      if (this.medals(i) === this.maxMedalsOf(i)) perfect = true;
    });
    const now = [playable > 0 && this.rec(0).done, eco >= 3, shards >= 3, perfect, playable > 0 && done === playable, shardLevels > 0 && shards === shardLevels];
    const opened: number[] = [];
    now.forEach((ok, a) => {
      const bit = 1 << a;
      if (ok && (this.data.achievements & bit) === 0) {
        this.data.achievements |= bit;
        opened.push(a);
      }
    });
    this.save();
    return opened;
  }

  has(a: number): boolean {
    return (this.data.achievements & (1 << a)) !== 0;
  }
}
