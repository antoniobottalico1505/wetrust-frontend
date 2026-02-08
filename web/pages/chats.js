import { useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { apiFetch } from "../lib/api";
import { AuthContext } from "./_app";

function pickCity(r) {
  const v =
    r?.city ||
    r?.city_name ||
    r?.town ||
    r?.location?.city ||
    r?.address?.city ||
    r?.place?.city ||
    "";

  if (!v) return "";
  if (typeof v === "string") return v.trim();

  // se arriva come oggetto: {name:"Roma"} / {label:"Roma"} / {value:"Roma"}
  if (typeof v === "object") {
    const s = v?.name || v?.label || v?.value || v?.city || "";
    return typeof s === "string" ? s.trim() : "";
  }

  return String(v).trim();
}

export default function RequestsPage() {
  const router = useRouter();
  const auth = useContext(AuthContext) || {};
  const user = auth.user ?? auth[0] ?? null;
  const ready = auth.ready ?? auth[2] ?? false;

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch("/requests/feed"); // protetto -> usa Bearer
      const listAll = Array.isArray(data?.items) ? data.items : data?.requests || [];
const list = listAll.filter((r) => String(r?.status || "").toUpperCase() !== "RELEASED");
setRequests(list);
    } catch (err) {
      setError(err?.message || "Errore nel caricare le richieste.");
    } finally {
      setLoading(false);
    }
  }

  async function accept(requestId) {
    try {
      const data = await apiFetch(`/requests/${requestId}/accept`, { method: "POST" });

      const matchId =
        data?.match?.id ||
        data?.match_id ||
        data?.matchId ||
        data?.id;

      if (matchId) {
        router.push(`/chats/${matchId}`)
        return;
      }

      await load();
    } catch (err) {
      alert(err?.message || "Errore durante l’accettazione.");
    }
  }

  useEffect(() => {
    if (!ready) return;
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  return (
    <Layout title="WeTrust — Richieste">
      <h1>Richieste</h1>

      {!ready && <p>Caricamento…</p>}

      {ready && !user && (
        <div className="card">
          <p>Per vedere le richieste devi essere loggato.</p>
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
          {loading && <p>Caricamento…</p>}
          {error && <p className="err">{error}</p>}

          {!loading && !error && requests.length === 0 && <p>Nessuna richiesta per ora.</p>}

          <div className="list">
            {requests.map((r) => {
              const city = pickCity(r);

              return (
                <article key={r.id} className="card2">
                  <h2>{r.title || "Richiesta"}</h2>

                  {/* ✅ città se presente (normalizzata) */}
                  {city ? <p className="city">{city}</p> : null}

                  <p className="desc">{r.description}</p>

                  <div className="row">
                    <button className="btn2" onClick={() => accept(r.id)}>
                      Accetta
                    </button>
                    <Link className="ghost" href={`/requests/${r.id}`}>
                      Dettagli
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          <style jsx>{`
            .err {
              opacity: 0.95;
            }
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
            h2 {
              margin: 0 0 6px;
              font-size: 16px;
            }
            .city {
              margin: 0 0 8px;
              font-size: 12px;
              opacity: 0.85;
            }
            .desc {
              margin: 0;
              opacity: 0.92;
              font-size: 14px;
            }
            .row {
              margin-top: 10px;
              display: flex;
              gap: 10px;
              flex-wrap: wrap;
              align-items: center;
            }
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
              text-decoration: none;
              background: transparent;
              border: 1px solid rgba(148, 163, 184, 0.6);
              color: #ffffff;
            }
          `}</style>
        </>
      )}
    </Layout>
  );
}
