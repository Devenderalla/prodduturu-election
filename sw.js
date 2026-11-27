/* Service worker: cache-first shell so the app opens with no network.
   Bump CACHE on every release so phones pick up new code. */
var CACHE = 'prodduturu-election-v1.1.5';
var ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/styles.css',
  './js/i18n.js', './js/db.js', './js/state.js', './js/charts.js', './js/ui.js',
  './js/data/demo-voters.js', './js/roll.js',
  './js/views/dashboard.js', './js/views/search.js', './js/views/turnout.js',
  './js/views/analytics.js', './js/views/results.js', './js/views/expenses.js',
  './js/views/settings.js',
  './js/app.js', './icons/icon.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return caches.match('./index.html'); });
    })
  );
});
