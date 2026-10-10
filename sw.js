// sw.js — the service worker. The browser runs it in the background so the app
// still opens without internet.
//
// Strategy: "network first". When online, always fetch the latest files (so updates
// you push to GitHub show up right away) and keep a copy. When offline, use the copy.

const CACHE = 'meal-tracker-v2'; // change this name with each release
const APP_SHELL = [
  './', './index.html', './css/styles.css', './manifest.webmanifest',
  './js/app.js', './js/db.js', './js/store.js', './js/ui.js', './js/util.js',
  './js/views/welcome.js', './js/views/targets.js', './js/views/today.js', './js/views/week.js',
  './js/views/add.js', './js/views/create.js', './js/views/trends.js', './js/views/settings.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    // cache: 'no-cache' = always ask the server if there's a newer file (skips the browser's 10-minute reuse)
    fetch(event.request, { cache: 'no-cache' })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })
        .then((hit) => hit || caches.match('./index.html')))
  );
});
