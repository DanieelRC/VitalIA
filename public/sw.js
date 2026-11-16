// Service worker mínimo: precarga del shell y caché de recursos estáticos.
// Los datos clínicos NUNCA se guardan en caché (siempre red).
const CACHE = "vitalia-v2";
const OFFLINE = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

// Recordatorios: el servidor envía {title, body, url, tag}; nunca datos clínicos.
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { /* carga no válida */ }
  e.waitUntil(self.registration.showNotification(data.title || "VitalIA", {
    body: data.body || "", tag: data.tag, icon: "/pwa-icon/192", badge: "/pwa-icon/192", data: { url: data.url || "/portal" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  // Solo se abren rutas de este sitio
  const target = new URL(e.notification.data?.url || "/portal", self.location.origin);
  const url = target.origin === self.location.origin ? target.href : self.location.origin + "/portal";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => new URL(c.url).origin === self.location.origin);
    return open ? open.focus().then((c) => c.navigate(url)) : self.clients.openWindow(url);
  }));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa-icon/")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })),
    );
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
  }
});
