import { useEffect, useState } from "react";

const COOKIE_NAME = "googtrans";

function setGoogTransCookie(val) {
  document.cookie = `${COOKIE_NAME}=${val};path=/;max-age=31536000`;
  document.cookie = `${COOKIE_NAME}=${val};path=/;domain=${location.hostname};max-age=31536000`;
}

function ensureTranslateWidget() {
  // crea il widget (nascosto) solo una volta
  if (window.__wetrust_gt_inited) return;

  // eslint-disable-next-line no-new
  new window.google.translate.TranslateElement(
    { pageLanguage: "it", includedLanguages: "it,en", autoDisplay: false },
    "google_translate_element"
  );

  window.__wetrust_gt_inited = true;
}

function applyLang(lang) {
  const tryApply = () => {
    const sel = document.querySelector("select.goog-te-combo");
    if (!sel) return setTimeout(tryApply, 150);
    sel.value = lang;
    sel.dispatchEvent(new Event("change"));
  };
  tryApply();
}

function loadGoogleTranslateAnd(lang) {
  // se già caricato, usa subito
  if (window.google?.translate?.TranslateElement) {
    ensureTranslateWidget();
    applyLang(lang);
    return;
  }

  // altrimenti caricalo SOLO ora (on click)
  window.googleTranslateElementInit = () => {
    ensureTranslateWidget();
    applyLang(lang);
  };

  if (!document.getElementById("gt-script")) {
    const s = document.createElement("script");
    s.id = "gt-script";
    s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    s.async = true;
    document.body.appendChild(s);
  }
}

export default function LanguageToggle() {
  const [lang, setLang] = useState("it");

  // IMPORTANTISSIMO: all'apertura NON tradurre mai
  useEffect(() => {
    if (typeof window === "undefined") return;

    // forziamo IT all'avvio, così non parte "da solo" per cookie vecchi
    setGoogTransCookie("/it/it");
  }, []);

  const toggle = () => {
    const next = lang === "it" ? "en" : "it";
    setLang(next);

    if (next === "en") {
      setGoogTransCookie("/it/en");
      loadGoogleTranslateAnd("en");
      return;
    }

    // torna IT: cookie + refresh pulito (evita residui traduzione)
    setGoogTransCookie("/it/it");
    window.location.reload();
  };

  return (
    <button
      type="button"
      className={`langBtn flag ${lang === "it" ? "it" : "en"}`}
      onClick={toggle}
      aria-label="Switch language"
    >
      {lang === "it" ? "IT" : "EN"}
    </button>
  );
}
