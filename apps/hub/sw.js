/*
 * Sundown Club service worker (tools/build-site.mjs fills in BUILD and PRECACHE).
 *
 *  - Pages (HTML): network first, a short wait, then the cached copy, so a
 *    deploy shows up at once and the club still opens offline.
 *  - Code, styles, fonts, images: stale while revalidate; hashed build files
 *    (/parking/assets, /racing/assets) are cache first because they never change.
 *  - /api/ is never touched: the games treat a failed request as "resting".
 *  - Every cache is named for the build, and the old ones are deleted on
 *    activate, so a deploy cannot leave anyone on stale code.
 *  - push: shows one generic reminder (only sent when the owner switches reminders on).
 */
const BUILD = '__BUILD__';
const CACHE = `club-${BUILD}`;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('club-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isPage = (req) => req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;
  if (isPage(req)) { e.respondWith(networkFirst(req)); return; }
  if (/^\/(parking|racing)\/assets\//.test(url.pathname)) { e.respondWith(cacheFirst(req)); return; }
  e.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 3500))]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || (await cache.match(new URL(req.url).pathname)) || (await cache.match('/')) || new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await fresh) || new Response('', { status: 504 });
}

self.addEventListener('push', (e) => {
  e.waitUntil(self.registration.showNotification('Sundown Club', {
    body: "Tonight's table is set, and today's Daily Seed is up.",
    icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: 'club-daily', renotify: false, data: { url: '/#evening' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if (new URL(c.url).origin === location.origin) { await c.focus(); if ('navigate' in c) await c.navigate(target); return; }
    await self.clients.openWindow(target);
  })());
});
