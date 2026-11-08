// ── ALERTS (push notifications) ──
// Customers turn alerts on to hear about fresh arrivals, price drops and offers. The phone's browser gives a
// private push address, which we keep in Supabase (push_subscribe). public/sw.js shows each alert and opens the
// product when it's tapped; the admin panel's Notifications page sends them (supabase/functions/send-push).
//
// Android: works in Chrome as it is. iPhone (iOS 16.4+): only from the Home Screen app, so iPhone users in Safari see
// the steps to add it first. The Android/iOS app builds (Capacitor) don't get web alerts.
import React, { useEffect, useRef } from "react";
import { Bell, X } from "lucide-react";

const C = { basil: "#1A6B3C", ink: "#1E2B22", soil: "#6B716A", line: "#E4E8E0", chili: "#D93A30", mint: "#EAF4ED", gold: "#946500" };
const body = "'Figtree', 'Noto Sans Kannada', system-ui, -apple-system, sans-serif";
const accent = "'Baloo Tamma 2', 'Figtree', 'Noto Sans Kannada', system-ui, sans-serif";
const COL_LEFT = "max(0px, calc(50vw - 240px))"; // keeps overlays inside the 480px app column on desktop

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
    eyebrow: "ONE MORE THING", notNow: "Not now", ok: "OK",
    rows: [["🥬", "Fresh stock the moment it arrives"], ["📉", "Price drops on your favourites"], ["🎁", "Offers from Royal Harvest"]],
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
    eyebrow: "ಇನ್ನೊಂದು ವಿಷಯ", notNow: "ಈಗ ಬೇಡ", ok: "ಸರಿ",
    rows: [["🥬", "ತಾಜಾ ಸ್ಟಾಕ್ ಬಂದ ಕೂಡಲೇ"], ["📉", "ನಿಮ್ಮ ಇಷ್ಟದ ವಸ್ತುಗಳ ಬೆಲೆ ಇಳಿಕೆ"], ["🎁", "ರಾಯಲ್ ಹಾರ್ವೆಸ್ಟ್ ಆಫರ್‌ಗಳು"]],
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

// The sheet after a customer's first order: asks once to turn alerts on (iPhone in Safari: how to add the app first)
export function AlertsSheet({ lang, state, busy, note, onTurnOn, onClose }) {
  const t = alertsText(lang);
  const ios = state === "ios-install";
  const finished = !!note; // turned on, blocked or failed: the button just closes
  const btnRef = useRef(null);
  useEffect(() => { if (btnRef.current) btnRef.current.focus(); }, []);
  const title = ios ? t.iosTitle : t.title;
  return (
    <>
      <div className="g-fade" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,32,24,0.45)", zIndex: 120 }}/>
      <div role="dialog" aria-modal="true" aria-label={title} className="g-sheet"
        style={{ position: "fixed", left: COL_LEFT, right: COL_LEFT, bottom: 0, zIndex: 121, background: "#fff", borderRadius: "24px 24px 0 0",
          padding: "10px 20px calc(env(safe-area-inset-bottom, 0px) + 18px)", fontFamily: body, boxShadow: "0 -10px 30px rgba(30,43,34,0.16)" }}>
        <div aria-hidden="true" style={{ width: 40, height: 4, borderRadius: 2, background: "#D9DED3", margin: "0 auto 12px" }}/>
        <button className="g-reset" onClick={onClose} aria-label={t.close}
          style={{ position: "absolute", top: 12, right: 14, width: 36, height: 36, borderRadius: 18, background: "#F2F4EF", display: "flex", alignItems: "center", justifyContent: "center", color: C.ink }}>
          <X size={18}/>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingRight: 40 }}>
          <span style={{ width: 54, height: 54, borderRadius: 27, background: C.mint, color: C.basil, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Bell size={26}/>
          </span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.1, color: C.gold }}>{t.eyebrow}</div>
            <div style={{ fontFamily: accent, fontSize: 22, fontWeight: 700, lineHeight: 1.15, color: C.ink, marginTop: 2 }}>{title}</div>
          </div>
        </div>
        {note ? (
          <div role="status" style={{ marginTop: 14, fontSize: 15, lineHeight: 1.45, fontWeight: note.ok ? 700 : 500, color: note.ok ? C.basil : C.chili }}>{note.text}</div>
        ) : ios ? (<>
          <div style={{ fontSize: 14.5, color: C.soil, marginTop: 14 }}>{t.iosText}</div>
          <ol style={{ margin: "8px 0 0", paddingLeft: 22, fontSize: 15, color: C.ink, lineHeight: 1.6 }}>
            {t.iosSteps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </>) : (<>
          <div style={{ fontSize: 14.5, color: C.soil, marginTop: 14 }}>{t.text}</div>
          <div style={{ marginTop: 10, borderRadius: 16, background: "#F6F9F5", border: `1px solid ${C.line}` }}>
            {t.rows.map(([e, text], i) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderTop: i ? `1px solid ${C.line}` : "none" }}>
                <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 17, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{e}</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>{text}</span>
              </div>
            ))}
          </div>
        </>)}
        <button ref={btnRef} className="g-reset g-tap" onClick={finished || ios ? onClose : onTurnOn} disabled={busy}
          style={{ width: "100%", height: 54, marginTop: 16, borderRadius: 16, background: C.basil, color: "#fff", fontSize: 16, fontWeight: 800, textAlign: "center", opacity: busy ? 0.75 : 1 }}>
          {finished || ios ? t.ok : busy ? t.busy : t.on}
        </button>
        {!finished && !ios && (
          <button className="g-reset" onClick={onClose}
            style={{ width: "100%", padding: "14px 0 2px", fontSize: 15, fontWeight: 700, color: C.soil, textAlign: "center" }}>{t.notNow}</button>
        )}
      </div>
    </>
  );
}
