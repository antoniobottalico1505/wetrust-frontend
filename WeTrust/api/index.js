// C:\Users\Utente\WeTrust\api\index.js
// WeTrust API – richieste in memoria + contatti email + auth email + auth SMS OTP (Twilio Verify)

const fastify = require("fastify");
const cors = require("@fastify/cors");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const twilio = require("twilio");

const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_SUPER_SECRET";

// --- DATA IN MEMORIA (demo) ---
const requests = [
  {
    id: "1",
    title: "Accompagnare mia madre dal medico",
    description:
      "Cerco qualcuno di affidabile per accompagnare mia madre di 78 anni alla visita in ospedale domani mattina.",
    city: "Torino",
    status: "open",
    createdAt: new Date().toISOString(),
    user_id: "seed_user_1",
    helper_id: null,
  },
  {
    id: "2",
    title: "Aiuto con spesa settimanale",
    description:
      "Mi serve una mano con la spesa al supermercato una volta a settimana.",
    city: "Milano",
    status: "matched",
    createdAt: new Date().toISOString(),
    user_id: "seed_user_2",
    helper_id: "seed_user_1",
  },
];

const users = [
  // utenti seed demo
  { id: "seed_user_1", email: "demo1@wetrust.app", phone: null, passwordHash: bcrypt.hashSync("Password123!", 10), createdAt: new Date().toISOString() },
  { id: "seed_user_2", email: "demo2@wetrust.app", phone: null, passwordHash: bcrypt.hashSync("Password123!", 10), createdAt: new Date().toISOString() },
];

function publicUser(u) {
  return { id: u.id, email: u.email || null, phone: u.phone || null };
}

function signToken(u) {
  return jwt.sign({ sub: u.id }, JWT_SECRET, { expiresIn: "30d" });
}

function getAuthUser(request) {
  const auth = request.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    const u = users.find((x) => x.id === payload.sub);
    return u || null;
  } catch {
    return null;
  }
}

function requireAuth(request, reply, done) {
  const u = getAuthUser(request);
  if (!u) {
    reply.code(401).send({ ok: false, error: "Non autorizzato. Effettua l’accesso." });
    return;
  }
  request.user = u;
  done();
}

async function start() {
  const app = fastify({ logger: true });
  await app.register(cors, { origin: true });

  // --- MAILER (contatti) ---
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  // --- TWILIO VERIFY (OTP SMS) ---
  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

  const twilioClient =
    TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
      ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
      : null;

  // healthcheck
  app.get("/health", async () => ({ status: "ok", service: "wetrust-api" }));

  // ----- AUTH: EMAIL/PASSWORD -----
  app.post("/auth/email/register", async (request, reply) => {
    const { email, password } = request.body || {};
    if (!email || !password) {
      reply.code(400);
      return { ok: false, error: "Email e password sono obbligatori." };
    }
    const cleanEmail = String(email).trim().toLowerCase();
    if (cleanEmail.length < 5 || !cleanEmail.includes("@")) {
      reply.code(400);
      return { ok: false, error: "Email non valida." };
    }
    if (String(password).length < 8) {
      reply.code(400);
      return { ok: false, error: "Password troppo corta (min 8 caratteri)." };
    }
    const exists = users.find((u) => (u.email || "").toLowerCase() === cleanEmail);
    if (exists) {
      reply.code(409);
      return { ok: false, error: "Esiste già un account con questa email." };
    }

    const u = {
      id: String(Date.now()),
      email: cleanEmail,
      phone: null,
      passwordHash: await bcrypt.hash(String(password), 10),
      createdAt: new Date().toISOString(),
    };
    users.unshift(u);

    const token = signToken(u);
    return { ok: true, token, user: publicUser(u) };
  });

  app.post("/auth/email/login", async (request, reply) => {
    const { email, password } = request.body || {};
    if (!email || !password) {
      reply.code(400);
      return { ok: false, error: "Email e password sono obbligatori." };
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const u = users.find((x) => (x.email || "").toLowerCase() === cleanEmail);
    if (!u || !u.passwordHash) {
      reply.code(401);
      return { ok: false, error: "Credenziali non valide." };
    }
    const ok = await bcrypt.compare(String(password), u.passwordHash);
    if (!ok) {
      reply.code(401);
      return { ok: false, error: "Credenziali non valide." };
    }
    const token = signToken(u);
    return { ok: true, token, user: publicUser(u) };
  });

  // ----- AUTH: SMS OTP (TWILIO VERIFY) -----
  app.post("/auth/sms/start", async (request, reply) => {
    const { phone } = request.body || {};
    if (!phone) {
      reply.code(400);
      return { ok: false, error: "Numero di telefono obbligatorio." };
    }
    if (!twilioClient || !TWILIO_VERIFY_SERVICE_SID) {
      reply.code(500);
      return {
        ok: false,
        error:
          "SMS OTP non configurato. Imposta TWILIO_* e VERIFY_SERVICE_SID nelle variabili d’ambiente.",
      };
    }

    const to = String(phone).trim(); // es: +393331112223
    try {
      await twilioClient.verify
        .services(TWILIO_VERIFY_SERVICE_SID)
        .verifications.create({ to, channel: "sms" });

      return { ok: true };
    } catch (err) {
      app.log.error(err, "Errore invio OTP SMS");
      reply.code(500);
      return { ok: false, error: "Errore invio SMS. Riprova." };
    }
  });

  app.post("/auth/sms/verify", async (request, reply) => {
    const { phone, code } = request.body || {};
    if (!phone || !code) {
      reply.code(400);
      return { ok: false, error: "Telefono e codice sono obbligatori." };
    }
    if (!twilioClient || !TWILIO_VERIFY_SERVICE_SID) {
      reply.code(500);
      return { ok: false, error: "SMS OTP non configurato (TWILIO_* mancanti)." };
    }

    const to = String(phone).trim();
    const otp = String(code).trim();

    try {
      const check = await twilioClient.verify
        .services(TWILIO_VERIFY_SERVICE_SID)
        .verificationChecks.create({ to, code: otp });

      if (check.status !== "approved") {
        reply.code(401);
        return { ok: false, error: "Codice non valido o scaduto." };
      }

      // login / create user by phone
      let u = users.find((x) => x.phone === to);
      if (!u) {
        u = {
          id: String(Date.now()),
          email: null,
          phone: to,
          passwordHash: null,
          createdAt: new Date().toISOString(),
        };
        users.unshift(u);
      }

      const token = signToken(u);
      return { ok: true, token, user: publicUser(u) };
    } catch (err) {
      app.log.error(err, "Errore verifica OTP");
      reply.code(500);
      return { ok: false, error: "Errore verifica OTP. Riprova." };
    }
  });

  // profilo corrente
  app.get("/me", { preHandler: requireAuth }, async (request) => {
    return { ok: true, user: publicUser(request.user) };
  });

  // ----- REQUESTS -----
  app.get("/requests", async () => ({ requests }));

  app.get("/requests/:id", async (request, reply) => {
    const r = requests.find((x) => x.id === request.params.id);
    if (!r) {
      reply.code(404);
      return { ok: false, error: "Richiesta non trovata." };
    }
    return { ok: true, request: r };
  });

  // crea richiesta -> richiede login
  app.post("/requests", { preHandler: requireAuth }, async (request, reply) => {
    const { description, city } = request.body || {};
    if (!description || !String(description).trim()) {
      reply.code(400);
      return { ok: false, error: "Descrivi almeno in poche parole il bisogno." };
    }

    const cleanDescription = String(description).trim();

    const newRequest = {
      id: String(Date.now()),
      title: cleanDescription.slice(0, 80),
      description: cleanDescription,
      city: city ? String(city).trim() : "",
      status: "open",
      createdAt: new Date().toISOString(),
      user_id: request.user.id,
      helper_id: null,
    };

    requests.unshift(newRequest);
    return { ok: true, request: newRequest };
  });

  // accetta richiesta -> richiede login
  app.post("/requests/:id/accept", { preHandler: requireAuth }, async (request, reply) => {
    const r = requests.find((x) => x.id === request.params.id);
    if (!r) {
      reply.code(404);
      return { ok: false, error: "Richiesta non trovata." };
    }
    if (r.user_id === request.user.id) {
      reply.code(400);
      return { ok: false, error: "Non puoi accettare la tua stessa richiesta." };
    }
    if (r.status !== "open") {
      reply.code(400);
      return { ok: false, error: "Questa richiesta non è più disponibile." };
    }
    r.status = "matched";
    r.helper_id = request.user.id;
    return { ok: true, request: r };
  });

  // ----- CONTATTI (email) -----
  app.post("/contact", async (request, reply) => {
    const { name, email, message } = request.body || {};
    app.log.info({ name, email, message }, "Nuovo contatto WeTrust");

    if (!email || !message) {
      reply.code(400);
      return { ok: false, error: "Email e messaggio sono obbligatori." };
    }

    try {
      await transporter.sendMail({
        from: `"WeTrust Contatti" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: process.env.CONTACT_TO || "antoniobottalico1505@gmail.com",
        replyTo: email,
        subject: "Nuovo contatto dal sito WeTrust",
        text:
          `Nome: ${name || "(non fornito)"}\n` +
          `Email: ${email}\n\n` +
          `Messaggio:\n${message}`,
      });

      return { ok: true };
    } catch (err) {
      app.log.error(err, "Errore invio email contatto");
      reply.code(500);
      return { ok: false, error: "Messaggio ricevuto ma errore invio email." };
    }
  });

app.post(
  "/payments/checkout-session",
  { preHandler: [requireAuth] },
  async (req, reply) => {
    try {
      const { amountCents, requestId } = req.body || {};

      if (!amountCents || !requestId) {
        return reply.code(400).send({ ok: false, error: "amountCents e requestId sono obbligatori" });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: process.env.CURRENCY || "eur",
              product_data: { name: `WeTrust - richiesta ${requestId}` },
              unit_amount: Number(amountCents),
            },
            quantity: 1,
          },
        ],
        success_url: `${process.env.FRONTEND_URL}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/pay/cancel`,
        payment_intent_data: {
          capture_method: "manual", // HOLD vero
        },
        metadata: {
          requestId: String(requestId),
          payerUserId: String(req.user?.id || ""),
        },
      });

      // TODO: salva nel DB: session.id, requestId, amountCents, status="AUTHORIZING"

      return reply.send({ ok: true, url: session.url, sessionId: session.id });
    } catch (e) {
      req.log?.error?.(e);
      return reply.code(500).send({ ok: false, error: e.message || "Errore Stripe" });
    }
  }
);

app.post("/webhooks/stripe", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send(`Signature error: ${e.message}`);
  }

  // salva event.id per idempotenza

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    // salva session.payment_intent nel DB, status="REQUIRES_CAPTURE"
  }

  if (event.type === "payment_intent.amount_capturable_updated") {
    const pi = event.data.object;
    // status="REQUIRES_CAPTURE" confermato
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object;
    // status="CAPTURED" (pagato davvero)
  }

  if (event.type === "payment_intent.payment_failed") {
    // status="FAILED"
  }

  res.json({ received: true });
});

app.post("/payments/capture", requireAuth, async (req, res) => {
  const { paymentIntentId } = req.body;

  const pi = await stripe.paymentIntents.capture(paymentIntentId);
  res.json({ ok: true, paymentIntent: pi });
});

  // PORTA PER LOCALE/RENDER
  const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log("API listening on", PORT));
app.get("/health", (req, res) => res.json({ ok: true }));

  try {
    const address = await app.listen({ port: PORT, host: HOST });
    app.log.info(`Server listening at ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
