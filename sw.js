/* CET Nova service worker：应用壳缓存 + 内容包 stale-while-revalidate */
const CACHE = "cetnova-v3";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

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
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 导航：在线优先，断网回退到应用壳
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const scope = self.registration.scope;
        return (
          (await caches.match(new URL("index.html", scope).href)) ||
          (await caches.match(new URL("./", scope).href)) ||
          new Response("离线且没有缓存", { status: 503 })
        );
      }),
    );
    return;
  }

  // 题库索引：网络优先，断网回退缓存
  if (url.pathname.endsWith("/content/manifest.json")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // 其它题库文件：先给缓存，同时后台更新
  if (url.pathname.includes("/content/")) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // 静态资源：缓存优先
  if (/\.(?:js|css|woff2?|svg|png|jpe?g|webp|wav|mp3)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
});
