import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
  LineDashedMaterial,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  ShadowMaterial,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { LAYOUT, PARK_POSE, bedOffsetY, clampPose, type Pose } from './pose';

/**
 * An original, procedural model of a bed-slinger desktop printer with the A1 mini's proportions:
 * a low base with the screen at the front right, a bed that slides front to back, one tall column
 * at the right whose carriage holds a cantilevered arm, and a toolhead that rides along the arm.
 * Built from rounded boxes and cylinders with physically based materials; no logo, wordmark or
 * copied CAD (see docs/PRINTER_MODEL.md).
 *
 * Coordinates: millimetres, x right, y back, z up; the origin is the middle of the build plate's
 * top surface with the bed centred. Everything that moves is its own group:
 *   bed (y) holds the plate; gantry (z) holds the arm; toolhead (x) rides on the gantry.
 */

export interface PrinterRig {
  /** Add this to the scene. */
  readonly group: Group;
  /** Static body, column, and the moving gantry and toolhead. Hidden in the top-down view. */
  readonly machine: Group;
  /** The sliding bed, with the build plate. */
  readonly bed: Group;
  /** Parent for anything printed: its origin is the middle of the plate's top surface. */
  readonly plate: Group;
  /** Moves with the toolhead; its world position is where plastic comes out. */
  readonly nozzleTip: Object3D;
  /** Named parts, for tests and for the print simulation. */
  readonly parts: Readonly<Record<string, Object3D>>;
  readonly pose: Readonly<Pose>;
  setPose(pose: Pose): void;
  /** Shows or hides everything except the bed: the machine, cables and ground shadow. */
  setMachineVisible(visible: boolean): void;
  /** Colours the filament entering the toolhead. */
  setFilamentColour(css: string): void;
  /** Bounding box of the machine and bed (no cables or ground). */
  chassisBox(): Box3;
  triangleCount(): number;
  dispose(): void;
}

export interface BuildOptions {
  /** Draw canvas textures (plate grain, screen). Off in tests, which have no canvas. */
  textures?: boolean;
}

type Range = readonly [number, number];
const mid = (r: Range): number => (r[0] + r[1]) / 2;
const span = (r: Range): number => r[1] - r[0];

function noiseTexture(size: number, repeat: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  // A fixed pseudo-random speckle (no Math.random, so the plate always looks the same).
  let s = 12345;
  for (let i = 0; i < size * size; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const v = 90 + (s >>> 24) * 0.6;
    image.data.set([v, v, v, 255], i * 4);
  }
  ctx.putImageData(image, 0, 0);
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

/** A plain stand-in for the touch screen: dark glass with a few soft shapes, no text. */
function screenTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 112;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#06070b';
  ctx.fillRect(0, 0, 256, 112);
  const tiles = ['#35b6a4', '#6c8cff', '#f1b84b', '#e0668b'];
  tiles.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.roundRect(26 + i * 55, 26, 42, 42, 10);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#3a3d48';
  ctx.beginPath();
  ctx.roundRect(26, 84, 204, 9, 4.5);
  ctx.fill();
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function buildPrinter(options: BuildOptions = {}): PrinterRig {
  const useTextures = options.textures ?? typeof document !== 'undefined';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T): T => {
    disposables.push(d);
    return d;
  };

  const std = (color: number, roughness: number, metalness = 0): MeshStandardMaterial =>
    track(new MeshStandardMaterial({ color, roughness, metalness }));
  const mat = {
    body: std(0xc9cac6, 0.55),
    bodyDark: std(0x5a5d61, 0.55),
    metal: std(0xc4c7cb, 0.34, 0.85),
    steel: std(0xe3e5e8, 0.22, 0.95),
    rod: std(0xa7abb1, 0.25, 0.95),
    black: std(0x17181a, 0.5),
    heatbed: std(0x2b2d32, 0.5, 0.3),
    brass: std(0xc99d3d, 0.3, 0.9),
    rubber: std(0x202124, 0.9),
    cable: std(0x141516, 0.6),
    ptfe: std(0xf1f1ef, 0.4),
    screen: std(0x05060a, 0.12),
    pei: std(0x1d1f23, 0.85),
    filament: std(0xffc93c, 0.5),
  };
  if (useTextures) {
    const grain = track(noiseTexture(256, 14));
    mat.pei.bumpMap = grain;
    mat.pei.bumpScale = 1.2;
    const ui = track(screenTexture());
    mat.screen.map = ui;
    mat.screen.emissiveMap = ui;
    mat.screen.emissive = new Color(0xffffff);
    mat.screen.emissiveIntensity = 0.35;
  }

  const parts: Record<string, Object3D> = {};
  const name = <T extends Object3D>(key: string, obj: T): T => {
    obj.name = key;
    parts[key] = obj;
    return obj;
  };

  /** Rounded box from three coordinate ranges. */
  const box = (
    x: Range,
    y: Range,
    z: Range,
    radius: number,
    material: Material,
    cast = true,
  ): Mesh => {
    const g = track(
      radius > 0
        ? new RoundedBoxGeometry(span(x), span(y), span(z), 2, radius)
        : new BoxGeometry(span(x), span(y), span(z)),
    );
    const m = new Mesh(g, material);
    m.position.set(mid(x), mid(y), mid(z));
    m.castShadow = cast;
    m.receiveShadow = true;
    return m;
  };

  const cylinder = (
    radius: number,
    height: number,
    material: Material,
    axis: 'x' | 'y' | 'z',
    segments = 20,
  ): Mesh => {
    const g = track(new CylinderGeometry(radius, radius, height, segments));
    const m = new Mesh(g, material);
    // Three's cylinders point along y; turn them to the requested core axis.
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  const group = new Group();
  group.name = 'printer';
  const machine = new Group();
  machine.name = 'machine';
  const bed = new Group();
  bed.name = 'bed';
  const accessories = new Group();
  accessories.name = 'accessories';
  group.add(machine, bed, accessories);
  const m4 = new Matrix4();

  // ---- Static body ----------------------------------------------------------------------
  const b = LAYOUT.base;
  const fb = LAYOUT.frontBlock;
  machine.add(name('base', box(b.x, b.y, b.z, 14, mat.body)));
  machine.add(name('frontBlock', box(fb.x, fb.y, fb.z, 9, mat.body)));
  for (const fx of [b.x[0] + 28, b.x[1] - 28]) {
    for (const fy of [b.y[0] + 24, b.y[1] - 24]) {
      const foot = cylinder(7, span(LAYOUT.feetZ), mat.rubber, 'z', 14);
      foot.position.set(fx, fy, mid(LAYOUT.feetZ));
      machine.add(foot);
    }
  }
  // Y rails the bed slides on, peeking out front and back of the carriage.
  for (const rx of [-48, 48]) {
    const rail = cylinder(3.5, 240, mat.rod, 'y', 12);
    rail.position.set(rx, 0, b.z[1] + 3.5);
    machine.add(rail);
  }
  // Touch screen: a low, tilted panel on the front block, facing up and forward.
  const tilt = (35 * Math.PI) / 180;
  const panel = new Group();
  panel.position.set(101, -158, fb.z[1] + 6);
  panel.rotation.x = tilt;
  const bezel = box([-39, 39], [-16.5, 16.5], [-1.2, 1.2], 3, mat.black);
  const glass = new Mesh(track(new PlaneGeometry(70, 28)), mat.screen);
  glass.position.z = 1.25;
  panel.add(bezel, name('screen', glass));
  machine.add(panel);
  [118, 131, 144].forEach((px) => {
    machine.add(
      box([px - 3, px + 3], [fb.y[0] - 0.8, fb.y[0] + 2], [-70, -63], 1, mat.black, false),
    );
  });
  const slit = track(new BoxGeometry(14, 0.8, 1.2));
  const vents = new InstancedMesh(slit, mat.bodyDark, 6);
  for (let i = 0; i < 6; i++) {
    m4.makeTranslation(170, fb.y[0] - 0.2, -76 + i * 3.4);
    vents.setMatrixAt(i, m4);
  }
  machine.add(vents);

  // ---- Column and its dark top housing ---------------------------------------------------
  const c = LAYOUT.column;
  machine.add(name('column', box(c.x, c.y, c.z, 3, mat.metal)));
  const holeGeometry = track(new CylinderGeometry(2.2, 2.2, 1, 10));
  const holeZs: number[] = [];
  for (let z = -10; z <= 230; z += 20) holeZs.push(z);
  const holes = new InstancedMesh(holeGeometry, mat.black, holeZs.length);
  holeZs.forEach((z, i) => {
    m4.makeTranslation(mid(c.x), c.y[0] - 0.2, z);
    holes.setMatrixAt(i, m4);
  });
  machine.add(holes);
  machine.add(name('cap', box(LAYOUT.cap.x, LAYOUT.cap.y, LAYOUT.cap.z, 6, mat.bodyDark)));

  // ---- Bed: carriage, heated bed and the plate -------------------------------------------
  const h = LAYOUT.carriage.half;
  bed.add(
    name('carriage', box([-h, h], [-h, h], LAYOUT.carriage.z, 6, mat.body)),
    name('heatbed', box([-90, 90], [-90, 90], LAYOUT.heatbedZ, 2, mat.heatbed)),
  );
  const pei = box([-90, 90], [-90, 90], LAYOUT.peiZ, 0, mat.pei, false);
  name('pei', pei);
  bed.add(pei);
  const plate = new Group();
  plate.name = 'plate';
  bed.add(plate);
  // A dashed square marking the 170 mm the puzzle may use.
  const usable = 85;
  const frame = new BufferGeometry();
  frame.setAttribute(
    'position',
    new Float32BufferAttribute(
      [
        -usable,
        -usable,
        0.06,
        usable,
        -usable,
        0.06,
        usable,
        usable,
        0.06,
        -usable,
        usable,
        0.06,
        -usable,
        -usable,
        0.06,
      ],
      3,
    ),
  );
  const dashes = new Line(
    track(frame),
    track(new LineDashedMaterial({ color: 0x8b8f96, dashSize: 4, gapSize: 3 })),
  );
  dashes.computeLineDistances();
  bed.add(dashes);

  // ---- Gantry (moves up and down) ---------------------------------------------------------
  const gantry = new Group();
  gantry.name = 'gantry';
  machine.add(gantry);
  const cb = LAYOUT.carriageBlock;
  const arm = LAYOUT.arm;
  gantry.add(
    name('carriageBlock', box(cb.x, cb.y, cb.z, 7, mat.body)),
    name('arm', box(arm.x, arm.y, arm.z, 3, mat.metal)),
    name(
      'endBracket',
      box(LAYOUT.endBracket.x, LAYOUT.endBracket.y, LAYOUT.endBracket.z, 4, mat.bodyDark),
    ),
    name(
      'endModule',
      box(LAYOUT.endModule.x, LAYOUT.endModule.y, LAYOUT.endModule.z, 3, mat.black),
    ),
  );
  // Linear rail the toolhead runs on, and a plain label plate on the carriage (no text or logo).
  gantry.add(box([-138, 120], [arm.y[0] - 1.6, arm.y[0] + 0.4], [46, 52], 0, mat.steel, false));
  gantry.add(box([128, 168], [cb.y[0] - 0.6, cb.y[0] + 0.2], [26, 46], 0, mat.steel, false));
  const screwGeometry = track(new CylinderGeometry(1.6, 1.6, 0.8, 8));
  const screwXs: number[] = [];
  for (let x = -120; x <= 110; x += 23) screwXs.push(x);
  const screws = new InstancedMesh(screwGeometry, mat.black, screwXs.length);
  screwXs.forEach((x, i) => {
    m4.makeTranslation(x, arm.y[0] - 0.4, 38);
    screws.setMatrixAt(i, m4);
  });
  gantry.add(screws);

  // ---- Toolhead (moves along the arm) ----------------------------------------------------
  const toolhead = new Group();
  toolhead.name = 'toolhead';
  gantry.add(toolhead);
  const hd = LAYOUT.head;
  toolhead.add(
    name('head', box(hd.x, hd.y, hd.z, 6, mat.body)),
    name(
      'sideModule',
      box(LAYOUT.sideModule.x, LAYOUT.sideModule.y, LAYOUT.sideModule.z, 3, mat.bodyDark),
    ),
    name('fanDuct', box(LAYOUT.fanDuct.x, LAYOUT.fanDuct.y, LAYOUT.fanDuct.z, 4, mat.black)),
  );
  const ring = cylinder(9, 1.4, mat.brass, 'y', 28);
  ring.position.set(0, hd.y[0] - 0.4, 62);
  const ringCore = cylinder(5.6, 1.8, mat.black, 'y', 20);
  ringCore.position.set(0, hd.y[0] - 0.6, 62);
  toolhead.add(ring, ringCore);
  toolhead.add(box([-14, 14], [hd.y[0] - 0.5, hd.y[0] + 0.2], [34, 44], 0, mat.steel, false));
  const motor = cylinder(7.5, 28, mat.metal, 'z', 20);
  motor.position.set(-10, 5, hd.z[1] + 14);
  const plug = box([8, 24], [-2, 14], [hd.z[1], hd.z[1] + 14], 2, mat.black);
  const ptfe = cylinder(2.3, 18, mat.ptfe, 'z', 10);
  ptfe.position.set(-10, 5, hd.z[1] + 37);
  const filament = cylinder(0.9, 14, mat.filament, 'z', 8);
  filament.position.set(-10, 5, hd.z[1] + 53);
  toolhead.add(motor, plug, ptfe, name('filament', filament));
  const nozzle = cylinder(3.2, LAYOUT.nozzleHeight, mat.brass, 'z', 12);
  nozzle.position.set(0, 0, LAYOUT.nozzleHeight / 2);
  toolhead.add(name('nozzle', nozzle));
  const nozzleTip = new Object3D();
  nozzleTip.name = 'nozzleTip';
  toolhead.add(nozzleTip);
  parts.nozzleTip = nozzleTip;
  parts.toolhead = toolhead;
  parts.gantry = gantry;
  parts.bed = bed;
  parts.plate = plate;
  parts.machine = machine;

  // ---- Accessories: ground shadow and the two cables --------------------------------------
  const ground = new Mesh(
    track(new PlaneGeometry(1600, 1600)),
    track(new ShadowMaterial({ opacity: 0.16 })),
  );
  ground.position.set(40, -20, LAYOUT.feetZ[0] - 0.05);
  ground.receiveShadow = true;
  accessories.add(ground);

  const cables: { mesh: Mesh | null }[] = [{ mesh: null }, { mesh: null }];
  const setCable = (index: number, points: Vector3[], radius: number): void => {
    const geometry = new TubeGeometry(new CatmullRomCurve3(points), 44, radius, 6, false);
    const slot = cables[index]!;
    if (slot.mesh) {
      slot.mesh.geometry.dispose();
      slot.mesh.geometry = geometry;
    } else {
      slot.mesh = new Mesh(geometry, mat.cable);
      slot.mesh.castShadow = true;
      accessories.add(slot.mesh);
    }
  };
  const updateCables = (): void => {
    const gz = gantry.position.z;
    // Toolhead to the top of the carriage: up, over in a high arc, and down.
    const start = new Vector3(toolhead.position.x + 16, 6, gz + hd.z[1] + 14);
    const end = new Vector3(mid(cb.x) + 14, mid(cb.y) - 6, gz + cb.z[1] + 1);
    const apex = Math.max(start.z, end.z) + 72;
    setCable(
      0,
      [
        start,
        new Vector3(start.x, 14, start.z + 30),
        new Vector3((start.x + end.x) / 2, 34, apex),
        new Vector3(end.x - 16, 56, end.z + 34),
        end,
      ],
      2.3,
    );
    // Carriage to the base: runs down the right side of the column.
    const top = new Vector3(cb.x[1] - 1, 64, gz + 28);
    setCable(
      1,
      [
        top,
        new Vector3(cb.x[1] + 7, 68, gz + 6),
        new Vector3(cb.x[1] + 7, 72, (gz + b.z[1]) / 2),
        new Vector3(cb.x[1] - 2, 90, b.z[1] + 18),
        new Vector3(cb.x[1] - 12, 102, b.z[1] + 1),
      ],
      2.3,
    );
  };

  const state: Pose = { ...PARK_POSE };
  const rig: PrinterRig = {
    group,
    machine,
    bed,
    plate,
    nozzleTip,
    parts,
    get pose() {
      return state;
    },
    setPose(next) {
      const p = clampPose(next);
      Object.assign(state, p);
      toolhead.position.x = p.x;
      gantry.position.z = p.z;
      bed.position.y = bedOffsetY(p.y);
      updateCables();
    },
    setMachineVisible(visible) {
      machine.visible = visible;
      accessories.visible = visible;
    },
    setFilamentColour(css) {
      mat.filament.color.set(css);
    },
    chassisBox() {
      group.updateMatrixWorld(true);
      const box3 = new Box3();
      box3.expandByObject(machine);
      box3.expandByObject(bed);
      return box3;
    },
    triangleCount() {
      let triangles = 0;
      group.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        const g = mesh.geometry;
        const per = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
        triangles +=
          per * ((mesh as InstancedMesh).isInstancedMesh ? (mesh as InstancedMesh).count : 1);
      });
      return Math.round(triangles);
    },
    dispose() {
      for (const slot of cables) slot.mesh?.geometry.dispose();
      for (const d of disposables) d.dispose();
    },
  };
  rig.setPose(PARK_POSE);
  return rig;
}
