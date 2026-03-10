import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { apiFetch } from "../lib/api";
import { Eye as EyeIcon, EyeOff as EyeOffIcon } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const token = useMemo(() => {
    return typeof router.query?.token === "string" ? router.query.token.trim() : "";
  }, [router.query]);

  const hasToken = Boolean(token);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function requestReset(e) {
    e.preventDefault();
    setMsg("");

    try {
      setLoading(true);
      const data = await apiFetch("/auth/email/request-password-reset", {
        method: "POST",
        auth: false,
        body: { email },
      });
      setMsg(data?.message || "Se l'email esiste, ti abbiamo inviato un link per reimpostare la password.");
    } catch (err) {
      setMsg(err?.message || "Errore richiesta reset password");
    } finally {
      setLoading(false);
    }
  }

  async function submitNewPassword(e) {
    e.preventDefault();
    setMsg("");

    if (password.length < 8) {
      setMsg("La nuova password deve avere almeno 8 caratteri.");
      return;
    }

    if (password !== passwordConfirm) {
      setMsg("Le password non coincidono.");
      return;
    }

    try {
      setLoading(true);
      const data = await apiFetch("/auth/email/reset-password", {
        method: "POST",
        auth: false,
        body: { token, password, passwordConfirm },
      });

      setMsg(data?.message || "Password aggiornata correttamente. Reindirizzamento al login…");
      setTimeout(() => {
        router.replace("/login");
      }, 1200);
    } catch (err) {
      setMsg(err?.message || "Errore reset password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title={hasToken ? "Nuova password — WeTrust" : "Password dimenticata — WeTrust"}>
      <h1>{hasToken ? "Imposta una nuova password" : "Password dimenticata"}</h1>

      {!hasToken ? (
        <form className="card" onSubmit={requestReset}>
          <label>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            autoComplete="email"
            placeholder="nome@email.com"
          />

          <button disabled={loading}>{loading ? "Invio…" : "Invia link di reset"}</button>

          <p className="small">
            Ti invieremo una mail con il pulsante <strong>RESET PASSWORD</strong>.
          </p>
          <p className="small">
            <Link href="/login">Torna al login</Link>
          </p>
        </form>
      ) : (
        <form className="card" onSubmit={submitNewPassword}>
          <label>Nuova password</label>
          <div className="pw">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
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

          <label>Conferma nuova password</label>
          <div className="pw">
            <input
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
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

          <button disabled={loading}>{loading ? "Salvataggio…" : "Salva nuova password"}</button>

          <p className="small">
            Al termine verrai reindirizzato alla pagina di accesso.
          </p>
          <p className="small">
            <Link href="/login">Torna al login</Link>
          </p>
        </form>
      )}

      {msg && <p className="msg">{msg}</p>}

      <style jsx>{`
        .card {
          max-width: 520px;
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.4);
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
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
        .pw { position: relative; display: flex; align-items: center; }
        .pw input { width: 100%; padding-right: 44px; }
        .pwBtn {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          background: transparent !important;
          border: none !important;
          margin: 0 !important;
          padding: 6px !important;
          border-radius: 10px;
          cursor: pointer;
          color: #e5e7eb;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .pwBtn :global(svg) { display: block; }
      `}</style>
    </Layout>
  );
}