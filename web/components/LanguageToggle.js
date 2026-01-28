import { useEffect, useState } from "react";

const COOKIE_NAME = "googtrans";

function setGoogTransCookie(val) {
  // cookie su path / (e anche su domain corrente per sicurezza)
  document.cookie = `${COOKIE_NAME}=${val};path=/;max-age=31536000`;
  document.cookie = `${COOKIE_NAME}=${val};path=/;domain=${location.hostname};max-age=31536000`;
}

function getGoogTransCookie() {
  const m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function LanguageToggle() {
  const [lang, setLang] = useState("it");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const saved = localStorage.getItem("wetrust_lang");
    const initial = saved === "en" ? "en" : "it";
    setLang(initial);

    const want = initial === "en" ? "/it/en" : "/it/it";
    if (getGoogTransCookie() !== want) {
      setGoogTransCookie(want);
      if (initial === "en") window.location.reload();
    }
  }, []);

  const toggle = () => {
    const next = lang === "it" ? "en" : "it";
    localStorage.setItem("wetrust_lang", next);
    setGoogTransCookie(next === "en" ? "/it/en" : "/it/it");
    window.location.reload();
  };

  return (
    <button type="button" className="langBtn" onClick={toggle} aria-label="Switch language">
      {lang === "it" ? "🇬🇧" : "🇮🇹"}
    </button>
  );
}
