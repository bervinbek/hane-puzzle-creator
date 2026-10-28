import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The whole flow with the keyboard alone: reaching every control in a sensible order, using it,
 * seeing where the focus is, and never getting stuck. The drawing pad and the corner dots take a
 * pointer (the corner dots also take arrow keys), so those are covered elsewhere.
 */

/** What the focused thing is called, for failure messages. */
const focusedName = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return 'nothing';
    const input = el as HTMLInputElement;
    const label =
      el.getAttribute('aria-label') ??
      input.labels?.[0]?.textContent?.trim() ??
      el.textContent?.trim() ??
      '';
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${label.slice(0, 40)}"`;
  });

/** True when the focused control (or the styled box next to a hidden radio or checkbox) has an outline ring. */
const focusIsVisible = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return false;
    const rings = (e: Element | null): boolean => {
      if (!e) return false;
      const s = getComputedStyle(e);
      return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
    };
    return rings(el) || rings(el.nextElementSibling);
  });

/** Presses Tab until the wanted control has focus; returns the names passed on the way. */
async function tabTo(page: Page, target: Locator, max = 60): Promise<string[]> {
  const passed: string[] = [];
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) {
      return passed;
    }
    await page.keyboard.press('Tab');
    passed.push(await focusedName(page));
  }
  throw new Error(`Never reached the control in ${max} Tab presses. Passed: ${passed.join(' > ')}`);
}

test('the whole flow works with the keyboard alone', async ({ page }) => {
  await page.goto('/');

  // A skip link comes first, is visible when focused, and takes you to the steps.
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to the steps' });
  await expect(skip).toBeFocused();
  expect((await skip.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();

  // Step 1: the options come first, in reading order.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /Add a photo/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /Use the sample fish/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#notice')).toContainText('Nice choice');

  // Next, then the title is focused so a screen reader says where you are.
  await tabTo(page, page.getByRole('button', { name: /Next: make the puzzle/ }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cut it into pieces');

  // Step 2: the slider, the level buttons and the team colours all work with arrow keys.
  await tabTo(page, page.locator('#pieces'));
  expect(await focusIsVisible(page)).toBe(true);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#count-num')).toHaveText('9');
  await expect(page.getByRole('radio', { name: 'Medium' })).toBeChecked();

  await tabTo(page, page.getByRole('radio', { name: 'Medium' }));
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Tricky' })).toBeChecked();
  await expect(page.locator('#count-num')).toHaveText('24');

  await tabTo(page, page.getByRole('radio', { name: 'Yellow' }));
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Blue' })).toBeChecked();
  await expect(page.locator('#team-label')).toHaveText('Team colour: Blue');

  // The Flat / 3D switch and the 3D controls.
  await tabTo(page, page.getByRole('radio', { name: 'Flat' }));
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: '3D' })).toBeChecked();
  const canvas = page.locator('.viewer-canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  await tabTo(page, page.locator('#explode'));
  await page.keyboard.press('End');
  await expect(canvas).toHaveAttribute('data-explode', '1.00');
  await tabTo(page, canvas);
  const frames = Number(await canvas.getAttribute('data-frames'));
  await page.keyboard.press('ArrowLeft');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-frames')))
    .toBeGreaterThan(frames);

  // Step 3: watch it print, pause it, and download the file.
  await tabTo(page, page.getByRole('button', { name: /Next: print it/ }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ready to print');
  await tabTo(page, page.locator('#sim-play'));
  expect(await focusIsVisible(page)).toBe(true);
  await page.keyboard.press('Enter');
  await expect(canvas).toHaveAttribute('data-sim', 'playing');
  await page.keyboard.press('Enter');
  await expect(canvas).toHaveAttribute('data-sim', 'paused');
  await tabTo(page, page.locator('#sim-layer'));
  await page.keyboard.press('Home');
  await expect(page.locator('#sim-layer-text')).toHaveText('Layer 1 of 15');

  await tabTo(page, page.getByRole('button', { name: /Download puzzle file/ }));
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.keyboard.press('Enter'),
  ]);
  expect(download.suggestedFilename()).toBe('hane-puzzle-blue-24-pieces.stl');
});

test('every control shows where the focus is', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Use the sample fish/ }).click();
  await page.getByRole('button', { name: /Next: make the puzzle/ }).click();

  // Start from the top of the page (a click there moves the keyboard's starting point).
  await page.mouse.click(2, 2);
  const hidden: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    // Past the last control the focus goes to the browser's own toolbar: nothing to check there.
    if (await page.evaluate(() => document.activeElement === document.body)) break;
    seen.add(await focusedName(page));
    if (!(await focusIsVisible(page))) hidden.push(await focusedName(page));
  }
  expect(seen.size, [...seen].join(' > ')).toBeGreaterThan(14);
  expect(hidden, `no visible focus on: ${hidden.join(', ')}`).toEqual([]);
});

test('dialogs trap the focus politely, close with Escape and give focus back', async ({ page }) => {
  await page.goto('/');
  for (const [button, heading] of [
    ['Comfort', 'Comfort'],
    ['Project', 'Your project'],
    ['Teacher', 'Teacher options'],
  ] as const) {
    const opener = page.getByRole('button', { name: new RegExp(button) });
    await opener.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    // Tab goes round inside the dialog and never reaches the page behind it.
    const inside = new Set<string>();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      inside.add(await focusedName(page));
      expect(
        // Inside the dialog, or out in the browser's own toolbar (then nothing in the page has focus).
        await page.evaluate(() => {
          const a = document.activeElement;
          return !a || a === document.body || Boolean(a.closest('dialog[open]'));
        }),
        `focus left the ${button} dialog`,
      ).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: heading })).toBeHidden();
    await expect(opener).toBeFocused();
  }
});

test('a blocked Next explains itself and can be reached by keyboard', async ({ page }) => {
  await page.goto('/');
  const next = page.getByRole('button', { name: /Next: make the puzzle/ });
  await tabTo(page, next);
  await expect(next).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#next-help')).toHaveText('Pick a drawing to continue');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pick your animal');
  await expect(page.getByRole('status')).toContainText('Pick a drawing first');
});
