// web/pages/requests/[id].js

import { useContext, useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import { apiFetch } from "../../lib/api";
import { AuthContext } from "../_app";
import { centsToEUR, eurToCents } from "../../lib/money";
import Link from "next/link";

import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

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

function PayBox({ onPaid }) {
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
      <p className="hint">Il denaro resta bloccato finché il richiedente rilascia il pagamento.</p>

      <form onSubmit={pay}>
        <PaymentElement />
        <button className="btn" disabled={loading || !stripe}>
          {loading ? "Confermo…" : "Conferma pagamento"}
        </button>
      </form>

      {msg && <p className="msgTop">{msg}</p>}
    </div>
  );
}

export default function RequestDetail({ id }) {
  const auth = useContext(AuthContext) || {};
  const user = auth.user ?? auth[0] ?? null;
  const ready = auth.ready ?? auth[2] ?? false;

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
    if (!getToken()) {
      setMsg("Devi accedere prima (token mancante). Vai su Accedi via SMS.");
      return false;
    }
    return true;
  }

  async function load() {
    if (!id) return;
    try {
      setMsg("");
      setLoading(true);

      const data = await apiAuthFetch(`/requests/${id}`);
      const requestObj = data?.request || data?.item || null;

      setReqData(requestObj);
      setMatch(data?.match || null);
    } catch (err) {
      setMsg(err?.message || "Errore caricamento");
      setReqData(null);
      setMatch(null);
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
      setMatch(data?.match || null);
      setMsg("Richiesta accettata ✅ Ora potete chattare.");
      if (!data?.match?.id) await load();
    } catch (err) {
      setMsg(err?.message || "Errore accettazione richiesta");
    }
  }

  // helper imposta prezzo
  async function setPrice() {
    setMsg("");
    if (!match?.id) return setMsg("Match non valido.");
    if (!requireAuthOrMessage()) return;

    try {
      const cents = eurToCents(priceEUR);
      if (!cents || cents <= 0) return setMsg("Inserisci un prezzo valido (es. 25).");

      const data = await apiAuthFetch(`/matches/${match.id}/price`, {
        method: "POST",
        body: { price_cents: cents },
      });

      setMatch(data?.match || match);
      setMsg("Prezzo impostato ✅");
    } catch (err) {
      setMsg(err?.message || "Errore impostazione prezzo");
    }
  }

  // paga richiedente (carta o voucher)
  async function startPay(useWallet) {
  setMsg("");
  if (!match?.id) return setMsg("Match non valido.");
  if (!requireAuthOrMessage()) return;

  try {
    const data = await apiAuthFetch(`/matches/${match.id}/pay`, {
      method: "POST",
      body: { use_wallet: !!useWallet },
    });

    setMatch(data?.match || match);

    // ✅ voucher/wallet: nessun checkout Stripe
    if (data?.wallet_used || data?.match?.paid_with_wallet) {
      setClientSecret(null);
      setMsg("Pagato con voucher ✅ (fondi bloccati)");
      await load();
      return;
    }

    // ✅ carta: mostra PaymentElement
const cs = data?.clientSecret || data?.client_secret || null;

// Se manca la publishable key sul frontend, Elements non può apparire
if (!stripePromise) {
  setMsg("Checkout non disponibile: manca NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY sul frontend.");
  return;
}

if (!cs) {
  setMsg("Checkout non disponibile: Stripe non ha restituito clientSecret (controlla Stripe config / Connect).");
  return;
}

setClientSecret(cs);
if (data?.amount_cents) setMsg(`Da pagare: ${centsToEUR(data.amount_cents)} (fee inclusa)`);

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
      setMatch(data?.match || match);
      setMsg("Pagamento rilasciato ✅");
    } catch (err) {
      setMsg(err?.message || "Errore rilascio pagamento");
    }
  }

  if (!id) {
    return (
      <Layout title="WeTrust — Dettaglio richiesta">
        <p>Caricamento…</p>
      </Layout>
    );
  }

  const city = reqData ? pickCity(reqData) : "";

  return (
    <Layout title="WeTrust — Dettaglio richiesta">
      {loading && <p>Caricamento…</p>}
      {msg && <p className="msgTop">{msg}</p>}

      {!loading && reqData && (
        <>
          <div className="list">
            <article className="card2">
              <h2>{reqData.title}</h2>
              {city ? <p className="city">{city}</p> : null}
              <p className="desc">{reqData.description}</p>

              <div className="row">
                <span className="badge">{reqData.status}</span>

                {!ready ? null : !user ? (
                  <Link href="/login" legacyBehavior>
                    <a className="btn2">Accedi via SMS</a>
                  </Link>
                ) : !match && String(user.id) !== String(reqData.userId) ? (
                  <button type="button" className="btn2" onClick={accept}>
                    Accetta
                  </button>
                ) : null}

                {match ? (
                  <Link href={`/chat/${match.id}`} legacyBehavior>
                    <a className="ghost">Apri chat</a>
                  </Link>
                ) : null}

                <Link href="/requests" legacyBehavior>
                  <a className="ghost">Torna alle richieste</a>
                </Link>
<<<<<<< HEAD
              </div>
            </article>
          </div>
=======
              ) : !match && String(user.id) !== String(reqData.userId) ? (
                <button onClick={accept} className="btn">
                  Accetta richiesta
                </button>
              ) : null}

                        {match ? (
                <Link href={`/chat/${match.id}`} className="btn ghost">
                  Apri chat
                </Link>
              ) : null}
            </div>
>>>>>>> ffff469 (Fix apiFetch token + requests/[id] JSX)

          {match && (
            <div className="grid">
              <div className="card">
                <h3>Match</h3>
                <p className="line">
                  <strong>Status:</strong> {match.status || "—"}
                </p>
                <p className="line">
                  <strong>Prezzo:</strong>{" "}
                  {match.price_cents ? centsToEUR(match.price_cents) : "non impostato"}
                </p>
                <p className="line">
                  <strong>Fee WeTrust:</strong> {match.fee_cents ? centsToEUR(match.fee_cents) : "—"}
                </p>
                <p className="hint">Il denaro viene bloccato e rilasciato solo con conferma del richiedente.</p>

                {user && String(user.id) === String(match.helperId) && (
                  <div className="row">
                    <input
                      value={priceEUR}
                      onChange={(e) => setPriceEUR(e.target.value)}
                      placeholder="Prezzo in € (es. 25)"
                    />
                    <button type="button" className="btn" onClick={setPrice}>
                      Imposta prezzo
                    </button>
                  </div>
                )}

<<<<<<< HEAD
                {user && String(user.id) === String(match.userId) && (
                  <>
                    <div className="row">
                      <button type="button" className="btn" onClick={() => startPay(false)}>
                        Paga
                      </button>
                      <button type="button" className="btn ghost" onClick={() => startPay(true)}>
                        Paga usando voucher
                      </button>
                    </div>
=======
{/* Richiedente: paga e rilascia */}
{user && match && String(user.id) === String(match.userId) && (
  <>
    <div className="row">
      <button className="btn" onClick={() => startPay(false)}>
        Paga
      </button>
      <button className="btn ghost" onClick={() => startPay(true)}>
        Paga usando voucher
      </button>
    </div>
>>>>>>> ffff469 (Fix apiFetch token + requests/[id] JSX)

                    <div className="row">
                      <button type="button" className="btn danger" onClick={release}>
                        Conferma & rilascia pagamento
                      </button>
                    </div>
                  </>
                )}
              </div>

<<<<<<< HEAD
              {clientSecret && stripePromise ? (
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <PayBox
                    onPaid={() => {
                      setClientSecret(null);
                      load();
                    }}
                  />
                </Elements>
              ) : (
                <div className="card">
                  <h3>Pagamento</h3>
                  <p className="hint">
                    Clicca “Paga (carta)” per vedere i metodi di pagamento.
=======
              </div>

              <div className="card">
                <h3>Pagamento</h3>

                {clientSecret && stripePromise ? (
                  <Elements stripe={stripePromise} options={{ clientSecret }}>
                    <PayBox match={match} onPaid={() => load()} />
                  </Elements>
                ) : (
                  <p className="hint">
                    I metodi di pagamento saranno disponibili e il trasferimento avverrà quando il destinatario avrà creato un account Stripe Express dalla sezione{" "}
                    <Link href="/profile" className="ghost">
                      Profilo
                    </Link>
                    .
>>>>>>> ffff469 (Fix apiFetch token + requests/[id] JSX)
                  </p>
                )}
              </div>
            </div>
          )}

          <style jsx>{`
            .msgTop {
              font-size: 13px;
              margin: 6px 0 10px;
            }

            .list {
              display: grid;
              gap: 12px;
              grid-template-columns: 1fr;
              margin-top: 10px;
            }
            .card2 {
              border-radius: 18px;
              background: rgba(15, 23, 42, 0.95);
              border: 1px solid rgba(148, 163, 184, 0.35);
              padding: 14px 16px;
            }
            .card2 h2 {
              margin: 0 0 6px;
              font-size: 16px;
            }
            .city {
              margin: 0 0 8px;
              font-size: 12px;
              opacity: 0.85;
            }
            .desc {
              margin: 0;
              opacity: 0.92;
              font-size: 14px;
            }
            .row {
              display: flex;
              gap: 10px;
              flex-wrap: wrap;
              margin-top: 10px;
              align-items: center;
            }
            .btn2 {
              border-radius: 999px;
              border: none;
              padding: 10px 16px;
              font-weight: 900;
              cursor: pointer;
              background: linear-gradient(135deg, #00b4ff, #00e0a0);
              color: #020617;
              text-decoration: none;
              display: inline-block;
            }
            .badge {
              padding: 2px 8px;
              border-radius: 999px;
              border: 1px solid rgba(148, 163, 184, 0.7);
              font-size: 12px;
              opacity: 0.9;
            }
            .ghost {
              border-radius: 999px;
              padding: 9px 14px;
              font-weight: 900;
              text-decoration: none;
              background: transparent;
              border: 1px solid rgba(148, 163, 184, 0.6);
              color: #ffffff;
              display: inline-block;
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
            .danger {
              background: linear-gradient(135deg, #00e0a0, #00b4ff);
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
