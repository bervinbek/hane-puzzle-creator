import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../src/core/geometry/polygon';
import type { RgbaImage } from '../src/core/image/gray';
import {
  isUsableQuad,
  straighten,
  straightSize,
  unitSquareToQuad,
  type Quad,
} from '../src/core/image/perspective';
import { DEFAULT_TIDY, OutlineExtractor } from '../src/core/outline';

/** A photo where each pixel's red is its x and green its y (mod 256), so positions can be read back. */
function coordinatePhoto(w: number, h: number): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      data.set([x % 256, y % 256, 0, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}

const close = (a: Vec2, b: Vec2, eps = 1e-6): void => {
  expect(a[0]).toBeCloseTo(b[0], -Math.log10(eps));
  expect(a[1]).toBeCloseTo(b[1], -Math.log10(eps));
};

/** A page seen at an angle: narrower at the top than the bottom, and a little turned. */
const KEYSTONE: Quad = [
  [60, 40],
  [240, 55],
  [290, 190],
  [20, 175],
];

describe('unitSquareToQuad', () => {
  it('puts the four corners of the square on the four corners of the page', () => {
    const at = unitSquareToQuad(KEYSTONE);
    close(at(0, 0), KEYSTONE[0]);
    close(at(1, 0), KEYSTONE[1]);
    close(at(1, 1), KEYSTONE[2]);
    close(at(0, 1), KEYSTONE[3]);
  });

  it('keeps straight lines straight: the middle of each side lies on that side', () => {
    const at = unitSquareToQuad(KEYSTONE);
    const onLine = (p: Vec2, a: Vec2, b: Vec2): number =>
      Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) /
      Math.hypot(b[0] - a[0], b[1] - a[1]);
    expect(onLine(at(0.5, 0), KEYSTONE[0], KEYSTONE[1])).toBeLessThan(1e-9);
    expect(onLine(at(0.5, 1), KEYSTONE[3], KEYSTONE[2])).toBeLessThan(1e-9);
    expect(onLine(at(0, 0.5), KEYSTONE[0], KEYSTONE[3])).toBeLessThan(1e-9);
    expect(onLine(at(1, 0.5), KEYSTONE[1], KEYSTONE[2])).toBeLessThan(1e-9);
  });

  it('puts the middle of the square where the two diagonals of the page cross', () => {
    const [a, b, c, d] = KEYSTONE;
    // Intersection of a-c and b-d.
    const den = (a[0] - c[0]) * (b[1] - d[1]) - (a[1] - c[1]) * (b[0] - d[0]);
    const t = ((a[0] - b[0]) * (b[1] - d[1]) - (a[1] - b[1]) * (b[0] - d[0])) / den;
    const cross: Vec2 = [a[0] + t * (c[0] - a[0]), a[1] + t * (c[1] - a[1])];
    close(unitSquareToQuad(KEYSTONE)(0.5, 0.5), cross, 1e-6);
  });

  it('is a plain scale and shift when the page is a rectangle', () => {
    const at = unitSquareToQuad([
      [10, 20],
      [110, 20],
      [110, 80],
      [10, 80],
    ]);
    close(at(0.5, 0.5), [60, 50]);
    close(at(0.25, 0.75), [35, 65]);
  });
});

describe('straighten', () => {
  it('cuts out a rectangle exactly, pixel for pixel', () => {
    const photo = coordinatePhoto(120, 90);
    const flat = straighten(photo, [
      [10, 20],
      [70, 20],
      [70, 60],
      [10, 60],
    ]);
    expect([flat.width, flat.height]).toEqual([60, 40]);
    const px = (x: number, y: number): number[] => [
      ...flat.data.slice((y * 60 + x) * 4, (y * 60 + x) * 4 + 4),
    ];
    expect(px(0, 0)).toEqual([10, 20, 0, 255]);
    expect(px(59, 39)).toEqual([69, 59, 0, 255]);
    expect(px(30, 20)).toEqual([40, 40, 0, 255]);
  });

  it('turns a page seen at an angle into an upright rectangle of about the right size', () => {
    const flat = straighten(coordinatePhoto(320, 220), KEYSTONE);
    const { width, height } = straightSize(KEYSTONE);
    expect([flat.width, flat.height]).toEqual([width, height]);
    expect(width).toBeGreaterThan(250);
    expect(width).toBeLessThan(290);
    // The corners of the result show the corners of the page.
    const at = (x: number, y: number): number[] => [
      ...flat.data.slice((y * width + x) * 4, (y * width + x) * 4 + 2),
    ];
    const [tl, br] = [at(0, 0), at(width - 1, height - 1)];
    expect(Math.abs(tl[0]! - 60)).toBeLessThanOrEqual(3);
    expect(Math.abs(tl[1]! - 40)).toBeLessThanOrEqual(3);
    expect(Math.abs(br[0]! - (290 % 256))).toBeLessThanOrEqual(3); // x is stored mod 256
    expect(Math.abs(br[1]! - 190)).toBeLessThanOrEqual(3);
  });

  it('shows white paper where the corners reach outside the photo', () => {
    const flat = straighten(coordinatePhoto(50, 50), [
      [-30, -30],
      [20, -30],
      [20, 20],
      [-30, 20],
    ]);
    expect([...flat.data.slice(0, 4)]).toEqual([255, 255, 255, 255]);
  });

  it('never makes a picture bigger than the limit, and keeps its shape', () => {
    const size = straightSize(
      [
        [0, 0],
        [4000, 0],
        [4000, 2000],
        [0, 2000],
      ],
      800,
    );
    expect(size).toEqual({ width: 800, height: 400 });
    expect(
      straightSize(
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
        800,
      ),
    ).toEqual({ width: 10, height: 10 });
  });

  it('lets the outline finder read a drawing that was photographed at an angle', () => {
    // A flat page: white with a thick black ellipse outline.
    const W = 300;
    const H = 200;
    const flatPage = new Uint8ClampedArray(W * H * 4).fill(255);
    const ink = (x: number, y: number): boolean => {
      const d = ((x - W / 2) / 110) ** 2 + ((y - H / 2) / 60) ** 2;
      return d > 0.82 && d < 1.12;
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) if (ink(x, y)) flatPage.set([20, 20, 20, 255], (y * W + x) * 4);
    }
    // The "photo": the same page put onto a keystone shape on a bigger sheet. Each photo pixel
    // looks up its place on the page by walking the page's own map in reverse (solved by search).
    const PW = 420;
    const PH = 300;
    const page: Quad = [
      [80, 50],
      [330, 70],
      [380, 250],
      [40, 230],
    ];
    const at = unitSquareToQuad(page);
    const photo = new Uint8ClampedArray(PW * PH * 4).fill(235);
    for (let v = 0; v < H * 2; v++) {
      for (let u = 0; u < W * 2; u++) {
        const [px, py] = at((u + 0.5) / (W * 2), (v + 0.5) / (H * 2));
        const x = Math.floor(px);
        const y = Math.floor(py);
        if (x < 0 || y < 0 || x >= PW || y >= PH) continue;
        const sx = Math.min(W - 1, Math.floor(u / 2));
        const sy = Math.min(H - 1, Math.floor(v / 2));
        const o = (y * PW + x) * 4;
        const s = (sy * W + sx) * 4;
        photo.set([flatPage[s]!, flatPage[s + 1]!, flatPage[s + 2]!, 255], o);
      }
    }
    const straight = straighten({ width: PW, height: PH, data: photo }, page);
    const result = new OutlineExtractor(straight).run(DEFAULT_TIDY);
    expect(result.ok).toBe(true);
    // An upright ellipse about 2 : 1 wide, as drawn (the angle is gone).
    const ratio = result.widthMm / result.heightMm;
    expect(ratio).toBeGreaterThan(1.6);
    expect(ratio).toBeLessThan(2.3);
  });
});

describe('isUsableQuad', () => {
  it('accepts a box and a keystone, going round either way', () => {
    expect(isUsableQuad(KEYSTONE)).toBe(true);
    expect(isUsableQuad([KEYSTONE[3], KEYSTONE[2], KEYSTONE[1], KEYSTONE[0]])).toBe(true);
  });

  it('refuses crossed corners, a pushed-in corner, a line and a speck', () => {
    expect(isUsableQuad([KEYSTONE[1], KEYSTONE[0], KEYSTONE[2], KEYSTONE[3]])).toBe(false);
    expect(
      isUsableQuad([
        [0, 0],
        [100, 0],
        [20, 20],
        [0, 100],
      ]),
    ).toBe(false);
    expect(
      isUsableQuad([
        [0, 0],
        [50, 0],
        [100, 0],
        [150, 0],
      ]),
    ).toBe(false);
    expect(
      isUsableQuad(
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
        ],
        1000,
      ),
    ).toBe(false);
  });
});
