import { useContext, useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import Link from "next/link";
import { apiFetch } from "../lib/api";
import { AuthContext } from "./_app";

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

function clip(s, n = 140) {
  const t = String(s || "").trim();
  if (!t) return "";
  return t.length > n ? `${t.slice(0, n).trim()}…` : t;
}

function pickTitle(o) {
  return (
    o?.title ||
    o?.subject ||
    o?.need ||
    o?.name ||
    o?.request_title ||
    o?.requestTitle ||
    ""
  );
}

function pickDesc(o) {
  return (
    o?.description ||
    o?.desc ||
    o?.text ||
    o?.details ||
    o?.request_description ||
    o?.requestDesc ||
    ""
  );
}

function pickCity(o) {
  return (
    o?.city ||
    o?.city_name ||
    o?.town ||
    o?.location?.city ||
    o?.address?.city ||
    o?.place?.city ||
    ""
  );
}

function userCode(v) {
  const s = String(v || "");
  // se ci sono cifre, usa quelle (così ottieni sempre un numero tipo 123456)
  const digits = s.replace(/\D/g, "");
  const base = digits.length >= 6 ? digits : s.replace(/[^a-zA-Z0-9]/g, "");
  return base.slice(-6);
}

function userLabel(meId, m) {
  const otherId =
    normId(m?.userId) === normId(meId) ? normId(m?.helperId) :
    normId(m?.helperId) === normId(meId) ? normId(m?.userId) :
    normId(m?.helper_id) === normId(meId) ? normId(m?.user_id) :
    normId(m?.user_id) === normId(meId) ? normId(m?.helper_id) :
    normId(m?.helperId) ||
    normId(m?.helper_id) ||
    normId(m?.userId) ||
    normId(m?.user_id);

  const short = userCode(otherId);
  return short ? `Utente ${short}` : "Utente";
}

async function tryFetchMatches() {
  // ✅ prima /me/matches (più comune), poi fallback /matches
  try {
    return await apiFetch("/me/matches");
  } catch (e) {
    const msg = String(e?.message || "").toLowerCase();
    if (msg.includes("not found") || msg.includes("404")) {
      return await apiFetch("/matches");
    }
    // se è una 401/403, propaghiamo comunque
    throw e;
  }
}

async function tryFetchRequests() {
  try {
    return await apiFetch("/requests");
  } catch {
    return { requests: [] };
  }
}

async function tryFetchMe() {
  // opzionale: serve solo per allineare “Con:”
  try {
    return await apiFetch("/me");
  } catch {
    try {
      return await apiFetch("/users/me");
    } catch {
      return null;
    }
  }
}

export default function ChatsPage() {
  const auth = useContext(AuthContext) || {};
  const ctxUser = auth.user ?? auth[0] ?? null;

  const [me, setMe] = useState(ctxUser);
  const [matches, setMatches] = useState([]);
  const [reqMap, setReqMap] = useState({});
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const authed = !!readToken();

  useEffect(() => {
    // Mantieni “me” aggiornato se il contesto cambia
    if (ctxUser?.id) setMe(ctxUser);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxUser?.id]);

  useEffect(() => {
    if (!authed) return;

    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");

        const [meRes, mRes, rRes] = await Promise.allSettled([
          tryFetchMe(),
          tryFetchMatches(),
          tryFetchRequests(),
        ]);

        if (!alive) return;

        const meData = meRes.status === "fulfilled" ? meRes.value : null;
        const mData = mRes.status === "fulfilled" ? mRes.value : null;
        const rData = rRes.status === "fulfilled" ? rRes.value : { requests: [] };

        const ms = mData?.matches || mData?.items || mData?.list || [];
        const rs = rData?.requests || rData?.items || rData?.list || [];

        // “me” se disponibile
        const maybeUser =
          meData?.user || meData?.me || meData?.item || meData?.data || meData || null;
        if (maybeUser?.id) setMe(maybeUser);

        // mappa richieste
        const map = {};
        for (const r of rs) {
          const rid = normId(r?.id);
          if (rid) map[rid] = r;
        }

        // alcune API includono già la request dentro il match
        for (const m of ms) {
          const embedded = m?.request || m?.req || m?.request_data || null;
          const rid = normId(
            embedded?.id || m?.requestId || m?.request_id || m?.requestID || ""
          );
          if (rid && embedded && !map[rid]) map[rid] = embedded;
        }

        setMatches(Array.isArray(ms) ? ms : []);
        setReqMap(map);
      } catch (e) {
        setErr(e?.message || "Errore caricamento chat.");
        setMatches([]);
        setReqMap({});
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [authed]);

  const items = useMemo(() => {
    const meId = me?.id ? String(me.id) : "";

    return (matches || []).map((m) => {
      const requestId = normId(m?.requestId || m?.request_id || m?.requestID);
      const r = (requestId && reqMap[requestId]) || m?.request || m?.req || null;

      const uId = normId(m?.userId || m?.user_id || m?.requesterId || m?.requester_id);
      const hId = normId(m?.helperId || m?.helper_id);

      const otherId = meId ? (uId === meId ? hId : uId) : "";
      const status = String(m?.status || "match").toLowerCase();

      return {
        id: normId(m?.id),
        match: m,
        requestId,
        status,
        title: pickTitle(r) || (requestId ? `Richiesta ${requestId}` : "Richiesta"),
        city: pickCity(r),
        desc: pickDesc(r),
        otherId,
        otherLabel: pickOtherUserLabel({ ...m, otherId }),
      };
    });
  }, [matches, reqMap, me]);

  return (
    <Layout title="WeTrust — Chat">
      <h1>Chat</h1>
      <p className="subtitle">Le chat compaiono dopo un match (accettazione).</p>

      {!authed && (
        <div className="cardInfo">
          <p>Devi accedere per vedere le chat.</p>
          <Link className="btn" href="/login">
            Vai al login
          </Link>
        </div>
      )}

      {authed && (
        <>
          {loading && <p>Caricamento…</p>}
          {err && <p className="msg">{err}</p>}

          {!loading && !err && items.length === 0 && (
            <p>Nessuna chat ancora. Accetta una richiesta per iniziare.</p>
          )}

          <div className="list">
            {items.map((it) => (
              <article key={it.id || `${it.requestId}-${it.status}`} className="card">
                <div className="cardTop">
                  <h2>{it.title}</h2>
                  <span className={`badge ${it.status}`}>{it.status}</span>
                </div>

                {it.city ? <p className="city">{it.city}</p> : null}
                <p className="desc">
                  {clip(it.desc, 160) || "Apri la chat per iniziare una conversazione."}
                </p>

                <div className="row">
                  <span className="who">Con: {it.otherLabel}</span>
                  <Link className="btn" href={`/chat/${it.id}`}>
                    Apri
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

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

        .cardInfo {
          margin-top: 12px;
          max-width: 520px;
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.35);
          padding: 14px 16px;
        }

        .list {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        }

        /* ✅ stessi riquadri/stile della pagina Richieste */
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
          white-space: nowrap;
        }

        .row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
        }
        .who {
          font-size: 13px;
          opacity: 0.9;
        }

        .btn {
          border-radius: 999px;
          border: none;
          padding: 10px 16px;
          font-weight: 900;
          cursor: pointer;
          background: linear-gradient(135deg, #00b4ff, #00e0a0);
          color: #020617;
          text-decoration: none;
          display: inline-block;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </Layout>
  );
}
