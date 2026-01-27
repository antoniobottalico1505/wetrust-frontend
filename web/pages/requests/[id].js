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

function getRequestId(r, fallback = "") {
  return String(r?.id || r?._id || r?.requestId || r?.request_id || fallback || "");
}

function pickCity(r) {
  const v =
    r?.city ??
    r?.location ??
    r?.town ??
    r?.address?.city ??
    r?.location?.city ??
    r?.place?.city ??
    "";
  return typeof v === "string" ? v.trim() : "";
}

function getOwnerId(r) {
  return String(
    r?.user_id ??
      r?.userId ??
      r?.owner_id ??
      r?.ownerId ??
      r?.requester_id ??
      r?.requesterId ??
      r?.user?.id ??
      r?.owner?.id ??
      ""
  );
}

function loadCachedRequest(id) {
  try {
    const raw = sessionStorage.getItem(`wetrust_request_${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function cacheRequest(id, data) {
  try {
    if (!id || !data) return;
    sessionStorage.setItem(`wetrust_request_${id}`, JSON.stringify(data));
  } catch {}
}

async function fetchRequestById(id) {
  // 1) principale
  try {
    return await apiFetch(`/requests/${id}`);
  } catch (e) {
    const m = String(e?.message || "").toLowerCase();
    if (!(m.includes("not found") || m.includes("404"))) throw e;
  }

  // 2) alternative comuni
  const alt = [
    `/request/${id}`,
    `/requests?id=${encodeURIComponent(id)}`,
    `/requests/${id}/detail`,
  ];
  for (const ep of alt) {
    try {
      return await apiFetch(ep);
    } catch (e) {
      const m = String(e?.message || "").toLowerCase();
      if (m.includes("not found") || m.includes("404")) continue;
      throw e;
    }
  }

  // 3) ultima spiaggia: lista e filtro
  try {
    const data = await apiFetch("/requests");
    const list = data?.requests || data?.items || data?.list || data || [];
    const arr = Array.isArray(list) ? list : [];
    const found = arr.find((r) => getRequestId(r) === String(id)) || null;
    if (found) return { request: found };
  } catch {}

  throw new Error("Not found");
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
      <p className="sub">Stile Vinted: il denaro resta bloccato finché confermi la consegna del servizio.</p>
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
        .sub { opacity: 0.9; margin: 6px 0 10px; font-size: 13px; }
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
        .msg { font-size: 13px; margin-top: 8px; }
      `}</style>
    </div>
  );
}

export default function RequestDetailPage() {
  const router = useRouter();
  const { id } = router.query;

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

  const ownerId =
    reqData?.user_id ?? reqData?.userId ?? reqData?.user?.id ?? reqData?.requester_id ?? null;

  const canAccept = useMemo(() => {
    const st = String(reqData?.status || "").toLowerCase();
    const open = !st || st === "open" || st === "opened" || st === "pending";
    return !!user && open && !match && normId(user.id) !== normId(ownerId);
  }, [user, reqData, match, ownerId]);

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

  async function load() {
    if (!id) return;
    setMsg("");

const cached = typeof window !== "undefined" ? loadCachedRequest(String(id)) : null;
if (cached) setReqData(cached);

    try {
      setLoading(true);

     const data = await fetchRequestById(id);
      const request = data?.request || data?.item || data?.data || data;
      setReqData(request || null);
if (request) cacheRequest(getRequestId(request, id), request);

      const m0 = data?.match || data?.itemMatch || null;
      if (m0?.id) {
        setMatch(m0);
        return;
      }

      // se loggato, prova anche /me/matches
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
  }, [id, ready, user?.id]);

  async function accept() {
  setMsg("");

  const token = readToken();
  if (!token) {
    router.push("/login");
    return;
  }

  if (ownerId && user?.id && String(ownerId) === String(user.id)) {
    setMsg("Non puoi accettare la tua richiesta.");
    return;
  }

  try {
    // helperId = chi accetta (l'utente loggato)
    let helperId = user?.id;
    if (!helperId) {
      const me = await apiFetch("/me");
      helperId = me?.user?.id || me?.id;
    }
    if (!helperId) {
      throw new Error("Impossibile determinare il tuo userId (helperId).");
    }

    const requestId = getRequestId(reqData, id);

    // 1) percorso standard: crea match
    let data;
    try {
      data = await apiFetch("/matches", {
        method: "POST",
        body: {
          requestId,
          helperId,
          // compat backend legacy
          request_id: requestId,
          helper_id: helperId,
        },
      });
    } catch (e) {
      // 2) fallback: endpoint legacy (se esiste)
      data = await apiFetch(`/requests/${id}/accept`, {
        method: "POST",
        body: { helperId, helper_id: helperId },
      });
    }

    if (data && data.ok === false) {
      throw new Error(data.error || "Errore accettazione.");
    }

    const matchId = extractMatchId(data);
    if (!matchId) throw new Error("Match creato ma id mancante.");

    // Vai direttamente alla chat (riquadro di scrittura)
    router.push(`/chat/${matchId}`);
  } catch (err) {
    setMsg(err?.message || "Errore accettazione.");
  }
}

  const requesterId =
    match?.requester_id ?? match?.userId ?? match?.requesterId ?? match?.user_id ?? null;

  const isRequester = user && requesterId && normId(user.id) === normId(requesterId);

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
      if (data?.amount_cents != null) setMsg(`Da pagare: ${centsToEUR(data.amount_cents)} (fee inclusa)`);
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

      {!loading && !reqData && (
        <div style={{ padding: "10px 0" }}>
          <p>Dettagli non disponibili (richiesta non trovata).</p>
          <p style={{ marginTop: 10 }}>
            <Link href="/requests" className="ghost">← Torna alle richieste</Link>
          </p>
        </div>
      )}

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
                <Link href="/requests" className="ghost">← Torna alle richieste</Link>
              </p>
            </div>

            <div className="actions">
              {!ready ? null : !readToken() ? (
                <Link href="/login" className="btn">Accedi</Link>
              ) : canAccept ? (
                <button onClick={accept} className="btn">Accetta richiesta</button>
              ) : null}

              {match?.id && (
                <Link href={`/chat/${match.id}`} className="btn ghost">Apri chat</Link>
              )}
            </div>

<div className="card" style={{ marginTop: 12 }}>
  <h3>Dettagli richiesta</h3>
  <p className="line"><strong>ID:</strong> {reqData.id || reqData._id || id}</p>
  <p className="line"><strong>Stato:</strong> {reqData.status || "open"}</p>
  {pickCity(reqData) ? <span>{pickCity(reqData)}</span> : null (
    <p className="line"><strong>Città:</strong></p>)}
  {reqData.createdAt || reqData.created_at ? (
    <p className="line"><strong>Creato:</strong> {new Date(reqData.createdAt || reqData.created_at).toLocaleString()}</p>
  ) : null}
</div>

          </div>

          {match?.id && (
            <div className="grid">
              <div className="card">
                <h3>Match</h3>
                <p className="line"><strong>Status:</strong> {match.status || "—"}</p>
                <p className="line"><strong>Prezzo:</strong> {match.price_cents ? centsToEUR(match.price_cents) : "non impostato"}</p>
                <p className="line"><strong>Fee WeTrust:</strong> {match.fee_cents ? centsToEUR(match.fee_cents) : "—"}</p>
                <p className="hint">Il denaro viene bloccato e rilasciato solo con conferma del richiedente.</p>

                {isRequester && (
                  <>
                    <div className="row">
                      <input
                        value={priceEUR}
                        onChange={(e) => setPriceEUR(e.target.value)}
                        placeholder="Prezzo in € (es. 25)"
                      />
                      <button className="btn" onClick={setPrice}>Imposta prezzo</button>
                    </div>

                    <div className="row">
                      <button className="btn" onClick={() => startPay(false)}>Paga (carta)</button>
                      <button className="btn ghost" onClick={() => startPay(true)}>Paga usando voucher</button>
                    </div>

                    <div className="row">
                      <button className="btn danger" onClick={release}>Conferma & rilascia pagamento</button>
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
                    Per il checkout Stripe serve impostare <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>.
                  </p>
                </div>
              )}
            </div>
          )}

          <style jsx>{`
            .msgTop { font-size: 13px; margin: 6px 0 10px; }
            .top {
              display:flex;
              gap: 16px;
              justify-content: space-between;
              align-items: flex-start;
              flex-wrap: wrap;
            }
            h1 { font-size: 26px; margin: 6px 0; }
            .desc { color: #d1d5db; margin: 0 0 10px; max-width: 760px; }
            .meta { display:flex; gap: 10px; font-size: 12px; color:#cbd5f5; align-items:center; }
            .badge { padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(148,163,184,0.7); }
            .actions { display:flex; gap: 10px; flex-wrap: wrap; align-items: center; }
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
              border: 1px solid rgba(148,163,184,0.6);
              color: #ffffff;
            }
            .danger {
              background: linear-gradient(135deg, #00e0a0, #00b4ff);
            }
            .grid { display:grid; grid-template-columns: 1fr; gap: 12px; margin-top: 14px; }
            @media(min-width: 900px) { .grid { grid-template-columns: 1fr 1fr; } }
            .card {
              border-radius: 18px;
              background: rgba(15, 23, 42, 0.95);
              border: 1px solid rgba(148, 163, 184, 0.4);
              padding: 14px 16px;
            }
            .line { margin: 4px 0; }
            .hint { font-size: 13px; opacity: 0.9; }
            .row { display:flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
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
            code { background: rgba(2,6,23,0.6); padding: 2px 6px; border-radius: 8px; }
          `}</style>
        </>
      )}
    </Layout>
  );
}
