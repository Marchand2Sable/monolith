// Tiny vector and box helpers: the rules of the game run without any engine, so they use plain numbers.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

/** An axis-aligned box. */
export class Box {
  constructor(
    public min: Vec3,
    public max: Vec3,
  ) {}

  static fromCenter(c: Vec3, s: Vec3): Box {
    return new Box(v3(c.x - s.x / 2, c.y - s.y / 2, c.z - s.z / 2), v3(c.x + s.x / 2, c.y + s.y / 2, c.z + s.z / 2));
  }

  get center(): Vec3 {
    return v3((this.min.x + this.max.x) / 2, (this.min.y + this.max.y) / 2, (this.min.z + this.max.z) / 2);
  }

  get size(): Vec3 {
    return v3(this.max.x - this.min.x, this.max.y - this.min.y, this.max.z - this.min.z);
  }

  encapsulate(b: Box): this {
    this.min = v3(Math.min(this.min.x, b.min.x), Math.min(this.min.y, b.min.y), Math.min(this.min.z, b.min.z));
    this.max = v3(Math.max(this.max.x, b.max.x), Math.max(this.max.y, b.max.y), Math.max(this.max.z, b.max.z));
    return this;
  }

  /** Grows the box by `amount` on every side. */
  expanded(amount: number): Box {
    return new Box(
      v3(this.min.x - amount, this.min.y - amount, this.min.z - amount),
      v3(this.max.x + amount, this.max.y + amount, this.max.z + amount),
    );
  }

  contains(p: Vec3): boolean {
    return (
      p.x >= this.min.x && p.x <= this.max.x && p.y >= this.min.y && p.y <= this.max.y && p.z >= this.min.z && p.z <= this.max.z
    );
  }

  clone(): Box {
    return new Box({ ...this.min }, { ...this.max });
  }
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number): number => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, t: number): number => {
  const k = clamp01((t - a) / (b - a));
  return k * k * (3 - 2 * k);
};

/** A small deterministic random generator (mulberry32), so a place is always laid out the same way. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
