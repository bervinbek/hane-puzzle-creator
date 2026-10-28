import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Automated accessibility audit (axe-core) of every screen, tool and dialog, in the normal look
 * and in Calm mode. WCAG 2.2 AA plus axe's best-practice rules. Automated checks find about a
 * third of real problems; the keyboard and layout tests in this folder cover more, and a person
 * on a real device covers the rest (see tasks/todo.md).
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function audit(page: Page, label: string): Promise<void> {
  // Let colour changes finish first; a half-faded button is not a real contrast problem.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const report = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\\n    ${v.nodes
        .slice(0, 4)
        .map((n) => `${n.target.join(' ')} :: ${n.any.map((a) => a.message).join('; ')}`)
        .join('\\n    ')}`,
  );
  expect(report, `${label}\\n${report.join('\\n')}`).toEqual([]);
}

const pickSample = (page: Page) =>
  page.getByRole('button', { name: /Use the sample fish/ }).click();

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
    ctx.beginPath();
    ctx.ellipse(450, 300, 260, 150, 0, 0, Math.PI * 2);
    ctx.stroke();
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'a.png', { type: 'image/png' }));
    const input = document.querySelector<HTMLInputElement>('#file')!;
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#notice')).toContainText('Found your animal', { timeout: 15_000 });
}

for (const look of ['normal', 'calm'] as const) {
  test.describe(`accessibility audit (${look} look)`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      if (look === 'calm') {
        await page.getByRole('button', { name: /Comfort/ }).click();
        await page.getByLabel(/Calm mode/).check();
        await page.getByRole('button', { name: 'Done' }).click();
      }
    });

    test('step 1: nothing chosen, drawing pad, photo, straightening, camera', async ({ page }) => {
      await audit(page, 'step 1, nothing chosen');

      await page.getByRole('button', { name: /Use the camera/ }).click();
      await expect(page.locator('#camera')).toBeVisible();
      await audit(page, 'step 1, camera');
      await page.getByRole('button', { name: 'Cancel' }).click();

      await page.getByRole('button', { name: /Draw on screen/ }).click();
      await audit(page, 'step 1, drawing pad');

      await uploadDrawing(page);
      await audit(page, 'step 1, photo with tidy-up controls');

      await page.getByRole('button', { name: 'Straighten the picture' }).click();
      await audit(page, 'step 1, straightening');
    });

    test('steps 2 and 3, flat and 3D', async ({ page }) => {
      await pickSample(page);
      await audit(page, 'step 1, sample chosen');
      await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
      await audit(page, 'step 2, flat');
      await page.getByRole('radio', { name: '3D' }).check();
      await page.waitForSelector('.viewer-canvas[data-ready="true"]');
      await audit(page, 'step 2, 3D');
      await page.getByRole('button', { name: /Next: print it/ }).click();
      await audit(page, 'step 3, 3D with the print controls');
      await page.getByRole('radio', { name: 'Flat' }).check();
      await audit(page, 'step 3, flat');
    });

    test('the Comfort, Project and Teacher dialogs', async ({ page }) => {
      await pickSample(page);
      await page.getByRole('button', { name: /Comfort/ }).click();
      await audit(page, 'Comfort dialog');
      await page.getByRole('button', { name: 'Done' }).click();
      await page.getByRole('button', { name: /Project/ }).click();
      await audit(page, 'Project dialog');
      await page.getByRole('button', { name: 'Done' }).click();
      await page.getByRole('button', { name: /Teacher/ }).click();
      await audit(page, 'Teacher dialog');
    });
  });
}
