import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { cacheVersion, precacheFiles, serviceWorkerSource } from '../tools/offline';

const ORIGIN = 'https://school.example';
const BASE = '/hane/';
const FILES = ['index.html', 'assets/app-1.js', 'assets/viewer-2.js', 'icon-192.png'];

describe('the list of files to keep', () => {
  it('holds the whole build, but not source maps, the worker itself or old font copies', () => {
    const names = [
      'index.html',
      'assets/a.js',
      'assets/a.js.map',
      'assets/font.woff',
      'assets/font.woff2',
      'sw.js',
      'assets/a.js',
      'manifest.webmanifest',
    ];
    expect(precacheFiles(names)).toEqual([
      'assets/a.js',
      'assets/font.woff2',
      'index.html',
      'manifest.webmanifest',
    ]);
  });

  it("leaves out the teacher's inbox page, which students never open", () => {
    const names = [
      'index.html',
      'inbox.html',
      'assets/teacher-inbox-1.js',
      'assets/teacher-inbox-2.css',
      'assets/inbox-3.js',
    ];
    expect(precacheFiles(names)).toEqual(['assets/inbox-3.js', 'index.html']);
  });
});

describe('the version of a build', () => {
  it('stays the same for the same build and changes when any file or its content does', () => {
    const v = cacheVersion(['a.js', 'b.js'], ['page one']);
    expect(v).toMatch(/^[0-9a-f]{10}$/);
    expect(cacheVersion(['b.js', 'a.js'], ['page one'])).toBe(v);
    expect(cacheVersion(['a.js', 'c.js'], ['page one'])).not.toBe(v);
    expect(cacheVersion(['a.js', 'b.js'], ['page two'])).not.toBe(v);
  });
});

describe('the service worker text', () => {
  it('lists every file once, with the site path, and fixes a path without a final slash', () => {
    const source = serviceWorkerSource({ base: '/hane', files: FILES, version: 'abc' });
    expect(source).toContain('const BASE = "/hane/";');
    for (const file of FILES) expect(source.split(JSON.stringify(file)).length - 1).toBe(1);
    expect(source).toContain('\'hane-\' + "abc"');
  });
});

/** Runs the generated worker against a pretend browser, so what it does can be checked. */
function startWorker(version = 'v3', existing: string[] = []) {
  const handlers: Record<string, (event: Record<string, unknown>) => void> = {};
  const stores = new Map<string, Map<string, Response>>();
  for (const name of existing) stores.set(name, new Map());
  const key = (r: unknown): string =>
    new URL(typeof r === 'string' ? r : (r as { url: string }).url, ORIGIN).href;
  const cacheOf = (name: string) => {
    const store = stores.get(name)!;
    return {
      match: async (r: unknown, options?: { ignoreVary?: boolean }) => {
        matches.push(options?.ignoreVary === true);
        return store.get(key(r))?.clone();
      },
      put: async (r: unknown, response: Response) => void store.set(key(r), response),
      addAll: async (urls: string[]) => {
        for (const url of urls) store.set(key(url), new Response(`stored ${url}`));
      },
    };
  };
  const calls = { skipWaiting: 0, claim: 0, fetched: [] as string[] };
  /** For every look in the store: whether it said to ignore "Vary". */
  const matches: boolean[] = [];
  const network: { respond: (url: string) => Response | Promise<Response> } = {
    respond: (url) => new Response(`network ${url}`),
  };
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  const sandbox = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type: string, fn: (event: Record<string, unknown>) => void) => {
        handlers[type] = fn;
      },
      skipWaiting: async () => void calls.skipWaiting++,
      clients: { claim: async () => void calls.claim++ },
    },
    caches: {
      open: async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        return cacheOf(name);
      },
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      match: async (r: unknown, options?: { ignoreVary?: boolean }) => {
        for (const name of stores.keys()) {
          const hit = await cacheOf(name).match(r, options);
          if (hit) return hit;
        }
        return undefined;
      },
    },
    fetch: async (r: { url: string }) => {
      calls.fetched.push(r.url);
      return network.respond(r.url);
    },
    setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms, live: true }) - 1,
    clearTimeout: (id: number) => void (timers[id]!.live = false),
    Response,
    URL,
    Promise,
  };
  vm.runInNewContext(serviceWorkerSource({ base: BASE, files: FILES, version }), sandbox);

  const run = async (type: string, extra: Record<string, unknown> = {}) => {
    const waits: Promise<unknown>[] = [];
    let answer: Promise<Response> | undefined;
    handlers[type]!({
      waitUntil: (p: Promise<unknown>) => void waits.push(p),
      respondWith: (p: Promise<Response>) => void (answer = p),
      ...extra,
    });
    await Promise.all(waits);
    return answer;
  };
  const request = (
    path: string,
    init: { method?: string; mode?: string; origin?: string } = {},
  ) => ({
    url: `${init.origin ?? ORIGIN}${path}`,
    method: init.method ?? 'GET',
    mode: init.mode ?? 'no-cors',
  });
  /** Asks the worker to answer a fetch, and hands back its promise as it is (without waiting for it). */
  const respond = (req: unknown): Promise<Response> => {
    let answer: Promise<Response> | undefined;
    handlers.fetch!({ request: req, respondWith: (p: Promise<Response>) => void (answer = p) });
    return answer!;
  };
  return { run, respond, request, stores, calls, network, timers, key, matches };
}

describe('the service worker, as a browser would run it', () => {
  it('stores every file of the build when it is installed, then takes over', async () => {
    const w = startWorker('v3');
    await w.run('install');
    const store = w.stores.get('hane-v3')!;
    expect([...store.keys()].sort()).toEqual(FILES.map((f) => `${ORIGIN}${BASE}${f}`).sort());
    expect(w.calls.skipWaiting).toBe(1);
    await w.run('activate');
    expect(w.calls.claim).toBe(1);
  });

  it('keeps this version and the one before, and throws out older ones and nothing else', async () => {
    const w = startWorker('v5', ['hane-v1', 'hane-v2', 'hane-v4', 'something-else']);
    await w.run('install');
    await w.run('activate');
    expect([...w.stores.keys()].sort()).toEqual(['hane-v4', 'hane-v5', 'something-else']);
  });

  it('leaves alone what is not its business: other methods, other sites, other places', async () => {
    const w = startWorker();
    await w.run('install');
    expect(
      await w.run('fetch', { request: w.request(`${BASE}assets/app-1.js`, { method: 'POST' }) }),
    ).toBeUndefined();
    expect(
      await w.run('fetch', {
        request: w.request(`${BASE}assets/app-1.js`, { origin: 'https://other.example' }),
      }),
    ).toBeUndefined();
    expect(await w.run('fetch', { request: w.request('/somewhere/else.js') })).toBeUndefined();
  });

  it('answers files of the build from the store, and asks the network only for the rest', async () => {
    const w = startWorker();
    await w.run('install');
    const hit = await w.run('fetch', { request: w.request(`${BASE}assets/viewer-2.js`) });
    expect(await (await hit)!.text()).toBe(`stored ${BASE}assets/viewer-2.js`);
    expect(w.calls.fetched).toEqual([]);
    const miss = await w.run('fetch', { request: w.request(`${BASE}assets/new.js`) });
    expect(await (await miss)!.text()).toBe(`network ${ORIGIN}${BASE}assets/new.js`);
  });

  it('finds stored files even when the server says Vary: Origin', async () => {
    const w = startWorker();
    await w.run('install');
    await w.run('fetch', { request: w.request(`${BASE}assets/app-1.js`) });
    await w.run('fetch', { request: w.request(BASE, { mode: 'navigate' }) });
    w.network.respond = () => {
      throw new TypeError('offline');
    };
    await w.run('fetch', { request: w.request(BASE, { mode: 'navigate' }) });
    expect(w.matches.length).toBeGreaterThanOrEqual(2);
    expect(w.matches.every(Boolean)).toBe(true);
  });

  it('prefers the newest stored copy of a file', async () => {
    const w = startWorker('v2', ['hane-v1']);
    await w.run('install');
    const url = `${ORIGIN}${BASE}icon-192.png`;
    w.stores.get('hane-v1')!.set(url, new Response('old icon'));
    const answer = await w.run('fetch', { request: w.request(`${BASE}icon-192.png`) });
    expect(await (await answer)!.text()).toBe(`stored ${BASE}icon-192.png`);
  });

  it('opens the page from the network when it can, and keeps a copy', async () => {
    const w = startWorker();
    await w.run('install');
    const answer = await w.run('fetch', { request: w.request(BASE, { mode: 'navigate' }) });
    expect(await (await answer)!.text()).toBe(`network ${ORIGIN}${BASE}`);
    await new Promise((r) => setTimeout(r, 5));
    const copy = w.stores.get('hane-v3')!.get(`${ORIGIN}${BASE}index.html`)!;
    expect(await copy.text()).toBe(`network ${ORIGIN}${BASE}`);
    expect(w.timers.every((t) => !t.live)).toBe(true);
  });

  it('opens the stored page when there is no network at all', async () => {
    const w = startWorker();
    await w.run('install');
    w.network.respond = () => {
      throw new TypeError('offline');
    };
    const answer = await w.run('fetch', { request: w.request(BASE, { mode: 'navigate' }) });
    expect(await (await answer)!.text()).toBe(`stored ${BASE}index.html`);
  });

  it('opens the stored page when the network is too slow, without waiting for it', async () => {
    const w = startWorker();
    await w.run('install');
    w.network.respond = () => new Promise<Response>(() => undefined);
    const answer = w.respond(w.request(BASE, { mode: 'navigate' }));
    expect(w.timers).toHaveLength(1);
    expect(w.timers[0]!.ms).toBeGreaterThanOrEqual(2000);
    expect(w.timers[0]!.ms).toBeLessThanOrEqual(6000);
    w.timers[0]!.fn();
    expect(await (await answer).text()).toBe(`stored ${BASE}index.html`);
  });

  it('gives an error, not a hang, when there is neither a network nor a stored page', async () => {
    const w = startWorker();
    w.network.respond = () => {
      throw new TypeError('offline');
    };
    const answer = await w.run('fetch', { request: w.request(BASE, { mode: 'navigate' }) });
    const response = await answer!;
    expect(response.type).toBe('error');
  });
});
