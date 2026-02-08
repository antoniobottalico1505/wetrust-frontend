import Layout from "../components/Layout";

export default function TrustPage() {
  return (
    <Layout title="Trust">
      <div className="card">
        <h1>Trust</h1>

        <p>
          WeTrust funziona con un sistema semplice: le richieste vengono create dal richiedente,
          un helper le accetta, imposta il prezzo e sceglie come vuole essere pagato.
        </p>

        <h2>1) Richieste</h2>
        <ul>
          <li>Il richiedente pubblica una richiesta “OPEN”.</li>
          <li>Un helper la accetta: si crea un match 1:1.</li>
          <li>L’helper imposta il prezzo (più fee piattaforma) e sceglie la modalità.</li>
        </ul>

        <h2>2) Modalità di pagamento</h2>
        <ul>
          <li><strong>Cash</strong>: il richiedente paga con carta. Al rilascio, l’helper riceve l’accredito su Stripe.</li>
          <li><strong>Wallet</strong>: il richiedente paga con wallet (voucher). Al rilascio, l’helper riceve credito nel wallet.</li>
        </ul>

        <p>
          Nota: il richiedente vede il pulsante di pagamento solo dopo la scelta dell’helper.
          Questo evita pagamenti nel metodo sbagliato.
        </p>

        <h2>3) Wallet</h2>
        <ul>
          <li>Il wallet contiene voucher/crediti.</li>
          <li>Non puoi pagare con wallet se il saldo non basta.</li>
          <li>In modalità Wallet, l’helper può scegliere Wallet solo se il richiedente ha saldo sufficiente.</li>
        </ul>

        <h2>4) Trust points</h2>
        <ul>
          <li>Ogni lavoro completato e rilasciato assegna <strong>+3 Trust points</strong> all’helper.</li>
          <li>I Trust points sono un indicatore di affidabilità e continuità.</li>
        </ul>

        <h2>5) Rilascio pagamento</h2>
        <ul>
          <li>Quando il lavoro è finito, il richiedente clicca <strong>Rilascia pagamento</strong>.</li>
          <li>In Cash: viene eseguito un transfer Stripe verso l’helper.</li>
          <li>In Wallet: viene accreditato il wallet dell’helper.</li>
        </ul>
      </div>
    </Layout>
  );
}
