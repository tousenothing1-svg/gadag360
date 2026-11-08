// ── ALERTS (push notifications) ──
// Customers turn alerts on to hear about fresh arrivals, price drops and offers. The phone's browser gives a
// private push address, which we keep in Supabase (push_subscribe). public/sw.js shows each alert and opens the
// product when it's tapped; the admin panel's Notifications page sends them (supabase/functions/send-push).
//
// Android: works in Chrome as it is. iPhone (iOS 16.4+): only from the Home Screen app, so iPhone users in Safari see
// the steps to add it first. The Android/iOS app builds (Capacitor) don't get web alerts.
import React from "react";
import { Bell, X } from "lucide-react";

const C = { basil: "#1A6B3C", ink: "#1E2B22", soil: "#6B716A", line: "#E4E8E0", chili: "#D93A30", mint: "#EAF4ED" };
const body = "'Figtree', 'Noto Sans Kannada', system-ui, -apple-system, sans-serif";

const TXT = {
  en: {
    title: "Get alerts from Royal Harvest",
    text: "Be the first to know when fresh stock arrives, prices drop or there's an offer.",
    on: "Turn on alerts", busy: "Turning on…", close: "Close",
    done: "Alerts are on. We'll tell you when something fresh arrives.",
    blocked: "Alerts are blocked for this site. To get them, allow notifications for Royal Harvest in your browser or phone settings.",
    failed: "Couldn't turn alerts on. Please check your internet and try again.",
    iosTitle: "Get alerts on your iPhone",
    iosText: "First add Royal Harvest to your Home Screen:",
    iosSteps: ["Tap Share ⬆︎ at the bottom of Safari", "Choose “Add to Home Screen”", "Open Royal Harvest from your Home Screen and tap Turn on alerts"],
    row: "Alerts", rowSub: "Fresh arrivals, price drops and offers",
    stOn: "On", stOff: "Off", stBlocked: "Blocked", stIos: "Add to Home Screen",
  },
  kn: {
    title: "ರಾಯಲ್ ಹಾರ್ವೆಸ್ಟ್ ಅಲರ್ಟ್‌ಗಳನ್ನು ಪಡೆಯಿರಿ",
    text: "ತಾಜಾ ಸ್ಟಾಕ್ ಬಂದಾಗ, ಬೆಲೆ ಇಳಿದಾಗ ಅಥವಾ ಆಫರ್ ಇದ್ದಾಗ ಮೊದಲು ತಿಳಿಯಿರಿ.",
    on: "ಅಲರ್ಟ್ ಆನ್ ಮಾಡಿ", busy: "ಆನ್ ಆಗುತ್ತಿದೆ…", close: "ಮುಚ್ಚಿ",
    done: "ಅಲರ್ಟ್ ಆನ್ ಆಗಿದೆ. ತಾಜಾ ವಸ್ತು ಬಂದಾಗ ತಿಳಿಸುತ್ತೇವೆ.",
    blocked: "ಈ ಸೈಟ್‌ಗೆ ಅಲರ್ಟ್ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ. ಪಡೆಯಲು, ಬ್ರೌಸರ್ ಅಥವಾ ಫೋನ್ ಸೆಟ್ಟಿಂಗ್‌ನಲ್ಲಿ ರಾಯಲ್ ಹಾರ್ವೆಸ್ಟ್‌ಗೆ ನೋಟಿಫಿಕೇಶನ್ ಅನುಮತಿಸಿ.",
    failed: "ಅಲರ್ಟ್ ಆನ್ ಮಾಡಲು ಆಗಲಿಲ್ಲ. ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    iosTitle: "ನಿಮ್ಮ ಐಫೋನ್‌ನಲ್ಲಿ ಅಲರ್ಟ್ ಪಡೆಯಿರಿ",
    iosText: "ಮೊದಲು ರಾಯಲ್ ಹಾರ್ವೆಸ್ಟ್ ಅನ್ನು ಹೋಮ್ ಸ್ಕ್ರೀನ್‌ಗೆ ಸೇರಿಸಿ:",
    iosSteps: ["Safari ಕೆಳಗಿನ Share ⬆︎ ಒತ್ತಿ", "“Add to Home Screen” ಆಯ್ಕೆಮಾಡಿ", "ಹೋಮ್ ಸ್ಕ್ರೀನ್‌ನಿಂದ ರಾಯಲ್ ಹಾರ್ವೆಸ್ಟ್ ತೆರೆದು, ಅಲರ್ಟ್ ಆನ್ ಮಾಡಿ ಒತ್ತಿ"],
    row: "ಅಲರ್ಟ್‌ಗಳು", rowSub: "ತಾಜಾ ಸ್ಟಾಕ್, ಬೆಲೆ ಇಳಿಕೆ ಮತ್ತು ಆಫರ್‌ಗಳು",
    stOn: "ಆನ್", stOff: "ಆಫ್", stBlocked: "ನಿರ್ಬಂಧಿತ", stIos: "ಹೋಮ್ ಸ್ಕ್ರೀನ್‌ಗೆ ಸೇರಿಸಿ",
  },
};
export const alertsText = lang => TXT[lang] || TXT.en;

const ua = () => { try { return navigator.userAgent || ""; } catch (e) { return ""; } };
const isIOS = () => { try { return /iPad|iPhone|iPod/.test(ua()) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); } catch (e) { return false; } };
const iosVersion = () => { const m = /OS (\d+)_(\d+)/.exec(ua()); return m ? [Number(m[1]), Number(m[2])] : null; };
const isStandalone = () => { try { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch (e) { return false; } };
const isNative = () => { try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; } };
const permission = () => { try { return Notification.permission; } catch (e) { return "default"; } };

// "yes": alerts can be turned on here. "ios-install": iPhone in Safari, add to Home Screen first. "no": not possible.
export function alertsSupport() {
  if (typeof window === "undefined" || isNative()) return "no";
  if (isIOS()) {
    const v = iosVersion();
    if (v && (v[0] < 16 || (v[0] === 16 && v[1] < 4))) return "no";
    if (!isStandalone()) return "ios-install";
  }
  return window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "yes" : "no";
}

async function currentSub() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

// What to show: "on" | "off" | "blocked" | "ios-install" | "no"
export async function alertsState() {
  const s = alertsSupport();
  if (s !== "yes") return s;
  const p = permission();
  if (p === "denied") return "blocked";
  if (p !== "granted") return "off";
  try { return (await currentSub()) ? "on" : "off"; } catch (e) { return "off"; }
}

export function registerAlertsWorker() {
  if (alertsSupport() !== "yes") return;
  try { navigator.serviceWorker.register("/sw.js").catch(() => {}); } catch (e) {}
}

const keyBytes = b64 => {
  const s = String(b64).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, ch => ch.charCodeAt(0));
};
const sameKey = (buf, bytes) => {
  if (!buf) return false;
  const a = new Uint8Array(buf);
  return a.length === bytes.length && a.every((x, i) => x === bytes[i]);
};

// The shop's public push key (the sender makes the pair the very first time)
async function publicKey(rpc, fnUrl) {
  let k = await rpc("push_public_key", {}).catch(() => null);
  if (!k && fnUrl) {
    const r = await fetch(fnUrl).then(x => x.json()).catch(() => null);
    k = r && r.publicKey;
  }
  if (!k) throw new Error("no_key");
  return k;
}

// Turn alerts on. Call it straight from a tap: phones only ask for permission right after one.
export async function turnOnAlerts({ rpc, fnUrl, device, token, lang }) {
  const p = await Notification.requestPermission();
  if (p !== "granted") return p === "denied" ? "blocked" : "off";
  await navigator.serviceWorker.register("/sw.js");
  const reg = await navigator.serviceWorker.ready;
  const key = keyBytes(await publicKey(rpc, fnUrl));
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options && sub.options.applicationServerKey, key)) { await sub.unsubscribe().catch(() => {}); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const res = await rpc("push_subscribe", { p_device: device, p_token: token || null, p_sub: sub.toJSON(), p_lang: lang === "kn" ? "kn" : "en" });
  if (!res || !res.ok) throw new Error((res && res.error) || "not_saved");
  return "on";
}

export async function turnOffAlerts({ rpc, device }) {
  try {
    const sub = await currentSub();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      await rpc("push_unsubscribe", { p_device: device, p_endpoint: endpoint }).catch(() => {});
    }
  } catch (e) {}
  return alertsState();
}

// Keep the saved address up to date: the language alerts come in, and who is logged in
export async function refreshAlerts({ rpc, device, token, lang }) {
  if (alertsSupport() !== "yes" || permission() !== "granted") return;
  try {
    const sub = await currentSub();
    if (sub) await rpc("push_subscribe", { p_device: device, p_token: token || null, p_sub: sub.toJSON(), p_lang: lang === "kn" ? "kn" : "en" });
  } catch (e) {}
}

// The card on the home page: turn alerts on (or, on an iPhone in Safari, how to add the app first)
export function AlertsCard({ lang, state, busy, note, onTurnOn, onClose }) {
  const t = alertsText(lang);
  const ios = state === "ios-install";
  const title = ios ? t.iosTitle : t.title;
  return (
    <section aria-label={title} style={{ margin: "10px 12px 0", borderRadius: 18, border: `1px solid ${C.line}`,
      background: "linear-gradient(135deg, #EAF4ED 0%, #FBFDF9 100%)", fontFamily: body }}>
      <div style={{ position: "relative", display: "flex", gap: 12, padding: "14px 44px 14px 14px" }}>
        <span style={{ width: 40, height: 40, borderRadius: 20, background: "#fff", color: C.basil, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Bell size={20}/>
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: C.ink }}>{title}</div>
          {note ? (
            <div role="status" style={{ fontSize: 13.5, lineHeight: 1.45, marginTop: 3, color: note.ok ? C.basil : C.chili, fontWeight: note.ok ? 700 : 500 }}>{note.text}</div>
          ) : ios ? (<>
            <div style={{ fontSize: 13.5, color: "#4E5A50", lineHeight: 1.45, marginTop: 3 }}>{t.iosText}</div>
            <ol style={{ margin: "6px 0 0", paddingLeft: 20, fontSize: 13.5, color: C.ink, lineHeight: 1.55 }}>
              {t.iosSteps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </>) : (<>
            <div style={{ fontSize: 13.5, color: "#4E5A50", lineHeight: 1.45, marginTop: 3 }}>{t.text}</div>
            <button className="g-reset g-tap" onClick={onTurnOn} disabled={busy}
              style={{ marginTop: 10, height: 38, padding: "0 16px", borderRadius: 12, background: C.basil, color: "#fff", fontSize: 14, fontWeight: 700, opacity: busy ? 0.7 : 1 }}>
              {busy ? t.busy : t.on}
            </button>
          </>)}
        </div>
        <button className="g-reset" onClick={onClose} aria-label={t.close}
          style={{ position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", color: C.soil }}>
          <X size={17}/>
        </button>
      </div>
    </section>
  );
}

// The Alerts line in the account page: a switch when it can be turned on or off here
export function AlertsRow({ lang, state, busy, onToggle }) {
  const t = alertsText(lang);
  if (state !== "on" && state !== "off" && state !== "blocked" && state !== "ios-install") return null;
  const on = state === "on", sw = state === "on" || state === "off";
  return (
    <button onClick={onToggle} disabled={busy} {...(sw ? { role: "switch", "aria-checked": on } : {})}
      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 0", background: "none", border: "none",
        borderBottom: `1px solid ${C.line}`, cursor: "pointer", textAlign: "left", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 12, color: C.ink, minWidth: 0 }}>
        <span style={{ color: C.basil, display: "flex" }}><Bell size={16}/></span>
        <span>
          <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>{t.row}</span>
          <span style={{ display: "block", fontSize: 11.5, color: C.soil, marginTop: 1 }}>{t.rowSub}</span>
        </span>
      </span>
      {sw ? (
        <span aria-hidden="true" style={{ width: 42, height: 24, borderRadius: 12, background: on ? C.basil : "#CDD3CB", position: "relative", flexShrink: 0, transition: "background .2s" }}>
          <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .2s", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }}/>
        </span>
      ) : (
        <span style={{ fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap", borderRadius: 10, padding: "3px 8px",
          color: state === "blocked" ? C.chili : C.basil, background: state === "blocked" ? "#FDECEA" : C.mint }}>
          {state === "blocked" ? t.stBlocked : t.stIos}
        </span>
      )}
    </button>
  );
}
