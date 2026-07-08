/* Service worker de RAGTIME RUMBLE — cachea el juego para que funcione offline e instalable (PWA). */
const CACHE = "ragtime-v1.5.1";
const CORE = [
  "./", "./index.html", "./style.css",
  "./audio.js", "./bosses.js", "./game.js",
  "./manifest.webmanifest", "./icon.svg"
];
const ICONS = ["./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(CORE);                              // núcleo del juego (obligatorio)
    await Promise.all(ICONS.map(u => c.add(u).catch(() => {}))); // iconos (mejor esfuerzo)
    self.skipWaiting();
  }));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return resp;
    }).catch(() => caches.match("./index.html")))
  );
});
