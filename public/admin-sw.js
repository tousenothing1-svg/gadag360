// Royal Harvest admin panel: shows new-order alerts ("New order · ₹310") on this phone or computer, even when the
// admin panel is closed, and opens it when one is tapped. Nothing is cached: the admin panel always loads fresh.
// The database sends the alerts (see supabase/18_admin_alerts.sql).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

function showOrderAlert(d) {
  d = d || {};
  const options = {
    body: String(d.body || "").slice(0, 300),
    icon: "/logo192.png",
    badge: "/badge-96.png",
    requireInteraction: true,          // stays until the admin sees it
    vibrate: [200, 100, 200, 100, 400],
    data: { url: "/admin.html" },
  };
  if (d.tag) { options.tag = String(d.tag).slice(0, 64); options.renotify = true; }
  return self.registration.showNotification(String(d.title || "Royal Harvest Admin").slice(0, 120), options);
}
self.showOrderAlert = showOrderAlert; // tests call this directly

async function adminWindows() {
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return wins.filter(w => { try { return new URL(w.url).pathname.startsWith("/admin"); } catch (e) { return false; } });
}

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(showOrderAlert(d).then(async () => { // an open admin panel shows the new order straight away
    (await adminWindows()).forEach(w => w.postMessage({ type: "rh-new-order" }));
  }));
});

async function openAdmin() {
  const wins = await adminWindows();
  if (wins.length) { wins[0].postMessage({ type: "rh-new-order", open: true }); return wins[0].focus(); }
  return self.clients.openWindow("/admin.html");
}
self.openAdmin = openAdmin; // tests call this directly

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(openAdmin());
});
