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

function getId(x) {
  return x == null ? "" : String(x);
}

export default function RequestsPage() {
  const router = useRouter();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [isLogged, setIsLogged] = useState(false);

  useEffect(() => {
    setIsLogged(!!readToken());
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

    if (!readToken()) {
      router.push("/login");
      return;
    }

    try {
      // 1) tentativo principale: POST /matches
      let data;
      try {
        data = await apiFetch("/matches", {
          method: "POST",
          body: { requestId: r.id, request_id: r.id },
        });
      } catch (e) {
        const m = String(e?.message || "").toLowerCase();
        // 2) fallback: alcuni backend usano /requests/:id/accept
        if (m.includes("not found") || m.includes("404")) {
          data = await apiFetch(`/requests/${r.id}/accept`, { method: "POST" });
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
              <Link href="/login" className="lnk">Vai al login</Link>.
            </>
          )}
        </p>
      )}

      {!loading && !msg && requests.length === 0 && (
        <p>Ancora nessuna richiesta. Creane una dalla home.</p>
      )}

      <div className="list">
        {requests.map((r) => (
          <article key={getId(r.id)} className="card">
            <div className="cardTop">
              <h2>{r.title || "Richiesta"}</h2>
              <span className={`badge ${String(r.status || "open").toLowerCase()}`}>
                {r.status || "open"}
              </span>
            </div>

            {typeof r.city === "string" && r.city.trim() ? (
              <p className="city">{r.city.trim()}</p>
            ) : null}
            <p className="desc">{r.description}</p>

            <div className="row">
              <Link className="ghost" href={`/requests/${r.id}`}>
                Dettagli
              </Link>

              <button
                className="btn"
                onClick={() => accept(r)}
                disabled={!canAccept(r)}
                title={!isLogged ? "Devi essere loggato" : ""}
              >
                Accetta
              </button>
            </div>
          </article>
        ))}
      </div>

      <style jsx>{`
        .subtitle { font-size: 14px; opacity: .92; margin-bottom: 14px; }
        .msg { opacity: .95; margin: 10px 0; }
        .lnk { text-decoration: underline; color: #a5f3fc; font-weight: 800; }

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
        .card:hover { transform: translateY(-2px); border-color: rgba(0, 180, 255, 0.5); }

        .cardTop {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: flex-start;
        }

        h2 { font-size: 16px; margin: 0; line-height: 1.2; }

        .city { margin: 8px 0 0; font-size: 12px; opacity: 0.85; }
        .desc { font-size: 14px; margin: 10px 0 12px; opacity: 0.92; }

        .badge {
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.5);
          font-size: 12px;
          opacity: 0.95;
          text-transform: lowercase;
        }

        .row { display:flex; gap: 10px; flex-wrap: wrap; align-items: center; }

        .btn {
          border-radius: 999px;
          border: none;
          padding: 10px 16px;
          font-weight: 900;
          cursor: pointer;
          background: linear-gradient(135deg, #00b4ff, #00e0a0);
          color: #020617;
        }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }

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
    </Layout>
  );
}
