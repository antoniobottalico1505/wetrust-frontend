import { useContext, useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import Link from "next/link";
import { apiFetch } from "../lib/api";
import { AuthContext } from "./_app";

function clip(s, n = 120) {
  const t = String(s || "").trim();
  if (!t) return "";
  return t.length > n ? `${t.slice(0, n).trim()}…` : t;
}

function normId(x) {
  return x == null ? "" : String(x);
}

export default function ChatsPage() {
  const auth = useContext(AuthContext) || {};
  const user = auth.user ?? auth[0] ?? null;
  const ready = auth.ready ?? auth[2] ?? false;

  const [matches, setMatches] = useState([]);
  const [reqMap, setReqMap] = useState({});
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) return;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        // ✅ prima prova /me/matches (più comune), poi fallback /matches
        let mData = null;
        try {
          mData = await apiFetch("/me/matches");
        } catch {
          mData = await apiFetch("/matches");
        }

        // richieste (per titolo/città/descrizione)
        let rData = { requests: [] };
        try {
          rData = await apiFetch("/requests");
        } catch {
          rData = { requests: [] };
        }

        const ms = mData?.matches || mData?.items || mData?.list || [];
        const rs = rData?.requests || rData?.items || rData?.list || [];

        const map = {};
        for (const r of rs) map[normId(r.id)] = r;

        setMatches(Array.isArray(ms) ? ms : []);
        setReqMap(map);
      } catch (e) {
        setErr(e?.message || "Errore caricamento chat.");
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, user]);

  const items = useMemo(() => {
    const meId = user?.id ? String(user.id) : "";
    return (matches || []).map((m) => {
      const requestId = normId(m.requestId || m.request_id);
      const r = reqMap[requestId] || null;

      const uId = normId(m.userId || m.user_id);
      const hId = normId(m.helperId || m.helper_id);

      const otherId = meId && uId === meId ? hId : uId;

      return {
        ...m,
        requestTitle: r?.title || `Richiesta ${requestId || ""}`,
        requestCity: r?.city || "",
        requestDesc: r?.description || "",
        otherId,
        requestId,
      };
    });
  }, [matches, reqMap, user]);

  return (
    <Layout title="WeTrust — Chat">
      <h1>Chat</h1>
      <p className="subtitle">Le chat compaiono dopo un match (accettazione).</p>

      {!ready && <p>Caricamento…</p>}

      {ready && !user && (
        <div className="cardInfo">
          <p>Devi accedere per vedere le chat.</p>
          <Link className="btn" href="/login">Vai al login</Link>
        </div>
      )}

      {ready && user && (
        <>
          {loading && <p>Caricamento…</p>}
          {err && <p className="msg">{err}</p>}

          {!loading && !err && items.length === 0 && (
            <p>Nessuna chat ancora. Accetta una richiesta per iniziare.</p>
          )}

          <div className="list">
            {items.map((m) => (
              <Link key={normId(m.id)} href={`/chat/${m.id}`} className="card">
                <div className="cardTop">
                  <h2>{m.requestTitle}</h2>
                  <span className={`badge ${String(m.status || "match").toLowerCase()}`}>
                    {m.status || "match"}
                  </span>
                </div>

                {m.requestCity ? <p className="city">{m.requestCity}</p> : null}
                <p className="desc">{clip(m.requestDesc, 140) || "Apri la chat per vedere i dettagli."}</p>

                <div className="row">
                  <span className="who">
                    Con: {m.otherId ? `Utente ${String(m.otherId).slice(-6)}` : "Utente"}
                  </span>
                  <span className="pill">Apri chat</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <style jsx>{`
        .subtitle { font-size: 14px; opacity: .92; margin-bottom: 14px; }
        .msg { opacity: .95; margin: 10px 0; }

        .cardInfo{
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

        .list {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        }

        .card {
          display: block;
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.35);
          padding: 14px 16px;
          text-decoration: none;
          color: inherit;
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
          white-space: nowrap;
        }

        .row {
          display:flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
          opacity: 0.95;
        }
        .who { font-size: 13px; opacity: .9; }
        .pill {
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 180, 255, 0.35);
          font-size: 12px;
        }
      `}</style>
    </Layout>
  );
}
