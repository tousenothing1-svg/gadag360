// Royal Harvest: send-push. The admin panel's Notifications page calls this to send an alert (fresh arrival, price
// drop, offer) to every phone that turned alerts on, or to one customer's phone as a test.
//
//   POST {action:"start", kind, title, body, title_kn, body_kn, url, image, product_id, target:"all"|"test", phone}
//   POST {action:"next", id, after}     -> keep calling while "done" is false; each call sends one batch
//   Header x-staff-token: the admin's login. Anyone else gets 401.
//   GET                                 -> {publicKey}: the app's public push key (made on first use)
//   POST {action:"rider", order_id}     -> order alerts for delivery boys, called by the database when an order is
//                                          assigned or cancelled; sends only what rider_alert_claim says is due (once)
//   POST {action:"admin", order_id}     -> new-order alerts for the admin's phones and computers, called by the
//                                          database when a customer places an order; sends what admin_alert_claim says (once)
//   POST {action:"admin_test"}          -> (admin login) a test alert to the logged-in admin's phones and computers
//
// The VAPID key pair is made here once with Web Crypto and kept in the database (private half in Vault), so it never
// leaves Supabase. Push addresses live in push_subscriptions; each send is kept in push_messages with its counts.
import { b64uEncode, sendPush, vapidSigner } from "./webpush.js";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUBJECT = Deno.env.get("VAPID_SUBJECT") || "https://royalharvest.co.in";
const BATCH = 150;   // phones per call (the admin panel calls again for the next ones)
const PARALLEL = 15; // sent at the same time

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-staff-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function db(path, { method = "GET", body, prefer } = {}) {
  const headers = { apikey: SERVICE, "Content-Type": "application/json" };
  if (SERVICE.startsWith("eyJ")) headers.Authorization = `Bearer ${SERVICE}`;
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`database ${res.status}: ${text.slice(0, 200)}`);
  return { rows: text ? JSON.parse(text) : null, range: res.headers.get("content-range") || "" };
}

// texts: no control characters, at most two line breaks in a row, trimmed and cut to length
const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);
const oneLine = (s, n) => clean(String(s ?? "").replace(/\s+/g, " "), n);
// where a tap goes: always a page of this app
const safePath = u => { const s = String(u ?? "/").trim(); return /^\/(?![\/\\])\S{0,300}$/.test(s) ? s : "/"; };
const safeImage = u => { const s = String(u ?? "").trim(); return s.length <= 500 && /^(https:\/\/\S+|\/(?![\/\\])\S+)$/.test(s) ? s : null; };

async function customersWithPhone(phone) {
  const { rows } = await db(`users?select=id&phone=eq.${encodeURIComponent(phone)}`);
  return (rows || []).map(r => r.id);
}
const onlyFor = ids => ids ? `&user_id=in.(${ids.map(encodeURIComponent).join(",")})` : "";

async function countPhones(ids) {
  const { range } = await db(`push_subscriptions?select=id${onlyFor(ids)}&limit=1`, { prefer: "count=exact" });
  return Number(range.split("/")[1]) || 0;
}

async function eachLimited(items, limit, fn) {
  let i = 0;
  const worker = async () => { while (i < items.length) { const item = items[i++]; await fn(item); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// The app's VAPID keys: read them, or make them the first time (the first pair saved wins)
let signer = null, publicKey = null;
async function keys() {
  if (signer) return { signer, publicKey };
  let pub = (await db("rpc/push_public_key", { method: "POST", body: {} })).rows;
  let priv = pub ? (await db("rpc/push_private_key", { method: "POST", body: {} })).rows : null;
  if (!pub || !priv) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const raw = b64uEncode(await crypto.subtle.exportKey("raw", pair.publicKey));
    const d = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d;
    pub = (await db("rpc/push_save_keys", { method: "POST", body: { p_public: raw, p_private: d } })).rows;
    priv = pub === raw ? d : (await db("rpc/push_private_key", { method: "POST", body: {} })).rows;
  }
  signer = await vapidSigner({ publicKey: pub, privateKey: priv, subject: SUBJECT });
  publicKey = pub;
  return { signer, publicKey };
}

// Delivery boys: "New delivery for you" when an order is assigned to them, "Order cancelled" if it's called off.
// No login needed: the database decides what is due and hands it out only once, so calling again sends nothing.
const NO_ADDRESS = /^GPS (location pinned|ಸ್ಥಳ ಪಿನ್)/;
async function riderAlert(a) {
  const orderId = String(a.order_id ?? "");
  if (!/^RH[A-Z0-9]{8}$/.test(orderId)) return { ok: false, error: "order" };
  const { rows: due } = await db("rpc/rider_alert_claim", { method: "POST", body: { p_order: orderId } });
  if (!due || !due.ok || !due.kind) return { ok: true, sent: 0 };
  const o = due.order || {}, phones = due.phones || [];
  if (!phones.length) return { ok: true, kind: due.kind, sent: 0 };
  const items = Number(o.items) || 0;
  const pay = o.payment === "cod" ? "cash" : "paid";
  const where = o.address && !NO_ADDRESS.test(o.address) ? `\n📍 ${oneLine(o.address, 120)}` : "";
  const payload = JSON.stringify(due.kind === "assigned"
    ? { title: "📦 New delivery for you",
        body: `#${o.id} · ${items} item${items === 1 ? "" : "s"} · ₹${o.total} ${pay}${o.slot && o.slot !== "Standard" ? ` · ${oneLine(o.slot, 30)}` : ""}${where}`,
        tag: `rh-order-${o.id}` }
    : { title: "❌ Order cancelled", body: `#${o.id} was cancelled by the customer. Don't deliver it.`, tag: `rh-order-${o.id}` });
  const { signer: sign } = await keys();
  let sent = 0;
  const gone = [];
  await eachLimited(phones, PARALLEL, async s => {
    const r = await sendPush(s, payload, sign, { urgency: "high", ttl: 4 * 3600 });
    if (r.ok) sent++;
    else if (r.gone) gone.push(s.id);
  });
  if (gone.length) await db(`rider_push?id=in.(${gone.join(",")})`, { method: "DELETE" });
  await db(`rider_alerts?order_id=eq.${o.id}&rider_id=eq.${encodeURIComponent(due.rider_id)}&kind=eq.${due.kind}`, { method: "PATCH", body: { phones: sent } });
  return { ok: true, kind: due.kind, sent };
}

// The admin: "New order" on every phone or computer where order alerts are on in the admin panel.
// Like the riders' alerts: the database decides what is due and hands it out once.
async function sendToAdmins(phones, payload) {
  const { signer: sign } = await keys();
  let sent = 0;
  const gone = [];
  await eachLimited(phones, PARALLEL, async s => {
    const r = await sendPush(s, payload, sign, { urgency: "high", ttl: 4 * 3600 });
    if (r.ok) sent++;
    else if (r.gone) gone.push(s.id);
  });
  if (gone.length) await db(`admin_push?id=in.(${gone.join(",")})`, { method: "DELETE" });
  return sent;
}

async function adminAlert(a) {
  const orderId = String(a.order_id ?? "");
  if (!/^RH[A-Z0-9]{8}$/.test(orderId)) return { ok: false, error: "order" };
  const { rows: due } = await db("rpc/admin_alert_claim", { method: "POST", body: { p_order: orderId } });
  if (!due || !due.ok || !due.kind) return { ok: true, sent: 0 };
  const o = due.order || {}, phones = due.phones || [];
  if (!phones.length) return { ok: true, kind: due.kind, sent: 0 };
  const items = Number(o.items) || 0;
  const pay = o.payment === "cod" ? "pay on delivery" : "paid";
  const who = o.customer ? ` · ${oneLine(o.customer, 40)}` : "";
  const when = o.slot && o.slot !== "Standard" ? `\n🕐 ${oneLine(o.slot, 40)}` : "\n🕐 Now (20–30 min)";
  const where = o.address && !NO_ADDRESS.test(o.address) ? `\n📍 ${oneLine(o.address, 120)}` : "";
  const payload = JSON.stringify({
    title: `🛒 New order · ₹${o.total}`,
    body: `#${o.id} · ${items} item${items === 1 ? "" : "s"} · ${pay}${who}${when}${where}`,
    tag: `rh-admin-${o.id}`, url: "/admin.html",
  });
  const sent = await sendToAdmins(phones, payload);
  await db(`admin_alerts?order_id=eq.${o.id}`, { method: "PATCH", body: { phones: sent } });
  return { ok: true, kind: due.kind, sent };
}

async function adminTest(me) {
  const { rows: phones } = await db(`admin_push?select=id,endpoint,p256dh,auth&admin_id=eq.${encodeURIComponent(me.id)}`);
  if (!phones || !phones.length) return { ok: false, error: "no_devices" };
  const payload = JSON.stringify({ title: "🔔 Order alerts are on", body: "This is a test. Every new order will show up like this.",
    tag: "rh-admin-test", url: "/admin.html" });
  const sent = await sendToAdmins(phones, payload);
  return { ok: true, sent, devices: phones.length };
}

async function start(a, me) {
  const m = {
    kind: ["fresh", "price", "offer", "other"].includes(a.kind) ? a.kind : "other",
    title: oneLine(a.title, 80), body: clean(a.body, 240),
    title_kn: oneLine(a.title_kn, 80) || null, body_kn: clean(a.body_kn, 240) || null,
    url: safePath(a.url), image: safeImage(a.image), product_id: oneLine(a.product_id, 80) || null,
    target: a.target === "test" ? "test" : "all", test_phone: null, sent_by: oneLine(me.name || me.id, 80) || null,
  };
  if (!m.title || !m.body) return { ok: false, error: "empty" };
  let ids = null;
  if (m.target === "test") {
    const phone = String(a.phone ?? "").replace(/\D/g, "").slice(-10);
    if (phone.length !== 10) return { ok: false, error: "phone" };
    m.test_phone = phone;
    ids = await customersWithPhone(phone);
    if (!ids.length) return { ok: false, error: "no_customer" };
  }
  const total = await countPhones(ids);
  if (!total) return { ok: false, error: m.target === "test" ? "no_alerts_on_phone" : "no_phones" };
  const { rows } = await db("push_messages?select=id", { method: "POST", body: { ...m, total }, prefer: "return=representation" });
  return next({ id: rows[0].id, after: 0 });
}

async function next(a) {
  const id = Math.trunc(Number(a.id)), after = Math.max(0, Math.trunc(Number(a.after) || 0));
  if (!(id > 0)) return { ok: false, error: "message" };
  const { rows: found } = await db(`push_messages?id=eq.${id}&select=*`);
  const msg = found && found[0];
  if (!msg) return { ok: false, error: "message" };
  const counts = { total: msg.total, sent: msg.sent, failed: msg.failed, removed: msg.removed };
  if (msg.finished_at) return { ok: true, id, done: true, after, ...counts };

  const ids = msg.target === "test" ? await customersWithPhone(msg.test_phone) : null;
  const phones = ids && !ids.length ? [] // that customer is gone
    : (await db(`push_subscriptions?select=id,endpoint,p256dh,auth,lang&id=gt.${after}${onlyFor(ids)}&order=id.asc&limit=${BATCH}`)).rows;
  const { signer: sign } = await keys();

  let sent = 0, failed = 0;
  const gone = [];
  await eachLimited(phones, PARALLEL, async s => {
    const kn = s.lang === "kn";
    const payload = JSON.stringify({
      title: (kn && msg.title_kn) || msg.title,
      body: (kn && msg.body_kn) || msg.body,
      url: msg.url, image: msg.image || undefined, tag: `rh-${msg.id}`, lang: kn ? "kn" : "en",
    });
    const r = await sendPush(s, payload, sign);
    if (r.ok) sent++;
    else if (r.gone) gone.push(s.id);
    else failed++;
  });
  if (gone.length) await db(`push_subscriptions?id=in.(${gone.join(",")})`, { method: "DELETE" });

  const done = phones.length < BATCH;
  const { rows: t } = await db("rpc/push_tally", { method: "POST", body: { p_id: id, p_sent: sent, p_failed: failed, p_removed: gone.length, p_done: done } });
  return { ok: true, id, done, after: phones.length ? phones[phones.length - 1].id : after, ...t };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST" && req.method !== "GET") return reply(405, { ok: false, error: "method" });
  try {
    if (!SB_URL || !SERVICE) return reply(500, { ok: false, error: "not_set_up" });
    if (req.method === "GET") return reply(200, { ok: true, publicKey: (await keys()).publicKey });
    const a = (await req.json().catch(() => null)) || {};
    if (a.action === "rider") return reply(200, await riderAlert(a));
    if (a.action === "admin") return reply(200, await adminAlert(a));
    const token = req.headers.get("x-staff-token") || "";
    if (!token) return reply(401, { ok: false, error: "login" });
    const { rows: me } = await db("rpc/staff_me", { method: "POST", body: { p_token: token } });
    if (!me || !me.ok || me.kind !== "admin") return reply(401, { ok: false, error: "login" });
    if (a.action === "start") return reply(200, await start(a, me));
    if (a.action === "next") return reply(200, await next(a));
    if (a.action === "admin_test") return reply(200, await adminTest(me));
    return reply(400, { ok: false, error: "action" });
  } catch (e) {
    console.error("send-push", e);
    return reply(500, { ok: false, error: "server", detail: String((e && e.message) || e).slice(0, 300) });
  }
});
