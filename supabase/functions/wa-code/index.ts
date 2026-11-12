// Royal Harvest: wa-code. WhatsApp sign-in codes for the customer app, and their settings page in the admin panel.
//
//   POST {action:"send", phone, device, lang}  -> the customer app: send a 6-digit code to this number on WhatsApp.
//        {ok:true, resend_in, expires_in} or {ok:false, error: wait|slow_down|off|not_set_up|bad_phone|send_failed}
//        "off" / "not_set_up": codes aren't on (or paused), so the app signs in the old way.
//   With the admin login (header x-staff-token):
//   POST {action:"admin_status"}               -> settings, how sending is going, and what Meta says
//   POST {action:"admin_setup"}                -> make the code template (English, Kannada) and the number's profile
//   POST {action:"admin_test", phone, lang}    -> send a test code (works while codes are off; can't be used to sign in)
//
// The Meta token lives only in the WHATSAPP_TOKEN secret (Supabase → Edge Functions → Secrets). Codes, limits and the
// on/off switch live in the database (supabase/19_whatsapp_codes.sql).
import { clientIp, makeGraph, metaStatus, sendCode, sendTest, setUp } from "./wa.js";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TOKEN = Deno.env.get("WHATSAPP_TOKEN") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-staff-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function rpc(name: string, args: Record<string, unknown>) {
  const headers: Record<string, string> = { apikey: SERVICE, "Content-Type": "application/json" };
  if (SERVICE.startsWith("eyJ")) headers.Authorization = `Bearer ${SERVICE}`;
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify(args) });
  const text = await res.text();
  if (!res.ok) throw new Error(`database ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const graph = makeGraph(fetch, TOKEN);
const deps = { rpc, graph };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { ok: false, error: "method" });
  try {
    if (!SB_URL || !SERVICE) return reply(500, { ok: false, error: "not_set_up" });
    const a = (await req.json().catch(() => null)) || {};
    if (a.action === "send") {
      return reply(200, await sendCode(deps, { phone: a.phone, device: a.device, lang: a.lang, ip: clientIp(req.headers) }));
    }

    const staff = req.headers.get("x-staff-token") || "";
    if (!staff) return reply(401, { ok: false, error: "login" });
    const me = await rpc("staff_me", { p_token: staff });
    if (!me || !me.ok || me.kind !== "admin") return reply(401, { ok: false, error: "login" });
    const cfg = await rpc("admin_wa_status", { p_token: staff });
    if (!cfg || !cfg.ok) return reply(401, { ok: false, error: "login" });

    if (a.action === "admin_status") {
      return reply(200, { ...cfg, token_saved: !!TOKEN, ...(TOKEN ? await metaStatus(deps, cfg) : { templates: [], number: null }) });
    }
    if (a.action === "admin_setup") return reply(200, await setUp(deps, cfg));
    if (a.action === "admin_test") {
      return reply(200, await sendTest(deps, { phone: a.phone, lang: a.lang, adminId: me.id || me.subject_id || "" }));
    }
    return reply(400, { ok: false, error: "action" });
  } catch (e) {
    console.error("wa-code", e);
    return reply(500, { ok: false, error: "server" });
  }
});
