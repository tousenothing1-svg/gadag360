// Royal Harvest: WhatsApp sign-in codes, sent straight through Meta's WhatsApp Cloud API (no partner company).
// Plain JavaScript on fetch only, so the same file runs in Supabase (Deno) and in Node for the tests.
//
// The database decides everything about a code (supabase/19_whatsapp_codes.sql): this file only asks it for one,
// hands it to WhatsApp and reports what WhatsApp said.

export const GRAPH = "https://graph.facebook.com/v25.0";
export const TEMPLATE_LANGS = ["en", "kn"];

// Meta's error, short enough for the admin panel: "131030: Recipient phone number not in allowed list"
export function metaError(json, status) {
  const e = json && json.error;
  if (!e) return status ? `http ${status}` : "no answer";
  const why = (e.error_data && e.error_data.details) || e.error_user_msg || e.message || "";
  return `${e.code || status}${e.error_subcode ? "/" + e.error_subcode : ""}: ${String(why).replace(/\s+/g, " ").slice(0, 220)}`;
}

// One call to Meta's Graph API with the WhatsApp token. Never throws.
export function makeGraph(fetchFn, token, timeoutMs = 10000) {
  return async function graph(method, path, body) {
    if (!token) return { ok: false, status: 0, json: null, error: "WHATSAPP_TOKEN secret is missing in Supabase" };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchFn(`${GRAPH}/${path}`, {
        method, signal: ctrl.signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      const ok = res.status >= 200 && res.status < 300 && !(json && json.error);
      return { ok, status: res.status, json, error: ok ? "" : metaError(json, res.status) };
    } catch (e) {
      const msg = e && e.name === "AbortError" ? "WhatsApp didn't answer in time" : String((e && e.message) || e);
      return { ok: false, status: 0, json: null, error: msg.slice(0, 220) };
    } finally {
      clearTimeout(timer);
    }
  };
}

// The code message: Meta's ready-made authentication template ("123456 is your verification code" + a Copy code
// button). The code goes in twice: once for the text, once for the button.
export function codeMessage(to, template, lang, code) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: template,
      language: { code: TEMPLATE_LANGS.includes(lang) ? lang : "en" },
      components: [
        { type: "body", parameters: [{ type: "text", text: code }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
      ],
    },
  };
}

// The template, made once per language from the admin panel. Meta writes the words itself.
export function templateBody(name, lang) {
  return {
    name,
    language: lang,
    category: "AUTHENTICATION",
    message_send_ttl_seconds: 600, // not delivered within 10 minutes: dropped, the code has run out anyway
    components: [
      { type: "BODY", add_security_recommendation: true }, // "For your security, do not share this code."
      { type: "FOOTER", code_expiration_minutes: 10 },     // "This code expires in 10 minutes."
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE" }] },
    ],
  };
}

// "919035068924" -> "+91 90350 68924"
export const prettyPhone = p => {
  const d = String(p || "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : "";
};

// The WhatsApp profile of the sending number, so a customer who replies knows where help is
export function profileBody(helpPhone) {
  const call = prettyPhone(helpPhone);
  return {
    messaging_product: "whatsapp",
    about: (call ? `Royal Harvest sign-in codes. For help, call ${call}.` : "Royal Harvest sign-in codes.").slice(0, 139),
    description: "Fresh fruits, vegetables and daily essentials delivered in Gadag, Betageri and Hulkoti in 20–30 minutes.",
    websites: ["https://royalharvest.co.in"],
    vertical: "GROCERY",
  };
}

// Send the code the database just made, then tell the database how it went.
// issued: what wa_code_issue returned ({id, code, to, lang, template, phone_number_id}).
export async function deliver({ rpc, graph }, issued, { detail = false } = {}) {
  let s = await graph("POST", `${issued.phone_number_id}/messages`,
    codeMessage(issued.to, issued.template, issued.lang, issued.code));
  if (!s.ok && issued.lang !== "en") { // no Kannada template yet, or it's still waiting for Meta: send it in English
    s = await graph("POST", `${issued.phone_number_id}/messages`, codeMessage(issued.to, issued.template, "en", issued.code));
  }
  const id = s.ok && s.json && Array.isArray(s.json.messages) && s.json.messages[0] ? String(s.json.messages[0].id || "") : null;
  try { await rpc("wa_code_result", { p_id: issued.id, p_ok: s.ok, p_error: s.ok ? null : s.error, p_message_id: id }); }
  catch (e) { /* the code went (or not) either way; the admin panel just misses this one */ }
  if (s.ok) return { ok: true, resend_in: 30, expires_in: 600 };
  return detail ? { ok: false, error: "send_failed", detail: s.error } : { ok: false, error: "send_failed" };
}

const cleanPhone = p => String(p ?? "").replace(/\D/g, "").slice(-10);
const cleanLang = l => (l === "kn" ? "kn" : "en");

// A customer asks for a code. Every limit and the on/off switch are checked in the database.
export async function sendCode(deps, { phone, device, lang, ip }) {
  const issued = await deps.rpc("wa_code_issue", {
    p_phone: cleanPhone(phone), p_device: String(device ?? "").slice(0, 128), p_ip: String(ip ?? "").slice(0, 64),
    p_lang: cleanLang(lang), p_test: false,
  });
  if (!issued || !issued.ok) return issued && issued.error ? issued : { ok: false, error: "server" };
  return deliver(deps, issued);
}

// The admin panel's "Send a test code": works before codes are on, and the code can't be used to sign in
export async function sendTest(deps, { phone, lang, adminId }) {
  const device = `admin-test-${String(adminId || "admin").replace(/[^A-Za-z0-9_-]/g, "")}`.padEnd(16, "0").slice(0, 128);
  const issued = await deps.rpc("wa_code_issue", {
    p_phone: cleanPhone(phone), p_device: device, p_ip: "", p_lang: cleanLang(lang), p_test: true,
  });
  if (!issued || !issued.ok) return issued && issued.error ? issued : { ok: false, error: "server" };
  return deliver(deps, issued, { detail: true });
}

// Make the template in English and Kannada (once; doing it again changes nothing) and fill in the number's profile
export async function setUp({ graph }, cfg) {
  if (!cfg.waba_id || !cfg.phone_number_id) return { ok: false, error: "not_set_up" };
  const templates = [];
  for (const lang of TEMPLATE_LANGS) {
    const r = await graph("POST", `${cfg.waba_id}/message_templates`, templateBody(cfg.template, lang));
    const exists = !r.ok && /already exists|2388023|2388024/i.test(r.error);
    templates.push({ lang, ok: r.ok || exists, status: r.ok ? String((r.json && r.json.status) || "PENDING") : exists ? "EXISTS" : "",
                     error: r.ok || exists ? "" : r.error });
  }
  const p = await graph("POST", `${cfg.phone_number_id}/whatsapp_business_profile`, profileBody(cfg.help_phone));
  return { ok: templates.some(t => t.ok), templates, profile: { ok: p.ok, error: p.error } };
}

// What Meta says about the template and the sending number, for the admin panel
export async function metaStatus({ graph }, cfg) {
  const out = { templates: [], number: null, meta_error: "" };
  if (cfg.waba_id) {
    const t = await graph("GET", `${cfg.waba_id}/message_templates?name=${encodeURIComponent(cfg.template)}&fields=name,language,status,rejected_reason&limit=20`);
    if (t.ok) {
      out.templates = ((t.json && t.json.data) || [])
        .filter(x => x && x.name === cfg.template)
        .map(x => ({ lang: String(x.language || ""), status: String(x.status || ""), rejected_reason: x.rejected_reason || "" }));
    } else out.meta_error = t.error;
  }
  if (cfg.phone_number_id) {
    const n = await graph("GET", `${cfg.phone_number_id}?fields=display_phone_number,verified_name,quality_rating,name_status,code_verification_status`);
    if (n.ok) {
      const j = n.json || {};
      out.number = { display: j.display_phone_number || "", name: j.verified_name || "", quality: j.quality_rating || "",
                     name_status: j.name_status || "", verification: j.code_verification_status || "" };
    } else if (!out.meta_error) out.meta_error = n.error;
  }
  return out;
}

// The internet address the request came from (only a hash is kept, for the per-address limit)
export function clientIp(headers) {
  const get = k => (headers && typeof headers.get === "function" ? headers.get(k) : null) || "";
  return (get("cf-connecting-ip") || get("x-real-ip") || get("x-forwarded-for").split(",")[0] || "").trim().slice(0, 64);
}
