// Data of the game: the objectives and the fourteen levels (plus the sandbox). No behaviour here beyond reading it.
import { Box, v3, type Vec3 } from './math';
import { ALL_KINDS, sizeOf, type Kind } from './kinds';
import { orient, turnSize } from './orient';

/** Reach a height over a spot; when a shape is named, a piece of that shape must be the one that gets there. */
export interface Objective {
  height: number;
  with?: Kind;
  cx: number;
  cz: number;
  w: number;
  d: number; // the footprint of the zone, a box standing on the goal height
}

/** A piece fixed in place before the player starts: it is in the way, and it is also something to stand on. */
export interface ObstacleDef {
  kind: Kind;
  rot: number;
  x: number;
  z: number;
  bottom: number; // the height of its underside
}

/** The centre of an obstacle. */
export function obstaclePos(o: ObstacleDef): Vec3 {
  const e = turnSize(sizeOf(o.kind), o.rot);
  return v3(o.x, o.bottom + e.y / 2, o.z);
}

/** One piece of a known solution: its shape and where it is dropped. */
export interface Step {
  kind: Kind;
  x: number;
  z: number;
  rot: number;
  /** The height of the surface it stands on, when that is not the highest one under it (a prop under an overhang). */
  floor?: number;
}

export interface PlatformDef {
  bounds: Box;
}

/** A slab whose top face is at height `top`, 1 unit thick. */
export const platform = (cx: number, cz: number, width: number, depth: number, top = 0): PlatformDef => ({
  bounds: Box.fromCenter(v3(cx, top - 0.5, cz), v3(width, 1, depth)),
});

export class Level {
  title = '';
  platforms: PlatformDef[] = [];
  stock: Partial<Record<Kind, number>> = {};
  obstacles: ObstacleDef[] = [];
  goal?: Objective; // none in the sandbox
  sandbox = false;
  /** The first lesson (LEVEL 0): it teaches the gestures, takes no part in the campaign (no medals, no lock). */
  tutorial = false;
  stillSeconds = 2;
  /** Different ways to win, each bottom to top: what the tests play, and what a hint could show. */
  solutions: Step[][] = [];
  /** Tempting attempts that do not work: the tests check that they fail. */
  traps: Step[][] = [];
  rating = 0; // estimated difficulty, 1 (a first step) to 10 (a hard puzzle)
  subtitle = ''; // the name of the place
  hint = ''; // one line on the idea of the level, never the answer
  mood = 0; // the atmosphere (see render/atmosphere.ts)
  shard?: Vec3; // where a hidden shard floats: a winning build that reaches it earns the third medal

  /** Not part of the campaign: the sandbox and the tutorial. */
  get special(): boolean {
    return this.sandbox || this.tutorial;
  }

  /** The fewest pieces among the known solutions: a win with this many or fewer earns the "économe" medal. */
  get par(): number {
    let p = Infinity;
    for (const s of this.solutions) p = Math.min(p, s.length);
    return p === Infinity ? 0 : p;
  }

  story(subtitle: string, hint: string): this {
    this.subtitle = subtitle;
    this.hint = hint;
    return this;
  }
  atmo(mood: number): this {
    this.mood = mood;
    return this;
  }
  withShard(x: number, y: number, z: number): this {
    this.shard = v3(x, y, z);
    return this;
  }
  rate(r: number): this {
    this.rating = r;
    return this;
  }
  solve(...steps: Step[]): this {
    this.solutions.push(steps);
    return this;
  }
  trap(...steps: Step[]): this {
    this.traps.push(steps);
    return this;
  }

  stockOf(k: Kind): number {
    return this.stock[k] ?? 0;
  }

  /** The kinds the player has in hand on this level, in the tray's order. */
  available(): Kind[] {
    return ALL_KINDS.filter((k) => this.stockOf(k) > 0);
  }

  /** The ground the player may build on. */
  get zone(): Box {
    const b = this.platforms[0].bounds.clone();
    for (const p of this.platforms) b.encapsulate(p.bounds);
    return b;
  }

  get heightGoal(): number | undefined {
    return this.goal?.height;
  }
}

// ------------------------------------------------------------------ builders

type StockArgs = Array<Kind | number>;

function stock(...pairs: StockArgs): Partial<Record<Kind, number>> {
  const d: Partial<Record<Kind, number>> = {};
  for (let i = 0; i < pairs.length; i += 2) d[pairs[i] as Kind] = pairs[i + 1] as number;
  return d;
}

/** A level: reach the zone standing at (cx, cz) on the given height, with the stock in hand, over the fixed pieces already on the board. */
function make(title: string, height: number, withKind: Kind | null, cx: number, cz: number, st: Partial<Record<Kind, number>>, ...obstacles: ObstacleDef[]): Level {
  const l = new Level();
  l.title = title;
  l.stock = st;
  l.goal = { height, with: withKind ?? undefined, cx, cz, w: 1, d: 1 };
  l.obstacles.push(...obstacles);
  l.platforms.push(platform(0, 0, 8, 8, 0));
  return l;
}

const fix = (kind: Kind, x: number, z: number, bottom = 0, rot = 0): ObstacleDef => ({ kind, rot, x, z, bottom });
const drop = (kind: Kind, x: number, z: number, rot = 0, floor?: number): Step => ({ kind, x, z, rot, floor });

export function buildLevels(): Level[] {
  const list: Level[] = [
    // The board starts with pieces already on it, and they cannot be moved. Some are solid ground to build on; later
    // ones are unsteady or in each other's way: they fall once the physics runs, and what they hit goes with them.
    // "solve" is one way to win, "trap" the tempting attempt that does not hold (the tests play both).
    make('Premier pas', 4, null, 0, 0, stock('pillar', 1, 'cube', 2), fix('pillar', 0, 0), fix('cube', 2.5, 1.5), fix('cube', -2, -2))
      .rate(1)
      .story("L'aube", 'Les pièces grises sont fixes. Construisez dessus pour atteindre la zone.')
      .atmo(0)
      .withShard(2.5, 1.5, 1.5)
      .solve(drop('pillar', 0, 0), drop('cube', 2.5, 1.5))
      .solve(drop('pillar', 0, 0))
      .solve(drop('cube', 0, 0), drop('cube', 0, 0))
      .solve(drop('cube', 0, 0), drop('pillar', 0, 0)),
    make("L'escalier", 6, null, 1, 0, stock('pillar', 1, 'cube', 2, 'beam', 1), fix('stairs', 0, 0), fix('pillar', 3, -2.5), fix('cube', -3, 2.5))
      .rate(2)
      .story('Les degrés', 'Toute surface plane peut porter une pièce, même en hauteur.')
      .atmo(0)
      .withShard(3, 2.5, -2.5)
      .solve(drop('beam', 1, 0, orient(0, 4))) // the beam stood on its end: 3 more on top of the stairs
      .solve(drop('pillar', 1, 0), drop('cube', 1, 0), drop('cube', 3, -2.5))
      .solve(drop('pillar', 1, 0), drop('cube', 1, 0))
      .solve(drop('beam', 1, 0), drop('pillar', 1, 0))
      .solve(drop('beam', 1, 0), drop('cube', 1, 0), drop('cube', 1, 0)),
    make('La clef de voûte', 5, 'arch', 0, 0, stock('arch', 1, 'plate', 1, 'beam', 1, 'cube', 2), fix('stairs', -2, 0), fix('stairs', 2, 0, 0, 2), fix('cube', 0, -3))
      .rate(2)
      .story("L'enjambée", "L'arche enjambe le vide : chacun de ses pieds cherche un appui.")
      .atmo(1)
      .solve(drop('beam', -0.5, 0), drop('arch', 0, 0))
      .withShard(-2, 2.5, 0)
      .solve(drop('arch', 0, 0))
      .solve(drop('cube', -2, 0), drop('arch', 0, 0)),
    make('Sous l\'arche', 5, 'prism', 0, 0, stock('pillar', 1, 'cube', 2, 'beam', 1, 'prism', 1), fix('arch', 0, 0), fix('cube', -3, -2.5))
      .rate(3)
      .story('Le passage', 'Une forme est exigée au sommet : le prisme doit atteindre la zone.')
      .atmo(1)
      .withShard(-3, 1.5, -2.5)
      .solve(drop('pillar', 0, 0), drop('prism', 0, 0), drop('cube', -3, -2.5))
      .solve(drop('pillar', 0, 0), drop('prism', 0, 0))
      .solve(drop('beam', 0, 0), drop('cube', 0, 0), drop('prism', 0, 0))
      .solve(drop('cube', 0, 0), drop('cube', 0, 0), drop('prism', 0, 0)),
    // the pieces can be stood on their end (T): a beam goes up three, a plate three as well. Six more over the grey pillar
    // (flat, the whole stock only makes 7.5: the beam or the plate has to stand)
    make('Sur la tranche', 8, null, 0, 0, stock('beam', 1, 'plate', 1, 'pillar', 1, 'cube', 3), fix('pillar', 0, 0), fix('cube', -3, 2.5), fix('cube', 3, -2.5))
      .rate(3)
      .story('La verticale', 'Une pièce longue gagne en hauteur quand on la dresse sur sa tranche (T).')
      .atmo(2)
      .withShard(-3, 1.5, 2.5)
      .solve(drop('beam', 0, 0, orient(0, 4)), drop('pillar', 0, 0), drop('cube', 0, 0))
      .solve(drop('pillar', 0, 0), drop('beam', 0, 0, orient(0, 4)), drop('cube', 0, 0))
      .solve(drop('beam', 0, 0, orient(0, 4)), drop('plate', 0, 0, orient(0, 4)))
      .solve(drop('cube', 0, 0), drop('cube', 0, 0), drop('cube', 0, 0), drop('beam', 0, 0, orient(0, 4)))
      .solve(drop('beam', 0, 0, orient(0, 4)), drop('cube', 0, 0), drop('cube', 0, 0), drop('pillar', 0, 0), drop('cube', -3, 2.5))
      .trap(drop('pillar', 0, 0), drop('beam', 0, 0), drop('plate', 0, 0), drop('cube', 0, 0), drop('cube', 0, 0)),
    make('Les marches', 6, null, 1, 0, stock('stairs', 1, 'pillar', 1, 'cube', 2, 'beam', 1), fix('cube', -3, 2.5), fix('pillar', 3, -2.5))
      .rate(3)
      .story('La montée', "Une pièce en escalier est un socle : haute d'un côté, basse de l'autre.")
      .atmo(2)
      .solve(drop('stairs', 0, 0), drop('pillar', 1, 0), drop('beam', 1, 0))
      .solve(drop('beam', 0.5, 0, orient(0, 4)), drop('stairs', 1, 0, 2)) // the beam stood up, the stairs leaning their high end on it
      .solve(drop('stairs', 0, 0), drop('cube', 1, 0), drop('pillar', 1, 0))
      .withShard(-3, 1.5, 2.5)
      .solve(drop('stairs', 0, 0), drop('pillar', 1, 0), drop('cube', 1, 0))
      .solve(drop('stairs', 0, 0), drop('pillar', 1, 0), drop('cube', 1, 0), drop('cube', -3, 2.5)),
    // three pillars, each pushed out past the one under it: the top two fall off the first unless the middle one is propped
    // (or unless something heavy on the left of the middle one balances them: a cube there is enough)
    make('La tour de Pise', 9, null, 0.5, 0, stock('pillar', 2, 'cube', 3, 'beam', 1),
      fix('pillar', 0, 0), fix('pillar', 0.4, 0, 2), fix('pillar', 0.8, 0, 4), fix('pillar', -3, 2.5), fix('cube', -2.5, -3))
      .rate(4)
      .story("L'équilibre", 'Ce qui dépasse trop finit par tomber. Lancez la simulation pour voir.')
      .atmo(2)
      .withShard(-3, 2.5, 2.5)
      .solve(drop('pillar', 1, 0, 0, 0), drop('pillar', 0.5, 0), drop('cube', 0.5, 0), drop('cube', -3, 2.5))
      .solve(drop('pillar', 1, 0, 0, 0), drop('pillar', 0.5, 0), drop('cube', 0.5, 0))
      .solve(drop('cube', 1, 0, 0, 0), drop('cube', 1, 0, 0, 1), drop('pillar', 0.5, 0), drop('cube', 0.5, 0))
      .solve(drop('pillar', 1, 0, 0, 0), drop('pillar', 0.5, 0), drop('beam', 0.5, 0))
      .trap(drop('pillar', 0.5, 0), drop('cube', 0.5, 0)),
    make("L'équerre", 4, 'ell', 0, 0, stock('pillar', 1, 'cube', 2, 'ell', 1, 'plate', 1),
      fix('pillar', -1, 0), fix('beam', 0.25, 0, 2), fix('cube', 3, 3), fix('pillar', -3, -3))
      .rate(4)
      .story('Le coin', 'La poutre grise bascule d\'un côté : pointez le sol dessous pour glisser un appui.')
      .atmo(3)
      .solve(drop('pillar', 1, 0, 0, 0), drop('ell', 0, 0, 3))
      .solve(drop('cube', 1, 0, 0, 0), drop('cube', 1, 0, 0, 1), drop('ell', 0, 0, 3))
      .withShard(-3, 2.5, -3)
      .solve(drop('pillar', 1, 0, 0, 0), drop('ell', 0, 0))
      .solve(drop('pillar', 1, 0, 0, 0), drop('ell', 0, 0), drop('cube', -3, -3))
      .trap(drop('ell', 0, 0)),
    make('Le gouffre', 6, null, 0, 0, stock('plate', 1, 'pillar', 1, 'cube', 2, 'beam', 1), fix('stairs', -2, 0), fix('stairs', 2, 0, 0, 2))
      .rate(5)
      .story('Le vide', 'Une pièce longue peut relier deux appuis.')
      .atmo(3)
      .withShard(-2, 2.5, 0)
      .solve(drop('cube', -2, 0), drop('beam', -0.5, 0), drop('pillar', 0, 0))
      .solve(drop('plate', 0, 0.25, orient(1, 4))) // the plate stood on its edge across the gulf
      .solve(drop('plate', -0.5, 0), drop('pillar', 0, 0), drop('cube', 0, 0))
      .solve(drop('beam', -0.5, 0), drop('pillar', 0, 0))
      .solve(drop('beam', -0.5, 0), drop('cube', 0, 0), drop('cube', 0, 0)),
    // a beam out over the gulf, held by its near end: two pillars on it tip it, so its far end needs a column of exactly three
    // (or a weight on its near end)
    make('Le pont brisé', 8, null, 0, 0, stock('pillar', 3, 'cube', 3),
      fix('stairs', -2, 0), fix('stairs', 2.5, 0, 0, 2), fix('beam', -0.8, 0, 3), fix('cube', 3, 3), fix('pillar', -3, -3))
      .rate(6)
      .story('Le porte-à-faux', 'Une poutre qui dépasse a besoin d\'un appui sous son bout, ou d\'un poids derrière.')
      .atmo(3)
      .withShard(-3, 2.5, -3)
      .solve(drop('pillar', 0, 0, 0, 0), drop('cube', 0, 0, 0, 2), drop('pillar', 0, 0), drop('pillar', 0, 0), drop('cube', -3, -3))
      .solve(drop('pillar', 0, 0, 0, 0), drop('cube', 0, 0, 0, 2), drop('pillar', 0, 0), drop('pillar', 0, 0))
      .solve(drop('cube', 0, 0, 0, 0), drop('pillar', 0, 0, 0, 2), drop('pillar', 0, 0), drop('pillar', 0, 0))
      .solve(drop('cube', -2, 0), drop('pillar', 0, 0, 3), drop('pillar', 0, 0, 2)) // (the cube dead centre on the beam: off to one side it twisted the beam over)
      .trap(drop('pillar', 0, 0), drop('pillar', 0, 0)),
    // a lintel between two posts: the bridge must span two, and what stands on it needs a base that is not in the gap
    make('Le linteau', 6, null, 0, 0, stock('beam', 1, 'pillar', 2, 'cube', 2, 'plate', 1),
      fix('pillar', -1.5, 0), fix('pillar', 1.5, 0), fix('cube', 0, -3), fix('cube', 0, 3))
      .rate(6)
      .story('Les deux poteaux', 'Franchissez le vide entre les poteaux avant de monter, ou rehaussez les poteaux eux-mêmes.')
      .atmo(3)
      .withShard(0, 1.5, -3)
      .solve(drop('beam', 0, 0), drop('pillar', 0, 0), drop('cube', 0, 0))
      .solve(drop('plate', 0, 0), drop('pillar', 0, 0), drop('pillar', 0, 0))
      .solve(drop('pillar', -1.5, 0), drop('pillar', 1.5, 0), drop('beam', 0, 0), drop('cube', 0, 0))
      .solve(drop('pillar', -1.5, 0), drop('pillar', 1.5, 0), drop('plate', 0, 0), drop('cube', 0, 0), drop('cube', 0, 0))
      .solve(drop('beam', 0, 0), drop('pillar', 0, 0), drop('cube', 0, 0), drop('cube', 0, -3))
      .trap(drop('beam', 0, 0), drop('cube', 0, 0), drop('cube', 0, 0)),
    // a slab out over a pillar: it holds alone, and tips as soon as it is loaded at its far end
    make('Le surplomb', 7, null, 1.5, 0, stock('pillar', 3, 'cube', 2, 'beam', 1),
      fix('pillar', 0, 0), fix('plate', 0.4, 0, 2), fix('cube', -3, 3), fix('pillar', -3, -3))
      .rate(7)
      .story('La charge', 'Une dalle tient seule. Chargée, c\'est autre chose.')
      .atmo(4)
      .withShard(-3, 1.5, 3)
      .solve(drop('pillar', 1.5, 0, 0, 0), drop('pillar', 1.5, 0), drop('pillar', 1.5, 0), drop('cube', 1.5, 0), drop('cube', -3, 3))
      .solve(drop('pillar', 1.5, 0, 0, 0), drop('pillar', 1.5, 0), drop('pillar', 1.5, 0), drop('cube', 1.5, 0))
      .solve(drop('pillar', 1.5, 0, 0, 0), drop('pillar', 1.5, 0), drop('pillar', 1.5, 0), drop('beam', 1.5, 0))
      .solve(drop('pillar', 1.5, 0, 0, 0), drop('cube', 1.5, 0), drop('pillar', 1.5, 0), drop('pillar', 1.5, 0))
      .trap(drop('pillar', 1.5, 0), drop('pillar', 1.5, 0), drop('cube', 1.5, 0)),
    make('Le té', 4, 'tee', 1.5, 0, stock('pillar', 1, 'cube', 2, 'tee', 1, 'beam', 1),
      fix('pillar', 0, 0), fix('plate', 0.4, 0, 2), fix('cube', -3, 3), fix('pillar', -3, -3))
      .rate(7)
      .story('Le fléau', 'Une barre large est lourde aux deux bouts : elle charge ce qui la porte.')
      .atmo(4)
      .solve(drop('pillar', 1.5, 0, 0, 0), drop('beam', 1.5, 0), drop('tee', 1.5, 0))
      .solve(drop('beam', 1, 0), drop('pillar', 1.5, 0, 0, 0), drop('tee', 1.5, 0))
      .withShard(-3, 1.5, 3)
      .solve(drop('pillar', 1.5, 0, 0, 0), drop('cube', 1.5, 0), drop('tee', 1.5, 0))
      .solve(drop('pillar', 1.5, 0, 0, 0), drop('cube', 1.5, 0), drop('tee', 1.5, 0), drop('cube', -3, 3))
      .trap(drop('cube', 1.5, 0), drop('tee', 1.5, 0)),
    // a beam left lying across a pillar, more on one side than the other: it falls unless something holds its far end
    make('Le balancier', 7, null, 0, 0, stock('pillar', 2, 'cube', 2, 'plate', 1),
      fix('pillar', -1, 0), fix('beam', 0.25, 0, 2), fix('cube', 3, 3), fix('pillar', -3, -3))
      .rate(8)
      .story("L'appui", 'Pointez le sol sous une pièce pour glisser un appui dessous. Tournez la vue pour mieux voir.')
      .atmo(4)
      .withShard(3, 1.25, 3)
      .solve(drop('cube', 1, 0, 0, 0), drop('cube', 1, 0, 0, 1), drop('pillar', 0, 0), drop('pillar', 0, 0), drop('plate', 2.5, 3))
      .solve(drop('cube', 1, 0, 0, 0), drop('cube', 1, 0, 0, 1), drop('pillar', 0, 0), drop('pillar', 0, 0))
      .solve(drop('pillar', 1, 0, 0, 0), drop('pillar', 0, 0), drop('cube', 0, 0), drop('cube', 0, 0))
      .solve(drop('cube', 1, 0, 0, 0), drop('cube', 1.5, 0, 0, 1), drop('pillar', 0, 0), drop('pillar', 0, 0))
      .trap(drop('pillar', 0, 0), drop('pillar', 0, 0)),
    // two such towers, one on each side, and the middle is where they fall: prop both before building between them
    make("L'éboulement", 7, null, 0, 0, stock('pillar', 4, 'cube', 3),
      fix('pillar', -2.5, 0), fix('pillar', -2.1, 0, 2), fix('pillar', -1.7, 0, 4),
      fix('pillar', 2.5, 0), fix('pillar', 2.1, 0, 2), fix('pillar', 1.7, 0, 4))
      .rate(8)
      .story('Les deux tours', 'Observez où les choses tombent : elles peuvent aussi vous servir.')
      .atmo(4)
      .withShard(0, 1, 3)
      .solve(drop('pillar', 0, 0), drop('pillar', 0, 0), drop('cube', 0, 0), drop('cube', 0, 0), drop('cube', 0, 0), drop('pillar', 0, 3))
      .solve(drop('pillar', -1.5, 0, 0, 0), drop('pillar', 1.5, 0, 0, 0),
        drop('pillar', 0, 0), drop('pillar', 0, 0), drop('cube', 0, 0), drop('cube', 0, 0), drop('cube', 0, 0))
      .solve(drop('cube', -1.5, 0, 0, 0), drop('cube', -1.5, 0, 0, 1), drop('pillar', 1.5, 0, 0, 0),
        drop('pillar', 0, 0), drop('pillar', 0, 0), drop('pillar', 0, 0), drop('cube', 0, 0))
      .solve(drop('pillar', -1.5, 0, 0, 0), drop('cube', 1.5, 0, 0, 0), drop('cube', 1.5, 0, 0, 1),
        drop('pillar', 0, 0), drop('pillar', 0, 0), drop('pillar', 0, 0), drop('cube', 0, 0))
      // not propping at all also works: both towers fall inwards and lean on the column from each side, which holds it up
      .solve(drop('pillar', 0, 0), drop('pillar', 0, 0), drop('cube', 0, 0), drop('cube', 0, 0), drop('cube', 0, 0)),
    // everything at once: the bridge to hold up from below, and behind it a tower that falls on the bridge unless it is propped
    make('Les ruines', 8, null, 0, 0, stock('pillar', 4, 'cube', 2),
      fix('stairs', -2, 0), fix('stairs', 2.5, 0, 0, 2), fix('beam', -0.8, 0, 3),
      fix('pillar', 0, -3.5), fix('pillar', 0, -3.1, 2), fix('pillar', 0, -2.7, 4))
      .rate(9)
      .story('Le dernier ouvrage', 'Tout ce que vous avez appris, en même temps.')
      .atmo(5)
      .withShard(1.5, 3.5, 0)
      .solve(drop('pillar', 0, -2.5, 0, 0), drop('pillar', 0, 0, 0, 0), drop('cube', 0, 0, 0, 2), drop('pillar', 0, 0), drop('pillar', 0, 0), drop('cube', 1.5, 0))
      .solve(drop('pillar', 0, -2.5, 0, 0), drop('pillar', 0, 0, 0, 0), drop('cube', 0, 0, 0, 2), drop('pillar', 0, 0), drop('pillar', 0, 0))
      .solve(drop('pillar', 0, -2.5, 0, 0), drop('cube', 0, 0, 0, 0), drop('pillar', 0, 0, 0, 2), drop('pillar', 0, 0), drop('pillar', 0, 0))
      .solve(drop('pillar', 0, 0, 0, 0), drop('cube', 0, 0, 0, 2), drop('pillar', 0, 0), drop('pillar', 0, 0), drop('pillar', 0, -2.5, 0, 0))
      .trap(drop('pillar', 0, 0, 0, 0), drop('cube', 0, 0, 0, 2), drop('pillar', 0, 0), drop('pillar', 0, 0)),
    // the last one: a tall goal, a short stock, and the leaning pair that falls inward
    make('Le monolithe', 12, null, 0, 0, stock('beam', 2, 'pillar', 3, 'plate', 1, 'cube', 3), fix('cube', 3, 3), fix('pillar', -3, -3))
      .rate(10)
      .story('Le seuil', 'Tout debout, tout en équilibre : la tour la plus haute.')
      .atmo(5)
      .withShard(3, 1.5, 3)
      .solve(drop('pillar', 0, 0), drop('beam', 0, 0, orient(0, 4)), drop('beam', 0, 0, orient(0, 4)), drop('pillar', 0, 0), drop('pillar', 0, 0))
      .solve(drop('beam', 0, 0, orient(0, 4)), drop('pillar', 0, 0), drop('beam', 0, 0, orient(0, 4)), drop('pillar', 0, 0), drop('pillar', 0, 0))
      .solve(drop('pillar', 0, 0), drop('beam', 0, 0, orient(0, 4)), drop('beam', 0, 0, orient(0, 4)), drop('pillar', 0, 0), drop('cube', 0, 0), drop('cube', 0, 0))
      .solve(drop('pillar', 0, 0), drop('beam', 0, 0, orient(0, 4)), drop('beam', 0, 0, orient(0, 4)), drop('plate', 0, 0, orient(0, 4)), drop('cube', 0, 0))
      .solve(drop('pillar', 0, 0), drop('beam', 0, 0, orient(0, 4)), drop('beam', 0, 0, orient(0, 4)), drop('pillar', 0, 0), drop('pillar', 0, 0), drop('cube', 3, 3))
      .trap(drop('pillar', 0, 0), drop('beam', 0, 0, orient(0, 4)), drop('beam', 0, 0, orient(0, 4)), drop('plate', 0, 0, orient(0, 4))),
  ];

  // LEVEL 0: the tutorial. The grey pillar is 2 high and the zone is at 4: a pillar on it does it, two cubes do it, or the beam stood on end (5).
  const lesson = make('Tutoriel', 4, null, 0, 0, stock('beam', 1, 'pillar', 1, 'cube', 2), fix('pillar', 0, 0))
    .rate(0)
    .story("L'atelier", 'Les gestes de base, un par un.')
    .atmo(0)
    .solve(drop('beam', 0, 0, orient(0, 4)))
    .solve(drop('pillar', 0, 0))
    .solve(drop('cube', 0, 0), drop('cube', 0, 0))
    .solve(drop('beam', 0, 0), drop('cube', 0, 0));
  lesson.tutorial = true;

  const sandbox = new Level();
  sandbox.title = 'Bac à sable';
  sandbox.sandbox = true;
  sandbox.stock = stock('cube', 30, 'beam', 10, 'plate', 10, 'pillar', 10, 'prism', 8, 'ell', 8, 'tee', 8, 'arch', 6, 'stairs', 6);
  sandbox.platforms.push(platform(0, 0, 10, 10, 0));
  list.push(sandbox, lesson);
  return list;
}
