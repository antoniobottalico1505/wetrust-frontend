import { useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import { apiFetch } from "../../lib/api";
import { useRouter } from "next/router";

export default function ChatRoom() {
  const router = useRouter();
  const { id } = router.query;

  const [list, setList] = useState([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    if (!id) return;
    try {
      const data = await apiFetch(`/matches/${id}/messages`);
      setList(data.messages || []);
      setErr("");
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
    // refresh leggero
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await apiFetch(`/matches/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setText("");
      await load();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  const empty = useMemo(() => list.length === 0, [list]);

  return (
    <Layout title="WeTrust — Chat">
      <h1>Chat</h1>
      {err && <p className="err">{err}</p>}

      <div className="wrap">
        <div className="box">
          {empty && <p className="muted">Nessun messaggio ancora. Scrivi tu per primo.</p>}
          {list.map((m) => (
            <div key={m.id} className="msg">
              <div className="meta">{new Date(m.createdAt).toLocaleString()}</div>
              <div className="txt">{m.text}</div>
            </div>
          ))}
        </div>

        <form className="form" onSubmit={send}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Scrivi un messaggio…"
          />
          <button>Invia</button>
        </form>
      </div>

      <style jsx>{`
        .err { opacity: .95; }
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

        .form {
          margin-top: 10px;
          display: flex;
          gap: 8px;
        }
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
      `}</style>
    </Layout>
  );
}
