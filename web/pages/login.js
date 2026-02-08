import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { apiFetch } from "../lib/api";
import { setSession } from "../lib/session";
import { Eye as EyeIcon, EyeOff as EyeOffIcon } from "lucide-react";

function persistToken(token) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("wetrust_token", token);
    localStorage.setItem("token", token); // compat
  } catch {}
}

function looksLike404(err) {
  const msg = String(err?.message || "");
  return msg.includes("404") || msg.toLowerCase().includes("not found");
}

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
const [showPassword, setShowPassword] = useState(false);

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [smsStep, setSmsStep] = useState(1);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

useEffect(() => {
  if (!router.isReady) return;

  const token = router.query?.verify;
  if (!token) return;

  (async () => {
    setLoading(true);
    setMsg("Verifico email…");

    try {
      await apiFetch("/auth/email/verify-link", {
        method: "POST",
        auth: false,
        body: { token: String(token) },
      });

      setMsg("Email verificata ✅ Ora puoi accedere.");
    } catch (err) {
      setMsg(err?.message || "Verifica email fallita");
    } finally {
      setLoading(false);
      router.replace("/login", undefined, { shallow: true });
    }
  })();
}, [router.isReady]);

  async function loginEmail(e) {
    e.preventDefault();
    setMsg("");

    try {
      setLoading(true);

      const data = await apiFetch("/auth/email/login", {
        method: "POST",
        auth: false,
        body: { email, password },
      });

      const token = data?.token || data?.access_token;
      if (!token) throw new Error("Login riuscito ma token mancante nella risposta API");

      persistToken(token);
      setSession(token, data.user);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("wetrust:auth"));
      }

      await router.replace("/");
    } catch (err) {
      setMsg(err?.message || "Errore login");
    } finally {
      setLoading(false);
    }
  }

  async function startSms(e) {
    e.preventDefault();
    setMsg("");

    try {
      setLoading(true);

      // ✅ Prova endpoint più probabile
      try {
        await apiFetch("/auth/sms/send", {
          method: "POST",
          auth: false,
          body: { phone },
        });
      } catch (err1) {
        // ✅ Fallback se nel backend hai /auth/sms/start
        if (looksLike404(err1)) {
          await apiFetch("/auth/sms/start", {
            method: "POST",
            auth: false,
            body: { phone },
          });
        } else {
          throw err1;
        }
      }

      setSmsStep(2);
      setMsg("Codice inviato via SMS. Se non arriva, controlla numero e riprova.");
    } catch (err) {
      setMsg(err?.message || "Errore invio SMS");
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
        auth: false,
        body: { phone, code },
      });

      const token = data?.token || data?.access_token;
      if (!token) throw new Error("Verifica SMS riuscita ma token mancante nella risposta API");

      persistToken(token);
      setSession(token, data.user);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("wetrust:auth"));
      }

      await router.replace("/");
    } catch (err) {
      setMsg(err?.message || "Errore verifica SMS");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title="Accedi — WeTrust">
      <h1>Accedi</h1>

      <div className="tabs">
        <button
          className={mode === "email" ? "tab active" : "tab"}
          onClick={() => {
            setMode("email");
            setSmsStep(1);
            setCode("");
            setMsg("");
          }}
          type="button"
        >
          Email + Password
        </button>

        <button
          className={mode === "sms" ? "tab active" : "tab"}
          onClick={() => {
            setMode("sms");
            setSmsStep(1);
            setCode("");
            setMsg("");
          }}
          type="button"
        >
          SMS (OTP)
        </button>
      </div>

      {mode === "email" ? (
        <form className="card" onSubmit={loginEmail}>
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" />

         <label>Password</label>
<div className="pw">
  <input
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    type={showPassword ? "text" : "password"}
    required
    autoComplete="current-password"
  />
  <button
    type="button"
    className="pwBtn"
    onClick={() => setShowPassword((v) => !v)}
    aria-label={showPassword ? "Nascondi password" : "Mostra password"}
  >
   {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}

  </button>
</div>

          <button disabled={loading}>{loading ? "Accesso…" : "Accedi"}</button>

          <p className="small">
            Non hai un account? <Link href="/register">Registrati</Link>
          </p>
        </form>
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
                autoComplete="tel"
              />
              <button disabled={loading}>{loading ? "Invio…" : "Invia codice SMS"}</button>
              <p className="small">Inserisci il numero con prefisso (es. +39...).</p>
            </form>
          ) : (
            <form className="card" onSubmit={verifySms}>
              <label>Telefono</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} required autoComplete="tel" />

              <label>Codice SMS</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                required
                inputMode="numeric"
              />

              <button disabled={loading}>{loading ? "Verifica…" : "Verifica e accedi"}</button>

              <p className="small">
                Non è arrivato?{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setSmsStep(1);
                    setCode("");
                    setMsg("");
                  }}
                >
                  reinvia
                </a>
              </p>
            </form>
          )}
        </>
      )}

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
        button:disabled { opacity: 0.65; cursor: not-allowed; }
        .small { font-size: 13px; color:#cbd5e1; margin: 6px 0 0; }
        .small :global(a) { color:#00b4ff; text-decoration: underline; }
        .msg { margin-top: 10px; color:#e5e7eb; }
      `}</style>
    </Layout>
  );
}
