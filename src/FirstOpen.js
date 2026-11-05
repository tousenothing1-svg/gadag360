// ── FIRST OPEN ──
// What a new customer sees the first time they open Royal Harvest:
// welcome → phone → name → location → three quick questions → brand promise → shop.
// Every step after the welcome can be skipped. Plus three home extras: the welcome
// offer sheet, a one-time tip on the category tab, and a notice when the customer
// is outside the delivery area.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, MapPin, Truck, X, Globe } from "lucide-react";

const C = {
  basil: "#1A6B3C", basilDark: "#124D2A", haldi: "#F2B53A", gold: "#946500", ink: "#1E2B22",
  soil: "#6B716A", line: "#E4E8E0", chili: "#D93A30", mint: "#EAF4ED",
};
const accent = "'Baloo Tamma 2', 'Figtree', 'Noto Sans Kannada', system-ui, sans-serif";
const body = "'Figtree', 'Noto Sans Kannada', system-ui, -apple-system, sans-serif";
const COL_LEFT = "max(0px, calc(50vw - 240px))"; // keeps overlays inside the 480px app column on desktop
const LIGHT_BG = "radial-gradient(120% 60% at 100% 0%, rgba(242,181,58,0.16) 0%, rgba(242,181,58,0) 60%), linear-gradient(180deg, #FBF8EF 0%, #F2F5F1 100%)";

const reduceMotion = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
};
// Split text into letters the way people see them (Kannada vowel signs stay attached)
const graphemes = (s, lang) => {
  try { if (Intl.Segmenter) return [...new Intl.Segmenter(lang === "kn" ? "kn" : "en", { granularity: "grapheme" }).segment(s)].map(x => x.segment); } catch (e) {}
  return Array.from(s);
};

const TXT = {
  en: {
    dialog: "Welcome to Royal Harvest",
    other: "ಕನ್ನಡ",
    welcomeTo: "Welcome to",
    tagline: "Fresh fruits, vegetables and daily essentials, delivered to your door in 2 hours.",
    badges: ["Fresh daily", "2-hour delivery", "Pay on delivery"],
    start: "Let's get started",
    back: "Back", skip: "Skip",
    phoneTitle: "What's your phone number?",
    phoneSub: "We'll send your order updates here.",
    phonePh: "10-digit mobile number",
    phoneBad: "Enter a valid 10-digit mobile number",
    consent: "By continuing, you agree to our Terms and Privacy Policy.",
    cont: "Continue",
    nameTitle: "What should we call you?",
    nameSub: "So our riders and team know who they're delivering to.",
    namePh: "Your name",
    almost: "ALMOST READY",
    locTitle: "Let's find your doorstep",
    b1t: "Delivery to your exact door", b1d: "Your location helps our rider reach you without phone calls.",
    b2t: "Know if we deliver to you", b2d: "We'll check that Royal Harvest serves your area.",
    allowLoc: "Allow location", finding: "Finding you…", notNow: "Not now",
    step: (i, n) => `Question ${i} of ${n}`,
    q1: "Who do you shop for?", q1s: "So we can suggest the right quantities.",
    q2: "What do you eat?", q2s: "Choose all that apply.",
    q3: "What matters most to you?", q3s: "Pick as many as you like.",
    done: "Done",
    promise: ["Harvested fresh every morning.", "Delivered to your door like royalty."],
    shop: "Start shopping",
  },
  kn: {
    dialog: "ರಾಯಲ್ ಹಾರ್ವೆಸ್ಟ್‌ಗೆ ಸ್ವಾಗತ",
    other: "English",
    welcomeTo: "ನಿಮಗೆ ಸ್ವಾಗತ",
    tagline: "ತಾಜಾ ಹಣ್ಣು, ತರಕಾರಿ ಮತ್ತು ದಿನಸಿ, 2 ಗಂಟೆಯೊಳಗೆ ನಿಮ್ಮ ಮನೆ ಬಾಗಿಲಿಗೆ.",
    badges: ["ಪ್ರತಿದಿನ ತಾಜಾ", "2 ಗಂಟೆ ಡೆಲಿವರಿ", "ಡೆಲಿವರಿ ವೇಳೆ ಪಾವತಿ"],
    start: "ಶುರು ಮಾಡೋಣ",
    back: "ಹಿಂದೆ", skip: "ಬಿಟ್ಟುಬಿಡಿ",
    phoneTitle: "ನಿಮ್ಮ ಮೊಬೈಲ್ ನಂಬರ್ ಏನು?",
    phoneSub: "ಆರ್ಡರ್ ಮಾಹಿತಿಯನ್ನು ಈ ನಂಬರ್‌ಗೆ ಕಳುಹಿಸುತ್ತೇವೆ.",
    phonePh: "10 ಅಂಕಿಯ ಮೊಬೈಲ್ ನಂಬರ್",
    phoneBad: "ಸರಿಯಾದ 10 ಅಂಕಿಯ ಮೊಬೈಲ್ ನಂಬರ್ ನಮೂದಿಸಿ",
    consent: "ಮುಂದುವರಿಯುವ ಮೂಲಕ ನಮ್ಮ ನಿಯಮಗಳು ಮತ್ತು ಗೌಪ್ಯತಾ ನೀತಿಗೆ ಒಪ್ಪುತ್ತೀರಿ.",
    cont: "ಮುಂದುವರಿಸಿ",
    nameTitle: "ನಿಮ್ಮನ್ನು ಏನೆಂದು ಕರೆಯಲಿ?",
    nameSub: "ಯಾರಿಗೆ ಡೆಲಿವರಿ ಮಾಡುತ್ತಿದ್ದೇವೆ ಎಂದು ನಮ್ಮ ತಂಡಕ್ಕೆ ತಿಳಿಯಲು.",
    namePh: "ನಿಮ್ಮ ಹೆಸರು",
    almost: "ಬಹುತೇಕ ಸಿದ್ಧ",
    locTitle: "ನಿಮ್ಮ ಮನೆ ಬಾಗಿಲನ್ನು ಹುಡುಕೋಣ",
    b1t: "ನಿಖರವಾಗಿ ನಿಮ್ಮ ಮನೆ ಬಾಗಿಲಿಗೆ", b1d: "ನಿಮ್ಮ ಸ್ಥಳದಿಂದ ನಮ್ಮ ರೈಡರ್ ಕರೆ ಮಾಡದೆ ನಿಮ್ಮನ್ನು ತಲುಪುತ್ತಾರೆ.",
    b2t: "ನಿಮ್ಮ ಪ್ರದೇಶಕ್ಕೆ ಡೆಲಿವರಿ ಇದೆಯೇ?", b2d: "ನಿಮ್ಮ ಪ್ರದೇಶಕ್ಕೆ ನಾವು ಡೆಲಿವರಿ ಮಾಡುತ್ತೇವೆಯೇ ಎಂದು ಪರಿಶೀಲಿಸುತ್ತೇವೆ.",
    allowLoc: "ಸ್ಥಳಕ್ಕೆ ಅನುಮತಿ ನೀಡಿ", finding: "ಹುಡುಕುತ್ತಿದ್ದೇವೆ…", notNow: "ಈಗ ಬೇಡ",
    step: (i, n) => `ಪ್ರಶ್ನೆ ${i} / ${n}`,
    q1: "ನೀವು ಯಾರಿಗಾಗಿ ಖರೀದಿಸುತ್ತೀರಿ?", q1s: "ಸರಿಯಾದ ಪ್ರಮಾಣ ಸೂಚಿಸಲು ಇದು ಸಹಾಯ ಮಾಡುತ್ತದೆ.",
    q2: "ನಿಮ್ಮ ಆಹಾರ ಪದ್ಧತಿ ಏನು?", q2s: "ಅನ್ವಯಿಸುವ ಎಲ್ಲವನ್ನೂ ಆರಿಸಿ.",
    q3: "ನಿಮಗೆ ಯಾವುದು ಮುಖ್ಯ?", q3s: "ಎಷ್ಟು ಬೇಕಾದರೂ ಆರಿಸಿ.",
    done: "ಮುಗಿಸಿ",
    promise: ["ಪ್ರತಿದಿನ ಬೆಳಿಗ್ಗೆ ತಾಜಾ ಕೊಯ್ಲು.", "ರಾಜಮರ್ಯಾದೆಯಿಂದ ನಿಮ್ಮ ಮನೆ ಬಾಗಿಲಿಗೆ."],
    shop: "ಶಾಪಿಂಗ್ ಆರಂಭಿಸಿ",
  },
};

const HOUSEHOLD = [
  { id: "just_me", e: "🙋", en: "Just me", kn: "ನಾನು ಮಾತ್ರ" },
  { id: "couple", e: "👫", en: "Me & my partner", kn: "ನಾನು ಮತ್ತು ಸಂಗಾತಿ" },
  { id: "kids", e: "👨‍👩‍👧", en: "Family with kids", kn: "ಮಕ್ಕಳಿರುವ ಕುಟುಂಬ" },
  { id: "joint", e: "🏡", en: "Joint family", kn: "ಅವಿಭಕ್ತ ಕುಟುಂಬ" },
  { id: "flatmates", e: "🏢", en: "Flatmates", kn: "ರೂಮ್‌ಮೇಟ್‌ಗಳು" },
];
const DIET = [
  { id: "veg", e: "🥦", en: "Vegetarian", kn: "ಸಸ್ಯಾಹಾರಿ" },
  { id: "egg", e: "🥚", en: "Eggetarian", kn: "ಮೊಟ್ಟೆ ಸಹಿತ ಸಸ್ಯಾಹಾರಿ" },
  { id: "nonveg", e: "🍗", en: "Non-vegetarian", kn: "ಮಾಂಸಾಹಾರಿ" },
  { id: "vegan", e: "🌱", en: "Vegan", kn: "ವೀಗನ್" },
  { id: "jain", e: "🍃", en: "Jain food", kn: "ಜೈನ ಆಹಾರ" },
  { id: "protein", e: "💪", en: "High protein", kn: "ಹೆಚ್ಚು ಪ್ರೋಟೀನ್" },
];
const VALUES = [
  { id: "fresh", e: "🌿", en: "Freshness", kn: "ತಾಜಾತನ" },
  { id: "organic", e: "🌾", en: "Organic", kn: "ಸಾವಯವ" },
  { id: "no_pesticide", e: "🐞", en: "Pesticide-free", kn: "ಕೀಟನಾಶಕ ರಹಿತ" },
  { id: "price", e: "🏷️", en: "Best price", kn: "ಉತ್ತಮ ಬೆಲೆ" },
  { id: "local", e: "👨‍🌾", en: "Local farmers", kn: "ಸ್ಥಳೀಯ ರೈತರು" },
  { id: "fast", e: "⚡", en: "Quick delivery", kn: "ಬೇಗ ಡೆಲಿವರಿ" },
];

// Product photos for the welcome collage: [photo, left %, top %, width %, tilt]
const COLLAGE = [
  ["p55", 1, 3, 46, -7],
  ["p31", 53, 0, 46, 6],
  ["p91", 0, 61, 44, 5],
  ["p52", 56, 59, 44, -6],
  ["p63", 19, 27, 62, -2],
];

const h1 = { fontFamily: accent, fontSize: 28, fontWeight: 700, lineHeight: 1.15, color: C.ink, margin: 0 };
const sub = { fontSize: 15, color: C.soil, lineHeight: 1.45, marginTop: 8 };

function PrimaryButton({ children, disabled, busy, onClick, style }) {
  return (
    <button className="g-reset g-tap" onClick={onClick} disabled={disabled || busy}
      style={{ width: "100%", height: 56, borderRadius: 16, background: disabled ? "#DDE3DA" : C.basil, color: disabled ? "#8A9287" : "#fff",
        fontSize: 16.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center",
        boxShadow: disabled ? "none" : "0 8px 20px rgba(26,107,60,0.28)", transition: "background .2s, box-shadow .2s", ...style }}>
      {busy && <span className="g-spin" aria-hidden="true"/>}
      {children}
    </button>
  );
}

function TopBar({ t, onBack, onSkip, skipLabel, progress }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 44 }}>
      {onBack ? (
        <button className="g-reset" onClick={onBack} aria-label={t.back}
          style={{ width: 40, height: 40, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.8)", color: C.ink, flexShrink: 0 }}>
          <ArrowLeft size={20}/>
        </button>
      ) : <span style={{ width: 40, flexShrink: 0 }}/>}
      <div style={{ flex: 1, display: "flex", gap: 6 }}>
        {progress && Array.from({ length: progress.of }, (_, i) => (
          <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < progress.at ? C.basil : "#DCE3D8", transition: "background .3s" }}/>
        ))}
      </div>
      {onSkip ? (
        <button className="g-reset" onClick={onSkip} style={{ fontSize: 14, fontWeight: 700, color: C.soil, padding: "8px 4px", flexShrink: 0 }}>{skipLabel || t.skip}</button>
      ) : <span style={{ width: 40, flexShrink: 0 }}/>}
    </div>
  );
}

function Chip({ item, lang, on, onClick }) {
  return (
    <button className="g-reset g-tap" onClick={onClick} aria-pressed={on}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, padding: "6px 14px 6px 12px", borderRadius: 22,
        border: `1.5px solid ${on ? C.basil : C.line}`, background: on ? C.mint : "#fff", color: on ? C.basilDark : C.ink,
        fontSize: 15, fontWeight: on ? 700 : 600, transition: "background .15s, border-color .15s" }}>
      <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>{item.e}</span>
      {item[lang] || item.en}
      {on && <Check size={15} strokeWidth={3} style={{ color: C.basil }}/>}
    </button>
  );
}

function Benefit({ Icon, title, text }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginTop: 18 }}>
      <span style={{ width: 42, height: 42, borderRadius: 21, background: C.mint, color: C.basil, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={20}/>
      </span>
      <div>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 14, color: C.soil, lineHeight: 1.45, marginTop: 2 }}>{text}</div>
      </div>
    </div>
  );
}

// A map card with a pin and a rider coming down a dotted route
function LocationArt() {
  return (
    <svg viewBox="0 0 240 180" width="240" height="180" role="img" aria-hidden="true" style={{ display: "block", margin: "8px auto 0" }}>
      <circle cx="120" cy="92" r="84" fill="#E5F1E8"/>
      <g transform="rotate(-7 120 96)">
        <rect x="52" y="44" width="136" height="104" rx="18" fill="#fff" stroke="#CFE3D4" strokeWidth="2"/>
        <path d="M52 80 H188 M52 116 H188 M98 44 V148 M146 44 V148" stroke="#EDF2EA" strokeWidth="8"/>
        <path d="M78 128 C 96 112, 110 124, 124 96" stroke={C.basil} strokeWidth="3.5" strokeDasharray="1 8" strokeLinecap="round" fill="none"/>
        <circle cx="78" cy="128" r="9" fill={C.haldi} stroke="#fff" strokeWidth="3"/>
      </g>
      <path d="M128 22c-16 0-29 13-29 29 0 22 29 50 29 50s29-28 29-50c0-16-13-29-29-29z" fill="#D9482B" stroke="#fff" strokeWidth="4"/>
      <circle cx="128" cy="51" r="10" fill="#fff"/>
    </svg>
  );
}

function Collage() {
  return (
    <div aria-hidden="true" className="g-ob-collage" style={{ position: "relative", aspectRatio: "1.15", margin: "14px auto 6px" }}>
      {COLLAGE.map(([id, left, top, width, r], i) => (
        <div key={id} className="g-ob-card"
          style={{ position: "absolute", left: `${left}%`, top: `${top}%`, width: `${width}%`, "--r": `${r}deg`, animationDelay: `${i * -0.9}s`,
            zIndex: i === COLLAGE.length - 1 ? 3 : 1 + (i > 1 ? 1 : 0), background: "#fff", padding: 5, borderRadius: 16, boxShadow: "0 12px 26px rgba(30,43,34,0.16)" }}>
          <img src={`/products/${id}.jpg`} alt="" draggable="false"
            style={{ display: "block", width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 12, background: "#F5F7F2" }}/>
        </div>
      ))}
    </div>
  );
}

export function Onboarding({ lang, setLang, onSignIn, onSavePrefs, onLocation, onDone }) {
  const t = TXT[lang] || TXT.en;
  const [step, setStep] = useState("welcome");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [household, setHousehold] = useState(null);
  const [diet, setDiet] = useState([]);
  const [values, setValues] = useState([]);
  const userIdRef = useRef(null);
  const scrollRef = useRef(null);
  const validPhone = /^[6-9]\d{9}$/.test(phone);

  // Each step starts at the top, and the page behind doesn't scroll
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [step]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const signIn = async nm => {
    setBusy(true);
    try { userIdRef.current = await onSignIn(phone, nm); } catch (e) {}
    setBusy(false);
    setStep("location");
  };
  const askLocation = () => {
    if (!navigator.geolocation) { setStep("q1"); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setBusy(false);
        onLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy), at: Date.now() });
        setStep("q1");
      },
      () => { setBusy(false); setStep("q1"); },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
    );
  };
  const finishQuestions = () => {
    if (household || diet.length || values.length) onSavePrefs({ household, diet, values, at: new Date().toISOString() }, userIdRef.current);
    setStep("promise");
  };
  const toggle = (list, set, id) => set(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  const dark = step === "promise";
  let content;

  if (step === "welcome") {
    content = (
      <>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="g-reset" onClick={() => setLang(lang === "en" ? "kn" : "en")}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700, color: C.ink, background: "rgba(255,255,255,0.85)",
              border: `1px solid ${C.line}`, borderRadius: 18, padding: "7px 12px" }}>
            <Globe size={15}/>{t.other}
          </button>
        </div>
        <div className="g-in" style={{ textAlign: "center", marginTop: 4 }}>
          <img src="/logo192.png" alt="" width={68} height={68} style={{ borderRadius: 18, boxShadow: "0 8px 20px rgba(26,107,60,0.25)" }}/>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.soil, marginTop: 12 }}>{t.welcomeTo}</div>
          <h1 style={{ ...h1, fontSize: 38, lineHeight: 1.05, marginTop: 2 }}>
            <span style={{ color: C.gold }}>Royal</span> <span style={{ color: C.basil }}>Harvest</span>
          </h1>
          <p style={{ ...sub, fontSize: 15.5, maxWidth: 330, margin: "10px auto 0" }}>{t.tagline}</p>
        </div>
        <Collage/>
        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", columnGap: 14, rowGap: 6, margin: "6px 0 18px" }}>
          {t.badges.map(b => (
            <span key={b} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13.5, fontWeight: 700, color: C.basilDark, whiteSpace: "nowrap" }}>
              <Check size={15} strokeWidth={3} style={{ color: C.basil }}/>{b}
            </span>
          ))}
        </div>
        <div style={{ flex: 1 }}/>
        <PrimaryButton onClick={() => setStep("phone")}>{t.start}</PrimaryButton>
      </>
    );
  } else if (step === "phone") {
    content = (
      <>
        <TopBar t={t} onBack={() => setStep("welcome")} onSkip={() => setStep("location")}/>
        <div className="g-in" style={{ marginTop: 28 }}>
          <h1 style={h1}>{t.phoneTitle}</h1>
          <p style={sub}>{t.phoneSub}</p>
          <label style={{ display: "flex", alignItems: "center", height: 58, marginTop: 24, background: "#fff", borderRadius: 16,
            border: `2px solid ${phone ? C.basil : C.line}`, overflow: "hidden" }}>
            <span style={{ padding: "0 12px 0 16px", fontSize: 18, fontWeight: 700, color: C.ink, borderRight: `1px solid ${C.line}`, alignSelf: "stretch", display: "flex", alignItems: "center" }}>+91</span>
            <input type="tel" inputMode="numeric" pattern="[0-9]*" autoComplete="tel-national" autoFocus maxLength={10}
              value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(-10))}
              onKeyDown={e => { if (e.key === "Enter" && validPhone) setStep("name"); }}
              placeholder={t.phonePh} aria-label={t.phoneTitle}
              style={{ flex: 1, minWidth: 0, height: "100%", border: "none", outline: "none", background: "none", padding: "0 14px",
                fontSize: 19, fontWeight: 600, letterSpacing: 1.2, color: C.ink, fontFamily: "inherit" }}/>
          </label>
          {phone.length === 10 && !validPhone && <div role="alert" style={{ color: C.chili, fontSize: 13.5, marginTop: 8, fontWeight: 600 }}>{t.phoneBad}</div>}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 14, fontSize: 13, color: C.soil, lineHeight: 1.45 }}>
            <span style={{ width: 18, height: 18, borderRadius: 9, background: C.basil, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
              <Check size={12} strokeWidth={3.2}/>
            </span>
            {t.consent}
          </div>
          <PrimaryButton disabled={!validPhone} onClick={() => setStep("name")} style={{ marginTop: 24 }}>{t.cont}</PrimaryButton>
        </div>
      </>
    );
  } else if (step === "name") {
    content = (
      <>
        <TopBar t={t} onBack={() => setStep("phone")} onSkip={() => signIn("")}/>
        <div className="g-in" style={{ marginTop: 28 }}>
          <h1 style={h1}>{t.nameTitle}</h1>
          <p style={sub}>{t.nameSub}</p>
          <input type="text" autoComplete="name" autoCapitalize="words" autoFocus maxLength={40}
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && name.trim() && !busy) signIn(name.trim()); }}
            placeholder={t.namePh} aria-label={t.nameTitle}
            style={{ width: "100%", height: 58, marginTop: 24, borderRadius: 16, border: `2px solid ${name ? C.basil : C.line}`, background: "#fff",
              padding: "0 16px", fontSize: 18, fontWeight: 600, color: C.ink, outline: "none", fontFamily: "inherit" }}/>
          <PrimaryButton disabled={!name.trim()} busy={busy} onClick={() => signIn(name.trim())} style={{ marginTop: 24 }}>{t.cont}</PrimaryButton>
        </div>
      </>
    );
  } else if (step === "location") {
    content = (
      <>
        <TopBar t={t} onSkip={() => setStep("q1")} skipLabel={t.notNow}/>
        <div className="g-in">
          <LocationArt/>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.2, color: C.gold, marginTop: 14 }}>{t.almost}</div>
          <h1 style={{ ...h1, marginTop: 4 }}>{t.locTitle}</h1>
          <Benefit Icon={MapPin} title={t.b1t} text={t.b1d}/>
          <Benefit Icon={Truck} title={t.b2t} text={t.b2d}/>
        </div>
        <div style={{ flex: 1, minHeight: 24 }}/>
        <PrimaryButton busy={busy} onClick={askLocation}>{busy ? t.finding : t.allowLoc}</PrimaryButton>
        <button className="g-reset" onClick={() => setStep("q1")}
          style={{ width: "100%", padding: "14px 0 2px", fontSize: 15, fontWeight: 700, color: C.soil, textAlign: "center" }}>{t.notNow}</button>
      </>
    );
  } else if (step === "q1" || step === "q2" || step === "q3") {
    const n = Number(step[1]);
    const Q = {
      1: { title: t.q1, sub: t.q1s, items: HOUSEHOLD, on: id => household === id, pick: id => setHousehold(h => (h === id ? null : id)), any: !!household, icon: "🧺" },
      2: { title: t.q2, sub: t.q2s, items: DIET, on: id => diet.includes(id), pick: id => toggle(diet, setDiet, id), any: diet.length > 0, icon: "🍽️" },
      3: { title: t.q3, sub: t.q3s, items: VALUES, on: id => values.includes(id), pick: id => toggle(values, setValues, id), any: values.length > 0, icon: "⭐" },
    }[n];
    content = (
      <>
        <TopBar t={t} onBack={n > 1 ? () => setStep(`q${n - 1}`) : null} onSkip={finishQuestions} progress={{ at: n, of: 3 }}/>
        <div key={step} className="g-in" style={{ marginTop: 26, textAlign: "center" }}>
          <span aria-hidden="true" style={{ width: 58, height: 58, borderRadius: 29, background: "#fff", border: `1px solid ${C.line}`, display: "inline-flex",
            alignItems: "center", justifyContent: "center", fontSize: 28, boxShadow: "0 6px 16px rgba(30,43,34,0.08)" }}>{Q.icon}</span>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.soil, marginTop: 12 }}>{t.step(n, 3)}</div>
          <h1 style={{ ...h1, marginTop: 4 }}>{Q.title}</h1>
          <p style={sub}>{Q.sub}</p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 22 }}>
            {Q.items.map(it => <Chip key={it.id} item={it} lang={lang} on={Q.on(it.id)} onClick={() => Q.pick(it.id)}/>)}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 24 }}/>
        <PrimaryButton disabled={!Q.any} onClick={() => (n < 3 ? setStep(`q${n + 1}`) : finishQuestions())}>{n < 3 ? t.cont : t.done}</PrimaryButton>
      </>
    );
  } else {
    content = <BrandPromise lang={lang} t={t} onDone={onDone}/>;
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={t.dialog} ref={scrollRef}
      style={{ position: "fixed", top: 0, bottom: 0, left: COL_LEFT, right: COL_LEFT, zIndex: 300, overflowY: "auto", WebkitOverflowScrolling: "touch",
        background: dark ? `radial-gradient(90% 50% at 50% 0%, rgba(242,181,58,0.18) 0%, rgba(242,181,58,0) 70%), ${C.basilDark}` : LIGHT_BG,
        fontFamily: body, color: dark ? "#fff" : C.ink }}>
      <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box",
        padding: "calc(env(safe-area-inset-top, 0px) + 14px) 20px calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
        {content}
      </div>
    </div>
  );
}

// Two promise lines typed out, then the shop opens (or tap to go now)
function BrandPromise({ lang, t, onDone }) {
  const reduce = useMemo(reduceMotion, []);
  const [a, b] = useMemo(() => t.promise.map(s => graphemes(s, lang)), [t, lang]);
  const GAP = 10;
  const total = a.length + GAP + b.length;
  const [n, setN] = useState(reduce ? total : 0);
  const doneRef = useRef(false);
  const finish = () => { if (!doneRef.current) { doneRef.current = true; onDone(); } };
  useEffect(() => {
    if (reduce) return undefined;
    setN(0);
    const id = setInterval(() => setN(v => (v >= total ? v : v + 1)), lang === "kn" ? 60 : 45);
    return () => clearInterval(id);
  }, [total, reduce, lang]);
  const typedA = a.slice(0, Math.min(n, a.length)).join("");
  const typedB = n > a.length + GAP ? b.slice(0, n - a.length - GAP).join("") : "";
  const showB = n > a.length + GAP / 2;
  const lineStyle = { fontFamily: accent, fontSize: 30, fontWeight: 700, lineHeight: 1.2, color: "#fff", textAlign: "center", minHeight: "2.4em" };
  const dot = c => <span aria-hidden="true" style={{ display: "block", width: 10, height: 10, borderRadius: 5, background: c, margin: "0 auto 12px", boxShadow: `0 0 0 4px ${c}33` }}/>;
  return (
    <>
      <div style={{ textAlign: "center" }}>
        <img src="/logo192.png" alt="" width={52} height={52} style={{ borderRadius: 14, boxShadow: "0 6px 18px rgba(0,0,0,0.25)" }}/>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 34, padding: "24px 4px" }} aria-live="polite">
        <div>{dot(C.haldi)}<div style={lineStyle}>{typedA}{!showB && <span className="g-caret" aria-hidden="true"/>}</div></div>
        <div style={{ opacity: showB ? 1 : 0, transition: "opacity .3s" }}>
          {dot("#7CC79A")}<div style={lineStyle}>{typedB}{showB && n < total && <span className="g-caret" aria-hidden="true"/>}</div>
        </div>
      </div>
      <button className="g-reset" onClick={finish}
        style={{ position: "relative", width: "100%", height: 56, borderRadius: 16, overflow: "hidden", border: "1.5px solid rgba(255,255,255,0.45)",
          color: "#fff", fontSize: 16.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ position: "relative" }}>{t.shop}</span>
        <span aria-hidden="true" className="g-wipe" onAnimationEnd={() => setTimeout(finish, 600)}
          style={{ position: "absolute", inset: 0, background: C.haldi, color: C.basilDark, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {t.shop}
        </span>
      </button>
    </>
  );
}

// ── HOME EXTRAS ──

const OFFER = {
  en: {
    hi: name => (name ? `Welcome, ${name}!` : "Welcome to Royal Harvest!"),
    eyebrow: "YOU'RE ALL SET",
    sub: "Here's what you get on every order:",
    rows: [["🚚", "Free delivery on orders above ₹250"], ["🏷️", "₹20 off when you shop for ₹299 or more"], ["💵", "Pay by cash or UPI when it arrives"]],
    go: "Got it, let's shop", close: "Close",
  },
  kn: {
    hi: name => (name ? `ಸ್ವಾಗತ, ${name}!` : "ರಾಯಲ್ ಹಾರ್ವೆಸ್ಟ್‌ಗೆ ಸ್ವಾಗತ!"),
    eyebrow: "ಎಲ್ಲವೂ ಸಿದ್ಧ",
    sub: "ಪ್ರತಿ ಆರ್ಡರ್‌ನಲ್ಲೂ ನಿಮಗೆ ಸಿಗುವುದು:",
    rows: [["🚚", "₹250 ಮೇಲಿನ ಆರ್ಡರ್‌ಗೆ ಉಚಿತ ಡೆಲಿವರಿ"], ["🏷️", "₹299 ಅಥವಾ ಹೆಚ್ಚಿನ ಖರೀದಿಗೆ ₹20 ರಿಯಾಯಿತಿ"], ["💵", "ಡೆಲಿವರಿ ವೇಳೆ ನಗದು ಅಥವಾ UPI ಮೂಲಕ ಪಾವತಿಸಿ"]],
    go: "ಸರಿ, ಶಾಪಿಂಗ್ ಮಾಡೋಣ", close: "ಮುಚ್ಚಿ",
  },
};

export function WelcomeOffer({ lang, name, onClose }) {
  const o = OFFER[lang] || OFFER.en;
  const btnRef = useRef(null);
  useEffect(() => { if (btnRef.current) btnRef.current.focus(); }, []);
  return (
    <>
      <div className="g-fade" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,32,24,0.45)", zIndex: 120 }}/>
      <div role="dialog" aria-modal="true" aria-label={o.hi(name)} className="g-sheet"
        style={{ position: "fixed", left: COL_LEFT, right: COL_LEFT, bottom: 0, zIndex: 121, background: "#fff", borderRadius: "24px 24px 0 0",
          padding: "10px 20px calc(env(safe-area-inset-bottom, 0px) + 18px)", fontFamily: body, boxShadow: "0 -10px 30px rgba(30,43,34,0.16)" }}>
        <div aria-hidden="true" style={{ width: 40, height: 4, borderRadius: 2, background: "#D9DED3", margin: "0 auto 12px" }}/>
        <button className="g-reset" onClick={onClose} aria-label={o.close}
          style={{ position: "absolute", top: 12, right: 14, width: 36, height: 36, borderRadius: 18, background: "#F2F4EF", display: "flex", alignItems: "center", justifyContent: "center", color: C.ink }}>
          <X size={18}/>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingRight: 40 }}>
          <img src="/logo192.png" alt="" width={54} height={54} style={{ borderRadius: 15, flexShrink: 0 }}/>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.1, color: C.gold }}>{o.eyebrow}</div>
            <div style={{ fontFamily: accent, fontSize: 23, fontWeight: 700, lineHeight: 1.15, color: C.ink, marginTop: 2 }}>{o.hi(name)}</div>
          </div>
        </div>
        <div style={{ fontSize: 14.5, color: C.soil, marginTop: 14 }}>{o.sub}</div>
        <div style={{ marginTop: 10, borderRadius: 16, background: "#F6F9F5", border: `1px solid ${C.line}` }}>
          {o.rows.map(([e, text], i) => (
            <div key={text} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderTop: i ? `1px solid ${C.line}` : "none" }}>
              <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 18, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{e}</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>{text}</span>
            </div>
          ))}
        </div>
        <button ref={btnRef} className="g-reset g-tap" onClick={onClose}
          style={{ width: "100%", height: 54, marginTop: 16, borderRadius: 16, background: C.basil, color: "#fff", fontSize: 16, fontWeight: 800, textAlign: "center" }}>{o.go}</button>
      </div>
    </>
  );
}

const TIP = {
  en: { title: "All categories in one tap", text: "Jump straight to fruits, vegetables, dairy, spices and more.", ok: "Got it" },
  kn: { title: "ಒಂದೇ ಟ್ಯಾಪ್‌ನಲ್ಲಿ ಎಲ್ಲಾ ವರ್ಗಗಳು", text: "ಹಣ್ಣು, ತರಕಾರಿ, ಹಾಲಿನ ಉತ್ಪನ್ನ, ಮಸಾಲೆ ಮತ್ತು ಇನ್ನಷ್ಟಕ್ಕೆ ನೇರವಾಗಿ ಹೋಗಿ.", ok: "ಸರಿ" },
};

// Spotlight on the green side tab that opens the category list
export function CoachTip({ lang, onClose }) {
  const tip = TIP[lang] || TIP.en;
  const [rect, setRect] = useState(null);
  const okRef = useRef(null);
  useEffect(() => {
    const find = () => {
      const el = document.querySelector('button[aria-expanded][aria-label="Categories"], button[aria-expanded][aria-label="ವರ್ಗಗಳು"]');
      setRect(el ? el.getBoundingClientRect() : null);
    };
    find();
    const id = setTimeout(find, 250);
    window.addEventListener("resize", find);
    return () => { clearTimeout(id); window.removeEventListener("resize", find); };
  }, [lang]);
  useEffect(() => { if (rect && okRef.current) okRef.current.focus(); }, [rect]);
  if (!rect) return null;
  const pad = 6;
  return (
    <div role="dialog" aria-modal="true" aria-label={tip.title} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 130, fontFamily: body }}>
      <div aria-hidden="true" className="g-fade"
        style={{ position: "fixed", left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
          borderRadius: 16, boxShadow: "0 0 0 9999px rgba(18,32,22,0.62)", outline: `2px solid ${C.haldi}`, outlineOffset: 2, pointerEvents: "none" }}/>
      <div className="g-in" onClick={e => e.stopPropagation()}
        style={{ position: "fixed", left: rect.right + 18, top: rect.top + rect.height / 2, transform: "translateY(-50%)",
          width: "min(270px, calc(100vw - 90px))", background: "#fff", borderRadius: 16, padding: "14px 16px", boxShadow: "0 12px 30px rgba(0,0,0,0.25)" }}>
        <span aria-hidden="true" style={{ position: "absolute", left: -7, top: "50%", width: 14, height: 14, background: "#fff", transform: "translateY(-50%) rotate(45deg)", borderRadius: 2 }}/>
        <div style={{ fontFamily: accent, fontSize: 19, fontWeight: 700, color: C.ink, lineHeight: 1.2 }}>{tip.title}</div>
        <div style={{ fontSize: 14, color: C.soil, lineHeight: 1.45, marginTop: 4 }}>{tip.text}</div>
        <button ref={okRef} className="g-reset g-tap" onClick={onClose}
          style={{ marginTop: 12, height: 40, padding: "0 18px", borderRadius: 12, background: C.basil, color: "#fff", fontSize: 14.5, fontWeight: 800 }}>{tip.ok}</button>
      </div>
    </div>
  );
}

const AREA = {
  en: {
    title: "We're not in your area yet",
    text: "Royal Harvest delivers across Gadag district for now. Ask us to come to your area and we'll let you know when we arrive.",
    ask: "Request my area", look: "Meanwhile, take a look around", close: "Close",
    msg: link => `Hi Royal Harvest, please start delivering in my area: ${link}`,
  },
  kn: {
    title: "ನಾವು ಇನ್ನೂ ನಿಮ್ಮ ಪ್ರದೇಶಕ್ಕೆ ಬಂದಿಲ್ಲ",
    text: "ಸದ್ಯಕ್ಕೆ ಗದಗ ಜಿಲ್ಲೆಯಾದ್ಯಂತ ಮಾತ್ರ ಡೆಲಿವರಿ ಮಾಡುತ್ತೇವೆ. ನಿಮ್ಮ ಪ್ರದೇಶಕ್ಕೆ ಬರಲು ಕೇಳಿ, ನಾವು ಬಂದಾಗ ತಿಳಿಸುತ್ತೇವೆ.",
    ask: "ನನ್ನ ಪ್ರದೇಶಕ್ಕೆ ವಿನಂತಿಸಿ", look: "ಅಲ್ಲಿಯವರೆಗೆ, ಒಮ್ಮೆ ನೋಡಿ", close: "ಮುಚ್ಚಿ",
    msg: link => `ನಮಸ್ಕಾರ ರಾಯಲ್ ಹಾರ್ವೆಸ್ಟ್, ದಯವಿಟ್ಟು ನನ್ನ ಪ್ರದೇಶಕ್ಕೂ ಡೆಲಿವರಿ ಆರಂಭಿಸಿ: ${link}`,
  },
};

export function AreaNotice({ lang, loc, shopWhatsApp, onClose }) {
  const a = AREA[lang] || AREA.en;
  const link = loc ? `https://maps.google.com/?q=${loc.lat.toFixed(5)},${loc.lon.toFixed(5)}` : "";
  return (
    <section aria-label={a.title} style={{ margin: "10px 12px 0", borderRadius: 18, overflow: "hidden", border: "1px solid #F1DFAF",
      background: "linear-gradient(135deg, #FFF8E6 0%, #FFFDF6 100%)", fontFamily: body }}>
      <div style={{ position: "relative", display: "flex", gap: 12, padding: "14px 44px 14px 14px" }}>
        <span style={{ width: 40, height: 40, borderRadius: 20, background: "#fff", color: "#B5621A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <MapPin size={20}/>
        </span>
        <div>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: C.ink }}>{a.title}</div>
          <div style={{ fontSize: 13.5, color: "#5E5A4E", lineHeight: 1.45, marginTop: 3 }}>{a.text}</div>
          <button className="g-reset g-tap" onClick={() => window.open(`https://wa.me/${shopWhatsApp}?text=${encodeURIComponent(a.msg(link))}`, "_blank")}
            style={{ marginTop: 10, height: 38, padding: "0 16px", borderRadius: 12, background: C.ink, color: "#fff", fontSize: 14, fontWeight: 700 }}>{a.ask}</button>
        </div>
        <button className="g-reset" onClick={onClose} aria-label={a.close}
          style={{ position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", color: C.soil }}>
          <X size={17}/>
        </button>
      </div>
      <div style={{ textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "#8A6A20", background: "rgba(242,181,58,0.14)", padding: "7px 0" }}>✦ {a.look} ✦</div>
    </section>
  );
}
