// web/pages/profile.js
import { useContext, useEffect, useState } from "react";
import Layout from "../components/Layout";
import { apiFetch } from "../lib/api";
import { AuthContext } from "./_app";

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
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  return apiFetch(path, { ...options, headers });
}

function isNotFound(err) {
  const m = String(err?.message || "").toLowerCase();
  return m.includes("not found") || m.includes("404");
}

function pickUrl(data) {
  if (!data) return "";
  return (
    data.url ||
    data.onboarding_url ||
    data.onboardingUrl ||
    data.account_link_url ||
    data.accountLinkUrl ||
    data.link ||
    data.redirect_url ||
    data.redirectUrl ||
    (typeof data === "string" ? data : "") ||
    ""
  );
}

async function tryCalls(calls) {
  let last = null;
  for (const fn of calls) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (isNotFound(e)) continue;
      throw e;
    }
  }
  throw last || new Error("Not found");
}

export default function ProfilePage() {
  const auth = useContext(AuthContext) || {};
  const user = auth.user ?? auth[0] ?? null;
  const ready = auth.ready ?? auth[2] ?? false;
  const logout = auth.logout ?? (() => {});
  const refresh = auth.refresh ?? (async () => {});

  const [msg, setMsg] = useState("");
  const [wallet, setWallet] = useState(0);
  const [redeemCode, setRedeemCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadWallet() {
    try {
      const data = await tryCalls([
        () => apiAuthFetch("/wallet"),
        () => apiAuthFetch("/me/wallet"),
        () => apiAuthFetch("/users/me/wallet"),
      ]);

      const cents =
        Number(data?.wallet_cents ?? data?.wallet ?? data?.walletCents ?? 0) || 0;

      setWallet(cents);
    } catch {
      setWallet(0);
    }
  }

  useEffect(() => {
    if (!ready || !user) return;
    loadWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.id]);

  async function doRefresh() {
    setMsg("");
    try {
      setLoading(true);
      await refresh();
      await loadWallet();
      setMsg("Aggiornato ✅");
    } catch (err) {
      setMsg(err?.message || "Errore aggiornamento.");
    } finally {
      setLoading(false);
    }
  }

  async function redeem(e) {
    e.preventDefault();
    setMsg("");

    const code = redeemCode.trim();
    if (!code) {
      setMsg("Inserisci un codice voucher.");
      return;
    }

    try {
      setLoading(true);

      await tryCalls([
        () => apiAuthFetch("/vouchers/redeem", { method: "POST", body: { code } }),
        () => apiAuthFetch("/wallet/redeem", { method: "POST", body: { code } }),
        () => apiAuthFetch("/voucher/redeem", { method: "POST", body: { code } }),
        () => apiAuthFetch("/redeem", { method: "POST", body: { code } }),
      ]);

      setRedeemCode("");
      await loadWallet();
      await refresh();
      setMsg("Voucher riscattato ✅");
    } catch (err) {
      setMsg(err?.message || "Errore nel riscatto voucher.");
    } finally {
      setLoading(false);
    }
  }

  async function startOnboarding() {
    setMsg("");
    if (typeof window === "undefined") return;

    try {
      setLoading(true);

      const baseUrl = window.location.origin;

      // endpoint principale (quello giusto)
      const data = await apiAuthFetch("/stripe/connect/onboard", {
        method: "POST",
        body: { baseUrl },
      });

      const url = pickUrl(data);

      if (url) {
        window.location.href = url;
        return;
      }

      await refresh();
      setMsg("Onboarding avviato ✅");
    } catch (e) {
      setMsg(e?.message || "Errore nell'apertura onboarding Stripe.");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <Layout title="WeTrust">
        <p>Caricamento…</p>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout title="WeTrust — Profilo">
        <div style={{ padding: "10px 0" }}>
          <h1>Profilo</h1>
          <p>Per creare richieste, accettarle e chattare devi accedere.</p>
          <a href="/login" className="btn">
            Vai al login
          </a>
        </div>

        <style jsx>{`
          .btn {
            display: inline-block;
            border-radius: 999px;
            padding: 8px 18px;
            font-weight: 700;
            background: linear-gradient(135deg, #00b4ff, #00e0a0);
            color: #020617;
            text-decoration: none;
          }
        `}</style>
      </Layout>
    );
  }

  const stripeActive = !!(user.stripe_account_id || user.stripeAccountId);

  return (
    <Layout title="WeTrust — Profilo">
      <div className="wrap">
        <h1>Profilo</h1>

        <div className="card">
          <div>
            <strong>Trust-ID</strong>: {user.phone || user.email || user.name || "—"}
          </div>
          <div>
            <strong>Wallet voucher</strong>: {(wallet / 100).toFixed(2)}€
          </div>
          <div>
            <strong>Stripe Connect</strong>: {stripeActive ? "attivo" : "non attivo"}
          </div>

          <div className="row">
            <button onClick={doRefresh} disabled={loading}>
              Aggiorna
            </button>
            <button className="ghost" onClick={logout} disabled={loading}>
              Esci
            </button>
          </div>

          <hr className="hr" />

          <h2>Per ricevere pagamenti</h2>
          <p className="sub">
            Completa l’onboarding Stripe Express (richiesto per farti pagare).
          </p>
          <button onClick={startOnboarding} disabled={loading}>
            {loading ? "Apro…" : "Attiva pagamenti (Stripe Connect)"}
          </button>

          <hr className="hr" />

          <h2>Riscatta voucher</h2>
          <form onSubmit={redeem} className="row">
            <input
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value)}
              placeholder="CODICE"
            />
            <button disabled={loading}>{loading ? "…" : "Riscatta"}</button>
          </form>

          {msg && <p className="msg">{msg}</p>}
        </div>
      </div>

      <style jsx>{`
        .wrap {
          max-width: 760px;
          margin: 0 auto;
          padding: 16px 0;
        }
        h1 {
          font-size: 28px;
          margin: 6px 0 12px;
        }
        h2 {
          margin: 8px 0 6px;
          font-size: 18px;
        }
        .sub {
          margin: 0 0 10px;
          opacity: 0.9;
        }
        .card {
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.4);
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }
        input {
          flex: 1;
          min-width: 180px;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.7);
          background: rgba(15, 23, 42, 0.9);
          color: #e5e7eb;
          padding: 10px 12px;
          font-size: 14px;
        }
        button {
          border-radius: 999px;
          border: none;
          padding: 8px 18px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          background: linear-gradient(135deg, #00b4ff, #00e0a0);
          color: #020617;
        }
        .ghost {
          background: transparent;
          color: #ffffff;
          border: 1px solid rgba(148, 163, 184, 0.6);
        }
        .hr {
          width: 100%;
          border: none;
          border-top: 1px solid rgba(148, 163, 184, 0.25);
          margin: 4px 0;
        }
        .msg {
          font-size: 13px;
        }
      `}</style>
    </Layout>
  );
}
