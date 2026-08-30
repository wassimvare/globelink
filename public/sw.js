/* GlobeLink production service worker: static assets only, never auth/API data. */
const CACHE = "globelink-static-v20260830-ui-refresh";
const OFFLINE = "/offline.html";
const PRECACHE = [
  OFFLINE,
  "/manifest.webmanifest?v=20260825-rgb2",
  "/brand/globelink-logo.png",
  "/apple-touch-icon.png?v=20260825-rgb2",
  "/icons/globelink-app-icon-192-v20260824.png?v=20260825-rgb2",
  "/icons/globelink-app-icon-512-v20260824.jpg?v=20260825-rgb2",
];
const STATIC_EXT = /\.(?:css|js|mjs|woff2?|png|jpe?g|webp|avif|svg|ico)$/i;
const APP_CODE_EXT = /\.(?:css|js|mjs)$/i;

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
      .then(() => self.clients.claim())
      .then(async () => {
        // A home screen that was already open can still be running the previous JS bundle.
        // Refresh only safe/home views once when this service-worker version takes control.
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        await Promise.all(
          clients.map(async (client) => {
            try {
              const url = new URL(client.url);
              if (url.origin === self.location.origin && (url.pathname === "/" || url.pathname === "/dashboard")) {
                await client.navigate(client.url);
              }
            } catch {
              // Ignore a client that cannot be navigated.
            }
          }),
        );
      }),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json?.() ?? {};
  } catch {
    payload = { body: event.data?.text?.() ?? "Nouvelle notification GlobeLink" };
  }

  const title = payload.title || "GlobeLink";
  const options = {
    body: payload.body || "Tu as une nouvelle notification",
    icon: payload.icon || "/icons/globelink-app-icon-192-v20260824.png?v=20260825-rgb2",
    badge: payload.badge || "/icons/globelink-app-icon-192-v20260824.png?v=20260825-rgb2",
    tag: payload.tag || undefined,
    renotify: Boolean(payload.renotify),
    requireInteraction: Boolean(payload.requireInteraction),
    data: payload.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    }),
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

  // Application code must be network-first so a production deployment cannot
  // stay stuck on an older interface. Images/fonts remain cache-first for speed.
  if (APP_CODE_EXT.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

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