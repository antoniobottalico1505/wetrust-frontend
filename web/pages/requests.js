import { useContext, useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import { apiFetch } from "../lib/api";
import { AuthContext } from "./_app";

export default function RequestsPage() {
  const { user, ready } = useContext(AuthContext);

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      setLoading(true);
      setMsg("");
      const data = await apiFetch("/requests");
      setRequests(data?.requests || data?.items || []);
    } catch (err) {
      setMsg(err?.message || "Errore nel caricare le richieste.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  function canAccept(r) {
    const ownerId = r.user_id ?? r.userId ?? r.userID;
    if (user?.id && ownerId && String(ownerId) === String(user.id)) return false;
    return true;
  }

  async function accept(requestId) {
    setMsg("");
    try {
      if (!user?.id) throw new Error("Devi essere loggato per accettare.");

      // ✅ backend: crea match con POST /matches
      const data = await apiFetch("/matches", {
        method: "POST",
        body: { requestId, helperId: user.id },
      });

      const match = data?.match || null;

      if (match?.id) {
        window.location.href = `/chat/${match.id}`;
        return;
      }

      setMsg("Richiesta accettata ✅");
      await load();
    } catch (err) {
      setMsg(err?.message || "Errore durante l’accettazione.");
    }
  }

  return (
    <Layout title="WeTrust — Richieste">
      <h1>Richieste</h1>

      {!ready && <p>Caricamento…</p>}

      {ready && !user && (
        <div className="card">
          <p>Per vedere/accettare le richieste devi essere loggato.</p>
          <Link className="btn" href="/login">Vai al login</Link>

          <style jsx>{`
            .card {
              margin-top: 12px;
              max-width: 520px;
              border-radius: 18px;
              background: rgba(15, 23, 42, 0.95);
              border: 1px solid rgba(148, 163, 184, 0.35);
              padding: 14px 16px;
            }
            .btn {
              display: inline-block;
              margin-top: 10px;
              border-radius: 999px;
              border: none;
              padding: 10px 16px;
              font-weight: 900;
              cursor: pointer;
              background: linear-gradient(135deg, #00b4ff, #00e0a0);
              color: #020617;
              text-decoration: none;
            }
          `}</style>
        </div>
      )}

      {ready && user && (
        <>
          {msg && <p className="msgTop">{msg}</p>}
          {loading && <p>Caricamento…</p>}

          {!loading && requests.length === 0 && <p>Nessuna richiesta per ora.</p>}

          <div className="list">
            {requests.map((r) => (
              <article key={r.id} className="card2">
                <h2>{r.title || "Richiesta"}</h2>

                {/* ✅ città visibile se presente */}
                {r.city ? <p className="city">{r.city}</p> : null}

                <p className="desc">{r.description}</p>

                <div className="row">
                  <button
                    className="btn2"
                    onClick={() => accept(r.id)}
                    disabled={!canAccept(r)}
                    title={!canAccept(r) ? "Non puoi accettare la tua richiesta" : ""}
                  >
                    Accetta
                  </button>

                  {/* ✅ pagina [id] funzionante */}
                  <Link className="ghost" href={`/requests/${r.id}`}>
                    Dettagli
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <style jsx>{`
            .msgTop { opacity: 0.95; margin: 10px 0; }

            .list {
              display: grid;
              gap: 12px;
              grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            }
            .card2 {
              border-radius: 18px;
              background: rgba(15, 23, 42, 0.95);
              border: 1px solid rgba(148, 163, 184, 0.35);
              padding: 14px 16px;
            }
            h2 { margin: 0 0 6px; font-size: 16px; }
            .city { margin: 0 0 8px; font-size: 12px; opacity: 0.85; }
            .desc { margin: 0; opacity: 0.92; font-size: 14px; }
            .row { margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }

            .btn2 {
              border-radius: 999px;
              border: none;
              padding: 10px 16px;
              font-weight: 900;
              cursor: pointer;
              background: linear-gradient(135deg, #00b4ff, #00e0a0);
              color: #020617;
            }
            .btn2:disabled { opacity: 0.6; cursor: not-allowed; }

            .ghost {
              border-radius: 999px;
              padding: 9px 14px;
              font-weight: 900;
              background: transparent;
              border: 1px solid rgba(148, 163, 184, 0.6);
              color: #ffffff;
              cursor: pointer;
              text-decoration: none;
              display: inline-block;
            }
          `}</style>
        </>
      )}
    </Layout>
  );
}
