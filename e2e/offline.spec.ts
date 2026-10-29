import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Classrooms have poor Wi-Fi. After one visit the whole site, the 3D view included, must keep
 * working with no network at all, and it must be possible to put it on a home screen.
 */

test('after one visit the whole site works with no network', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  // The worker installs in the background: wait until it has stored the build.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const keys = await caches.keys();
          return keys.length === 0 ? 0 : (await (await caches.open(keys[0]!)).keys()).length;
        }),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(5);
  // One more visit, so the page is under the worker's control.
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pick your animal');

  // Make a puzzle, look at it in 3D (a part of the site that is fetched only when asked for) and save it.
  await page.getByRole('button', { name: /Use the sample fish/ }).click();
  await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
  await page.getByRole('button', { name: /Next: print it/ }).click();
  await expect(page.locator('.viewer-canvas')).toHaveAttribute('data-ready', 'true', {
    timeout: 30_000,
  });
  const [stl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Download puzzle file/ }).click(),
  ]);
  expect(stl.suggestedFilename()).toBe('hane-puzzle-6-pieces.stl');
  expect(readFileSync(await stl.path()).length).toBeGreaterThan(1000);
  // The fonts came from the store too: the page did not fall back to a plain font.
  expect(await page.evaluate(() => document.fonts.check('16px "Atkinson Hyperlegible"'))).toBe(
    true,
  );
  await context.setOffline(false);
});

test('can be put on a home screen: a manifest, icons that exist, and a worker that lists the build', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ name: 'Hane Puzzle Generator', display: 'standalone' });
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons as { src: string }[]) {
    const response = await request.get(new URL(icon.src, new URL(href!, page.url())).href);
    expect(response.ok(), icon.src).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
  }
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect((await request.get(touch!)).ok()).toBe(true);

  const worker = await (await request.get('/sw.js')).text();
  // Every file of the build is on its list, the 3D part included.
  expect(worker).toMatch(/assets\/viewer-[\w-]+\.js/);
  expect(worker).toMatch(/assets\/index-[\w-]+\.js/);
  expect(worker).toContain('index.html');
  expect(worker).not.toContain('.map"');
});
