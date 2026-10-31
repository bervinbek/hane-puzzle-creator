import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { puzzleMeshes, puzzleStl } from '../src/core/export/bundle';
import { difference, offset, totalArea, type Poly } from '../src/core/geometry/clip';
import { bounds, pointInPolygon, type Vec2 } from '../src/core/geometry/polygon';
import { signedArea } from '../src/core/geometry/polyline';
import { DEFAULT_TIDY, DRAWN_TIDY, OutlineExtractor } from '../src/core/outline';
import { A1_MINI, ENGRAVE } from '../src/core/printer/a1mini';
import { checkMesh, extrudePolygon, pocketRing } from '../src/core/mesh/extrude';
import { grooveRings, normaliseMarks, scaleMarks, type Marks } from '../src/core/puzzle/engraving';
import { DEFAULT_PUZZLE, generatePuzzle } from '../src/core/puzzle/generate';

/** A drawing as the pad makes it: 800 px square, a pen 10 px wide, black on white. */
const SIZE = 800;
const PEN = 10;

function paint(strokes: readonly (readonly Vec2[])[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4).fill(255);
  for (const stroke of strokes) {
    const last = Math.max(1, stroke.length - 1);
    for (let i = 0; i < last; i++) {
      const a = stroke[i]!;
      const b = stroke[Math.min(i + 1, stroke.length - 1)]!;
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - PEN));
      const x1 = Math.min(SIZE - 1, Math.ceil(Math.max(a[0], b[0]) + PEN));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - PEN));
      const y1 = Math.min(SIZE - 1, Math.ceil(Math.max(a[1], b[1]) + PEN));
      const vx = b[0] - a[0];
      const vy = b[1] - a[1];
      const len2 = vx * vx + vy * vy || 1;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / len2));
          if (Math.hypot(x - (a[0] + t * vx), y - (a[1] + t * vy)) <= PEN / 2) {
            const at = (y * SIZE + x) * 4;
            data[at] = data[at + 1] = data[at + 2] = 0;
          }
        }
      }
    }
  }
  return data;
}

const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number) =>
  Array.from({ length: n + 1 }, (_, i): Vec2 => {
    const t = a0 + ((a1 - a0) * i) / n;
    return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
  });

/** An egg-shaped animal with two eye dots, a smile and two stripes, one running into the outline. */
const FACE: Vec2[][] = [
  arc(400, 400, 340, 240, 0, Math.PI * 2, 120),
  arc(280, 330, 6, 6, 0, 6.3, 12),
  arc(520, 330, 6, 6, 0, 6.3, 12),
  arc(400, 440, 120, 70, 0.3, Math.PI - 0.3, 40),
  [
    [400, 160],
    [400, 260],
  ],
  [
    [150, 400],
    [230, 400],
  ],
];

const image = (strokes: readonly (readonly Vec2[])[]) => ({
  width: SIZE,
  height: SIZE,
  data: paint(strokes),
});

describe('finding the marks inside a drawing', () => {
  const result = new OutlineExtractor(image(FACE), PEN).run(DRAWN_TIDY);

  it('finds each mark once and still finds the outline', () => {
    expect(result.ok).toBe(true);
    expect(result.marksMm).toHaveLength(5);
    expect(result.penMm).toBeGreaterThan(1.5);
    expect(result.penMm).toBeLessThan(3.5);
  });

  it('puts the marks inside the outline, one pen width or more from its edge', () => {
    const edge = offset([result.outlineMm], -0.9 * result.penMm);
    for (const ring of result.marksMm) {
      for (const [x, y] of ring) {
        expect(edge.some((e) => pointInPolygon(x, y, e))).toBe(true);
      }
    }
  });

  it('finds nothing when the pen width is not known (a photo)', () => {
    const photo = new OutlineExtractor(image(FACE)).run(DRAWN_TIDY);
    expect(photo.ok).toBe(true);
    expect(photo.marksMm).toEqual([]);
  });

  it('finds nothing in a drawing that has only an outline', () => {
    const plain = new OutlineExtractor(image([FACE[0]!]), PEN).run(DRAWN_TIDY);
    expect(plain.ok).toBe(true);
    expect(plain.marksMm).toEqual([]);
  });

  it('is the same every time', () => {
    const again = new OutlineExtractor(image(FACE), PEN).run(DEFAULT_TIDY);
    const twice = new OutlineExtractor(image(FACE), PEN).run(DEFAULT_TIDY);
    expect(again.marksMm).toEqual(twice.marksMm);
  });
});

describe('making the marks into grooves', () => {
  const found = new OutlineExtractor(image(FACE), PEN).run(DRAWN_TIDY);
  const marks: Marks = { rings: found.marksMm, penMm: found.penMm };

  it('makes every groove the same width, however wide the pen was', () => {
    const stripe: Poly = [
      [-20, -1.5],
      [20, -1.5],
      [20, 1.5],
      [-20, 1.5],
    ];
    for (const pen of [3, 6, 9]) {
      const wide: Poly = stripe.map(([x, y]) => [x, (y * pen) / 3]);
      const [groove] = normaliseMarks({ rings: [wide], penMm: pen });
      const b = bounds(groove!);
      expect(b.maxY - b.minY).toBeCloseTo(ENGRAVE.widthMm, 1);
    }
  });

  it('widens a mark that is thinner than the narrowest groove', () => {
    const thin: Poly = [
      [-20, -0.2],
      [20, -0.2],
      [20, 0.2],
      [-20, 0.2],
    ];
    const [groove] = normaliseMarks({ rings: [thin], penMm: 0.4 });
    const b = bounds(groove!);
    expect(b.maxY - b.minY).toBeCloseTo(ENGRAVE.widthMm, 1);
  });

  it('joins marks that are closer than the narrowest groove, and drops specks', () => {
    const bar = (y: number): Poly => [
      [-20, y],
      [20, y],
      [20, y + 1.2],
      [-20, y + 1.2],
    ];
    const joined = normaliseMarks({ rings: [bar(0), bar(1.7)], penMm: 1.2 });
    expect(joined).toHaveLength(1);
    const speck: Poly = [
      [0, 0],
      [0.1, 0],
      [0.1, 0.1],
      [0, 0.1],
    ];
    expect(normaliseMarks({ rings: [speck], penMm: 0.4 })).toEqual([]);
  });

  it('scales with the outline when it is fitted to a smaller plate', () => {
    const half = scaleMarks(marks, 0.5);
    expect(half.penMm).toBeCloseTo(marks.penMm / 2, 9);
    expect(half.rings[0]![0]![0]).toBeCloseTo(marks.rings[0]![0]![0] / 2, 9);
  });

  describe('on real pieces', () => {
    const puzzle = generatePuzzle(found.outlineMm, {
      ...DEFAULT_PUZZLE,
      count: 6,
      seed: 3,
      marks,
    });

    it('gives every piece grooves that are clear of its edge and its magnet pocket', () => {
      expect(puzzle.ok).toBe(true);
      const total = puzzle.pieces.reduce((s, p) => s + p.grooves.length, 0);
      expect(total).toBeGreaterThan(0);
      for (const piece of puzzle.pieces) {
        if (piece.grooves.length === 0) continue;
        const room = offset([piece.polygon], -(ENGRAVE.edgeMarginMm - 0.02));
        expect(totalArea(difference(piece.grooves, room))).toBeLessThan(0.01);
        if (piece.pocket) {
          const keepOut = offset([pocketRing(piece.pocket)], ENGRAVE.pocketMarginMm - 0.02);
          const overlap = difference(piece.grooves, difference(piece.grooves, keepOut));
          expect(totalArea(overlap)).toBeLessThan(0.01);
        }
        for (const ring of piece.grooves) expect(Math.abs(signedArea(ring))).toBeGreaterThan(0.5);
      }
    });

    it('extrudes to closed solids that have lost exactly the grooves', () => {
      const withGrooves = puzzleMeshes(puzzle);
      const without = puzzle.pieces.map((p) =>
        extrudePolygon(p.polygon, 3, undefined, p.pocket ?? undefined),
      );
      puzzle.pieces.forEach((piece, i) => {
        const a = checkMesh(withGrooves[i]!);
        const b = checkMesh(without[i]!);
        expect(a.watertight, `piece ${i}`).toBe(true);
        const cut = totalArea(piece.grooves) * ENGRAVE.depthMm;
        expect(b.volume - a.volume).toBeCloseTo(cut, 2);
      });
    });

    it('keeps the STL the same every time, on the plate, and not much bigger', () => {
      const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
      const stl = puzzleStl(puzzle);
      expect(hash(puzzleStl(puzzle))).toBe(hash(stl));
      const plain = puzzleStl({
        ...puzzle,
        pieces: puzzle.pieces.map((p) => ({ ...p, grooves: [] })),
      });
      expect(hash(plain)).not.toBe(hash(stl));
      expect(stl.length).toBeLessThan(plain.length * 3);
      expect(stl.length).toBeLessThan(4 * 1024 * 1024);
      const box = bounds(puzzle.pieces.flatMap((p) => p.polygon));
      expect(box.maxX - box.minX).toBeLessThanOrEqual(
        A1_MINI.buildVolume.x - 2 * A1_MINI.plateMargin,
      );
    });

    it('depth zero gives the same file as no grooves at all', () => {
      const off = puzzleStl(puzzle, undefined, undefined, 0);
      const none = puzzleStl({
        ...puzzle,
        pieces: puzzle.pieces.map((p) => ({ ...p, grooves: [] })),
      });
      expect(Buffer.from(off).equals(Buffer.from(none))).toBe(true);
    });
  });

  it('leaves a puzzle made without marks exactly as it was', () => {
    const none = generatePuzzle(found.outlineMm, { ...DEFAULT_PUZZLE, count: 6, seed: 3 });
    expect(none.pieces.every((p) => p.grooves.length === 0)).toBe(true);
  });

  it('copes with a groove being asked for a piece with no room', () => {
    const tiny: Poly = [
      [0, 0],
      [1.5, 0],
      [1.5, 1.5],
      [0, 1.5],
    ];
    expect(grooveRings(normaliseMarks(marks), tiny, null)).toEqual([]);
  });
});
