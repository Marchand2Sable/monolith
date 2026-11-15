// How a piece looks: its boxes (or the roof mesh for a prism), turned by its quarter turns, in the colours of the chosen look.
import * as THREE from 'three';
import { partsOf, toneOf, type Kind } from '../core/kinds';
import type { Vec3 } from '../core/math';
import { quatOf } from '../core/orient';
import type { Theme } from '../game/save';

const materials = new Map<string, THREE.MeshStandardMaterial>();

/** A matt material of the given colour (cached: one per colour). */
export function tint(c: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  const col = new THREE.Color(c);
  const key = col.getHexString();
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.92, metalness: 0 });
    materials.set(key, m);
  }
  return m;
}

export function rgb(c: [number, number, number]): THREE.Color {
  return new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
}

/** The colour of a shape in the look the player has chosen (the black plate stays black). */
export function pieceTone(kind: Kind, theme: Theme): THREE.Color {
  const t = toneOf(kind);
  if (kind === 'plate') return rgb(t);
  return rgb([t[0] * theme.tint[0], t[1] * theme.tint[1], t[2] * theme.tint[2]]);
}

let prismGeometry: THREE.BufferGeometry | null = null;

/** A roof: a triangle 2 wide and 1 high, 1 deep, with flat faces. */
export function prismGeo(): THREE.BufferGeometry {
  if (prismGeometry) return prismGeometry;
  const pos: number[] = [];
  const face = (pts: THREE.Vector3[], outward: THREE.Vector3): void => {
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[0], b = pts[i], c = pts[i + 1];
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      const tri = n.dot(outward) > 0 ? [a, b, c] : [a, c, b]; // counter-clockwise seen from outside
      for (const p of tri) pos.push(p.x, p.y, p.z);
    }
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const a0 = V(-1, -0.5, 0.5), a1 = V(1, -0.5, 0.5), a2 = V(0, 0.5, 0.5);
  const b0 = V(-1, -0.5, -0.5), b1 = V(1, -0.5, -0.5), b2 = V(0, 0.5, -0.5);
  face([a0, a1, a2], V(0, 0, 1));
  face([b0, b1, b2], V(0, 0, -1));
  face([a0, a1, b1, b0], V(0, -1, 0));
  face([a1, a2, b2, b1], V(1, 2, 0));
  face([a2, a0, b0, b2], V(-1, 2, 0));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  prismGeometry = g;
  return g;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

/** A piece in the scene: one group, turned by its quarter turns, made of its boxes. */
export function makePieceView(kind: Kind, rot: number, pos: Vec3, material: THREE.Material, shadows = true): THREE.Group {
  const root = new THREE.Group();
  root.name = kind;
  root.position.set(pos.x, pos.y, pos.z);
  const q = quatOf(rot);
  root.quaternion.set(q.x, q.y, q.z, q.w);
  root.userData.kind = kind;
  if (kind === 'prism') {
    const m = new THREE.Mesh(prismGeo(), material);
    m.castShadow = m.receiveShadow = shadows;
    root.add(m);
    return root;
  }
  for (const p of partsOf(kind)) {
    const m = new THREE.Mesh(boxGeo, material);
    m.position.set(p.center.x, p.center.y, p.center.z);
    m.scale.set(p.size.x, p.size.y, p.size.z);
    m.castShadow = m.receiveShadow = shadows;
    root.add(m);
  }
  return root;
}

export function paint(view: THREE.Object3D, material: THREE.Material): void {
  view.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = material;
  });
}

/** Renders a small picture of every shape (for the tray) with its own little renderer. */
export function renderIcons(theme: Theme, size = 112): Record<Kind, string> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(size, size, false);
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(-3, 5, -2);
  scene.add(sun);
  const cam = new THREE.OrthographicCamera(-2.3, 2.3, 2.3, -2.3, 0.1, 50);
  cam.position.set(-10, 8.2, -10);
  cam.lookAt(0, 0, 0);
  const out = {} as Record<Kind, string>;
  const kinds: Kind[] = ['cube', 'beam', 'plate', 'pillar', 'prism', 'ell', 'tee', 'arch', 'stairs'];
  for (const k of kinds) {
    const view = makePieceView(k, 0, { x: 0, y: 0, z: 0 }, tint(pieceTone(k, theme)), false);
    // the piece is centred by its own bounds
    scene.add(view);
    r.render(scene, cam);
    out[k] = canvas.toDataURL('image/png');
    scene.remove(view);
  }
  r.dispose();
  return out;
}
