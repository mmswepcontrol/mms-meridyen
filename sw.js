/**
 * MMS Meridyen — Service Worker v1.0
 * https://www.mmsmeridyen.tr
 *
 * Strateji: Cache-first for static assets, Network-first for HTML
 * Bu dosya domain köküne yüklenmelidir: /sw.js
 */

const CACHE_VERSION = 'v1.0.0';
const CACHE_STATIC  = 'mms-static-' + CACHE_VERSION;
const CACHE_DYNAMIC = 'mms-dynamic-' + CACHE_VERSION;
const ALL_CACHES    = [CACHE_STATIC, CACHE_DYNAMIC];

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/og-image.jpg',
  '/icon-192.png',
  '/icon-512.png'
];

const OFFLINE_URL = '/';

/* ── INSTALL: statik varlıkları önceden cache'le ── */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(function(cache) {
        return Promise.allSettled(
          STATIC_ASSETS.map(function(url) {
            return cache.add(url).catch(function(err) {
              console.warn('[SW] Cache add failed for:', url, err);
            });
          })
        );
      })
      .then(function() {
        return self.skipWaiting();
      })
  );
});

/* ── ACTIVATE: eski cache'leri temizle ── */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys.filter(function(key) {
            return ALL_CACHES.indexOf(key) === -1;
          }).map(function(key) {
            return caches.delete(key);
          })
        );
      })
      .then(function() {
        return self.clients.claim();
      })
  );
});

/* ── FETCH: istekleri yakala ── */
self.addEventListener('fetch', function(event) {
  var request = event.request;

  // Yalnızca GET
  if (request.method !== 'GET') return;

  // Sadece kendi origin
  if (!request.url.startsWith(self.location.origin)) return;

  // Analytics / GTM gibi dış kaynakları bypass et
  var BYPASS = [
    'googletagmanager.com',
    'google-analytics.com',
    'clarity.ms',
    'facebook.net',
    'wa.me',
    'maps.google.com'
  ];
  for (var i = 0; i < BYPASS.length; i++) {
    if (request.url.indexOf(BYPASS[i]) !== -1) return;
  }

  var url = new URL(request.url);
  var isNavigation = request.mode === 'navigate';
  var isStaticAsset = /\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|woff2|woff|ttf)$/.test(url.pathname);

  if (isNavigation) {
    /* HTML: Network-first, fallback cache, fallback offline */
    event.respondWith(
      fetch(request)
        .then(function(response) {
          if (response && response.ok) {
            var clone = response.clone();
            caches.open(CACHE_DYNAMIC).then(function(cache) {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(function() {
          return caches.match(request)
            .then(function(cached) {
              return cached || caches.match(OFFLINE_URL);
            });
        })
    );
  } else if (isStaticAsset) {
    /* Static: Cache-first, fallback network */
    event.respondWith(
      caches.match(request)
        .then(function(cached) {
          if (cached) return cached;
          return fetch(request)
            .then(function(response) {
              if (response && response.ok) {
                var clone = response.clone();
                caches.open(CACHE_STATIC).then(function(cache) {
                  cache.put(request, clone);
                });
              }
              return response;
            })
            .catch(function() {
              return new Response('', { status: 408 });
            });
        })
    );
  }
  /* Diğer istekler: normal network */
});
