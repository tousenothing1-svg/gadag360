// Royal Harvest alerts: shows the notifications the shop sends (fresh arrivals, price drops, offers) and opens the
// app on the right product when one is tapped. Nothing is cached here: the shop always loads live.
// (The rider app has its own worker, /delivery-sw.js, for /delivery pages.)

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

// a tap may only open a page of this app
function appPath(u) {
  try {
    const x = new URL(u || "/", self.location.origin);
    return x.origin === self.location.origin ? x.pathname + x.search : "/";
  } catch (e) {
    return "/";
  }
}

function showAlert(d) {
  d = d || {};
  const options = {
    body: String(d.body || "").slice(0, 300),
    icon: "/logo192.png",
    badge: "/badge-96.png", // the small white leaf in the Android status bar
    data: { url: appPath(d.url) },
  };
  if (d.tag) options.tag = String(d.tag).slice(0, 64);
  if (d.lang === "kn" || d.lang === "en") options.lang = d.lang;
  if (d.image && /^(https:\/\/|\/(?![\/\\]))/.test(String(d.image))) options.image = String(d.image); // Android shows the photo
  return self.registration.showNotification(String(d.title || "Royal Harvest").slice(0, 120), options);
}
self.showAlert = showAlert; // tests call this directly

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(showAlert(d));
});

async function openApp(url) {
  const path = appPath(url);
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const shop = wins.find(w => {
    try { return !/^\/(admin|delivery)/.test(new URL(w.url).pathname); } catch (err) { return false; }
  });
  if (shop) { // the app is open: show the product there and bring it forward
    shop.postMessage({ type: "rh-open", url: path });
    return shop.focus();
  }
  return self.clients.openWindow(path);
}
self.openApp = openApp; // tests call this directly

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(openApp(e.notification.data && e.notification.data.url));
});
