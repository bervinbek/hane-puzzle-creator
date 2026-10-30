import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOCK_AFTER,
  LOCK_WINDOW_MS,
  MIN_PASSCODE,
  groupAnimals,
  handle,
  restAttempts,
  restStore,
  sameText,
  splitName,
  type Attempts,
  type Deps,
  type Failure,
  type Store,
} from '../inbox/functions/inbox-admin';

const PASSCODE = 'correct horse battery';
const URL = 'https://proj.example.test';

/** A storage that keeps files in a map, and remembers every path it was asked to remove. */
function fakeStore(initial: string[]) {
  const files = new Map<string, { size: number; createdAt: string }>();
  initial.forEach((p, i) =>
    files.set(p, { size: 100 + i, createdAt: `2026-10-30T0${i % 10}:00:00Z` }),
  );
  const removed: string[][] = [];
  const store: Store = {
    async folders() {
      return [...new Set([...files.keys()].map((p) => p.split('/')[0]!))];
    },
    async files(folder) {
      return [...files.entries()]
        .filter(([p]) => p.startsWith(`${folder}/`))
        .map(([p, v]) => ({ name: p.slice(folder.length + 1), ...v }));
    },
    async sign(paths) {
      const out: Record<string, string> = {};
      for (const p of paths)
        if (files.has(p)) out[p] = `https://signed.example.test/${encodeURIComponent(p)}`;
      return out;
    },
    async remove(paths) {
      removed.push(paths);
      let n = 0;
      for (const p of paths) if (files.delete(p)) n++;
      return n;
    },
  };
  return { store, files, removed };
}

/** An attempts table in memory. */
function fakeAttempts() {
  const rows: (Failure & { ok: false })[] = [];
  let next = 1;
  const attempts: Attempts = {
    async recentFailures(since, limit) {
      return rows
        .filter((r) => r.at >= since)
        .sort((a, b) => b.at.getTime() - a.at.getTime() || Number(b.id) - Number(a.id))
        .slice(0, limit)
        .map(({ id, at }) => ({ id, at }));
    },
    async recordFailure(at) {
      const id = next++;
      rows.push({ id, at, ok: false });
      return id;
    },
    async forget(id) {
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
    async clearFailures() {
      rows.length = 0;
    },
    async purgeBefore(before) {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.at < before) rows.splice(i, 1);
    },
  };
  return { attempts, rows };
}

const FILES = [
  '6a/6A Big Cat.stl',
  '6a/6A Big Cat.png',
  '6a/6A Big Cat.json',
  '6a/6A Big Cat (2).stl',
  '6a/6A Big Cat (2).png',
  '6a/6A Big Cat (2).json',
  '6a/6A Catfish.stl',
  '6a/6A Catfish.png',
  '6a/6A Catfish.json',
  '7b/7B Fox.stl',
  '7b/7B Fox.png',
  '7b/7B Fox.json',
];

function setup(options: { passcode?: string | undefined; clock?: { t: number } } = {}) {
  const s = fakeStore(FILES);
  const a = fakeAttempts();
  const clock = options.clock ?? { t: Date.parse('2026-10-30T12:00:00Z') };
  const deps: Deps = {
    store: s.store,
    attempts: a.attempts,
    passcode: 'passcode' in options ? options.passcode : PASSCODE,
    now: () => new Date(clock.t),
  };
  const call = (body: unknown, init: RequestInit = {}) =>
    handle(
      new Request('https://f.example.test/inbox-admin', {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
        ...init,
      }),
      deps,
    );
  return { ...s, ...a, deps, clock, call };
}

const json = async (r: Response) => (await r.json()) as Record<string, unknown>;
const deleteOne = (over: Record<string, unknown> = {}) => ({
  action: 'delete',
  passcode: PASSCODE,
  folder: '6a',
  base: '6A Big Cat',
  confirm: '6a',
  ...over,
});
const deleteClass = (over: Record<string, unknown> = {}) => ({
  action: 'delete',
  passcode: PASSCODE,
  folder: '6a',
  confirm: '6a',
  expected: 9,
  ...over,
});

afterEach(() => vi.restoreAllMocks());

describe('list and sign need no passcode', () => {
  it('lists the class folders with how many animals each holds', async () => {
    const t = setup();
    const res = await t.call({ action: 'list' });
    expect(res.status).toBe(200);
    expect((await json(res)).folders).toEqual([
      { folder: '6a', animals: 3 },
      { folder: '7b', animals: 1 },
    ]);
  });

  it('lists the animals of one folder, three files each', async () => {
    const t = setup();
    const body = await json(await t.call({ action: 'list', folder: '6a' }));
    const animals = body.animals as { base: string; files: Record<string, unknown> }[];
    expect(animals.map((a) => a.base)).toEqual(['6A Big Cat', '6A Big Cat (2)', '6A Catfish']);
    for (const a of animals) expect(Object.keys(a.files).sort()).toEqual(['json', 'png', 'stl']);
  });

  it.each(['', 'A', '../x', '6a/', 'x'.repeat(25), 5, null, ['6a'], { folder: '6a' }])(
    'refuses %j as a folder',
    async (folder) => {
      const t = setup();
      expect((await t.call({ action: 'list', folder })).status).toBe(400);
    },
  );

  it('gives short links for files that exist, and only for allowed paths', async () => {
    const t = setup();
    const res = await t.call({
      action: 'sign',
      paths: ['6a/6A Big Cat.stl', '6a/6A Big Cat.stl', '6a/none.png'],
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Object.keys(body.urls as object)).toEqual(['6a/6A Big Cat.stl']);
    expect(body.expiresIn).toBe(600);
  });

  it.each([
    [['../etc/passwd']],
    [['6a/../7b/7B Fox.stl']],
    [['6A/6A Big Cat.stl']],
    [['6a/sub/x.stl']],
    [['6a/6A Big Cat.exe']],
    [['6a/6A Big Cat.stl\n']],
    [['/6a/6A Big Cat.stl']],
    [[['6a/6A Big Cat.stl']]],
    [[5]],
    [[]],
    ['6a/6A Big Cat.stl'],
    [Array.from({ length: 101 }, () => '6a/6A Big Cat.stl')],
  ])('refuses paths %j', async (paths) => {
    const t = setup();
    expect((await t.call({ action: 'sign', paths })).status).toBe(400);
  });
});

describe('deleting needs the passcode', () => {
  it.each([
    ['none', undefined],
    ['empty', ''],
    ['wrong', 'wrong guess here'],
    ['a number', 12345678],
    ['an array', [PASSCODE]],
    ['an object', { v: PASSCODE }],
    ['null', null],
    ['true', true],
    ['too long', 'x'.repeat(5000)],
    ['the right one with a space', `${PASSCODE} `],
  ])('refuses %s and deletes nothing', async (_name, passcode) => {
    const t = setup();
    const res = await t.call(deleteOne({ passcode }));
    expect(res.status).toBe(401);
    expect(t.removed).toEqual([]);
    expect(t.files.size).toBe(FILES.length);
  });

  it('is switched off when no passcode is set, or an empty or short one', async () => {
    for (const passcode of [undefined, '', 'a'.repeat(MIN_PASSCODE - 1)]) {
      const t = setup({ passcode });
      // Even an empty guess must not match an empty setting.
      for (const given of ['', passcode ?? 'x']) {
        const res = await t.call(deleteOne({ passcode: given }));
        expect(res.status).toBe(503);
      }
      expect(t.removed).toEqual([]);
    }
  });

  it('deletes exactly the three files of one animal and nothing else', async () => {
    const t = setup();
    const res = await t.call(deleteOne());
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ deleted: 3, folder: '6a', base: '6A Big Cat' });
    expect(t.removed).toEqual([['6a/6A Big Cat.stl', '6a/6A Big Cat.png', '6a/6A Big Cat.json']]);
    // The same name with (2), and a name that merely starts alike, are untouched.
    expect(t.files.has('6a/6A Big Cat (2).stl')).toBe(true);
    expect(t.files.has('6a/6A Catfish.stl')).toBe(true);
    expect(t.files.size).toBe(FILES.length - 3);
  });

  it('counts only what was really removed', async () => {
    const t = setup();
    const res = await t.call(deleteOne({ base: 'Not There' }));
    expect(await json(res)).toMatchObject({ deleted: 0 });
  });

  it.each([
    '',
    null,
    [],
    {},
    5,
    '../x',
    'a/b',
    '6A Big Cat/../../7b/7B Fox',
    'x'.repeat(101),
    '6A\nCat',
  ])('never turns base %j into a class delete or a path outside the folder', async (base) => {
    const t = setup();
    const res = await t.call(deleteOne({ base }));
    expect(res.status).toBe(400);
    expect(t.removed).toEqual([]);
    expect(t.files.size).toBe(FILES.length);
  });

  it('treats a base that ends in an extension as just a name (exact paths only)', async () => {
    const t = setup();
    await t.call(deleteOne({ base: '6A Big Cat.stl' }));
    expect(t.removed).toEqual([
      ['6a/6A Big Cat.stl.stl', '6a/6A Big Cat.stl.png', '6a/6A Big Cat.stl.json'],
    ]);
    expect(t.files.has('6a/6A Big Cat.stl')).toBe(true);
  });

  it('needs the class name typed back, and a wrong one is not a wrong passcode', async () => {
    const t = setup();
    for (const confirm of [undefined, '', '7b', '6A', 6]) {
      expect((await t.call(deleteOne({ confirm }))).status).toBe(400);
    }
    expect(t.rows).toEqual([]);
    expect(t.removed).toEqual([]);
  });

  it('deletes a whole class only if it still has the files that were shown', async () => {
    const t = setup();
    expect((await t.call(deleteClass({ expected: undefined }))).status).toBe(400);
    expect((await t.call(deleteClass({ expected: '9' }))).status).toBe(400);
    const stale = await t.call(deleteClass({ expected: 6 }));
    expect(stale.status).toBe(409);
    expect(await json(stale)).toMatchObject({ found: 9 });
    expect(t.removed).toEqual([]);

    const res = await t.call(deleteClass());
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ deleted: 9, folder: '6a', remaining: 0 });
    expect([...t.files.keys()].every((p) => p.startsWith('7b/'))).toBe(true);
  });

  it('removes a big class in chunks', async () => {
    const many = Array.from({ length: 250 }, (_, i) => `big/b${i}.stl`);
    const s = fakeStore(many);
    const a = fakeAttempts();
    const deps: Deps = {
      store: s.store,
      attempts: a.attempts,
      passcode: PASSCODE,
      now: () => new Date(),
    };
    const res = await handle(
      new Request('https://f.example.test/', {
        method: 'POST',
        body: JSON.stringify({
          action: 'delete',
          passcode: PASSCODE,
          folder: 'big',
          confirm: 'big',
          expected: 250,
        }),
      }),
      deps,
    );
    expect(await json(res)).toMatchObject({ deleted: 250, remaining: 0 });
    expect(s.removed.map((c) => c.length)).toEqual([100, 100, 50]);
  });
});

describe('the lock after wrong passcodes', () => {
  const wrong = (t: ReturnType<typeof setup>) =>
    t.call(deleteOne({ passcode: 'not the passcode' }));

  it('locks after five wrong tries, even for the right passcode, and says how long', async () => {
    const t = setup();
    for (let i = 0; i < LOCK_AFTER; i++) expect((await wrong(t)).status).toBe(401);
    const locked = await t.call(deleteOne());
    expect(locked.status).toBe(429);
    const body = await json(locked);
    expect(body.retryAfterSeconds).toBe(LOCK_WINDOW_MS / 1000);
    expect(t.removed).toEqual([]);
    // Refused tries are not written down, so they do not lengthen the lock.
    expect(t.rows).toHaveLength(LOCK_AFTER);
  });

  it('opens again once the oldest wrong try is older than the window', async () => {
    const t = setup();
    for (let i = 0; i < LOCK_AFTER; i++) {
      await wrong(t);
      t.clock.t += 60_000;
    }
    expect((await t.call(deleteOne())).status).toBe(429);
    t.clock.t += LOCK_WINDOW_MS - 5 * 60_000 + 1000;
    expect((await t.call(deleteOne())).status).toBe(200);
  });

  it('a right passcode clears the earlier wrong tries', async () => {
    const t = setup();
    for (let i = 0; i < LOCK_AFTER - 1; i++) await wrong(t);
    expect((await t.call(deleteOne())).status).toBe(200);
    expect(t.rows).toEqual([]);
    for (let i = 0; i < LOCK_AFTER - 1; i++) expect((await wrong(t)).status).toBe(401);
  });

  it('a burst of parallel tries cannot get more than five comparisons in all', async () => {
    const t = setup();
    const replies = await Promise.all(Array.from({ length: 25 }, () => wrong(t)));
    const compared = replies.filter((r) => r.status === 401).length;
    const locked = replies.filter((r) => r.status === 429).length;
    expect(compared).toBeLessThanOrEqual(LOCK_AFTER);
    expect(compared + locked).toBe(25);
    // Every comparison that happened is written down; refused tries leave nothing behind.
    expect(t.rows).toHaveLength(compared);
    // Keep guessing one by one: the five comparisons are shared between the burst and these.
    let more = 0;
    for (let i = 0; i < 10; i++) if ((await wrong(t)).status === 401) more++;
    expect(compared + more).toBe(LOCK_AFTER);
    expect((await t.call(deleteOne())).status).toBe(429);
  });

  it('refuses everything (and deletes nothing) when the attempts table cannot be used', async () => {
    const t = setup();
    t.deps.attempts = {
      ...t.attempts,
      async recordFailure() {
        throw new Error('database down');
      },
    };
    const res = await t.call(deleteOne());
    expect(res.status).toBe(500);
    expect(t.removed).toEqual([]);
    expect(JSON.stringify(await json(res))).not.toContain('database down');
  });
});

describe('what the replies say', () => {
  it('never contains the passcode, a guess or the request, and nothing is logged', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m),
    );
    const t = setup();
    const guess = 'a very secret guess';
    const replies = [
      await t.call(deleteOne({ passcode: guess })),
      await t.call(deleteOne()),
      await t.call(deleteOne({ passcode: PASSCODE, base: 5 })),
      await t.call({ action: 'nope', passcode: PASSCODE }),
      await t.call('{not json'),
    ];
    for (let i = 0; i < LOCK_AFTER; i++) replies.push(await t.call(deleteOne({ passcode: guess })));
    replies.push(await t.call(deleteOne({ passcode: PASSCODE, base: '6A Catfish' })));
    for (const r of replies) {
      const text = await r.text();
      expect(text).not.toContain(PASSCODE);
      expect(text).not.toContain(guess);
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('shows no storage error text', async () => {
    const t = setup();
    t.deps.store = {
      ...t.store,
      async files() {
        throw new Error('secret-internal-detail');
      },
    };
    const res = await t.call({ action: 'list', folder: '6a' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await json(res))).not.toContain('secret-internal-detail');
  });

  it('answers the browser check and puts the allow headers on every reply', async () => {
    const t = setup();
    const pre = await handle(new Request('https://f.example.test/', { method: 'OPTIONS' }), t.deps);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-headers')).toContain('apikey');
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST');
    const replies = [
      await t.call({ action: 'list' }),
      await t.call({ action: 'list', folder: '!' }),
      await t.call(deleteOne({ passcode: 'x'.repeat(10) })),
      await t.call('nope'),
      await t.call({ action: 'x' }),
      await t.call('x'.repeat(30_000)),
      await handle(new Request('https://f.example.test/', { method: 'GET' }), t.deps),
    ];
    expect(replies.map((r) => r.status)).toEqual([200, 400, 401, 400, 400, 413, 405]);
    for (const r of replies) {
      expect(r.headers.get('access-control-allow-origin')).toBe('*');
      expect(r.headers.get('cache-control')).toBe('no-store');
    }
  });
});

describe('small helpers', () => {
  it('compares texts of any length without matching different ones', async () => {
    expect(await sameText('abc', 'abc')).toBe(true);
    expect(await sameText('abc', 'abd')).toBe(false);
    expect(await sameText('abc', 'abcd')).toBe(false);
    expect(await sameText('', '')).toBe(true);
  });

  it('splits file names', () => {
    expect(splitName('6A Big Cat.stl')).toEqual({ base: '6A Big Cat', ext: 'stl' });
    expect(splitName('x.y.json')).toEqual({ base: 'x.y', ext: 'json' });
    expect(splitName('.stl')).toBeNull();
    expect(splitName('a.txt')).toBeNull();
    expect(splitName('a/b.stl')).toBeNull();
  });

  it('groups files into animals, ignoring strangers and keeping the earliest time', () => {
    const animals = groupAnimals([
      { name: 'b.stl', size: 1, createdAt: '2026-10-30T10:00:00Z' },
      { name: 'b.png', size: 2, createdAt: '2026-10-30T09:00:00Z' },
      { name: 'a.json', size: 3, createdAt: '2026-10-30T11:00:00Z' },
      { name: 'notes.txt', size: 4, createdAt: '2026-10-30T08:00:00Z' },
    ]);
    expect(animals.map((a) => a.base)).toEqual(['a', 'b']);
    expect(animals[1]).toMatchObject({
      createdAt: '2026-10-30T09:00:00Z',
      files: { stl: { size: 1 }, png: { size: 2 } },
    });
  });
});

describe('the storage and table calls', () => {
  function recorder(reply: (url: string, init?: RequestInit) => unknown, status = 200) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const doFetch = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(reply(url, init)), { status });
    };
    return { calls, doFetch };
  }

  it('lists folders and files, page by page, with the service key', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      name: `f${i}.stl`,
      id: `id${i}`,
      metadata: { size: 5 },
    }));
    const page2 = [
      { name: 'last.png', id: 'idz', metadata: { size: 7 }, created_at: '2026-10-30T00:00:00Z' },
    ];
    const r = recorder((_u, init) => {
      const body = JSON.parse(String(init?.body)) as { prefix: string; offset: number };
      if (body.prefix === '')
        return [
          { name: '6a', id: null },
          { name: 'stray.stl', id: 'x' },
        ];
      return body.offset === 0 ? page1 : page2;
    });
    const store = restStore(URL, 'service-key-value', r.doFetch);
    expect(await store.folders()).toEqual(['6a']);
    const files = await store.files('6a');
    expect(files).toHaveLength(1001);
    expect(files.at(-1)).toEqual({ name: 'last.png', size: 7, createdAt: '2026-10-30T00:00:00Z' });
    for (const c of r.calls) {
      expect(c.url).toBe(`${URL}/storage/v1/object/list/puzzles`);
      expect(c.init?.headers).toMatchObject({
        apikey: 'service-key-value',
        Authorization: 'Bearer service-key-value',
      });
    }
  });

  it('signs and removes through the bucket, and counts what storage says it removed', async () => {
    const r = recorder((url) =>
      url.includes('/object/sign/')
        ? [
            { path: '6a/x.stl', signedURL: '/object/sign/puzzles/6a/x.stl?token=t', error: null },
            { path: '6a/y.stl', signedURL: null, error: 'Not found' },
          ]
        : [{ name: '6a/x.stl' }],
    );
    const store = restStore(URL, 'k', r.doFetch);
    expect(await store.sign(['6a/x.stl', '6a/y.stl'], 600)).toEqual({
      '6a/x.stl': `${URL}/storage/v1/object/sign/puzzles/6a/x.stl?token=t`,
    });
    expect(JSON.parse(String(r.calls[0]!.init?.body))).toEqual({
      expiresIn: 600,
      paths: ['6a/x.stl', '6a/y.stl'],
    });
    expect(await store.remove(['6a/x.stl', '6a/y.stl'])).toBe(1);
    expect(r.calls[1]!.url).toBe(`${URL}/storage/v1/object/puzzles`);
    expect(r.calls[1]!.init?.method).toBe('DELETE');
    expect(JSON.parse(String(r.calls[1]!.init?.body))).toEqual({
      prefixes: ['6a/x.stl', '6a/y.stl'],
    });
  });

  it('turns a storage error into a plain failure without its text', async () => {
    const r = recorder(() => ({ message: 'secret-from-storage' }), 500);
    const store = restStore(URL, 'k', r.doFetch);
    await expect(store.files('6a')).rejects.toThrow(/500/);
    await expect(store.files('6a')).rejects.not.toThrow(/secret-from-storage/);
  });

  it('writes, reads and clears wrong tries in the table', async () => {
    const r = recorder((_u, init) =>
      init?.method === 'POST' ? [{ id: 42 }] : [{ id: 3, at: '2026-10-30T12:00:00Z' }],
    );
    const t = restAttempts(URL, 'k', r.doFetch);
    expect(await t.recordFailure(new Date('2026-10-30T12:00:00Z'))).toBe(42);
    expect(r.calls[0]!.init?.headers).toMatchObject({ Prefer: 'return=representation' });
    expect(JSON.parse(String(r.calls[0]!.init?.body))).toEqual({
      at: '2026-10-30T12:00:00.000Z',
      ok: false,
    });
    expect(await t.recentFailures(new Date('2026-10-30T11:45:00Z'), 6)).toEqual([
      { id: 3, at: new Date('2026-10-30T12:00:00Z') },
    ]);
    expect(r.calls[1]!.url).toContain(
      '/rest/v1/inbox_attempts?ok=eq.false&at=gte.2026-10-30T11%3A45%3A00.000Z',
    );
    expect(r.calls[1]!.url).toContain('limit=6');
    await t.forget(42);
    await t.clearFailures();
    await t.purgeBefore(new Date('2026-10-29T12:00:00Z'));
    expect(
      r.calls
        .slice(2)
        .map((c) => [c.init?.method, c.url.replace(`${URL}/rest/v1/inbox_attempts`, '')]),
    ).toEqual([
      ['DELETE', '?id=eq.42'],
      ['DELETE', '?ok=eq.false'],
      ['DELETE', '?at=lt.2026-10-29T12%3A00%3A00.000Z'],
    ]);
  });

  it('refuses to count a try that could not be stored', async () => {
    const r = recorder(() => []);
    await expect(restAttempts(URL, 'k', r.doFetch).recordFailure(new Date())).rejects.toThrow();
  });
});
