import { useState } from "react";
import Layout from "../components/Layout";
import { apiFetch } from "../lib/api";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback("");

    if (!email.trim() || !message.trim()) {
      setFeedback("Email e messaggio sono obbligatori.");
      return;
    }

    try {
      setSending(true);

      // ✅ body come oggetto: apiFetch serializza lui
      await apiFetch("/contact", {
        method: "POST",
        auth: false, // ✅ contatti deve essere pubblico
        body: { name, email, message },
      });

      setFeedback("Messaggio inviato ✅ Ti risponderemo il prima possibile.");
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      console.error(err);
      setFeedback(err?.message || "Errore durante l'invio del messaggio.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Layout title="WeTrust — Contatti">
      <div className="wrap">
        <h1>Contatti</h1>
        <p className="subtitle">Vuoi parlare di partnership o investimento? Scrivici qui.</p>

        <form className="form" onSubmit={handleSubmit}>
          <label>
            Nome (facoltativo)
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>

          <label>
            Messaggio
            <textarea required value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>

          <button type="submit" disabled={sending}>
            {sending ? "Invio…" : "Invia messaggio"}
          </button>

          {feedback && <p className="feedback">{feedback}</p>}
        </form>
      </div>

      <style jsx>{`
        .wrap { max-width: 640px; margin: 0 auto; padding: 12px 0; }
        h1 { font-size: 28px; margin: 8px 0 6px; }
        .subtitle { font-size: 14px; margin-bottom: 16px; color: #e5e7eb; }
        .form { display:flex; flex-direction: column; gap: 12px; }
        label { display:flex; flex-direction: column; gap: 6px; font-size: 14px; }
        input, textarea {
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.7);
          background: rgba(15, 23, 42, 0.9);
          color: #e5e7eb;
          padding: 10px 12px;
          font-size: 14px;
        }
        textarea { min-height: 120px; resize: vertical; }
        button {
          align-self: flex-start;
          border-radius: 999px;
          border: none;
          padding: 8px 18px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          background: linear-gradient(135deg, #00b4ff, #00e0a0);
          color: #020617;
        }
        .feedback { font-size: 13px; }
      `}</style>
    </Layout>
  );
}
