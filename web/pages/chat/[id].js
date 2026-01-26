import { useContext, useEffect, useMemo, useRef, useState } from "react";
import Layout from "../../components/Layout";
import { apiFetch } from "../../lib/api";
import { useRouter } from "next/router";
import Link from "next/link";
import { AuthContext } from "../_app";

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

function normId(x) {
  return x == null ? "" : String(x);
}

function pickCreatedAt(m) {
  return m?.createdAt || m?.created_at || m?.ts || m?.time || m?.sent_at || null;
}

function pickSenderId(m) {
  return (
    m?.sender_id ||
    m?.senderId ||
    m?.user_id ||
    m?.userId ||
    m?.from_id ||
    m?.fromId ||
    null
  );
}

async function tryFetchMe() {
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

async function tryFetchMessages(matchId) {
  try {
    return await apiFetch(`/matches/${matchId}/messages`);
  } catch (e) {
    const msg = String(e?.message || "").toLowerCase();
    if (msg.includes("not found") || msg.includes("404")) {
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

  const auth = useContext(AuthContext) || {};
  const ctxUser = auth.user ?? auth[0] ?? null;

  const [me, setMe] = useState(ctxUser);
  const [list, setList] = useState([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [noAuth, setNoAuth] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (ctxUser?.id) setMe(ctxUser);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxUser?.id]);

  async function ensureMe() {
    if (me?.id) return;
    if (!getToken()) return;
    const data = await tryFetchMe();
    const u = data?.user || data?.me || data?.item || data?.data || data || null;
    if (u?.id) setMe(u);
  }

  async function load() {
    if (!id) return;

    if (!getToken()) {
      setNoAuth(true);
      setErr("Devi accedere per usare la chat (token mancante).");
      return;
    }

    try {
      setNoAuth(false);
      await ensureMe();
      const data = await tryFetchMessages(id);
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [list.length]);

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
      const optimistic = {
        id: `tmp-${Date.now()}`,
        text: v,
        createdAt: new Date().toISOString(),
        user_id: me?.id || null,
      };
      setList((prev) => [...prev, optimistic]);
      setText("");

      await trySendMessage(id, v);
      await load();
    } catch (e2) {
      setErr(e2?.message || "Errore invio messaggio");
    }
  }

  const empty = useMemo(() => list.length === 0, [list]);
  const meId = me?.id ? normId(me.id) : "";

  return (
    <Layout title="WeTrust — Chat">
      <h1>Chat</h1>

      {err && (
        <p className="err">
          {err}{" "}
          {noAuth && (
            <>
              <Link href="/login" className="lnk">
                Vai al login
              </Link>
              .
            </>
          )}
        </p>
      )}

      <div className="wrap">
        <div className="box">
          {empty && <p className="muted">Nessun messaggio ancora. Scrivi tu per primo.</p>}

          {list.map((m, i) => {
            const senderId = normId(pickSenderId(m));
            const mine = !!(meId && senderId && senderId === meId);
            const ts = pickCreatedAt(m);
            const key = m?.id || `${ts || "t"}-${i}`;

            return (
              <div key={key} className={`msg ${mine ? "mine" : "theirs"}`}>
                <div className="bubble">
                  <div className="meta">{ts ? new Date(ts).toLocaleString() : ""}</div>
                  <div className="txt">{m?.text}</div>
                </div>
              </div>
            );
          })}

          <div ref={endRef} />
        </div>

        <form className="form" onSubmit={send}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Scrivi un messaggio…"
            disabled={noAuth}
          />
          <button disabled={noAuth || !text.trim()}>Invia</button>
        </form>

        <p style={{ marginTop: 10 }}>
          <Link href="/chats" className="back">
            ← Torna alle chat
          </Link>
        </p>
      </div>

      <style jsx>{`
        .err {
          opacity: 0.95;
        }
        .lnk {
          text-decoration: underline;
          color: #a5f3fc;
          font-weight: 700;
        }
        .back {
          text-decoration: underline;
          color: #a5f3fc;
          font-weight: 800;
        }

        .wrap {
          max-width: 820px;
        }
        .box {
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 18px;
          padding: 14px;
          min-height: 260px;
          display: grid;
          gap: 10px;
        }
        .muted {
          opacity: 0.8;
          margin: 0;
        }

        .msg {
          display: flex;
        }
        .msg.mine {
          justify-content: flex-end;
        }
        .msg.theirs {
          justify-content: flex-start;
        }
        .bubble {
          max-width: 78%;
          border: 1px solid rgba(148, 163, 184, 0.25);
          border-radius: 14px;
          padding: 10px 12px;
          background: rgba(2, 6, 23, 0.35);
        }
        .msg.mine .bubble {
          background: rgba(0, 180, 255, 0.12);
          border-color: rgba(0, 180, 255, 0.28);
        }

        .meta {
          opacity: 0.7;
          font-size: 11px;
          margin-bottom: 4px;
        }
        .txt {
          font-size: 14px;
          white-space: pre-wrap;
          word-break: break-word;
        }

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
        button:disabled,
        input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </Layout>
  );
}
