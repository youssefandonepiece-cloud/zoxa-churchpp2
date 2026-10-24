const CACHE_NAME = "zoxa-v1.1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./dist/app.js", 
  "./dist/search.js",
  "./dist/types.js",
  "./src/countdowntimer.js",
  "./data/songs.json", 
  "./data/bible.json",
  // "./data/zoxa.json",
  "./htmlFIles/moniter.html",
  "./htmlFIles/view.html",
  "./lib/fuse.mjs"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Caching assets individually...");
      return Promise.all(
        ASSETS.map((url) => {
          return cache.add(url).catch((err) => {
            console.error(`Failed to cache: ${url}`, err);
          });
        })
      );
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) return response;
      
      return fetch(event.request).catch((err) => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response("", { status: 404, statusText: "Offline and not in cache" });
      });
    })
  );
});
