const CACHE_NAME = 'silidpinoy-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/lesson.html',
  '/powerpoint.html',
  '/activity.html',
  '/tos.html',
  '/favicon.svg',
  '/gcash.jpg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/shared-api.js',
  '/shared-keys.js',
  '/shared-backup.js',
  '/shared-validate.js',
  '/shared-docs.js',
  '/shared-docs-ui.js',
  '/shared-file-utils.js',
  '/shared-toast.js',
  '/deped-options.js',
  '/shared-icons.js',
  '/app.js',
  '/tools/settings.jsx',
  '/layout.html',
  '/manifest.webmanifest',
];

// CDN resources to cache (best effort)
const CDN_RESOURCES = [
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..600&family=Plus+Jakarta+Sans:wght@300..800&display=swap',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://unpkg.com/lucide@latest/dist/umd/lucide.min.js',
  'https://unpkg.com/html-docx-js@0.3.1/dist/html-docx.js',
  'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js',
  'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js',
  'https://cdn.jsdelivr.net/npm/mathml2omml@0.5.0/dist/index.js',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache static assets
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })))
        .catch(err => console.warn('Some static assets failed to cache:', err));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension, data: URLs, etc.
  if (!url.protocol.startsWith('http')) return;

  // Strategy: Network first for HTML, Cache first for static assets
  const isHTML = request.headers.get('accept')?.includes('text/html');
  const isStaticAsset = STATIC_ASSETS.some(asset => url.pathname === new URL(asset).pathname);
  const isCDNResource = CDN_RESOURCES.some(cdn => url.href.startsWith(cdn));

  if (isHTML) {
    // Network first for HTML pages
    event.respondWith(networkFirst(request));
  } else if (isStaticAsset || isCDNResource) {
    // Cache first for static assets
    event.respondWith(cacheFirst(request));
  } else {
    // Default: network first with cache fallback
    event.respondWith(networkFirst(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    console.warn('Fetch failed:', request.url, err);
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    console.warn('Network failed, trying cache:', request.url, err);
    const cached = await caches.match(request);
    if (cached) return cached;

    // For HTML pages, return a minimal offline page
    if (request.headers.get('accept')?.includes('text/html')) {
      return caches.match('/index.html') || new Response('Offline', { status: 503 });
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

// Background sync for offline actions (if needed)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-documents') {
    event.waitUntil(syncDocuments());
  }
});

async function syncDocuments() {
  // Placeholder for future background sync of documents
  console.log('Background sync triggered');
}