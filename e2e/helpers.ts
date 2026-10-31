import { type Page } from '@playwright/test';

/**
 * The outline of a fish, as corners in a box that runs -1 to 1 across and -1 to 1 down. The same
 * corners every time, so the traced outline (and the STL made from it) is the same every run.
 */
const FISH: readonly (readonly [number, number])[] = [
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
];

/** Draws a closed fish on the drawing pad with the mouse: the quick way to get a puzzle. */
export async function drawAnimal(page: Page): Promise<void> {
  // On a phone the pad sits below the steps panel: bring it on screen before the mouse is used.
  await page.locator('.pad-canvas').scrollIntoViewIfNeeded();
  const box = (await page.locator('.pad-canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const at = ([x, y]: readonly [number, number]): [number, number] => [
    cx + x * box.width * 0.5,
    cy + y * box.height * 0.5,
  ];
  // Walk round the corners, then a little past the start so the line really closes.
  const route = [...FISH, FISH[0]!, FISH[1]!];
  const points: [number, number][] = [];
  for (let i = 0; i < route.length - 1; i++) {
    const [a, b] = [at(route[i]!), at(route[i + 1]!)];
    for (let s = 0; s < 6; s++) {
      points.push([a[0] + ((b[0] - a[0]) * s) / 6, a[1] + ((b[1] - a[1]) * s) / 6]);
    }
  }
  await page.mouse.move(...points[0]!);
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(...p, { steps: 2 });
  await page.mouse.up();
}
