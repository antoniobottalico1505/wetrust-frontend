import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import { apiFetch } from "../../lib/api";

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
    ""
  );
}

export default function StripeOnboardPage() {
  const [msg, setMsg] = useState("Apro onboarding Stripe…");

  useEffect(() => {
    (async () => {
      try {
        const baseUrl = window.location.origin;
        const data = await apiFetch("/stripe/connect/onboard", {
          method: "POST",
          body: { baseUrl },
        });

        const url = pickUrl(data);
        if (!url) throw new Error("URL onboarding Stripe non trovato.");

        window.location.href = url;
      } catch (e) {
        setMsg(e?.message || "Errore apertura onboarding Stripe.");
      }
    })();
  }, []);

  return (
    <Layout title="WeTrust — Attiva pagamenti">
      <div style={{ padding: "12px 0" }}>
        <p>{msg}</p>
        <p style={{ marginTop: 12 }}>
          <a href="/profile">Torna al profilo</a>
        </p>
      </div>
    </Layout>
  );
}
