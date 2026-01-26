import { useContext, useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import { apiFetch } from "../../lib/api";
import Link from "next/link";
import { useRouter } from "next/router";
import { AuthContext } from "../_app";

import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { centsToEUR, eurToCents } from "../../lib/money";

function readToken() {
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

function normId(x) {
  return x == null ? "" : String(x);
}

function pickCity(o) {
  return (
    o?.city ||
    o?.city_name ||
    o?.town ||
    o?.location?.city ||
    o?.address?.city ||
    o?.place?.city ||
    ""
  );
}

async function tryFetchMe() {
  try {
    const a = await apiFetch("/me");
    return a?.user || a?.me || a?.item || a?.data || a;
  } catch {
    try {
      const b = await apiFetch("/users/me");
      return b?.user || b?.me || b?.item || b?.data || b;
    } catch {
      return null;
    }
  }
}

async function tryFetchRequest(id) {
  try {
    return await apiFetch(`/requests/${id}`);
  } catch (e) {
    const m = String(e?.message || "").toLowerCase();
    if (m.includes("not found") || m.includes("404")) {
      // fallback comuni
      try {
        return await apiFetch(`/request/${id}`);
      } catch {}
      try {
        return await apiFetch(`/requests?id=${encodeURIComponent(id)}`);
      } catch {}
    }
    throw e;
  }
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
      <p className="sub">
        Stile Vinted: il denaro resta bloccato finché confermi la consegna del servizio.
      </p>
      <form onSubmit={pay}>
        <PaymentElement />
        <button disabled={loading || !stripe}>
          {loading ? "Confermo…" : "Conferma pagamento"}
        </button>
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

export default function RequestDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const auth = useContext(AuthContext) || {};
  const ctxUser = auth.user ?? auth[0] ?? null;

  const [me, setMe] = useState(ctxUser);
  const [reqData, setReqData] = useState(null);
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [priceEUR, setPriceEUR] = useState("");
  const [clientSecret, setClientSecret] = useState(null);

  useEffect(() => {
    if (ctxUser?.id) setMe(ctxUser);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxUser?.id]);

  const stripePromise = useMemo(() => {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!pk) return null;
    return loadStripe(pk);
  }, []);

  const ownerId =
    reqData?.user_id ?? reqData?.userId ?? reqData?.user?.id ?? reqData?.requester_id ?? null;

  const canAccept = useMemo(() => {
    const st = String(reqData?.status || "").toLowerCase();
    const open = !st || st === "open" || st === "opened" || st === "pending";
    const meId = me?.id ? normId(me.id) : "";
    return !!readToken() && open && !match && !!meId && meId !== normId(ownerId);
  }, [me, reqData, match, ownerId]);

  function extractMatchId(data) {
    const m = data?.match || data?.item || data;
    return (
      m?.id ||
      data?.matchId ||
      data?.match_id ||
      m?.matchId ||
      m?.match_id ||
      null
    );
  }

  async function ensureMe() {
    if (me?.id) return me;
    if (!readToken()) return null;
    const u = await tryFetchMe();
    if (u?.id) setMe(u);
    return u;
  }

  async function load() {
    if (!id) return;
    setMsg("");

    try {
      setLoading(true);

      const data = await tryFetchRequest(id);
      const request = data?.request || data?.item || data?.data || data;
      setReqData(request || null);

      const m0 = data?.match || data?.itemMatch || null;
      if (m0?.id) {
        setMatch(m0);
        return;
      }

      if (readToken()) {
        try {
          const mdata = await apiFetch("/me/matches");
          const list = mdata?.matches || mdata?.items || [];
          const found =
            list.find((m) => normId(m.requestId || m.request_id) === normId(id)) || null;
          setMatch(found);
        } catch {
          setMatch(null);
        }
      } else {
        setMatch(null);
      }
    } catch (err) {
      setReqData(null);
      setMatch(null);
      setMsg(err?.message || "Errore caricamento dettaglio.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, me?.id]);

  async function accept() {
    setMsg("");

    if (!readToken()) {
      router.push("/login");
      return;
    }

    const u = await ensureMe();
    const helperId = u?.id || me?.id;

    if (!helperId) {
      setMsg("helperId non disponibile: fai login e riprova.");
      return;
    }

    try {
      let data;
      try {
        data = await apiFetch("/matches", {
          method: "POST",
          body: {
            requestId: id,
            request_id: id,
            helperId,
            helper_id: helperId,
          },
        });
      } catch (e) {
        const m = String(e?.message || "").toLowerCase();
        if (m.includes("not found") || m.includes("404")) {
          data = await apiFetch(`/requests/${id}/accept`, {
            method: "POST",
            body: { helperId, helper_id: helperId },
          });
        } else {
          throw e;
        }
      }

      const matchId = extractMatchId(data);
      const mObj = data?.match || data?.item || data;

      if (mObj) setMatch(mObj);
      setMsg("Richiesta accettata ✅ Ora potete chattare.");

      if (matchId) router.push(`/chat/${matchId}`);
    } catch (err) {
      setMsg(err?.message || "Errore accettazione.");
    }
  }

  const requesterId =
    match?.requester_id ?? match?.userId ?? match?.requesterId ?? match?.user_id ?? null;
  const isRequester = me && requesterId && normId(me.id) === normId(requesterId);

  async function setPrice() {
    setMsg("");
    try {
      const cents = eurToCents(priceEUR);
      const data = await apiFetch(`/matches/${match.id}/price`, {
        method: "POST",
        body: { price_cents: cents },
      });
      setMatch(data?.match || data?.item || data);
      setMsg("Prezzo impostato ✅");
    } catch (err) {
      setMsg(err?.message || "Errore impostazione prezzo.");
    }
  }

  async function startPay(useWallet) {
    setMsg("");
    try {
      const data = await apiFetch(`/matches/${match.id}/pay`, {
        method: "POST",
        body: { use_wallet: !!useWallet },
      });
      setClientSecret(data?.clientSecret || null);
      setMatch(data?.match || data?.item || data);
      if (data?.amount_cents != null)
        setMsg(`Da pagare: ${centsToEUR(data.amount_cents)} (fee inclusa)`);
    } catch (err) {
      setMsg(err?.message || "Errore avvio pagamento.");
    }
  }

  async function release() {
    setMsg("");
    try {
      const data = await apiFetch(`/matches/${match.id}/release`, { method: "POST" });
      setMatch(data?.match || data?.item || data);
      setMsg("Pagamento rilasciato ✅");
    } catch (err) {
      setMsg(err?.message || "Errore rilascio pagamento.");
    }
  }

  return (
    <Layout title="WeTrust — Dettaglio richiesta">
      {loading && <p>Caricamento…</p>}
      {msg && <p className="msgTop">{msg}</p>}

      {!loading && !reqData && <p>Richiesta non trovata.</p>}

      {!loading && reqData && (
        <>
          <div className="top">
            <div>
              <h1>{reqData.title}</h1>
              <p className="desc">{reqData.description}</p>
              <div className="meta">
                {pickCity(reqData) ? <span>{pickCity(reqData)}</span> : null}
                <span className="badge">{reqData.status || "open"}</span>
              </div>
              <p style={{ marginTop: 10 }}>
                <Link href="/requests" className="ghost">
                  ← Torna alle richieste
                </Link>
              </p>
            </div>

            <div className="actions">
              {!readToken() ? (
                <Link href="/login" className="btn">
                  Accedi
                </Link>
              ) : canAccept ? (
                <button onClick={accept} className="btn">
                  Accetta richiesta
                </button>
              ) : null}

              {match?.id && (
                <Link href={`/chat/${match.id}`} className="btn ghost">
                  Apri chat
                </Link>
              )}
            </div>
          </div>

          {match?.id && (
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
                  <strong>Fee WeTrust:</strong>{" "}
                  {match.fee_cents ? centsToEUR(match.fee_cents) : "—"}
                </p>
                <p className="hint">
                  Il denaro viene bloccato e rilasciato solo con conferma del richiedente.
                </p>

                {isRequester && (
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
                  <PayBox onPaid={() => load()} />
                </Elements>
              ) : (
                <div className="card">
                  <h3>Pagamento</h3>
                  <p className="hint">
                    {stripePromise
                      ? "Avvia il pagamento dai pulsanti sopra: verrà generata la schermata Stripe."
                      : "Per il checkout Stripe serve impostare NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY."}
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
              text-transform: lowercase;
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
          `}</style>
        </>
      )}
    </Layout>
  );
}
