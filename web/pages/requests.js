import { useContext, useEffect, useState } from "react";
import Layout from "../components/Layout";
import Link from "next/link";
import { apiFetch } from "../lib/api";
import { AuthContext } from "./_app";

export default function RequestsPage() {
  const { user, ready } = useContext(AuthContext);

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      setLoading(true);
      setMsg("");
      const data = await apiFetch("/requests");
      setList(data.requests || []);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    if (!user) return; // endpoint protetto
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  async function accept(requestId) {
    setMsg("");
    try {
      if (!user?.id) throw new Error("Devi accedere per accettare.");

      // ✅ backend: crea match con POST /matches (non /requests/:id/accept)
      const data = await apiFetch("/matches", {
        method: "POST",
        body: { requestId, helperId: user.id },
      });

      const match = data.match;

      setMsg("Richiesta accettata ✅");
      // se abbiamo match.id possiamo aprire la chat direttamente
      if (match?.id) {
        window.location.href = `/chat/${match.id}`;
        return;
      }

      await load();
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <Layout title="WeTrust — Richieste">
      <h1>Richieste</h1>

      {!ready && <p>Caricamento…</p>}

      {ready && !user && (
        <div className="card">
          <p>Per vedere le richieste devi essere loggato.</p>
          <Link className="btn" href="/login">Accedi</Link>

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
          {msg && <p className="msg">{msg}</p>}
          {loading && <p>Caricamento…</p>}

          {!loading && list.length === 0 && <p>Nessuna richiesta per ora.</p>}

          <div className="grid">
            {list.map((r) => (
              <div key={r.id} className="card2">
                {/* ✅ TITolo */}
                <h2 className="title">{r.title || "Richiesta"}</h2>

                {/* ✅ Città */}
                {r.city ? <p className="city">{r.city}</p> : null}

                <p className="desc">{r.description}</p>

                <div className="row">
                  {/* ✅ ACCETTA */}
                  <button className="btn2" onClick={() => accept(r.id)}>
                    Accetta
                  </button>

                  {/* ✅ DETTAGLI */}
                  <Link className="ghost" href={`/requests/${r.id}`}>
                    Dettagli
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <style jsx>{`
            .msg { margin: 10px 0; opacity: 0.95; }
            .grid {
              display: grid;
              gap: 12px;
              grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
              margin-top: 12px;
            }
            .card2 {
              border-radius: 18px;
              background: rgba(15, 23, 42, 0.95);
              border: 1px solid rgba(148, 163, 184, 0.35);
              padding: 14px 16px;
            }
            .title { margin: 0 0 6px; font-size: 16px; }
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
