import Layout from "../components/Layout";

export default function Privacy() {
  return (
    <Layout title="WeTrust — Privacy">
      <h1>Privacy Policy</h1>

      <div className="card">
        <p>
          WeTrust raccoglie solo i dati necessari per offrire il servizio: email, nome (opzionale),
          contenuto delle richieste e messaggi di chat tra utenti coinvolti in un match.
        </p>
        <ul>
          <li>Dati account: email, password (hashata), nome</li>
          <li>Dati richieste: testo e città/zona</li>
          <li>Dati chat: messaggi legati al match</li>
        </ul>
        <p>
          Non vendiamo dati a terzi. Per richiesta di cancellazione dati: usa la pagina Contatti.
        </p>
      </div>

      <style jsx>{`
        .card {
          max-width: 820px;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 18px;
          padding: 14px;
        }
        p, li { opacity: .92; }
      `}</style>
    </Layout>
  );
}
