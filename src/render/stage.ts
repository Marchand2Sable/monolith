// The 3D scene: sky, light, the board and its place, the pieces, the goal, the shard, the little effects. It draws; it decides nothing.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Box, v3, type Vec3 } from '../core/math';
import { extents } from '../core/board';
import { obstaclePos, type Level, type Objective } from '../core/levels';
import { partsOf, sizeOf, type Kind } from '../core/kinds';
import { quatOf } from '../core/orient';
import type { Theme } from '../game/save';
import type { Sim } from '../physics/sim';
import { buildMist, buildSkyline, color, hazeTexture, moodOf, paintSky, type Mood } from './atmosphere';
import { OrbitCamera } from './orbit';
import { unionEdges } from './outline';
import { makePieceView, paint, pieceTone, prismGeo, rgb, tint } from './pieces';

const LIGHT = Math.PI; // legacy-style light intensities (the Unity values) need this factor under physically based lighting

interface Fx {
  obj: THREE.Object3D;
  time: number;
  life: number;
  tick: (k: number) => void;
  done?: () => void;
}

interface SimLink {
  view: THREE.Object3D;
  body: Sim['pieces'][number];
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly orbit = new OrbitCamera();
  private sky: HTMLCanvasElement;
  private skyTexture: THREE.CanvasTexture;
  private sun = new THREE.DirectionalLight(0xffffff, 1);
  private ambient = new THREE.AmbientLight(0xffffff, 1);
  private scenery = new THREE.Group(); // everything of the place (rebuilt per level)
  private solids = new THREE.Group(); // invisible platform boxes: only there for the pointer
  private obstacleGroup = new THREE.Group();
  private pieceGroup = new THREE.Group();
  private goalGroup = new THREE.Group();
  private fxGroup = new THREE.Group();
  private lineMaterials: LineMaterial[] = [];
  private level!: Level;
  private mood!: Mood;
  private theme!: Theme;
  private zoneLines: LineMaterial | null = null;
  private zoneFill: THREE.MeshBasicMaterial | null = null;
  private zoneBlend = 0; // 0 dull .. 1 lit (the goal is met)
  private heightLine: LineSegments2 | null = null;
  private shard: THREE.Group | null = null;
  private shardGlow: THREE.Sprite | null = null;
  shardVisible = true;
  private obstacleViews: THREE.Group[] = [];
  private pieceViews = new Map<number, THREE.Group>();
  private ghost: THREE.Group | null = null;
  private simLinks: SimLink[] = [];
  private effects: Fx[] = [];
  private pulses = new Map<THREE.Object3D, number>();
  private raycaster = new THREE.Raycaster();
  private size = { w: 1, h: 1 };
  goalVisible = true;
  time = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.sky = document.createElement('canvas');
    this.sky.width = 1;
    this.sky.height = 256;
    this.skyTexture = new THREE.CanvasTexture(this.sky);
    this.skyTexture.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.skyTexture;

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -16;
    sc.right = 16;
    sc.top = 16;
    sc.bottom = -16;
    sc.near = 1;
    sc.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.intensity = 0.55;
    this.scene.add(this.sun, this.sun.target, this.ambient);
    this.scene.add(this.scenery, this.solids, this.obstacleGroup, this.pieceGroup, this.goalGroup, this.fxGroup);
    this.orbit.camera.position.set(-40, 40, -40);
  }

  // ------------------------------------------------------------------ size and frame
  resize(w: number, h: number): void {
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.orbit.setViewport(w, h);
    for (const m of this.lineMaterials) m.resolution.set(w, h);
  }

  render(dt: number): void {
    this.time += dt;
    this.orbit.update(dt, this.time);
    this.updateEffects(dt);
    this.updateGoal(dt);
    this.updateHeightLine();
    this.updateShard();
    this.syncSim();
    this.renderer.render(this.scene, this.orbit.camera);
  }

  // ------------------------------------------------------------------ level
  loadLevel(level: Level, theme: Theme): void {
    this.level = level;
    this.theme = theme;
    this.mood = moodOf(level.mood);
    this.clearGroup(this.scenery);
    this.clearGroup(this.solids);
    this.clearGroup(this.obstacleGroup);
    this.clearGroup(this.pieceGroup);
    this.clearGroup(this.goalGroup);
    this.clearGroup(this.fxGroup);
    this.lineMaterials = [];
    this.pieceViews.clear();
    this.obstacleViews = [];
    this.effects = [];
    this.pulses.clear();
    this.simLinks = [];
    this.ghost = null;
    this.zoneLines = null;
    this.zoneFill = null;
    this.heightLine = null;
    this.shard = null;
    this.shardGlow = null;
    this.selection = null;
    this.zoneBlend = 0;

    this.applyMood(this.mood);
    this.buildPlatforms(this.mood);
    this.buildObstacles();
    const zone = level.zone;
    this.scenery.add(buildSkyline(this.mood, zone));
    this.scenery.add(buildMist(this.mood, zone));
    const goal = level.goal;
    if (goal) {
      this.buildGoalZone(goal);
      this.buildHeightLine(goal.height);
    }
    this.buildShard();
    const zs = zone.size;
    this.orbit.frame(new THREE.Vector3(zone.center.x, 0, zone.center.z), Math.max(zs.x, zs.z), Math.max(3, (level.heightGoal ?? 0) + 2));
  }

  /** Sky, light and ambient of an atmosphere. */
  private applyMood(m: Mood): void {
    paintSky(this.sky, m);
    this.skyTexture.needsUpdate = true;
    this.sun.intensity = m.sun * LIGHT;
    this.sun.color = color(m.sunColor);
    const d = new THREE.Vector3(...m.sunDir).normalize();
    this.sun.position.copy(d).multiplyScalar(-40);
    this.sun.target.position.set(0, 0, 0);
    this.ambient.color = color(m.ambient);
    this.ambient.intensity = 1 * LIGHT;
  }

  private buildPlatforms(m: Mood): void {
    for (const p of this.level.platforms) {
      const b = p.bounds;
      const c = b.center;
      const s = b.size;
      // the solid (invisible: it only carries the pointer), a thin black slab on top, a pale pedestal below
      const solid = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), tint(0x000000));
      solid.position.set(c.x, c.y, c.z);
      solid.visible = false;
      solid.userData.platform = true;
      this.solids.add(solid);
      const slabH = 0.5;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(s.x, slabH, s.z), tint(rgb([0.05, 0.05, 0.06])));
      slab.position.set(c.x, b.max.y - slabH / 2, c.z);
      slab.receiveShadow = true;
      this.scenery.add(slab);
      const depth = 12;
      const below = b.max.y - slabH;
      const ped = new THREE.Mesh(new THREE.BoxGeometry(s.x - 0.02, depth, s.z - 0.02), tint(color(m.pedestal)));
      ped.position.set(c.x, below - depth / 2, c.z);
      this.scenery.add(ped);
    }
  }

  /** The pieces already standing on the board, a little darker than the player's. Calling this again puts them back as the level has them. */
  buildObstacles(): void {
    this.clearGroup(this.obstacleGroup);
    this.obstacleViews = [];
    const mat = tint(color(this.mood.obstacle));
    for (const o of this.level.obstacles) {
      const v = makePieceView(o.kind, o.rot, obstaclePos(o), mat);
      v.userData.obstacle = true;
      this.obstacleGroup.add(v);
      this.obstacleViews.push(v);
    }
  }

  // ------------------------------------------------------------------ goal
  private lineMaterial(width: number, c: THREE.ColorRepresentation, dashed = true): LineMaterial {
    const m = new LineMaterial({ color: new THREE.Color(c).getHex(), linewidth: width, worldUnits: true, dashed, dashSize: 0.18, gapSize: 0.14, transparent: true, depthWrite: false });
    m.resolution.set(this.size.w, this.size.h);
    this.lineMaterials.push(m);
    return m;
  }

  private segments(points: number[], material: LineMaterial): LineSegments2 {
    const g = new LineSegmentsGeometry();
    g.setPositions(points);
    const l = new LineSegments2(g, material);
    l.computeLineDistances();
    l.frustumCulled = false;
    return l;
  }

  private boxEdges(c: Vec3, half: Vec3): number[] {
    const pts: number[] = [];
    const corner = (i: number): Vec3 => v3(c.x + ((i & 1) !== 0 ? half.x : -half.x), c.y + ((i & 2) !== 0 ? half.y : -half.y), c.z + ((i & 4) !== 0 ? half.z : -half.z));
    for (let i = 0; i < 8; i++)
      for (let bit = 0; bit < 3; bit++) {
        if ((i & (1 << bit)) !== 0) continue; // each edge once
        const a = corner(i);
        const b = corner(i | (1 << bit));
        pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    return pts;
  }

  /**
   * The zone to reach: a dashed box one unit tall whose top is at the goal height, over the spot the goal names. A piece reaches it when its top
   * is at that height or above, so the top of the piece fills the box. The box turns to the look's accent colour while the goal is met.
   * When the goal names a shape, the shape's own outline (top on the goal height) takes the box's place: drawing both, one inside the other,
   * read as a stray cube tangled with the shape. It is only a picture; nothing collides with it.
   */
  private buildGoalZone(g: Objective): void {
    const root = new THREE.Group();
    root.name = 'GoalZone';
    this.zoneLines = this.lineMaterial(0.055, 0xf5f5ef);
    this.zoneFill = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false });
    if (g.with) {
      const kind = g.with;
      const origin = v3(g.cx, g.height - sizeOf(kind).y / 2, g.cz);
      const pts: number[] = [];
      if (kind === 'prism') {
        const a = [v3(-1, -0.5, 0.5), v3(1, -0.5, 0.5), v3(0, 0.5, 0.5)];
        for (let i = 0; i < 3; i++) {
          const p = a[i], q = a[(i + 1) % 3];
          pts.push(origin.x + p.x, origin.y + p.y, origin.z + p.z, origin.x + q.x, origin.y + q.y, origin.z + q.z);
          pts.push(origin.x + p.x, origin.y + p.y, origin.z - p.z, origin.x + q.x, origin.y + q.y, origin.z - q.z);
          pts.push(origin.x + p.x, origin.y + p.y, origin.z + p.z, origin.x + p.x, origin.y + p.y, origin.z - p.z);
        }
        const body = new THREE.Mesh(prismGeo(), this.zoneFill);
        body.position.set(origin.x, origin.y, origin.z);
        root.add(body);
      } else {
        const parts = partsOf(kind);
        const local = unionEdges(parts);
        for (let i = 0; i < local.length; i += 3) pts.push(origin.x + local[i], origin.y + local[i + 1], origin.z + local[i + 2]);
        for (const part of parts) {
          const body = new THREE.Mesh(new THREE.BoxGeometry(part.size.x, part.size.y, part.size.z), this.zoneFill);
          body.position.set(origin.x + part.center.x, origin.y + part.center.y, origin.z + part.center.z);
          root.add(body);
        }
      }
      root.add(this.segments(pts, this.zoneLines));
    } else {
      const c = v3(g.cx, g.height - 0.5, g.cz);
      root.add(this.segments(this.boxEdges(c, v3(g.w / 2, 0.5, g.d / 2)), this.zoneLines));
      const body = new THREE.Mesh(new THREE.BoxGeometry(g.w, 1, g.d), this.zoneFill);
      body.position.set(c.x, c.y, c.z);
      root.add(body);
    }
    this.goalGroup.add(root);
  }

  private zoneMet = false;
  /** The zone brightens, in the look's accent colour, while the goal is met (a piece in it, or higher, standing at this moment). */
  setZoneMet(met: boolean): void {
    this.zoneMet = met;
  }

  private updateGoal(dt: number): void {
    this.goalGroup.visible = this.goalVisible;
    if (this.heightLine) this.heightLine.visible = this.goalVisible;
    if (!this.zoneLines || !this.zoneFill) return;
    const k = 1 - Math.exp(-12 * dt);
    this.zoneBlend += ((this.zoneMet ? 1 : 0) - this.zoneBlend) * k;
    let accent = this.theme.accent;
    if (accent[0] + accent[1] + accent[2] > 2.7) accent = [0.62, 0.95, 0.78]; // the white look has no colour to show it with: a soft mint
    const dull = new THREE.Color(0xf5f5ef);
    const lit = rgb(accent);
    const c = dull.clone().lerp(lit, this.zoneBlend);
    this.zoneLines.color.copy(c);
    this.zoneLines.opacity = 0.95;
    this.zoneFill.color.copy(c);
    this.zoneFill.opacity = 0.1 + 0.16 * this.zoneBlend;
  }

  private buildHeightLine(h: number): void {
    // a horizontal dash across the middle of the view at the goal height (placed every frame, see updateHeightLine)
    this.heightLine = this.segments([0, h, 0, 1, h, 0], this.lineMaterial(0.045, 0xf5f5ef));
    this.heightLine.name = 'HeightLine';
    this.heightLine.material.opacity = 0.9;
    this.scene.add(this.heightLine);
    this.scenery.userData.heightLine = this.heightLine;
  }

  private updateHeightLine(): void {
    if (!this.heightLine || !this.level.goal) return;
    const z = this.level.zone;
    const right = new THREE.Vector3().setFromMatrixColumn(this.orbit.camera.matrixWorld, 0);
    right.y = 0;
    right.normalize();
    const c = z.center;
    const half = Math.max(z.size.x, z.size.z) * 0.5;
    const h = this.level.goal.height;
    const a = new THREE.Vector3(c.x, h, c.z).addScaledVector(right, -half);
    const b = new THREE.Vector3(c.x, h, c.z).addScaledVector(right, half);
    const g = this.heightLine.geometry as LineSegmentsGeometry;
    g.setPositions([a.x, a.y, a.z, b.x, b.y, b.z]);
    this.heightLine.computeLineDistances();
  }

  /** World position on screen, in CSS pixels. */
  project(p: Vec3): { x: number; y: number } {
    const v = new THREE.Vector3(p.x, p.y, p.z).project(this.orbit.camera);
    return { x: (v.x * 0.5 + 0.5) * this.size.w, y: (-v.y * 0.5 + 0.5) * this.size.h };
  }

  // ------------------------------------------------------------------ shard
  private buildShard(): void {
    const s = this.level.shard;
    if (!s) return;
    let accent = this.theme.accent;
    if (accent[0] + accent[1] + accent[2] > 2.7) accent = [0.62, 0.95, 0.78];
    const g = new THREE.Group();
    g.position.set(s.x, s.y, s.z);
    const gem = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: rgb(accent) }));
    gem.rotation.set(Math.PI / 4, 0, Math.PI / 4);
    g.add(gem);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: hazeTexture(), color: rgb(accent), transparent: true, opacity: 0.28, depthWrite: false }));
    glow.scale.set(1.5, 1.5, 1);
    g.add(glow);
    this.shard = g;
    this.shardGlow = glow;
    this.scenery.add(g);
  }

  private updateShard(): void {
    if (!this.shard || !this.level.shard) return;
    const show = this.goalVisible && this.shardVisible;
    this.shard.visible = show;
    if (!show) return;
    this.shard.rotation.y = this.time * 1.22;
    const b = this.level.shard;
    this.shard.position.set(b.x, b.y + Math.sin(this.time * 2.2) * 0.07, b.z);
    if (this.shardGlow) this.shardGlow.material.rotation = 0;
  }

  // ------------------------------------------------------------------ pieces
  pieceMaterial(kind: Kind): THREE.Material {
    return tint(pieceTone(kind, this.theme));
  }

  addPiece(id: number, kind: Kind, rot: number, pos: Vec3): THREE.Group {
    const v = makePieceView(kind, rot, pos, this.pieceMaterial(kind));
    v.userData.pieceId = id;
    this.pieceGroup.add(v);
    this.pieceViews.set(id, v);
    return v;
  }

  removePiece(id: number): void {
    const v = this.pieceViews.get(id);
    if (v) this.pieceGroup.remove(v);
    this.pieceViews.delete(id);
    this.pulses.delete(v as THREE.Object3D);
  }

  clearPieces(): void {
    for (const id of [...this.pieceViews.keys()]) this.removePiece(id);
  }

  movePiece(id: number, rot: number, pos: Vec3): void {
    const v = this.pieceViews.get(id);
    if (!v) return;
    v.position.set(pos.x, pos.y, pos.z);
    const q = quatOf(rot);
    v.quaternion.set(q.x, q.y, q.z, q.w);
  }

  setPieceVisible(id: number, on: boolean): void {
    const v = this.pieceViews.get(id);
    if (v) v.visible = on;
  }

  /** Re-colours everything for a new look (the pieces and the shard). */
  setTheme(theme: Theme): void {
    this.theme = theme;
    for (const v of this.pieceViews.values()) paint(v, this.pieceMaterial(v.userData.kind as Kind));
    if (this.shard) {
      this.scenery.remove(this.shard);
      this.shard = null;
      this.buildShard();
    }
  }

  // ------------------------------------------------------------------ ghost
  setGhost(kind: Kind, rot: number, valid: boolean): THREE.Group {
    if (this.ghost && (this.ghost.userData.kind !== kind || this.ghost.userData.rot !== rot)) {
      this.fxGroup.remove(this.ghost);
      this.ghost = null;
    }
    if (!this.ghost) {
      this.ghost = makePieceView(kind, rot, v3(0, -50, 0), tint(0xffffff), false);
      this.ghost.userData.rot = rot;
      this.ghost.userData.fresh = true;
      this.fxGroup.add(this.ghost);
    }
    paint(this.ghost, tint(valid ? 0xffffff : rgb([0.72, 0.25, 0.25])));
    return this.ghost;
  }

  /** Puts the ghost where it should be: at once the first time, then it glides. */
  placeGhost(pos: Vec3, dt = 0): void {
    const g = this.ghost;
    if (!g) return;
    if (g.userData.fresh) {
      g.position.set(pos.x, pos.y, pos.z);
      g.userData.fresh = false;
    } else {
      const k = 1 - Math.exp(-30 * dt);
      g.position.lerp(new THREE.Vector3(pos.x, pos.y, pos.z), dt === 0 ? 1 : k);
    }
    g.userData.target = pos;
  }

  glideGhost(dt: number): void {
    const g = this.ghost;
    if (!g || g.userData.fresh || !g.userData.target) return;
    const t = g.userData.target as Vec3;
    g.position.lerp(new THREE.Vector3(t.x, t.y, t.z), 1 - Math.exp(-30 * dt));
  }

  clearGhost(): void {
    if (this.ghost) this.fxGroup.remove(this.ghost);
    this.ghost = null;
  }

  // ------------------------------------------------------------------ picking
  private ndc(x: number, y: number): THREE.Vector2 {
    return new THREE.Vector2((x / this.size.w) * 2 - 1, -(y / this.size.h) * 2 + 1);
  }

  /** The first thing under a screen point (platform, fixed piece or placed piece): its point and the normal of the face. */
  pick(x: number, y: number): { point: Vec3; normal: Vec3; pieceId?: number } | null {
    this.orbit.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.ndc(x, y), this.orbit.camera);
    const targets: THREE.Object3D[] = [this.solids, this.obstacleGroup, this.pieceGroup];
    const hits = this.raycaster.intersectObjects(targets, true).filter((h) => {
      // a piece that is being dragged is hidden: it must not be hit
      let o: THREE.Object3D | null = h.object;
      while (o) {
        if (o.visible === false && !o.userData.platform) return false;
        o = o.parent;
      }
      return true;
    });
    if (!hits.length) return null;
    const h = hits[0];
    const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    let o: THREE.Object3D | null = h.object;
    let pieceId: number | undefined;
    while (o) {
      if (o.userData.pieceId !== undefined) pieceId = o.userData.pieceId as number;
      o = o.parent;
    }
    return { point: v3(h.point.x, h.point.y, h.point.z), normal: v3(n.x, n.y, n.z), pieceId };
  }

  /** Where the ray under a screen point meets the horizontal plane at height 0 (when nothing is hit). */
  groundPoint(x: number, y: number): Vec3 | null {
    this.orbit.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.ndc(x, y), this.orbit.camera);
    const p = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p);
    return hit ? v3(p.x, p.y, p.z) : null;
  }

  // ------------------------------------------------------------------ simulation
  /** Starts following the bodies of a run: each piece view takes the place of its body every frame. */
  followSim(sim: Sim, ids: number[]): void {
    this.simLinks = [];
    sim.pieces.forEach((b, i) => {
      const v = this.pieceViews.get(ids[i]);
      if (v) this.simLinks.push({ view: v, body: b });
    });
    sim.fixed.forEach((b, i) => this.simLinks.push({ view: this.obstacleViews[i], body: b }));
  }

  stopFollowing(): void {
    this.simLinks = [];
  }

  private syncSim(): void {
    for (const l of this.simLinks) {
      const t = l.body.body.translation();
      const r = l.body.body.rotation();
      l.view.position.set(t.x, t.y, t.z);
      l.view.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  /** The box of every part of a piece, where it really is now. */
  partBounds(id: number): Box[] {
    const v = this.pieceViews.get(id);
    if (!v) return [];
    v.updateMatrixWorld(true);
    const out: Box[] = [];
    v.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const b = new THREE.Box3().setFromObject(o);
        out.push(new Box(v3(b.min.x, b.min.y, b.min.z), v3(b.max.x, b.max.y, b.max.z)));
      }
    });
    return out;
  }

  private selection: LineSegments2 | null = null;

  /** A thin outline around the selected piece (null clears it). */
  setSelection(p: { kind: Kind; rot: number; pos: Vec3 } | null): void {
    if (this.selection) {
      this.fxGroup.remove(this.selection);
      (this.selection.geometry as LineSegmentsGeometry).dispose();
      this.lineMaterials = this.lineMaterials.filter((m) => m !== this.selection!.material);
      (this.selection.material as LineMaterial).dispose();
      this.selection = null;
    }
    if (!p) return;
    const e = extents(p.kind, p.rot);
    const mat = this.lineMaterial(0.03, 0xffffff, false);
    mat.opacity = 0.55;
    this.selection = this.segments(this.boxEdges(p.pos, v3(e.x / 2 + 0.03, e.y / 2 + 0.03, e.z / 2 + 0.03)), mat);
    this.fxGroup.add(this.selection);
  }

  /** The box a view really occupies now (what the shard test and the HUD counter look at). */
  viewBounds(id: number): Box | null {
    const v = this.pieceViews.get(id);
    if (!v) return null;
    v.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(v);
    return new Box(v3(b.min.x, b.min.y, b.min.z), v3(b.max.x, b.max.y, b.max.z));
  }

  // ------------------------------------------------------------------ effects
  /** A piece has been put down: it swells a little and settles, and a square ring spreads on the surface it stands on. */
  placed(id: number, kind: Kind, rot: number, pos: Vec3): void {
    const v = this.pieceViews.get(id);
    if (v) this.pulses.set(v, 0);
    const ext = extents(kind, rot);
    const hx = ext.x / 2, hz = ext.z / 2;
    const y = pos.y - ext.y / 2 + 0.03;
    const mat = this.lineMaterial(0.05, 0xffffff, false);
    const ring = this.segments([-hx, 0, -hz, hx, 0, -hz, hx, 0, -hz, hx, 0, hz, hx, 0, hz, -hx, 0, hz, -hx, 0, hz, -hx, 0, -hz], mat);
    ring.position.set(pos.x, y, pos.z);
    this.fxGroup.add(ring);
    this.effects.push({
      obj: ring,
      time: 0,
      life: 0.45,
      tick: (k) => {
        const grow = 1 + 0.9 * (1 - Math.pow(1 - k, 3));
        ring.scale.set(grow, 1, grow);
        mat.opacity = 0.7 * (1 - k);
      },
      done: () => {
        this.lineMaterials = this.lineMaterials.filter((m) => m !== mat);
        mat.dispose();
        (ring.geometry as LineSegmentsGeometry).dispose();
      },
    });
  }

  /** Small light diamonds rising from a point (the zone, when the goal is reached). */
  burst(pos: Vec3, c: [number, number, number]): void {
    const n = 46;
    const positions = new Float32Array(n * 3);
    const vel: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      positions.set([pos.x + d.x * 0.3, pos.y + d.y * 0.3, pos.z + d.z * 0.3], i * 3);
      vel.push(d.multiplyScalar(1.2 + Math.random() * 2.2));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const tex = diamondTexture();
    const mat = new THREE.PointsMaterial({ color: rgb(c), map: tex, size: 9 * this.renderer.getPixelRatio(), sizeAttenuation: false, transparent: true, depthWrite: false });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    this.fxGroup.add(pts);
    this.effects.push({
      obj: pts,
      time: 0,
      life: 1.5,
      tick: (k) => {
        const arr = g.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < n; i++) {
          arr.setXYZ(i, arr.getX(i) + vel[i].x * 0.016, arr.getY(i) + vel[i].y * 0.016 + 0.002, arr.getZ(i) + vel[i].z * 0.016);
          vel[i].multiplyScalar(0.985);
        }
        arr.needsUpdate = true;
        mat.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      },
      done: () => {
        g.dispose();
        mat.dispose();
      },
    });
  }

  private updateEffects(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.time += dt;
      if (fx.time >= fx.life) {
        this.fxGroup.remove(fx.obj);
        fx.done?.();
        this.effects.splice(i, 1);
        continue;
      }
      fx.tick(fx.time / fx.life);
    }
    for (const [view, t0] of this.pulses) {
      const t = t0 + dt;
      const k = Math.min(1, t / 0.22);
      const s = 1 + 0.07 * Math.sin(k * Math.PI) * (1 - k);
      view.scale.setScalar(s);
      if (k >= 1) {
        view.scale.setScalar(1);
        this.pulses.delete(view);
      } else this.pulses.set(view, t);
    }
  }

  settlePulses(): void {
    for (const v of this.pulses.keys()) v.scale.setScalar(1);
    this.pulses.clear();
  }

  // ------------------------------------------------------------------ housekeeping
  private clearGroup(g: THREE.Group): void {
    for (const child of [...g.children]) {
      g.remove(child);
      child.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && m.geometry !== prismGeo() && !(m.geometry instanceof THREE.BoxGeometry && m.geometry.parameters.width === 1 && m.geometry.parameters.height === 1 && m.geometry.parameters.depth === 1)) m.geometry.dispose();
      });
    }
    if (g === this.scenery && this.heightLine) {
      this.scene.remove(this.heightLine);
    }
    if (g === this.scenery) {
      const hl = g.userData.heightLine as LineSegments2 | undefined;
      if (hl) this.scene.remove(hl);
      g.userData.heightLine = undefined;
    }
  }
}

let diamond: THREE.CanvasTexture | null = null;
function diamondTexture(): THREE.CanvasTexture {
  if (diamond) return diamond;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(16, 2);
  ctx.lineTo(30, 16);
  ctx.lineTo(16, 30);
  ctx.lineTo(2, 16);
  ctx.closePath();
  ctx.fill();
  diamond = new THREE.CanvasTexture(c);
  return diamond;
}
