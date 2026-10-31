import { expect, test, type Page } from '@playwright/test';
import { drawAnimal } from './helpers';

/**
 * Tablets and phones: every screen stays inside the width (no sideways scrolling) and every
 * button, option and handle is big enough for a finger (44 px, the size the design rules ask
 * for). Laptops are covered by the "fits without scrolling" tests in smoke.spec.ts.
 */

const DEVICES = [
  { name: 'iPad mini portrait 744x1133', width: 744, height: 1133 },
  { name: 'iPad portrait 768x1024', width: 768, height: 1024 },
  { name: 'iPad Air portrait 820x1180', width: 820, height: 1180 },
  { name: 'phone 390x844', width: 390, height: 844 },
  { name: 'small phone 360x640', width: 360, height: 640 },
] as const;

const MIN_TARGET = 44;

/** Landscape tablets get the laptop layout, which must fit the window without scrolling. */
const LANDSCAPE = [
  { name: 'iPad landscape 1024x768', width: 1024, height: 768 },
  { name: 'iPad Air landscape 1180x820', width: 1180, height: 820 },
] as const;

async function measure(page: Page): Promise<{ overflow: number; small: string[] }> {
  return page.evaluate((min) => {
    const small: string[] = [];
    const nodes = document.querySelectorAll<HTMLElement | SVGElement>(
      'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], summary',
    );
    for (const el of nodes) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (el.classList.contains('skip-link')) continue;
      // A checkbox or radio sits inside its label, and the whole label can be pressed.
      const label =
        el instanceof HTMLInputElement && el.type !== 'range' ? el.closest('label') : null;
      const box = (label ?? el).getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (Math.min(box.width, box.height) < min - 0.5) {
        const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? '';
        small.push(
          `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${name}" ${Math.round(box.width)}x${Math.round(box.height)}`,
        );
      }
    }
    return { overflow: document.documentElement.scrollWidth - window.innerWidth, small };
  }, MIN_TARGET);
}

async function check(page: Page, label: string): Promise<void> {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  const { overflow, small } = await measure(page);
  expect(overflow, `${label}: sideways overflow`).toBeLessThanOrEqual(0);
  // Nothing spills out of the side panel or the preview card.
  const spill = await page.evaluate(() =>
    ['#panel', '#canvas-card'].filter((id) => {
      const el = document.querySelector(id)!;
      return el.scrollWidth > el.clientWidth + 1;
    }),
  );
  expect(spill, `${label}: sideways overflow inside`).toEqual([]);
  expect(small, `${label}: targets smaller than ${MIN_TARGET} px`).toEqual([]);
}

for (const device of DEVICES) {
  test.describe(device.name, () => {
    test.use({
      viewport: { width: device.width, height: device.height },
      hasTouch: true,
      isMobile: true,
    });

    test('every screen fits the width and has finger-sized controls', async ({ page }) => {
      await page.goto('/');
      await check(page, 'step 1, empty drawing pad');

      await drawAnimal(page);
      await check(page, 'step 1, drawing on the pad');
      await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
      await check(page, 'step 2, flat');
      await page.getByRole('button', { name: /Next: print it/ }).click();
      await page.waitForSelector('.viewer-canvas[data-ready="true"]');
      await check(page, 'step 3, the printer with the print controls');

      for (const [name, heading] of [
        ['Comfort', 'Comfort'],
        ['Teacher', 'Teacher options'],
      ] as const) {
        await page.getByRole('button', { name: new RegExp(name) }).click();
        await expect(page.getByRole('heading', { name: heading })).toBeVisible();
        await check(page, `${name} dialog`);
        await page.keyboard.press('Escape');
      }

      // The name dialog (opened by Download with no name) fits and keeps its targets big enough.
      await page.getByRole('button', { name: /Publish it now/ }).click();
      await expect(page.getByRole('dialog', { name: 'Name your animal' })).toBeVisible();
      await page.locator('#name-input').fill('!!!');
      await check(page, 'name dialog');
      await page.keyboard.press('Escape');
    });
  });
}

for (const device of LANDSCAPE) {
  test.describe(device.name, () => {
    test.use({
      viewport: { width: device.width, height: device.height },
      hasTouch: true,
      isMobile: true,
    });

    test('every step fits without scrolling, with finger-sized controls', async ({ page }) => {
      const fits = async (label: string): Promise<void> => {
        await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
        const state = await page.evaluate(() => ({
          page: document.documentElement.scrollHeight <= window.innerHeight + 1,
          panel: (() => {
            const p = document.querySelector('#panel')!;
            return p.scrollHeight <= p.clientHeight + 1;
          })(),
        }));
        expect(state, `${label}: fits without scrolling`).toEqual({ page: true, panel: true });
        await check(page, label);
      };
      await page.goto('/');
      await fits('step 1, empty drawing pad');
      await drawAnimal(page);
      await fits('step 1, drawing on the pad');
      await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
      await fits('step 2, flat');
      await page.getByRole('button', { name: /Next: print it/ }).click();
      await page.waitForSelector('.viewer-canvas[data-ready="true"]');
      await fits('step 3, the printer with the print controls');
    });
  });
}
