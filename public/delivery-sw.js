// Royal Harvest Delivery app: lets the rider page install on a phone and still open with a weak signal.
// Only the page and its icons are kept; orders, logins and locations always go live to the server.
// It also shows order alerts ("New delivery for you", "Order cancelled") and opens the app when one is tapped.
const CACHE = "rh-delivery-v3";
const SHELL = ["/delivery.html", "/delivery-manifest.json", "/rider-192.png", "/rider-512.png"];

// Cloudflare sends /delivery.html on to /delivery. A page saved from such a redirect can't be shown when the app
// opens with no signal, so a plain copy of it is kept instead.
const plain = res => res.redirected
  ? res.blob().then(b => new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers }))
  : res;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(SHELL.map(u => fetch(u, { cache: "reload" })
      .then(res => { if (!res.ok) throw new Error(`${u}: ${res.status}`); return plain(res); })
      .then(res => c.put(u, res)))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("rh-delivery-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  // newest copy first; the saved one only when there's no signal
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === "navigate" ? caches.match("/delivery.html") : undefined)) // /delivery or /delivery.html
        .then(hit => (hit ? plain(hit) : Response.error())))
  );
});

// ── ORDER ALERTS ──
function showOrderAlert(d) {
  d = d || {};
  const options = {
    body: String(d.body || "").slice(0, 300),
    icon: "/rider-192.png",
    badge: "/badge-96.png",
    requireInteraction: true,          // stays until the rider sees it
    vibrate: [200, 100, 200, 100, 400],
    data: { url: "/delivery.html" },
  };
  if (d.tag) { options.tag = String(d.tag).slice(0, 64); options.renotify = true; }
  return self.registration.showNotification(String(d.title || "Royal Harvest Delivery").slice(0, 120), options);
}
self.showOrderAlert = showOrderAlert; // tests call this directly

async function riderWindows() {
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return wins.filter(w => { try { return new URL(w.url).pathname.startsWith("/delivery"); } catch (e) { return false; } });
}

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(showOrderAlert(d).then(async () => { // an open app shows the new order straight away
    (await riderWindows()).forEach(w => w.postMessage({ type: "rh-refresh" }));
  }));
});

async function openDeliveryApp() {
  const wins = await riderWindows();
  if (wins.length) { wins[0].postMessage({ type: "rh-refresh" }); return wins[0].focus(); }
  return self.clients.openWindow("/delivery.html");
}
self.openDeliveryApp = openDeliveryApp; // tests call this directly

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(openDeliveryApp());
});
