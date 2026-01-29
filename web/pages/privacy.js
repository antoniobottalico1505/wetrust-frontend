import Layout from "../components/Layout";
import Link from "next/link";

export default function PrivacyPage() {
  return (
    <Layout title="WeTrust — Privacy Policy">
      <div className="wrap">
        <h1>Privacy Policy</h1>
        <p className="sub">
          Ultimo aggiornamento: <strong>{new Date().toISOString().slice(0, 10)}</strong>
        </p>

        <section className="card">
          <h2>1) Titolare del trattamento</h2>
          <p>
  Il Titolare del trattamento è <strong>Antonio Bottalico</strong> (persona fisica).
  <br />
  Partita IVA: <strong>[INSERISCI P.IVA]</strong>
  <br />
  Contatto privacy: <strong>we20trust25@gmail.com</strong>
</p>

          <h2>2) Quali dati trattiamo</h2>
          <ul>
            <li>
              <strong>Dati account</strong>: email e/o numero di telefono, credenziali (password memorizzata in forma
              cifrata/hash), eventuale nome e dati di profilo.
            </li>
            <li>
              <strong>Dati di utilizzo del servizio</strong>: richieste pubblicate, match, contenuti e messaggi scambiati
              nella chat, feedback/valutazioni (se presenti), preferenze operative.
            </li>
            <li>
              <strong>Dati di pagamento</strong>: importi, stato pagamento, identificativi tecnici delle transazioni.
              I dati della carta e le informazioni bancarie sono trattati da <strong>Stripe</strong> tramite Stripe
              Payments/Stripe Connect.
            </li>
            <li>
              <strong>Dati di comunicazione</strong>: numero di telefono e contenuti degli SMS/OTP (gestiti tramite{" "}
              <strong>Twilio</strong>), oltre a eventuali comunicazioni di servizio.
            </li>
            <li>
              <strong>Dati tecnici</strong>: indirizzo IP, log di accesso e sicurezza, user-agent, informazioni sul
              dispositivo e sul browser, cookie tecnici.
            </li>
          </ul>

          <h2>3) Finalità e base giuridica</h2>
          <ul>
            <li>
              <strong>Erogazione del servizio</strong> (registrazione, gestione richieste, match, chat, assistenza):{" "}
              <em>esecuzione di un contratto</em> (art. 6(1)(b) GDPR).
            </li>
            <li>
              <strong>Pagamenti e prevenzione frodi</strong> (gestione transazioni, contestazioni, antifrode):{" "}
              <em>esecuzione del contratto</em> e <em>legittimo interesse</em> (art. 6(1)(b) e 6(1)(f) GDPR).
            </li>
            <li>
              <strong>Obblighi legali</strong> (adempimenti normativi, gestione richieste delle autorità):{" "}
              <em>obbligo di legge</em> (art. 6(1)(c) GDPR).
            </li>
            <li>
              <strong>Sicurezza e tutela della piattaforma</strong> (log, prevenzione abusi, incident response):{" "}
              <em>legittimo interesse</em> (art. 6(1)(f) GDPR).
            </li>
            <li>
              <strong>Comunicazioni di servizio</strong> (notifiche, OTP, reset password, avvisi):{" "}
              <em>esecuzione del contratto</em> (art. 6(1)(b) GDPR).
            </li>
          </ul>

          <h2>4) Cookie</h2>
          <p>
            Utilizziamo cookie <strong>tecnici</strong> necessari al funzionamento del sito e alla sicurezza. Se in futuro
            verranno introdotti cookie di analytics o marketing, verrà pubblicata una Cookie Policy dedicata e
            implementato un meccanismo di consenso dove richiesto.
            <br />
            (Se presente) Vedi: <Link href="/cookies">Cookie Policy</Link>.
          </p>

          <h2>5) Destinatari e fornitori</h2>
          <p>
            Per fornire il servizio utilizziamo fornitori che trattano dati per nostro conto (in qualità di responsabili del
            trattamento o titolari autonomi, a seconda del servizio):
          </p>
          <ul>
            <li>
              <strong>Stripe</strong>: gestione pagamenti e (se attivo) Stripe Connect per ricevere pagamenti. I dati di
              carta e i dati bancari non vengono memorizzati da WeTrust e sono trattati da Stripe.
            </li>
            <li>
              <strong>Twilio</strong>: invio SMS/OTP e comunicazioni di servizio via SMS (se usate).
            </li>
            <li>
              <strong>Render</strong>: hosting dell’API e infrastruttura server.
            </li>
            <li>
              <strong>Vercel</strong>: hosting del sito web e distribuzione dei contenuti.
            </li>
          </ul>
          <p>
            Possiamo inoltre condividere dati con consulenti (es. legali/contabili) solo quando necessario e nei limiti di
            legge.
          </p>

          <h2>6) Trasferimenti extra-UE</h2>
          <p>
            Alcuni fornitori (es. Stripe, Twilio, Vercel, Render) possono trattare dati anche al di fuori dello Spazio
            Economico Europeo. In tali casi, i trasferimenti avvengono sulla base di garanzie adeguate previste dalla
            normativa (ad es. Clausole Contrattuali Standard) e/o altri meccanismi consentiti.
          </p>

          <h2>7) Conservazione dei dati</h2>
          <ul>
            <li>
              <strong>Dati account</strong>: per la durata dell’account e fino a richiesta di cancellazione, salvo necessità
              tecniche e obblighi di legge.
            </li>
            <li>
              <strong>Dati operativi (richieste/match/chat)</strong>: per il tempo necessario a fornire il servizio e gestire
              contestazioni o abusi.
            </li>
            <li>
              <strong>Dati di pagamento</strong>: conserviamo solo dati tecnici/di stato e identificativi; Stripe conserva i
              dati di pagamento secondo le proprie policy.
            </li>
            <li>
              <strong>Log di sicurezza</strong>: per un periodo limitato e proporzionato, salvo necessità di indagine su abusi
              o frodi.
            </li>
          </ul>

          <h2>8) Diritti dell’interessato</h2>
          <p>
            Puoi esercitare i diritti previsti dagli artt. 15-22 GDPR (accesso, rettifica, cancellazione, limitazione,
            portabilità, opposizione). Se il trattamento si basa sul consenso (se e quando presente), puoi revocarlo in
            qualsiasi momento senza pregiudicare i trattamenti effettuati prima della revoca.
          </p>

          <h2>9) Reclamo</h2>
          <p>
            Hai diritto di proporre reclamo all’Autorità Garante per la protezione dei dati personali (Italia) o all’autorità
            competente del tuo Paese.
          </p>

          <h2>10) Sicurezza</h2>
          <p>
            Adottiamo misure tecniche e organizzative adeguate per proteggere i dati (es. controllo accessi, logging,
            cifratura in transito, limitazione privilegi). Nessun sistema è infallibile: ti invitiamo a proteggere le tue
            credenziali e a segnalarci attività sospette.
          </p>

          <h2>11) Minori</h2>
          <p>
            Il servizio non è destinato a minori. Se ritieni che un minore ci abbia fornito dati senza autorizzazione,
            contattaci per la rimozione.
          </p>

          <h2>12) Modifiche alla presente informativa</h2>
          <p>
            Potremmo aggiornare questa informativa. In caso di modifiche rilevanti, pubblicheremo un avviso sul sito o
            tramite comunicazioni di servizio.
          </p>

          <h2>13) Contatti</h2>
          <p>
            Per richieste privacy: <strong>[we20trust25@gmail.com]</strong>. Per altri contatti: <Link href="/contact">Contatti</Link>.
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
