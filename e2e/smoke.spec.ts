import { readFileSync } from 'node:fs';
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
    await uploadDrawing(page);
    await expect(page.locator('#notice')).toContainText('Found your animal', { timeout: 15_000 });
    expect(await fits(), 'step 1 with a photo').toEqual({ page: true, panel: true });

    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    expect(await fits(), 'step 2').toEqual({ page: true, panel: true });
    await page.locator('#pieces').fill('50');
    expect(await fits(), 'step 2 with a warning').toEqual({ page: true, panel: true });
    await page.getByRole('button', { name: /Next: print it/ }).click();
    expect(await fits(), 'step 3').toEqual({ page: true, panel: true });
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
});
