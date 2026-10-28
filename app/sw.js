// Guarda la app para que abra sin internet
const C = 'shv-pos-v2';
const FILES = ['./', 'index.html', 'app.js', 'seed.js', 'config.js', 'cloud.js', 'manifest.json', 'icon.svg', '../fonts/highvoltage.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // solo la app y sus librerías; la base de datos y el login van directo
  if (e.request.method !== 'GET' || !(u.origin === location.origin || u.host === 'www.gstatic.com' || /fonts\.(googleapis|gstatic)\.com/.test(u.host))) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request)));
});
