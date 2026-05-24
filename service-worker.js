/* ============================================================
   Japanese Reviewer · Service Worker
   ------------------------------------------------------------
   策略：app shell（HTML / CSS / JS / 数据 / 图标）走 cache-first；
   外部资源（如 jsDelivr 字体）不拦截，浏览器自身能处理离线 fallback。
   每次发布请 bump CACHE_VERSION，activate 时会清理旧缓存。
   ============================================================ */
const CACHE_VERSION = 'v1';
const CACHE_NAME = `jp-reviewer-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './js/fonts.js',
  './js/engine.js',
  './js/state.js',
  './js/ui-shared.js',
  './js/module-verb.js',
  './js/module-grammar.js',
  './js/module-test.js',
  './js/module-review.js',
  './js/app.js',
  './data/verbs.js',
  './data/grammar.js',
  './data/grammar-time.js',
  './data/grammar-cause.js',
  './data/grammar-concession.js',
  './data/grammar-condition.js',
  './data/grammar-addition.js',
  './data/grammar-emphasis.js',
  './data/grammar-judgement.js',
  './data/grammar-stance.js',
  './data/grammar-manner.js',
  './data/grammar-possibility.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 只接管同源请求；跨域（字体 CDN 等）让浏览器自行处理
  if (url.origin !== self.location.origin) return;

  // HTML 导航请求：network-first 以拿到最新版本，离线再回 cache
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // 静态资源：cache-first，落空回网络并填充
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});

// 让页面可主动触发 skipWaiting（未来如果做"有新版本"提示）
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
