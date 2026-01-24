import Layout from "../components/Layout";
import Link from "next/link";

export default function PrivacyPage() {
  return (
    <Layout title="WeTrust — Privacy Policy">
      <div className="wrap">
        <h1>Privacy Policy</h1>
        <p className="sub">
          Questa è una bozza generale. Personalizzala con i tuoi dati societari e con i servizi reali che usi
          (es. Stripe, provider SMS, analytics).
        </p>

        <section className="card">
          <h2>1) Titolare del trattamento</h2>
          <p>
            Inserisci qui: ragione sociale / P.IVA, indirizzo, email di contatto privacy.
          </p>

          <h2>2) Dati raccolti</h2>
          <ul>
            <li>Dati account: email/telefono, password (hash), eventuale nome.</li>
            <li>Dati operativi: richieste pubblicate, match, messaggi di chat.</li>
            <li>Dati di pagamento: se usi Stripe Connect, i dati di pagamento sono gestiti da Stripe.</li>
            <li>Dati tecnici: log, IP, user-agent, cookie tecnici.</li>
          </ul>

          <h2>3) Finalità e base giuridica</h2>
          <ul>
            <li>Erogare il servizio (contratto).</li>
            <li>Sicurezza e prevenzione abusi (legittimo interesse).</li>
            <li>Obblighi legali/fiscali (obbligo di legge).</li>
          </ul>

          <h2>4) Conservazione</h2>
          <p>
            Conserviamo i dati per il tempo necessario a fornire il servizio e per adempiere ad obblighi di legge.
          </p>

          <h2>5) Condivisione</h2>
          <p>
            Possiamo condividere dati con fornitori tecnici (hosting, email/SMS, pagamenti) solo per fornire il servizio.
          </p>

          <h2>6) Diritti dell’interessato</h2>
          <p>
            Hai diritto di accesso, rettifica, cancellazione, limitazione, portabilità e opposizione. Contattaci via email.
          </p>

          <h2>7) Contatti</h2>
          <p>
            Per richieste privacy: <strong>inserisci-email@dominio.it</strong>.{" "}
            Per altri contatti vai alla pagina <Link href="/contact">Contatti</Link>.
          </p>
        </section>
      </div>

      <style jsx>{`
        .wrap { max-width: 820px; margin: 0 auto; padding: 16px 0; }
        h1 { font-size: 28px; margin: 6px 0 10px; }
        .sub { opacity: .9; margin-bottom: 14px; }
        .card {
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.4);
          padding: 14px 16px;
        }
        h2 { margin: 14px 0 6px; font-size: 18px; }
        p, li { opacity: .92; }
        ul { padding-left: 18px; margin: 6px 0 10px; }
        :global(a) { color: #00b4ff; text-decoration: underline; }
      `}</style>
    </Layout>
  );
}
