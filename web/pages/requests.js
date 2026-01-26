import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { apiFetch } from "../lib/api";
import Link from "next/link";
import { useRouter } from "next/router";

function readToken() {
  if (typeof window === "undefined") return null;
  try {
    return (
      localStorage.getItem("wetrust_token") ||
      localStorage.getItem("token") ||
      sessionStorage.getItem("token")
    );
  } catch {
    return null;
  }
}

function normId(x) {
  return x == null ? "" : String(x);
}

function clip(s, n = 180) {
  const t = String(s || "").trim();
  if (!t) return "";
  return t.length > n ? `${t.slice(0, n).trim()}…` : t;
}

function pickRequestId(r) {
  return (
    r?.id ||
    r?._id ||
    r?.requestId ||
    r?.request_id ||
    r?.requestID ||
    r?.uuid ||
    null
  );
}

function pickCity(r) {
  return (
    r?.city ||
    r?.city_name ||
    r?.town ||
    r?.location?.city ||
    r?.address?.city ||
    r?.place?.city ||
    ""
  );
}

function pickDesc(r) {
  return r?.description || r?.desc || r?.text || r?.details || "";
}

async function tryFetchMe() {
  try {
    const a = await apiFetch("/me");
    return a?.user || a?.me || a?.item || a?.data || a;
  } catch {
    try {
      const b = await apiFetch("/users/me");
      return b?.user || b?.me || b?.item || b?.data || b;
    } catch {
      return null;
    }
  }
}

export default function RequestsPage() {
  const router = useRouter();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [me, setMe] = useState(null);

  useEffect(() => {
    if (!readToken()) return;
    (async () => {
      const u = await tryFetchMe();
      if (u?.id) setMe(u);
    })();
  }, []);

  async function load() {
    setMsg("");
    try {
      setLoading(true);
      const data = await apiFetch("/requests");
      const list = data?.requests || data?.items || data?.list || [];
      setRequests(Array.isArray(list) ? list : []);
    } catch (err) {
      setRequests([]);
      setMsg(err?.message || "Errore nel caricare le richieste.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function canAccept(r) {
    const st = String(r?.status || "").toLowerCase();
    if (!st) return true;
    return st === "open" || st === "opened" || st === "pending";
  }

  function extractMatchId(data) {
    const m = data?.match || data?.item || data;
    return (
      m?.id ||
      data?.matchId ||
      data?.match_id ||
      m?.matchId ||
      m?.match_id ||
      null
    );
  }

  async function accept(r) {
    setMsg("");

    const token = readToken();
    if (!token) {
      router.push("/login");
      return;
    }

    const requestId = pickRequestId(r);
    if (!requestId) {
      setMsg("ID richiesta mancante (campo id/_id/requestId)." );
      return;
    }

    let helperId = me?.id;
    if (!helperId) {
      const u = await tryFetchMe();
      if (u?.id) {
        setMe(u);
        helperId = u.id;
      }
    }

    if (!helperId) {
      setMsg("helperId non disponibile: fai login e riprova.");
      return;
    }

    try {
      let data;
      try {
        data = await apiFetch("/matches", {
          method: "POST",
          body: {
            requestId,
            request_id: requestId,
            helperId,
            helper_id: helperId,
          },
        });
      } catch (e) {
        const m = String(e?.message || "").toLowerCase();
        if (m.includes("not found") || m.includes("404")) {
          data = await apiFetch(`/requests/${requestId}/accept`, {
            method: "POST",
            body: { helperId, helper_id: helperId },
          });
        } else {
          throw e;
        }
      }

      const matchId = extractMatchId(data);
      if (matchId) {
        router.push(`/chat/${matchId}`);
        return;
      }

      setMsg("Richiesta accettata ✅");
      await load();
    } catch (e) {
      setMsg(e?.message || "Errore nell’accettazione.");
    }
  }

  return (
    <Layout title="WeTrust — Richieste">
      <h1>Richieste</h1>
      <p className="subtitle">
        Qui compaiono le richieste pubblicate. Per accettare e chattare devi essere loggato.
      </p>

      {loading && <p>Caricamento…</p>}

      {!loading && msg && (
        <p className="msg">
          {msg}{" "}
          {String(msg).toLowerCase().includes("token") && (
            <>
              <Link href="/login" className="lnk">
                Vai al login
              </Link>
              .
            </>
          )}
        </p>
      )}

      {!loading && !msg && requests.length === 0 && (
        <p>Ancora nessuna richiesta. Creane una dalla home.</p>
      )}

      <div className="list">
        {requests.map((r) => {
          const id = pickRequestId(r);
          return (
            <article key={normId(id) || normId(r?.title) || Math.random()} className="card">
              <div className="cardTop">
                <h2>{r.title || "Richiesta"}</h2>
                <span className={`badge ${String(r.status || "open").toLowerCase()}`}>
                  {r.status || "open"}
                </span>
              </div>

              {pickCity(r) ? <p className="city">{pickCity(r)}</p> : null}
              <p className="desc">{clip(pickDesc(r)) || "Apri i dettagli per vedere la descrizione."}</p>

              <div className="row">
                {id ? (
                  <Link className="ghost" href={`/requests/${id}`}>
                    Dettagli
                  </Link>
                ) : (
                  <span className="ghost disabled">Dettagli</span>
                )}

                <button className="btn" onClick={() => accept(r)} disabled={!canAccept(r) || !id}>
                  Accetta
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <style jsx>{`
        .subtitle {
          font-size: 14px;
          opacity: 0.92;
          margin-bottom: 14px;
        }
        .msg {
          opacity: 0.95;
          margin: 10px 0;
        }
        .lnk {
          text-decoration: underline;
          color: #a5f3fc;
          font-weight: 800;
        }

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

        h2 {
          font-size: 16px;
          margin: 0;
          line-height: 1.2;
        }

        .city {
          margin: 8px 0 0;
          font-size: 12px;
          opacity: 0.85;
        }
        .desc {
          font-size: 14px;
          margin: 10px 0 12px;
          opacity: 0.92;
        }

        .badge {
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.5);
          font-size: 12px;
          opacity: 0.95;
          text-transform: lowercase;
        }

        .row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }

        .btn {
          border-radius: 999px;
          border: none;
          padding: 10px 16px;
          font-weight: 900;
          cursor: pointer;
          background: linear-gradient(135deg, #00b4ff, #00e0a0);
          color: #020617;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
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
        .ghost.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </Layout>
  );
}
