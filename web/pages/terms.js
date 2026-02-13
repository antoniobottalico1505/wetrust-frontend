import Layout from "../components/Layout";
import Link from "next/link";

const LAST_UPDATED = "2026-02-13"; // oggi (Europe/Rome)

export default function TermsPage() {
  return (
    <Layout title="WeTrust — Termini e Condizioni">
      <div className="wrap">
        <h1>Termini e Condizioni</h1>
        <p className="sub">
          Ultimo aggiornamento: <strong>{LAST_UPDATED}</strong>
        </p>

        <section className="card">
          <h2>1) Chi siamo</h2>
          <p>
  La piattaforma “WeTrust” (il <strong>“Servizio”</strong>) è gestita da{" "}
  <strong>Antonio Bottalico</strong>, persona fisica, con sede in{" "}
  <strong>Bari (Italia)</strong> (il <strong>“Gestore”</strong>).
</p>
          <p>
            Email di contatto: <strong>we20trust25@gmail.com</strong>
            <br />
            Indirizzo (sede/recapito): <strong>INSERISCI INDIRIZZO</strong>
            <br />
            P.IVA/Tax ID: <strong>INSERISCI P.IVA</strong>
          </p>

          <h2>2) Definizioni</h2>
          <ul>
            <li>
              <strong>Richiedente</strong>: utente che pubblica una richiesta.
            </li>
            <li>
              <strong>Helper</strong>: utente che accetta una richiesta e svolge il servizio.
            </li>
            <li>
              <strong>Match</strong>: abbinamento tra Richiedente e Helper creato tramite la piattaforma.
            </li>
            <li>
              <strong>Contenuti</strong>: testi, messaggi, immagini, descrizioni o materiali caricati dagli utenti.
            </li>
          </ul>

          <h2>3) Ruolo della piattaforma</h2>
          <p>
            WeTrust è una <strong>piattaforma di intermediazione</strong> che facilita l’incontro tra Richiedenti e Helper.
            WeTrust <strong>non è parte</strong> del rapporto che si instaura tra Richiedente e Helper e non garantisce
            l’esecuzione, la qualità, la liceità o l’esito dei servizi offerti dagli utenti.
          </p>
          <p>
            Le eventuali controversie tra utenti (incluse contestazioni su qualità/tempi/esecuzione, richieste di rimborso,
            danni o responsabilità personali) restano principalmente a carico delle parti coinvolte, salvo quanto previsto
            da norme inderogabili o da specifiche procedure indicate nel Servizio.
          </p>

          <h2>4) Account e sicurezza</h2>
          <ul>
            <li>Devi fornire informazioni veritiere e mantenere sicure le credenziali.</li>
            <li>Se sospetti accessi non autorizzati, devi avvisarci subito.</li>
            <li>Devi avere l’età minima richiesta nel tuo Paese per usare il Servizio.</li>
          </ul>

          <h2>5) Regole d’uso e contenuti</h2>
          <ul>
            <li>Vietati contenuti illeciti, ingannevoli, diffamatori, discriminatori o che violino diritti di terzi.</li>
            <li>Sei responsabile dei tuoi Contenuti e delle comunicazioni scambiate tramite la piattaforma.</li>
            <li>Possiamo rimuovere contenuti e sospendere account in caso di violazioni o rischi di sicurezza.</li>
          </ul>

          <h2>6) Pagamenti, fondi “bloccati” e rilascio</h2>
          <p>
            I pagamenti sono gestiti da provider terzi e possono includere modalità di autorizzazione con fondi bloccati
            (“hold”) fino a rilascio.
          </p>
          <ul>
            <li>Il Richiedente autorizza il pagamento e i fondi possono risultare “bloccati” fino a conferma/rilascio.</li>
            <li>Il rilascio può essere attivato dal Richiedente tramite la piattaforma (es. “Rilascia pagamento”).</li>
            <li>WeTrust può applicare commissioni/fee, mostrate prima del pagamento.</li>
            <li>
              In caso di contestazioni/chargeback o problemi del circuito, potremmo sospendere funzioni o trattenere fondi
              per coprire costi/riaddebitamenti secondo le regole del provider e le leggi applicabili.
            </li>
          </ul>

          <h2>7) Controversie tra utenti e segnalazioni</h2>
          <p>
            WeTrust non è obbligata ad agire come arbitro delle controversie tra utenti. Possiamo (a nostra discrezione)
            offrire strumenti di segnalazione o supporto, ma non garantiamo un esito.
          </p>
          <p>
            Segnalazioni (abusi/illeciti/contenuti): <strong>we20trust25@gmail.com</strong>
          </p>

          <h2>8) Proprietà intellettuale</h2>
          <p>
            Il Servizio, il brand e il software sono del Gestore o dei suoi licenzianti. Ti concediamo una licenza limitata,
            non esclusiva e revocabile per usare il Servizio secondo questi Termini.
          </p>

          <h2>9) Limitazione di responsabilità</h2>
          <p>
            Nei limiti massimi consentiti, WeTrust non risponde di: danni indiretti, perdita di profitti, mancati guadagni,
            danni reputazionali, controversie tra utenti, o atti/omissioni degli utenti.
          </p>
          <p>
            <strong>
              Nulla in questi Termini esclude o limita responsabilità che non possono essere escluse per legge.
            </strong>
          </p>

          <h2>10) Manleva (indennizzo)</h2>
          <p>
            Accetti di tenere indenne WeTrust da pretese di terzi derivanti da: uso illecito del Servizio, violazione dei
            Termini, violazione di diritti di terzi o leggi applicabili, o Contenuti da te pubblicati.
          </p>

          <h2>11) Sospensione e chiusura</h2>
          <p>
            Possiamo sospendere o chiudere account in caso di violazioni, rischi di sicurezza, obblighi legali o abusi.
          </p>

          <h2>12) Legge applicabile e foro</h2>
          <p>
            Se sei un consumatore, restano ferme le tutele inderogabili previste dalle leggi del tuo Paese di residenza.
            Per gli altri casi, legge e foro sono quelli italiani, con foro competente in{" "}
            <strong>Bari (Italia)</strong>.
          </p>

          <h2>13) Modifiche ai Termini</h2>
          <p>
            Possiamo aggiornare questi Termini pubblicando una nuova versione. L’uso continuato del Servizio dopo
            l’aggiornamento implica accettazione dei Termini aggiornati, salvo dove la legge richieda consenso espresso.
          </p>

          <h2>14) Privacy</h2>
          <p>
            Per il trattamento dei dati personali consulta la{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>

        </section>
      </div>

      <style jsx>{`
        .wrap {
          max-width: 900px;
          margin: 0 auto;
          padding: 16px 0;
        }
        h1 {
          font-size: 30px;
          margin: 6px 0 8px;
        }
        .sub {
          opacity: 0.9;
          margin-bottom: 14px;
        }
        .card {
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.4);
          padding: 14px 16px;
        }
        h2 {
          margin: 16px 0 8px;
          font-size: 18px;
        }
        p,
        li {
          opacity: 0.92;
          line-height: 1.55;
        }
        ul {
          padding-left: 18px;
          margin: 6px 0 10px;
        }
        .note {
          margin-top: 14px;
          opacity: 0.85;
          font-size: 13px;
        }
        :global(a) {
          color: #00b4ff;
          text-decoration: underline;
        }
      `}</style>
    </Layout>
  );
}
