const CACHE = "star-home-shell-v3";
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
          icon: "/pwa-icon/192",
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
  let payload = { title: "STAR HOME", body: "", url: "/", sos: false };
  try {
    payload = { ...payload, ...(event.data?.json() ?? {}) };
  } catch {
    payload.body = event.data?.text() ?? "";
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "STAR HOME", {
      body: payload.body || "",
      tag: payload.sos ? "star-home-sos" : "star-home",
      data: { url: payload.url || (payload.sos ? "/security" : "/") },
      icon: "/pwa-icon/192",
      badge: "/pwa-icon/192",
      vibrate: payload.sos ? [200, 80, 200, 80, 400] : [80],
      requireInteraction: Boolean(payload.sos),
    }),
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

  if (SHELL.includes(url.pathname) || url.pathname.startsWith("/pwa-icon")) {
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
