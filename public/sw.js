const VERSION = "v1";
const SHELL = `shell-${VERSION}`, TILES = "tiles", ASSETS = "assets";
self.addEventListener("install", (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/manifest.webmanifest"])).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("shell-") && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
async function trim(name, max) { const c = await caches.open(name); const keys = await c.keys(); if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => c.delete(k))); }
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (e.request.mode === "navigate") { // network first, fall back to cached shell
    e.respondWith(fetch(e.request).then((r) => { caches.open(SHELL).then((c) => c.put("/", r.clone())); return r; }).catch(() => caches.match("/")));
    return;
  }
  if (url.hostname.endsWith("basemaps.cartocdn.com")) { // map tiles: cache first
    e.respondWith(caches.open(TILES).then(async (c) => { const hit = await c.match(e.request); if (hit) return hit; try { const r = await fetch(e.request); if (r.ok) { c.put(e.request, r.clone()); trim(TILES, 800); } return r; } catch { return new Response("", { status: 504 }); } }));
    return;
  }
  if (url.origin === location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))) {
    e.respondWith(caches.open(ASSETS).then(async (c) => (await c.match(e.request)) || fetch(e.request).then((r) => { c.put(e.request, r.clone()); return r; })));
  }
});
