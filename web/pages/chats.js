import { useContext, useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import Link from "next/link";
import { apiFetch } from "../lib/api";
import { AuthContext } from "./_app";

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

        // ✅ FIX: nel backend c'è /matches
        const [mData, rData] = await Promise.all([
          apiFetch("/matches"),
          apiFetch("/requests"),
        ]);

        const ms = mData?.matches || mData?.items || [];
        const rs = rData?.requests || rData?.items || [];

        const map = {};
        for (const r of rs) map[String(r.id)] = r;

        setMatches(ms);
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
      const r = reqMap[String(m.requestId)] || null;
      const otherId =
        meId && String(m.userId) === meId ? m.helperId : m.userId;

      return {
        ...m,
        requestTitle: r?.title || `Richiesta ${m.requestId || ""}`,
        requestCity: r?.city || "",
        otherId,
      };
    });
  }, [matches, reqMap, user]);

  return (
    <Layout title="WeTrust — Chat">
      <h1>Chat</h1>
      <p className="sub">Le chat compaiono dopo che accetti o ricevi un match.</p>

      {!ready && <p>Caricamento…</p>}

      {ready && !user && (
        <div className="card">
          <p>Devi accedere per vedere le chat.</p>
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
          {loading && <p>Caricamento…</p>}
          {err && <p className="err">{err}</p>}

          {!loading && !err && items.length === 0 && (
            <p>Nessuna chat ancora. Accetta una richiesta per iniziare.</p>
          )}

          <div className="list">
            {items.map((m) => (
              <Link key={m.id} href={`/chat/${m.id}`} className="card2">
                <div className="top">
                  <strong>{m.requestTitle}</strong>
                  <span className="city">{m.requestCity || ""}</span>
                </div>
                <div className="bottom">
                  <span>Con: {m.otherId ? `Utente ${String(m.otherId).slice(-6)}` : "Utente"}</span>
                  <span className="pill">Apri chat</span>
                </div>
              </Link>
            ))}
          </div>

          <style jsx>{`
            .sub { opacity: 0.9; margin-bottom: 12px; }
            .err { opacity: 0.95; }
            .list {
              display: grid;
              gap: 12px;
              grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
            }
            .card2 {
              display: block;
              background: rgba(15, 23, 42, 0.95);
              border: 1px solid rgba(148, 163, 184, 0.35);
              border-radius: 18px;
              padding: 14px;
              transition: transform 0.12s ease, border-color 0.12s ease;
              text-decoration: none;
              color: inherit;
            }
            .card2:hover {
              transform: translateY(-2px);
              border-color: rgba(0, 180, 255, 0.55);
            }
            .top {
              display: flex;
              justify-content: space-between;
              gap: 10px;
              align-items: baseline;
            }
            .city { opacity: 0.8; font-size: 12px; }
            .bottom {
              margin-top: 10px;
              display: flex;
              justify-content: space-between;
              gap: 10px;
              opacity: 0.92;
            }
            .pill {
              padding: 4px 10px;
              border-radius: 999px;
              border: 1px solid rgba(0, 180, 255, 0.35);
            }
          `}</style>
        </>
      )}
    </Layout>
  );
}
