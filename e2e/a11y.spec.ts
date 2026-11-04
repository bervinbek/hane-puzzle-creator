import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { drawAnimal } from './helpers';

/**
 * Automated accessibility audit (axe-core) of every screen, tool and dialog, in the normal look
 * and in Calm mode. WCAG 2.2 AA plus axe's best-practice rules. Automated checks find about a
 * third of real problems; the keyboard and layout tests in this folder cover more, and a person
 * on a real device covers the rest (see tasks/todo.md).
 */

// The 3D screens are drawn in software on a build machine, which is slow when it is busy.
test.describe.configure({ timeout: 90_000 });

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

    test('step 1: the empty drawing pad and the pad with a drawing', async ({ page }) => {
      await audit(page, 'step 1, empty pad');
      await drawAnimal(page);
      await audit(page, 'step 1, drawing on the pad');
    });

    test('steps 2 and 3, the animation and the printer', async ({ page }) => {
      await drawAnimal(page);
      await audit(page, 'step 1, drawing on the pad');
      await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
      await audit(page, 'step 2, flat');
      await page.getByRole('button', { name: /Next: print it/ }).click();
      await page.waitForSelector('.viewer-canvas[data-ready="true"]');
      await audit(page, 'step 3, the printer');
    });

    test('the name dialog at Download', async ({ page }) => {
      await drawAnimal(page);
      await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
      await page.getByRole('button', { name: /Next: print it/ }).click();
      await page.getByRole('button', { name: /Publish it now/ }).click();
      await expect(page.getByRole('dialog', { name: 'Name your animal' })).toBeVisible();
      await audit(page, 'name dialog, empty');
      await page.locator('#name-input').fill('!!!');
      await audit(page, 'name dialog, with a problem');
    });

    test('the Comfort and Teacher dialogs', async ({ page }) => {
      await drawAnimal(page);
      await page.getByRole('button', { name: /Comfort/ }).click();
      await audit(page, 'Comfort dialog');
      await page.getByRole('button', { name: 'Done' }).click();
      await page.getByRole('button', { name: /Teacher/ }).click();
      await audit(page, 'Teacher dialog');
    });
  });
}
