/* LRMS-HIVE service worker: makes the site load instantly and work as an installed app.
   Bump VERSION whenever you upload new site files so teachers get the update. */
var VERSION = "hive-v1.6.0";
var SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./assets/css/hive.css",
  "./assets/js/config.js", "./assets/js/icons.js", "./assets/js/seed.js", "./assets/js/report.js", "./assets/js/api.js",
  "./assets/js/search.js", "./assets/js/app.js", "./assets/js/admin.js", "./assets/js/flipbook.js", "./assets/js/map.js",
  "./assets/img/icon-192.png", "./assets/img/icon-512.png"
];

self.addEventListener("install", function (e) {
  // a new version waits until the visitor taps "Refresh" (so nobody loses what they were typing)
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }));
});
self.addEventListener("message", function (e) { if (e.data === "skipWaiting") self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== "hive-fonts"; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  // never cache the backend: data freshness is handled by the app itself
  if (/script\.google(usercontent)?\.com$/.test(url.hostname)) return;
  // fonts: cache-first forever
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open("hive-fonts").then(function (c) {
      return c.match(req).then(function (hit) { return hit || fetch(req).then(function (res) { c.put(req, res.clone()); return res; }); });
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // app shell: serve from cache instantly, refresh in background
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) { if (res.ok) c.put(req, res.clone()); return res; }).catch(function () { return hit || c.match("./index.html"); });
      return hit || net;
    });
  }));
});
