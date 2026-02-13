import { useContext, useEffect, useState } from "react";
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
  return (
    localStorage.getItem("wetrust_token") ||
    localStorage.getItem("token") ||
    sessionStorage.getItem("wetrust_token") ||
    sessionStorage.getItem("token")
  );
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
      <p className="sub">Il denaro resta bloccato fino a conferma di avvenuto servizio.</p>

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
  const auth = useContext(AuthContext) || {};
const user = auth.user ?? auth[0] ?? null;
const ready = auth.ready ?? auth[2] ?? false;
const refresh = auth.refresh ?? (async () => {});

  const [reqData, setReqData] = useState(null);
  const [match, setMatch] = useState(null);
const [helperStats, setHelperStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [priceEUR, setPriceEUR] = useState("");

  // Voucher
  const [voucherCode, setVoucherCode] = useState("");

  const [clientSecret, setClientSecret] = useState(null);

const [legal, setLegal] = useState({ termsAccepted: false, termsVersion: null });
const [termsChecked, setTermsChecked] = useState(false);
const [acceptingTerms, setAcceptingTerms] = useState(false);

 const [stripePromise, setStripePromise] = useState(null);
 useEffect(() => {
 // ✅ Stripe solo in browser (evita crash SSR)
 if (typeof window === "undefined") return;
 const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
 if (!pk) return;
 setStripePromise(loadStripe(pk));
 }, []);

  function requireAuthOrMessage() {
    const token = getToken();
    if (!token) {
      setMsg("Devi accedere prima (token mancante). Vai su Accedi via SMS.");
      return false;
    }
    return true;
  }

async function load({ keepMsg = false, silent = false } = {}) {
  try {
    if (!keepMsg) setMsg("");
    setLoading(true);

    const data = await apiAuthFetch(`/requests/${id}`);
    setReqData(data.request);

const m = data.match || null;
setMatch(m);

// Dopo un pagamento completato/bloccato non ha senso mantenere aperto il form Stripe
if (m && (m.paid_with_wallet || String(m.status || "").toUpperCase() === "HELD" || String(m.payment_status || "").toLowerCase() === "succeeded")) {
  setClientSecret(null);
}

setHelperStats(data.helper || null);
const token = getToken();
    if (token) {
      try {
        const l = await apiAuthFetch(`/legal/me`);
        setLegal({
          termsAccepted: !!l.termsAccepted,
          termsVersion: l.termsVersion || null,
        });
      } catch {
        // non blocco la pagina se fallisce
      }
    }
  } catch (err) {
    if (!silent) {
      setMsg(err?.message || "Errore caricamento");
    }
  } finally {
    setLoading(false);
  }
}

async function acceptTerms() {
    setMsg("");
    if (!requireAuthOrMessage()) return;
    if (!termsChecked) {
      setMsg("Spunta la casella per accettare i Termini.");
      return;
    }

    setAcceptingTerms(true);
    try {
      // se per qualche motivo termsVersion non c’è, prova a prenderla dal backend
      const v =
        legal.termsVersion ||
        (await apiAuthFetch("/legal/versions")).termsVersion;
      await apiAuthFetch("/legal/accept", {
        method: "POST",
        body: { doc: "terms", version: v },
      });

      setLegal({ termsAccepted: true, termsVersion: v });
      setMsg("Termini accettati ✅ Ora puoi procedere al pagamento.");
    } catch (err) {
      setMsg(err?.message || "Errore accettazione termini");
    } finally {
      setAcceptingTerms(false);
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
await load({ keepMsg: true, silent: true });
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
  body: { price_cents: cents },
});

      setMatch(data.match);
      setMsg("Prezzo impostato ✅");
await load({ keepMsg: true, silent: true });
    } catch (err) {
      setMsg(err?.message || "Errore impostazione prezzo");
    }
  }

  async function startPay({ useWallet = false, withVoucher = false } = {}) {
    setMsg("");
  if (!legal.termsAccepted) {
    setMsg("Prima di pagare devi accettare i Termini e Condizioni.");
    return;
  }
    if (!match?.id) return setMsg("Match non valido.");
    if (!requireAuthOrMessage()) return;

    try {
      const code = (withVoucher ? voucherCode : "").trim();

   const data = await apiAuthFetch(`/matches/${match.id}/pay`, {
  method: "POST",
  body: { use_wallet: !!useWallet },
});

      // Se paga con wallet, il backend può rispondere senza clientSecret
      if (data.wallet_used) {
        setClientSecret(null);
        setMatch(data.match);
        setMsg(
          `Pagato con wallet ✅ Fondi bloccati. ` +
            `Totale: ${centsToEUR(data.amount_cents)} — Da pagare: ${centsToEUR(data.payable_cents ?? data.amount_cents)}`
        );
        // ricarica dati match
       await load({ keepMsg: true, silent: true });
        return;
      }

      // Pagamento con carta: serve clientSecret
      setClientSecret(data.clientSecret || null);
      setMatch(data.match);

      const payable = data.payable_cents ?? data.amount_cents;
      setMsg(`Totale: ${centsToEUR(data.amount_cents)} — Da pagare: ${centsToEUR(payable)}`);
    } catch (err) {
      setMsg(err?.message || "Errore avvio pagamento");
    }
  }

  async function setPayoutMode(mode) {
    setMsg("");
    if (!match?.id) return setMsg("Match non valido.");
    if (!requireAuthOrMessage()) return;

    try {
      const data = await apiAuthFetch(`/matches/${match.id}/payout-mode`, {
        method: "POST",
        body: { mode },
      });

      setMatch(data.match);
      setMsg(`Modalità helper impostata: ${mode.toUpperCase()} ✅`);
await load({ keepMsg: true, silent: true });
    } catch (err) {
      setMsg(err?.message || "Errore scelta modalità cash/trust");
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
await load({ keepMsg: true, silent: true });
try { await refresh(); } catch {}
    } catch (err) {
      setMsg(err?.message || "Errore rilascio pagamento");
    }
  }

  if (!id) return null;
const city = reqData ? pickCity(reqData) : "";

const matchUserId = match?.userId ?? match?.user_id ?? "";
const matchHelperId = match?.helperId ?? match?.helper_id ?? "";

const isRequester = !!(user && match && String(user.id) === String(matchUserId));
const isHelper = !!(user && match && String(user.id) === String(matchHelperId));

const matchStatus = String(match?.status || "").toUpperCase();
const payStatus = String(match?.payment_status || "").toLowerCase();
const isPaid = !!(
  match?.paid_with_wallet ||
  matchStatus === "HELD" ||
  payStatus === "succeeded" ||
  payStatus === "requires_capture"
);
const isReleased = matchStatus === "RELEASED" || matchStatus === "RELEASING";

const helperMode = String(match?.helper_payout_mode || "").toLowerCase();
const helperModeSet = !!helperMode && helperMode !== "unset";

const requesterWalletOk = match?.requester_wallet_ok; // true/false/null (solo helper)
const priceSet = Number(match?.price_cents || 0) > 0;

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
        <Link href="/login" className="btn2">
          Accedi via SMS
        </Link>
      ) : !match && String(user.id) !== String(reqData.userId) ? (
        <button type="button" onClick={accept} className="btn2">
          Accetta
        </button>
      ) : null}

      {match ? (
        <Link href={`/chat/${match.id}`} className="ghost">
          Apri chat
        </Link>
      ) : null}

      <Link href="/requests" className="ghost">
        Torna alle richieste
      </Link>
    </div>
  </article>
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
{user && match && String(user.id) === String(match.helperId) ? (
  <p className="line">
    <strong>Payout:</strong>{" "}
    {(match.helper_payout_mode || match.helperPayoutMode || "cash").toUpperCase()}
  </p>
) : null}
{helperStats && user && reqData && String(user.id) === String(reqData.userId) ? (
  <p className="line">
    <strong>Punti Trust helper:</strong> {Math.round(Number(helperStats.trust_points || 0))}
  </p>
) : null}

                {/* Helper: imposta prezzo */}
{user && match && String(user.id) === String(match.helperId) && (
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
)}

{isHelper && priceSet && !isPaid && (
  <div className="card">
    <h3>Modalità pagamento (helper)</h3>
    <p className="sub">
      Scegli come verrà pagato il lavoro. Il richiedente vedrà il tasto pagamento solo dopo questa scelta.
    </p>

    <div className="row">
      <button
        className={helperMode === "cash" ? "active" : ""}
        onClick={() => setPayoutMode("cash")}
      >
        CASH (carta → Stripe)
      </button>

      <button
        className={helperMode === "wallet" ? "active" : ""}
        onClick={() => {
          if (requesterWalletOk === false) {
            setMsg("Il richiedente NON ha saldo wallet sufficiente. Chiedi una ricarica o usa CASH.");
            return;
          }
          setPayoutMode("wallet");
        }}
      >
        WALLET (saldo → accredito wallet)
      </button>
    </div>

    {requesterWalletOk === false && (
      <p className="msg">Wallet non disponibile: saldo richiedente insufficiente.</p>
    )}
  </div>
)}

{isRequester && match && !isPaid && (
  <div className="card">
    <h3>Pagamento</h3>

    {!helperModeSet && (
      <p className="msg">In attesa che l’helper scelga CASH o WALLET…</p>
    )}

    {helperModeSet && (
      <>
        {!legal.termsAccepted && (
          <div className="card">
            <h3>Termini e Condizioni</h3>
            <p className="sub">
              Prima di pagare devi accettare i{" "}
              <Link href="/terms" className="ghost">
                Termini e Condizioni
              </Link>
              .
            </p>

            <label className="check">
              <input
                type="checkbox"
                checked={termsChecked}
                onChange={(e) => setTermsChecked(e.target.checked)}
              />
              <span>Ho letto e accetto i Termini</span>
            </label>

            <button disabled={!termsChecked || acceptingTerms} onClick={acceptTerms}>
              {acceptingTerms ? "Salvo…" : "Accetta e continua"}
            </button>
          </div>
        )}

        {legal.termsAccepted && (
          <>
            {helperMode === "cash" && (
              <button onClick={() => startPay({ useWallet: false })}>
                Paga con carta (fondi bloccati)
              </button>
            )}

            {helperMode === "wallet" && (
              <button onClick={() => startPay({ useWallet: true })}>
                Paga con wallet (fondi bloccati)
              </button>
            )}
          </>
        )}
      </>
    )}
  </div>
)}

{isRequester && match && isPaid && !isReleased && (
  <div className="card">
    <h3>Rilascia pagamento</h3>
    <p className="sub">Quando il servizio è completato, rilascia il pagamento all’helper.</p>
    <button className="danger" onClick={release}>
      Rilascia pagamento
    </button>
  </div>
)}

{isRequester && match && isReleased && (
  <div className="card">
    <h3>Pagamento rilasciato</h3>
    <p className="sub">Hai già rilasciato il pagamento ✅</p>
  </div>
)}

              </div>

              <div className="card">
                <h3>Pagamento</h3>

            {!legal.termsAccepted ? (
  <p className="msg">
    Prima di pagare devi accettare i{" "}
    <Link href="/terms" className="ghost">
      Termini e Condizioni
    </Link>
    .
  </p>
) : clientSecret && stripePromise ? (
  <Elements stripe={stripePromise} options={{ clientSecret, locale: "it" }}>
    <PayBox match={match} onPaid={() => load({ keepMsg: true, silent: true })} />
  </Elements>
) : (
  <p className="hint">
    I metodi di pagamento saranno disponibili e il trasferimento avverrà quando il destinatario avrà creato un account
    Stripe Express dalla sezione{" "}
    <Link href="/profile" className="ghost">
      Profilo
    </Link>
    .
  </p>
)}
              </div>
            </div>
          )}

          <style jsx>{`
            .check {
              display: flex;
              align-items: center;
              gap: 10px;
              margin: 10px 0 12px;
              font-size: 14px;
              opacity: 0.95;
            }
            .check input {
              width: 18px;
              height: 18px;
              cursor: pointer;
            }
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
          `}</style>
        </>
      )}
    </Layout>
  );
}

RequestDetail.getInitialProps = ({ query }) => ({ id: query.id });
