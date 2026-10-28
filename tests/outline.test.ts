import { describe, expect, it } from 'vitest';
import { bounds, isSimple, type Vec2 } from '../src/core/geometry/polygon';
import { signedArea } from '../src/core/geometry/polyline';
import { DEFAULT_TIDY, OutlineExtractor } from '../src/core/outline';
import { usablePlateSize } from '../src/core/printer/a1mini';
import { circleAt, fishAt, fixtures, polygonIou, renderDrawing } from './fixtures/synth';

describe('outline extraction on realistic drawings', () => {
  for (const d of fixtures()) {
    it(`${d.name}: finds a clean closed outline`, () => {
      const result = new OutlineExtractor(d.image).run({ ...DEFAULT_TIDY, ...d.params });
      expect(result.problem).toBeNull();
      expect(result.ok).toBe(true);
      const iou = polygonIou(d.truth, result.outlinePx, d.image.width, d.image.height, 3);
      expect(iou).toBeGreaterThan(0.9);
      expect(isSimple(result.outlineMm)).toBe(true);
    });
  }
});

describe('outline units and orientation', () => {
  const fish = fishAt(225, 169, 340);
  const result = new OutlineExtractor(renderDrawing({ shape: fish })).run(DEFAULT_TIDY);

  it('fits the longest side to the plate size and centres on the origin', () => {
    const b = bounds(result.outlineMm);
    expect(b.maxX - b.minX).toBeCloseTo(usablePlateSize(), 0);
    expect((b.maxX + b.minX) / 2).toBeCloseTo(0, 0);
    expect((b.maxY + b.minY) / 2).toBeCloseTo(0, 0);
    expect(result.widthMm).toBeCloseTo(b.maxX - b.minX, 5);
  });

  it('is counter-clockwise with y pointing up', () => {
    expect(signedArea(result.outlineMm)).toBeGreaterThan(0);
    // A triangle with its apex at the top of the picture must have its apex at positive y.
    const apex: Vec2[] = [
      [225, 60],
      [330, 280],
      [120, 280],
    ];
    const tri = new OutlineExtractor(renderDrawing({ shape: apex })).run(DEFAULT_TIDY);
    const top = tri.outlineMm.reduce((a, p) => (p[1] > a[1] ? p : a));
    expect(top[1]).toBeGreaterThan(0);
    expect(Math.abs(top[0])).toBeLessThan(10);
  });

  it('spaces points about half a millimetre apart', () => {
    const pts = result.outlineMm;
    const gaps = pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length]!;
      return Math.hypot(q[0] - p[0], q[1] - p[1]);
    });
    expect(Math.max(...gaps)).toBeLessThan(0.75);
  });

  it('is deterministic', () => {
    const again = new OutlineExtractor(renderDrawing({ shape: fish })).run(DEFAULT_TIDY);
    expect(again.outlineMm).toEqual(result.outlineMm);
  });
});

describe('outline problems are reported, not hidden', () => {
  it('says blank for an empty page', () => {
    const blank = renderDrawing({ shape: [], noise: 3 });
    expect(new OutlineExtractor(blank).run(DEFAULT_TIDY).problem).toBe('blank');
  });

  it('says open when the line has a gap the chosen setting cannot close', () => {
    const fish = fishAt(225, 169, 340);
    const img = renderDrawing({ shape: fish, gaps: [{ at: fish[27]!, radius: 40 }] });
    const r = new OutlineExtractor(img).run({ ...DEFAULT_TIDY, closeGaps: 'small' });
    expect(r.ok).toBe(false);
    expect(r.problem).toBe('open');
  });

  it('says tiny for a very small drawing', () => {
    const img = renderDrawing({ shape: circleAt(225, 169, 14), strokeWidth: 3 });
    const r = new OutlineExtractor(img).run(DEFAULT_TIDY);
    expect(r.ok).toBe(false);
    expect(r.problem).toBe('tiny');
  });

  it('keeps only the biggest shape when there are two', () => {
    const img = renderDrawing({ shape: fishAt(150, 169, 240), details: [circleAt(370, 90, 50)] });
    const r = new OutlineExtractor(img).run(DEFAULT_TIDY);
    expect(r.ok).toBe(true);
    const b = bounds(r.outlinePx);
    expect(b.maxX).toBeLessThan(300);
  });
});

describe('speed', () => {
  it('handles a 900 px photo quickly enough for live sliders', () => {
    const fish = fishAt(450, 338, 680);
    const big = renderDrawing({
      w: 900,
      h: 676,
      shape: fish,
      strokeWidth: 8,
      noise: 8,
      specks: 120,
    });
    const t0 = performance.now();
    const extractor = new OutlineExtractor(big);
    const t1 = performance.now();
    const r = extractor.run(DEFAULT_TIDY);
    const t2 = performance.now();
    console.log(`prepare ${Math.round(t1 - t0)} ms, run ${Math.round(t2 - t1)} ms`);
    expect(r.ok).toBe(true);
    expect(t2 - t1).toBeLessThan(1500);
  });
});
