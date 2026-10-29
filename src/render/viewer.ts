import {
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
  PMREMGenerator,
  Scene,
  Spherical,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { puzzleMeshes } from '../core/export/bundle';
import { extrudePolygon } from '../core/mesh/extrude';
import type { Vec2 } from '../core/geometry/polygon';
import { centroid } from '../core/geometry/polyline';
import type { Puzzle } from '../core/puzzle/generate';
import { PUZZLE_THICKNESS_MM } from '../core/printer/a1mini';
import { explodeOffsets, fitDistance, type Offset } from './explode';
import { pieceGeometry } from './geometry';
import { buildPrinter, type PrinterRig } from './printer/model';
import { PARK_POSE, type Pose } from './printer/pose';
import { PrintSimulation, type SimSpeed, type SimStatus } from './simulation';

export type ViewPreset = 'angled' | 'top' | 'printer';

const FOV_DEG = 35;
const TWEEN_MS = 600;

interface PresetConfig {
  /** Point the camera looks at (core coordinates, millimetres). */
  target: readonly [number, number, number];
  /** Radius of the sphere that must fit in view (mm). */
  radius: number;
  /** Angle from straight up, and turn around it (radians). */
  phi: number;
  theta: number;
  /** Whether the printer body is drawn (the top view shows just the plate and puzzle). */
  machine: boolean;
}

const PRESETS: Record<ViewPreset, PresetConfig> = {
  angled: { target: [20, 0, 15], radius: 150, phi: 1.0, theta: -0.3, machine: true },
  top: { target: [0, 0, 0], radius: 100, phi: 0.02, theta: 0, machine: false },
  printer: { target: [10, 0, 95], radius: 255, phi: 1.3, theta: -0.55, machine: true },
};

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
  private readonly rig: PrinterRig;
  private readonly sun = new DirectionalLight(0xffffff, 1.25);
  private readonly camera = new PerspectiveCamera(FOV_DEG, 1, 1, 2000);
  private readonly controls: OrbitControls;
  private readonly observer: ResizeObserver;
  private readonly disposables: { dispose(): void }[] = [];

  private meshes: Mesh[] = [];
  /** What the print simulation grows layer by layer: the same pieces without their pockets. */
  private growth: Mesh[] = [];
  private puzzle: Puzzle | null = null;
  private colours: readonly string[] = [];
  private preset: ViewPreset = 'angled';
  private sim: PrintSimulation | null = null;
  private simSpeed: SimSpeed = 'normal';
  private simRuns: readonly string[] = [];
  private simListener: ((status: SimStatus) => void) | null = null;
  private simFrame = 0;
  private simClock = 0;
  private centres: Vec2[] = [];
  private explodeAmount = 0;
  private reduceMotion: boolean;
  private frame = 0;
  private tween = 0;
  private frames = 0;

  constructor(
    private readonly container: HTMLElement,
    options: { reduceMotion: boolean; calm: boolean },
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
    this.canvas.dataset.sim = 'idle';
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute(
      'aria-label',
      '3D view of your puzzle. Drag to turn it. Scroll or pinch to zoom. Arrow keys turn it, plus and minus zoom.',
    );
    container.append(this.canvas);

    // The only place that converts from the core's z-up to Three.js's y-up.
    this.world.rotation.x = -Math.PI / 2;
    this.scene.add(this.world);
    this.rig = buildPrinter();
    this.world.add(this.rig.group);
    // Printed pieces sit on the plate, so they slide with the bed.
    this.rig.plate.add(this.piecesGroup);
    this.rig.setPose(PARK_POSE);
    this.buildLights();
    this.setCalm(options.calm);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enablePan = false;
    this.controls.enableDamping = !this.reduceMotion;
    this.controls.dampingFactor = 0.1;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.06;
    this.controls.minDistance = 90;
    this.controls.maxDistance = 1100;
    this.controls.addEventListener('change', () => this.requestRender());
    this.canvas.addEventListener('keydown', (e) => this.onKey(e));

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.setView('angled');
  }

  private buildLights(): void {
    // Soft room reflections give the metal and glossy parts something to reflect; no downloads.
    const pmrem = new PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = env.texture;
    this.scene.environmentIntensity = 0.4;
    this.disposables.push(env, pmrem);

    this.scene.add(new HemisphereLight(0xffffff, 0xcfc6b6, 0.35));
    const sun = this.sun;
    // Core coordinates: from the front, a little to the left, high up.
    sun.position.set(-260, -380, 620);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -340;
    cam.right = 340;
    cam.top = 340;
    cam.bottom = -340;
    cam.near = 100;
    cam.far = 1600;
    sun.shadow.bias = -0.0004;
    sun.shadow.radius = 3;
    this.world.add(sun);
  }

  /**
   * Calm mode uses a plainer picture: no shadows and no extra sharpness, which is easier on slow
   * devices and quieter to look at.
   */
  setCalm(on: boolean): void {
    this.renderer.shadowMap.enabled = !on;
    this.sun.castShadow = !on;
    this.renderer.setPixelRatio(on ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.scene.traverse((o) => {
      const material = (o as Mesh).material;
      if (Array.isArray(material)) material.forEach((m) => (m.needsUpdate = true));
      else if (material) material.needsUpdate = true;
    });
    this.resize();
  }

  private clearPieces(): void {
    for (const mesh of [...this.meshes, ...this.growth.filter((g, i) => g !== this.meshes[i])]) {
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
    this.growth = [];
  }

  /** Shows a puzzle. `colours` gives a CSS colour for each piece. Replaces what was shown before. */
  setPuzzle(puzzle: Puzzle, colours: readonly string[]): void {
    this.clearPieces();
    const meshes = puzzleMeshes(puzzle, PUZZLE_THICKNESS_MM);
    this.centres = puzzle.pieces.map((p) => centroid(p.polygon));
    const solid = (mesh: Parameters<typeof pieceGeometry>[0], colour: string): Mesh => {
      const geometry: BufferGeometry = pieceGeometry(mesh);
      const material = new MeshStandardMaterial({
        color: new Color(colour),
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
      this.piecesGroup.add(piece);
      return piece;
    };
    meshes.forEach((mesh, i) => {
      const colour = colours[i] ?? '#cccccc';
      const piece = solid(mesh, colour);
      this.meshes.push(piece);
      // The print grows a plain block; the pocket appears when the print is finished.
      const pocketed = puzzle.pieces[i]?.pocket;
      if (pocketed) {
        const plain = solid(extrudePolygon(puzzle.pieces[i]!.polygon, PUZZLE_THICKNESS_MM), colour);
        plain.visible = false;
        this.growth.push(plain);
      } else {
        this.growth.push(piece);
      }
    });
    this.applyExplode();
    this.puzzle = puzzle;
    this.colours = colours;
    this.sim?.attach(puzzle, this.growth, colours, this.meshes);
    this.canvas.dataset.pieces = String(this.meshes.length);
    this.requestRender();
  }

  /** Moves the printer's axes. The print simulation drives this; elsewhere it stays parked. */
  setPose(pose: Pose): void {
    this.rig.setPose(pose);
    this.requestRender();
  }

  /** Changes piece colours without rebuilding them. */
  setColours(colours: readonly string[]): void {
    this.colours = colours;
    this.sim?.setColours(colours);
    for (const list of [this.meshes, this.growth]) {
      list.forEach((m, i) =>
        (m.material as MeshStandardMaterial).color.set(colours[i] ?? '#cccccc'),
      );
    }
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

  // ---- Print simulation ----------------------------------------------------------------------

  /** Hears about the simulation starting, pausing, changing layer and finishing. */
  onSimStatus(listener: ((status: SimStatus) => void) | null): void {
    this.simListener = listener;
  }

  private ensureSim(): PrintSimulation | null {
    if (!this.sim && this.puzzle) {
      this.sim = new PrintSimulation(this.rig, this.rig.plate, (s) => this.reportSim(s));
      this.sim.attach(this.puzzle, this.growth, this.colours, this.meshes);
      this.sim.setSpeed(this.simSpeed);
      if (this.simRuns.length > 0) this.sim.setRunColours(this.simRuns);
    }
    return this.sim;
  }

  private reportSim(s: SimStatus): void {
    this.canvas.dataset.sim = !s.active
      ? 'idle'
      : s.finished
        ? 'done'
        : s.playing
          ? 'playing'
          : 'paused';
    this.canvas.dataset.layer = String(s.layer);
    this.canvas.dataset.layers = String(s.layers);
    this.canvas.dataset.run = String(s.run);
    this.canvas.dataset.runs = String(s.runs);
    this.simListener?.(s);
  }

  /** Starts the print, or carries on if it was paused. A finished print starts again. */
  simPlay(): void {
    const sim = this.ensureSim();
    if (!sim) return;
    // The head works over the plate, so bring any pulled-apart pieces back first.
    this.setExplode(0);
    if (this.preset === 'top') this.setView('angled');
    sim.setSpeed(this.simSpeed);
    sim.play();
    this.runSim();
  }

  simPause(): void {
    this.sim?.pause();
    this.requestRender();
  }

  /** Shows the moment layer `k` (counted from 1) has just been printed, and waits there. */
  simSeekLayer(k: number): void {
    const sim = this.ensureSim();
    if (!sim) return;
    this.setExplode(0);
    sim.seekLayer(k);
    this.requestRender();
  }

  /** Prints the puzzle once in each of these colours, one after the other. */
  simSetRuns(colours: readonly string[]): void {
    this.simRuns = colours;
    this.ensureSim()?.setRunColours(colours);
    this.requestRender();
  }

  simSetSpeed(speed: SimSpeed): void {
    this.simSpeed = speed;
    this.sim?.setSpeed(speed);
  }

  /** Back to the finished puzzle with the printer parked. */
  simStop(): void {
    cancelAnimationFrame(this.simFrame);
    this.simFrame = 0;
    this.sim?.reset();
    this.requestRender();
  }

  private runSim(): void {
    if (this.simFrame) return;
    this.simClock = performance.now();
    const step = (now: number): void => {
      this.simFrame = 0;
      const sim = this.sim;
      if (!sim?.status.playing) return;
      // A long gap (the tab was hidden) must not jump the print ahead.
      sim.tick(Math.min(0.1, (now - this.simClock) / 1000));
      this.simClock = now;
      this.requestRender();
      if (sim.status.playing) this.simFrame = requestAnimationFrame(step);
    };
    this.simFrame = requestAnimationFrame(step);
  }

  /** Puts the camera at a standard angle. "Top" shows only the plate and puzzle. */
  setView(preset: ViewPreset): void {
    this.preset = preset;
    const cfg = PRESETS[preset];
    const aspect = this.camera.aspect || 1;
    // In a narrow view the near edge of the plate looks wider, so leave a little more room.
    const radius = aspect < 1.5 ? cfg.radius * 1.25 : cfg.radius;
    const spherical = new Spherical(fitDistance(radius, FOV_DEG, aspect), cfg.phi, cfg.theta);
    // Targets are given in core coordinates; the world group converts them to the scene's.
    const target = this.world.localToWorld(new Vector3(...cfg.target));
    this.controls.target.copy(target);
    this.camera.position.setFromSpherical(spherical).add(target);
    this.camera.lookAt(target);
    this.rig.setMachineVisible(cfg.machine);
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
    cancelAnimationFrame(this.simFrame);
    this.sim?.dispose();
    this.observer.disconnect();
    this.controls.dispose();
    this.clearPieces();
    this.rig.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
