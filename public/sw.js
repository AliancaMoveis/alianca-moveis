// Service worker do ALIANÇA 360: permite instalar como aplicativo e abre rápido.
// Páginas: rede primeiro (sempre a versão mais nova); arquivos do app (/assets): cache.
// Dados (Supabase) nunca passam pelo cache.
const CACHE = "a360-v2";
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(["/", "/logo.png", "/icon-192.png"]).catch(() => null))); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put("/", cp)); return r; }).catch(() => caches.match("/")));
    return;
  }
  if (url.pathname.startsWith("/assets/") || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; })));
  }
});

// ---------- notificações (Web Push) ----------
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: "ALIANÇA 360", corpo: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "ALIANÇA 360", {
    body: d.corpo || "", icon: "/icon-192.png", badge: "/icon-192.png", tag: d.tag || undefined, renotify: true,
    vibrate: [200, 100, 200], data: { url: d.url || "/" },
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => new URL(x.url).origin === self.location.origin && !new URL(x.url).pathname.startsWith("/loja"));
    if (c) { c.postMessage({ tipo: "abrir", url }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
