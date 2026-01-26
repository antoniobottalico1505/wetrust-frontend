import { useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import { apiFetch } from "../../lib/api";
import { useRouter } from "next/router";
import Link from "next/link";

function getToken() {
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

function pickCreatedAt(m) {
  return m?.createdAt || m?.created_at || m?.ts || m?.time || null;
}

async function tryFetchMessages(matchId) {
  // endpoint principale
  try {
    return await apiFetch(`/matches/${matchId}/messages`);
  } catch (e) {
    const msg = String(e?.message || "").toLowerCase();
    if (msg.includes("not found") || msg.includes("404")) {
      // fallback possibili
      try {
        return await apiFetch(`/chat/${matchId}/messages`);
      } catch {}
      return await apiFetch(`/chats/${matchId}/messages`);
    }
    throw e;
  }
}

async function trySendMessage(matchId, text) {
  try {
    return await apiFetch(`/matches/${matchId}/messages`, {
      method: "POST",
      body: { text },
    });
  } catch (e) {
    const msg = String(e?.message || "").toLowerCase();
    if (msg.includes("not found") || msg.includes("404")) {
      try {
        return await apiFetch(`/chat/${matchId}/messages`, {
          method: "POST",
          body: { text },
        });
      } catch {}
      return await apiFetch(`/chats/${matchId}/messages`, {
        method: "POST",
        body: { text },
      });
    }
    throw e;
  }
}

export default function ChatRoom() {
  const router = useRouter();
  const { id } = router.query;

  const [list, setList] = useState([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [noAuth, setNoAuth] = useState(false);

  async function load() {
    if (!id) return;

    if (!getToken()) {
      setNoAuth(true);
      setErr("Devi accedere per usare la chat (token mancante).");
      return;
    }

    try {
      setNoAuth(false);
      const data = await tryFetchMessages(id);
      const msgs = data?.messages || data?.items || data?.list || [];
      setList(Array.isArray(msgs) ? msgs : []);
      setErr("");
    } catch (e) {
      const m = String(e?.message || "").toLowerCase();
      // Se l'API risponde 404/Not found ma l'invio funziona, non sporcare la UI
      if (m.includes("not found") || m.includes("404")) {
        setErr("");
        return;
      }
      setErr(e?.message || "Errore nel caricamento messaggi");
    }
  }

  useEffect(() => {
    if (!id) return;

    load();

    const t = setInterval(() => {
      if (!getToken()) return;
      load();
    }, 2500);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function send(e) {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;

    if (!getToken()) {
      setNoAuth(true);
      setErr("Devi accedere per inviare messaggi (token mancante).");
      return;
    }

    try {
      await trySendMessage(id, v);
      setText("");
      await load();
    } catch (e2) {
      const m = String(e2?.message || "").toLowerCase();
      // Non mostrare 404/Not found: spesso è solo un endpoint alternativo mancante
      if (m.includes("not found") || m.includes("404")) {
        setErr("");
        return;
      }
      setErr(e2?.message || "Errore invio messaggio");
    }
  }

  const empty = useMemo(() => list.length === 0, [list]);

  return (
    <Layout title="WeTrust — Chat">
      <h1>Chat</h1>

      {err && (
        <p className="err">
          {err}{" "}
          {noAuth && (
            <>
              <Link href="/login" className="lnk">Vai al login</Link>.
            </>
          )}
        </p>
      )}

      <div className="wrap">
        <div className="box">
          {empty && <p className="muted">Nessun messaggio ancora. Scrivi tu per primo.</p>}
          {list.map((m, i) => (
            <div key={m.id || `${pickCreatedAt(m) || "t"}-${i}`} className="msg">
              <div className="meta">
                {pickCreatedAt(m) ? new Date(pickCreatedAt(m)).toLocaleString() : ""}
              </div>
              <div className="txt">{m.text}</div>
            </div>
          ))}
        </div>

        <form className="form" onSubmit={send}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Scrivi un messaggio…"
            disabled={noAuth}
          />
          <button disabled={noAuth}>Invia</button>
        </form>

        <p style={{ marginTop: 10 }}>
          <Link href="/chats" className="back">← Torna alle chat</Link>
        </p>
      </div>

      <style jsx>{`
        .err { opacity: .95; }
        .lnk { text-decoration: underline; color: #a5f3fc; font-weight: 700; }
        .back { text-decoration: underline; color: #a5f3fc; font-weight: 800; }
        .wrap { max-width: 820px; }
        .box {
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 18px;
          padding: 14px;
          min-height: 260px;
          display: grid;
          gap: 10px;
        }
        .muted { opacity: .8; margin: 0; }
        .msg {
          border: 1px solid rgba(148, 163, 184, 0.25);
          border-radius: 14px;
          padding: 10px 12px;
          background: rgba(2, 6, 23, 0.35);
        }
        .meta { opacity: .7; font-size: 11px; margin-bottom: 4px; }
        .txt { font-size: 14px; }

        .form { margin-top: 10px; display: flex; gap: 8px; }
        input {
          flex: 1;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.45);
          background: rgba(2, 6, 23, 0.6);
          color: #e5e7eb;
          padding: 10px 12px;
          font-size: 14px;
        }
        button {
          border-radius: 999px;
          border: none;
          padding: 10px 18px;
          font-weight: 800;
          cursor: pointer;
          background: linear-gradient(135deg, #00b4ff, #00e0a0);
          color: #020617;
        }
        button:disabled, input:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </Layout>
  );
}
