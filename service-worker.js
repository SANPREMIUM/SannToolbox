/* SANN Toolbox - service worker (mode offline)
   Simpan halaman utama + library luar ke cache supaya app tetap bisa dibuka
   tanpa internet. Panggilan Firebase (login, chat, data) TIDAK di-cache. */
const CACHE = 'sann-v1';

const PRECACHE_SAME = ['./', './index.html', './manifest.json', './icon-192.png'];
const PRECACHE_CROSS = [
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jsqr/1.4.0/jsQR.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage-compat.js',
  'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap',
];
const CROSS_HOSTS = ['cdnjs.cloudflare.com', 'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all([
      ...PRECACHE_SAME.map((u) => cache.add(u).catch(() => {})),
      ...PRECACHE_CROSS.map((u) =>
        fetch(u, { mode: 'no-cors' }).then((r) => cache.put(u, r)).catch(() => {})
      ),
    ]);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* Halaman: coba internet dulu (supaya update selalu terbaru), kalau gagal/lama pakai cache. */
async function networkFirst(request, timeoutMs) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    return (await cache.match(request, { ignoreSearch: true }))
      || (await cache.match('./index.html'))
      || (await cache.match('./'))
      || Response.error();
  }
}

/* Aset lain: pakai cache dulu, perbarui diam-diam di belakang. */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fetching = fetch(request).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await fetching) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') event.respondWith(networkFirst(req, 5000));
    else event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (CROSS_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req));
  }
  // selain itu (Firestore, Auth, Storage, dll) tidak disentuh
});
