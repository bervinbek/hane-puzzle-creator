import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The class inbox (D-049), in the build made with a pretend inbox address (.env.inbox). The tests
 * answer every request to that address themselves, so nothing leaves the machine.
 */

test.describe.configure({ timeout: 90_000 });

const INBOX = 'https://inbox.example.test';
const KEY_RULE = /^[a-z0-9_-]{1,24}\/[A-Za-z0-9._() +-]{1,100}\.(stl|png|json)$/;

interface Sent {
  /** The key inside the "puzzles" bucket, as decoded text. */
  key: string;
  type: string | null;
  apikey: string | null;
  body: Buffer;
}

/** A pretend inbox that only adds: a name that is taken answers "already exists". */
async function pretendInbox(page: Page, mode: { down: boolean } = { down: false }) {
  const taken = new Set<string>();
  const sent: Sent[] = [];
  await page.route(`${INBOX}/**`, async (route: Route) => {
    const request = route.request();
    if (mode.down) return route.abort('internetdisconnected');
    const url = new URL(request.url());
    const key = decodeURIComponent(url.pathname.replace('/storage/v1/object/puzzles/', ''));
    if (taken.has(key)) {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: '409', code: 'KeyAlreadyExists' }),
      });
    }
    taken.add(key);
    sent.push({
      key,
      type: request.headers()['content-type'] ?? null,
      apikey: request.headers()['apikey'] ?? null,
      body: request.postDataBuffer() ?? Buffer.alloc(0),
    });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  return { sent, taken };
}

/** Every address the page asks for that is not the page itself. */
function watchOutside(page: Page): string[] {
  const outside: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.hostname !== 'localhost' && url.protocol.startsWith('http')) outside.push(r.url());
  });
  return outside;
}

const toPrint = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Use the sample fish/ }).click();
  await page.getByRole('button', { name: /Next: make the puzzle/ }).click();
  await page.getByRole('button', { name: /Next: print it/ }).click();
};
const download = (page: Page) => page.getByRole('button', { name: /Download puzzle file/ });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Download your puzzle' });
const sendButton = (page: Page) =>
  page.getByRole('dialog', { name: 'Download your puzzle' }).getByRole('button', {
    name: 'Download and send',
  });

/** Fills the dialog and presses Download and send; returns the saved file. */
async function sendOne(page: Page, code: string, animal: string) {
  await download(page).click();
  await dialog(page).getByLabel('Class code').fill(code);
  await dialog(page).getByLabel('Animal name').fill(animal);
  const [file] = await Promise.all([page.waitForEvent('download'), sendButton(page).click()]);
  return file;
}

test('nothing is sent until Download and send is pressed', async ({ page }) => {
  const outside = watchOutside(page);
  const { sent } = await pretendInbox(page);
  await toPrint(page);
  await page.waitForTimeout(800);
  expect(sent).toEqual([]);
  expect(outside).toEqual([]);

  // Cancel sends nothing either.
  await download(page).click();
  await dialog(page).getByLabel('Class code').fill('6A');
  await dialog(page).getByLabel('Animal name').fill('Big Cat');
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(800);
  expect(sent).toEqual([]);
  expect(outside).toEqual([]);
});

test('Download asks for the class code, then saves and sends the STL, a picture and a JSON', async ({
  page,
}) => {
  const outside = watchOutside(page);
  const { sent } = await pretendInbox(page);
  await toPrint(page);
  await download(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator('#code-input')).toBeFocused();
  await expect(sendButton(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(dialog(page)).toContainText('saved online for your teacher');

  // Both boxes are needed, and the file name shows live.
  await dialog(page).getByLabel('Class code').fill('6A');
  await expect(sendButton(page)).toHaveAttribute('aria-disabled', 'true');
  await dialog(page).getByLabel('Animal name').fill('Big Cat');
  await expect(page.locator('#name-file')).toHaveText('6A Big Cat.stl');
  await expect(sendButton(page)).toHaveAttribute('aria-disabled', 'false');

  const [file] = await Promise.all([page.waitForEvent('download'), sendButton(page).click()]);
  expect(file.suggestedFilename()).toBe('6A Big Cat.stl');
  await expect(page.getByRole('status').filter({ hasText: 'Sent to your teacher.' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('#next-help')).toHaveText('6A Big Cat.stl');

  // Three files in the class folder, named alike, with the public key.
  expect(sent.map((s) => s.key)).toEqual([
    '6a/6A Big Cat.stl',
    '6a/6A Big Cat.png',
    '6a/6A Big Cat.json',
  ]);
  expect(sent.map((s) => s.type)).toEqual(['model/stl', 'image/png', 'application/json']);
  for (const s of sent) {
    expect(s.key).toMatch(KEY_RULE);
    expect(s.apikey).toBe('test-public-key');
  }

  // The STL sent is the file saved, byte for byte.
  const saved = readFileSync((await file.path())!);
  expect(sent[0]!.body.equals(saved)).toBe(true);
  // The picture is a real PNG; the JSON holds the exact words and nothing else.
  expect([...sent[1]!.body.subarray(0, 8)]).toEqual([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const json = JSON.parse(sent[2]!.body.toString('utf8')) as Record<string, unknown>;
  expect(json).toMatchObject({
    app: 'hane-puzzle-generator',
    classCode: '6A',
    animal: 'Big Cat',
    fileName: '6A Big Cat.stl',
  });
  expect(Object.keys(json).sort()).toEqual(
    [
      'animal',
      'app',
      'classCode',
      'createdAt',
      'fileName',
      'gapMm',
      'pieces',
      'seed',
      'version',
    ].sort(),
  );

  // The only outside address is the inbox, and no picture of the drawing went anywhere.
  expect(new Set(outside.map((u) => new URL(u).origin))).toEqual(new Set([INBOX]));
  expect(outside.every((u) => u.includes('/storage/v1/object/puzzles/'))).toBe(true);
});

test('the class code is remembered, and "6A" and " 6 a " are one folder', async ({ page }) => {
  const { sent } = await pretendInbox(page);
  await toPrint(page);
  await sendOne(page, '6A', 'Big Cat');
  await expect(page.getByRole('status').filter({ hasText: 'Sent to your teacher.' })).toBeVisible({
    timeout: 20_000,
  });

  // Download opens the dialog again every time, with the code and the name filled in.
  await download(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByLabel('Class code')).toHaveValue('6A');
  await expect(dialog(page).getByLabel('Animal name')).toHaveValue('Big Cat');
  await expect(page.locator('#name-input')).toBeFocused();
  // " 6 a " is the same class: the same folder.
  await dialog(page).getByLabel('Class code').fill(' 6 a ');
  await expect(page.locator('#name-file')).toHaveText('6 a Big Cat.stl');
  const [file] = await Promise.all([page.waitForEvent('download'), sendButton(page).click()]);
  expect(file.suggestedFilename()).toBe('6 a Big Cat.stl');
  await expect(page.getByRole('status').filter({ hasText: 'Sent to your teacher.' })).toBeVisible({
    timeout: 20_000,
  });
  expect(sent.map((s) => s.key)).toEqual([
    '6a/6A Big Cat.stl',
    '6a/6A Big Cat.png',
    '6a/6A Big Cat.json',
    // The second set: the first name was taken, so the whole set moved to (2).
    '6a/6 a Big Cat.stl',
    '6a/6 a Big Cat.png',
    '6a/6 a Big Cat.json',
  ]);
});

test('a name already taken in the folder moves the whole set to (2)', async ({ page }) => {
  const { sent } = await pretendInbox(page);
  await toPrint(page);
  await sendOne(page, '6A', 'Big Cat');
  await expect(page.getByRole('status').filter({ hasText: 'Sent to your teacher.' })).toBeVisible({
    timeout: 20_000,
  });
  await sendOne(page, '6A', 'Big Cat');
  await expect(page.getByRole('status').filter({ hasText: 'Sent to your teacher.' })).toBeVisible({
    timeout: 20_000,
  });
  expect(sent.map((s) => s.key).slice(3)).toEqual([
    '6a/6A Big Cat (2).stl',
    '6a/6A Big Cat (2).png',
    '6a/6A Big Cat (2).json',
  ]);
});

test('a name in another language is saved as typed, with plain keys in the inbox', async ({
  page,
}) => {
  const { sent } = await pretendInbox(page);
  await toPrint(page);
  const file = await sendOne(page, '六年级', '大象');
  expect(file.suggestedFilename()).toBe('六年级 大象.stl');
  await expect(page.getByRole('status').filter({ hasText: 'Sent to your teacher.' })).toBeVisible({
    timeout: 20_000,
  });
  expect(sent).toHaveLength(3);
  for (const s of sent) expect(s.key).toMatch(KEY_RULE);
  const json = JSON.parse(sent[2]!.body.toString('utf8')) as Record<string, string>;
  expect(json.classCode).toBe('六年级');
  expect(json.animal).toBe('大象');
});

test('with no connection the file still saves, and Send again finishes the job', async ({
  page,
}) => {
  const mode = { down: true };
  const { sent } = await pretendInbox(page, mode);
  await toPrint(page);
  const file = await sendOne(page, '6A', 'Big Cat');
  expect(file.suggestedFilename()).toBe('6A Big Cat.stl');
  const status = page.getByRole('status').filter({ hasText: 'Not sent' });
  await expect(status).toBeVisible();
  expect(sent).toEqual([]);

  mode.down = false;
  await page.getByRole('button', { name: 'Send again' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sent to your teacher.' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('button', { name: 'Send again' })).toBeHidden();
  expect(sent.map((s) => s.key)).toEqual([
    '6a/6A Big Cat.stl',
    '6a/6A Big Cat.png',
    '6a/6A Big Cat.json',
  ]);
});

test('symbols are not a class code or a name, and Enter and Escape work', async ({ page }) => {
  const { sent } = await pretendInbox(page);
  await toPrint(page);
  await download(page).click();
  await dialog(page).getByLabel('Class code').fill('!!!');
  await expect(
    dialog(page).getByText('Use some letters or numbers in the class code.'),
  ).toBeVisible();
  await dialog(page).getByLabel('Class code').fill('6A');
  await dialog(page).getByLabel('Animal name').fill('???');
  await expect(
    dialog(page).getByText('Use some letters or numbers.', { exact: true }),
  ).toBeVisible();
  await sendButton(page).click({ force: true });
  await expect(dialog(page)).toBeVisible();
  expect(sent).toEqual([]);

  // Enter in a box saves when both are usable.
  await dialog(page).getByLabel('Animal name').fill('Zebra');
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    dialog(page).getByLabel('Animal name').press('Enter'),
  ]);
  expect(file.suggestedFilename()).toBe('6A Zebra.stl');

  await download(page).click();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(download(page)).toBeFocused();
});

for (const size of [
  { name: 'laptop', width: 1280, height: 720 },
  { name: 'phone', width: 375, height: 667 },
]) {
  test(`the Download dialog is accessible and fits on a ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await pretendInbox(page);
    await toPrint(page);
    await download(page).click();
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByLabel('Class code').fill('!!!');
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
    const box = (await dialog(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    for (const button of await dialog(page).getByRole('button').all()) {
      const b = (await button.boundingBox())!;
      expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(40);
    }
  });
}

const LAPTOPS = [
  { name: 'small laptop 1280x600', width: 1280, height: 600 },
  { name: 'common laptop 1366x657', width: 1366, height: 657 },
  { name: 'large laptop 1536x730', width: 1536, height: 730 },
  { name: 'tablet landscape 1024x690', width: 1024, height: 690 },
];

for (const size of LAPTOPS) {
  test(`laptop window (${size.name}): the Print step still fits with the longest send message and Send again`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await pretendInbox(page, { down: true });
    await toPrint(page);
    await sendOne(page, 'Class 6A', 'Big Cat');
    await expect(page.getByRole('button', { name: 'Send again' })).toBeVisible();
    const fits = await page.evaluate(() => ({
      page: document.documentElement.scrollHeight <= window.innerHeight + 1,
      panel:
        document.querySelector('#panel')!.scrollHeight <=
        document.querySelector('#panel')!.clientHeight + 1,
    }));
    expect(fits).toEqual({ page: true, panel: true });
  });
}
