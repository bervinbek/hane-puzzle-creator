import { expect, test } from '@playwright/test';

test('shell loads and steps through the three-step flow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Draw your animal');
  await expect(page.getByRole('button', { name: 'Back' })).toBeDisabled();

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it a puzzle');

  await page.getByRole('button', { name: /Print/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Print it');
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
});
