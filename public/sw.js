/* إيزي كوتش service worker.
 * - Static build assets: cache first.
 * - /api/offline-plan (latest program + nutrition only): network first, cache fallback.
 * - Page navigations: network only; the Arabic offline page when there is no connection.
 * - Never cached: /coach, auth, other API routes, personal links, uploads, progress photos.
 * Constants mirror lib/pwa.ts (checked by tests/pwa.test.ts).
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const STATIC_CACHE = "ec-static-" + VERSION;
const PLAN_CACHE = "ec-plan-v1";
const OFFLINE_URL = "/offline";
const OFFLINE_PLAN_URL = "/api/offline-plan";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"];
const PRIVATE_PREFIXES = ["/coach", "/api/", "/auth", "/login", "/logout", "/access", "/p/", "/invite", "/join", "/upload", "/trainee"];

/** Decides the strategy for a request. Exposed for tests. */
function route(url, request) {
  if (request.method !== "GET") return "bypass";
  if (url.origin !== self.location.origin) return "bypass";
  const path = url.pathname;
  if (path === OFFLINE_PLAN_URL) return "plan";
  if (request.mode === "navigate") return "navigate";
  if (PRIVATE_PREFIXES.some((prefix) => path.startsWith(prefix))) return "bypass";
  if (url.searchParams.has("_rsc") || request.headers.get("RSC") === "1") return "bypass";
  if (path.startsWith("/_next/static/") || path.startsWith("/icons/") || path.startsWith("/exercises/") || path === "/icon.svg") return "static";
  return "bypass";
}
self.__easycoachRoute = route;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
  // Wait for the page to ask, so an open session is never switched mid-use.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("ec-static-") && key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  // Sent on logout: a shared phone must not keep the previous trainee's plan.
  if (event.data?.type === "CLEAR_PRIVATE") event.waitUntil?.(caches.delete(PLAN_CACHE));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function planNetworkFirst(request) {
  const cache = await caches.open(PLAN_CACHE);
  try {
    const response = await fetch(request, { cache: "no-store", credentials: "same-origin" });
    if (response.ok && (response.headers.get("content-type") || "").includes("application/json")) {
      await cache.put(OFFLINE_PLAN_URL, response.clone());
    } else if ([401, 403, 404].includes(response.status)) {
      await cache.delete(OFFLINE_PLAN_URL);
    }
    return response;
  } catch {
    const cached = await cache.match(OFFLINE_PLAN_URL);
    if (cached) return cached;
    return new Response(JSON.stringify({ offline: true, plans: [] }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
}

async function navigate(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match(OFFLINE_URL)) || new Response("غير متصل", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const strategy = route(url, event.request);
  if (strategy === "static") event.respondWith(cacheFirst(event.request));
  else if (strategy === "plan") event.respondWith(planNetworkFirst(event.request));
  else if (strategy === "navigate") event.respondWith(navigate(event.request));
});
