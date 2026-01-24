import { useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import { apiFetch } from "../lib/api";
import { setSession } from "../lib/session";

export default function LoginPage() {
  const [mode, setMode] = useState("email"); // "email" | "sms"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [phone, setPhone] = useState(""); // es +39333...
  const [code, setCode] = useState("");
  const [smsStep, setSmsStep] = useState(1); // 1 invio, 2 verifica

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function loginEmail(e) {
    e.preventDefault();
    setMsg("");
    try {
      setLoading(true);
      const data = await apiFetch("/auth/email/login", {
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

  async function startSms(e) {
    e.preventDefault();
    setMsg("");
    try {
      setLoading(true);
      await apiFetch("/auth/sms/start", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      setSmsStep(2);
      setMsg("Codice inviato via SMS.");
    } catch (err) {
      setMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function verifySms(e) {
    e.preventDefault();
    setMsg("");
    try {
      setLoading(true);
      const data = await apiFetch("/auth/sms/verify", {
        method: "POST",
        body: JSON.stringify({ phone, code }),
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
    <Layout title="Accedi — WeTrust">
      <h1>Accedi</h1>

      <div className="tabs">
        <button className={mode === "email" ? "tab active" : "tab"} onClick={() => { setMode("email"); setMsg(""); }}>
          Email + Password
        </button>
        <button className={mode === "sms" ? "tab active" : "tab"} onClick={() => { setMode("sms"); setMsg(""); }}>
          SMS (OTP)
        </button>
      </div>

      {mode === "email" ? (
        <>
          <form className="card" onSubmit={loginEmail}>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />

            <label>Password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />

            <button disabled={loading}>{loading ? "Accesso…" : "Accedi"}</button>

            <p className="small">
              Non hai un account? <Link href="/register">Registrati</Link>
            </p>
          </form>
        </>
      ) : (
        <>
          {smsStep === 1 ? (
            <form className="card" onSubmit={startSms}>
              <label>Telefono (formato internazionale)</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+393331112223"
                required
              />

              <button disabled={loading}>{loading ? "Invio…" : "Invia codice SMS"}</button>
              <p className="small">Inserisci il numero con prefisso (es. +39...).</p>
            </form>
          ) : (
            <form className="card" onSubmit={verifySms}>
              <label>Telefono</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} required />

              <label>Codice SMS</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" required />

              <button disabled={loading}>{loading ? "Verifica…" : "Verifica e accedi"}</button>

              <p className="small">
                Non è arrivato?{" "}
                <a href="#" onClick={(e) => { e.preventDefault(); setSmsStep(1); setCode(""); }}>
                  reinvia
                </a>
              </p>
            </form>
          )}
        </>
      )}

      {msg && <p className="msg">{msg}</p>}

      <style jsx>{`
        .tabs { display:flex; gap:10px; margin: 12px 0; flex-wrap:wrap; }
        .tab {
          border-radius:999px;
          border:1px solid rgba(148,163,184,0.45);
          background: rgba(15,23,42,0.6);
          color:#fff;
          padding: 8px 14px;
          cursor:pointer;
          font-weight:800;
        }
        .active { background: linear-gradient(135deg,#00b4ff,#00e0a0); color:#020617; border:none; }

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
