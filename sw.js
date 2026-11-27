/* かんじ れんしゅう：オフライン用の Service Worker
   ・このサイトのファイル：ネットがあれば最新を取り、取れなければ保存したものを使う
   ・外部（Hanzi Writer・書き順データ）：一度取ったら保存して、次からはそれを使う */
var APP_CACHE = 'kanji-app-v2';
var DATA_CACHE = 'kanji-data-v1';   /* 書き順データ（trace.js が一括保存にも使う） */
var APP_FILES = ['./', 'index.html', 'style.css', 'app.js', 'print.html', 'print.css', 'print.js',
  'trace.html', 'trace.css', 'trace.js', 'weak.html', 'weak.css', 'weak.js',
  'sentences-grade1.js', 'sentences-grade2.js', 'sentences-grade3.js', 'sentences-grade4.js', 'sentences-grade5.js', 'sentences-grade6.js',
  'data-grade1.js', 'data-grade2.js', 'data-grade3.js', 'data-grade4.js', 'data-grade5.js', 'data-grade6.js'];
var LIB = 'https://cdn.jsdelivr.net/npm/hanzi-writer@3.5.0/dist/hanzi-writer.min.js';

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(APP_CACHE).then(function (c) {
      return c.addAll(APP_FILES).then(function () {
        /* 外部ライブラリは取れなくても、インストールは成功させる */
        return fetch(LIB, { mode: 'no-cors' }).then(function (r) { return caches.open(DATA_CACHE).then(function (d) { return d.put(LIB, r); }); }).catch(function () {});
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== APP_CACHE && k !== DATA_CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) {
    /* このサイト：ネット優先、だめなら保存分 */
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(APP_CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match('index.html'); });
      })
    );
    return;
  }
  /* 外部：保存分があればそれを使い、なければ取りに行って保存する */
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) { var copy = res.clone(); caches.open(DATA_CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      });
    })
  );
});
