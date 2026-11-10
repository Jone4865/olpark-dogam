// 올팍 도감 서비스 워커: 앱 화면과 데이터를 저장해 두어 신호가 약한 곳에서도 열리게 한다.
const VERSION = 'olpark-v1.0.0';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'data/places.json', 'data/roses.json', 'data/basemap.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const IMG_CACHE = 'olpark-img';
const IMG_MAX = 150;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== IMG_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
async function trim() {
  const c = await caches.open(IMG_CACHE);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - IMG_MAX; i++) await c.delete(keys[i]);
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // 앱 파일: 저장본을 먼저 쓰고 뒤에서 새로 받아 둔다
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (req.destination === 'image' || url.hostname.endsWith('fonts.gstatic.com') || url.hostname.endsWith('fonts.googleapis.com')) {
    // 공원 사진과 글꼴: 인터넷이 되면 새로 받고, 안 되면 저장본을 쓴다
    e.respondWith(fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') caches.open(IMG_CACHE).then((c) => c.put(req, res.clone()).then(trim));
      return res;
    }).catch(() => caches.match(req)));
  }
});
