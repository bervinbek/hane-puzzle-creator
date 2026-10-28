import { Group, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { centroid, signedArea } from '../core/geometry/polyline';
import { extrudePolygon } from '../core/mesh/extrude';
import { MAX_LIFT_MM, MAX_SPREAD, explodeOffsets, fitDistance } from './explode';
import { pieceGeometry } from './geometry';

describe('centroid', () => {
  it('finds the middle of a rectangle and of an L shape', () => {
    expect(
      centroid([
        [0, 0],
        [10, 0],
        [10, 4],
        [0, 4],
      ]),
    ).toEqual([5, 2]);
    const l: [number, number][] = [
      [0, 0],
      [30, 0],
      [30, 10],
      [10, 10],
      [10, 30],
      [0, 30],
    ];
    const [x, y] = centroid(l);
    expect(signedArea(l)).toBe(500);
    expect(x).toBeCloseTo(11, 5);
    expect(y).toBeCloseTo(11, 5);
  });
});

describe('explodeOffsets', () => {
  const centres: [number, number][] = [
    [-20, 0],
    [20, 0],
    [0, 20],
    [0, -20],
  ];

  it('does not move anything when the puzzle is together', () => {
    for (const o of explodeOffsets(centres, 0)) expect(o).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('moves every piece straight away from the middle and lifts it', () => {
    const apart = explodeOffsets(centres, 1);
    expect(apart[0]).toMatchObject({ x: -20 * MAX_SPREAD, y: 0, z: MAX_LIFT_MM });
    expect(apart[1]!.x).toBeCloseTo(20 * MAX_SPREAD, 9);
    expect(apart[2]!.y).toBeCloseTo(20 * MAX_SPREAD, 9);
    expect(apart[3]!.y).toBeCloseTo(-20 * MAX_SPREAD, 9);
  });

  it('scales smoothly and clamps out-of-range amounts', () => {
    expect(explodeOffsets(centres, 0.5)[1]!.x).toBeCloseTo(10 * MAX_SPREAD, 9);
    expect(explodeOffsets(centres, 7)).toEqual(explodeOffsets(centres, 1));
    expect(explodeOffsets(centres, -3)).toEqual(explodeOffsets(centres, 0));
    expect(explodeOffsets([], 1)).toEqual([]);
  });
});

describe('fitDistance', () => {
  it('backs the camera off further for a narrow view than a wide one', () => {
    expect(fitDistance(100, 35, 0.6)).toBeGreaterThan(fitDistance(100, 35, 1.6));
    expect(fitDistance(100, 35, 2)).toBeCloseTo(fitDistance(100, 35, 3), 5);
  });
});

describe('pieceGeometry', () => {
  const mesh = extrudePolygon(
    [
      [0, 0],
      [10, 0],
      [10, 5],
      [0, 5],
    ],
    3,
  );
  const geometry = pieceGeometry(mesh);

  it('unshares triangles so each face is lit flat', () => {
    expect(geometry.index).toBeNull();
    expect(geometry.getAttribute('position').count).toBe(12 * 3);
    const n = geometry.getAttribute('normal');
    for (let i = 0; i < n.count; i++) {
      expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
    }
  });

  it('has a roof that faces up (+z in core coordinates)', () => {
    const n = geometry.getAttribute('normal');
    let up = 0;
    for (let i = 0; i < n.count; i++) if (n.getZ(i) > 0.99) up++;
    expect(up).toBe(6);
  });
});

describe('the one place that turns z-up into y-up', () => {
  it('rotating the world group by -90 degrees about x makes core +z point up and core +y point away', () => {
    const world = new Group();
    world.rotation.x = -Math.PI / 2;
    world.updateMatrixWorld();
    const up = new Vector3(0, 0, 1).applyMatrix4(world.matrixWorld);
    const away = new Vector3(0, 1, 0).applyMatrix4(world.matrixWorld);
    expect([up.x, up.y, up.z].map((v) => Math.round(v))).toEqual([0, 1, 0]);
    expect([away.x, away.y, away.z].map((v) => Math.round(v))).toEqual([0, 0, -1]);
  });
});
