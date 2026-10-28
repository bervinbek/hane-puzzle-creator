import { createHash } from 'node:crypto';

/**
 * Makes the site work without a network after the first visit. At build time the list of every
 * file in the build is written into a small service worker (`sw.js`), which stores them all when
 * it is first installed and then answers from that store. Nothing is stored that is not part of
 * the build, and nothing about the user is stored at all.
 */

/**
 * The files worth keeping: everything in the build except source maps, the worker itself and the
 * older .woff copies of the fonts (every browser that runs this site reads the .woff2 ones).
 */
export function precacheFiles(names: readonly string[]): string[] {
  return [...new Set(names)]
    .filter((n) => n !== 'sw.js' && !n.endsWith('.map') && !n.endsWith('.woff'))
    .sort();
}

/** A short code that changes whenever any file in the build changes, so a new deploy gets a new store. */
export function cacheVersion(
  names: readonly string[],
  contents: readonly (string | Uint8Array)[],
): string {
  const hash = createHash('sha256');
  for (const name of [...names].sort()) hash.update(name + '\n');
  for (const part of contents) hash.update(part);
  return hash.digest('hex').slice(0, 10);
}

/**
 * The text of the service worker. `base` is where the site lives ("/" or "/<repo>/"); `files` are
 * paths below it.
 */
export function serviceWorkerSource(options: {
  base: string;
  files: readonly string[];
  version: string;
}): string {
  const base = options.base.endsWith('/') ? options.base : `${options.base}/`;
  return `// Made at build time by tools/offline.ts. Do not edit.
const BASE = ${JSON.stringify(base)};
const CACHE = 'hane-' + ${JSON.stringify(options.version)};
const FILES = ${JSON.stringify(options.files)};
// This version and the one before it stay stored, so a tab left open across a new deploy can still
// load the parts of the page it asks for later (such as the 3D view).
const KEEP = 2;
// On a slow connection, show the stored page after this long instead of waiting.
const SLOW_MS = 3500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES.map((file) => BASE + file)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // keys() lists the oldest first. Keep this one and the newest of the others.
      const others = (await caches.keys()).filter((k) => k.startsWith('hane-') && k !== CACHE);
      const keep = others.slice(Math.max(0, others.length - (KEEP - 1)));
      await Promise.all(others.filter((k) => !keep.includes(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Scripts and styles are asked for with an Origin header that the stored copies were not, and a
// server that says "Vary: Origin" would then make every one of them a miss. The files are the same.
const MATCH = { ignoreVary: true };

/** The stored copy of a request: from this version first, then from any other. */
async function stored(request) {
  const cache = await caches.open(CACHE);
  return (await cache.match(request, MATCH)) || (await caches.match(request, MATCH));
}

/** The page itself: the network first (so a new deploy shows up), the stored page if that fails or is slow. */
function page(request) {
  return new Promise((resolve) => {
    let done = false;
    const fallback = () => stored(BASE + 'index.html');
    const timer = setTimeout(() => {
      fallback().then((hit) => {
        if (hit && !done) {
          done = true;
          resolve(hit);
        }
      });
    }, SLOW_MS);
    fetch(request)
      .then((response) => {
        clearTimeout(timer);
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(BASE + 'index.html', copy));
        }
        if (!done) {
          done = true;
          resolve(response);
        }
      })
      .catch(() => {
        clearTimeout(timer);
        if (done) return;
        fallback().then((hit) => {
          done = true;
          resolve(hit || Response.error());
        });
      });
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (request.mode === 'navigate') {
    event.respondWith(page(request));
    return;
  }
  // Everything else is in the build, and the files with long names never change.
  event.respondWith(stored(request).then((hit) => hit || fetch(request)));
});
`;
}
