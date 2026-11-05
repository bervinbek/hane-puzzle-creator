import { expect, test, type Page } from '@playwright/test';
import { drawAnimal } from './helpers';

/**
 * Reduce motion and Calm mode. With reduced motion (the Comfort switch, or the system setting on
 * first visit) nothing on any screen may animate, fade or glide by itself. The 3D print player is
 * the one thing that moves, and only after the user presses Play (see smoke.spec.ts). Calm mode
 * drops the blur and the doodles behind the glass.
 */

/** Everything on the page that moves or could move: animations, transitions, smooth scrolling. */
async function movement(page: Page): Promise<string[]> {
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    const found: string[] = [];
    for (const el of document.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      const name = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.getAttribute('class') ?? '').split(' ')[0]}`;
      if (s.animationName !== 'none') found.push(`${name}: animation ${s.animationName}`);
      if (s.transitionDuration.split(',').some((d) => parseFloat(d) > 0)) {
        found.push(`${name}: transition ${s.transitionProperty} ${s.transitionDuration}`);
      }
    }
    const scroll = getComputedStyle(document.documentElement).scrollBehavior;
    if (scroll !== 'auto') found.push(`html: scroll-behavior ${scroll}`);
    for (const a of document.getAnimations()) {
      if (a.playState === 'running') found.push(`running animation: ${a.constructor.name}`);
    }
    return found;
  });
}

async function everyScreen(page: Page, still: (label: string) => Promise<void>): Promise<void> {
  await page.goto('/');
  await still('step 1');
  await still('step 1, drawing pad');
  await drawAnimal(page);
  await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
  await still('step 2, flat');
  await page.getByRole('button', { name: /Next: print it/ }).click();
  await page.waitForSelector('.viewer-canvas[data-ready="true"]');
  await still('step 3, the printer');
  for (const name of ['Comfort', 'Teacher']) {
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await still(`${name} dialog`);
    await page.keyboard.press('Escape');
  }
}

test.describe('reduced motion from the system setting', () => {
  test.use({ reducedMotion: 'reduce' });

  test('is on from the first visit, and nothing moves on any screen', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Comfort/ }).click();
    await expect(page.getByLabel(/Reduce motion/)).toBeChecked();
    await page.keyboard.press('Escape');
    await everyScreen(page, async (label) => expect(await movement(page), label).toEqual([]));
  });

  test('the 3D view still does not move on its own', async ({ page }) => {
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.getByRole('button', { name: /Next: print it/ }).click();
    const canvas = page.locator('.viewer-canvas');
    await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
    // It opens on the whole printer and the print does not start by itself.
    await expect(canvas).toHaveAttribute('data-view', 'printer');
    await expect(canvas).toHaveAttribute('data-sim', 'idle');
    // Let the redraws that the first view asked for finish, then count: no more may follow.
    const frames = async () => Number(await canvas.getAttribute('data-frames'));
    let last = -1;
    await expect
      .poll(
        async () => {
          const now = await frames();
          const settled = now === last;
          last = now;
          await page.waitForTimeout(300);
          return settled;
        },
        { timeout: 5_000 },
      )
      .toBe(true);
    const before = await frames();
    await page.waitForTimeout(800);
    expect(await frames()).toBe(before);
  });
});

test.describe('reduced motion from the Comfort switch', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('turning it on stops every transition, turning it off brings them back', async ({
    page,
  }) => {
    await page.goto('/');
    // Without it (and with no system setting) the buttons fade between states.
    expect((await movement(page)).some((m) => m.includes('transition'))).toBe(true);

    await page.getByRole('button', { name: /Comfort/ }).click();
    await page.getByLabel(/Reduce motion/).check();
    await page.getByRole('button', { name: 'Done' }).click();
    await everyScreen(page, async (label) => expect(await movement(page), label).toEqual([]));

    await page.getByRole('button', { name: /Comfort/ }).click();
    await page.getByLabel(/Reduce motion/).uncheck();
    await page.getByRole('button', { name: 'Done' }).click();
    expect((await movement(page)).some((m) => m.includes('transition'))).toBe(true);
  });
});

test.describe('the Publish button pulse', () => {
  test.use({ reducedMotion: 'no-preference' });

  const pulse = (page: Page) =>
    page.locator('#next').evaluate((el) => {
      const s = getComputedStyle(el);
      return { name: s.animationName, ring: s.boxShadow.includes('4px') };
    });

  test('pulses on the last step only, and holds a still ring with Reduce motion', async ({
    page,
  }) => {
    await page.goto('/');
    await drawAnimal(page);
    expect((await pulse(page)).name).toBe('none');
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    expect((await pulse(page)).name).toBe('none');
    await page.getByRole('button', { name: /Next: print it/ }).click();
    await expect(page.locator('#next')).toHaveText('Publish it now');
    expect((await pulse(page)).name).toBe('publish-pulse');

    // Going back puts it still again.
    await page.getByRole('button', { name: 'Back' }).click();
    expect((await pulse(page)).name).toBe('none');
    await page.getByRole('button', { name: /Next: print it/ }).click();

    // Reduce motion: the ring stays (it still marks the final press) but nothing moves.
    await page.getByRole('button', { name: /Comfort/ }).click();
    await page.getByLabel(/Reduce motion/).check();
    await page.getByRole('button', { name: 'Done' }).click();
    expect(await pulse(page)).toEqual({ name: 'none', ring: true });
  });
});

test.describe('calm mode', () => {
  test('drops the blur and the doodles behind the glass', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Comfort/ }).click();
    await page.getByLabel(/Calm mode/).check();
    await page.getByRole('button', { name: 'Done' }).click();
    const state = await page.evaluate(() => ({
      doodles: getComputedStyle(document.querySelector('.backdrop')!).display,
      blur: [...document.querySelectorAll('.glass')].map((el) => {
        const s = getComputedStyle(el);
        return s.backdropFilter || s.getPropertyValue('-webkit-backdrop-filter') || 'none';
      }),
    }));
    expect(state.doodles).toBe('none');
    expect(state.blur.length).toBeGreaterThan(3);
    for (const b of state.blur) expect(b === 'none' || b === '').toBe(true);
  });
});
