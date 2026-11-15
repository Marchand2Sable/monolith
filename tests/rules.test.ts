// The rules of building and winning, and the save: pure logic, no engine, no screen.
import { describe, expect, it } from 'vitest';
import { Board, REACH, extents, pieceBounds, turn, worldParts } from '../src/core/board';
import { buildLevels } from '../src/core/levels';
import { Box, v3 } from '../src/core/math';
import { sizeOf, volumeOf } from '../src/core/kinds';
import { EXPORT_FORMAT, EXPORT_GAME, LEGACY_KEYS, migrate, Progress, SAVE_KEY, SAVE_SCHEMA, THEMES, type Store } from '../src/game/save';

const levels = buildLevels();

describe('shapes', () => {
  it('sizes and volumes', () => {
    expect(sizeOf('cube')).toEqual(v3(1, 1, 1));
    expect(sizeOf('stairs')).toEqual(v3(3, 3, 1));
    expect(sizeOf('arch')).toEqual(v3(3, 2, 1));
    expect(volumeOf('prism')).toBe(1);
    expect(volumeOf('tee')).toBe(4);
  });
  it('a quarter turn swaps the footprint', () => {
    expect(extents('beam', 0)).toEqual(v3(3, 1, 1));
    expect(extents('beam', 1)).toEqual(v3(1, 1, 3));
    expect(turn(v3(1, 0, 0), 1)).toEqual(v3(0, 0, -1));
    expect(turn(v3(1, 0, 2), 0)).toEqual(v3(1, 0, 2));
  });
  it('world parts of a turned arch stay inside its bounds', () => {
    const parts = worldParts('arch', 1, v3(0, 1, 0));
    const all = parts.reduce((b, p) => b.encapsulate(p), parts[0].clone());
    const e = extents('arch', 1);
    expect(all.size.x).toBeCloseTo(e.x);
    expect(all.size.z).toBeCloseTo(e.z);
  });
});

describe('placing', () => {
  const l1 = levels[0];
  it('a piece falls onto the platform, on the grid', () => {
    const b = new Board(l1);
    const r = b.plan('cube', 0, 1.7, -1.2);
    expect(r.ok).toBe(true);
    expect(r.pos.y).toBeCloseTo(0.5);
    expect((r.pos.x - 0.5) % 0.25).toBeCloseTo(0);
  });
  it('stands on a fixed pillar', () => {
    const b = new Board(l1);
    const r = b.plan('pillar', 0, 0, 0);
    expect(r.ok).toBe(true);
    expect(r.pos.y).toBeCloseTo(3); // the grey pillar is 2 high, the new one 2 more, centred at 3
  });
  it('refuses a place that is taken', () => {
    const b = new Board(l1);
    const r = b.plan('cube', 0, 0, 0, 1);
    // pointing at the floor level under the grey pillar: nothing fits there
    expect(r.ok).toBe(false);
  });
  it('refuses to float (outside every support)', () => {
    const b = new Board(levels[7]); // the gulf: there is only air between the stairs
    const r = b.plan('cube', 0, 0, 3.9, -5);
    expect(r.ok).toBe(false);
  });
  it('planAt falls back on the highest surface under the piece', () => {
    const b = new Board(levels[7]);
    const r = b.planAt('plate', 0, -0.5, 0, 0);
    expect(r.ok).toBe(true);
  });
  it('a stock can run out', () => {
    const b = new Board(l1);
    expect(b.remaining('pillar')).toBe(1);
    b.add({ kind: 'pillar', rot: 0, pos: v3(0, 3, 0) });
    expect(b.remaining('pillar')).toBe(0);
  });
  it('snapshots are independent copies', () => {
    const b = new Board(l1);
    const p = b.add({ kind: 'cube', rot: 0, pos: v3(1, 0.5, 1) });
    const s = b.snapshot();
    p.pos.x = 99;
    expect(s[0].pos.x).toBe(1);
  });
});

describe('winning', () => {
  it('the zone needs the named shape, over the zone, at the height', () => {
    const lvl = levels[2]; // La clef de voûte: an arch must be on top
    const b = new Board(lvl);
    const box = Box.fromCenter(v3(0, 4.5, 0), extents('arch', 0));
    expect(b.qualifies('arch', box)).toBe(true);
    expect(b.qualifies('cube', box)).toBe(false);
    expect(b.qualifies('arch', Box.fromCenter(v3(2, 4.5, 0), extents('arch', 0)))).toBe(false);
  });
  it('reach is exact to 0.02', () => {
    const lvl = levels[0];
    const b = new Board(lvl);
    b.add({ kind: 'pillar', rot: 0, pos: v3(0, 3, 0) });
    const live = [Box.fromCenter(v3(0, 3, 0), v3(1, 2, 1))];
    expect(b.evaluate(live, true, false).won).toBe(true);
    const low = [Box.fromCenter(v3(0, 3 - (REACH + 0.01), 0), v3(1, 2, 1))];
    expect(b.evaluate(low, true, false).won).toBe(false);
    const near = [Box.fromCenter(v3(0, 3 - REACH / 2, 0), v3(1, 2, 1))];
    expect(b.evaluate(near, true, false).won).toBe(true);
  });
  it('a construction that still moves, or lost a piece, does not win', () => {
    const b = new Board(levels[0]);
    b.add({ kind: 'pillar', rot: 0, pos: v3(0, 3, 0) });
    const live = [Box.fromCenter(v3(0, 3, 0), v3(1, 2, 1))];
    expect(b.evaluate(live, false, false).won).toBe(false);
    expect(b.evaluate(live, true, true).won).toBe(false);
  });
  it('heightOf follows the pieces that count', () => {
    const b = new Board(levels[0]);
    const p = b.add({ kind: 'pillar', rot: 0, pos: v3(0, 3, 0) });
    expect(b.heightOf()).toBeCloseTo(4);
    expect(pieceBounds(p).max.y).toBeCloseTo(4);
  });
});

describe('level data', () => {
  it('every level has 3+ solutions, a hint, a place, a mood, a rating', () => {
    for (const l of levels) {
      if (l.special) continue;
      expect(l.solutions.length, l.title).toBeGreaterThanOrEqual(3);
      expect(l.hint.length, l.title).toBeGreaterThan(10);
      expect(l.subtitle.length, l.title).toBeGreaterThan(0);
      expect(l.rating, l.title).toBeGreaterThan(0);
      expect(l.par, l.title).toBeGreaterThan(0);
    }
  });
  it('ratings never go down', () => {
    const r = levels.filter((l) => !l.special).map((l) => l.rating);
    expect([...r].sort((a, b) => a - b)).toEqual(r);
  });
  it('every shard floats over the platform', () => {
    for (const l of levels) {
      if (!l.shard) continue;
      expect(l.zone.contains(v3(l.shard.x, l.zone.center.y, l.shard.z)), l.title).toBe(true);
    }
  });
  it('solutions never use more pieces than the stock', () => {
    for (const l of levels) {
      for (const s of [...l.solutions, ...l.traps]) {
        const used: Record<string, number> = {};
        for (const step of s) used[step.kind] = (used[step.kind] ?? 0) + 1;
        for (const [k, n] of Object.entries(used)) expect(n, `${l.title} ${k}`).toBeLessThanOrEqual(l.stockOf(k as never));
      }
    }
  });
});

class MemStore implements Store {
  m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
}

describe('save and progression', () => {
  const mk = (store = new MemStore()) => ({ store, p: new Progress(levels, 'k', store) });

  it('starts with only the first level (and the sandbox) open', () => {
    const { p } = mk();
    expect(p.unlocked(0)).toBe(true);
    expect(p.unlocked(1)).toBe(false);
    expect(p.unlocked(levels.findIndex((l) => l.sandbox))).toBe(true);
  });
  it('winning opens the next level and earns medals', () => {
    const { p } = mk();
    const ach = p.record(0, 1, false);
    expect(p.unlocked(1)).toBe(true);
    expect(p.medals(0)).toBe(2); // won + économe (1 piece = par)
    expect(ach).toContain(0); // Premier pas
    p.record(0, 2, true);
    expect(p.rec(0).best).toBe(1); // the best is kept
    expect(p.medals(0)).toBe(3);
  });
  it('économe needs par or fewer pieces', () => {
    const { p } = mk();
    p.record(1, 5, false); // par of level 2 is 1 (the beam stood on its end)
    expect(p.economical(1)).toBe(false);
    p.record(1, 1, false);
    expect(p.economical(1)).toBe(true);
  });
  it('persists and reloads', () => {
    const { store, p } = mk();
    p.record(0, 1, true);
    p.data.volume = 0.3;
    p.save();
    const again = new Progress(levels, 'k', store);
    expect(again.rec(0).done).toBe(true);
    expect(again.rec(0).shard).toBe(true);
    expect(again.data.volume).toBeCloseTo(0.3);
  });
  it('survives a damaged save', () => {
    const store = new MemStore();
    store.setItem('k', '{not json');
    expect(new Progress(levels, 'k', store).data.levels.length).toBe(levels.length);
    store.setItem('k', JSON.stringify({ version: 1, levels: [{ done: 'yes', best: -4 }], volume: 99, theme: 42, achievements: 1e9 }));
    const p = new Progress(levels, 'k', store);
    expect(p.data.volume).toBe(1);
    expect(p.data.theme).toBe(0);
    expect(p.rec(0).best).toBe(0);
    expect(p.data.levels.length).toBe(levels.length);
  });
  it('a stored look that is not open is dropped', () => {
    const store = new MemStore();
    store.setItem('k', JSON.stringify({ version: 1, theme: 4 }));
    expect(new Progress(levels, 'k', store).data.theme).toBe(0);
  });
  it('looks open with medals', () => {
    const { p } = mk();
    expect(p.themeOpen(0)).toBe(true);
    expect(p.themeOpen(1)).toBe(false);
    for (let i = 0; i < 6; i++) p.record(i, 1, true);
    expect(p.totalMedals).toBeGreaterThanOrEqual(THEMES[1].medals);
    expect(p.themeOpen(1)).toBe(true);
  });
  it('records follow their level when the campaign changes (by title); old saves without ids are read by the old order', () => {
    const store = new MemStore();
    store.setItem('k', JSON.stringify({ version: 1, levels: [{ done: true, best: 2, shard: false }, { done: true, best: 3, shard: true }] }));
    const p = new Progress(levels, 'k', store);
    expect(p.rec(0).done).toBe(true);
    expect(p.rec(1).best).toBe(3);
    expect(p.rec(1).id).toBe(levels[1].title);
    // a campaign that gets another level in the middle: the records stay with their levels
    const reordered = [levels[1], levels[0], ...levels.slice(2)];
    const q = new Progress(reordered, 'k', store);
    p.save();
    const r2 = new Progress(reordered, 'k', store);
    expect(r2.rec(0).best).toBe(3);
    expect(r2.rec(1).best).toBe(2);
    void q;
  });
  it('free mode opens everything', () => {
    const { p } = mk();
    p.data.freeMode = true;
    expect(p.unlocked(levels.length - 3)).toBe(true);
  });
  it('erase keeps the settings and drops the progress', () => {
    const { p } = mk();
    p.record(0, 1, true);
    p.data.volume = 0.2;
    p.data.invert = true;
    p.erase();
    expect(p.rec(0).done).toBe(false);
    expect(p.data.volume).toBeCloseTo(0.2);
    expect(p.data.invert).toBe(true);
  });
  it('a missing store does not break the game', () => {
    expect(() => new Progress(levels, 'k', null)).not.toThrow();
  });

  describe('versioned storage (studio key, migration, recovery, export)', () => {
    it('the studio key follows tts:<game>:save:v<schema>', () => {
      expect(SAVE_KEY).toBe(`tts:monolith:save:v${SAVE_SCHEMA}`);
    });
    it('a save under an earlier build’s key is read, moved to the studio key, and the old copy stays', () => {
      const store = new MemStore();
      const old = new Progress(levels, 'old', store);
      old.record(0, 1, true);
      old.data.volume = 0.4;
      old.save();
      const json = store.getItem('old')!;
      const fresh = new MemStore();
      fresh.setItem(LEGACY_KEYS[0], json);
      const p = new Progress(levels, SAVE_KEY, fresh);
      expect(p.rec(0).done).toBe(true);
      expect(p.rec(0).shard).toBe(true);
      expect(p.data.volume).toBeCloseTo(0.4);
      expect(fresh.getItem(SAVE_KEY)).not.toBeNull(); // moved to the new key by the first save
      expect(fresh.getItem(LEGACY_KEYS[0])).toBe(json); // never deleted
      expect(p.recovered).toBe(false);
    });
    it('the current key wins over an earlier build’s key', () => {
      const store = new MemStore();
      const a = new Progress(levels, SAVE_KEY, store);
      a.record(0, 1, false);
      store.setItem(LEGACY_KEYS[0], JSON.stringify({ version: 1, volume: 0.1 }));
      expect(new Progress(levels, SAVE_KEY, store).rec(0).done).toBe(true);
    });
    it('a damaged save is set aside before the fresh start overwrites it', () => {
      const store = new MemStore();
      store.setItem('k', '{not json');
      const p = new Progress(levels, 'k', store);
      expect(p.recovered).toBe(true);
      expect(store.getItem('k:unreadable')).toBe('{not json');
      expect(p.rec(0).done).toBe(false);
    });
    it('a save from a newer game is not read, not lost', () => {
      const store = new MemStore();
      const future = JSON.stringify({ version: SAVE_SCHEMA + 1, levels: [{ id: levels[0].title, done: true, best: 1, shard: true }] });
      store.setItem('k', future);
      const p = new Progress(levels, 'k', store);
      expect(p.recovered).toBe(true);
      expect(p.rec(0).done).toBe(false);
      expect(store.getItem('k:unreadable')).toBe(future);
    });
    it('migrate refuses what has no usable version and accepts the current one', () => {
      expect(migrate(null)).toBeNull();
      expect(migrate([])).toBeNull();
      expect(migrate({})).toBeNull();
      expect(migrate({ version: '1' })).toBeNull();
      expect(migrate({ version: 0 })).toBeNull();
      expect(migrate({ version: SAVE_SCHEMA + 1 })).toBeNull();
      expect(migrate({ version: SAVE_SCHEMA, volume: 0.5 })).toEqual({ version: SAVE_SCHEMA, volume: 0.5 });
    });
    it('export then import restores the progress on another device', () => {
      const a = mk().p;
      a.record(0, 1, true);
      a.record(1, 1, false);
      a.data.theme = 0;
      a.data.volume = 0.25;
      const file = a.exportJson();
      expect(JSON.parse(file)).toMatchObject({ format: EXPORT_FORMAT, game: EXPORT_GAME, schema: SAVE_SCHEMA });
      const store = new MemStore();
      const b = new Progress(levels, 'k', store);
      b.record(2, 3, false); // what is there now
      const r = b.importJson(file);
      expect(r.ok).toBe(true);
      expect(b.rec(0).done).toBe(true);
      expect(b.rec(0).shard).toBe(true);
      expect(b.rec(1).done).toBe(true);
      expect(b.rec(2).done).toBe(false); // replaced, as an import does
      expect(b.data.volume).toBeCloseTo(0.25);
      expect(store.getItem('k:before-import')).toContain('"done":true'); // the replaced progress is kept aside
      expect(new Progress(levels, 'k', store).rec(1).done).toBe(true); // and saved
    });
    it('import refuses what is not a MONOLITH save and changes nothing', () => {
      const { p } = mk();
      p.record(0, 1, false);
      const before = JSON.stringify(p.data);
      const bad = [
        'nope',
        '{}',
        JSON.stringify({ format: 'other', game: 'monolith', data: {} }),
        JSON.stringify({ format: EXPORT_FORMAT, game: 'blindspot', data: { version: 1 } }),
        JSON.stringify({ format: EXPORT_FORMAT, game: EXPORT_GAME, data: { version: SAVE_SCHEMA + 1 } }),
        JSON.stringify({ format: EXPORT_FORMAT, game: EXPORT_GAME, data: null }),
        'x'.repeat(300 * 1024),
      ];
      for (const text of bad) expect(p.importJson(text).ok).toBe(false);
      expect(JSON.stringify(p.data)).toBe(before);
    });
    it('an imported file with out-of-range values is clamped like any save', () => {
      const { p } = mk();
      const r = p.importJson(JSON.stringify({ format: EXPORT_FORMAT, game: EXPORT_GAME, data: { version: 1, volume: 50, theme: 9, achievements: 1e12 } }));
      expect(r.ok).toBe(true);
      expect(p.data.volume).toBe(1);
      expect(p.data.theme).toBe(0);
    });
  });
});
