// Royal Harvest: sign in with a WhatsApp code. The customer types their number, gets "123456 is your verification
// code" on WhatsApp from Royal Harvest, and types it here; a new customer also gives a name. This is how the shop
// knows the number on a cash-on-delivery order is really the customer's.
//
// The database checks everything (supabase/19_whatsapp_codes.sql) and the wa-code function sends the code.
// useCodeFlow holds the steps (phone -> code -> name); CodeSignInForm draws them for the account page and the
// checkout sheet, and the first-open screens (FirstOpen.js) draw them in their own style.
import { useEffect, useRef, useState } from "react";

export const CODE_TXT = {
  en: {
    phoneLabel: "Mobile number",
    phonePh: "10-digit number",
    getCode: "Get code on WhatsApp",
    sending: "Sending…",
    phoneNote: "We'll send a 6-digit code to this number on WhatsApp.",
    codeTitle: "Enter the 6-digit code",
    codeSub: p => `We sent it on WhatsApp to +91 ${p.slice(0, 5)} ${p.slice(5)}.`,
    codeHint: "Open WhatsApp, find the message from Royal Harvest, and tap Copy code.",
    codeLabel: "6-digit code",
    verify: "Verify",
    checking: "Checking…",
    resendIn: s => `Resend code in ${s}s`,
    resend: "Resend code",
    changeNumber: "Change number",
    nameTitle: "What should we call you?",
    nameSub: "So our riders know who they're delivering to.",
    nameLabel: "Your name",
    namePh: "Enter your name",
    cont: "Continue",
    wrong: n => (n > 0 ? `That code isn't right. ${n} ${n === 1 ? "try" : "tries"} left.` : "That code isn't right."),
    offline: "No connection. Please check your internet and try again.",
    err: {
      too_many: "Too many wrong tries. Please get a new code.",
      expired: "This code has expired. Please get a new code.",
      no_code: "This code has expired. Please get a new code.",
      slow_down: "Too many codes asked for this number. Please try again in an hour.",
      send_failed: "We couldn't send the code just now. Please try again in a minute.",
      bad_phone: "Enter a valid 10-digit mobile number.",
      bad_device: "Something went wrong. Please reopen the app and try again.",
      bad_name: "Please enter your name.",
      server: "Something went wrong. Please try again.",
    },
  },
  kn: {
    phoneLabel: "ಮೊಬೈಲ್ ನಂಬರ್",
    phonePh: "10 ಅಂಕಿ ನಂಬರ್",
    getCode: "ವಾಟ್ಸಾಪ್‌ನಲ್ಲಿ ಕೋಡ್ ಪಡೆಯಿರಿ",
    sending: "ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…",
    phoneNote: "ಈ ನಂಬರ್‌ಗೆ ವಾಟ್ಸಾಪ್‌ನಲ್ಲಿ 6 ಅಂಕಿಯ ಕೋಡ್ ಕಳುಹಿಸುತ್ತೇವೆ.",
    codeTitle: "6 ಅಂಕಿಯ ಕೋಡ್ ನಮೂದಿಸಿ",
    codeSub: p => `+91 ${p.slice(0, 5)} ${p.slice(5)} ಗೆ ವಾಟ್ಸಾಪ್‌ನಲ್ಲಿ ಕಳುಹಿಸಿದ್ದೇವೆ.`,
    codeHint: "ವಾಟ್ಸಾಪ್ ತೆರೆಯಿರಿ, ರಾಯಲ್ ಹಾರ್ವೆಸ್ಟ್‌ನ ಸಂದೇಶದಲ್ಲಿ Copy code ಒತ್ತಿ.",
    codeLabel: "6 ಅಂಕಿಯ ಕೋಡ್",
    verify: "ಪರಿಶೀಲಿಸಿ",
    checking: "ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ…",
    resendIn: s => `${s} ಸೆಕೆಂಡ್ ನಂತರ ಮತ್ತೆ ಕಳುಹಿಸಬಹುದು`,
    resend: "ಮತ್ತೆ ಕೋಡ್ ಕಳುಹಿಸಿ",
    changeNumber: "ನಂಬರ್ ಬದಲಾಯಿಸಿ",
    nameTitle: "ನಿಮ್ಮನ್ನು ಏನೆಂದು ಕರೆಯಲಿ?",
    nameSub: "ನಮ್ಮ ಡೆಲಿವರಿ ಹುಡುಗರಿಗೆ ಯಾರಿಗೆ ತಲುಪಿಸಬೇಕು ಎಂದು ತಿಳಿಯಲು.",
    nameLabel: "ನಿಮ್ಮ ಹೆಸರು",
    namePh: "ಹೆಸರು ನಮೂದಿಸಿ",
    cont: "ಮುಂದುವರೆಯಿರಿ",
    wrong: n => (n > 0 ? `ಕೋಡ್ ತಪ್ಪಾಗಿದೆ. ಇನ್ನೂ ${n} ಪ್ರಯತ್ನ ಉಳಿದಿದೆ.` : "ಕೋಡ್ ತಪ್ಪಾಗಿದೆ."),
    offline: "ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ ಇಲ್ಲ. ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    err: {
      too_many: "ಹಲವು ತಪ್ಪು ಪ್ರಯತ್ನಗಳು. ದಯವಿಟ್ಟು ಹೊಸ ಕೋಡ್ ಪಡೆಯಿರಿ.",
      expired: "ಈ ಕೋಡ್‌ನ ಅವಧಿ ಮುಗಿದಿದೆ. ದಯವಿಟ್ಟು ಹೊಸ ಕೋಡ್ ಪಡೆಯಿರಿ.",
      no_code: "ಈ ಕೋಡ್‌ನ ಅವಧಿ ಮುಗಿದಿದೆ. ದಯವಿಟ್ಟು ಹೊಸ ಕೋಡ್ ಪಡೆಯಿರಿ.",
      slow_down: "ಈ ನಂಬರ್‌ಗೆ ಹಲವು ಬಾರಿ ಕೋಡ್ ಕೇಳಲಾಗಿದೆ. ದಯವಿಟ್ಟು ಒಂದು ಗಂಟೆಯ ನಂತರ ಪ್ರಯತ್ನಿಸಿ.",
      send_failed: "ಈಗ ಕೋಡ್ ಕಳುಹಿಸಲು ಆಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಒಂದು ನಿಮಿಷದ ನಂತರ ಪ್ರಯತ್ನಿಸಿ.",
      bad_phone: "ಸರಿಯಾದ 10 ಅಂಕಿಯ ಮೊಬೈಲ್ ನಂಬರ್ ನಮೂದಿಸಿ.",
      bad_device: "ಏನೋ ತಪ್ಪಾಗಿದೆ. ಆ್ಯಪ್ ಮತ್ತೆ ತೆರೆದು ಪ್ರಯತ್ನಿಸಿ.",
      bad_name: "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹೆಸರು ನಮೂದಿಸಿ.",
      server: "ಏನೋ ತಪ್ಪಾಗಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    },
  },
};

const onlyDigits = (v, n) => String(v ?? "").replace(/\D/g, "").slice(-n);

// The steps, without any look: phone -> code -> name (only for a new customer).
//   sendCode(phone)              -> the wa-code function's answer ({ok, resend_in} or {ok:false, error, wait})
//   verifyCode(phone, code, name) -> customer_sign_in_code's answer ({ok, token, ...} or {ok:false, error, tries_left})
//   onDone(answer)               -> signed in
//   onFallback(phone)            -> codes are off right now: sign in the old way (phone + name)
export function useCodeFlow({ lang, initialPhone = "", sendCode, verifyCode, onDone, onFallback }) {
  const t = CODE_TXT[lang] || CODE_TXT.en;
  const [step, setStep] = useState("phone");
  const [phone, setPhoneRaw] = useState(() => onlyDigits(initialPhone, 10));
  const [code, setCodeRaw] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const goodCode = useRef(""); // the right code, kept for the name step
  const busyRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (step !== "code") return undefined;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [step]);

  const validPhone = /^[6-9]\d{9}$/.test(phone);
  const waitLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const start = () => { busyRef.current = true; setBusy(true); setError(""); };
  const stop = () => { busyRef.current = false; setBusy(false); };

  const setPhone = v => { setPhoneRaw(onlyDigits(v, 10)); setError(""); };

  const send = async () => {
    if (!validPhone || busyRef.current) return;
    start();
    let r = null;
    try { r = await sendCode(phone); } catch (e) { r = null; }
    if (!alive.current) return;
    stop();
    if (r && (r.ok || r.error === "wait")) { // "wait": a code went to this number moments ago, and it still works
      setCodeRaw(""); goodCode.current = "";
      setResendAt(Date.now() + (Number(r.ok ? r.resend_in : r.wait) || 30) * 1000);
      setNow(Date.now());
      setStep("code");
      return;
    }
    if (r && (r.error === "off" || r.error === "not_set_up")) { if (onFallback) onFallback(phone); return; }
    setError(!r ? t.offline : (t.err[r.error] || t.err.send_failed));
  };

  const finish = async (c, nm) => {
    if (busyRef.current) return;
    start();
    let r = null;
    try { r = await verifyCode(phone, c, nm); } catch (e) { r = null; }
    if (!alive.current) return;
    stop();
    if (r && r.ok) { if (onDone) onDone(r); return; }
    if (!r) { setError(t.offline); return; }
    if (r.error === "need_name") { goodCode.current = c; setStep("name"); return; }
    if (r.error === "wrong_code") { setCodeRaw(""); setError(t.wrong(Number(r.tries_left) || 0)); return; }
    if (r.error === "too_many" || r.error === "expired" || r.error === "no_code") {
      setCodeRaw(""); goodCode.current = "";
      setResendAt(0); setNow(Date.now()); // a new code can be asked for now
      setStep("code");
      setError(t.err[r.error]);
      return;
    }
    setError(t.err[r.error] || t.err.server);
  };

  // typing the 6th digit (or pasting the code) checks it straight away
  const setCode = v => {
    const c = String(v ?? "").replace(/\D/g, "").slice(0, 6);
    setCodeRaw(c); setError("");
    if (c.length === 6) finish(c, "");
  };
  const verifyNow = () => { if (code.length === 6) finish(code, ""); };
  const submitName = () => {
    if (!name.trim()) { setError(t.err.bad_name); return; }
    finish(goodCode.current, name.trim());
  };
  const resend = () => { if (waitLeft === 0) send(); };
  const changeNumber = () => { setStep("phone"); setCodeRaw(""); setError(""); goodCode.current = ""; };

  return { t, step, phone, setPhone, validPhone, code, setCode, verifyNow, name, setName, submitName,
           busy, error, waitLeft, send, resend, changeNumber };
}

const C = { basil: "#1A6B3C", ink: "#1E2B22", soil: "#6B716A", line: "#E4E8E0", chili: "#D93A30", mint: "#E8F5E9" };
const btn = on => ({
  width: "100%", padding: "14px", borderRadius: 14, border: "none", fontSize: 15, fontWeight: 800,
  backgroundColor: on ? C.basil : "#ccc", color: "white", cursor: on ? "pointer" : "not-allowed",
});
const linkBtn = { background: "none", border: "none", padding: "8px 4px", fontSize: 13, fontWeight: 700, color: C.basil, cursor: "pointer" };

function ErrorLine({ text }) {
  if (!text) return null;
  return <div role="alert" style={{ color: C.chili, fontSize: 13, fontWeight: 600, margin: "-6px 0 12px" }}>{text}</div>;
}

// The account page and the checkout sheet
export function CodeSignInForm({ lang, initialPhone, sendCode, verifyCode, onDone, onFallback }) {
  const f = useCodeFlow({ lang, initialPhone, sendCode, verifyCode, onDone, onFallback });
  const { t } = f;
  const codeRef = useRef(null);
  useEffect(() => { if (f.step === "code" && codeRef.current) codeRef.current.focus(); }, [f.step]);

  if (f.step === "phone") {
    return (
      <div data-step="phone">
        <div style={{ fontSize: 12, fontWeight: 600, color: C.soil, marginBottom: 6 }}>{t.phoneLabel}</div>
        <div style={{ display: "flex", borderRadius: 12, overflow: "hidden", border: `2px solid ${C.basil}`, marginBottom: 16 }}>
          <div style={{ padding: "12px 14px", backgroundColor: C.mint, color: C.basil, fontWeight: 700, fontSize: 14 }}>+91</div>
          <input type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={16} value={f.phone}
            onChange={e => f.setPhone(e.target.value)} onKeyDown={e => { if (e.key === "Enter") f.send(); }}
            placeholder={t.phonePh} aria-label={t.phoneLabel}
            style={{ flex: 1, minWidth: 0, padding: "12px 14px", border: "none", outline: "none", fontSize: 15, color: C.ink }}/>
        </div>
        <ErrorLine text={f.error}/>
        <button onClick={f.send} disabled={!f.validPhone || f.busy} style={btn(f.validPhone && !f.busy)}>
          {f.busy ? t.sending : `${t.getCode} →`}
        </button>
        <div style={{ fontSize: 12, color: C.soil, marginTop: 10, textAlign: "center" }}>{t.phoneNote}</div>
      </div>
    );
  }

  if (f.step === "code") {
    return (
      <div data-step="code">
        <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{t.codeTitle}</div>
        <div style={{ fontSize: 13, color: C.soil, margin: "4px 0 4px" }}>{t.codeSub(f.phone)}</div>
        <div style={{ fontSize: 12, color: C.soil, marginBottom: 14 }}>{t.codeHint}</div>
        <input ref={codeRef} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6}
          value={f.code} onChange={e => f.setCode(e.target.value)} onKeyDown={e => { if (e.key === "Enter") f.verifyNow(); }}
          placeholder="••••••" aria-label={t.codeLabel} disabled={f.busy}
          style={{ width: "100%", boxSizing: "border-box", padding: "14px", borderRadius: 14, border: `2px solid ${f.error ? C.chili : C.basil}`,
            outline: "none", fontSize: 26, fontWeight: 800, letterSpacing: 10, textAlign: "center", color: C.ink, marginBottom: 16,
            fontVariantNumeric: "tabular-nums" }}/>
        <ErrorLine text={f.error}/>
        <button onClick={f.verifyNow} disabled={f.code.length !== 6 || f.busy} style={btn(f.code.length === 6 && !f.busy)}>
          {f.busy ? t.checking : t.verify}
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 8 }}>
          <button onClick={f.changeNumber} style={linkBtn}>← {t.changeNumber}</button>
          {f.waitLeft > 0
            ? <span aria-live="polite" style={{ fontSize: 13, color: C.soil }}>{t.resendIn(f.waitLeft)}</span>
            : <button onClick={f.resend} disabled={f.busy} style={linkBtn}>{t.resend}</button>}
        </div>
      </div>
    );
  }

  return (
    <div data-step="name">
      <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{t.nameTitle}</div>
      <div style={{ fontSize: 13, color: C.soil, margin: "4px 0 14px" }}>{t.nameSub}</div>
      <input type="text" autoComplete="name" autoCapitalize="words" maxLength={40} value={f.name} autoFocus
        onChange={e => f.setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") f.submitName(); }}
        placeholder={t.namePh} aria-label={t.nameLabel}
        style={{ width: "100%", boxSizing: "border-box", padding: "14px", borderRadius: 14, border: `2px solid ${C.basil}`, outline: "none",
          fontSize: 16, color: C.ink, marginBottom: 16 }}/>
      <ErrorLine text={f.error}/>
      <button onClick={f.submitName} disabled={!f.name.trim() || f.busy} style={btn(!!f.name.trim() && !f.busy)}>
        {f.busy ? t.checking : `${t.cont} →`}
      </button>
    </div>
  );
}
