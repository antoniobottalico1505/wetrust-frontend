import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Link from "next/link";
import { apiFetch } from "../lib/api";

export default function ChatsPage() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch("/me/matches");
        const list = data?.matches || data?.items || [];
        setItems(Array.isArray(list) ? list : []);
      } catch (e) {
        setErr(e?.message || "Errore nel caricare le chat.");
      }
    })();
  }, []);

  return (
    <Layout title="WeTrust — Chat">
      <h1>Chat</h1>
      <p className="sub">Le chat compaiono dopo che accetti o ricevi un match.</p>

      {err && (
        <p className="err">
          {err}{" "}
          {String(err).toLowerCase().includes("token") && (
            <>
              <Link href="/login" className="lnk">Vai al login</Link>.
            </>
          )}
        </p>
      )}

      <div className="list">
        {items.map((m) => {
          const title =
            m.requestTitle || m.request?.title || m.title || `Match ${m.id}`;
          const city =
            m.requestCity || m.request?.city || m.city || "";
          return (
            <Link key={m.id} href={`/chat/${m.id}`} className="card">
              <div className="top">
                <strong>{title}</strong>
                <span className="city">{city}</span>
              </div>
              <div className="bottom">
                <span>{m.otherUser?.name ? `Con: ${m.otherUser.name}` : "Apri la chat"}</span>
                <span className="pill">Apri chat</span>
              </div>
            </Link>
          );
        })}
      </div>

      <style jsx>{`
        .sub { opacity: .9; margin-bottom: 12px; }
        .err { opacity: .95; }
        .lnk { text-decoration: underline; color: #a5f3fc; font-weight: 800; }

        .list { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
        .card {
          display: block;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 18px;
          padding: 14px;
          transition: transform .12s ease, border-color .12s ease;
          text-decoration: none;
          color: inherit;
        }
        .card:hover { transform: translateY(-2px); border-color: rgba(0,180,255,0.55); }
        .top { display:flex; justify-content: space-between; gap: 10px; align-items: baseline; }
        .city { opacity: .8; font-size: 12px; }
        .bottom { margin-top: 10px; display:flex; justify-content: space-between; gap: 10px; opacity: .92; }
        .pill { padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(0,180,255,0.35); }
      `}</style>
    </Layout>
  );
}
