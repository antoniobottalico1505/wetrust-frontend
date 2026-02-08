import Link from "next/link";
import Script from "next/script";
import LanguageToggle from "./LanguageToggle";
import Head from "next/head";

export default function Layout({ title = "WeTrust", children }) {
  return (
    <>
<Head>
  <title>{title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</Head>
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

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
:root { color-scheme: dark; }

.langBtn.flag {
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

  color: var(--cyan);              /* << azzurro come i link */
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 4px;

  cursor: pointer;
}

.langBtn.flag:hover {
  color: var(--mint);
  border-color: rgba(0, 224, 160, 0.55);
}

.langBtn.flag.it { box-shadow: 0 0 0 2px rgba(0, 224, 160, 0.18); }
.langBtn.flag.en { box-shadow: 0 0 0 2px rgba(0, 180, 255, 0.18); }

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
          gap: 0;
          margin-left: 64px; /* loghi un po’ più a destra */
        }

        .logo-icon {
          width: 44px;
          height: auto;
        }

        .logo-full {
          height: 160px;
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
@media (max-width: 900px) {
  .header {
    flex-direction: column;
    align-items: center;
    padding: 12px 14px 4px;
    gap: 10px;
  }

.logo-area {
  order: 0;
  margin-left: 0;

  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;

  padding: 14px 0 18px;

  /* ✅ fascia sfumata verso il basso */
  background: linear-gradient(
    to bottom,
  rgba(0, 0, 0, 0.82) 0%,
  rgba(0, 0, 0, 0.55) 55%,
  rgba(0, 0, 0, 0) 100%
  );

  border: 0;
  border-radius: 0;
  box-shadow: none;
  backdrop-filter: none;
}

  .nav {
    order: 1;
    margin-right: 0;
    gap: 8px;
  }

  .nav :global(a) {
    padding: 6px 9px;
    font-size: 13px;
  }

  .logo-full {
    height: 116px;
  }

  .main {
    padding: 14px;
  }

  .footer {
    padding: 14px 14px 18px;
  }
}

@media (max-width: 420px) {
  .logo-full {
    height: 104px;
  }
      `}</style>
    </>
  );
}


