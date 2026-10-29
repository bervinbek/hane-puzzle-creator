import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshPhysicalMaterial,
  type Group,
} from 'three';
import { A1_MINI, PUZZLE_THICKNESS_MM } from '../core/printer/a1mini';
import { applyFinish, finishFor } from './finish';
import { MOVE, MOVE_STRIDE, buildToolpath, stateAt, type Toolpath } from '../core/printer/toolpath';
import type { Puzzle } from '../core/puzzle/generate';
import type { PrinterRig } from './printer/model';
import { PARK_POSE, type Pose } from './printer/pose';

/**
 * Plays the toolpath on the printer model: the nozzle follows the path, the bed slides under it,
 * the gantry steps up a layer at a time, and the pieces grow on the plate. Illustrative, not a
 * slicer (docs/DECISIONS.md D-008).
 *
 * Finished layers are drawn by squashing each piece's solid mesh to the height printed so far (a
 * piece is a straight extrusion, so this is exact). Only the layer being printed is drawn line by
 * line, which keeps it light on school hardware.
 */

export type SimSpeed = 'slow' | 'normal' | 'fast';

/** How long one print takes to watch, in real seconds, at each speed. */
export const SPEED_SECONDS: Record<SimSpeed, number> = { slow: 90, normal: 40, fast: 16 };

export interface SimStatus {
  /** False while the finished puzzle is simply shown; true once a print was started or scrubbed. */
  active: boolean;
  playing: boolean;
  /** The layer being printed, counted from 1. */
  layer: number;
  layers: number;
  /** Which print this is, counted from 1, and how many there are (one for each plastic colour). */
  run: number;
  runs: number;
  /** True when the last print is done. */
  finished: boolean;
}

/** Print seconds spent moving the head from the parked spot to the first layer, and back. */
const LEAD = 30;
const FILAMENT_DIAMETER_MM = 1.75;
/** The wound filament is about this far from the spool's axle on average. */
const SPOOL_RADIUS_MM = 70;
/**
 * Lines are drawn a little wider than the plastic so neighbouring lines overlap. Drawn exactly
 * as wide as the plastic they shimmer at this zoom, because the gaps between them are under a pixel.
 */
const LINE_OVERLAP = 1.35;
/** Stops lines of different kinds fighting over the same pixels. */
const KIND_LIFT = 0.004;
/** How much darker each kind of line is drawn, so the walls and the fill can be told apart. */
const SHADE: Record<number, number> = { [MOVE.OUTER]: 0.84, [MOVE.INNER]: 0.92, [MOVE.INFILL]: 1 };

const smooth = (u: number): number => {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function quadGeometry(quads: number): BufferGeometry {
  const geometry = new BufferGeometry();
  const position = new BufferAttribute(new Float32Array(quads * 12), 3);
  const colour = new BufferAttribute(new Float32Array(quads * 12), 3);
  const normal = new BufferAttribute(new Float32Array(quads * 12), 3);
  const index = new BufferAttribute(new Uint32Array(quads * 6), 1);
  for (let q = 0; q < quads; q++) {
    for (let v = 0; v < 4; v++) normal.setXYZ(q * 4 + v, 0, 0, 1);
    index.array.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 1, q * 4 + 3, q * 4 + 2], q * 6);
  }
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', colour);
  geometry.setAttribute('normal', normal);
  geometry.setIndex(index);
  return geometry;
}

/** Writes one flat line (a rectangle from (x0, y0) to (x1, y1)) into quad slot `q`. */
function setQuad(
  geometry: BufferGeometry,
  q: number,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
  z: number,
  width: number,
  colour: Color,
): void {
  const length = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = (-(y1 - y0) / length) * (width / 2);
  const ny = ((x1 - x0) / length) * (width / 2);
  const position = geometry.getAttribute('position') as BufferAttribute;
  const colours = geometry.getAttribute('color') as BufferAttribute;
  position.setXYZ(q * 4, x0 + nx, y0 + ny, z);
  position.setXYZ(q * 4 + 1, x0 - nx, y0 - ny, z);
  position.setXYZ(q * 4 + 2, x1 + nx, y1 + ny, z);
  position.setXYZ(q * 4 + 3, x1 - nx, y1 - ny, z);
  for (let v = 0; v < 4; v++) colours.setXYZ(q * 4 + v, colour.r, colour.g, colour.b);
}

export class PrintSimulation {
  private path: Toolpath | null = null;
  private puzzle: Puzzle | null = null;
  private meshes: Mesh[] = [];
  /** The finished pieces (with their pockets). The same list as `meshes` when nothing is hollow. */
  private finals: Mesh[] = [];
  private colours: Color[] = [];
  private readonly material = new MeshPhysicalMaterial({
    vertexColors: true,
    ...finishFor(''),
  });
  private lines: Mesh | null = null;
  private linesLayer = -1;
  private quadsBefore = new Uint32Array(0);
  private readonly tip: Mesh;
  private time = 0;
  private active = false;
  private playing = false;
  private speed: SimSpeed = 'normal';
  private lastKey = '';
  /** One colour for each print. Empty means one print in the colours given to `attach`. */
  private runColours: Color[] = [];
  private run = 0;
  private paintedRun = -1;

  constructor(
    private readonly rig: PrinterRig,
    private readonly parent: Group,
    private readonly onStatus: (status: SimStatus) => void = () => undefined,
  ) {
    this.tip = new Mesh(quadGeometry(1), this.material);
    this.tip.visible = false;
    this.tip.frustumCulled = false;
    this.parent.add(this.tip);
  }

  /** Tells the simulation which puzzle is on the plate and which meshes show it. */
  attach(
    puzzle: Puzzle,
    meshes: readonly Mesh[],
    colours: readonly string[],
    finals: readonly Mesh[] = meshes,
  ): void {
    this.reset();
    this.puzzle = puzzle;
    this.path = null;
    this.meshes = [...meshes];
    this.finals = [...finals];
    this.showFinished();
    this.paintedRun = -1;
    this.paintRun();
    this.setColours(colours);
  }

  /**
   * Prints the puzzle once in each of these colours, one after the other, on a cleared plate.
   * Without it there is a single print in the piece colours from `attach`.
   */
  setRunColours(colours: readonly string[]): void {
    this.runColours = colours.map((c) => new Color(c));
    this.run = Math.max(0, this.runColours.length - 1);
    this.paintedRun = -1;
    this.paintRun();
    this.notify();
  }

  private get runs(): number {
    return Math.max(1, this.runColours.length);
  }

  /** Gives the solid pieces and the lines the colour of the print that is on the plate. */
  private paintRun(): void {
    const colour = this.runColours[this.run];
    if (!colour || this.paintedRun === this.run) return;
    this.paintedRun = this.run;
    this.colours = this.puzzle ? this.puzzle.pieces.map(() => colour) : [];
    const finish = finishFor(`#${colour.getHexString()}`);
    // The growing print uses one shared material; the finished pieces have their own.
    applyFinish(this.material, finish);
    for (const mesh of [...this.meshes, ...this.finals]) {
      const material = mesh.material as MeshPhysicalMaterial;
      material.color.copy(colour);
      applyFinish(material, finish);
    }
    this.linesLayer = -1;
  }

  setColours(colours: readonly string[]): void {
    if (this.runColours.length > 0) return;
    this.colours = colours.map((c) => new Color(c));
    if (this.active) {
      this.linesLayer = -1;
      this.apply();
    }
  }

  get status(): SimStatus {
    const layers = this.path?.layers.length ?? 0;
    const finished = this.path !== null && this.time >= this.path.totalSeconds;
    const done = this.path !== null ? this.completedLayers() : 0;
    return {
      active: this.active,
      playing: this.playing,
      layer: this.active ? Math.min(layers, done + (finished ? 0 : 1)) : layers,
      layers,
      run: this.run + 1,
      runs: this.runs,
      finished: this.active ? finished && this.run === this.runs - 1 : false,
    };
  }

  /** Number of layers in the toolpath for the attached puzzle (builds it the first time). */
  get layerCount(): number {
    return this.ensurePath().layers.length;
  }

  setSpeed(speed: SimSpeed): void {
    this.speed = speed;
  }

  /** Starts, resumes or restarts the print. */
  play(): void {
    const path = this.ensurePath();
    if (!this.active || (this.time >= path.totalSeconds + LEAD && this.run === this.runs - 1)) {
      this.run = 0;
      this.time = -LEAD;
    }
    this.active = true;
    this.playing = true;
    this.apply();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.apply();
  }

  /** Jumps to the moment layer `k` (counted from 1) has just been finished, and pauses. */
  seekLayer(k: number): void {
    const path = this.ensurePath();
    const layer = Math.min(path.layers.length, Math.max(1, Math.round(k)));
    this.time = path.layerStart[layer - 1]! + path.layers[layer - 1]!.seconds - 0.001;
    this.active = true;
    this.playing = false;
    this.apply();
  }

  /** Jumps to a moment in the print (print seconds from its start) and waits there. */
  seekTime(seconds: number): void {
    const path = this.ensurePath();
    this.time = Math.min(path.totalSeconds + LEAD, Math.max(-LEAD, seconds));
    this.active = true;
    this.playing = false;
    this.apply();
  }
  /** Moves the clock on by `seconds` of real time. Returns true while something changed. */
  tick(seconds: number): boolean {
    if (!this.playing || !this.path) return false;
    const rate = this.path.totalSeconds / SPEED_SECONDS[this.speed];
    this.time += seconds * rate;
    if (this.time >= this.path.totalSeconds + LEAD) {
      if (this.run < this.runs - 1) {
        // The next print starts on a cleared plate, in the next colour.
        this.run++;
        this.time = -LEAD;
      } else {
        this.time = this.path.totalSeconds + LEAD;
        this.playing = false;
      }
    }
    this.apply();
    return true;
  }

  /** Back to the finished puzzle with the head parked. */
  reset(): void {
    this.active = false;
    this.playing = false;
    this.time = 0;
    this.run = this.runs - 1;
    this.paintRun();
    this.clearLines();
    this.tip.visible = false;
    this.showFinished();
    this.rig.setPose(PARK_POSE);
    this.rig.setSpoolAngle(0);
    this.notify();
  }

  dispose(): void {
    this.reset();
    this.clearLines();
    this.parent.remove(this.tip);
    this.tip.geometry.dispose();
    this.material.dispose();
  }

  // ---- internals -----------------------------------------------------------------------------

  private ensurePath(): Toolpath {
    if (!this.path) {
      if (!this.puzzle) throw new Error('No puzzle attached to the print simulation');
      this.path = buildToolpath(this.puzzle);
    }
    return this.path;
  }

  private completedLayers(): number {
    const path = this.path!;
    if (this.time < 0) return 0;
    if (this.time >= path.totalSeconds) return path.layers.length;
    return stateAt(path, this.time).layer;
  }

  private clearLines(): void {
    if (this.lines) {
      this.parent.remove(this.lines);
      this.lines.geometry.dispose();
      this.lines = null;
    }
    this.linesLayer = -1;
  }

  /** The finished puzzle at full height: the hollow pieces show, the plain blocks they grow from do not. */
  private showFinished(): void {
    this.meshes.forEach((mesh, i) => {
      const final = this.finals[i];
      const hollow = final !== undefined && final !== mesh;
      mesh.visible = !hollow;
      mesh.scale.z = 1;
      if (hollow) {
        final.visible = true;
        final.scale.z = 1;
      }
    });
  }

  /** Builds the line-by-line picture of one layer. */
  private buildLines(index: number): void {
    this.clearLines();
    const path = this.path!;
    const layer = path.layers[index]!;
    const count = layer.moves.length / MOVE_STRIDE;
    this.quadsBefore = new Uint32Array(count + 1);
    let quads = 0;
    for (let i = 0; i < count; i++) {
      this.quadsBefore[i] = quads;
      if (layer.moves[i * MOVE_STRIDE + 4]! !== MOVE.TRAVEL) quads++;
    }
    this.quadsBefore[count] = quads;
    const geometry = quadGeometry(quads);
    let q = 0;
    for (let i = 0; i < count; i++) {
      const o = i * MOVE_STRIDE;
      const kind = layer.moves[o + 4]!;
      if (kind === MOVE.TRAVEL) continue;
      const colour = this.shaded(layer.owner[i]!, kind);
      setQuad(
        geometry,
        q++,
        [layer.moves[o]!, layer.moves[o + 1]!, layer.moves[o + 2]!, layer.moves[o + 3]!],
        layer.zTop + kind * KIND_LIFT,
        path.lineWidth * LINE_OVERLAP,
        colour,
      );
    }
    geometry.setDrawRange(0, 0);
    this.lines = new Mesh(geometry, this.material);
    this.lines.frustumCulled = false;
    this.parent.add(this.lines);
    this.linesLayer = index;
  }

  private shaded(owner: number, kind: number): Color {
    return (this.colours[owner] ?? new Color('#cccccc')).clone().multiplyScalar(SHADE[kind] ?? 1);
  }

  /** Puts everything where it should be at the current time. */
  private apply(): void {
    this.paintRun();
    const path = this.ensurePath();
    const total = path.totalSeconds;
    const layers = path.layers.length;
    const first = stateAt(path, 0);
    const last = stateAt(path, total);
    const t = this.time;
    let pose: Pose;
    let completed: number;
    let extruded: number;
    let live: ReturnType<typeof stateAt> | null = null;

    if (t < 0) {
      // From the parked spot: slide over the plate first, then come down to the first layer.
      const u = (t + LEAD) / LEAD;
      pose = {
        x: lerp(PARK_POSE.x, first.x, smooth(u / 0.6)),
        y: lerp(PARK_POSE.y, first.y, smooth(u / 0.6)),
        z: lerp(PARK_POSE.z, first.z, smooth((u - 0.6) / 0.4)),
      };
      completed = 0;
      extruded = 0;
    } else if (t >= total) {
      // Back to the parked spot: lift away from the pieces first, then slide aside.
      const u = (t - total) / LEAD;
      pose = {
        x: lerp(last.x, PARK_POSE.x, smooth((u - 0.5) / 0.5)),
        y: lerp(last.y, PARK_POSE.y, smooth((u - 0.5) / 0.5)),
        z: lerp(last.z, PARK_POSE.z, smooth(u / 0.5)),
      };
      completed = layers;
      extruded = path.totalExtrudedMm;
    } else {
      live = stateAt(path, t);
      pose = { x: live.x, y: live.y, z: live.z };
      completed = live.layer;
      extruded = live.extrudedMm;
    }

    this.rig.setPose(pose);
    const filament =
      (extruded * path.lineWidth * path.layerHeight) / (Math.PI * (FILAMENT_DIAMETER_MM / 2) ** 2);
    this.rig.setSpoolAngle(filament / SPOOL_RADIUS_MM);

    // The solid part: as tall as the layers finished so far.
    const height = completed * path.layerHeight;
    const full = completed >= layers;
    this.meshes.forEach((mesh, i) => {
      const final = this.finals[i];
      const hollow = final !== undefined && final !== mesh;
      mesh.visible = completed > 0 && !(hollow && full);
      mesh.scale.z = Math.max(height, 1e-3) / PUZZLE_THICKNESS_MM;
      // A pocket cannot be squashed to the printed height, so the finished piece takes over at the end.
      if (hollow) {
        final.visible = full;
        final.scale.z = 1;
      }
    });

    // The layer being printed, line by line.
    if (live) {
      if (this.linesLayer !== live.layer) this.buildLines(live.layer);
      const layer = path.layers[live.layer]!;
      const o = live.move * MOVE_STRIDE;
      const moving = live.extruding && layer.moves.length > 0;
      const whole = this.quadsBefore[live.move] ?? 0;
      this.lines!.geometry.setDrawRange(0, whole * 6);
      const length = moving
        ? Math.hypot(live.x - layer.moves[o]!, live.y - layer.moves[o + 1]!)
        : 0;
      this.tip.visible = moving && length > 1e-4;
      if (this.tip.visible) {
        const kind = layer.moves[o + 4]!;
        setQuad(
          this.tip.geometry,
          0,
          [layer.moves[o]!, layer.moves[o + 1]!, live.x, live.y],
          layer.zTop + kind * KIND_LIFT,
          path.lineWidth * LINE_OVERLAP,
          this.shaded(layer.owner[live.move]!, kind),
        );
        (this.tip.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
        (this.tip.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
      }
    } else {
      this.clearLines();
      this.tip.visible = false;
    }
    this.notify();
  }

  private notify(): void {
    const s = this.status;
    const key = `${s.active}|${s.playing}|${s.layer}|${s.layers}|${s.finished}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.onStatus(s);
  }
}

/** Kept in one place so the UI and the tests agree on what a whole print is. */
export const PRINT_LAYERS = Math.round(PUZZLE_THICKNESS_MM / A1_MINI.layerHeight);
