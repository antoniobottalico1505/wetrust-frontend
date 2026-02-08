import { useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import { apiFetch } from "../lib/api";

function EyeIcon({ size = 18, strokeWidth = 2 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}

function EyeOffIcon({ size = 18, strokeWidth = 2 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 3l18 18"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M10.6 10.6a2.8 2.8 0 0 0 3.8 3.8"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M6.3 6.8C3.9 8.6 2.5 12 2.5 12s3.5 7 9.5 7c1.6 0 3-.3 4.3-.9"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="M9.1 5.3A9.7 9.7 0 0 1 12 5c6 0 9.5 7 9.5 7s-1.5 3-4.1 4.9"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
const [showPassword, setShowPassword] = useState(false);

  async function register(e) {
    e.preventDefault();
    setMsg("");
    try {
      setLoading(true);
     await apiFetch("/auth/email/register", {
  method: "POST",
  auth: false,
  body: { email, password },
});

setMsg("Ti abbiamo inviato una mail di verifica. Aprila e premi VERIFY NOW per tornare al login.");

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
<div className="pw">
  <input
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    type={showPassword ? "text" : "password"}
    required
    autoComplete="new-password"
  />
  <button
    type="button"
    className="pwBtn"
    onClick={() => setShowPassword((v) => !v)}
    aria-label={showPassword ? "Nascondi password" : "Mostra password"}
  >

{showPassword ? <EyeOffIcon /> : <EyeIcon />}

  </button>
</div>


        <button disabled={loading}>{loading ? "Creo…" : "Crea account"}</button>

        <p className="small">
          Hai già un account? <Link href="/login">Accedi</Link>
        </p>
      </form>

      {msg && <p className="msg">{msg}</p>}

      <style jsx>{`
.pw {
  position: relative;
  display: flex;
  align-items: center;
}

.pw input {
  width: 100%;
  padding-right: 44px;
}

.pwBtn {
  position: absolute;
  right: 8px;
  height: 34px;
  width: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: transparent;

  /* ✅ stesso colore del testo input */
  color: rgba(248, 250, 252, 0.92);

  cursor: pointer;
}

.pwBtn:hover {
  border-color: rgba(148, 163, 184, 0.45);
  color: rgba(248, 250, 252, 1);
}

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
