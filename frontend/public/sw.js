/**
 * Service Worker for SmartTransfer
 * Strategy:
 *  - Static assets (CSS, JS, images, fonts): cache-first
 *  - API calls: network-first with stale fallback
 *  - HTML pages: network-first with cache fallback
 *  - Admin/account/agency/driver routes: never cached (private)
 */

const VERSION = 'v1.2.0';
const STATIC_CACHE = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;
const HTML_CACHE = `html-${VERSION}`;

const PRECACHE_URLS = [
    '/',
    '/track',
    '/contact',
    '/blog',
];

const NEVER_CACHE_PATTERNS = [
    /^\/admin/,
    /^\/account/,
    /^\/agency/,
    /^\/driver/,
    /^\/partner/,
    /^\/login/,
    /^\/register/,
    /^\/payment/,
    /^\/booking/,
    /^\/transfer\/book/,
    /^\/api\//,
    /^\/_next\/data\//,
    /\/socket\.io/,
];

const STATIC_ASSET_PATTERNS = [
    /\/_next\/static\//,
    /\.(?:js|css|woff2?|ttf|otf|eot)$/i,
    /\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i,
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => { }))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys
                    .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE, HTML_CACHE].includes(k))
                    .map((k) => caches.delete(k))
            );
            await self.clients.claim();
        })()
    );
});

function isNeverCached(url) {
    return NEVER_CACHE_PATTERNS.some((re) => re.test(url));
}

function isStaticAsset(url) {
    return STATIC_ASSET_PATTERNS.some((re) => re.test(url));
}

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
        const fresh = await fetch(request);
        if (fresh && fresh.status === 200) cache.put(request, fresh.clone());
        return fresh;
    } catch (e) {
        return cached || new Response('Offline', { status: 503 });
    }
}

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const fresh = await fetch(request);
        if (fresh && fresh.status === 200) cache.put(request, fresh.clone());
        return fresh;
    } catch (e) {
        const cached = await cache.match(request);
        if (cached) return cached;
        // Last resort: offline page
        if (request.mode === 'navigate') {
            const fallback = await cache.match('/');
            if (fallback) return fallback;
        }
        return new Response('Offline', { status: 503 });
    }
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    // Same-origin only
    if (url.origin !== self.location.origin) return;

    const pathname = url.pathname;

    if (isNeverCached(pathname)) return; // Let browser handle natively

    if (isStaticAsset(pathname)) {
        event.respondWith(cacheFirst(request, STATIC_CACHE));
        return;
    }

    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(networkFirst(request, HTML_CACHE));
        return;
    }

    event.respondWith(networkFirst(request, RUNTIME_CACHE));
});

// Handle skip waiting messages
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
