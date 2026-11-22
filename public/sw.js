/* RDDL TECH Service Worker â€” cache apenas de recursos estÃ¡ticos pÃºblicos. */
const SW_VERSION = 'rddl-tech-v1.2.1';
const STATIC_CACHE = `${SW_VERSION}-static`;
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/teixacell-logo.jpeg'
];
const MAX_RUNTIME_ENTRIES = 80;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('rddl-tech-') && key !== STATIC_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Nunca armazenar APIs, autenticaÃ§Ã£o, Firebase/Firestore ou respostas dinÃ¢micas.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__/') || url.pathname.includes('/_next/data/')) return;
  if (request.headers.has('authorization')) return;

  // A navegaÃ§Ã£o Ã© sempre validada na rede; offline mostra uma pÃ¡gina neutra,
  // sem reutilizar HTML que possa conter estado de sessÃ£o ou dados da empresa.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(STATIC_CACHE);
      return (await cache.match(OFFLINE_URL)) || Response.error();
    }));
    return;
  }

  const isStaticAsset = url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.ico' ||
    /\.(?:css|js|woff2?|ttf|otf)$/i.test(url.pathname);
  if (!isStaticAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && (response.type === 'basic' || response.type === 'default')) {
        await cache.put(request, response.clone());
        await trimCache(STATIC_CACHE, MAX_RUNTIME_ENTRIES + PRECACHE_URLS.length);
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});

