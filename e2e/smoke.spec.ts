import { expect, test } from '@playwright/test';

test('shell loads and steps through the three-step flow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Draw your animal');
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back' })).toBeDisabled();

  await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it a puzzle');

  await page.getByRole('button', { name: /Print/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Print it');
  await expect(page.getByRole('button', { name: /Download file/ })).toBeDisabled();
});

test('piece count, difficulty and team colour controls respond', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: /Puzzle/ })
    .first()
    .click();

  const count = page.locator('.count-num');
  await expect(count).toHaveText('6');
  await page.getByRole('button', { name: 'More pieces' }).click();
  await expect(count).toHaveText('7');

  await page.getByRole('radio', { name: /Tricky/ }).click();
  await expect(count).toHaveText('24');
  await expect(page.getByRole('radio', { name: /Tricky/ })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('radio', { name: 'Blue' }).click();
  await expect(page.getByText('Team colour: Blue')).toBeVisible();
});

test('comfort settings apply and persist', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Comfort' }).click();
  await page.getByLabel(/Calm mode/).check();
  await page.getByLabel('Large').check();
  await page.getByRole('button', { name: 'Done' }).click();

  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-calm', 'true');
  await expect(html).toHaveAttribute('data-text-size', 'large');

  await page.reload();
  await expect(html).toHaveAttribute('data-calm', 'true');
});
