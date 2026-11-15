// The place around the board: sky, light, mist and the skyline of towers, gates and stairs, one composition per atmosphere.
// Each level names its atmosphere (Level.mood); the skyline of an atmosphere is always the same one, laid out without overlaps.
import * as THREE from 'three';
import { Box, clamp01, rng, smoothstep } from '../core/math';

type RGB = [number, number, number];

export interface Mood {
  name: string;
  skyTop: RGB;
  skyLow: RGB;
  mist: RGB;
  ambient: RGB;
  sunColor: RGB;
  pedestal: RGB;
  obstacle: RGB;
  towerTint: RGB;
  sun: number;
  towerLo: number;
  towerHi: number;
  sunDir: [number, number, number];
  seed: number;
  towers: number;
}

export const MOODS: Mood[] = [
  { name: 'Aube', skyTop: [0.3, 0.3, 0.33], skyLow: [0.8, 0.78, 0.74], mist: [0.86, 0.84, 0.8], ambient: [0.56, 0.55, 0.54], sunColor: [1, 0.97, 0.92], pedestal: [0.72, 0.7, 0.66], obstacle: [0.38, 0.38, 0.4], towerTint: [1, 0.98, 0.94], sun: 0.72, towerLo: 0.55, towerHi: 0.82, sunDir: [0.5, -0.8, 0.2], seed: 7, towers: 30 },
  { name: 'Brume', skyTop: [0.16, 0.18, 0.21], skyLow: [0.66, 0.7, 0.74], mist: [0.78, 0.82, 0.85], ambient: [0.52, 0.54, 0.58], sunColor: [0.96, 0.98, 1], pedestal: [0.66, 0.7, 0.72], obstacle: [0.37, 0.38, 0.41], towerTint: [0.93, 0.97, 1], sun: 0.66, towerLo: 0.5, towerHi: 0.78, sunDir: [0.35, -0.85, 0.35], seed: 21, towers: 28 },
  { name: 'Crépuscule', skyTop: [0.07, 0.07, 0.1], skyLow: [0.62, 0.52, 0.47], mist: [0.74, 0.66, 0.62], ambient: [0.47, 0.44, 0.46], sunColor: [1, 0.88, 0.76], pedestal: [0.62, 0.56, 0.54], obstacle: [0.36, 0.35, 0.38], towerTint: [1, 0.92, 0.88], sun: 0.64, towerLo: 0.4, towerHi: 0.7, sunDir: [0.8, -0.5, 0.3], seed: 33, towers: 28 },
  { name: 'Cendre', skyTop: [0.1, 0.1, 0.1], skyLow: [0.56, 0.56, 0.56], mist: [0.7, 0.7, 0.7], ambient: [0.5, 0.5, 0.5], sunColor: [1, 1, 1], pedestal: [0.58, 0.58, 0.58], obstacle: [0.4, 0.4, 0.42], towerTint: [1, 1, 1], sun: 0.7, towerLo: 0.42, towerHi: 0.66, sunDir: [0.2, -0.9, -0.3], seed: 45, towers: 32 },
  { name: 'Nuit', skyTop: [0.02, 0.02, 0.04], skyLow: [0.3, 0.34, 0.44], mist: [0.4, 0.44, 0.54], ambient: [0.36, 0.38, 0.46], sunColor: [0.78, 0.85, 1], pedestal: [0.4, 0.43, 0.52], obstacle: [0.47, 0.48, 0.52], towerTint: [0.8, 0.85, 1], sun: 0.52, towerLo: 0.3, towerHi: 0.52, sunDir: [0.4, -0.7, 0.6], seed: 57, towers: 30 },
  { name: 'Albâtre', skyTop: [0.55, 0.57, 0.6], skyLow: [0.96, 0.95, 0.92], mist: [0.97, 0.96, 0.94], ambient: [0.63, 0.63, 0.63], sunColor: [1, 0.99, 0.95], pedestal: [0.86, 0.85, 0.81], obstacle: [0.3, 0.3, 0.32], towerTint: [1, 1, 1], sun: 0.8, towerLo: 0.6, towerHi: 0.82, sunDir: [0.5, -0.8, 0.2], seed: 69, towers: 26 },
];

export const moodOf = (i: number): Mood => MOODS[Math.max(0, Math.min(MOODS.length - 1, i))];

export const color = (c: RGB): THREE.Color => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);

/** The sky gradient (a 1 x 256 strip): near-black at the top, pale mist at the bottom. */
export function paintSky(canvas: HTMLCanvasElement, m: Mood): void {
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(1, 256);
  for (let y = 0; y < 256; y++) {
    const t = y / 255; // 0 at the top of the screen
    const k = smoothstep(0, 1, clamp01((t - 0.12) / 0.88));
    for (let c = 0; c < 3; c++) img.data[y * 4 + c] = Math.round((m.skyTop[c] + (m.skyLow[c] - m.skyTop[c]) * k) * 255);
    img.data[y * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

let towerGradient: THREE.CanvasTexture | null = null;
let mistTexture: THREE.CanvasTexture | null = null;

/** A tower in the mist: dark at the top, fading to pale at the foot where the mist gathers. */
function gradientTexture(): THREE.CanvasTexture {
  if (towerGradient) return towerGradient;
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(1, 64);
  for (let y = 0; y < 64; y++) {
    // canvas row 0 is the top of the box: dark there, pale at the foot
    const fromBottom = 1 - y / 63;
    const v = 1 - 0.7 * smoothstep(0, 1, clamp01((fromBottom - 0.2) / 0.8));
    const g = Math.round(v * 255);
    img.data.set([g, g, g, 255], y * 4);
  }
  ctx.putImageData(img, 0, 0);
  towerGradient = new THREE.CanvasTexture(c);
  towerGradient.wrapS = towerGradient.wrapT = THREE.ClampToEdgeWrapping;
  return towerGradient;
}

export function hazeTexture(): THREE.CanvasTexture {
  if (mistTexture) return mistTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(64, 64);
  for (let py = 0; py < 64; py++)
    for (let px = 0; px < 64; px++) {
      const r = Math.hypot(px - 31.5, py - 31.5) / 32;
      const a = smoothstep(0, 1, 1 - clamp01(r));
      img.data.set([255, 255, 255, Math.round(a * 255)], (py * 64 + px) * 4);
    }
  ctx.putImageData(img, 0, 0);
  mistTexture = new THREE.CanvasTexture(c);
  return mistTexture;
}

function towerBox(w: number, h: number, d: number, tint: THREE.Color): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: tint, map: gradientTexture() }));
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;

/** Towers, gates and stairs in the mist all around the board, whichever way the camera turns, with no two touching. */
export function buildSkyline(m: Mood, zone: Box): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Skyline';
  const footprints: Rect[] = [];
  const free = (r: Rect): boolean => {
    const g = { x: r.x - 1.2, z: r.z - 1.2, w: r.w + 2.4, d: r.d + 2.4 };
    return !footprints.some((f) => overlap(f, g));
  };
  const rnd = rng(m.seed);
  const zs = zone.size;
  const zc = zone.center;
  const reach = Math.hypot(zs.x, zs.y, zs.z) / 2;
  const bottom = -9;
  let made = 0;

  const addMonolith = (cx: number, cz: number, w: number, d: number, topY: number, tint: THREE.Color): boolean => {
    const foot = { x: cx - w / 2, z: cz - d / 2, w, d };
    if (!free(foot)) return false;
    footprints.push(foot);
    const t = towerBox(w, topY - bottom, d, tint);
    t.position.set(cx, (topY + bottom) / 2, cz);
    group.add(t);
    return true;
  };
  /** Two legs and a lintel resting on both, the gate of the mock-ups. */
  const addGate = (cx: number, cz: number, w: number, d: number, topY: number, tint: THREE.Color): boolean => {
    const leg = Math.max(1.2, w * 0.5);
    const gap = w * 0.9;
    const total = gap + 2 * leg;
    const foot = { x: cx - total / 2, z: cz - d / 2, w: total, d };
    if (!free(foot)) return false;
    footprints.push(foot);
    const lintelH = Math.max(0.9, (topY - bottom) * 0.12);
    const legTop = topY - lintelH;
    for (const side of [-1, 1]) {
      const l = towerBox(leg, legTop - bottom, d, tint);
      l.position.set(cx + side * (gap / 2 + leg / 2), (legTop + bottom) / 2, cz);
      group.add(l);
    }
    const lin = towerBox(total, lintelH, d, tint);
    lin.position.set(cx, legTop + lintelH / 2, cz);
    group.add(lin);
    return true;
  };
  /** Steps climbing to one side: boxes of equal width, each one higher than the last. */
  const addStairs = (cx: number, cz: number, w: number, d: number, topY: number, tint: THREE.Color, alongX: boolean): boolean => {
    const steps = 4;
    const step = Math.max(1.4, w * 0.7);
    const length = steps * step;
    const foot = alongX ? { x: cx - length / 2, z: cz - d / 2, w: length, d } : { x: cx - d / 2, z: cz - length / 2, w: d, d: length };
    if (!free(foot)) return false;
    footprints.push(foot);
    for (let i = 0; i < steps; i++) {
      const top = Math.min(topY, 1.5) + (topY - Math.min(topY, 1.5)) * ((i + 1) / steps);
      const off = -length / 2 + step * (i + 0.5);
      const b = alongX ? towerBox(step, top - bottom, d, tint) : towerBox(d, top - bottom, step, tint);
      if (alongX) b.position.set(cx + off, (top + bottom) / 2, cz);
      else b.position.set(cx, (top + bottom) / 2, cz + off);
      group.add(b);
    }
    return true;
  };

  for (let attempt = 0; attempt < m.towers * 12 && made < m.towers; attempt++) {
    const angle = rnd() * Math.PI * 2;
    const radius = reach + 9 + rnd() * 34;
    // never tall enough to stand between the camera and the board, whichever side the camera is on
    const topY = 1.5 + (Math.min(0.45 * (radius - reach), 16) - 1.5) * rnd();
    const w = 1.8 + rnd() * 3.4;
    const d = w * (0.7 + rnd() * 0.7);
    const tone = m.towerLo + rnd() * (m.towerHi - m.towerLo);
    const tint = color([tone * m.towerTint[0], tone * m.towerTint[1], tone * m.towerTint[2]]);
    const cx = zc.x + Math.cos(angle) * radius;
    const cz = zc.z + Math.sin(angle) * radius;
    const kind = rnd();
    let ok: boolean;
    if (kind < 0.18) ok = addGate(cx, cz, w, d, topY, tint);
    else if (kind < 0.32) ok = addStairs(cx, cz, w, d, topY, tint, rnd() < 0.5);
    else ok = addMonolith(cx, cz, w, d, topY, tint);
    if (ok) made++;
  }
  return group;
}

/** Layers of mist stacked under the board, so the pedestal and the towers dissolve downwards. */
export function buildMist(m: Mood, zone: Box): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Mist';
  const c = zone.center;
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: color(m.mist), map: hazeTexture(), transparent: true, opacity: 0.5, depthWrite: false, fog: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(c.x, -2.5 - i * 2.6, c.z);
    group.add(plane);
  }
  return group;
}
