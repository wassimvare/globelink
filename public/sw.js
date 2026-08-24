/* GlobeLink production service worker: static assets only, never auth/API data. */
const CACHE = "globelink-static-icon-v20260824b";
const OFFLINE = "/offline.html";
const PRECACHE = [
  OFFLINE,
  "/manifest.webmanifest",
  "/brand/globelink-logo.png",
  "/icons/globelink-app-icon-180-v20260824b.png",
  "/icons/globelink-app-icon-512-v20260824.jpg",
];
const STATIC_EXT = /\.(?:css|js|mjs|woff2?|png|jpe?g|webp|avif|svg|ico)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    request.headers.has("authorization")
  )
    return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }
  if (!STATIC_EXT.test(url.pathname)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
