import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { apiFetch } from "../lib/api";

export default function RequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      const data = await apiFetch("/requests", { auth: false });
      setRequests(data.requests || []);
      setError("");
    } catch (err) {
      setError(err.message || "Errore nel caricare le richieste.");
    } finally {
      setLoading(false);
    }
  }

  async function accept(id) {
    try {
      // ✅ fix: api non esiste, usa apiFetch
      await apiFetch(`/requests/${id}/accept`, { method: "POST" });
      await load();
      alert("Accettata. Vai su Chat.");
    } catch (e) {
      alert(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Layout title="WeTrust — Richieste">
      <h1>Richieste</h1>
      <p className="subtitle">
        Qui compaiono le richieste pubblicate. Per accettare e chattare devi essere loggato.
      </p>

      {loading && <p>Caricamento…</p>}
      {error && <p>{error}</p>}

      {!loading && !error && requests.length === 0 && (
        <p>Ancora nessuna richiesta. Creane una dalla home.</p>
      )}

      <div className="list">
        {requests.map((r) => (
          <article key={r.id} className="card">
            <div className="cardTop">
              <h2>{r.title}</h2>
              <span className={`badge ${r.status}`}>{r.status}</span>
            </div>

            <p className="desc">{r.description}</p>

            <div className="meta">
              <span className="city">{r.city || "—"}</span>
              <button className="btn" onClick={() => accept(r.id)}>
                Accetta
              </button>
            </div>
          </article>
        ))}
      </div>

      <style jsx>{`
        .subtitle { font-size: 14px; opacity: .92; margin-bottom: 14px; }

        .list {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        }

        .card {
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.35);
          padding: 14px 16px;
          transition: transform 0.12s ease, border-color 0.12s ease;
        }

        .card:hover {
          transform: translateY(-2px);
          border-color: rgba(0, 180, 255, 0.5);
        }

        .cardTop {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: flex-start;
        }

        .card h2 {
          font-size: 16px;
          margin: 0;
          line-height: 1.2;
        }

        .desc {
          font-size: 14px;
          margin: 10px 0 12px;
          opacity: 0.92;
        }

        .meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .city {
          opacity: 0.85;
          font-size: 12px;
        }

        .badge {
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.5);
          font-size: 12px;
          opacity: 0.95;
          text-transform: lowercase;
        }

        .badge.open { border-color: rgba(0,180,255,0.35); }
        .badge.matched { border-color: rgba(0,224,160,0.35); }
        .badge.completed { border-color: rgba(229,231,235,0.35); }

        .btn {
          border-radius: 999px;
          border: 1px solid rgba(0, 180, 255, 0.35);
          background: rgba(2, 6, 23, 0.35);
          color: #e5e7eb;
          padding: 8px 12px;
          cursor: pointer;
          font-weight: 800;
        }

        .btn:hover {
          border-color: rgba(0, 224, 160, 0.55);
        }
      `}</style>
    </Layout>
  );
}
