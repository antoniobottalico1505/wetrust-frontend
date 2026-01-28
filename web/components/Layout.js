import Link from "next/link";
import Script from "next/script";
import LanguageToggle from "./LanguageToggle";

export default function Layout({ title = "WeTrust", children }) {
  return (
    <>
      <div className="page">
        <header className="header">
          {/* LINK A SINISTRA (chiaro) + LOGHI A DESTRA (scuro) */}
          <nav className="nav">
            <Link href="/">Home</Link>
            <Link href="/requests">Richieste</Link>
            <Link href="/contact">Contatti</Link>
            <Link href="/chats">Chat</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/login">Accedi</Link>
            <Link href="/register">Registrati</Link>
          </nav>

          <div className="logo-area">
            <img src="/WeT.png" alt="WeTrust symbol" className="logo-icon" />
            <img src="/WeTrust.png" alt="WeTrust logo" className="logo-full" />
          </div>
        </header>

        <LanguageToggle />
        <div id="google_translate_element" style={{ display: "none" }} />

        <main className="main">{children}</main>

        <footer className="footer">
          <span>© {new Date().getFullYear()} WeTrust.</span>
          <span className="footer-note">Fiducia umana → Aiuto reale → Pagamento semplice.</span>
        </footer>

        {/* Google Translate loader + init (NON dentro style) */}
        <Script
          id="gt-script"
          strategy="afterInteractive"
          src="https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
        />
        <Script id="gt-init" strategy="afterInteractive">
          {`function googleTranslateElementInit() {
              new google.translate.TranslateElement(
                { pageLanguage: 'it', includedLanguages: 'it,en', autoDisplay: false },
                'google_translate_element'
              );
            }`}
        </Script>
      </div>

      <style jsx global>{`
        :root {
          --ink: #e5e7eb;
          --bg: #020617;
          --card: rgba(15, 23, 42, 0.95);
          --border: rgba(148, 163, 184, 0.35);
          --cyan: #00b4ff;
          --mint: #00e0a0;
        }

        html,
        body {
          padding: 0;
          margin: 0;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text",
            "Helvetica Neue", Arial, sans-serif;
          color: var(--ink);
          background: radial-gradient(
            circle at top left,
            #00b4ff 0,
            #00e0a0 20%,
            #020617 55%
          );
        }

        /* NIENTE PIU' VIOLA: anche visited */
        a,
        a:visited {
          color: var(--cyan) !important;
          text-decoration: none;
        }
        a:hover {
          color: var(--mint) !important;
          text-decoration: underline;
        }

        /* language toggle + hide google banner */
        .langBtn {
          position: fixed;
          top: 12px;
          right: 12px;
          z-index: 9999;
          background: rgba(15, 23, 42, 0.92);
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 999px;
          padding: 8px 10px;
          cursor: pointer;
          font-size: 18px;
        }
        .goog-te-banner-frame.skiptranslate {
          display: none !important;
        }
        body {
          top: 0 !important;
        }
      `}</style>

      <style jsx>{`
        .page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .header {
          max-width: 1120px;
          margin: 0 auto;
          padding: 16px 20px 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }

        .nav {
          display: flex;
          gap: 12px;
          font-size: 14px;
          margin-right: 64px; /* link un po’ più a sinistra */
          flex-wrap: wrap;
          justify-content: center;
        }

        .nav :global(a) {
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.55);
        }

        .logo-area {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-left: 64px; /* loghi un po’ più a destra */
        }

        .logo-icon {
          width: 44px;
          height: auto;
        }

        .logo-full {
          height: 90px;
          width: auto;
        }

        .main {
          flex: 1;
          max-width: 1120px;
          width: 100%;
          margin: 0 auto;
          padding: 20px;
        }

        .footer {
          max-width: 1120px;
          width: 100%;
          margin: 0 auto;
          padding: 16px 20px 24px;
          font-size: 12px;
          color: rgba(229, 231, 235, 0.75);
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: space-between;
          border-top: 1px solid rgba(15, 23, 42, 0.7);
        }

        .footer-note {
          opacity: 0.9;
        }

..langBtn.flag {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 9999;

  width: 46px;
  height: 28px;
  padding: 0;

  display: inline-flex;
  align-items: center;
  justify-content: center;

  font-weight: 900;
  font-size: 12px;
  letter-spacing: 0.8px;
  text-transform: uppercase;

  color: var(--ink);
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 4px;

  cursor: pointer;
}

.langBtn.flag::after {
  content: "";
  position: absolute;
  left: 4px;
  right: 4px;
  bottom: 4px;
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--cyan), var(--mint));
  opacity: 0.95;
}

.langBtn.flag.it { box-shadow: 0 0 0 2px rgba(0, 224, 160, 0.18); }
.langBtn.flag.uk { box-shadow: 0 0 0 2px rgba(0, 180, 255, 0.18); }

        @media (max-width: 800px) {
          .header {
            flex-direction: column;
          }
          .nav {
            margin-right: 0;
          }
          .logo-area {
            margin-left: 0;
          }
          .logo-full {
            height: 78px;
          }
        }
      `}</style>
    </>
  );
}
