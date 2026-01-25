import { useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { apiFetch } from "../lib/api";
import { AuthContext } from "./_app";

export default function RequestsPage() {
  const router = useRouter();

  const auth = useContext(AuthContext) || {};
  const user = auth.user ?? auth[0] ?? null;
  const ready = auth.ready ?? auth[2] ?? false;

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const selectedId =
    typeof router.query.id === "string" ? router.query.id : null;

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return requests.find((r) => String(r.id) === String(selectedId)) || null;
  }, [selectedId, requests]);

  async function load() {
    try {
      setLoading(true);
      setMsg("");
      // ✅ endpoint protetto -> serve token -> apiFetch aggiunge Authorization da solo
      const data = await apiFetch("/requests");
      const list = data?.requests || data?.items || [];
      setRequests(list);
    } catch (err) {
      setMsg(err?.message || "Errore nel caricare le richieste.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    if (!user) return; // ✅ non chiamare endpoint protetto se non loggato
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  function openDetails(id) {
    router.push(
      { pathname: "/requests", query: { id } },
      undefined,
      { shallow: true }
    );
  }

  function closeDetails() {
    router.push("/requests", undefined, { shallow: true });
  }

  async function accept(requestId) {
    setMsg("");
    try {
      if (!user?.id) throw new Error("Devi essere loggato per accettare.");

      // ✅ FIX: nel backend ESISTE /matches (non /requests/:id/accept)
      const data = await apiFetch("/matches", {
        method: "POST",
        body: { requestId, helperId: user.id },
      });

      const match = data?.match || data?.item || data?.items || null;

      // se ritorna l'oggetto match con id -> vai subito alla chat
      if (match?.id) {
        router.push(`/chat/${match.id}`);
        return;
      }

      setMsg("Richiesta accettata ✅");
      await load();
    } catch (err) {
      setMsg(err?.message || "Errore durante l’accettazione.");
    }
  }

  function canAccept(r) {
    const ownerId = r.user_id ?? r.userId ?? r.userID;
    // non permettere di accettare la propria richiesta
    if (user?.id && ownerId && String(ownerId) === String(user.id)) return false;
    return true;
  }

  return (
    <Layout title="WeTrust — Richieste">
      <h1>Richieste</h1>

      {!ready && <p>Caricamento…</p>}

      {ready && !user && (
        <div className="card">
          <p>Per vedere/accettare le richieste devi essere loggato.</p>
          <Link className="btn" href="/login">
            Vai al login
          </Link>

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

          {!loading && requests.length === 0 && (
            <p>Nessuna richiesta per ora.</p>
          )}

          <div className="list">
            {requests.map((r) => (
              <article key={r.id} className="card2">
                <h2>{r.title || "Richiesta"}</h2>

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

                  {/* ✅ FIX: niente /requests/<id> (404). Usiamo /requests?id=<id> */}
                  <button className="ghost" onClick={() => openDetails(r.id)}>
                    Dettagli
                  </button>
                </div>
              </article>
            ))}
          </div>

          {/* ✅ Dettaglio inline (così non esiste più il 404) */}
          {selected && (
            <div className="overlay" onClick={closeDetails}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modalTop">
                  <h3>{selected.title || "Dettaglio richiesta"}</h3>
                  <button className="x" onClick={closeDetails} aria-label="Chiudi">
                    ✕
                  </button>
                </div>

                {selected.city ? <p className="city2">{selected.city}</p> : null}
                <p className="desc2">{selected.description}</p>

                <div className="modalRow">
                  <button
                    className="btn2"
                    onClick={() => accept(selected.id)}
                    disabled={!canAccept(selected)}
                  >
                    Accetta
                  </button>
                  <button className="ghost" onClick={closeDetails}>
                    Chiudi
                  </button>
                </div>
              </div>
            </div>
          )}

          <style jsx>{`
            .msg { opacity: 0.95; margin: 10px 0; }

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
            .row { margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap; }

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
            }

            .overlay {
              position: fixed;
              inset: 0;
              background: rgba(2, 6, 23, 0.6);
              display: grid;
              place-items: center;
              padding: 16px;
              z-index: 50;
            }
            .modal {
              width: 100%;
              max-width: 700px;
              border-radius: 18px;
              background: rgba(15, 23, 42, 0.98);
              border: 1px solid rgba(148, 163, 184, 0.35);
              padding: 14px 16px;
            }
            .modalTop {
              display: flex;
              justify-content: space-between;
              gap: 10px;
              align-items: center;
            }
            .x {
              border: 1px solid rgba(148, 163, 184, 0.6);
              background: transparent;
              color: #fff;
              border-radius: 10px;
              padding: 6px 10px;
              cursor: pointer;
              font-weight: 900;
            }
            .city2 { margin: 8px 0; opacity: 0.85; font-size: 12px; }
            .desc2 { margin: 0; opacity: 0.92; font-size: 14px; }
            .modalRow { margin-top: 12px; display: flex; gap: 10px; flex-wrap: wrap; }
          `}</style>
        </>
      )}
    </Layout>
  );
}
