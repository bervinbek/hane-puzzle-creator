import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { expect, test, type Page } from '@playwright/test';

const pickSample = (page: Page) =>
  page.getByRole('button', { name: /Use the sample fish/ }).click();
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

test('later steps stay closed until a drawing is picked, then the flow works', async ({ page }) => {
  await page.goto('/');
  await expect(heading(page)).toHaveText('Pick your animal');
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  await expect(page.getByText('Pick a drawing to continue')).toBeVisible();

  // Blocked: the page explains instead of failing silently (aria-disabled, so force the click).
  await page.getByRole('button', { name: /Next: make the puzzle/ }).click({ force: true });
  await expect(heading(page)).toHaveText('Pick your animal');
  await expect(page.getByRole('status')).toContainText('Pick a drawing first');

  await pickSample(page);
  await expect(page.getByRole('status')).toContainText('Nice choice');
  await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
  await expect(heading(page)).toHaveText('Cut it into pieces');

  await page.getByRole('button', { name: /Next: print it/ }).click();
  await expect(heading(page)).toHaveText('Ready to print');

  // The print step shows honest numbers and saves a real STL.
  await expect(page.locator('.stats')).toContainText('Print time');
  const [stl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Download puzzle file/ }).click(),
  ]);
  expect(stl.suggestedFilename()).toBe('hane-puzzle-yellow-6-pieces.stl');
  const bytes = readFileSync(await stl.path());
  const triangles = bytes.readUInt32LE(80);
  expect(bytes.length).toBe(84 + triangles * 50);
  expect(triangles).toBeGreaterThan(100);
  await expect(page.getByRole('status')).toContainText('Saved hane-puzzle-yellow-6-pieces.stl');

  const [zip] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Download each piece/ }).click(),
  ]);
  expect(zip.suggestedFilename()).toBe('hane-puzzle-yellow-6-pieces.zip');
  expect(
    readFileSync(await zip.path())
      .subarray(0, 2)
      .toString(),
  ).toBe('PK');
});

test('piece count, difficulty, shuffle and team colour update the preview', async ({ page }) => {
  await page.goto('/');
  await pickSample(page);
  await page.getByRole('button', { name: /Next: make the puzzle/ }).click();

  const count = page.locator('#count-num');
  const cells = page.locator('svg.shape g path');
  await expect(count).toHaveText('6');
  await expect(cells).toHaveCount(6);

  await page.getByRole('button', { name: 'More pieces' }).click();
  await expect(count).toHaveText('7');
  await expect(cells).toHaveCount(7);

  await page.getByRole('radio', { name: 'Tricky' }).check();
  await expect(count).toHaveText('24');
  await expect(cells).toHaveCount(24);
  await expect(page.getByRole('radio', { name: 'Tricky' })).toBeChecked();

  await page.locator('#pieces').fill('50');
  await expect(count).toHaveText('50');
  await expect(page.locator('#notice')).toContainText('lot of small pieces');

  const before = await cells.first().getAttribute('d');
  await page.getByRole('button', { name: /Shuffle the cuts/ }).click();
  await expect.poll(async () => cells.first().getAttribute('d')).not.toBe(before);

  await page.getByRole('radio', { name: 'Blue' }).check({ force: true });
  await expect(page.getByText('Team colour: Blue')).toBeVisible();
});

test('comfort settings apply and persist', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Comfort' }).click();
  await page.getByLabel(/Calm mode/).check();
  await page.getByLabel('Large').check({ force: true });
  await page.getByRole('button', { name: 'Done' }).click();

  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-calm', 'true');
  await expect(html).toHaveAttribute('data-text-size', 'large');

  await page.reload();
  await expect(html).toHaveAttribute('data-calm', 'true');
});

/** Draws a fish-like outline with a marker-style line and hands it to the page as a file. */
async function uploadDrawing(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, 900, 600);
    ctx.strokeStyle = '#1b2a6b';
    ctx.lineWidth = 9;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(150, 300);
    ctx.bezierCurveTo(250, 130, 560, 120, 680, 290);
    ctx.lineTo(790, 200);
    ctx.lineTo(770, 300);
    ctx.lineTo(790, 400);
    ctx.lineTo(680, 320);
    ctx.bezierCurveTo(560, 480, 250, 470, 150, 300);
    ctx.closePath();
    ctx.stroke();
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'fish.png', { type: 'image/png' }));
    const input = document.querySelector<HTMLInputElement>('#file')!;
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

test('a photo is traced into an outline that becomes the puzzle', async ({ page }) => {
  await page.goto('/');
  await uploadDrawing(page);

  await expect(page.locator('#notice')).toContainText('Found your animal', { timeout: 15_000 });
  await expect(page.locator('svg.photo polygon')).toHaveCount(1);
  await expect(page.locator('#bed-label')).toContainText('Your puzzle:');
  await expect(page.getByRole('group', { name: 'Gaps in the line' })).toBeVisible();

  // The tidy-up controls re-trace without leaving the page.
  await page.locator('#smooth').fill('80');
  await expect(page.locator('#notice')).toContainText('Found your animal');

  await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
  await expect(heading(page)).toHaveText('Cut it into pieces');
  await expect(page.locator('svg.shape g path')).toHaveCount(6);
  await page.getByRole('button', { name: 'More pieces' }).click();
  await expect(page.locator('svg.shape g path')).toHaveCount(7);
});

test('a blank picture gets a helpful message, not a puzzle', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, 400, 300);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'blank.png', { type: 'image/png' }));
    const input = document.querySelector<HTMLInputElement>('#file')!;
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#notice')).toContainText("can't see a drawing", { timeout: 15_000 });
  await expect(page.getByText('Pick a drawing to continue')).toBeVisible();
});

const LAPTOPS = [
  { name: 'small laptop 1280x600', width: 1280, height: 600 },
  { name: 'common laptop 1366x657', width: 1366, height: 657 },
  { name: 'large laptop 1536x730', width: 1536, height: 730 },
  { name: 'tablet landscape 1024x690', width: 1024, height: 690 },
];

for (const size of LAPTOPS) {
  test(`laptop window (${size.name}): every step fits without scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    const fits = () =>
      page.evaluate(() => ({
        page: document.documentElement.scrollHeight <= window.innerHeight + 1,
        panel: (() => {
          const p = document.querySelector('#panel')!;
          return p.scrollHeight <= p.clientHeight + 1;
        })(),
      }));

    expect(await fits(), 'step 1 before a picture').toEqual({ page: true, panel: true });
    await page.getByRole('button', { name: /Draw on screen/ }).click();
    await expect(page.locator('.pad-canvas')).toBeVisible();
    expect(await fits(), 'step 1 with the drawing pad').toEqual({ page: true, panel: true });
    await page.getByRole('button', { name: /Add a photo/ }).focus();
    await uploadDrawing(page);
    await expect(page.locator('#notice')).toContainText('Found your animal', { timeout: 15_000 });
    expect(await fits(), 'step 1 with a photo').toEqual({ page: true, panel: true });

    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    expect(await fits(), 'step 2').toEqual({ page: true, panel: true });
    await page.locator('#pieces').fill('50');
    expect(await fits(), 'step 2 with a warning').toEqual({ page: true, panel: true });
    await page.getByRole('radio', { name: '3D' }).check();
    await page.waitForSelector('.viewer-canvas[data-ready="true"]');
    expect(await fits(), 'step 2 in 3D').toEqual({ page: true, panel: true });
    await page.getByRole('button', { name: /Next: print it/ }).click();
    expect(await fits(), 'step 3').toEqual({ page: true, panel: true });
    expect(await fits(), 'step 3 in 3D').toEqual({ page: true, panel: true });
    await expect(page.locator('#sim-controls')).toBeVisible();
    const inside = await page.evaluate(() => {
      const card = document.querySelector('#canvas-card')!.getBoundingClientRect();
      const bed = document.querySelector('.bed')!.getBoundingClientRect();
      const bar = document.querySelector('#preview-actions')!.getBoundingClientRect();
      return {
        barInCard:
          bar.bottom <= card.bottom + 1 && bar.left >= card.left - 1 && bar.right <= card.right + 1,
        barBelowPicture: bar.top >= bed.bottom - 1,
      };
    });
    expect(inside, 'print controls sit under the picture, inside the card').toEqual({
      barInCard: true,
      barBelowPicture: true,
    });
  });
}

test.describe('phone: usable without sideways scrolling', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('layout stacks and stays inside the screen width', async ({ page }) => {
    await page.goto('/');
    await pickSample(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await page.getByRole('button', { name: 'More pieces' }).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });

  test('the print controls stay inside the screen width in 3D', async ({ page }) => {
    await page.goto('/');
    await pickSample(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.getByRole('button', { name: /Next: print it/ }).click();
    await page.getByRole('button', { name: 'Watch it print' }).click();
    await expect(page.locator('.viewer-canvas')).toHaveAttribute('data-sim', 'playing', {
      timeout: 20_000,
    });
    const edges = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      right: Math.max(
        ...[...document.querySelectorAll('#sim-controls > *, #view-controls > *')].map(
          (el) => el.getBoundingClientRect().right,
        ),
      ),
      width: window.innerWidth,
    }));
    expect(edges.overflow).toBeLessThanOrEqual(0);
    expect(edges.right).toBeLessThanOrEqual(edges.width);
    const play = await page.getByRole('button', { name: 'Pause' }).boundingBox();
    expect(play!.height).toBeGreaterThanOrEqual(40);
  });
});

test.describe('3D view', () => {
  test('turns on, pulls apart, changes angle and stays idle when nothing moves', async ({
    page,
  }) => {
    await page.goto('/');
    await pickSample(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(page.locator('.viewer-canvas')).toHaveCount(0); // not even downloaded yet

    await page.getByRole('radio', { name: '3D' }).check();
    const canvas = page.locator('.viewer-canvas');
    await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
    await expect(canvas).toHaveAttribute('data-pieces', '6');
    await expect(canvas).toHaveAttribute('data-view', 'angled');
    await expect(page.locator('.bed-art')).toBeHidden();

    await page.locator('#explode').fill('100');
    await expect(canvas).toHaveAttribute('data-explode', '1.00');
    await page.getByRole('button', { name: /Top view/ }).click();
    await expect(canvas).toHaveAttribute('data-view', 'top');

    await page.getByRole('button', { name: 'See the whole printer' }).click();
    await expect(canvas).toHaveAttribute('data-view', 'printer');
    await page.getByRole('button', { name: 'Angle view' }).click();
    await expect(canvas).toHaveAttribute('data-view', 'angled');
    await page.getByRole('button', { name: /Top view/ }).click();
    await expect(canvas).toHaveAttribute('data-view', 'top');

    // More pieces rebuild the scene; the team colour recolours it without a rebuild.
    await page.getByRole('button', { name: 'More pieces' }).click();
    await expect(canvas).toHaveAttribute('data-pieces', '7');

    // Nothing is animating, so no frames are drawn.
    const before = Number(await canvas.getAttribute('data-frames'));
    await page.waitForTimeout(700);
    expect(Number(await canvas.getAttribute('data-frames'))).toBe(before);

    // Keyboard users can turn it: the view redraws.
    await canvas.focus();
    await page.keyboard.press('ArrowLeft');
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-frames')))
      .toBeGreaterThan(before);

    // Back to flat.
    await page.getByRole('radio', { name: 'Flat' }).check();
    await expect(page.locator('.bed-art svg.shape')).toBeVisible();
    await expect(page.locator('.viewer')).toBeHidden();
  });

  test('stays in 3D on the print step with the team colour', async ({ page }) => {
    await page.goto('/');
    await pickSample(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.getByRole('radio', { name: '3D' }).check();
    await page.getByRole('button', { name: /Next: print it/ }).click();
    await expect(page.locator('.viewer-canvas')).toHaveAttribute('data-ready', 'true', {
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: 'Shuffle the cuts' })).toBeHidden();
    await expect(page.getByLabel('Pull apart')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Watch it print' })).toBeVisible();
    await expect(page.getByText('Illustrative preview')).toBeVisible();
    await expect(page.locator('#sim-layer')).toHaveAttribute('max', '15');
    await expect(page.locator('#sim-layer-text')).toHaveText('Layer 15 of 15');
    await expect(page.locator('.viewer-canvas')).toHaveAttribute('data-sim', 'idle');
  });

  test('watch it print: plays, pauses, scrubs by layer, finishes and replays', async ({ page }) => {
    await page.goto('/');
    await pickSample(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.getByRole('button', { name: /Next: print it/ }).click();

    // From the flat picture one button switches to 3D and starts the print.
    await page.getByRole('button', { name: 'Watch it print' }).click();
    const canvas = page.locator('.viewer-canvas');
    await expect(canvas).toHaveAttribute('data-sim', 'playing', { timeout: 20_000 });
    await expect(canvas).toHaveAttribute('data-layers', '15');
    await expect(page.getByRole('radio', { name: '3D' })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    // The print moves on by itself, layer by layer.
    await page.getByRole('radio', { name: 'Fast' }).check();
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-layer')), { timeout: 20_000 })
      .toBeGreaterThan(1);

    // Pausing stops the picture: nothing is drawn while nothing moves.
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(canvas).toHaveAttribute('data-sim', 'paused');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    const frames = Number(await canvas.getAttribute('data-frames'));
    await page.waitForTimeout(600);
    expect(Number(await canvas.getAttribute('data-frames'))).toBe(frames);

    // The layer slider jumps to any layer and says which one.
    await page.locator('#sim-layer').fill('5');
    await expect(page.locator('#sim-layer-text')).toHaveText('Layer 5 of 15');
    await expect(canvas).toHaveAttribute('data-layer', '5');
    await expect(canvas).toHaveAttribute('data-sim', 'paused');

    // Jump to the last layer and let it finish; then it can be watched again.
    await page.locator('#sim-layer').fill('15');
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(canvas).toHaveAttribute('data-sim', 'done', { timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible();
    await page.getByRole('button', { name: 'Replay' }).click();
    await expect(canvas).toHaveAttribute('data-sim', 'playing');
    await expect(page.locator('#sim-layer-text')).toHaveText('Layer 1 of 15');

    // Going back a step puts the finished puzzle on the plate again.
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(canvas).toHaveAttribute('data-sim', 'idle');
    await expect(page.getByLabel('Pull apart')).toBeVisible();
  });

  test('with reduced motion nothing starts until you press play', async ({ page }) => {
    await page.goto('/');
    await pickSample(page);
    await page.getByRole('button', { name: 'Comfort' }).click();
    await page.getByLabel(/Reduce motion/).check();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.getByRole('radio', { name: '3D' }).check();
    await page.getByRole('button', { name: /Next: print it/ }).click();
    const canvas = page.locator('.viewer-canvas');
    await expect(canvas).toHaveAttribute('data-sim', 'idle', { timeout: 20_000 });
    await page.waitForTimeout(500);
    await expect(canvas).toHaveAttribute('data-sim', 'idle');
  });

  test('falls back to the flat view when the browser has no WebGL', async ({ page }) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
    });
    await page.goto('/');
    await pickSample(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.getByRole('radio', { name: '3D' }).check();
    await expect(page.locator('#notice')).toContainText("3D view isn't available");
    await expect(page.getByRole('radio', { name: 'Flat' })).toBeChecked();
    await expect(page.locator('.bed-art svg.shape')).toBeVisible();
  });

  test('calm mode switches to the plainer picture and keeps drawing', async ({ page }) => {
    await page.goto('/');
    await pickSample(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.getByRole('radio', { name: '3D' }).check();
    const canvas = page.locator('.viewer-canvas');
    await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
    const before = Number(await canvas.getAttribute('data-frames'));

    await page.getByRole('button', { name: 'Comfort' }).click();
    await page.getByLabel(/Calm mode/).check();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-frames')))
      .toBeGreaterThan(before);
  });
});

/** Draws a closed loop (a wobbly egg) on the drawing pad with the mouse. */
async function drawEgg(page: Page): Promise<void> {
  const box = (await page.locator('.pad-canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const point = (i: number, n: number) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * box.width * 0.33, cy + Math.sin(a) * box.height * 0.24] as const;
  };
  const n = 48;
  await page.mouse.move(...point(0, n));
  await page.mouse.down();
  for (let i = 1; i <= n + 2; i++) await page.mouse.move(...point(i % (n + 1), n), { steps: 2 });
  await page.mouse.up();
}

test.describe('draw on screen', () => {
  test('a drawing becomes a puzzle, with undo, clear and friendly messages', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Draw on screen/ }).click();
    await expect(page.locator('.pad-canvas')).toBeVisible();
    await expect(page.getByText('Draw your animal here')).toBeVisible();
    await expect(page.getByText('Press Use my drawing to continue')).toBeVisible();

    // Nothing drawn yet: a gentle message, not an error.
    await page.getByRole('button', { name: 'Use my drawing' }).click();
    await expect(page.locator('#notice')).toContainText('Draw your animal first');

    // Draw, undo (the hint comes back), draw again, clear, and draw once more.
    await drawEgg(page);
    await expect(page.getByText('Draw your animal here')).toBeHidden();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('Draw your animal here')).toBeVisible();
    await drawEgg(page);
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByText('Draw your animal here')).toBeVisible();
    await page.getByRole('radio', { name: 'Thick' }).check();
    await drawEgg(page);

    await page.getByRole('button', { name: 'Use my drawing' }).click();
    await expect(page.locator('#notice')).toContainText('Found your animal', { timeout: 15_000 });
    await expect(page.locator('.pad-canvas')).toBeHidden();
    await expect(page.locator('.bed-art svg.photo')).toBeVisible();
    await expect(page.getByRole('button', { name: /Draw on screen/ })).toContainText(
      'Tap to keep drawing',
    );

    // The picture is traced like a photo: the tidy-up controls are there, and the puzzle works.
    await expect(page.getByLabel('Smooth the wobbles')).toBeVisible();
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(heading(page)).toHaveText('Cut it into pieces');
    await expect(page.locator('.bed-art svg.shape')).toBeVisible();
  });

  test('keeps the strokes when you come back to draw more', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Draw on screen/ }).click();
    await drawEgg(page);
    await page.getByRole('button', { name: 'Use my drawing' }).click();
    await expect(page.locator('#notice')).toContainText('Found your animal', { timeout: 15_000 });
    await page.getByRole('button', { name: /Draw on screen/ }).click();
    await expect(page.locator('.pad-canvas')).toBeVisible();
    // The drawing is still on the pad, so the hint stays away.
    await expect(page.getByText('Draw your animal here')).toBeHidden();
    // Until it is used, the next step stays closed.
    await expect(page.getByText('Press Use my drawing to continue')).toBeVisible();
  });

  test('a line with a gap says so in words that fit a drawing', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Draw on screen/ }).click();
    const box = (await page.locator('.pad-canvas').boundingBox())!;
    // A small dot is too tiny to be an animal.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 6, box.y + box.height / 2 + 6);
    await page.mouse.up();
    await page.getByRole('button', { name: 'Use my drawing' }).click();
    await expect(page.locator('#notice')).toContainText('Tap Draw on screen', { timeout: 15_000 });
  });
});

test.describe('projects', () => {
  test('save, change, open: the saved puzzle comes back', async ({ page }) => {
    await page.goto('/');
    await pickSample(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.getByRole('radio', { name: 'Medium' }).check();
    await page.getByRole('radio', { name: 'Blue' }).check();
    await page.getByRole('button', { name: 'Shuffle the cuts' }).click();
    await expect(page.locator('#count-num')).toHaveText('12');

    await page.getByRole('button', { name: 'Project' }).click();
    const [saved] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Save my project/ }).click(),
    ]);
    expect(saved.suggestedFilename()).toBe('hane-project-blue-12-pieces.json');
    const text = readFileSync(await saved.path(), 'utf8');
    const file = JSON.parse(text) as Record<string, unknown>;
    expect(file).toMatchObject({ app: 'hane-puzzle-generator', pieces: 12, seed: 2, team: 'blue' });
    // Only the outline is saved: no picture of any kind.
    expect(text).not.toMatch(/data:image|blob:|<svg/);
    await expect(page.locator('#project-notice')).toContainText(
      'Saved hane-project-blue-12-pieces.json',
    );
    await page.getByRole('button', { name: 'Done' }).click();

    // Change everything, then open the file: the saved choices are back.
    await page.getByRole('radio', { name: 'Easy' }).check();
    await page.getByRole('radio', { name: 'Red' }).check();
    await expect(page.locator('#count-num')).toHaveText('6');
    await page.getByRole('button', { name: 'Project' }).click();
    await page.locator('#project-file').setInputFiles({
      name: 'mine.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
    await expect(page.locator('#project-dialog')).toBeHidden();
    await expect(heading(page)).toHaveText('Cut it into pieces');
    await expect(page.locator('#count-num')).toHaveText('12');
    await expect(page.getByRole('radio', { name: 'Blue' })).toBeChecked();
    await expect(page.locator('#notice')).toContainText(
      'Opened your project: Blue team, 12 pieces',
    );
  });

  test('a project opens from the very first step, with no drawing picked yet', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Project' }).click();
    await expect(page.getByRole('button', { name: /Save my project/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(page.locator('#project-notice')).toContainText('Pick a drawing first');
    const outline = [
      [-60, -30],
      [60, -30],
      [60, 30],
      [-60, 30],
    ];
    await page.locator('#project-file').setInputFiles({
      name: 'box.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          app: 'hane-puzzle-generator',
          version: 1,
          team: 'tan',
          pieces: 4,
          seed: 5,
          outline,
        }),
      ),
    });
    await expect(heading(page)).toHaveText('Cut it into pieces');
    await expect(page.locator('#count-num')).toHaveText('4');
    await expect(page.locator('.bed-art svg.shape')).toBeVisible();
    // The way back still shows the opened shape, and the next step stays open.
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('#notice')).toContainText('Opened your project');
    await expect(page.getByText('Pick a drawing to continue')).toBeHidden();
  });

  test('files that are not projects are refused politely', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Project' }).click();
    const open = (name: string, body: string) =>
      page.locator('#project-file').setInputFiles({
        name,
        mimeType: 'application/json',
        buffer: Buffer.from(body),
      });
    await open('notes.json', 'this is not json');
    await expect(page.locator('#project-notice')).toContainText('not a Hane puzzle project');
    await open('other.json', JSON.stringify({ app: 'something-else' }));
    await expect(page.locator('#project-notice')).toContainText('not a Hane puzzle project');
    await open(
      'new.json',
      JSON.stringify({ app: 'hane-puzzle-generator', version: 9, outline: [] }),
    );
    await expect(page.locator('#project-notice')).toContainText('newer version');
    await open(
      'huge.json',
      JSON.stringify({
        app: 'hane-puzzle-generator',
        version: 1,
        team: 'red',
        pieces: 6,
        seed: 1,
        outline: [
          [0, 0],
          [900, 0],
          [900, 900],
        ],
      }),
    );
    await expect(page.locator('#project-notice')).toContainText('bigger than the printer plate');
    // Still on step 1: nothing was opened.
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(heading(page)).toHaveText('Pick your animal');
  });
});

test.describe('teacher options', () => {
  const openTeacher = (page: Page) => page.getByRole('button', { name: /Teacher/ }).click();

  test('start standard, say when they are not, remember them and reset', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#teacher-on')).toBeHidden();
    await openTeacher(page);
    await expect(page.getByRole('heading', { name: 'Teacher options' })).toBeVisible();
    await expect(page.locator('#t-gap-out')).toHaveText('0.30 mm');
    await expect(page.locator('#t-size-out')).toHaveText('17.0 cm');
    await expect(page.getByRole('radio', { name: 'Standard' })).toBeChecked();

    await page.locator('#t-gap').fill('0.5');
    await expect(page.locator('#t-gap-out')).toHaveText('0.50 mm');
    await page.getByRole('radio', { name: 'More' }).check();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('#teacher-on')).toBeVisible();

    // They stay after a reload.
    await page.reload();
    await expect(page.locator('#teacher-on')).toBeVisible();
    await openTeacher(page);
    await expect(page.locator('#t-gap-out')).toHaveText('0.50 mm');
    await expect(page.getByRole('radio', { name: 'More' })).toBeChecked();

    await page.getByRole('button', { name: 'Standard settings' }).click();
    await expect(page.locator('#t-gap-out')).toHaveText('0.30 mm');
    await expect(page.getByRole('radio', { name: 'Standard' })).toBeChecked();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('#teacher-on')).toBeHidden();
  });

  test('the size cap, the cut number and the file name reach the puzzle and the files', async ({
    page,
  }) => {
    await page.goto('/');
    await pickSample(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(page.locator('.bed-label')).toHaveText('Your puzzle: 17.0 × 8.3 cm');

    await openTeacher(page);
    await page.locator('#t-size').fill('8');
    await expect(page.locator('#t-size-out')).toHaveText('8.0 cm');
    await page.locator('#t-seed').fill('42');
    await page.locator('#t-name').fill('Class 5B');
    await expect(page.locator('#t-name-note')).toContainText('class-5b-yellow-6-pieces.stl');
    await page.getByRole('button', { name: 'Done' }).click();
    // The drawing is made smaller to fit, keeping its shape.
    await expect(page.locator('.bed-label')).toHaveText('Your puzzle: 8.0 × 3.9 cm');

    await page.getByRole('button', { name: 'Shuffle the cuts' }).click();
    await openTeacher(page);
    await expect(page.locator('#t-seed')).toHaveValue('43');
    await page.getByRole('button', { name: 'Done' }).click();

    await page.getByRole('button', { name: /Next: print it/ }).click();
    await expect(page.locator('.stats')).toContainText('8.0 × 3.9 cm');
    const [stl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download puzzle file/ }).click(),
    ]);
    expect(stl.suggestedFilename()).toBe('class-5b-yellow-6-pieces.stl');
  });

  test('a project keeps the print settings, so the same puzzle comes back', async ({ page }) => {
    await page.goto('/');
    await pickSample(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await openTeacher(page);
    await page.locator('#t-gap').fill('0.45');
    await page.getByRole('radio', { name: 'Fewer' }).check();
    await page.locator('#t-size').fill('12');
    await page.getByRole('button', { name: 'Done' }).click();

    await page.getByRole('button', { name: 'Project' }).click();
    const [saved] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Save my project/ }).click(),
    ]);
    const text = readFileSync(await saved.path(), 'utf8');
    expect(JSON.parse(text)).toMatchObject({
      settings: { clearance: 0.45, tabAmount: 'fewer', maxSizeMm: 120 },
    });
    await page.getByRole('button', { name: 'Done' }).click();

    await openTeacher(page);
    await page.getByRole('button', { name: 'Standard settings' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('#teacher-on')).toBeHidden();

    await page.getByRole('button', { name: 'Project' }).click();
    await page.locator('#project-file').setInputFiles({
      name: 'mine.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
    await expect(page.locator('#teacher-on')).toBeVisible();
    await openTeacher(page);
    await expect(page.locator('#t-gap-out')).toHaveText('0.45 mm');
    await expect(page.getByRole('radio', { name: 'Fewer' })).toBeChecked();
    await expect(page.locator('#t-size-out')).toHaveText('12.0 cm');
  });

  test('works with the keyboard alone and closes with Escape', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Teacher/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Teacher options' })).toBeVisible();
    await page.locator('#t-gap').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#t-gap-out')).toHaveText('0.35 mm');
    await page.keyboard.press('Escape');
    await expect(page.locator('#teacher-dialog')).toBeHidden();
    // Focus goes back to the button that opened it.
    await expect(page.getByRole('button', { name: /Teacher/ })).toBeFocused();
  });
});

test.describe('straighten the picture', () => {
  const cornerX = async (page: Page, name: RegExp) =>
    Number(await page.getByRole('button', { name }).getAttribute('cx'));

  test('four corners to drag, by mouse or keys, then a straight picture is traced', async ({
    page,
  }) => {
    await page.goto('/');
    await uploadDrawing(page);
    await expect(page.locator('#notice')).toContainText('Found your animal', { timeout: 15_000 });
    const before = await page.locator('.bed-art image').getAttribute('href');

    await page.getByRole('button', { name: 'Straighten the picture' }).click();
    await expect(page.locator('.corner')).toHaveCount(4);
    await expect(page.getByText('Finish the picture to continue')).toBeVisible();
    await expect(page.getByText('Smooth the wobbles')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Use the camera' })).toBeHidden();

    // Keys: arrow keys move the focused corner; Shift moves it further.
    const topLeft = page.getByRole('button', { name: /Top left corner/ });
    const x0 = await cornerX(page, /Top left corner/);
    await topLeft.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const x1 = await cornerX(page, /Top left corner/);
    expect(x1).toBeGreaterThan(x0);
    await page.keyboard.press('Shift+ArrowRight');
    expect((await cornerX(page, /Top left corner/)) - x1).toBeGreaterThan(x1 - x0);

    // Mouse: drag the bottom right corner up and to the left.
    const bottomRight = page.getByRole('button', { name: /Bottom right corner/ });
    const startX = await cornerX(page, /Bottom right corner/);
    const box = (await bottomRight.boundingBox())!;
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 30, cy - 20, { steps: 6 });
    await page.mouse.up();
    expect(await cornerX(page, /Bottom right corner/)).toBeLessThan(startX);

    // Crossing the corners over is refused, kindly.
    for (let i = 0; i < 80; i++) await page.keyboard.press('Shift+ArrowRight');
    await page.getByRole('button', { name: /Top left corner/ }).focus();
    for (let i = 0; i < 60; i++) await page.keyboard.press('Shift+ArrowRight');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('#notice')).toContainText('cross over');
    await expect(page.locator('.corner')).toHaveCount(4);

    // Reset, apply: the picture is replaced by a straightened one and traced again.
    await page.getByRole('button', { name: 'Reset corners' }).click();
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('#notice')).toContainText('Found your animal', { timeout: 15_000 });
    await expect(page.locator('.corner')).toHaveCount(0);
    expect(await page.locator('.bed-art image').getAttribute('href')).not.toBe(before);
    await expect(page.getByText('Smooth the wobbles')).toBeVisible();
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(heading(page)).toHaveText('Cut it into pieces');
  });

  test('cancel leaves the photo as it was, and only a photo can be straightened', async ({
    page,
  }) => {
    await page.goto('/');
    await pickSample(page);
    await expect(page.getByRole('button', { name: 'Straighten the picture' })).toBeHidden();
    await uploadDrawing(page);
    await expect(page.locator('#notice')).toContainText('Found your animal', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Straighten the picture' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.corner')).toHaveCount(0);
    await expect(page.locator('#notice')).toContainText('Found your animal');
    await expect(page.getByText('Pick a drawing to continue')).toBeHidden();
  });
});

test.describe('camera', () => {
  test.use({ permissions: ['camera'] });

  const streamOff = (page: Page) =>
    page.evaluate(() => (document.querySelector('#camera') as HTMLVideoElement).srcObject === null);

  test('shows the camera, takes a photo, and turns the camera off', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Use the camera' }).click();
    await expect(page.locator('#camera')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => (document.querySelector('#camera') as HTMLVideoElement).videoWidth),
      )
      .toBeGreaterThan(0);
    await expect(page.locator('#notice')).toContainText('Hold your drawing up to the camera');
    await expect(page.getByText('Finish the picture to continue')).toBeVisible();

    await page.getByRole('button', { name: 'Take photo' }).click();
    await expect(page.locator('#camera')).toBeHidden();
    await expect(page.locator('.bed-art svg.photo')).toBeVisible();
    expect(await streamOff(page)).toBe(true);
    // A photo from the camera goes the same way as any photo: the notice says what was found.
    await expect(page.locator('#notice')).not.toContainText('camera');
    await expect(page.getByRole('button', { name: 'Use the camera' })).toBeVisible();
  });

  test('cancel turns the camera off and leaves the page as it was', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Use the camera' }).click();
    await expect(page.locator('#camera')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('#camera')).toBeHidden();
    expect(await streamOff(page)).toBe(true);
    await expect(page.getByRole('button', { name: /Add a photo/ })).toBeVisible();
  });

  test('picking something else while the camera is on turns it off', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Use the camera' }).click();
    await expect(page.locator('#camera')).toBeVisible();
    await pickSample(page);
    await expect(page.locator('#camera')).toBeHidden();
    expect(await streamOff(page)).toBe(true);
    await expect(page.locator('#notice')).toContainText('Nice choice');
  });
});

test.describe('camera that cannot be used', () => {
  test('says so in plain words and the photo option still works', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('no', 'NotAllowedError'));
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Use the camera' }).click();
    await expect(page.locator('#notice')).toContainText("can't use the camera");
    await expect(page.locator('#notice')).toContainText('add a photo instead');
    await expect(page.locator('#camera')).toBeHidden();
    await expect(page.getByRole('button', { name: /Add a photo/ })).toBeVisible();
    await uploadDrawing(page);
    await expect(page.locator('#notice')).toContainText('Found your animal', { timeout: 15_000 });
  });

  test('is not offered when the browser has no camera support', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined });
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Add a photo/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use the camera' })).toBeHidden();
  });
});

test.describe('gap test print', () => {
  test('the Teacher dialog gives a test STL of six closed pieces, and says what to do with it', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Teacher/ }).click();
    await expect(page.getByText(/count the notches/)).toBeVisible();
    const [stl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download a gap test/ }).click(),
    ]);
    expect(stl.suggestedFilename()).toBe('hane-puzzle-gap-test.stl');
    const bytes = readFileSync(await stl.path());
    const triangles = bytes.readUInt32LE(80);
    expect(bytes.length).toBe(84 + triangles * 50);
    expect(triangles).toBeGreaterThan(300);
    await expect(page.locator('#t-coupon-status')).toHaveText('Saved hane-puzzle-gap-test.stl.');
  });
});

test.describe('class batch', () => {
  const openProject = (page: Page) => page.getByRole('button', { name: /Project/ }).click();

  test('collect two teams, keep them through a reload, download one zip', async ({ page }) => {
    await page.goto('/');
    await openProject(page);
    await page.getByRole('button', { name: 'Add this puzzle to the batch' }).click();
    await expect(page.locator('#batch-status')).toContainText('Pick a drawing first');
    await expect(page.getByRole('button', { name: /Download \(\.zip\)/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await page.getByRole('button', { name: 'Done' }).click();

    await pickSample(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await openProject(page);
    await page.getByRole('button', { name: 'Add this puzzle to the batch' }).click();
    await expect(page.locator('#batch-status')).toContainText('Added Yellow team, 6 pieces');
    await page.getByRole('button', { name: 'Done' }).click();

    await page.getByRole('radio', { name: 'Medium' }).check();
    await page.getByRole('radio', { name: 'Blue' }).check();
    await openProject(page);
    await page.getByRole('button', { name: 'Add this puzzle to the batch' }).click();
    await page.getByRole('button', { name: 'Add this puzzle to the batch' }).click();
    const items = page.locator('#batch-list li');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText('Yellow team · 6 pieces');
    await expect(items.nth(1)).toContainText('Blue team · 12 pieces');
    await page.getByRole('button', { name: 'Done' }).click();

    // The list is still there after a reload (it lives in this tab).
    await page.reload();
    await openProject(page);
    await expect(page.locator('#batch-list li')).toHaveCount(3);

    // Take the repeated blue one out, then download.
    await page
      .getByRole('button', { name: /Remove Blue team, 12 pieces/ })
      .last()
      .click();
    await expect(page.locator('#batch-list li')).toHaveCount(2);
    const [zip] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download 2 puzzles/ }).click(),
    ]);
    expect(zip.suggestedFilename()).toBe('hane-puzzle-batch.zip');
    const files = unzipSync(new Uint8Array(readFileSync(await zip.path())));
    expect(Object.keys(files).sort()).toEqual([
      'README.txt',
      'hane-puzzle-blue-12-pieces.stl',
      'hane-puzzle-yellow-6-pieces.stl',
      'projects/hane-puzzle-blue-12-pieces.json',
      'projects/hane-puzzle-yellow-6-pieces.json',
    ]);
    await expect(page.locator('#batch-status')).toContainText('with 2 puzzles');

    await page.getByRole('button', { name: 'Clear batch' }).click();
    await expect(page.locator('#batch-list li')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Clear batch/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('the same team twice gets two files, and the file name follows Teacher options', async ({
    page,
  }) => {
    await page.goto('/');
    await pickSample(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.getByRole('button', { name: /Teacher/ }).click();
    await page.locator('#t-name').fill('Class 5B');
    await page.getByRole('button', { name: 'Done' }).click();
    await openProject(page);
    await page.getByRole('button', { name: 'Add this puzzle to the batch' }).click();
    await page.getByRole('button', { name: 'Add this puzzle to the batch' }).click();
    const [zip] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download 2 puzzles/ }).click(),
    ]);
    expect(zip.suggestedFilename()).toBe('class-5b-batch.zip');
    const names = Object.keys(unzipSync(new Uint8Array(readFileSync(await zip.path()))));
    expect(names).toContain('class-5b-yellow-6-pieces.stl');
    expect(names).toContain('class-5b-yellow-6-pieces-2.stl');
  });
});

test.describe('move the cut points', () => {
  const toPuzzleStep = async (page: Page) => {
    await page.goto('/');
    await pickSample(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
  };
  const savedProject = async (page: Page) => {
    await page.getByRole('button', { name: /Project/ }).click();
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Save my project/ }).click(),
    ]);
    const project = JSON.parse(readFileSync(await file.path(), 'utf8')) as Record<string, unknown>;
    await page.getByRole('button', { name: 'Done' }).click();
    return project;
  };

  test('a dot for every piece, dragged by mouse or moved by keys, re-cuts the puzzle', async ({
    page,
  }) => {
    await toPuzzleStep(page);
    await expect(page.locator('.cut-dot')).toHaveCount(0);
    await page.getByRole('button', { name: 'Move the cut points' }).click();
    const dots = page.locator('.cut-dot');
    await expect(dots).toHaveCount(6);
    await expect(page.locator('#notice')).toContainText('Drag the dots');
    await expect(page.getByRole('button', { name: 'Shuffle the cuts' })).toBeHidden();

    const cuts = async () => page.locator('.cut-pieces').innerHTML();
    const before = await cuts();
    const x0 = Number(await dots.nth(0).getAttribute('cx'));

    // Drag the first dot.
    const box = (await dots.nth(0).boundingBox())!;
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
    expect(box.width).toBeGreaterThanOrEqual(43);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 40, cy + 15, { steps: 6 });
    await page.mouse.up();
    expect(await cuts()).not.toBe(before);
    expect(Number(await dots.nth(0).getAttribute('cx'))).not.toBe(x0);

    // Keys: the focused dot moves 1 mm; Shift moves it 5.
    const afterDrag = await cuts();
    await dots.nth(1).focus();
    const x1 = Number(await dots.nth(1).getAttribute('cx'));
    await page.keyboard.press('ArrowRight');
    expect(Number(await dots.nth(1).getAttribute('cx')) - x1).toBeCloseTo(1, 1);
    await page.keyboard.press('Shift+ArrowRight');
    expect(Number(await dots.nth(1).getAttribute('cx')) - x1).toBeCloseTo(6, 1);
    await expect.poll(cuts).not.toBe(afterDrag);

    // A dot cannot be dragged out of the shape.
    const first = (await dots.nth(2).boundingBox())!;
    const bed = (await page.locator('.bed').boundingBox())!;
    const startY = Number(await dots.nth(2).getAttribute('cy'));
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(bed.x + 4, bed.y + 4, { steps: 8 });
    await page.mouse.up();
    expect(Math.abs(Number(await dots.nth(2).getAttribute('cy')))).toBeLessThan(startY + 60);
    await expect(dots).toHaveCount(6);

    await page.getByRole('button', { name: 'Done moving' }).click();
    await expect(dots).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Move the cut points' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Shuffle the cuts' })).toBeVisible();
  });

  test('the moved cut points are saved in the project, and shuffling goes back to automatic', async ({
    page,
  }) => {
    await toPuzzleStep(page);
    expect(await savedProject(page)).not.toHaveProperty('seeds');
    await page.getByRole('button', { name: 'Move the cut points' }).click();
    await page.locator('.cut-dot').first().focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
    await page.getByRole('button', { name: 'Done moving' }).click();
    const project = await savedProject(page);
    expect(project.seeds).toHaveLength(6);

    await page.getByRole('button', { name: 'Shuffle the cuts' }).click();
    expect(await savedProject(page)).not.toHaveProperty('seeds');
  });

  test('changing the number of pieces puts the cuts back to automatic and says so', async ({
    page,
  }) => {
    await toPuzzleStep(page);
    await page.getByRole('button', { name: 'Move the cut points' }).click();
    await page.getByRole('button', { name: 'Done moving' }).click();
    await page.getByRole('button', { name: 'More pieces' }).click();
    await expect(page.locator('#notice')).toContainText('went back to automatic');
    expect(await savedProject(page)).not.toHaveProperty('seeds');
  });

  test('a project with moved cut points opens with them, and the puzzle step keeps them', async ({
    page,
  }) => {
    await toPuzzleStep(page);
    await page.getByRole('button', { name: 'Move the cut points' }).click();
    await page.locator('.cut-dot').first().focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowDown');
    await page.getByRole('button', { name: 'Done moving' }).click();
    const project = await savedProject(page);
    await page.getByRole('button', { name: 'Shuffle the cuts' }).click();

    await page.getByRole('button', { name: /Project/ }).click();
    await page.locator('#project-file').setInputFiles({
      name: 'steered.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await expect(page.locator('#notice')).toContainText('Opened your project');
    expect(await savedProject(page)).toMatchObject({ seeds: project.seeds });
    // Moving the cut points again starts from the saved ones.
    await page.getByRole('button', { name: 'Move the cut points' }).click();
    await expect(page.locator('.cut-dot')).toHaveCount(6);
  });

  test('is only offered on the flat picture of the Puzzle step', async ({ page }) => {
    await toPuzzleStep(page);
    await page.getByRole('radio', { name: '3D' }).check();
    await expect(page.getByRole('button', { name: 'Move the cut points' })).toBeHidden();
    await page.getByRole('radio', { name: 'Flat' }).check();
    await page.getByRole('button', { name: 'Move the cut points' }).click();
    await page.getByRole('radio', { name: '3D' }).check();
    await expect(page.locator('.cut-dot')).toHaveCount(0);
    await page.getByRole('radio', { name: 'Flat' }).check();
    await expect(page.getByRole('button', { name: 'Move the cut points' })).toBeVisible();
  });
});
