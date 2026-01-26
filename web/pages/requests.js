import { useContext, useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import { apiFetch } from "../lib/api";
import Link from "next/link";
import { useRouter } from "next/router";
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

function asObj(r) {
  return r?.request ?? r?.item ?? r;
}

function getRequestId(r) {
  const o = asObj(r);
  const v = o?.id || o?._id || o?.requestId || o?.request_id || "";
  return v == null ? "" : String(v);
}

function getOwnerId(r) {
  const o = asObj(r);
  const v =
    o?.user_id ??
    o?.userId ??
    o?.owner_id ??
    o?.ownerId ??
    o?.requester_id ??
    o?.requesterId ??
    o?.user?.id ??
    o?.owner?.id ??
    "";
  return v == null ? "" : String(v);
}

function pickCity(r) {
  const o = asObj(r);
  const v =
    o?.city ??
    o?.location ??
    o?.town ??
    o?.address?.city ??
    o?.location?.city ??
    o?.place?.city ??
    o?.place?.town ??
    "";
  return typeof v === "string" ? v.trim() : "";
}

function clip(s, n = 180) {
  const t = String(s || "").trim();
  if (!t) return "";
  return t.length > n ? `${t.slice(0, n).trim()}…` : t;
}

function cacheRequest(r) {
  try {
    if (typeof window === "undefined") return;
    const rid = getRequestId(r);
    if (!rid) return;
    const o = asObj(r);
    sessionStorage.setItem(`wetrust_request_${rid}`, JSON.stringify(o));
  } catch {}
}

export default function RequestsPage() {
  const router = useRouter();
  const auth = useContext(AuthContext) || {};
  const ctxUser = auth.user ?? auth[0] ?? null;

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [isLogged, setIsLogged] = useState(false);
  const [meId, setMeId] = useState(ctxUser?.id ? normId(ctxUser.id) : "");
  const [loadingAccept, setLoadingAccept] = useState("");
  const [detailsById, setDetailsById] = useState({});
  const fetchedRef = useRef(new Set());

  useEffect(() => {
    setIsLogged(!!readToken());
    if (readToken()) ensureMeId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ctxUser?.id) setMeId(normId(ctxUser.id));
  }, [ctxUser?.id]);

  async function ensureMeId() {
    if (meId) return meId;
    if (!readToken()) return "";
    try {
      let data;
      try {
        data = await apiFetch("/me");
      } catch (e) {
        const m = String(e?.message || "").toLowerCase();
        if (m.includes("not found") || m.includes("404")) {
          data = await apiFetch("/users/me");
        } else {
          throw e;
        }
      }
      const u = data?.user || data?.me || data?.item || data?.data || data || null;
      const id = u?.id ? normId(u.id) : "";
      if (id) setMeId(id);
      return id;
    } catch {
      return "";
    }
  }

  async function load() {
    setMsg("");
    try {
      setLoading(true);
      const data = await apiFetch("/requests");
      const list = data?.requests || data?.items || data?.list || data || [];
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

  // ✅ Enrichment: se la lista non include la city, recupera i dettagli per mostrarla
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const todo = (requests || [])
        .map((raw) => ({ id: getRequestId(raw), city: pickCity(raw) }))
        .filter(({ id, city }) => id && !city && !fetchedRef.current.has(id))
        .slice(0, 25);

      if (!todo.length) return;

      for (const { id } of todo) fetchedRef.current.add(id);

      const results = await Promise.allSettled(
        todo.map(async ({ id }) => {
          const data = await apiFetch(`/requests/${id}`);
          const req = data?.request || data?.item || data?.data || data;
          return { id, req };
        })
      );

      if (cancelled) return;

      setDetailsById((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.status === "fulfilled" && r.value?.id && r.value?.req) {
            next[r.value.id] = r.value.req;
            try {
              sessionStorage.setItem(
                `wetrust_request_${r.value.id}`,
                JSON.stringify(r.value.req)
              );
            } catch {}
          }
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [requests]);

  function canAccept(r) {
    const o = asObj(r);
    const st = String(o?.status || "").toLowerCase();
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

    const requestId = getRequestId(r);
    if (!requestId) {
      setMsg("Errore: id richiesta mancante.");
      return;
    }

    const helperId = await ensureMeId();
    if (!helperId) {
      setMsg("Errore: helperId mancante (ripeti dopo login).");
      return;
    }

    const ownerId = getOwnerId(r);
    if (ownerId && String(ownerId) === String(helperId)) {
      setMsg("Non puoi accettare la tua richiesta.");
      return;
    }

    try {
      setLoadingAccept(requestId);

      let data;
      try {
        data = await apiFetch("/matches", {
          method: "POST",
          body: {
            requestId,
            helperId,
            request_id: requestId,
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
    } finally {
      setLoadingAccept("");
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
        {requests.map((raw, idx) => {
          const r = asObj(raw);
          const rid =
            getRequestId(raw) || normId(r?.id) || normId(r?._id) || String(idx);

          const city = pickCity(raw) || pickCity(detailsById[rid]);
          const ownerId = getOwnerId(raw);
          const mine = meId && ownerId && String(meId) === String(ownerId);

          return (
            <article key={rid} className="card">
              <div className="cardTop">
                <h2>{r?.title || "Richiesta"}</h2>
                <span className={`badge ${String(r?.status || "open").toLowerCase()}`}>
                  {r?.status || "open"}
                </span>
              </div>

              {city ? <p className="city">{city}</p> : null}
              <p className="desc">
                {clip(r?.description) || "Apri i dettagli per vedere la descrizione."}
              </p>

              <div className="row">
                <Link
                  className="ghost"
                  href={`/requests/${rid}`}
                  onClick={() => cacheRequest(raw)}
                >
                  Dettagli
                </Link>

                <button
                  className="btn"
                  onClick={() => accept(raw)}
                  disabled={!isLogged || !canAccept(raw) || mine || loadingAccept === rid}
                  title={
                    !isLogged
                      ? "Devi essere loggato"
                      : mine
                      ? "Non puoi accettare la tua richiesta"
                      : ""
                  }
                >
                  {loadingAccept === rid ? "..." : "Accetta"}
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
      `}</style>
    </Layout>
  );
}
