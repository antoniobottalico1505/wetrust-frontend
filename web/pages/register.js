import { useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import { apiFetch } from "../lib/api";
import { setSession } from "../lib/session";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function register(e) {
    e.preventDefault();
    setMsg("");
    try {
      setLoading(true);
      const data = await apiFetch("/auth/email/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setSession(data.token, data.user);
      window.location.href = "/";
    } catch (err) {
      setMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title="Registrati — WeTrust">
      <h1>Registrati</h1>

      <form className="card" onSubmit={register}>
        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />

        <label>Password (min 8)</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />

        <button disabled={loading}>{loading ? "Creo…" : "Crea account"}</button>

        <p className="small">
          Hai già un account? <Link href="/login">Accedi</Link>
        </p>
      </form>

      {msg && <p className="msg">{msg}</p>}

      <style jsx>{`
        .card {
          max-width: 520px;
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.4);
          padding: 14px 16px;
          display:flex;
          flex-direction:column;
          gap: 8px;
        }
        label { font-size: 13px; color:#e5e7eb; }
        input {
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.7);
          background: rgba(15, 23, 42, 0.9);
          color: #e5e7eb;
          padding: 10px 12px;
          font-size: 14px;
        }
        button {
          margin-top: 6px;
          border-radius: 999px;
          border: none;
          padding: 10px 16px;
          font-weight: 900;
          cursor: pointer;
          background: linear-gradient(135deg, #00b4ff, #00e0a0);
          color: #020617;
        }
        .small { font-size: 13px; color:#cbd5e1; margin: 6px 0 0; }
        .small :global(a) { color:#00b4ff; text-decoration: underline; }
        .msg { margin-top: 10px; color:#e5e7eb; }
      `}</style>
    </Layout>
  );
}
