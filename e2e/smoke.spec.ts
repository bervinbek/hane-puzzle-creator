import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { drawAnimal } from './helpers';

const heading = (page: Page) => page.getByRole('heading', { level: 1 });

test('later steps stay closed until a drawing is picked, then the flow works', async ({ page }) => {
  await page.goto('/');
  await expect(heading(page)).toHaveText('Draw an outline of an animal');
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  await expect(page.getByText('Draw your animal to continue')).toBeVisible();

  // Blocked: the page explains instead of failing silently (aria-disabled, so force the click).
  await page.getByRole('button', { name: /Next: make the puzzle/ }).click({ force: true });
  await expect(heading(page)).toHaveText('Draw an outline of an animal');
  await expect(page.getByRole('status')).toContainText('Draw your animal first');

  await drawAnimal(page);
  await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
  await expect(heading(page)).toHaveText('Cut it into pieces');
  await page.locator('#animal-name').fill('Fish');

  await page.getByRole('button', { name: /Next: print it/ }).click();
  await expect(heading(page)).toHaveText("How it's made");

  // The print step shows honest numbers, as one quiet line, and saves a real STL.
  await expect(page.locator('.print-facts')).toContainText('cm');
  await expect(page.locator('.print-facts')).toContainText('grams');
  const [stl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Publish it now/ }).click(),
  ]);
  expect(stl.suggestedFilename()).toBe('Fish.stl');
  const bytes = readFileSync(await stl.path());
  const triangles = bytes.readUInt32LE(80);
  expect(bytes.length).toBe(84 + triangles * 50);
  expect(triangles).toBeGreaterThan(100);
  await expect(page.getByRole('status')).toContainText('Saved Fish.stl');

  // One file, printed three times: the to-do list says so, the old boxes are gone (totals only, in
  // one short block), and there is no per-piece download.
  await expect(page.locator('.print-facts')).toContainText(/about \d+ h/);
  await expect(page.locator('.print-facts')).not.toContainText('each');
  await expect(page.locator('.stats, .team-note')).toHaveCount(0);
  await expect(page.locator('.todo')).toContainText('three times');
  const factsBox = await page.locator('.print-facts').boundingBox();
  expect(factsBox!.height).toBeLessThan(56); // a short block: two lines at most
  await expect(page.getByRole('button', { name: /Download each piece/ })).toHaveCount(0);
});

test('piece count, difficulty, shuffle and animal name update the preview', async ({ page }) => {
  await page.goto('/');
  await drawAnimal(page);
  await page.getByRole('button', { name: /Next: make the puzzle/ }).click();

  const count = page.locator('#count-num');
  const cells = page.locator('svg.shape path[data-tone]');
  await expect(count).toHaveText('6');
  await expect(cells).toHaveCount(6);

  await page.getByRole('button', { name: 'More pieces' }).click();
  await expect(count).toHaveText('7');
  await expect(cells).toHaveCount(7);

  await page.locator('#pieces').fill('16');
  await expect(count).toHaveText('16');
  await expect(cells).toHaveCount(16);
  // The chips are gone: one control sets the number of pieces.
  await expect(page.getByRole('radio', { name: 'Tricky' })).toHaveCount(0);

  // Sixteen is the most: the slider stops there and + does nothing more.
  await expect(page.locator('#pieces')).toHaveAttribute('max', '16');
  await page.getByRole('button', { name: 'More pieces' }).click();
  await expect(count).toHaveText('16');
  await expect(page.locator('svg.shape path[data-tone]')).toHaveCount(16);

  const before = await cells.first().getAttribute('d');
  await page.getByRole('button', { name: /Shuffle the cuts/ }).click();
  await expect.poll(async () => cells.first().getAttribute('d')).not.toBe(before);

  await page.locator('#animal-name').fill('Cat');
  await expect(page.locator('#bed-tag')).toHaveText('Cat');
  // No Colour list: the colour count line and the tan stripes already say the three colours.
  await expect(page.getByText('Colour:')).toHaveCount(0);
  await expect(page.locator('#ladder-row')).toHaveCount(0);
});

test('the Puzzle step has one piece count, centred under the preview, and no extras', async ({
  page,
}) => {
  await page.goto('/');
  await drawAnimal(page);
  await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
  const control = page.locator('#pieces-control');
  await expect(control).toBeVisible();
  const bed = (await page.locator('.bed').boundingBox())!;
  const box = (await control.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(bed.y + bed.height - 1);
  expect(Math.abs(box.x + box.width / 2 - (bed.x + bed.width / 2))).toBeLessThan(4);

  // Gone: the Colour list, the Easy / Medium / Tricky chips and Move the cut points.
  await expect(page.getByText('Colour:')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Medium' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Move the cut points/ })).toHaveCount(0);

  // The control is only on this step.
  await page.getByRole('button', { name: /Next: print it/ }).click();
  await expect(control).toBeHidden();
});

test('the header has only Teacher and Comfort: there is no Project button', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Teacher/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Comfort/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Project/ })).toHaveCount(0);
  await expect(page.locator('#project-dialog')).toHaveCount(0);
});

test('the animal name is the name of the saved STL file, and the Print step shows it', async ({
  page,
}) => {
  await page.goto('/');
  await drawAnimal(page);
  await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
  const save = async () => {
    await page.getByRole('button', { name: /Next: print it/ }).click();
    const [stl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Publish it now/ }).click(),
    ]);
    return stl.suggestedFilename();
  };

  await page.locator('#animal-name').fill('Elephant');
  await page.getByRole('button', { name: /Next: print it/ }).click();
  // The file name sits next to the Download button, so the student sees what they get.
  await expect(page.locator('#next-help')).toHaveText('Elephant.stl');
  await page.getByRole('button', { name: 'Back' }).click();
  expect(await save()).toBe('Elephant.stl');
  await expect(page.getByRole('status')).toContainText('Saved Elephant.stl');

  // The spelling is kept, with spaces and in other languages; what a file cannot hold goes.
  for (const [typed, file] of [
    ['Big Cat', 'Big Cat.stl'],
    ['大象', '大象.stl'],
    ['a/b:c?', 'abc.stl'],
    ['con', 'con puzzle.stl'],
  ] as const) {
    await page.getByRole('button', { name: 'Back' }).click();
    await page.locator('#animal-name').fill(typed);
    expect(await save(), typed).toBe(file);
  }
});

test.describe('the animal name is asked for at Download', () => {
  const toPrint = async (page: Page) => {
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.getByRole('button', { name: /Next: print it/ }).click();
  };
  const download = (page: Page) => page.getByRole('button', { name: /Publish it now/ });
  /** Nothing is saved: no download starts in the time a download would take. */
  const noDownload = async (page: Page) => {
    let saved = false;
    page.once('download', () => (saved = true));
    await page.waitForTimeout(800);
    expect(saved).toBe(false);
  };

  test('an empty name opens a dialog; Save is closed until the name is usable', async ({
    page,
  }) => {
    await toPrint(page);
    await expect(page.locator('#next-help')).toHaveText('');
    await download(page).click();
    const dialog = page.getByRole('dialog', { name: 'Name your animal' });
    await expect(dialog).toBeVisible();
    await noDownload(page);
    await expect(page.locator('#name-input')).toBeFocused();
    const save = dialog.getByRole('button', { name: 'Save' });
    await expect(save).toHaveAttribute('aria-disabled', 'true');

    // Symbols are not a name: the dialog says so in words and Save stays closed.
    await page.locator('#name-input').fill('!!!');
    await expect(dialog.getByText('Use some letters or numbers.')).toBeVisible();
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await save.click({ force: true });
    await expect(dialog).toBeVisible();
    await noDownload(page);

    // A good name shows the file it makes, then Save downloads it and keeps the name.
    await page.locator('#name-input').fill('Big Cat');
    await expect(page.locator('#name-file')).toHaveText('Big Cat.stl');
    await expect(save).toHaveAttribute('aria-disabled', 'false');
    const [stl] = await Promise.all([page.waitForEvent('download'), save.click()]);
    expect(stl.suggestedFilename()).toBe('Big Cat.stl');
    await expect(dialog).toBeHidden();
    await expect(page.locator('#next-help')).toHaveText('Big Cat.stl');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('#animal-name')).toHaveValue('Big Cat');
    await expect(page.locator('#bed-tag')).toHaveText('Big Cat');
  });

  test('with no inbox set up there is no class code field and nothing leaves the site', async ({
    page,
  }) => {
    const outside: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== 'http://localhost:4173' && url.protocol.startsWith('http')) {
        outside.push(request.url());
      }
    });
    await toPrint(page);
    await download(page).click();
    const dialog = page.getByRole('dialog', { name: 'Name your animal' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('#code-input')).toBeHidden();
    await expect(dialog).not.toContainText('Publish your art');
    await page.locator('#name-input').fill('Big Cat');
    await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Save' }).click(),
    ]);
    await page.waitForTimeout(500);
    expect(outside).toEqual([]);
  });

  test('Cancel and Escape save nothing and give the focus back to Download', async ({ page }) => {
    await toPrint(page);
    const dialog = page.getByRole('dialog', { name: 'Name your animal' });
    await download(page).click();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await noDownload(page);
    await expect(download(page)).toBeFocused();

    await download(page).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await noDownload(page);
    await expect(download(page)).toBeFocused();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('#animal-name')).toHaveValue('');
  });

  test('works from the keyboard: type the name and press Enter', async ({ page }) => {
    await toPrint(page);
    await download(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#name-input')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Name your animal' })).toBeVisible();
    await noDownload(page);
    const [stl] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.type('Zebra').then(() => page.keyboard.press('Enter')),
    ]);
    expect(stl.suggestedFilename()).toBe('Zebra.stl');
  });

  test('a name already typed on the Puzzle step skips the dialog', async ({ page }) => {
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(page.locator('#animal-name')).toHaveAttribute('placeholder', 'Fish');
    await page.locator('#animal-name').fill('Lion');
    await page.getByRole('button', { name: /Next: print it/ }).click();
    const [stl] = await Promise.all([page.waitForEvent('download'), download(page).click()]);
    expect(stl.suggestedFilename()).toBe('Lion.stl');
    await expect(page.getByRole('dialog', { name: 'Name your animal' })).toBeHidden();
  });
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

test('with nothing drawn the pad asks for a drawing and Next stays shut', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Draw your animal to continue')).toBeVisible();
  await page.getByRole('button', { name: /Next: make the puzzle/ }).click({ force: true });
  await expect(heading(page)).toHaveText('Draw an outline of an animal');
  await expect(page.locator('#notice')).toContainText('Draw your animal first');
});

test.describe('the pad is the only way in', () => {
  test('there is no file input, camera, photo, straighten or sample button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.locator('video')).toHaveCount(0);
    for (const name of [
      /Add a photo/,
      /Use the camera/,
      /Take photo/,
      /Straighten the picture/,
      /Use the sample fish/,
      /Draw on screen/,
    ]) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
    }
    await expect(page.locator('body')).not.toContainText(/photo|camera|sample fish/i);
  });

  test('a dropped picture does nothing and the page is not replaced', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(
        new File([new Uint8Array([137, 80, 78, 71])], 'fish.png', { type: 'image/png' }),
      );
      for (const type of ['dragover', 'drop']) {
        const event = new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true });
        document.body.dispatchEvent(event);
        (window as unknown as Record<string, boolean>)[`${type}Cancelled`] = event.defaultPrevented;
      }
    });
    const cancelled = await page.evaluate(() => {
      const w = window as unknown as Record<string, boolean>;
      return [w.dragoverCancelled, w.dropCancelled];
    });
    expect(cancelled).toEqual([true, true]);
    await expect(heading(page)).toHaveText('Draw an outline of an animal');
    await expect(page.getByText('Draw your animal to continue')).toBeVisible();
  });

  test('the page never asks for the camera', async ({ page }) => {
    await page.addInitScript(() => {
      const calls: string[] = [];
      (window as unknown as { __mediaCalls: string[] }).__mediaCalls = calls;
      const devices = navigator.mediaDevices;
      if (devices) {
        devices.getUserMedia = (...args) => {
          calls.push('getUserMedia');
          return Promise.reject(new Error(`unexpected ${String(args.length)}`));
        };
      }
    });
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(heading(page)).toHaveText('Cut it into pieces');
    const calls = await page.evaluate(
      () => (window as unknown as { __mediaCalls: string[] }).__mediaCalls,
    );
    expect(calls).toEqual([]);
  });
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

    await expect(page.locator('.pad-canvas')).toBeVisible();
    expect(await fits(), 'step 1 with the drawing pad').toEqual({ page: true, panel: true });
    await drawAnimal(page);
    expect(await fits(), 'step 1 with a drawing').toEqual({ page: true, panel: true });

    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    expect(await fits(), 'step 2').toEqual({ page: true, panel: true });
    // The picture, the piece count and the panel's buttons all sit inside their cards.
    const puzzleFits = () =>
      page.evaluate(() => {
        const inside = (el: Element, box: Element): boolean => {
          const a = el.getBoundingClientRect();
          const b = box.getBoundingClientRect();
          return (
            a.left >= b.left - 1 &&
            a.right <= b.right + 1 &&
            a.top >= b.top - 1 &&
            a.bottom <= b.bottom + 1
          );
        };
        const card = document.querySelector('#canvas-card')!;
        const panel = document.querySelector('#panel')!;
        return {
          cardOverflow:
            card.scrollHeight > card.clientHeight + 1 || card.scrollWidth > card.clientWidth + 1,
          picture: inside(document.querySelector('.bed')!, card),
          count: inside(document.querySelector('#pieces-control')!, card),
          // Only the buttons that are shown have a box.
          buttons: [...panel.querySelectorAll<HTMLElement>('.panel-buttons .btn')]
            .filter((b) => !b.hidden)
            .every((b) => inside(b, panel)),
        };
      });
    const placed = { cardOverflow: false, picture: true, count: true, buttons: true };
    expect(await puzzleFits(), 'step 2: everything inside its card').toEqual(placed);
    // Small pieces (the most pieces on a 10 cm drawing) bring the magnet warning.
    await page.getByRole('button', { name: /Teacher/ }).click();
    await page.locator('#t-size').fill('10');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.locator('#pieces').fill('16');
    await expect(page.locator('#notice')).toContainText('too small for a magnet');
    expect(await fits(), 'step 2 with a warning').toEqual({ page: true, panel: true });
    expect(await puzzleFits(), 'step 2 with a warning: inside its card').toEqual(placed);
    await page.getByRole('button', { name: /Next: print it/ }).click();
    expect(await fits(), 'step 3').toEqual({ page: true, panel: true });
    await page.waitForSelector('.viewer-canvas[data-ready="true"]');
    expect(await fits(), 'step 3 in 3D').toEqual({ page: true, panel: true });
    await expect(page.locator('#sim-controls')).toBeVisible();
    const inside = await page.evaluate(() => {
      const card = document.querySelector('#canvas-card')!.getBoundingClientRect();
      const bed = document.querySelector('.bed')!.getBoundingClientRect();
      const bar = document.querySelector('#preview-actions')!.getBoundingClientRect();
      return {
        barInCard:
          bar.bottom <= card.bottom + 1 && bar.left >= card.left - 1 && bar.right <= card.right + 1,
        barBelowPicture: bar.top >= bed.bottom - 1,
      };
    });
    expect(inside, 'print controls sit under the picture, inside the card').toEqual({
      barInCard: true,
      barBelowPicture: true,
    });
  });
}

test.describe('phone: usable without sideways scrolling', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });

  test('layout stacks and stays inside the screen width', async ({ page }) => {
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await page.getByRole('button', { name: 'More pieces' }).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });

  test('the print controls stay inside the screen width in 3D', async ({ page }) => {
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.getByRole('button', { name: /Next: print it/ }).click();
    await expect(page.locator('.viewer-canvas')).toHaveAttribute('data-sim', 'playing', {
      timeout: 20_000,
    });
    const edges = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      right: Math.max(
        ...[...document.querySelectorAll('#sim-controls > *, #view-controls > *')].map(
          (el) => el.getBoundingClientRect().right,
        ),
      ),
      width: window.innerWidth,
    }));
    expect(edges.overflow).toBeLessThanOrEqual(0);
    expect(edges.right).toBeLessThanOrEqual(edges.width);
    const play = await page.getByRole('button', { name: 'Pause' }).boundingBox();
    expect(play!.height).toBeGreaterThanOrEqual(40);
  });
});

test.describe('colour animation on the Puzzle step', () => {
  test.use({ reducedMotion: 'no-preference' });
  const tone = (page: Page, name: string) => page.locator(`svg.shape path[data-tone="${name}"]`);

  test('plays once white, tan, gold, then stays gold', async ({ page }) => {
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();

    // It starts all white, goes through tan (with stripes, so colour is not the only sign) and ends gold.
    await expect(tone(page, 'white').first()).toBeVisible();
    await expect.poll(async () => tone(page, 'tan').count()).toBeGreaterThan(0);
    await expect(page.locator('svg.shape pattern#tan-stripes')).toHaveCount(1);
    await expect(page.locator('#reveal-status')).toHaveText('All 6 pieces are gold.', {
      timeout: 10_000,
    });
    await expect(tone(page, 'gold')).toHaveCount(6);
    // There is no colour ladder: the pieces and the spoken line say it.
    await expect(page.locator('#ladder-row')).toHaveCount(0);

    // It does not start again by itself.
    await page.waitForTimeout(600);
    await expect(tone(page, 'gold')).toHaveCount(6);
    await expect(page.getByRole('button', { name: 'Replay' })).toHaveCount(0);
  });

  test('there is no colour ladder, and tan pieces are striped while they are tan', async ({
    page,
  }) => {
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(page.locator('#ladder-row')).toHaveCount(0);
    await expect(page.locator('.ladder')).toHaveCount(0);
    // Colour is never the only signal: every tan piece also has the stripe pattern laid over it.
    await expect
      .poll(async () => {
        const tan = await tone(page, 'tan').count();
        const striped = await page.locator('svg.shape path[fill="url(#tan-stripes)"]').count();
        return tan > 0 && striped === tan;
      })
      .toBe(true);
    await expect(page.locator('#reveal-status')).toHaveText('All 6 pieces are gold.', {
      timeout: 10_000,
    });
  });

  test('the piece being upgraded drifts out and back, and none is left out of place', async ({
    page,
  }) => {
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();

    // While it plays, the piece that just changed colour is the one that moves.
    await expect.poll(async () => page.locator('svg.shape .drift').count()).toBeGreaterThan(0);
    await expect(page.locator('svg.shape .drift').first().locator('path').first()).toBeVisible();

    // At the end nothing is drifting: every piece is gold, in the place the cut put it.
    await expect(page.locator('#reveal-status')).toHaveText('All 6 pieces are gold.', {
      timeout: 10_000,
    });
    await expect(page.locator('svg.shape .drift')).toHaveCount(0);
    await expect(tone(page, 'gold')).toHaveCount(6);
  });

  test('changing the number of pieces jumps to the finished gold puzzle', async ({ page }) => {
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.getByRole('button', { name: 'More pieces' }).click();
    await expect(tone(page, 'gold')).toHaveCount(7);
    await expect(tone(page, 'white')).toHaveCount(0);
  });

  test('gold pieces have the silk look and one glint each; white and tan have none', async ({
    page,
  }) => {
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    const glints = page.locator('svg.shape .glint');
    // At the start every piece is white: no glints and no gold gradient in use.
    await expect(tone(page, 'white').first()).toBeVisible();
    await expect(glints).toHaveCount(0);
    await expect(page.locator('svg.shape path[fill="url(#gold-silk)"]')).toHaveCount(0);

    // At the end all six are gold: a glint and a gradient each, hidden from screen readers.
    await expect(page.locator('#reveal-status')).toHaveText('All 6 pieces are gold.', {
      timeout: 10_000,
    });
    await expect(glints).toHaveCount(6);
    await expect(page.locator('svg.shape path[fill="url(#gold-silk)"]')).toHaveCount(6);
    await expect(page.locator('svg.shape .glint').first().locator('..')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    // They move slowly (a cycle of three seconds or more), never in a flash.
    const periods = await glints.evaluateAll((els) =>
      els.map((e) => parseFloat(getComputedStyle(e).animationDuration)),
    );
    for (const p of periods) expect(p).toBeGreaterThanOrEqual(3);
  });

  test('with Reduce motion the glints stay, still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    const glint = page.locator('svg.shape .glint').first();
    await expect(glint).toBeAttached();
    expect(await glint.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  });

  test('Shuffle is in the panel, and there is no Replay and no hint', async ({ page }) => {
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    const panel = page.locator('#panel');
    await expect(panel.getByRole('button', { name: 'Replay' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Shuffle the cuts' })).toBeVisible();
    await expect(page.locator('#preview-actions')).toBeHidden();
    await expect(page.getByText('Move the slider and watch')).toHaveCount(0);
  });

  test('with Reduce motion the puzzle is gold at once and there is no Replay', async ({ page }) => {
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: 'Comfort' }).click();
    await page.getByLabel(/Reduce motion/).check();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(tone(page, 'gold')).toHaveCount(6);
    await expect(tone(page, 'white')).toHaveCount(0);
    await expect(page.locator('svg.shape .drift')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Replay' })).toHaveCount(0);
  });
});

test.describe('the Print step shows the printer', () => {
  test.use({ reducedMotion: 'no-preference' });
  const toPrintStep = async (page: Page) => {
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.getByRole('button', { name: /Next: print it/ }).click();
  };
  const reduceMotion = async (page: Page) => {
    await page.getByRole('button', { name: 'Comfort' }).click();
    await page.getByLabel(/Reduce motion/).check();
    await page.getByRole('button', { name: 'Done' }).click();
  };

  test('the Puzzle step has no 3D; the Print step is the printer, with angles', async ({
    page,
  }) => {
    await page.goto('/');
    await drawAnimal(page);
    await reduceMotion(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(page.locator('.viewer-canvas')).toHaveCount(0); // not even downloaded yet

    await page.getByRole('button', { name: /Next: print it/ }).click();
    const canvas = page.locator('.viewer-canvas');
    await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
    await expect(canvas).toHaveAttribute('data-pieces', '6');
    await expect(canvas).toHaveAttribute('data-view', 'angled');
    await expect(page.locator('.bed-art')).toBeHidden();
    // There is no Flat / 3D switch any more.
    await expect(page.getByRole('radio', { name: '3D' })).toHaveCount(0);

    await page.getByRole('button', { name: /Top view/ }).click();
    await expect(canvas).toHaveAttribute('data-view', 'top');
    await page.getByRole('button', { name: 'See the whole printer' }).click();
    await expect(canvas).toHaveAttribute('data-view', 'printer');
    await page.getByRole('button', { name: 'Angle view' }).click();
    await expect(canvas).toHaveAttribute('data-view', 'angled');

    // Nothing is animating (motion is reduced): after the last redraw (a resize or the camera
    // change can land one frame late) the count stops, and a failure to settle fails the test.
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
    await page.waitForTimeout(700);
    expect(await frames()).toBe(before);

    // Keyboard users can turn it: the view redraws.
    await canvas.focus();
    await page.keyboard.press('ArrowLeft');
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-frames')))
      .toBeGreaterThan(before);
  });

  test('starts printing by itself: white, then tan, then gold', async ({ page }) => {
    test.setTimeout(150_000);
    await toPrintStep(page);
    const canvas = page.locator('.viewer-canvas');
    await expect(canvas).toHaveAttribute('data-sim', 'playing', { timeout: 20_000 });
    await expect(canvas).toHaveAttribute('data-runs', '3');
    await expect(page.getByText('Illustrative preview')).toBeVisible();
    await expect(page.locator('#sim-layer')).toHaveAttribute('max', '15');
    await expect(page.getByRole('button', { name: 'Shuffle the cuts' })).toBeHidden();

    await page.getByRole('radio', { name: 'Fast' }).check();
    // The three prints run one after another (there is no ladder on the Print step any more).
    await expect(page.locator('#bed-label .ladder')).toHaveCount(0);
    await expect(canvas).toHaveAttribute('data-run', '1', { timeout: 60_000 });
    await expect(canvas).toHaveAttribute('data-run', '2', { timeout: 60_000 });
    await expect(canvas).toHaveAttribute('data-run', '3', { timeout: 60_000 });
    await expect(canvas).toHaveAttribute('data-sim', 'done', { timeout: 60_000 });
  });

  test('plays, pauses, scrubs by layer, finishes and replays', async ({ page }) => {
    // A busy machine draws few frames a second and the print clock is capped per frame, so the
    // three prints can take much longer than on a free one: leave plenty of room.
    test.setTimeout(260_000);
    await toPrintStep(page);
    const canvas = page.locator('.viewer-canvas');
    await expect(canvas).toHaveAttribute('data-sim', 'playing', { timeout: 20_000 });
    await expect(canvas).toHaveAttribute('data-layers', '15');
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    // The print moves on by itself, layer by layer.
    await page.getByRole('radio', { name: 'Fast' }).check();
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-layer')), { timeout: 20_000 })
      .toBeGreaterThan(1);

    // Pausing stops the picture: nothing is drawn while nothing moves.
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(canvas).toHaveAttribute('data-sim', 'paused');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    const frames = Number(await canvas.getAttribute('data-frames'));
    await page.waitForTimeout(600);
    expect(Number(await canvas.getAttribute('data-frames'))).toBe(frames);

    // The layer slider jumps to any layer of the print on the plate, and says which one.
    await page.locator('#sim-layer').fill('5');
    await expect(page.locator('#sim-layer-text')).toHaveText('Layer 5 of 15');
    await expect(canvas).toHaveAttribute('data-layer', '5');
    await expect(canvas).toHaveAttribute('data-sim', 'paused');

    // Let it carry on through the other prints to the end; then it can be watched again.
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(canvas).toHaveAttribute('data-sim', 'done', { timeout: 200_000 });
    await expect(canvas).toHaveAttribute('data-run', '3');
    await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible();
    await page.getByRole('button', { name: 'Replay' }).click();
    await expect(canvas).toHaveAttribute('data-sim', 'playing');
    await expect(canvas).toHaveAttribute('data-run', '1');
    await expect(page.locator('#sim-layer-text')).toHaveText('Layer 1 of 15');

    // Going back a step puts the finished puzzle on the plate again.
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(canvas).toHaveAttribute('data-sim', 'idle');
    await expect(page.getByRole('button', { name: 'Shuffle the cuts' })).toBeVisible();
  });

  test('with reduced motion nothing starts until you press play', async ({ page }) => {
    await page.goto('/');
    await drawAnimal(page);
    await reduceMotion(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.getByRole('button', { name: /Next: print it/ }).click();
    const canvas = page.locator('.viewer-canvas');
    await expect(canvas).toHaveAttribute('data-sim', 'idle', { timeout: 20_000 });
    await page.waitForTimeout(500);
    await expect(canvas).toHaveAttribute('data-sim', 'idle');
    await page.getByRole('button', { name: 'Watch it print' }).click();
    await expect(canvas).toHaveAttribute('data-sim', 'playing');
  });

  test('shows a flat gold picture when the browser has no WebGL', async ({ page }) => {
    await page.addInitScript(() => {
      // No WebGL, but the drawing pad (which every visit opens) still gets its 2D canvas.
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
        return type === '2d' ? getContext.call(this, '2d') : null;
      } as typeof getContext;
    });
    await toPrintStep(page);
    await expect(page.locator('#notice')).toContainText("3D view isn't available");
    await expect(page.locator('.bed-art svg.shape')).toBeVisible();
    await expect(page.locator('svg.shape path[data-tone="gold"]')).toHaveCount(6);
  });

  test('calm mode switches to the plainer picture and keeps drawing', async ({ page }) => {
    await toPrintStep(page);
    const canvas = page.locator('.viewer-canvas');
    await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
    const before = Number(await canvas.getAttribute('data-frames'));

    await page.getByRole('button', { name: 'Comfort' }).click();
    await page.getByLabel(/Calm mode/).check();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-frames')))
      .toBeGreaterThan(before);
  });
});

/** Draws a closed loop (a wobbly egg) on the drawing pad with the mouse. */
async function drawEgg(page: Page, around = 1): Promise<void> {
  const box = (await page.locator('.pad-canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const point = (i: number, n: number) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * box.width * 0.33, cy + Math.sin(a) * box.height * 0.24] as const;
  };
  const n = 48;
  // `around` is how much of the way round the line goes: 1 closes the egg, less leaves a gap.
  const last = around >= 1 ? n + 2 : Math.round(n * around);
  await page.mouse.move(...point(0, n));
  await page.mouse.down();
  for (let i = 1; i <= last; i++) await page.mouse.move(...point(i % (n + 1), n), { steps: 2 });
  await page.mouse.up();
}

/** Draws an egg with two eye dots, a smile and a stripe inside it. */
async function drawFace(page: Page): Promise<void> {
  const box = (await page.locator('.pad-canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const w = box.width;
  const h = box.height;
  await drawEgg(page);
  const stroke = async (points: (readonly [number, number])[]) => {
    await page.mouse.move(...points[0]!);
    await page.mouse.down();
    for (const p of points.slice(1)) await page.mouse.move(...p, { steps: 2 });
    await page.mouse.up();
  };
  const dot = (x: number, y: number) =>
    stroke(
      Array.from({ length: 9 }, (_, i): [number, number] => [
        x + Math.cos((i / 8) * Math.PI * 2) * 3,
        y + Math.sin((i / 8) * Math.PI * 2) * 3,
      ]),
    );
  await dot(cx - w * 0.12, cy - h * 0.06);
  await dot(cx + w * 0.12, cy - h * 0.06);
  await stroke(
    Array.from({ length: 21 }, (_, i): [number, number] => {
      const a = 0.35 + (i / 20) * (Math.PI - 0.7);
      return [cx + Math.cos(a) * w * 0.15, cy + h * 0.02 + Math.sin(a) * h * 0.1];
    }),
  );
  await stroke([
    [cx, cy - h * 0.2],
    [cx, cy - h * 0.12],
  ]);
}

test.describe('engraving the lines drawn inside the animal', () => {
  const toPuzzle = async (page: Page) => {
    await page.goto('/');
    await drawFace(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(heading(page)).toHaveText('Cut it into pieces', { timeout: 15_000 });
  };
  const engraveButton = (page: Page) => page.getByRole('button', { name: /Engrave my drawing/ });
  const grooves = (page: Page) => page.locator('.bed-art [data-groove]');

  test('is on at first, shows the lines on the pieces, and can be turned off and on', async ({
    page,
  }) => {
    await toPuzzle(page);
    await expect(engraveButton(page)).toHaveText(/Engrave my drawing: On/);
    await expect(engraveButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(grooves(page).first()).toBeAttached();

    await engraveButton(page).click();
    await expect(engraveButton(page)).toHaveText(/Engrave my drawing: Off/);
    await expect(engraveButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(engraveButton(page)).toBeFocused();
    await expect(grooves(page)).toHaveCount(0);

    await engraveButton(page).click();
    await expect(engraveButton(page)).toHaveText(/Engrave my drawing: On/);
    await expect(grooves(page).first()).toBeAttached();
  });

  test('the file carries the grooves only when it is on, and the Print step says so', async ({
    page,
  }) => {
    await toPuzzle(page);
    await page.locator('#animal-name').fill('Face');
    const saved = async (): Promise<Buffer> => {
      const [stl] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: /Publish it now/ }).click(),
      ]);
      return readFileSync((await stl.path())!);
    };
    await page.getByRole('button', { name: /Next: print it/ }).click();
    await expect(page.locator('.todo')).toContainText('engraved 0.6 mm deep');
    const on = await saved();

    await page.getByRole('button', { name: 'Back' }).click();
    await engraveButton(page).click();
    await page.getByRole('button', { name: /Next: print it/ }).click();
    await expect(page.locator('.todo')).not.toContainText('engraved');
    const off = await saved();
    expect(on.length).toBeGreaterThan(off.length);
    expect(on.equals(off)).toBe(false);
  });

  test('is not offered for a drawing with no lines inside it', async ({ page }) => {
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(heading(page)).toHaveText('Cut it into pieces');
    await expect(engraveButton(page)).toHaveCount(0);
    await expect(grooves(page)).toHaveCount(0);
  });

  test('the teacher picks the depth, and the test print downloads', async ({ page }) => {
    await toPuzzle(page);
    await page.getByRole('button', { name: 'Teacher' }).click();
    const dialog = page.getByRole('dialog', { name: 'Teacher options' });
    await expect(dialog.getByRole('radio', { name: /Normal 0.6 mm/ })).toBeChecked();
    await dialog.getByRole('radio', { name: /Deep 0.8 mm/ }).check({ force: true });
    const [test] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: /Download an engraving test/ }).click(),
    ]);
    expect(test.suggestedFilename()).toBe('engraving-test.stl');
    expect(readFileSync((await test.path())!).length).toBeGreaterThan(50_000);
    await dialog.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: /Next: print it/ }).click();
    await expect(page.locator('.todo')).toContainText('engraved 0.8 mm deep');
  });

  for (const size of LAPTOPS) {
    test(`laptop window (${size.name}): the Puzzle and Print steps still fit`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await toPuzzle(page);
      const fits = () =>
        page.evaluate(() => ({
          page: document.documentElement.scrollHeight <= window.innerHeight + 1,
          panel: (() => {
            const p = document.querySelector('#panel')!;
            return p.scrollHeight <= p.clientHeight + 1;
          })(),
        }));
      await expect(engraveButton(page)).toBeVisible();
      expect(await fits(), 'Puzzle step with the switch').toEqual({ page: true, panel: true });
      await page.getByRole('button', { name: /Next: print it/ }).click();
      await expect(page.locator('.todo')).toContainText('engraved');
      expect(await fits(), 'Print step with the engraving line').toEqual({
        page: true,
        panel: true,
      });
    });
  }

  test('a phone shows the switch without sideways scrolling', async ({ page }) => {
    await toPuzzle(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(engraveButton(page)).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  });

  test('has no accessibility violations on the Puzzle step with the switch', async ({ page }) => {
    await toPuzzle(page);
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});

test.describe('draw on screen', () => {
  test('the pad is open on arrival with a faint guide that goes at the first stroke', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await expect(page.locator('.pad-canvas')).toBeVisible();

    const guide = page.getByRole('img', {
      name: /faint example of a cat, then an elephant, then a dragon/,
    });
    await expect(guide).toBeAttached();
    // Three animals, outlines only, one after another, with a brush that follows the line.
    await expect(guide.locator('.guide-animal')).toHaveCount(3);
    await expect(guide.locator('.guide-animal path')).toHaveCount(3);
    await expect(guide.locator('.guide-brush')).toBeAttached();
    expect(
      await guide
        .locator('.guide-animal')
        .first()
        .evaluate((g) => getComputedStyle(g).animationName),
    ).toBe('guide-fade');
    expect(await guide.locator('.guide-brush').evaluate((b) => b.getAnimations().length)).toBe(1);

    // The guide is a layer of its own, and it goes at the first touch; Undo does not bring it back.
    await drawEgg(page);
    await expect(guide).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(guide).toHaveCount(0);
  });

  test('with Reduce motion the guide is a still, faint, dashed example (the cat, no brush)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const g = page.locator('.pad-guide .guide-animal').first();
    await expect(g).toBeAttached();
    await expect(page.locator('.pad-guide .guide-animal').nth(1)).toBeHidden();
    await expect(page.locator('.pad-guide .guide-brush')).toBeHidden();
    expect(await g.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
    expect(await g.evaluate((e) => getComputedStyle(e).opacity)).toBe('0.22');
  });

  test('a drawing becomes a puzzle, with undo, clear and friendly messages', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.pad-canvas')).toBeVisible();
    await expect(page.getByText('Draw your animal here')).toBeVisible();
    await expect(page.getByText('Draw your animal to continue')).toBeVisible();

    // Nothing drawn yet: Next is closed, and a gentle message says why, not an error.
    await expect(page.getByRole('button', { name: /Next: make the puzzle/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click({ force: true });
    await expect(page.locator('#notice')).toContainText('Draw your animal first');
    await expect(page.getByRole('button', { name: 'Use my drawing' })).toHaveCount(0);

    // Draw, undo (the hint comes back), draw again, clear, and draw once more.
    await drawEgg(page);
    await expect(page.getByText('Draw your animal here')).toBeHidden();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('Draw your animal here')).toBeVisible();
    await drawEgg(page);
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByText('Draw your animal here')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Thick' })).toHaveCount(0);
    await drawEgg(page);

    // With something drawn, Next is open and goes straight to the puzzle.
    await expect(page.getByRole('button', { name: /Next: make the puzzle/ })).toHaveAttribute(
      'aria-disabled',
      'false',
      { timeout: 5_000 },
    );
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(heading(page)).toHaveText('Cut it into pieces', { timeout: 15_000 });
    await expect(page.locator('.bed-art svg.shape')).toBeVisible();

    // Back: the pad is open again, and there is nothing to tune.
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.pad-canvas')).toBeVisible();
    await expect(page.getByLabel('Smooth the wobbles')).toHaveCount(0);
    await expect(page.getByLabel('Pick up faint lines')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Gaps in the line' })).toHaveCount(0);
  });

  test('an open line is closed for the student: no one is asked to join it up', async ({
    page,
  }) => {
    const nagging = /can't close|gap I can't|join the line|join it up/i;
    await page.goto('/');
    // A line that stops a fifth of the way short of meeting itself, and one that stops half way.
    for (const around of [0.8, 0.55]) {
      await page.getByRole('button', { name: 'Clear' }).click({ force: true });
      await drawEgg(page, around);
      await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
      await expect(heading(page)).toHaveText('Cut it into pieces', { timeout: 15_000 });
      await expect(page.locator('.bed-art svg.shape')).toBeVisible();
      await expect(page.locator('body')).not.toContainText(nagging);

      // Back on the pad the strokes are as the student drew them, gap and all.
      await page.getByRole('button', { name: 'Back' }).click();
      await expect(page.locator('.pad-canvas')).toBeVisible();
      await expect(page.locator('body')).not.toContainText(nagging);
    }
  });

  test('keeps the strokes when you come back to draw more', async ({ page }) => {
    await page.goto('/');
    await drawEgg(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(heading(page)).toHaveText('Cut it into pieces', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.pad-canvas')).toBeVisible();
    // The drawing is still on the pad, so the hint stays away and Next is open.
    await expect(page.getByText('Draw your animal here')).toBeHidden();
    await expect(page.getByText('Draw your animal to continue')).toBeHidden();
  });

  test('a mark too small to be an animal says so in words', async ({ page }) => {
    await page.goto('/');
    const box = (await page.locator('.pad-canvas').boundingBox())!;
    // A small dot is too tiny to be an animal.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 6, box.y + box.height / 2 + 6);
    await page.mouse.up();
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(page.locator('#notice')).toContainText("can't see a drawing", { timeout: 15_000 });
    // No outline, so the student stays on the first step.
    await expect(heading(page)).toHaveText('Draw an outline of an animal');
  });
});

test.describe('teacher options', () => {
  const openTeacher = (page: Page) => page.getByRole('button', { name: /Teacher/ }).click();

  test('start standard, say when they are not, remember them and reset', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#teacher-on')).toBeHidden();
    await openTeacher(page);
    await expect(page.getByRole('heading', { name: 'Teacher options' })).toBeVisible();
    await expect(page.locator('#t-gap-out')).toHaveText('0.30 mm');
    await expect(page.locator('#t-size-out')).toHaveText('17.0 cm');
    await expect(page.getByRole('radio', { name: 'Standard' })).toBeChecked();

    await page.locator('#t-gap').fill('0.5');
    await expect(page.locator('#t-gap-out')).toHaveText('0.50 mm');
    await page.getByRole('radio', { name: 'More' }).check();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('#teacher-on')).toBeVisible();

    // They stay after a reload.
    await page.reload();
    await expect(page.locator('#teacher-on')).toBeVisible();
    await openTeacher(page);
    await expect(page.locator('#t-gap-out')).toHaveText('0.50 mm');
    await expect(page.getByRole('radio', { name: 'More' })).toBeChecked();

    await page.getByRole('button', { name: 'Standard settings' }).click();
    await expect(page.locator('#t-gap-out')).toHaveText('0.30 mm');
    await expect(page.getByRole('radio', { name: 'Standard' })).toBeChecked();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('#teacher-on')).toBeHidden();
  });

  test('the size cap and the cut number reach the puzzle and the files', async ({ page }) => {
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();

    await openTeacher(page);
    await page.locator('#t-size').fill('8');
    await expect(page.locator('#t-size-out')).toHaveText('8.0 cm');
    await page.locator('#t-seed').fill('42');
    await page.getByRole('button', { name: 'Done' }).click();

    await page.getByRole('button', { name: 'Shuffle the cuts' }).click();
    await openTeacher(page);
    await expect(page.locator('#t-seed')).toHaveValue('43');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.locator('#animal-name').fill('Fish');

    await page.getByRole('button', { name: /Next: print it/ }).click();
    await expect(page.locator('.print-facts')).toContainText('8.0 × 5.0 cm');
    const [stl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Publish it now/ }).click(),
    ]);
    expect(stl.suggestedFilename()).toBe('Fish.stl');
  });

  test('the magnet pocket fit is a Teacher option, and the Print step counts the magnets', async ({
    page,
  }) => {
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await openTeacher(page);
    await expect(page.locator('#t-magnet-out')).toHaveText('0.20 mm');
    await page.locator('#t-magnet').fill('0.35');
    await expect(page.locator('#t-magnet-out')).toHaveText('0.35 mm');
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('#teacher-on')).toBeVisible();
    await page.getByRole('button', { name: /Next: print it/ }).click();
    // Six pieces, each with a pocket, printed three times.
    await expect(page.locator('.todo')).toContainText('6 × 2 mm magnet in each piece (18 in all)');
  });

  test('a piece too small for a magnet is said in words', async ({ page }) => {
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.getByRole('button', { name: /Teacher/ }).click();
    await page.locator('#t-size').fill('10');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.locator('#pieces').fill('16');
    await expect(page.locator('#notice')).toContainText('too small for a magnet');
  });

  test('works with the keyboard alone and closes with Escape', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Teacher/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Teacher options' })).toBeVisible();
    await page.locator('#t-gap').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#t-gap-out')).toHaveText('0.35 mm');
    await page.keyboard.press('Escape');
    await expect(page.locator('#teacher-dialog')).toBeHidden();
    // Focus goes back to the button that opened it.
    await expect(page.getByRole('button', { name: /Teacher/ })).toBeFocused();
  });
});

test.describe('gap test print', () => {
  test('the Teacher dialog gives a test STL of six closed pieces, and says what to do with it', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Teacher/ }).click();
    await expect(page.getByText(/count the notches/i)).toBeVisible();
    const [stl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download a gap test/ }).click(),
    ]);
    expect(stl.suggestedFilename()).toBe('gap-test.stl');
    const bytes = readFileSync(await stl.path());
    const triangles = bytes.readUInt32LE(80);
    expect(bytes.length).toBe(84 + triangles * 50);
    expect(triangles).toBeGreaterThan(300);
    await expect(page.locator('#t-coupon-status')).toHaveText('Saved gap-test.stl.');
  });
});

test.describe('bottom edge relief', () => {
  test('is off at first; Small makes a different, larger STL', async ({ page }) => {
    await page.goto('/');
    await drawAnimal(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.locator('#animal-name').fill('Fish');
    await page.getByRole('button', { name: /Next: print it/ }).click();
    const save = async () => {
      const [stl] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: /Publish it now/ }).click(),
      ]);
      return readFileSync(await stl.path());
    };
    const plain = await save();

    await page.getByRole('button', { name: /Teacher/ }).click();
    await expect(page.getByRole('radio', { name: 'Off' })).toBeChecked();
    await page.getByRole('radio', { name: 'Small' }).check();
    await expect(page.locator('#teacher-on')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    const relieved = await save();
    // Same puzzle, but every piece has a ledge: more triangles, and still a well-formed file.
    const triangles = relieved.readUInt32LE(80);
    expect(relieved.length).toBe(84 + triangles * 50);
    expect(triangles).toBeGreaterThan(plain.readUInt32LE(80));
    expect(Buffer.compare(plain, relieved)).not.toBe(0);

    // Back to Off gives exactly the file from the start.
    await page.getByRole('button', { name: /Teacher/ }).click();
    await page.getByRole('radio', { name: 'Off' }).check();
    await page.getByRole('button', { name: 'Done' }).click();
    expect(Buffer.compare(await save(), plain)).toBe(0);
  });
});
