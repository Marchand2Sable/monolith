// How a piece is turned. There are 24 ways to stand a block-built piece on the board (the rotations of a cube), and an
// orientation is one small number for them: the low two bits are quarter turns around the vertical axis ("yaw", the turn
// the player gives on the board), the rest (0..5) is the "pose" the piece is first put in: standing, tipped forward, upside down,
// tipped back, or lying on either side. The piece is first put in its pose, then yawed.
// Orientations 0..3 are the plain yaw turns every level was built with.
import { v3, type Vec3 } from './math';

export const POSES = 6;
export const ORIENTATIONS = POSES * 4;

export const yawOf = (rot: number): number => rot & 3;
export const layOf = (rot: number): number => (rot >> 2) % POSES;
export const orient = (yaw: number, lay: number): number => ((((lay % POSES) + POSES) % POSES) << 2) | (yaw & 3);

type Quat = { x: number; y: number; z: number; w: number };

const qx = (quarters: number): Quat => ({ x: Math.sin((quarters * Math.PI) / 4), y: 0, z: 0, w: Math.cos((quarters * Math.PI) / 4) });
const qy = (quarters: number): Quat => ({ x: 0, y: Math.sin((quarters * Math.PI) / 4), z: 0, w: Math.cos((quarters * Math.PI) / 4) });
const qz = (quarters: number): Quat => ({ x: 0, y: 0, z: Math.sin((quarters * Math.PI) / 4), w: Math.cos((quarters * Math.PI) / 4) });

const mul = (a: Quat, b: Quat): Quat => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});

/** The poses, in the order the "lay" key goes through them. */
const POSE: Quat[] = [qx(0), qx(1), qx(2), qx(3), qz(1), qz(3)];

function rotateBy(q: Quat, p: Vec3): Vec3 {
  const xx = q.x * q.x, yy = q.y * q.y, zz = q.z * q.z;
  const xy = q.x * q.y, xz = q.x * q.z, yz = q.y * q.z;
  const wx = q.w * q.x, wy = q.w * q.y, wz = q.w * q.z;
  return v3(
    (1 - 2 * (yy + zz)) * p.x + 2 * (xy - wz) * p.y + 2 * (xz + wy) * p.z,
    2 * (xy + wz) * p.x + (1 - 2 * (xx + zz)) * p.y + 2 * (yz - wx) * p.z,
    2 * (xz - wy) * p.x + 2 * (yz + wx) * p.y + (1 - 2 * (xx + yy)) * p.z,
  );
}

/** The rotation as a unit quaternion (x, y, z, w): what the physics and the scene are given. */
export function quatOf(rot: number): Quat {
  // the pose first, then the turn on the board
  return mul(qy(yawOf(rot)), POSE[layOf(rot)]);
}

// each orientation as a 3x3 matrix of whole numbers (0, 1, -1), so that turning is exact and cheap
const MATRICES: number[][] = Array.from({ length: ORIENTATIONS }, (_, r) => {
  const q = quatOf(r);
  const cols = [v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)].map((e) => rotateBy(q, e));
  const snap = (n: number): number => Math.round(n) + 0; // + 0 turns -0 into 0
  return [snap(cols[0].x), snap(cols[1].x), snap(cols[2].x), snap(cols[0].y), snap(cols[1].y), snap(cols[2].y), snap(cols[0].z), snap(cols[1].z), snap(cols[2].z)];
});

/** The same turn as a rotation of the piece: a vector of its own frame, seen in the world. */
export function turn(v: Vec3, rot: number): Vec3 {
  const m = MATRICES[((rot % ORIENTATIONS) + ORIENTATIONS) % ORIENTATIONS];
  return v3(m[0] * v.x + m[1] * v.y + m[2] * v.z + 0, m[3] * v.x + m[4] * v.y + m[5] * v.z + 0, m[6] * v.x + m[7] * v.y + m[8] * v.z + 0);
}

/** The size of a box that turns with the piece (its centre turns too, see `turn`). */
export function turnSize(s: Vec3, rot: number): Vec3 {
  const m = MATRICES[((rot % ORIENTATIONS) + ORIENTATIONS) % ORIENTATIONS];
  return v3(
    Math.abs(m[0]) * s.x + Math.abs(m[1]) * s.y + Math.abs(m[2]) * s.z,
    Math.abs(m[3]) * s.x + Math.abs(m[4]) * s.y + Math.abs(m[5]) * s.z,
    Math.abs(m[6]) * s.x + Math.abs(m[7]) * s.y + Math.abs(m[8]) * s.z,
  );
}

/** The orientation after one more quarter turn on the board (yaw) or one more pose (lay), whether or not it looks different. */
export function spin(rot: number, axis: 'yaw' | 'lay', back = false): number {
  const d = back ? -1 : 1;
  return axis === 'yaw' ? orient(yawOf(rot) + (back ? 3 : 1), layOf(rot)) : orient(yawOf(rot), layOf(rot) + d);
}

export interface Box3 {
  center: Vec3;
  size: Vec3;
}

/** What the piece looks like on the board in this orientation, as a string: two orientations with the same string are the same shape. */
export function shapeKey(boxes: Box3[], rot: number): string {
  return boxes
    .map((b) => {
      const c = turn(b.center, rot);
      const s = turnSize(b.size, rot);
      return [c.x, c.y, c.z, s.x, s.y, s.z].map((n) => Math.round(n * 100) / 100).join(',');
    })
    .sort()
    .join('|');
}

/**
 * The next orientation along an axis that really looks different (a cube turned, or a pillar turned half a turn, is the same
 * shape: those presses are skipped). Returns the same number when nothing differs.
 */
export function stepOrientation(boxes: Box3[], rot: number, axis: 'yaw' | 'lay', back = false): number {
  const here = shapeKey(boxes, rot);
  let r = rot;
  for (let i = 0; i < POSES * 4; i++) {
    r = spin(r, axis, back);
    if (shapeKey(boxes, r) !== here) return r;
  }
  return rot;
}

/** One orientation of each different shape (a cube has one, a beam three...). */
export function distinctOrientations(boxes: Box3[]): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  for (let r = 0; r < ORIENTATIONS; r++) {
    const key = shapeKey(boxes, r);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}
