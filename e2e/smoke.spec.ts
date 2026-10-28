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
  await page.getByRole('button', { name: 'Download file' }).click();
  await expect(page.getByRole('status')).toContainText('next update');
});

test('piece count, difficulty, shuffle and team colour update the preview', async ({ page }) => {
  await page.goto('/');
  await pickSample(page);
  await page.getByRole('button', { name: /Next: make the puzzle/ }).click();

  const count = page.locator('#count-num');
  const cells = page.locator('svg.fish g path');
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
