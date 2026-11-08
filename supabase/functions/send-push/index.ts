// Royal Harvest: send-push. The admin panel's Notifications page calls this to send an alert (fresh arrival, price
// drop, offer) to every phone that turned alerts on, or to one customer's phone as a test.
//
//   POST {action:"start", kind, title, body, title_kn, body_kn, url, image, product_id, target:"all"|"test", phone}
//   POST {action:"next", id, after}     -> keep calling while "done" is false; each call sends one batch
//   Header x-staff-token: the admin's login. Anyone else gets 401.
//   GET                                 -> {publicKey}: the app's public push key (made on first use)
//
// The VAPID key pair is made here once with Web Crypto and kept in the database (private half in Vault), so it never
// leaves Supabase. Push addresses live in push_subscriptions; each send is kept in push_messages with its counts.
import { b64uEncode, sendPush, vapidSigner } from "./webpush.js";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUBJECT = Deno.env.get("VAPID_SUBJECT") || "https://gadag360.vercel.app";
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
    const token = req.headers.get("x-staff-token") || "";
    if (!token) return reply(401, { ok: false, error: "login" });
    const { rows: me } = await db("rpc/staff_me", { method: "POST", body: { p_token: token } });
    if (!me || !me.ok || me.kind !== "admin") return reply(401, { ok: false, error: "login" });
    const a = await req.json().catch(() => ({}));
    if (a.action === "start") return reply(200, await start(a, me));
    if (a.action === "next") return reply(200, await next(a));
    return reply(400, { ok: false, error: "action" });
  } catch (e) {
    console.error("send-push", e);
    return reply(500, { ok: false, error: "server", detail: String((e && e.message) || e).slice(0, 300) });
  }
});
