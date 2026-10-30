import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { unzipSync } from 'fflate';

/**
 * The teacher's inbox page (M16e, D-049: inbox.html). In the inbox build (a pretend address,
 * .env.inbox) the tests play the inbox function themselves, including its passcode rule, so
 * nothing leaves the machine. In the normal build the page says it is not set up.
 */

test.describe.configure({ timeout: 90_000 });

const INBOX = 'https://inbox.example.test';
const PASSCODE = 'open sesame phrase';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** The names arrive from each animal's JSON file, which can be slow while the whole suite runs. */
const expectSoon = expect.configure({ timeout: 20_000 });

const isInbox = (project: string) => project === 'inbox';

interface Fake {
  files: Map<string, Buffer>;
  /** Every request to the function, with its parsed body. */
  calls: { body: Record<string, unknown> }[];
  /** Every other address that was asked for. */
  others: string[];
  state: { wrong: number; lockSeconds: number };
}

function meta(code: string, animal: string, pieces: number) {
  return JSON.stringify({
    app: 'hane-puzzle-generator',
    version: 1,
    classCode: code,
    animal,
    fileName: `${code} ${animal}.stl`,
    pieces,
    seed: 1,
    gapMm: 0.3,
    createdAt: '2026-10-30T09:30:00Z',
  });
}

function seed(): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const add = (folder: string, base: string, code: string, animal: string, pieces: number) => {
    files.set(`${folder}/${base}.stl`, Buffer.from(`solid ${base}\nendsolid ${base}\n`));
    files.set(`${folder}/${base}.png`, PNG);
    files.set(`${folder}/${base}.json`, Buffer.from(meta(code, animal, pieces)));
  };
  add('6a', '6A Big Cat', '6A', 'Big Cat', 12);
  add('6a', 'animal-1a2b3c4d', '6A', '大象', 16);
  add('6a', '6A Sneaky', '6A', '<b id="injected">Bold</b>', 8);
  add('7b', '7B Fox', '7B', 'Fox', 6);
  return files;
}

/** Plays the inbox function and its storage links. */
async function pretendInbox(page: Page): Promise<Fake> {
  const fake: Fake = { files: seed(), calls: [], others: [], state: { wrong: 0, lockSeconds: 0 } };
  const cors = { 'access-control-allow-origin': '*' };
  const send = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify(body),
    });

  await page.route(`${INBOX}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/functions/v1/inbox-admin') {
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      fake.calls.push({ body });
      const names = (folder: string) =>
        [...fake.files.keys()]
          .filter((p) => p.startsWith(`${folder}/`))
          .map((p) => p.slice(folder.length + 1));
      if (body.action === 'list' && body.folder === undefined) {
        const folders = [...new Set([...fake.files.keys()].map((p) => p.split('/')[0]!))].sort();
        return send(route, 200, {
          folders: folders.map((f) => ({
            folder: f,
            animals: new Set(names(f).map((n) => n.replace(/\.(stl|png|json)$/, ''))).size,
          })),
        });
      }
      if (body.action === 'list') {
        const folder = String(body.folder);
        const bases = [
          ...new Set(names(folder).map((n) => n.replace(/\.(stl|png|json)$/, ''))),
        ].sort();
        return send(route, 200, {
          folder,
          animals: bases.map((base) => ({
            base,
            files: Object.fromEntries(
              (['stl', 'png', 'json'] as const)
                .filter((e) => fake.files.has(`${folder}/${base}.${e}`))
                .map((e) => [e, { size: 10 }]),
            ),
            createdAt: '2026-10-30T09:30:00Z',
          })),
        });
      }
      if (body.action === 'sign') {
        const urls: Record<string, string> = {};
        for (const p of body.paths as string[]) {
          if (fake.files.has(p))
            urls[p] = `${INBOX}/storage/v1/object/sign/puzzles/${encodeURIComponent(p)}?token=t`;
        }
        return send(route, 200, { urls, expiresIn: 600 });
      }
      if (body.action === 'delete') {
        if (fake.state.lockSeconds) {
          return send(route, 429, { error: 'locked', retryAfterSeconds: fake.state.lockSeconds });
        }
        if (body.passcode !== PASSCODE) {
          fake.state.wrong++;
          return send(route, 401, { error: 'passcode' });
        }
        const folder = String(body.folder);
        const paths =
          typeof body.base === 'string'
            ? ['stl', 'png', 'json'].map((e) => `${folder}/${body.base as string}.${e}`)
            : [...fake.files.keys()].filter((p) => p.startsWith(`${folder}/`));
        let deleted = 0;
        for (const p of paths) if (fake.files.delete(p)) deleted++;
        return send(route, 200, { deleted, folder });
      }
      return send(route, 400, { error: 'action' });
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/puzzles/')) {
      const path = decodeURIComponent(url.pathname.replace('/storage/v1/object/sign/puzzles/', ''));
      const file = fake.files.get(path);
      if (!file) return route.fulfill({ status: 404, headers: cors });
      const type = path.endsWith('.png')
        ? 'image/png'
        : path.endsWith('.json')
          ? 'application/json'
          : 'model/stl';
      return route.fulfill({ status: 200, contentType: type, headers: cors, body: file });
    }
    fake.others.push(request.url());
    return route.fulfill({ status: 404, headers: cors });
  });
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname !== 'localhost' && u.origin !== INBOX) fake.others.push(r.url());
  });
  return fake;
}

const open = async (page: Page, folder?: string) => {
  await page.goto('/inbox.html');
  await expect(page.getByRole('heading', { name: 'Class inbox' })).toBeVisible();
  if (folder) {
    await page.getByRole('button', { name: new RegExp(`^${folder}`) }).click();
    await expect(page.getByRole('heading', { name: `Class ${folder}` })).toBeVisible();
  }
};
const card = (page: Page, text: string | RegExp) => page.locator('.card').filter({ hasText: text });

test('without an inbox address the page says so and asks for nothing', async ({ page }, info) => {
  test.skip(isInbox(info.project.name), 'this is the build with an inbox');
  const outside: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).hostname !== 'localhost') outside.push(r.url());
  });
  await open(page);
  await expect(page.getByRole('heading', { name: 'This inbox is not set up' })).toBeVisible();
  await page.waitForTimeout(500);
  expect(outside).toEqual([]);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'best-practice'])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});

test.describe('the inbox page (pretend inbox)', () => {
  test.beforeEach(() => {
    test.skip(!isInbox(test.info().project.name), 'needs the build with an inbox');
  });

  test('shows the classes and the puzzles with the exact names, and asks for no passcode', async ({
    page,
  }) => {
    const fake = await pretendInbox(page);
    await open(page);
    await expect(page.getByRole('button', { name: /^6a 3 animals/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^7b 1 animal/ })).toBeVisible();
    await page.getByRole('button', { name: /^6a/ }).click();
    await expect(card(page, '6A Big Cat')).toContainText('12 pieces');
    // The exact spelling comes from the JSON, not from the plain file name.
    await expect(card(page, '6A 大象')).toContainText('16 pieces');
    await expect(page.getByRole('status')).toContainText('3 animals in class 6a');
    // The picture loaded.
    await expect
      .poll(() =>
        card(page, '6A Big Cat')
          .locator('img')
          .evaluate((i: HTMLImageElement) => i.naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(card(page, '6A Big Cat').locator('img')).toHaveAttribute(
      'alt',
      'The cut pieces of 6A Big Cat',
    );
    // Only the inbox was contacted, and no passcode was asked for or sent.
    expect(fake.others).toEqual([]);
    expect(fake.calls.every((c) => !('passcode' in c.body))).toBe(true);
    await expect(page.locator('input[type="password"]')).toBeHidden();
  });

  test('a name with markup is shown as text and does nothing', async ({ page }) => {
    await pretendInbox(page);
    await open(page, '6a');
    const sneaky = card(page, /Sneaky|Bold/);
    await expect(sneaky.getByRole('heading')).toHaveText('6A <b id="injected">Bold</b>');
    await expect(page.locator('#injected')).toHaveCount(0);
  });

  test('downloads one STL under the student’s own spelling', async ({ page }) => {
    await pretendInbox(page);
    await open(page, '6a');
    await expectSoon(card(page, '6A 大象')).toBeVisible();
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      card(page, '6A Big Cat')
        .getByRole('button', { name: /Download STL/ })
        .click(),
    ]);
    expect(file.suggestedFilename()).toBe('6A Big Cat.stl');
    expect(readFileSync((await file.path())!, 'utf8')).toContain('solid 6A Big Cat');
  });

  test('ticks several and downloads a ZIP; a whole class as a ZIP too', async ({ page }) => {
    await pretendInbox(page);
    await open(page, '6a');
    await expectSoon(card(page, '6A 大象')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download ticked' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await card(page, '6A Big Cat').getByLabel(/Tick/).check();
    await card(page, '6A 大象').getByLabel(/Tick/).check();
    await expect(page.getByRole('button', { name: 'Download 2 ticked' })).toBeVisible();
    const [zip] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download 2 ticked' }).click(),
    ]);
    expect(zip.suggestedFilename()).toBe('class 6a ticked.zip');
    expect(Object.keys(unzipSync(readFileSync((await zip.path())!))).sort()).toEqual([
      '6A Big Cat.stl',
      '6A 大象.stl',
    ]);

    const [all] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download class as ZIP' }).click(),
    ]);
    expect(all.suggestedFilename()).toBe('class 6a.zip');
    expect(Object.keys(unzipSync(readFileSync((await all.path())!)))).toHaveLength(3);
  });

  test('Delete is visible with no passcode; a wrong one deletes nothing and says so', async ({
    page,
  }) => {
    const fake = await pretendInbox(page);
    await open(page, '6a');
    await card(page, '6A Big Cat')
      .getByRole('button', { name: /Delete/ })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toHaveText('Delete 6A Big Cat?');
    await expect(dialog).toContainText('3 files');
    await expect(dialog.getByRole('button', { name: 'Delete for good' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await dialog.getByLabel('Inbox passcode').fill('wrong one');
    await dialog.getByRole('button', { name: 'Delete for good' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Wrong passcode. Nothing was deleted.');
    await expect(dialog).toBeVisible();
    expect(fake.files.size).toBe(12);
    // Cancel changes nothing either.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect(fake.files.size).toBe(12);
    await expect(card(page, '6A Big Cat')).toBeVisible();
  });

  test('the right passcode deletes that animal only, then the page shows the rest', async ({
    page,
  }) => {
    const fake = await pretendInbox(page);
    await open(page, '6a');
    await expectSoon(card(page, '6A 大象')).toBeVisible();
    await card(page, '6A Big Cat')
      .getByRole('button', { name: /Delete/ })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Inbox passcode').fill(PASSCODE);
    await dialog.getByRole('button', { name: 'Delete for good' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status')).toContainText('Deleted 6A Big Cat.');
    await expect(card(page, '6A Big Cat')).toHaveCount(0);
    await expectSoon(card(page, '6A 大象')).toBeVisible();
    expect(fake.files.size).toBe(9);
    expect(fake.files.has('6a/6A Big Cat.stl')).toBe(false);
    // The deleted card's button is gone, so focus goes to the class heading, not to nowhere.
    await expect(page.locator('#folder-title')).toBeFocused();
    // The passcode was only ever sent with a delete, and is not stored in the browser.
    expect(fake.calls.filter((c) => 'passcode' in c.body)).toHaveLength(1);
    const stored = await page.evaluate(() =>
      JSON.stringify([{ ...localStorage }, { ...sessionStorage }]),
    );
    expect(stored).not.toContain(PASSCODE);
    expect(await page.evaluate(() => document.cookie)).not.toContain(PASSCODE);
  });

  test('deleting a class names it, needs its name typed, and Cancel deletes nothing', async ({
    page,
  }) => {
    const fake = await pretendInbox(page);
    await open(page, '6a');
    await expectSoon(card(page, '6A 大象')).toBeVisible();
    await page.getByRole('button', { name: 'Delete class…' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading')).toHaveText('Delete class 6a?');
    await expect(dialog).toContainText('Delete class 6a: 9 files from 3 animals');
    const go = dialog.getByRole('button', { name: 'Delete for good' });
    await dialog.getByLabel('Inbox passcode').fill(PASSCODE);
    await expect(go).toHaveAttribute('aria-disabled', 'true');
    await dialog.getByLabel('Type 6a to confirm').fill('7b');
    await expect(go).toHaveAttribute('aria-disabled', 'true');
    // A press on the greyed button is refused by the page itself (the browser would still allow it).
    await go.click({ force: true });
    await expect(dialog.getByRole('alert')).toContainText('Type 6a to confirm');
    expect(fake.files.size).toBe(12);
    expect(fake.calls.filter((c) => c.body.action === 'delete')).toHaveLength(0);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    expect(fake.files.size).toBe(12);

    await page.getByRole('button', { name: 'Delete class…' }).click();
    await dialog.getByLabel('Inbox passcode').fill(PASSCODE);
    await dialog.getByLabel('Type 6a to confirm').fill('6A');
    await expect(go).toHaveAttribute('aria-disabled', 'false');
    await go.click();
    await expect(dialog).toBeHidden();
    const sent = fake.calls.find((c) => c.body.action === 'delete')!.body;
    expect(sent).toMatchObject({ folder: '6a', confirm: '6a', expected: 9 });
    expect([...fake.files.keys()].every((p) => p.startsWith('7b/'))).toBe(true);
    await expect(page.getByRole('button', { name: /^6a/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^7b/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pick a class' })).toBeVisible();
  });

  test('a lock says how long to wait and deletes nothing', async ({ page }) => {
    const fake = await pretendInbox(page);
    fake.state.lockSeconds = 300;
    await open(page, '6a');
    await card(page, '6A Big Cat')
      .getByRole('button', { name: /Delete/ })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Inbox passcode').fill(PASSCODE);
    await dialog.getByRole('button', { name: 'Delete for good' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Try again in 5 minutes');
    await expect(dialog.getByRole('alert')).toContainText('Nothing was deleted');
    expect(fake.files.size).toBe(12);
  });

  test('the passcode is gone after a reload', async ({ page }) => {
    await pretendInbox(page);
    await open(page, '6a');
    await card(page, '6A Big Cat')
      .getByRole('button', { name: /Delete/ })
      .click();
    await page.getByLabel('Inbox passcode').fill(PASSCODE);
    await page.getByRole('button', { name: 'Delete for good' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    // Kept in memory for the next delete on this page...
    await card(page, /Bold/)
      .getByRole('button', { name: /Delete/ })
      .click();
    await expect(page.getByLabel('Inbox passcode')).toHaveValue(PASSCODE);
    await page.getByRole('button', { name: 'Cancel' }).click();
    // ...and gone on reload.
    await page.reload();
    await page.getByRole('button', { name: /^6a/ }).click();
    await card(page, '6A 大象')
      .getByRole('button', { name: /Delete/ })
      .click();
    await expect(page.getByLabel('Inbox passcode')).toHaveValue('');
  });

  for (const size of [
    { name: 'laptop', width: 1280, height: 720 },
    { name: 'phone', width: 375, height: 667 },
  ]) {
    test(`is accessible and fits on a ${size.name}, with a class open and with the question open`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await pretendInbox(page);
      await open(page, '6a');
      await expectSoon(card(page, '6A 大象')).toBeVisible();
      await expect(page.locator('.card img').first()).toHaveJSProperty('complete', true);
      const axe = () =>
        new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
          .analyze();
      expect((await axe()).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      for (const b of await page.locator('.toolbar .btn, .card .btn, .folder-btn').all()) {
        const box = (await b.boundingBox())!;
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(40);
      }
      await page.getByRole('button', { name: 'Delete class…' }).click();
      expect((await axe()).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      const box = (await page.getByRole('dialog').boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
    });
  }

  test('works with the keyboard alone', async ({ page }) => {
    const fake = await pretendInbox(page);
    await open(page, '6a');
    await expect(card(page, '6A Big Cat')).toBeVisible();
    await card(page, '6A Big Cat')
      .getByRole('button', { name: /Delete/ })
      .focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Inbox passcode')).toBeFocused();
    await page.keyboard.type(PASSCODE);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(fake.files.has('6a/6A Big Cat.stl')).toBe(false);
  });
});

/** Every file of a build, as text where it can be read. */
function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

test('neither build holds the service key, a secret key or the passcode setting', async () => {
  const dir = isInbox(test.info().project.name) ? 'node_modules/.inbox-dist' : 'dist';
  const text = [...walk(dir)]
    .filter((p) => /\.(js|html|css|json|webmanifest|svg)$/.test(p))
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n');
  expect(text.length).toBeGreaterThan(1000);
  // The inbox page is part of this build.
  expect([...walk(dir)].some((p) => p.endsWith('inbox.html'))).toBe(true);
  expect(text).not.toContain('sb_secret_');
  expect(text).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  expect(text).not.toContain('INBOX_PASSCODE');
  // No token in the build says it is a service key (a public key says "anon").
  for (const token of text.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g) ??
    []) {
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as {
      role?: string;
    };
    expect(payload.role).not.toBe('service_role');
  }
});
