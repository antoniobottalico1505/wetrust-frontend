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

async function apiAuthFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  return apiFetch(path, { ...options, headers });
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

    const token = getToken();
    if (!token) {
      setNoAuth(true);
      setErr("Devi accedere per usare la chat (token mancante).");
      return;
    }

    try {
      setNoAuth(false);

      const data = await apiAuthFetch(`/matches/${id}/messages`);
      const msgs = data?.messages || data?.items || data?.list || [];
      setList(Array.isArray(msgs) ? msgs : []);
      setErr("");
    } catch (e) {
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
    if (!text.trim()) return;

    const token = getToken();
    if (!token) {
      setNoAuth(true);
      setErr("Devi accedere per inviare messaggi (token mancante).");
      return;
    }

    try {
      // ✅ NON JSON.stringify: apiFetch serializza lui e mette Content-Type
      await apiAuthFetch(`/matches/${id}/messages`, {
        method: "POST",
        body: { text: text.trim() },
      });
      setText("");
      await load();
    } catch (e2) {
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
          {list.map((m) => (
            <div key={m.id || `${m.createdAt}-${m.text}`} className="msg">
              <div className="meta">
                {m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}
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
      </div>

      <style jsx>{`
        .err { opacity: .95; }
        .lnk { text-decoration: underline; color: #a5f3fc; font-weight: 700; }
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
