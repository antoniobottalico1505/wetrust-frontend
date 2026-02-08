import { useContext, useEffect, useState } from "react";
import Layout from "../components/Layout";
import { apiFetch } from "../lib/api";
import { AuthContext } from "./_app";

export default function ProfilePage() {
  const auth = useContext(AuthContext) || {};
  const user = auth.user ?? auth[0] ?? null;
  const ready = auth.ready ?? auth[2] ?? false;
  const logout = auth.logout ?? (() => {});
  const refresh = auth.refresh ?? (async () => {});
const userId = user?.id || null;

  const [msg, setMsg] = useState("");
  const [wallet, setWallet] = useState(0);
  const [redeemCode, setRedeemCode] = useState("");
  const [loading, setLoading] = useState(false);
const [meUser, setMeUser] = useState(null);

async function loadMe() {
  if (!ready || !user) return;
  try {
    const data = await apiFetch("/me");
    setMeUser(data?.user || null);
  } catch {
    setMeUser(null);
  }
}

useEffect(() => {
  if (!ready || !user) return;
  (async () => {
    try {
      const data = await apiFetch("/wallet");
      setWallet(Number(data?.wallet_cents || 0));
    } catch {
      setWallet(0);
    }

    await loadMe();
  })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [ready, user]);

async function refreshAll() {
  setMsg("");
  try {
    setLoading(true);

    await refresh();
    await loadMe();

    const data = await apiFetch("/wallet");
    setWallet(Number(data?.wallet_cents || 0));

    setMsg("Aggiornato ✅");
  } catch (err) {
    setMsg(err?.message || "Errore aggiornamento profilo.");
  } finally {
    setLoading(false);
  }
}

  async function redeem(e) {
    e.preventDefault();
    setMsg("");
    try {
      setLoading(true);
      await apiFetch("/vouchers/redeem", {
        method: "POST",
        body: { code: redeemCode },
      });
      setRedeemCode("");

      const data = await apiFetch("/wallet");
      setWallet(Number(data?.wallet_cents || 0));

      setMsg("Voucher riscattato ✅");
      await refresh();
    } catch (err) {
      setMsg(err?.message || "Errore nel riscatto voucher.");
    } finally {
      setLoading(false);
    }
  }

  async function startOnboarding() {
    setMsg("");
    try {
      setLoading(true);
      const baseUrl = window.location.origin;
      const data = await apiFetch("/stripe/connect/onboard", {
        method: "POST",
        body: { baseUrl },
      });
      window.location.href = data.url;
    } catch (err) {
      setMsg(err?.message || "Errore nell'apertura onboarding Stripe.");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return <Layout title="WeTrust"><p>Caricamento…</p></Layout>;

  if (!user) {
    return (
      <Layout title="WeTrust — Profilo">
        <div style={{ padding: "10px 0" }}>
          <h1>Profilo</h1>
          <p>Per creare richieste, accettarle e chattare devi accedere.</p>
          <a href="/login" className="btn">Vai al login</a>
        </div>
        <style jsx>{`
          .btn{
            display:inline-block;
            border-radius:999px;
            padding:8px 18px;
            font-weight:700;
            background:linear-gradient(135deg,#00b4ff,#00e0a0);
            color:#020617;
            text-decoration:none;
          }
        `}</style>
      </Layout>
    );
  }

const u = meUser || user;

const trustPoints = Number(u?.trust_points ?? 0);

  return (
    <Layout title="WeTrust — Profilo">
      <div className="wrap">
        <h1>Profilo</h1>

        <div className="card">
        <div><strong>Trust-ID</strong>: {u.phone || u.email || u.name || "—"}</div>

<div><strong>Trust points</strong>: {trustPoints.toFixed(2)}</div>

<div><strong>Wallet voucher</strong>: {(wallet / 100).toFixed(2)}€</div>
<div>
  <strong>Stripe Connect</strong>:{" "}
  {u.stripe_account_id ? "attivo" : "non attivo"}
</div>

          <div className="row">
            <button onClick={refreshAll} disabled={loading}>Aggiorna</button>
            <button className="ghost" onClick={logout} disabled={loading}>Esci</button>
          </div>

          <hr className="hr" />

          <h2>Per ricevere pagamenti</h2>
          <p className="sub">Completa l’onboarding Stripe Express (richiesto per farti pagare).</p>
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
        .wrap { max-width: 760px; margin: 0 auto; padding: 16px 0; }
        h1 { font-size: 28px; margin: 6px 0 12px; }
        h2 { margin: 8px 0 6px; font-size: 18px; }
        .sub { margin: 0 0 10px; opacity: 0.9; }
        .card {
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.4);
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .row { display:flex; gap: 10px; flex-wrap: wrap; align-items:center; }
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
          border: 1px solid rgba(148,163,184,0.6);
        }
        .hr { width:100%; border:none; border-top:1px solid rgba(148,163,184,0.25); margin: 4px 0; }
        .msg { font-size: 13px; }
      `}</style>
    </Layout>
  );
}
