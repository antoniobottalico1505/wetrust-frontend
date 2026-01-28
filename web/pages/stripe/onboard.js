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
      const m = String(e?.message || "");
      if (
        m.toLowerCase().includes("complete your platform profile") ||
        m.toLowerCase().includes("platform profile") ||
        m.includes("dashboard.stripe.com/connect/accounts/overview")
      ) {
        window.open(
          "https://dashboard.stripe.com/connect/accounts/overview",
          "_blank",
          "noopener,noreferrer"
        );
        setMsg("Completa il questionario Stripe in dashboard, poi riprova ✅");
        return;
      }
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
