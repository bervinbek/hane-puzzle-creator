// Made at build time by tools/offline.ts. Do not edit.
const BASE = "/hane-puzzle-creator/";
const CACHE = 'hane-' + "b0c44ba0eb";
const FILES = ["apple-touch-icon.png","assets/atkinson-hyperlegible-latin-400-normal-BrHNak5F.woff2","assets/atkinson-hyperlegible-latin-700-normal-GZI4o3u0.woff2","assets/atkinson-hyperlegible-latin-ext-400-normal-DRk46D-x.woff2","assets/atkinson-hyperlegible-latin-ext-700-normal-BoVPHkS0.woff2","assets/fredoka-hebrew-wght-normal-DdnsCkLr.woff2","assets/fredoka-latin-ext-wght-normal-CYrqKuxd.woff2","assets/fredoka-latin-wght-normal-DM6njrJ3.woff2","assets/inbox-BzEVlpzL.js","assets/inbox-j5BZWZvp.css","assets/index-HYfdh8wy.css","assets/index-UtnATp9T.js","assets/viewer-PaLcur1q.js","icon-192.png","icon-512.png","icon-maskable-512.png","manifest.webmanifest"];
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
