import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Spherical,
  WebGLRenderer,
  type BufferGeometry,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { puzzleMeshes } from '../core/export/bundle';
import type { Vec2 } from '../core/geometry/polygon';
import { centroid } from '../core/geometry/polyline';
import type { Puzzle } from '../core/puzzle/generate';
import { A1_MINI, PUZZLE_THICKNESS_MM } from '../core/printer/a1mini';
import { explodeOffsets, fitDistance, type Offset } from './explode';
import { pieceGeometry } from './geometry';

export type ViewPreset = 'angled' | 'top';

const FOV_DEG = 35;
/** The puzzle and plate fit inside a sphere of about this radius (mm). */
const FIT_RADIUS_MM = 82;
const PLATE_THICKNESS_MM = 6;
const TWEEN_MS = 600;

/** A plate-sized grid with the usable area marked, drawn once as a texture. */
function plateTexture(renderer: WebGLRenderer): CanvasTexture {
  const px = 5;
  const size = A1_MINI.buildVolume.x * px;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#efe9dc';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#ddd5c2';
  ctx.lineWidth = 1;
  for (let mm = 10; mm < A1_MINI.buildVolume.x; mm += 10) {
    ctx.beginPath();
    ctx.moveTo(mm * px, 0);
    ctx.lineTo(mm * px, size);
    ctx.moveTo(0, mm * px);
    ctx.lineTo(size, mm * px);
    ctx.stroke();
  }
  const margin = A1_MINI.plateMargin * px;
  ctx.setLineDash([14, 10]);
  ctx.strokeStyle = 'rgba(74, 77, 102, 0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(margin, margin, size - 2 * margin, size - 2 * margin);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

/** True when this browser can make a WebGL context. */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Interactive 3D view of the finished puzzle on a build plate. It draws only when something
 * changes (no constant animation), which keeps it light on school hardware and calm to look at.
 *
 * Coordinates: everything inside `world` uses the core's convention (millimetres, z up). The one
 * rotation on `world` is the only place that converts to Three.js's y-up convention.
 */
export class PuzzleViewer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly world = new Group();
  private readonly piecesGroup = new Group();
  private readonly camera = new PerspectiveCamera(FOV_DEG, 1, 1, 2000);
  private readonly controls: OrbitControls;
  private readonly observer: ResizeObserver;
  private readonly disposables: { dispose(): void }[] = [];

  private meshes: Mesh[] = [];
  private centres: Vec2[] = [];
  private explodeAmount = 0;
  private reduceMotion: boolean;
  private frame = 0;
  private tween = 0;
  private frames = 0;

  constructor(
    private readonly container: HTMLElement,
    options: { reduceMotion: boolean },
  ) {
    this.reduceMotion = options.reduceMotion;
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'viewer-canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute(
      'aria-label',
      '3D view of your puzzle. Drag to turn it. Scroll or pinch to zoom. Arrow keys turn it, plus and minus zoom.',
    );
    container.append(this.canvas);

    // The only place that converts from the core's z-up to Three.js's y-up.
    this.world.rotation.x = -Math.PI / 2;
    this.scene.add(this.world);
    this.world.add(this.piecesGroup);
    this.buildPlate();
    this.buildLights();

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enablePan = false;
    this.controls.enableDamping = !this.reduceMotion;
    this.controls.dampingFactor = 0.1;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.06;
    this.controls.minDistance = 90;
    this.controls.maxDistance = 520;
    this.controls.addEventListener('change', () => this.requestRender());
    this.canvas.addEventListener('keydown', (e) => this.onKey(e));

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.setView('angled');
  }

  private buildPlate(): void {
    const t = plateTexture(this.renderer);
    const side = new MeshStandardMaterial({ color: 0xd8cfbb, roughness: 0.9 });
    const top = new MeshStandardMaterial({ map: t, roughness: 0.85 });
    const { x, y } = A1_MINI.buildVolume;
    const geometry = new BoxGeometry(x, y, PLATE_THICKNESS_MM);
    // Box faces: +x, -x, +y, -y, +z (top), -z.
    const plate = new Mesh(geometry, [side, side, side, side, top, side]);
    plate.position.z = -PLATE_THICKNESS_MM / 2;
    plate.receiveShadow = true;
    this.world.add(plate);
    this.disposables.push(t, side, top, geometry);
  }

  private buildLights(): void {
    this.scene.add(new HemisphereLight(0xffffff, 0xcfc6b6, 1.1));
    const sun = new DirectionalLight(0xffffff, 1.6);
    // Core coordinates: from the front, a little to the left, high up.
    sun.position.set(-80, -120, 220);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const cam = sun.shadow.camera;
    cam.left = -150;
    cam.right = 150;
    cam.top = 150;
    cam.bottom = -150;
    cam.near = 50;
    cam.far = 600;
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = 4;
    this.world.add(sun);
  }

  private clearPieces(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      for (const child of mesh.children) {
        const line = child as LineSegments;
        line.geometry.dispose();
        (line.material as LineBasicMaterial).dispose();
      }
    }
    this.piecesGroup.clear();
    this.meshes = [];
  }

  /** Shows a puzzle. `colours` gives a CSS colour for each piece. Replaces what was shown before. */
  setPuzzle(puzzle: Puzzle, colours: readonly string[]): void {
    this.clearPieces();
    const meshes = puzzleMeshes(puzzle, PUZZLE_THICKNESS_MM);
    this.centres = puzzle.pieces.map((p) => centroid(p.polygon));
    meshes.forEach((mesh, i) => {
      const geometry: BufferGeometry = pieceGeometry(mesh);
      const material = new MeshStandardMaterial({
        color: new Color(colours[i] ?? '#cccccc'),
        roughness: 0.5,
        metalness: 0,
      });
      const piece = new Mesh(geometry, material);
      piece.castShadow = true;
      piece.receiveShadow = true;
      const outline = new LineSegments(
        new EdgesGeometry(geometry, 35),
        new LineBasicMaterial({ color: 0x2b2d42, transparent: true, opacity: 0.55 }),
      );
      piece.add(outline);
      this.meshes.push(piece);
      this.piecesGroup.add(piece);
    });
    this.applyExplode();
    this.canvas.dataset.pieces = String(this.meshes.length);
    this.requestRender();
  }

  /** Changes piece colours without rebuilding them. */
  setColours(colours: readonly string[]): void {
    this.meshes.forEach((m, i) =>
      (m.material as MeshStandardMaterial).color.set(colours[i] ?? '#cccccc'),
    );
    this.requestRender();
  }

  /** Pulls the pieces apart (1) or puts them together (0). Slides smoothly unless motion is reduced. */
  setExplode(amount: number, animate = false): void {
    cancelAnimationFrame(this.tween);
    const target = Math.min(1, Math.max(0, amount));
    if (!animate || this.reduceMotion) {
      this.explodeAmount = target;
      this.applyExplode();
      this.requestRender();
      return;
    }
    const from = this.explodeAmount;
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / TWEEN_MS);
      const eased = t * t * (3 - 2 * t);
      this.explodeAmount = from + (target - from) * eased;
      this.applyExplode();
      this.requestRender();
      if (t < 1) this.tween = requestAnimationFrame(step);
    };
    this.tween = requestAnimationFrame(step);
  }

  private applyExplode(): void {
    const offsets: Offset[] = explodeOffsets(this.centres, this.explodeAmount);
    this.meshes.forEach((m, i) => {
      const o = offsets[i];
      if (o) m.position.set(o.x, o.y, o.z);
    });
    this.canvas.dataset.explode = this.explodeAmount.toFixed(2);
  }

  setReducedMotion(on: boolean): void {
    this.reduceMotion = on;
    this.controls.enableDamping = !on;
  }

  /** Puts the camera at a standard angle looking at the middle of the plate. */
  setView(preset: ViewPreset): void {
    const aspect = this.camera.aspect || 1;
    // In a narrow view the near edge of the plate looks wider, so leave a little more room.
    const radius = aspect < 1.5 ? FIT_RADIUS_MM * 1.25 : FIT_RADIUS_MM;
    const distance = fitDistance(radius, FOV_DEG, aspect);
    const spherical = new Spherical(distance, preset === 'top' ? 0.02 : 0.95, 0);
    this.controls.target.set(0, 0, 0);
    this.camera.position.setFromSpherical(spherical);
    this.camera.lookAt(0, 0, 0);
    this.controls.update();
    this.canvas.dataset.view = preset;
    this.requestRender();
  }

  private onKey(e: KeyboardEvent): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const s = new Spherical().setFromVector3(offset);
    const turn = (15 * Math.PI) / 180;
    switch (e.key) {
      case 'ArrowLeft':
        s.theta -= turn;
        break;
      case 'ArrowRight':
        s.theta += turn;
        break;
      case 'ArrowUp':
        s.phi -= turn / 2;
        break;
      case 'ArrowDown':
        s.phi += turn / 2;
        break;
      case '+':
      case '=':
        s.radius /= 1.12;
        break;
      case '-':
        s.radius *= 1.12;
        break;
      default:
        return;
    }
    e.preventDefault();
    s.phi = Math.min(this.controls.maxPolarAngle, Math.max(0.02, s.phi));
    s.radius = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, s.radius));
    this.camera.position.setFromSpherical(s).add(this.controls.target);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.requestRender();
  }

  /** Matches the canvas to its container and redraws. */
  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private requestRender(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const moving = this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.canvas.dataset.ready = 'true';
      // Lets tests (and curious teachers) confirm the view is idle when nothing is moving.
      this.canvas.dataset.frames = String(++this.frames);
      if (moving) this.requestRender();
    });
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.tween);
    this.observer.disconnect();
    this.controls.dispose();
    this.clearPieces();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
