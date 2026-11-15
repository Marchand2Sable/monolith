// The nine shapes: the boxes each one is made of, its size, its mass, its name.
import { Box, v3, type Vec3 } from './math';

export type Kind = 'cube' | 'beam' | 'plate' | 'pillar' | 'prism' | 'ell' | 'tee' | 'arch' | 'stairs';

export const ALL_KINDS: readonly Kind[] = ['cube', 'beam', 'plate', 'pillar', 'prism', 'ell', 'tee', 'arch', 'stairs'];

/** One box of a piece, in the piece's own frame (its overall bounding box is centred on the origin). */
export interface Part {
  center: Vec3;
  size: Vec3;
}

const part = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): Part => ({
  center: v3(cx, cy, cz),
  size: v3(sx, sy, sz),
});

const PARTS: Record<Kind, Part[]> = {
  cube: [part(0, 0, 0, 1, 1, 1)],
  beam: [part(0, 0, 0, 3, 1, 1)],
  plate: [part(0, 0, 0, 3, 0.5, 2)],
  pillar: [part(0, 0, 0, 1, 2, 1)],
  prism: [part(0, 0, 0, 2, 1, 1)], // a roof: its box is only the envelope of the triangle
  ell: [part(0, 0, -0.5, 2, 1, 1), part(-0.5, 0, 0.5, 1, 1, 1)],
  tee: [part(0, 0, -0.5, 3, 1, 1), part(0, 0, 0.5, 1, 1, 1)],
  arch: [part(-1, -0.5, 0, 1, 1, 1), part(1, -0.5, 0, 1, 1, 1), part(0, 0.5, 0, 3, 1, 1)],
  stairs: [part(-1, -1, 0, 1, 1, 1), part(0, -0.5, 0, 1, 2, 1), part(1, 0, 0, 1, 3, 1)],
};

export const partsOf = (k: Kind): Part[] => PARTS[k];

/** The boxes that tell two orientations apart on screen: the parts, and for the roof a wide-below, narrow-above stand-in for its triangle. */
export function shapeBoxes(k: Kind): Part[] {
  return k === 'prism' ? [part(0, -0.25, 0, 2, 0.5, 1), part(0, 0.25, 0, 1, 0.5, 1)] : PARTS[k];
}

/** A flat top something else can stand on. A prism's roof is not one. */
export const flatTop = (k: Kind): boolean => k !== 'prism';

/** Overall size (x, y, z) of the piece when not turned. */
export function sizeOf(k: Kind): Vec3 {
  let b: Box | null = null;
  for (const p of PARTS[k]) {
    const pb = Box.fromCenter(p.center, p.size);
    b = b ? b.encapsulate(pb) : pb;
  }
  return b!.size;
}

export function volumeOf(k: Kind): number {
  let v = 0;
  for (const p of PARTS[k]) v += p.size.x * p.size.y * p.size.z;
  return k === 'prism' ? v * 0.5 : v;
}

const NAMES: Record<Kind, string> = {
  cube: 'Cube',
  beam: 'Poutre',
  plate: 'Plaque',
  pillar: 'Pilier',
  prism: 'Prisme',
  ell: 'Équerre',
  tee: 'Té',
  arch: 'Arche',
  stairs: 'Escalier',
};

export const nameOf = (k: Kind): string => NAMES[k];

const ARTICLES: Record<Kind, string> = {
  cube: 'un cube',
  beam: 'une poutre',
  plate: 'une plaque',
  pillar: 'un pilier',
  prism: 'un prisme',
  ell: 'une équerre',
  tee: 'un té',
  arch: 'une arche',
  stairs: 'un escalier',
};

/** The name with its indefinite article, for sentences. */
export const withArticle = (k: Kind): string => ARTICLES[k];

/** Base colour (r, g, b in 0..1) of each shape; the plate is the black slab of the mock-ups. */
const TONES: Record<Kind, [number, number, number]> = {
  cube: [0.9, 0.9, 0.88],
  beam: [0.86, 0.86, 0.84],
  plate: [0.07, 0.07, 0.08],
  pillar: [0.92, 0.92, 0.9],
  prism: [0.94, 0.94, 0.92],
  ell: [0.88, 0.88, 0.86],
  tee: [0.84, 0.84, 0.82],
  arch: [0.91, 0.91, 0.89],
  stairs: [0.87, 0.87, 0.85],
};

export const toneOf = (k: Kind): [number, number, number] => TONES[k];
