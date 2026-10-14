/**
 * Scoped, versioned offline shell for both root development and GitHub Pages project sites.
 * User training history is stored by the app itself; the worker only caches application files.
 * The Pages packaging step replaces __FIZUHA_BUILD_ID__ with the release SHA.
 */
const CACHE = 'fizuha-shell-__FIZUHA_BUILD_ID__';
const APP_ROOT = new URL(self.registration.scope);
const INDEX = new URL('index.html', APP_ROOT).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const response = await fetch(INDEX, {cache: 'no-store'});
    if (!response.ok) throw new Error('Offline shell is unavailable');
    const html = await response.clone().text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
      .map((match) => new URL(match[1], INDEX).href)
      .filter((url) => {
        const parsed = new URL(url);
        return parsed.origin === APP_ROOT.origin &&
          parsed.pathname.startsWith(APP_ROOT.pathname);
      });
    const staticFiles = [
      new URL('manifest.webmanifest', APP_ROOT).href,
      new URL('icons/icon-192.png', APP_ROOT).href,
      new URL('icons/icon-512.png', APP_ROOT).href,
      new URL('icons/icon-maskable-512.png', APP_ROOT).href,
    ];
    const cache = await caches.open(CACHE);
    await cache.put(INDEX, response);
    // Precache the files from the already displayed index. First-launch offline
    // must not depend on whether scripts were downloaded before worker activation.
    await cache.addAll([...new Set([...assets, ...staticFiles])]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) =>
        key.startsWith('fizuha-shell-') && key !== CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== APP_ROOT.origin ||
      !url.pathname.startsWith(APP_ROOT.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(async (response) => {
        // GitHub Pages returns 404.html for direct SPA URLs. Use the canonical
        // cached index instead, including for offline navigation.
        if (!response.ok) return (await caches.match(INDEX)) ?? response;
        if (url.pathname === APP_ROOT.pathname || url.pathname === new URL(INDEX).pathname) {
          const cache = await caches.open(CACHE);
          await cache.put(INDEX, response.clone());
        }
        return response;
      }).catch(async () => (await caches.match(INDEX)) ?? Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then(async (response) => {
        if (response.ok && response.type === 'basic') {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      });
    }),
  );
});
