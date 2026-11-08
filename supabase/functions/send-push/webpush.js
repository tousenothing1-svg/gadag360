// Web Push for Royal Harvest's alerts.
//   VAPID (RFC 8292): signs each request so the phone's push service knows it comes from Royal Harvest.
//   Encryption (RFC 8291, "aes128gcm"): only the phone the alert is for can read it.
// Built on the standard Web Crypto API only, so the same file runs in Supabase (Deno) and in Node for tests.

const te = new TextEncoder();

export function b64uEncode(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64uDecode(str) {
  const s = String(str).replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

// Encrypt one message for one phone. A new key pair and salt every time, as the standard asks.
export async function encryptPayload(payload, p256dh, authSecret, rs = 4096) {
  const plain = typeof payload === "string" ? te.encode(payload) : payload;
  const uaPublic = b64uDecode(p256dh), auth = b64uDecode(authSecret);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error("bad p256dh key");
  if (auth.length !== 16) throw new Error("bad auth secret");
  if (plain.length + 17 > rs) throw new Error("message too long");

  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(auth, shared, concat(te.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // one record: the message, then the "last record" padding byte
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(plain, new Uint8Array([2]))));

  const header = new Uint8Array(21 + asPublic.length); // salt | record size | key length | our public key
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, sealed);
}

// Returns authorization(endpoint): the VAPID header for that push service. Kept 12 hours per service.
export async function vapidSigner({ publicKey, privateKey, subject }) {
  const pub = b64uDecode(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("bad VAPID public key");
  if (!/^(mailto:|https:\/\/)/.test(String(subject || ""))) throw new Error("VAPID subject must be mailto: or https://");
  const key = await crypto.subtle.importKey("jwk",
    { kty: "EC", crv: "P-256", x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), d: privateKey, ext: true },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const cache = new Map();
  return async function authorization(endpoint) {
    const aud = new URL(endpoint).origin, now = Math.floor(Date.now() / 1000);
    const hit = cache.get(aud);
    if (hit && hit.exp - now > 3600) return hit.value;
    const exp = now + 12 * 3600;
    const part = o => b64uEncode(te.encode(JSON.stringify(o)));
    const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud, exp, sub: subject })}`;
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(unsigned)));
    const value = `vapid t=${unsigned}.${b64uEncode(sig)}, k=${publicKey}`;
    cache.set(aud, { exp, value });
    return value;
  };
}

// Deliver to one phone. ok: the push service took it. gone: that address no longer works (delete it).
export async function sendPush(sub, payload, authorization, { ttl = 86400, urgency = "normal", timeoutMs = 10000 } = {}) {
  let body;
  try { body = await encryptPayload(payload, sub.p256dh, sub.auth); }
  catch (e) { // broken keys never work (delete the address); a message too long is ours to fix (keep it)
    const msg = String((e && e.message) || e);
    return { ok: false, gone: !/too long/.test(msg), status: 0, error: msg };
  }
  const headers = {
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aes128gcm",
    TTL: String(ttl),
    Urgency: urgency,
    Authorization: await authorization(sub.endpoint),
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(sub.endpoint, { method: "POST", headers, body, signal: ctrl.signal });
    const text = await res.text().catch(() => "");
    return { ok: res.status >= 200 && res.status < 300, gone: res.status === 404 || res.status === 410, status: res.status,
             error: res.ok ? "" : text.slice(0, 200) };
  } catch (e) {
    return { ok: false, gone: false, status: 0, error: String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}
