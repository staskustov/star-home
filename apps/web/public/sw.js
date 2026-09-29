const CACHE = "star-home-shell-v6";
const STATE = "star-home-state";
const SHELL = ["/offline.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const outdated = keys.filter((key) => key !== CACHE && key !== STATE);
      await Promise.all(outdated.map((key) => caches.delete(key)));
      await self.clients.claim();
      if (!outdated.length) return;
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) client.postMessage({ type: "APP_UPDATED" });
      try {
        await self.registration.showNotification("STAR HOME", {
          body: "Приложение обновлено. Значок на экране дома можно не удалять.",
          tag: "star-home-updated",
          data: { url: "/" },
          icon: "/brand/icons/icon-192.png",
          badge: "/brand/icons/icon-badge-96.png",
        });
      } catch {
        undefined;
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let payload = { title: "STAR HOME", body: "", url: "/", sos: false, badge: 0 };
  try {
    payload = { ...payload, ...(event.data?.json() ?? {}) };
  } catch {
    payload.body = event.data?.text() ?? "";
  }
  const count = Number(payload.badge);
  event.waitUntil(
    (async () => {
      if (typeof self.registration.setAppBadge === "function") {
        const next = Number.isFinite(count) && count > 0 ? count : 1;
        await self.registration.setAppBadge(next).catch(() => undefined);
      }
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) client.postMessage({ type: "NOTICE", badge: payload.badge });
      await self.registration.showNotification(payload.title || "STAR HOME", {
        body: payload.body || "",
        tag: payload.sos ? "star-home-sos" : "star-home",
        data: { url: payload.url || (payload.sos ? "/security" : "/") },
        icon: "/brand/icons/icon-192.png",
        badge: "/brand/icons/icon-badge-96.png",
        vibrate: payload.sos ? [200, 80, 200, 80, 400] : [80],
        requireInteraction: Boolean(payload.sos),
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => "focus" in client);
      if (open) {
        open.navigate?.(url);
        return open.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/_next")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  if (SHELL.includes(url.pathname) || url.pathname.startsWith("/pwa-icon") || url.pathname.startsWith("/brand/icons") || url.pathname === "/apple-touch-icon.png") {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fresh = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => cached);
        return cached || fresh;
      }),
    );
  }
});
