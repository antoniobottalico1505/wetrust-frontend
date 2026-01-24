import Link from "next/link";

export default function Header({ inverted = true }) {
  // inverted=true => links left (lighter side) and logo right (dark side) as you wanted
  return (
    <header className="header">
      <nav className="nav">
        <Link href="/">Home</Link>
        <Link href="/requests">Richieste</Link>
        <Link href="/contact">Contatti</Link>
        <Link href="/profile">Profilo</Link>
      </nav>

      <div className="logo-area">
        <img src="/WeT.png" alt="WeTrust symbol" className="logo-icon" />
        <img src="/WeTrust.png" alt="WeTrust logo" className="logo-full" />
      </div>

      <style jsx>{`
        .header {
          max-width: 1120px;
          margin: 0 auto;
          padding: 16px 20px 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }

        .logo-area {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-left: 64px;
        }

        .logo-icon {
          width: 44px;
          height: auto;
        }

        .logo-full {
          height: 96px;
          width: auto;
        }

        .nav {
          display: flex;
          gap: 12px;
          font-size: 14px;
          margin-right: 64px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .nav :global(a) {
          color: #ffffff !important;
          text-decoration: none;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.6);
        }

        .nav :global(a:hover) {
          text-decoration: underline;
        }

        @media (max-width: 600px) {
          .header {
            flex-direction: column;
            align-items: center;
          }
          .logo-area {
            margin-left: 0;
          }
          .nav {
            margin-right: 0;
          }
          .logo-full {
            height: 80px;
          }
        }
      `}</style>
    </header>
  );
}
