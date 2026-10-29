import { readFileSync } from 'node:fs';
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
  await page.locator('#animal-name').fill('Fish');

  await page.getByRole('button', { name: /Next: print it/ }).click();
  await expect(heading(page)).toHaveText('Ready to print');

  // The print step shows honest numbers and saves a real STL.
  await expect(page.locator('.stats')).toContainText('Print time');
  const [stl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Download puzzle file/ }).click(),
  ]);
  expect(stl.suggestedFilename()).toBe('Fish.stl');
  const bytes = readFileSync(await stl.path());
  const triangles = bytes.readUInt32LE(80);
  expect(bytes.length).toBe(84 + triangles * 50);
  expect(triangles).toBeGreaterThan(100);
  await expect(page.getByRole('status')).toContainText('Saved Fish.stl');

  // One file, printed three times: the page says so, and there is no per-piece download.
  await expect(page.locator('.stats')).toContainText('in all');
  await expect(page.locator('.team-note')).toContainText('printed 3 times');
  await expect(page.getByRole('button', { name: /Download each piece/ })).toHaveCount(0);
});

test('piece count, difficulty, shuffle and animal name update the preview', async ({ page }) => {
  await page.goto('/');
  await pickSample(page);
  await page.getByRole('button', { name: /Next: make the puzzle/ }).click();

  const count = page.locator('#count-num');
  const cells = page.locator('svg.shape g path');
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
  await expect(page.locator('svg.shape g path')).toHaveCount(16);

  const before = await cells.first().getAttribute('d');
  await page.getByRole('button', { name: /Shuffle the cuts/ }).click();
  await expect.poll(async () => cells.first().getAttribute('d')).not.toBe(before);

  await page.locator('#animal-name').fill('Cat');
  await expect(page.locator('#bed-tag')).toHaveText('Cat');
  // No Colour list: the colour count line and the tan stripes already say the three colours.
  await expect(page.getByText('Colour:')).toHaveCount(0);
  await expect(page.locator('.bed-label')).toContainText('Gold');
});

test('the Puzzle step has one piece count, centred under the preview, and no extras', async ({
  page,
}) => {
  await page.goto('/');
  await pickSample(page);
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
  await pickSample(page);
  await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
  const save = async () => {
    await page.getByRole('button', { name: /Next: print it/ }).click();
    const [stl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download puzzle file/ }).click(),
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
    await pickSample(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.getByRole('button', { name: /Next: print it/ }).click();
  };
  const download = (page: Page) => page.getByRole('button', { name: /Download puzzle file/ });
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
    await pickSample(page);
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

/** Draws a fish-like outline with a marker-style line and hands it to the page as a file. */
async function uploadDrawing(page: Page, openBottom = false): Promise<void> {
  await page.evaluate(async (open) => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, 900, 600);
    ctx.strokeStyle = '#1b2a6b';
    ctx.lineWidth = 9;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(150, 300);
    ctx.bezierCurveTo(250, 130, 560, 120, 680, 290);
    ctx.lineTo(790, 200);
    ctx.lineTo(770, 300);
    ctx.lineTo(790, 400);
    ctx.lineTo(680, 320);
    if (open) {
      // The line stops half way along the belly: a gap of about a quarter of the picture.
      ctx.bezierCurveTo(600, 420, 480, 440, 400, 430);
    } else {
      ctx.bezierCurveTo(560, 480, 250, 470, 150, 300);
      ctx.closePath();
    }
    ctx.stroke();
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'fish.png', { type: 'image/png' }));
    const input = document.querySelector<HTMLInputElement>('#file')!;
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, openBottom);
}

test('a photo whose line has a big gap is closed, with the three Gaps settings', async ({
  page,
}) => {
  await page.goto('/');
  await uploadDrawing(page, true);
  await expect(page.locator('#notice')).toContainText('I closed a gap in the line', {
    timeout: 15_000,
  });
  await expect(page.locator('body')).not.toContainText(/can't close|join the line|Try Gaps/i);
  // Small and Big close it too, instead of reporting a gap.
  for (const gaps of ['Small', 'Big', 'Auto']) {
    await page.getByRole('radio', { name: gaps }).check();
    await expect(page.locator('#notice')).toContainText('I closed a gap in the line');
  }
  await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
  await expect(heading(page)).toHaveText('Cut it into pieces');
  await expect(page.locator('.bed-art svg.shape')).toBeVisible();
});

test('a photo is traced into an outline that becomes the puzzle', async ({ page }) => {
  await page.goto('/');
  await uploadDrawing(page);

  await expect(page.locator('#notice')).toContainText('Found your animal', { timeout: 15_000 });
  await expect(page.locator('svg.photo polygon')).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Gaps in the line' })).toBeVisible();

  // The tidy-up controls re-trace without leaving the page.
  await page.locator('#smooth').fill('80');
  await expect(page.locator('#notice')).toContainText('Found your animal');

  await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
  await expect(heading(page)).toHaveText('Cut it into pieces');
  await expect(page.locator('svg.shape g path')).toHaveCount(6);
  await page.getByRole('button', { name: 'More pieces' }).click();
  await expect(page.locator('svg.shape g path')).toHaveCount(7);
});

test('a blank picture gets a helpful message, not a puzzle', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, 400, 300);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'blank.png', { type: 'image/png' }));
    const input = document.querySelector<HTMLInputElement>('#file')!;
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#notice')).toContainText("can't see a drawing", { timeout: 15_000 });
  await expect(page.getByText('Pick a drawing to continue')).toBeVisible();
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

    expect(await fits(), 'step 1 before a picture').toEqual({ page: true, panel: true });
    await page.getByRole('button', { name: /Draw on screen/ }).click();
    await expect(page.locator('.pad-canvas')).toBeVisible();
    expect(await fits(), 'step 1 with the drawing pad').toEqual({ page: true, panel: true });
    await page.getByRole('button', { name: /Add a photo/ }).focus();
    await uploadDrawing(page);
    await expect(page.locator('#notice')).toContainText('Found your animal', { timeout: 15_000 });
    expect(await fits(), 'step 1 with a photo').toEqual({ page: true, panel: true });

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
          // A hidden button (Replay with Reduce motion) has no box, so only count the shown ones.
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
    await pickSample(page);
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
    await pickSample(page);
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

  test('plays once white, tan, gold, then stays gold and can be replayed', async ({ page }) => {
    await page.goto('/');
    await pickSample(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();

    // It starts all white, goes through tan (with stripes, so colour is not the only sign) and ends gold.
    await expect(tone(page, 'white').first()).toBeVisible();
    await expect.poll(async () => tone(page, 'tan').count()).toBeGreaterThan(0);
    await expect(page.locator('svg.shape pattern#tan-stripes')).toHaveCount(1);
    await expect(page.locator('#reveal-status')).toHaveText('All 6 pieces are gold.', {
      timeout: 10_000,
    });
    await expect(tone(page, 'gold')).toHaveCount(6);
    await expect(page.locator('.bed-label')).toHaveText('Gold 6 · Tan 0 · White 0');

    // It does not start again by itself; Replay does.
    await page.waitForTimeout(600);
    await expect(tone(page, 'gold')).toHaveCount(6);
    await page.getByRole('button', { name: 'Replay' }).click();
    await expect(tone(page, 'white')).toHaveCount(6);
    await expect(page.locator('.bed-label')).toHaveText('Gold 0 · Tan 0 · White 6');
    await expect(tone(page, 'gold')).toHaveCount(6, { timeout: 10_000 });
  });

  test('the piece being upgraded drifts out and back, and none is left out of place', async ({
    page,
  }) => {
    await page.goto('/');
    await pickSample(page);
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
    await pickSample(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.getByRole('button', { name: 'More pieces' }).click();
    await expect(tone(page, 'gold')).toHaveCount(7);
    await expect(tone(page, 'white')).toHaveCount(0);
  });

  test('Replay and Shuffle are in the panel, there is no hint, and Reduce motion hides Replay', async ({
    page,
  }) => {
    await page.goto('/');
    await pickSample(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    const panel = page.locator('#panel');
    await expect(panel.getByRole('button', { name: 'Replay' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Shuffle the cuts' })).toBeVisible();
    await expect(page.locator('#preview-actions')).toBeHidden();
    await expect(page.getByText('Move the slider and watch')).toHaveCount(0);

    // Turning Reduce motion on, right here, takes Replay away at once.
    await page.getByRole('button', { name: 'Comfort' }).click();
    await page.getByLabel(/Reduce motion/).check();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(panel.getByRole('button', { name: 'Replay' })).toBeHidden();
    await expect(panel.getByRole('button', { name: 'Shuffle the cuts' })).toBeVisible();
  });

  test('with Reduce motion the puzzle is gold at once and there is no Replay', async ({ page }) => {
    await page.goto('/');
    await pickSample(page);
    await page.getByRole('button', { name: 'Comfort' }).click();
    await page.getByLabel(/Reduce motion/).check();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(tone(page, 'gold')).toHaveCount(6);
    await expect(tone(page, 'white')).toHaveCount(0);
    await expect(page.locator('svg.shape .drift')).toHaveCount(0);
    await expect(page.locator('#replay')).toBeHidden();
  });
});

test.describe('the Print step shows the printer', () => {
  test.use({ reducedMotion: 'no-preference' });
  const toPrintStep = async (page: Page) => {
    await page.goto('/');
    await pickSample(page);
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
    await pickSample(page);
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
    const run = page.locator('#sim-run');
    await expect(run).toHaveText('Print 1 of 3: White', { timeout: 60_000 });
    await expect(run).toHaveText('Print 2 of 3: Tan', { timeout: 60_000 });
    await expect(run).toHaveText('Print 3 of 3: Gold', { timeout: 60_000 });
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
    await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible();
  });

  test('with reduced motion nothing starts until you press play', async ({ page }) => {
    await page.goto('/');
    await pickSample(page);
    await reduceMotion(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.getByRole('button', { name: /Next: print it/ }).click();
    const canvas = page.locator('.viewer-canvas');
    await expect(canvas).toHaveAttribute('data-sim', 'idle', { timeout: 20_000 });
    await page.waitForTimeout(500);
    await expect(canvas).toHaveAttribute('data-sim', 'idle');
    await expect(page.locator('#sim-run')).toHaveText('3 prints: white, tan, gold');
    await page.getByRole('button', { name: 'Watch it print' }).click();
    await expect(canvas).toHaveAttribute('data-sim', 'playing');
  });

  test('shows a flat gold picture when the browser has no WebGL', async ({ page }) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
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

test.describe('draw on screen', () => {
  test('a drawing becomes a puzzle, with undo, clear and friendly messages', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Draw on screen/ }).click();
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
    await page.getByRole('radio', { name: 'Thick' }).check();
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

    // Back: the picture is traced like a photo, with the wobbles smoothed as far as they go.
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.pad-canvas')).toBeHidden();
    await expect(page.locator('.bed-art svg.photo')).toBeVisible();
    await expect(page.getByRole('button', { name: /Draw on screen/ })).toContainText(
      'Tap to keep drawing',
    );
    await expect(page.getByLabel('Smooth the wobbles')).toHaveValue('100');
    await expect(page.getByLabel('Pick up faint lines')).toHaveValue('50');
  });

  test('a smoothing slider the student moved stays put when they draw more', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Draw on screen/ }).click();
    await drawEgg(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(heading(page)).toHaveText('Cut it into pieces', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByLabel('Smooth the wobbles').fill('60');
    // Keep drawing, then carry on: the student's 60 is not put back to 100.
    await page.getByRole('button', { name: /Draw on screen/ }).click();
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(heading(page)).toHaveText('Cut it into pieces', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByLabel('Smooth the wobbles')).toHaveValue('60');
  });

  test('an open line is closed for the student: no one is asked to join it up', async ({
    page,
  }) => {
    const nagging = /can't close|gap I can't|join the line|join it up/i;
    await page.goto('/');
    await page.getByRole('button', { name: /Draw on screen/ }).click();
    // A line that stops a fifth of the way short of meeting itself, and one that stops half way.
    for (const around of [0.8, 0.55]) {
      await page.getByRole('button', { name: 'Clear' }).click({ force: true });
      await drawEgg(page, around);
      await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
      await expect(heading(page)).toHaveText('Cut it into pieces', { timeout: 15_000 });
      await expect(page.locator('.bed-art svg.shape')).toBeVisible();
      await expect(page.locator('body')).not.toContainText(nagging);

      // Back on the first step the picture was traced, the gap closed, and the student is told.
      await page.getByRole('button', { name: 'Back' }).click();
      await expect(page.locator('#notice')).toContainText('I closed a gap in the line');
      await expect(page.locator('body')).not.toContainText(nagging);
      await page.getByRole('button', { name: /Draw on screen/ }).click();
    }
  });

  test('keeps the strokes when you come back to draw more', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Draw on screen/ }).click();
    await drawEgg(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(heading(page)).toHaveText('Cut it into pieces', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: /Draw on screen/ }).click();
    await expect(page.locator('.pad-canvas')).toBeVisible();
    // The drawing is still on the pad, so the hint stays away and Next is open.
    await expect(page.getByText('Draw your animal here')).toBeHidden();
    await expect(page.getByText('Draw your animal to continue')).toBeHidden();
  });

  test('a line with a gap says so in words that fit a drawing', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Draw on screen/ }).click();
    const box = (await page.locator('.pad-canvas').boundingBox())!;
    // A small dot is too tiny to be an animal.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 6, box.y + box.height / 2 + 6);
    await page.mouse.up();
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(page.locator('#notice')).toContainText('Tap Draw on screen', { timeout: 15_000 });
    // No outline, so the student stays on the first step.
    await expect(heading(page)).toHaveText('Pick your animal');
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
    await pickSample(page);
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
    await expect(page.locator('.stats')).toContainText('8.0 × 3.9 cm');
    const [stl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download puzzle file/ }).click(),
    ]);
    expect(stl.suggestedFilename()).toBe('Fish.stl');
  });

  test('the magnet pocket fit is a Teacher option, and the Print step counts the magnets', async ({
    page,
  }) => {
    await page.goto('/');
    await pickSample(page);
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
    await pickSample(page);
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

test.describe('straighten the picture', () => {
  const cornerX = async (page: Page, name: RegExp) =>
    Number(await page.getByRole('button', { name }).getAttribute('cx'));

  test('four corners to drag, by mouse or keys, then a straight picture is traced', async ({
    page,
  }) => {
    await page.goto('/');
    await uploadDrawing(page);
    await expect(page.locator('#notice')).toContainText('Found your animal', { timeout: 15_000 });
    const before = await page.locator('.bed-art image').getAttribute('href');

    await page.getByRole('button', { name: 'Straighten the picture' }).click();
    await expect(page.locator('.corner')).toHaveCount(4);
    await expect(page.getByText('Finish the picture to continue')).toBeVisible();
    await expect(page.getByText('Smooth the wobbles')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Use the camera' })).toBeHidden();

    // Keys: arrow keys move the focused corner; Shift moves it further.
    const topLeft = page.getByRole('button', { name: /Top left corner/ });
    const x0 = await cornerX(page, /Top left corner/);
    await topLeft.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const x1 = await cornerX(page, /Top left corner/);
    expect(x1).toBeGreaterThan(x0);
    await page.keyboard.press('Shift+ArrowRight');
    expect((await cornerX(page, /Top left corner/)) - x1).toBeGreaterThan(x1 - x0);

    // Mouse: drag the bottom right corner up and to the left.
    const bottomRight = page.getByRole('button', { name: /Bottom right corner/ });
    const startX = await cornerX(page, /Bottom right corner/);
    const box = (await bottomRight.boundingBox())!;
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 30, cy - 20, { steps: 6 });
    await page.mouse.up();
    expect(await cornerX(page, /Bottom right corner/)).toBeLessThan(startX);

    // Crossing the corners over is refused, kindly.
    for (let i = 0; i < 80; i++) await page.keyboard.press('Shift+ArrowRight');
    await page.getByRole('button', { name: /Top left corner/ }).focus();
    for (let i = 0; i < 60; i++) await page.keyboard.press('Shift+ArrowRight');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('#notice')).toContainText('cross over');
    await expect(page.locator('.corner')).toHaveCount(4);

    // Reset, apply: the picture is replaced by a straightened one and traced again.
    await page.getByRole('button', { name: 'Reset corners' }).click();
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('#notice')).toContainText('Found your animal', { timeout: 15_000 });
    await expect(page.locator('.corner')).toHaveCount(0);
    expect(await page.locator('.bed-art image').getAttribute('href')).not.toBe(before);
    await expect(page.getByText('Smooth the wobbles')).toBeVisible();
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await expect(heading(page)).toHaveText('Cut it into pieces');
  });

  test('cancel leaves the photo as it was, and only a photo can be straightened', async ({
    page,
  }) => {
    await page.goto('/');
    await pickSample(page);
    await expect(page.getByRole('button', { name: 'Straighten the picture' })).toBeHidden();
    await uploadDrawing(page);
    await expect(page.locator('#notice')).toContainText('Found your animal', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Straighten the picture' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.corner')).toHaveCount(0);
    await expect(page.locator('#notice')).toContainText('Found your animal');
    await expect(page.getByText('Pick a drawing to continue')).toBeHidden();
  });
});

test.describe('camera', () => {
  test.use({ permissions: ['camera'] });

  const streamOff = (page: Page) =>
    page.evaluate(() => (document.querySelector('#camera') as HTMLVideoElement).srcObject === null);

  test('shows the camera, takes a photo, and turns the camera off', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Use the camera' }).click();
    await expect(page.locator('#camera')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => (document.querySelector('#camera') as HTMLVideoElement).videoWidth),
      )
      .toBeGreaterThan(0);
    await expect(page.locator('#notice')).toContainText('Hold your drawing up to the camera');
    await expect(page.getByText('Finish the picture to continue')).toBeVisible();

    await page.getByRole('button', { name: 'Take photo' }).click();
    await expect(page.locator('#camera')).toBeHidden();
    await expect(page.locator('.bed-art svg.photo')).toBeVisible();
    expect(await streamOff(page)).toBe(true);
    // A photo from the camera goes the same way as any photo: the notice says what was found.
    await expect(page.locator('#notice')).not.toContainText('camera');
    await expect(page.getByRole('button', { name: 'Use the camera' })).toBeVisible();
  });

  test('cancel turns the camera off and leaves the page as it was', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Use the camera' }).click();
    await expect(page.locator('#camera')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('#camera')).toBeHidden();
    expect(await streamOff(page)).toBe(true);
    await expect(page.getByRole('button', { name: /Add a photo/ })).toBeVisible();
  });

  test('picking something else while the camera is on turns it off', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Use the camera' }).click();
    await expect(page.locator('#camera')).toBeVisible();
    await pickSample(page);
    await expect(page.locator('#camera')).toBeHidden();
    expect(await streamOff(page)).toBe(true);
    await expect(page.locator('#notice')).toContainText('Nice choice');
  });
});

test.describe('camera that cannot be used', () => {
  test('says so in plain words and the photo option still works', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('no', 'NotAllowedError'));
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Use the camera' }).click();
    await expect(page.locator('#notice')).toContainText("can't use the camera");
    await expect(page.locator('#notice')).toContainText('add a photo instead');
    await expect(page.locator('#camera')).toBeHidden();
    await expect(page.getByRole('button', { name: /Add a photo/ })).toBeVisible();
    await uploadDrawing(page);
    await expect(page.locator('#notice')).toContainText('Found your animal', { timeout: 15_000 });
  });

  test('is not offered when the browser has no camera support', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined });
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Add a photo/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use the camera' })).toBeHidden();
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
    await pickSample(page);
    await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
    await page.locator('#animal-name').fill('Fish');
    await page.getByRole('button', { name: /Next: print it/ }).click();
    const save = async () => {
      const [stl] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: /Download puzzle file/ }).click(),
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
