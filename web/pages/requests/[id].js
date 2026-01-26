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

function asObj(r) {
  return r?.request ?? r?.item ?? r;
}

function getRequestId(r, fallback = "") {
  const o = asObj(r);
  return String(o?.id || o?._id || o?.requestId || o?.request_id || fallback || "");
}

function pickCity(r) {
  const o = asObj(r);
  const v =
    o?.city ??
    o?.location ??
    o?.town ??
    o?.address?.city ??
    o?.location?.city ??
    o?.place?.city ??
    o?.place?.town ??
    "";
  return typeof v === "string" ? v.trim() : "";
}

function getOwnerId(r) {
  const o = asObj(r);
  return String(
    o?.user_id ??
      o?.userId ??
      o?.owner_id ??
      o?.ownerId ??
      o?.requester_id ??
      o?.requesterId ??
      o?.user?.id ??
      o?.owner?.id ??
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

  // 3) ultima spiaggia: carica lista e filtra
  try {
    const data = await apiFetch("/requests");
    const list = data?.requests || data?.items || data?.list || data || [];
    const arr = Array.isArray(list) ? list : [];
    const found = arr.find((r) => getRequestId(r) === normId(id)) || null;
    if (found) return { request: found };
  } catch {}

  throw new Error("Not found");
}

function PayBox({ match, request, onPaid }) {
  const stripe = useStripe();
  const elements = useElements();

  const [amountEUR, setAmountEUR] = useState("10");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const amountCents = eurToCents(amountEUR);

  async function createIntent() {
    setMsg("");
    if (!stripe || !elements) return;

    try {
      setLoading(true);

      const data = await apiFetch(`/matches/${match.id}/pay`, {
        method: "POST",
        body: { amount_cents: amountCents },
      });

      const clientSecret = data?.clientSecret || data?.client_secret;
      if (!clientSecret) throw new Error("clientSecret mancante.");

      const { error } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: window.location.origin + "/chats",
        },
        redirect: "if_required",
      });

      if (error) throw error;

      setMsg("Pagamento completato ✅");
      onPaid?.();
    } catch (e) {
      setMsg(e?.message || "Errore pagamento.");
    } finally {
      setLoading(false);
    }
  }

  if (!match?.id) return null;

  return (
    <div className="card">
      <h3>Paga</h3>
      <p className="line">
        Importo:{" "}
        <input
          value={amountEUR}
          onChange={(e) => setAmountEUR(e.target.value)}
          style={{ width: 80 }}
        />{" "}
        € ({centsToEUR(amountCents)}€)
      </p>

      <div style={{ marginTop: 10 }}>
        <PaymentElement />
      </div>

      <button onClick={createIntent} disabled={loading || !stripe || !elements}>
        {loading ? "..." : "Paga"}
      </button>

      {msg && <p className="msg">{msg}</p>}

      <style jsx>{`
        button {
          margin-top: 10px;
          border-radius: 999px;
          border: none;
          padding: 10px 16px;
          font-weight: 900;
          cursor: pointer;
          background: linear-gradient(135deg, #00b4ff, #00e0a0);
          color: #020617;
        }
        button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
        .msg {
          margin-top: 8px;
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}

export default function RequestDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const auth = useContext(AuthContext) || {};
  const user = auth.user ?? auth[0] ?? null;

  const [reqData, setReqData] = useState(null);
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const stripePromise = useMemo(() => {
    if (typeof window === "undefined") return null;
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!pk) return null;
    return loadStripe(pk);
  }, []);

  async function load() {
    if (!id) return;
    setMsg("");

    // mostra subito i dati cache (se arrivi da 'Dettagli' della lista)
    const cached = typeof window !== "undefined" ? loadCachedRequest(normId(id)) : null;
    if (cached) setReqData(cached);

    try {
      setLoading(true);

      const data = await fetchRequestById(id);
      const request = data?.request || data?.item || data?.data || data;

      if (request) cacheRequest(getRequestId(request, id), request);
      setReqData(request || null);

      // Se il backend restituisce anche un match collegato
      const m = data?.match || request?.match || null;
      setMatch(m);
    } catch (e) {
      const m = String(e?.message || "").toLowerCase();
      if (m.includes("not found") || m.includes("404")) {
        setMsg("Dettagli non disponibili (richiesta non trovata).");
      } else {
        setMsg(e?.message || "Errore nel caricamento dettagli.");
      }
      setReqData(null);
      setMatch(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const ownerId = getOwnerId(reqData);
  const canAccept =
    !!readToken() &&
    !!reqData &&
    (!ownerId || !user?.id || String(ownerId) !== String(user.id));

  async function accept() {
    setMsg("");

    if (!readToken()) {
      router.push("/login");
      return;
    }

    if (ownerId && user?.id && String(ownerId) === String(user.id)) {
      setMsg("Non puoi accettare la tua richiesta.");
      return;
    }

    try {
      const helperId = user?.id || (await apiFetch("/me"))?.user?.id;

      const data = await apiFetch("/matches", {
        method: "POST",
        body: {
          requestId: getRequestId(reqData, id),
          helperId,
          request_id: getRequestId(reqData, id),
          helper_id: helperId,
        },
      });

      const matchId = data?.match?.id || data?.matchId || data?.match_id || data?.id;
      if (matchId) {
        router.push(`/chat/${matchId}`);
        return;
      }

      setMsg("Richiesta accettata ✅");
      load();
    } catch (e) {
      setMsg(e?.message || "Errore nell’accettazione.");
    }
  }

  return (
    <Layout title="WeTrust — Dettagli richiesta">
      <div className="wrap">
        <div className="topRow">
          <Link href="/requests" className="ghost">← Torna alle richieste</Link>
          {reqData && (
            <button className="btn" onClick={accept} disabled={!canAccept}>
              Accetta
            </button>
          )}
        </div>

        {loading && <p>Caricamento…</p>}
        {!loading && msg && <p className="msg">{msg}</p>}

        {!loading && reqData && (
          <div className="grid">
            <div className="card">
              <h2>{reqData.title || "Richiesta"}</h2>

              {pickCity(reqData) ? (
                <p className="line"><strong>Città:</strong> {pickCity(reqData)}</p>
              ) : null}

              <p className="desc">{reqData.description || "—"}</p>

              <div style={{ marginTop: 12 }}>
                <h3>Dettagli richiesta</h3>
                <p className="line"><strong>ID:</strong> {reqData.id || reqData._id || id}</p>
                <p className="line"><strong>Stato:</strong> {reqData.status || "open"}</p>
                {pickCity(reqData) ? (
                  <p className="line"><strong>Città:</strong> {pickCity(reqData)}</p>
                ) : null}
                {reqData.createdAt || reqData.created_at ? (
                  <p className="line">
                    <strong>Creato:</strong>{" "}
                    {new Date(reqData.createdAt || reqData.created_at).toLocaleString()}
                  </p>
                ) : null}
              </div>
            </div>

            {match?.id && stripePromise && (
              <div className="card">
                <h2>Pagamento</h2>
                <Elements stripe={stripePromise} options={{ clientSecret: match.clientSecret }}>
                  <PayBox match={match} request={reqData} onPaid={load} />
                </Elements>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .wrap { max-width: 900px; margin: 0 auto; padding: 16px 0; }
        .topRow { display: flex; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .grid { display: grid; gap: 12px; grid-template-columns: 1fr; }
        @media (min-width: 900px) { .grid { grid-template-columns: 1.2fr 0.8fr; } }

        .card {
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.35);
          padding: 14px 16px;
        }
        h2 { margin: 0 0 8px; }
        h3 { margin: 8px 0 6px; }
        .desc { margin-top: 10px; opacity: 0.92; }
        .line { margin: 6px 0; opacity: 0.95; font-size: 14px; }
        .msg { margin: 10px 0; }

        .btn {
          border-radius: 999px;
          border: none;
          padding: 10px 16px;
          font-weight: 900;
          cursor: pointer;
          background: linear-gradient(135deg, #00b4ff, #00e0a0);
          color: #020617;
        }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .ghost {
          border-radius: 999px;
          padding: 9px 14px;
          font-weight: 900;
          background: transparent;
          border: 1px solid rgba(148, 163, 184, 0.6);
          color: #ffffff;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
        }
      `}</style>
    </Layout>
  );
}
