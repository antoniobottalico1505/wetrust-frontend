import Layout from "../components/Layout";

export default function FAQ() {
  return (
    <Layout title="WeTrust — FAQ">
      <h1>FAQ</h1>

      <div className="grid">
        <div className="card">
          <h2>Cos’è WeTrust?</h2>
          <p>Un modo semplice e sicuro per chiedere e offrire aiuto quotidiano nella tua città.</p>
        </div>
        <div className="card">
          <h2>Serve un account?</h2>
          <p>Sì: per pubblicare richieste, accettarle e chattare in modo tracciato.</p>
        </div>
        <div className="card">
          <h2>Come funziona la chat?</h2>
          <p>La chat si apre dopo che qualcuno accetta una richiesta: così non c’è spam.</p>
        </div>
        <div className="card">
          <h2>Pagamenti</h2>
          <p>Il pagamento viene bloccato sulla piattaforma e
  rilasciato solo quando il richiedente conferma l’avvenuto aiuto. WeTrust trattiene automaticamente una
  fee di servizio.</p>
        </div>
      </div>

      <style jsx>{`
        .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
        .card {
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 18px;
          padding: 14px;
        }
        h2 { margin: 0 0 6px; font-size: 16px; }
        p { margin: 0; opacity: .9; }
      `}</style>
    </Layout>
  );
}
