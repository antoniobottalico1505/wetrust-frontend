import { useContext, useState } from "react";
import Layout from "../components/Layout";
import { apiFetch } from "../lib/api";
import { AuthContext } from "./_app";
import Link from "next/link";

export default function Home() {
  const auth = useContext(AuthContext) || {};
  const user = auth.user ?? auth[0] ?? null;
  const ready = auth.ready ?? auth[2] ?? false;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function handleINeed(e) {
    e.preventDefault();
    setFeedback("");

    if (!title.trim()) {
      setFeedback("Inserisci un titolo.");
      return;
    }

    if (!description.trim()) {
      setFeedback("Scrivi almeno una frase sul tuo bisogno.");
      return;
    }

    if (!user) {
      setFeedback("Prima accedi per pubblicare una richiesta.");
      return;
    }

    try {
      setLoading(true);

      const c = city.trim();

      await apiFetch("/requests", {
        method: "POST",
        body: {
          title: title.trim(),
          description: description.trim(),
          city: c || undefined,

          // fallback: se il backend usa nomi diversi o nested
          location: c || undefined,
          town: c || undefined,
          address: c ? { city: c } : undefined,
          place: c ? { city: c } : undefined,
        },
      });

      setTitle("");
      setDescription("");
      setCity("");
      setFeedback("Richiesta inviata ✅ La trovi nella pagina Richieste.");
    } catch (err) {
      console.error(err);
      setFeedback(err?.message || "Errore nel salvataggio della richiesta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title="WeTrust — Fidati. Chiedi. Ricevi.">
      <section className="hero">
        <div className="hero-content">
          <div className="hero-left">
            <h1>
              Chiedi aiuto.
              <br />
              Trova persone affidabili vicino a te.
            </h1>

            <p className="subtitle">
              Un solo pulsante, tre strati: fiducia, aiuto e pagamento sicuro.
              <br />
              WeTrust trasforma la fiducia locale in aiuto reale.
            </p>

            {!ready ? null : user ? (
              <p className="pill">
                Sei dentro come:{" "}
                <strong>{user.phone || user.email || user.name || "utente"}</strong>
              </p>
            ) : (
              <p className="pill">
                Per pubblicare/accettare richieste e chattare:{" "}
                <Link href="/login" className="link">
                  accedi
                </Link>
                .
              </p>
            )}

            <form className="need-form" onSubmit={handleINeed}>
              <label className="need-label">
                Scrivi qui il tuo bisogno (pulsante <strong>I need</strong>):
              </label>

              {/* ✅ TITOLO (obbligatorio) */}
              <input
                className="need-title"
                placeholder="Titolo (obbligatorio) — es. Accompagnare mia madre dal medico"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              <textarea
                className="need-textarea"
                placeholder="Es. Ho bisogno di qualcuno che accompagni mia madre dal medico domani mattina…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="need-row">
                <input
                  className="need-city"
                  placeholder="Città / zona (facoltativo)"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? "Invio…" : "I need"}
                </button>
              </div>
              {feedback && <p className="need-feedback">{feedback}</p>}
            </form>
          </div>

          <div className="hero-right">
            <div className="card">
              <div className="card-header">Uno sguardo all’app</div>
              <div className="bubble">
                <div className="bubble-label">Esempio di richiesta</div>
                <div className="bubble-text">
                  «Mi serve qualcuno che accompagni mia madre dal medico domani mattina.»
                </div>
              </div>
              <ul className="hero-list">
                <li>L’AI capisce il bisogno, la zona e l’urgenza.</li>
                <li>Matching con persone affidabili.</li>
                <li>Pagamento bloccato e rilasciato solo a lavoro confermato.</li>
              </ul>
              <div className="ctaRow">
                <Link href="/requests" className="cta">
                  Vedi le richieste
                </Link>
                <Link href="/profile" className="cta ghost">
                  Profilo
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Come funziona</h2>
        <div className="grid3">
          <div className="card2">
            <h3>Trust</h3>
            <p>Accesso con Email + Password.</p>
          </div>
          <div className="card2">
            <h3>Help</h3>
            <p>Pubblica una richiesta o accettane una. Chat 1:1 dopo l’accettazione.</p>
          </div>
          <div className="card2">
            <h3>Pay</h3>
            <p>Pagamento bloccato (hold) e rilascio con conferma. Fee automatica per WeTrust.</p>
          </div>
        </div>
      </section>

      <style jsx>{`
        .hero { display:flex; flex-direction:column; gap:20px; margin-top: 8px; }
        .hero-content {
          display: grid;
          grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
          gap: 32px;
          align-items: flex-start;
        }
        .hero-left h1 {
          font-size: clamp(32px, 4vw, 40px);
          line-height: 1.1;
          margin-bottom: 12px;
          color: #f9fafb;
        }
        .subtitle { font-size: 16px; color:#e5e7eb; max-width:560px; margin-bottom: 12px; }
        .pill {
          display:inline-block;
          margin: 0 0 12px;
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(15,23,42,0.6);
          border: 1px solid rgba(148,163,184,0.35);
          font-size: 13px;
        }
        .link { color: #ffffff; text-decoration: underline; }

        .need-form { margin-top: 6px; }
        .need-label { font-size: 13px; margin-bottom: 6px; display:block; }

        /* ✅ stile identico agli input già presenti */
        .need-title {
          width: 100%;
          margin-bottom: 8px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.7);
          background: rgba(15, 23, 42, 0.9);
          color: #e5e7eb;
          padding: 10px 12px;
          font-size: 14px;
        }

        .need-textarea {
          width:100%;
          min-height: 90px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.7);
          background: rgba(15, 23, 42, 0.9);
          color: #e5e7eb;
          padding: 10px 12px;
          font-size: 14px;
          resize: vertical;
        }
        .need-row { display:flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; align-items:center; }
        .need-city {
          flex:1;
          min-width: 160px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.7);
          background: rgba(15, 23, 42, 0.9);
          color: #e5e7eb;
          padding: 10px 12px;
          font-size: 14px;
        }
        .btn-primary {
          border-radius: 999px;
          border: none;
          padding: 10px 18px;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
          background: linear-gradient(135deg, #00b4ff, #00e0a0);
          color: #020617;
        }
        .need-feedback { margin-top: 8px; font-size: 13px; }

        .hero-right .card {
          border-radius: 20px;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.4);
          padding: 16px 18px;
        }
        .card-header {
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #9ca3af;
          margin-bottom: 10px;
        }
        .bubble {
          border-radius: 18px;
          background: linear-gradient(135deg, #00b4ff, #00e0a0);
          color: #020617;
          padding: 10px 12px;
          margin-bottom: 12px;
        }
        .bubble-label { font-size: 11px; font-weight: 800; margin-bottom: 4px; }
        .bubble-text { font-size: 13px; }
        .hero-list { margin: 0; padding-left: 18px; font-size: 13px; color:#d1d5db; }

        .ctaRow { display:flex; gap: 10px; margin-top: 14px; flex-wrap:wrap; }
        .cta {
          display:inline-block;
          text-decoration:none;
          border-radius:999px;
          padding: 8px 14px;
          font-weight: 800;
          background: linear-gradient(135deg, #00b4ff, #00e0a0);
          color: #020617;
        }
        .ghost {
          background: transparent;
          border: 1px solid rgba(148,163,184,0.6);
          color:#ffffff;
        }

        .section { margin-top: 24px; }
        .section h2 { font-size: 22px; margin-bottom: 12px; }
        .grid3 {
          display:grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }
        .card2 {
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.4);
          padding: 12px 14px;
          font-size: 14px;
          color: #d1d5db;
        }
        .card2 h3 { margin: 0 0 6px; color:#f9fafb; }

        @media (max-width: 900px) {
          .hero-content { grid-template-columns: 1fr; }
          .hero-right { margin-top: 10px; }
        }
      `}</style>
    </Layout>
  );
}
