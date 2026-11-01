/**
 * TEMPORARY: ready-made drawings to load onto the pad while the engraving is being tried out.
 * Remove this file, the "Try an example" block in shell.ts, `SketchPad.load` and the .samples
 * styles once engraving works (see tasks/todo.md).
 *
 * Every drawing is in pad pixels (800 square) and is made of strokes the way a hand would make
 * them: one closed line round the animal, then single taps for dots and short lines for the rest.
 */
import type { Vec2 } from '../core/geometry/polygon';

export interface Sample {
  name: string;
  /** What it checks, shown as the button's hint. */
  tests: string;
  strokes: Vec2[][];
}

const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 60): Vec2[] =>
  Array.from({ length: n + 3 }, (_, i): Vec2 => {
    const t = (i / n) * Math.PI * 2;
    return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
  });

const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): Vec2[] =>
  Array.from({ length: 21 }, (_, i): Vec2 => {
    const t = a0 + ((a1 - a0) * i) / 20;
    return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
  });

/** The bunny from the bug report: ears, a round tail, two eye dots, a check-mark nose, an ear tick. */
const bunny: Sample = {
  name: 'Bunny',
  tests: 'Two eye dots, a nose and an ear tick',
  strokes: [
    (
      [
        [60, 125],
        [45, 150],
        [60, 215],
        [100, 260],
        [170, 320],
        [240, 345],
        [330, 365],
        [380, 382],
        [430, 383],
        [460, 350],
        [470, 300],
        [466, 220],
        [450, 170],
        [410, 110],
        [375, 100],
        [270, 100],
        [215, 125],
        [205, 135],
        [185, 60],
        [178, 30],
        [150, 90],
        [145, 135],
        [130, 90],
        [110, 45],
        [85, 95],
        [60, 125],
        [45, 150],
      ] as Vec2[]
    ).map(([x, y]): Vec2 => [x * 1.3 + 20, y * 1.3 + 60]),
    // The tail overlaps the body's line, as in the drawing it came from: a tail that only nearly
    // touches is a separate blob to the outline finder.
    ellipse(508 * 1.3 + 20, 255 * 1.3 + 60, 43 * 1.3, 38 * 1.3),
    [[138 * 1.3 + 20, 176 * 1.3 + 60]],
    [[193 * 1.3 + 20, 168 * 1.3 + 60]],
    [
      [162 * 1.3 + 20, 213 * 1.3 + 60],
      [170 * 1.3 + 20, 226 * 1.3 + 60],
      [181 * 1.3 + 20, 208 * 1.3 + 60],
    ],
    [
      [78 * 1.3 + 20, 122 * 1.3 + 60],
      [97 * 1.3 + 20, 114 * 1.3 + 60],
    ],
  ],
};

/** An egg with eyes, a smile and stripes, one of which runs right up to the outline. */
const face: Sample = {
  name: 'Smiley egg',
  tests: 'Dots, a curved smile, a stripe running into the outline',
  strokes: [
    ellipse(400, 400, 340, 240),
    [[280, 330]],
    [[520, 330]],
    arc(400, 440, 120, 70, 0.3, Math.PI - 0.3),
    [
      [400, 160],
      [400, 260],
    ],
    [
      [150, 400],
      [230, 400],
    ],
  ],
};

/** A fish: stripes, one eye dot and a gill line. */
const fish: Sample = {
  name: 'Fish',
  tests: 'One eye dot, stripes and a gill line',
  strokes: [
    (
      [
        [0.6, 0],
        [0.4, -0.3],
        [0.1, -0.42],
        [-0.2, -0.38],
        [-0.45, -0.12],
        [-0.78, -0.45],
        [-0.66, 0],
        [-0.78, 0.45],
        [-0.45, 0.12],
        [-0.2, 0.38],
        [0.1, 0.42],
        [0.4, 0.3],
        [0.6, 0],
        [0.4, -0.3],
      ] as Vec2[]
    ).map(([x, y]): Vec2 => [400 + x * 340, 400 + y * 340]),
    [[400 + 0.38 * 340, 400 - 0.08 * 340]],
    arc(400 + 0.22 * 340, 400, 0.12 * 340, 0.2 * 340, -Math.PI / 2 + 0.4, Math.PI / 2 - 0.4),
    [
      [400 - 0.05 * 340, 400 - 0.22 * 340],
      [400 - 0.05 * 340, 400 + 0.22 * 340],
    ],
    [
      [400 - 0.25 * 340, 400 - 0.12 * 340],
      [400 - 0.25 * 340, 400 + 0.12 * 340],
    ],
  ],
};

/** A round beetle with spots of different sizes and a line down its back. */
const beetle: Sample = {
  name: 'Spotty beetle',
  tests: 'Dots only, and a long line down the middle',
  strokes: [
    ellipse(400, 400, 260, 300),
    [
      [400, 150],
      [400, 650],
    ],
    [[300, 300]],
    [[500, 300]],
    [[290, 450]],
    [[510, 450]],
    [[320, 560]],
    [[480, 560]],
  ],
};

/** Just an outline: nothing inside, so nothing is engraved. */
const plain: Sample = {
  name: 'Plain blob',
  tests: 'Outline only: no engraving at all',
  strokes: [ellipse(400, 400, 320, 220)],
};

export const SAMPLES: readonly Sample[] = [bunny, face, fish, beetle, plain];
