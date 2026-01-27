import { useContext, useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import { apiFetch } from "../../lib/api";
import { AuthContext } from "../_app";
import { centsToEUR, eurToCents } from "../../lib/money";
import Link from "next/link";

import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

/**
 * Wrapper: forza l'invio del token JWT nelle chiamate API.
 * Il backend ti risponde "Token mancante" se manca Authorization.
 */
function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}

async function apiAuthFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  return apiFetch(path, { ...options, headers });
}

function pickCity(r) {
  const v =
    r?.city ||
    r?.city_name ||
    r?.town ||
    r?.location?.city ||
    r?.address?.city ||
    r?.place?.city ||
    "";

  if (!v) return "";
  if (typeof v === "string") return v.trim();

  if (typeof v === "object") {
    const s = v?.name || v?.label || v?.value || v?.city || "";
    return typeof s === "string" ? s.trim() : "";
  }

  return String(v).trim();
}

function PayBox({ match, onPaid }) {
  const stripe = useStripe();
  const elements = useElements();
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function pay(e) {
    e.preventDefault();
    setMsg("");
    if (!stripe || !elements) return;

    try {
      setLoading(true);
      const res = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });

      if (res.error) throw new Error(res.error.message);

      setMsg("Pagamento autorizzato ✅ (fondi bloccati)");
      onPaid?.();
    } catch (err) {
      setMsg(err?.message || "Errore pagamento");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Paga (fondi bloccati)</h3>
      <p className="sub">Stile Vinted: il denaro resta bloccato finché confermi la consegna del servizio.</p>

      <form onSubmit={pay}>
        <PaymentElement />
        <button disabled={loading || !stripe}>{loading ? "Confermo…" : "Conferma pagamento"}</button>
      </form>

      {msg && <p className="msg">{msg}</p>}

      <style jsx>{`
        .card {
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.4);
          padding: 14px 16px;
          margin-top: 12px;
        }
        .sub {
          opacity: 0.9;
          margin: 6px 0 10px;
          font-size: 13px;
        }
        button {
          margin-top: 10px;
          border-radius: 999px;
          border: none;
          padding: 8px 18px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          background: linear-gradient(135deg, #00b4ff, #00e0a0);
          color: #020617;
        }
        .msg {
          font-size: 13px;
          margin-top: 8px;
        }
      `}</style>
    </div>
  );
}

export default function RequestDetail({ id }) {
  const { user, ready } = useContext(AuthContext);

  const [reqData, setReqData] = useState(null);
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [priceEUR, setPriceEUR] = useState("");

  const [clientSecret, setClientSecret] = useState(null);

  const stripePromise = useMemo(() => {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!pk) return null;
    return loadStripe(pk);
  }, []);

  function requireAuthOrMessage() {
    const token = getToken();
    if (!token) {
      setMsg("Devi accedere prima (token mancante). Vai su Accedi via SMS.");
      return false;
    }
    return true;
  }

  async function load() {
    try {
      setMsg("");
      setLoading(true);

      const data = await apiAuthFetch(`/requests/${id}`);
      setReqData(data.request);
      setMatch(data.match || null);
    } catch (err) {
      const m = err?.message || "Errore caricamento";
      setMsg(m);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function accept() {
    setMsg("");
    if (!requireAuthOrMessage()) return;

    try {
      const data = await apiAuthFetch(`/requests/${id}/accept`, { method: "POST" });
      setMatch(data.match);
      setMsg("Richiesta accettata ✅ Ora potete chattare.");
    } catch (err) {
      setMsg(err?.message || "Errore accettazione richiesta");
    }
  }

  async function setPrice() {
    setMsg("");
    if (!match?.id) return setMsg("Match non valido.");
    if (!requireAuthOrMessage()) return;

    try {
      const cents = eurToCents(priceEUR);
      if (!cents || cents <= 0) {
        setMsg("Inserisci un prezzo valido (es. 25).");
        return;
      }

      const data = await apiAuthFetch(`/matches/${match.id}/price`, {
        method: "POST",
        body: JSON.stringify({ price_cents: cents }),
      });

      setMatch(data.match);
      setMsg("Prezzo impostato ✅");
    } catch (err) {
      setMsg(err?.message || "Errore impostazione prezzo");
    }
  }

  async function startPay(useWallet) {
    setMsg("");
    if (!match?.id) return setMsg("Match non valido.");
    if (!requireAuthOrMessage()) return;

    try {
      const data = await apiAuthFetch(`/matches/${match.id}/pay`, {
        method: "POST",
        body: JSON.stringify({ use_wallet: !!useWallet }),
      });

      setClientSecret(data.clientSecret);
      setMatch(data.match);
      setMsg(`Da pagare: ${centsToEUR(data.amount_cents)} (fee inclusa)`);
    } catch (err) {
      setMsg(err?.message || "Errore avvio pagamento");
    }
  }

  async function release() {
    setMsg("");
    if (!match?.id) return setMsg("Match non valido.");
    if (!requireAuthOrMessage()) return;

    try {
      const data = await apiAuthFetch(`/matches/${match.id}/release`, { method: "POST" });
      setMatch(data.match);
      setMsg("Pagamento rilasciato ✅");
    } catch (err) {
      setMsg(err?.message || "Errore rilascio pagamento");
    }
  }

  if (!id) return null;

  const city = reqData ? pickCity(reqData) : "";

  return (
    <Layout title="WeTrust — Dettaglio richiesta">
      {loading && <p>Caricamento…</p>}
      {msg && <p className="msgTop">{msg}</p>}

      {!loading && reqData && (
        <>
          <div className="top">
            <div>
              <h1>{reqData.title}</h1>
              <p className="desc">{reqData.description}</p>
              <div className="meta">
                {city ? <span>{city}</span> : null}
                <span className="badge">{reqData.status}</span>
              </div>
            </div>

            <div className="actions">
              {!ready ? null : !user ? (
                <Link href="/login" className="btn">
                  Accedi via SMS
                </Link>
              ) : !match && user.id !== reqData.user_id ? (
                <button onClick={accept} className="btn">
                  Accetta richiesta
                </button>
              ) : null}

              {match && (
                <Link href={`/chat/${match.id}`} className="btn ghost">
                  Apri chat
                </Link>
              )}
            </div>
          </div>

          {match && (
            <div className="grid">
              <div className="card">
                <h3>Match</h3>
                <p className="line">
                  <strong>Status:</strong> {match.status}
                </p>
                <p className="line">
                  <strong>Prezzo:</strong> {match.price_cents ? centsToEUR(match.price_cents) : "non impostato"}
                </p>
                <p className="line">
                  <strong>Fee WeTrust:</strong> {match.fee_cents ? centsToEUR(match.fee_cents) : "—"}
                </p>
                <p className="hint">Il denaro viene bloccato e rilasciato solo con conferma del richiedente.</p>

                {user && user.id === match.requester_id && (
                  <>
                    <div className="row">
                      <input
                        value={priceEUR}
                        onChange={(e) => setPriceEUR(e.target.value)}
                        placeholder="Prezzo in € (es. 25)"
                      />
                      <button className="btn" onClick={setPrice}>
                        Imposta prezzo
                      </button>
                    </div>

                    <div className="row">
                      <button className="btn" onClick={() => startPay(false)}>
                        Paga (carta)
                      </button>
                      <button className="btn ghost" onClick={() => startPay(true)}>
                        Paga usando voucher
                      </button>
                    </div>

                    <div className="row">
                      <button className="btn danger" onClick={release}>
                        Conferma & rilascia pagamento
                      </button>
                    </div>
                  </>
                )}
              </div>

              {clientSecret && stripePromise ? (
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <PayBox match={match} onPaid={() => load()} />
                </Elements>
              ) : (
                <div className="card">
                  <h3>Pagamento</h3>
                  <p className="hint">
                    Per il checkout Stripe serve impostare <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> sul web e
                    togliere <code>MOCK_STRIPE</code> sull’API.
                  </p>
                </div>
              )}
            </div>
          )}

          <style jsx>{`
            .msgTop {
              font-size: 13px;
              margin: 6px 0 10px;
            }
            .top {
              display: flex;
              gap: 16px;
              justify-content: space-between;
              align-items: flex-start;
              flex-wrap: wrap;
            }
            h1 {
              font-size: 26px;
              margin: 6px 0;
            }
            .desc {
              color: #d1d5db;
              margin: 0 0 10px;
              max-width: 760px;
            }
            .meta {
              display: flex;
              gap: 10px;
              font-size: 12px;
              color: #cbd5f5;
              align-items: center;
            }
            .badge {
              padding: 2px 8px;
              border-radius: 999px;
              border: 1px solid rgba(148, 163, 184, 0.7);
            }
            .actions {
              display: flex;
              gap: 10px;
              flex-wrap: wrap;
              align-items: center;
            }
            .btn {
              border-radius: 999px;
              border: none;
              padding: 8px 18px;
              font-size: 14px;
              font-weight: 800;
              cursor: pointer;
              background: linear-gradient(135deg, #00b4ff, #00e0a0);
              color: #020617;
              text-decoration: none;
              display: inline-block;
            }
            .ghost {
              background: transparent;
              border: 1px solid rgba(148, 163, 184, 0.6);
              color: #ffffff;
            }
            .danger {
              background: linear-gradient(135deg, #00e0a0, #00b4ff);
            }
            .grid {
              display: grid;
              grid-template-columns: 1fr;
              gap: 12px;
              margin-top: 14px;
            }
            @media (min-width: 900px) {
              .grid {
                grid-template-columns: 1fr 1fr;
              }
            }
            .card {
              border-radius: 18px;
              background: rgba(15, 23, 42, 0.95);
              border: 1px solid rgba(148, 163, 184, 0.4);
              padding: 14px 16px;
            }
            .line {
              margin: 4px 0;
            }
            .hint {
              font-size: 13px;
              opacity: 0.9;
            }
            .row {
              display: flex;
              gap: 10px;
              flex-wrap: wrap;
              margin-top: 10px;
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
            code {
              background: rgba(2, 6, 23, 0.6);
              padding: 2px 6px;
              border-radius: 8px;
            }
          `}</style>
        </>
      )}
    </Layout>
  );
}

RequestDetail.getInitialProps = ({ query }) => ({ id: query.id });
