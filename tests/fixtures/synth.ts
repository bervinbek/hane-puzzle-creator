import { pointInPolygon, type Vec2 } from '../../src/core/geometry/polygon';
import type { RgbaImage } from '../../src/core/image/gray';
import type { TidyParams } from '../../src/core/outline';
import { mulberry32 } from '../../src/core/rng';
import { FISH_OUTLINE, FISH_SIZE } from '../../src/core/samples/fish';

type Rgb = readonly [number, number, number];

export interface Gap {
  at: Vec2;
  radius: number;
}

export interface DrawingSpec {
  w?: number;
  h?: number;
  /** The animal's outline in pixels; also the ground truth. */
  shape: Vec2[];
  /** Extra closed strokes drawn inside (eyes, spots). */
  details?: Vec2[][];
  strokeWidth?: number;
  ink?: Rgb;
  paper?: Rgb;
  gaps?: Gap[];
  /** Darkens the paper toward the right by this fraction (0-1). */
  shadow?: number;
  glare?: { at: Vec2; radius: number; amount: number };
  noise?: number;
  specks?: number;
  seed?: number;
}

export interface Drawing {
  name: string;
  image: RgbaImage;
  truth: Vec2[];
  params?: Partial<TidyParams>;
}

/** The sample fish scaled to the given width and centred at (cx, cy). */
export function fishAt(cx: number, cy: number, width: number): Vec2[] {
  const s = width / FISH_SIZE.width;
  return FISH_OUTLINE.map(([x, y]) => [
    cx + (x - FISH_SIZE.width / 2) * s,
    cy + (y - FISH_SIZE.height / 2) * s,
  ]);
}

/** A star-like creature with thin legs: a round body with narrow lobes sticking out. */
export function spiderAt(cx: number, cy: number, bodyRadius: number, legs = 6): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    let r = bodyRadius;
    for (let k = 0; k < legs; k++) {
      const centre = ((k + 0.5) / legs) * Math.PI * 2;
      const d = Math.atan2(Math.sin(a - centre), Math.cos(a - centre));
      r += bodyRadius * 1.1 * Math.exp(-((d / 0.1) ** 2));
    }
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

export function circleAt(cx: number, cy: number, r: number): Vec2[] {
  return Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as Vec2;
  });
}

/** Renders a hand-drawn-looking line drawing as RGBA, with optional lighting and noise problems. */
export function renderDrawing(spec: DrawingSpec): RgbaImage {
  const w = spec.w ?? 450;
  const h = spec.h ?? 338;
  const rng = mulberry32(spec.seed ?? 1);
  const ink = spec.ink ?? [25, 25, 40];
  const paper = spec.paper ?? [245, 243, 238];
  const radius = (spec.strokeWidth ?? 5) / 2;
  const cover = new Float32Array(w * h);

  const wobble = [rng() * 6, rng() * 6, rng() * 6];
  const stamp = (x: number, y: number, r: number): void => {
    const x0 = Math.max(0, Math.floor(x - r - 1));
    const x1 = Math.min(w - 1, Math.ceil(x + r + 1));
    const y0 = Math.max(0, Math.floor(y - r - 1));
    const y1 = Math.min(h - 1, Math.ceil(y + r + 1));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const d = Math.hypot(px + 0.5 - x, py + 0.5 - y);
        const c = Math.max(0, Math.min(1, r + 0.5 - d));
        if (c > cover[py * w + px]!) cover[py * w + px] = c;
      }
    }
  };

  const drawLoop = (poly: Vec2[]): void => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.ceil(len / 0.6));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const x = a[0] + (b[0] - a[0]) * t;
        const y = a[1] + (b[1] - a[1]) * t;
        if (spec.gaps?.some((g) => Math.hypot(x - g.at[0], y - g.at[1]) < g.radius)) continue;
        const jx = Math.sin(x / 23 + wobble[0]!) * 0.9 + Math.sin(y / 11 + wobble[1]!) * 0.5;
        const jy = Math.sin(y / 19 + wobble[2]!) * 0.9;
        stamp(x + jx, y + jy, radius);
      }
    }
  };

  drawLoop(spec.shape);
  for (const d of spec.details ?? []) drawLoop(d);
  for (let i = 0; i < (spec.specks ?? 0); i++) stamp(rng() * w, rng() * h, 0.8 + rng() * 1.6);

  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let light = 1 - (spec.shadow ?? 0) * (x / w);
      if (spec.glare) {
        const d = Math.hypot(x - spec.glare.at[0], y - spec.glare.at[1]);
        light += spec.glare.amount * Math.exp(-(d * d) / (2 * spec.glare.radius ** 2));
      }
      const noise = ((rng() + rng() + rng()) / 3 - 0.5) * 2 * (spec.noise ?? 3);
      for (let c = 0; c < 3; c++) {
        const v = (paper[c]! + (ink[c]! - paper[c]!) * cover[i]!) * light + noise;
        data[i * 4 + c] = Math.max(0, Math.min(255, v));
      }
      data[i * 4 + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

function distToPolygon(x: number, y: number, poly: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2));
    best = Math.min(best, Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)));
  }
  return best;
}

/**
 * Intersection over union of two polygons, estimated on a grid. `growA` widens polygon a by that
 * many pixels: the extracted outline sits on the outer edge of the pen line, not its centre.
 */
export function polygonIou(
  a: readonly Vec2[],
  b: readonly Vec2[],
  w: number,
  h: number,
  growA = 0,
): number {
  let inter = 0;
  let union = 0;
  for (let y = 0.5; y < h; y += 2) {
    for (let x = 0.5; x < w; x += 2) {
      const ia = pointInPolygon(x, y, a) || (growA > 0 && distToPolygon(x, y, a) <= growA);
      const ib = pointInPolygon(x, y, b);
      if (ia && ib) inter++;
      if (ia || ib) union++;
    }
  }
  return union === 0 ? 0 : inter / union;
}

/** The fixture set: the kinds of drawings and photos real classrooms will produce. */
export function fixtures(): Drawing[] {
  const fish = fishAt(225, 169, 340);
  const eye: Vec2[] = circleAt(165, 150, 9);
  const spots: Vec2[][] = [circleAt(240, 150, 14), circleAt(290, 190, 10)];

  return [
    { name: 'clean fish', image: renderDrawing({ shape: fish }), truth: fish },
    { name: 'thin pencil line', image: renderDrawing({ shape: fish, strokeWidth: 2 }), truth: fish },
    {
      name: 'small gap in the line',
      image: renderDrawing({ shape: fish, gaps: [{ at: fish[8]!, radius: 5 }] }),
      truth: fish,
    },
    {
      name: 'big gap in the line',
      image: renderDrawing({ shape: fish, gaps: [{ at: fish[27]!, radius: 11 }] }),
      truth: fish,
    },
    {
      name: 'glare spot',
      image: renderDrawing({ shape: fish, glare: { at: [260, 120], radius: 60, amount: 0.35 } }),
      truth: fish,
    },
    { name: 'shadow across the page', image: renderDrawing({ shape: fish, shadow: 0.45 }), truth: fish },
    {
      name: 'noise and stray marks',
      image: renderDrawing({ shape: fish, noise: 14, specks: 80 }),
      truth: fish,
    },
    {
      name: 'eye and spots inside',
      image: renderDrawing({ shape: fish, details: [eye, ...spots] }),
      truth: fish,
    },
    {
      name: 'thin legs',
      image: renderDrawing({ shape: spiderAt(225, 169, 55) }),
      truth: spiderAt(225, 169, 55),
    },
    {
      name: 'small drawing in a big frame',
      image: renderDrawing({ shape: fishAt(225, 169, 140) }),
      truth: fishAt(225, 169, 140),
    },
    {
      name: 'blue pen on grey paper',
      image: renderDrawing({ shape: fish, ink: [30, 70, 200], paper: [205, 205, 198] }),
      truth: fish,
    },
    {
      name: 'faint pencil',
      image: renderDrawing({ shape: fish, ink: [150, 150, 150], strokeWidth: 3 }),
      truth: fish,
      params: { lineStrength: 70 },
    },
  ];
}
