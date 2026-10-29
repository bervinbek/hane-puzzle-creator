import { BoxGeometry, Mesh, Vector3, type Color } from 'three';
import { describe, expect, it } from 'vitest';
import { pointInPolygon } from '../core/geometry/polygon';
import { fitToPlate } from '../core/geometry/polyline';
import { PUZZLE_THICKNESS_MM } from '../core/printer/a1mini';
import { buildToolpath, stateAt } from '../core/printer/toolpath';
import { DEFAULT_PUZZLE, generatePuzzle } from '../core/puzzle/generate';
import { FISH_OUTLINE } from '../core/samples/fish';
import { PARK_POSE } from './printer/pose';
import { buildPrinter } from './printer/model';
import { PRINT_LAYERS, PrintSimulation, type SimStatus } from './simulation';

const fish = fitToPlate([...FISH_OUTLINE], 170).points;
const puzzle = generatePuzzle(fish, { ...DEFAULT_PUZZLE, count: 8, seed: 1 });
const path = buildToolpath(puzzle);

/** A rig with one stand-in block per piece on the plate, and a simulation attached to them. */
function setup() {
  const rig = buildPrinter({ textures: false });
  const meshes = puzzle.pieces.map(() => {
    const m = new Mesh(new BoxGeometry(1, 1, PUZZLE_THICKNESS_MM));
    rig.plate.add(m);
    return m;
  });
  const events: SimStatus[] = [];
  const sim = new PrintSimulation(rig, rig.plate, (s) => events.push(s));
  sim.attach(
    puzzle,
    meshes,
    meshes.map(() => '#ffc93c'),
  );
  /** Where the nozzle tip is, in the plate's own coordinates. */
  const nozzleOnPlate = (): Vector3 => {
    rig.group.updateMatrixWorld(true);
    return rig.plate.worldToLocal(rig.nozzleTip.getWorldPosition(new Vector3()));
  };
  return { rig, meshes, sim, events, nozzleOnPlate };
}

describe('print simulation', () => {
  it('prints in 15 layers', () => {
    expect(PRINT_LAYERS).toBe(15);
    expect(setup().sim.layerCount).toBe(15);
  });

  it('puts the nozzle exactly where the toolpath says, in plate coordinates', () => {
    const { sim, nozzleOnPlate } = setup();
    for (const f of [0, 0.07, 0.25, 0.5, 0.74, 0.99, 1]) {
      const seconds = path.totalSeconds * f;
      sim.seekTime(seconds);
      const expected = stateAt(path, seconds);
      const at = nozzleOnPlate();
      expect(at.x).toBeCloseTo(expected.x, 3);
      expect(at.y).toBeCloseTo(expected.y, 3);
      expect(at.z).toBeCloseTo(expected.z, 3);
    }
  });

  it('lifts away from the pieces before it parks, and comes down on the first layer', () => {
    const { sim, nozzleOnPlate } = setup();
    const first = stateAt(path, 0);
    sim.seekTime(-30);
    expect(nozzleOnPlate().x).toBeCloseTo(PARK_POSE.x, 3);
    expect(nozzleOnPlate().z).toBeCloseTo(PARK_POSE.z, 3);
    // Halfway in, the head is sliding over the plate, still high above it.
    sim.seekTime(-15);
    expect(nozzleOnPlate().z).toBeCloseTo(PARK_POSE.z, 3);
    expect(nozzleOnPlate().x).toBeLessThan(PARK_POSE.x);
    expect(nozzleOnPlate().x).toBeGreaterThan(first.x);
    sim.seekTime(0);
    expect(nozzleOnPlate().z).toBeCloseTo(first.z, 3);
    sim.seekTime(path.totalSeconds + 30 * 0.25);
    // Halfway through the lift the head is still over the last spot, well above the pieces.
    expect(nozzleOnPlate().z).toBeGreaterThan(PUZZLE_THICKNESS_MM + 20);
    sim.seekTime(path.totalSeconds + 30);
    expect(nozzleOnPlate().x).toBeCloseTo(PARK_POSE.x, 3);
    expect(nozzleOnPlate().z).toBeCloseTo(PARK_POSE.z, 3);
  });
  it('keeps the nozzle over a piece whenever plastic is coming out', () => {
    const { sim, nozzleOnPlate } = setup();
    const polygons = puzzle.pieces.map((p) => p.polygon);
    sim.play();
    let extruding = 0;
    for (let i = 0; i < 4000; i++) {
      sim.tick(0.02);
      const t = (sim as unknown as { time: number }).time;
      if (t < 0 || t >= path.totalSeconds) continue;
      const state = stateAt(path, t);
      if (!state.extruding) continue;
      extruding++;
      const at = nozzleOnPlate();
      expect(polygons.some((p) => pointInPolygon(at.x, at.y, p))).toBe(true);
    }
    expect(extruding).toBeGreaterThan(1000);
  });

  it('moves the pieces with the bed: the bed slides in y, the nozzle never does', () => {
    const { rig, meshes, sim } = setup();
    const worldY = (): number => {
      rig.group.updateMatrixWorld(true);
      return meshes[0]!.getWorldPosition(new Vector3()).y;
    };
    const nozzleWorldY = (): number => rig.nozzleTip.getWorldPosition(new Vector3()).y;
    sim.seekLayer(1);
    const bedA = rig.bed.position.y;
    const pieceA = worldY();
    const nozzleA = nozzleWorldY();
    // A later layer ends somewhere else on the plate, so the bed has to have moved.
    let moved = false;
    for (let k = 2; k <= 15 && !moved; k++) {
      sim.seekLayer(k);
      if (Math.abs(rig.bed.position.y - bedA) > 1) moved = true;
    }
    expect(moved).toBe(true);
    expect(worldY() - pieceA).toBeCloseTo(rig.bed.position.y - bedA, 6);
    expect(nozzleWorldY()).toBeCloseTo(nozzleA, 6);
  });

  it('shows the layers finished so far as the height of the solid pieces', () => {
    const { meshes, sim } = setup();
    sim.seekLayer(5);
    // Layer 5 is being drawn line by line; the four before it are solid.
    for (const m of meshes) {
      expect(m.visible).toBe(true);
      expect(m.scale.z * PUZZLE_THICKNESS_MM).toBeCloseTo(4 * 0.2, 6);
    }
    sim.seekLayer(15);
    for (const m of meshes) expect(m.scale.z * PUZZLE_THICKNESS_MM).toBeCloseTo(14 * 0.2, 6);
  });

  it('reports the layer, pauses when scrubbed, and finishes with the full height', () => {
    const { meshes, sim, events } = setup();
    sim.seekLayer(7);
    expect(sim.status).toMatchObject({ active: true, playing: false, layer: 7, layers: 15 });
    sim.setSpeed('fast');
    sim.play();
    expect(sim.status.playing).toBe(true);
    for (let i = 0; i < 20_000 && sim.status.playing; i++) sim.tick(0.1);
    expect(sim.status).toMatchObject({ playing: false, finished: true, layer: 15 });
    for (const m of meshes) expect(m.scale.z).toBeCloseTo(1, 9);
    expect(events.at(-1)).toMatchObject({ finished: true });
    // Playing a finished print starts it again.
    sim.play();
    expect(sim.status).toMatchObject({ playing: true, finished: false, layer: 1 });
  });

  it('prints three times, one colour each, on a cleared plate', () => {
    const { meshes, sim } = setup();
    const colours = ['#ffffff', '#e6c7aa', '#e0a82e'];
    sim.setRunColours(colours);
    const colourOf = (): string =>
      (meshes[0]!.material as unknown as { color: Color }).color.getHexString();
    // Resting, it shows the last print: the finished gold puzzle.
    expect(sim.status).toMatchObject({ run: 3, runs: 3, active: false });
    expect(colourOf()).toBe('e0a82e');

    sim.setSpeed('fast');
    sim.play();
    expect(sim.status).toMatchObject({ run: 1, runs: 3, playing: true });
    const seen: string[] = [];
    let emptyBetween = 0;
    for (let i = 0; i < 60_000 && sim.status.playing; i++) {
      sim.tick(0.1);
      const { run, playing } = sim.status;
      if (playing && seen.at(-1) !== `${run}:${colourOf()}`) seen.push(`${run}:${colourOf()}`);
      // At the start of a print the plate is empty again.
      const t = (sim as unknown as { time: number }).time;
      if (run > 1 && t < 0 && !meshes[0]!.visible) emptyBetween++;
    }
    expect(seen).toEqual(['1:ffffff', '2:e6c7aa', '3:e0a82e']);
    expect(emptyBetween).toBeGreaterThan(0);
    expect(sim.status).toMatchObject({ run: 3, finished: true, playing: false, layer: 15 });
    expect(colourOf()).toBe('e0a82e');
    for (const m of meshes) expect(m.scale.z).toBeCloseTo(1, 9);
  });

  it('parks the head and shows the finished puzzle when reset', () => {
    const { rig, meshes, sim } = setup();
    sim.seekLayer(3);
    sim.reset();
    expect(rig.pose).toMatchObject(PARK_POSE);
    for (const m of meshes) {
      expect(m.visible).toBe(true);
      expect(m.scale.z).toBe(1);
    }
    expect(sim.status.active).toBe(false);
  });

  it('turns the spool as plastic is used, and never backwards', () => {
    const { rig, sim } = setup();
    const angle = (): number => rig.parts.spoolBody!.rotation.x;
    sim.seekLayer(1);
    const a = angle();
    sim.seekLayer(8);
    const b = angle();
    sim.seekLayer(15);
    const c = angle();
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('takes longer to watch at a slower speed', () => {
    const watch = (speed: 'slow' | 'fast'): number => {
      const { sim } = setup();
      sim.setSpeed(speed);
      sim.play();
      let seconds = 0;
      while (sim.status.playing && seconds < 1000) {
        sim.tick(0.05);
        seconds += 0.05;
      }
      return seconds;
    };
    expect(watch('slow')).toBeGreaterThan(watch('fast') * 3);
  });
});
