"use strict";

require("dotenv").config();

const fastify = require("fastify");
const cors = require("@fastify/cors");
const helmet = require("@fastify/helmet");
const rateLimit = require("@fastify/rate-limit");

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const twilio = require("twilio");
const nodemailer = require("nodemailer");

const Stripe = require("stripe");
const { StreamChat } = require("stream-chat");

// ---------------- TWILIO ENV (COMPAT) ----------------
// Supporta sia i nomi "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN"
// sia i nomi "TWILIO_SID / TWILIO_TOKEN"
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_TOKEN || "";
const TWILIO_FROM = process.env.TWILIO_FROM || "";
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID || "";

// ---------------- IN-MEMORY STORE (DEMO) ----------------
// In produzione: sostituisci con DB vero (Postgres/Mongo ecc.)
const users = [];
const smsCodes = new Map(); // phone -> { code, expiresAt }
const emailCodes = new Map(); // email -> { code, expiresAt }
const matches = [];
const requests = [];

// ---------------- ENV ----------------
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const STREAM_API_KEY = process.env.STREAM_API_KEY || "";
const STREAM_API_SECRET = process.env.STREAM_API_SECRET || "";

// ---------------- HELPERS ----------------
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    createdAt: u.createdAt,
    stripe_account_id: u.stripeAccountId || null,
  };
}

function requireAuth(request, reply, done) {
  const auth = request.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return reply.code(401).send({ ok: false, error: "Token mancante" });

  try {
    const payload = verifyToken(token);
    const u = users.find((x) => x.id === payload.id);
    if (!u) return reply.code(401).send({ ok: false, error: "Utente non valido" });
    request.user = u;
    done();
  } catch (e) {
    return reply.code(401).send({ ok: false, error: "Token non valido" });
  }
}

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function ensureMatchAccess(request, reply, matchId) {
  const m = matches.find((x) => x.id === matchId);
  if (!m) {
    reply.code(404).send({ ok: false, error: "Match non trovato" });
    return null;
  }
  if (m.userId !== request.user.id && m.helperId !== request.user.id) {
    reply.code(403).send({ ok: false, error: "Accesso negato" });
    return null;
  }
  return m;
}

function safeNameForStream(user) {
  if (user.email) return user.email.split("@")[0];
  if (user.phone) return user.phone.replace(/\D/g, "").slice(-6);
  return "user";
}

async function start() {
  const app = fastify({ logger: true });

  await app.register(cors, {
  origin: ["https://www.wetrust.club", "https://wetrust.club"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});

  app.get("/", async () => ({ ok: true, service: "wetrust-api" }));
  await app.register(helmet);
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });

  // Mailer (opzionale)
  const transporter =
    process.env.SMTP_USER && process.env.SMTP_PASS
      ? nodemailer.createTransport({
          service: process.env.SMTP_SERVICE || undefined,
          host: process.env.SMTP_HOST || undefined,
          port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
          secure: process.env.SMTP_SECURE === "true",
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        })
      : null;

// Twilio (opzionale)
const twilioClient = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

  // Stripe (opzionale)
  const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

  // Stream (opzionale)
  const stream =
    STREAM_API_KEY && STREAM_API_SECRET ? StreamChat.getInstance(STREAM_API_KEY, STREAM_API_SECRET) : null;

  // ---------------- ROUTES ----------------
  // UNICA route /health (niente duplicati!)
  app.get("/health", async () => ({ ok: true, status: "ok" }));

  app.get("/me", { preHandler: [requireAuth] }, async (request) => {
    return { ok: true, user: publicUser(request.user) };
  });

// ---------- STRIPE CONNECT ONBOARDING ----------
app.post("/stripe/connect/onboard", { preHandler: [requireAuth] }, async (request, reply) => {
  if (!stripe) return reply.code(500).send({ ok: false, error: "Stripe non configurato" });

  const baseUrl =
    request.body?.baseUrl ||
    request.body?.base_url ||
    request.headers.origin ||
    `${request.headers["x-forwarded-proto"] || "https"}://${request.headers.host}`;

  try {
    // 1) se l’utente ha già un account Stripe, riusalo
    let accountId = request.user.stripeAccountId;

    // 2) altrimenti crealo
    if (!accountId) {
      const acct = await stripe.accounts.create({
        type: "express",
        email: request.user.email || undefined,
        capabilities: { transfers: { requested: true } },
      });
      accountId = acct.id;
      request.user.stripeAccountId = accountId; // <- salva sul profilo utente (qui è in-memory)
    }

    // 3) genera il link di onboarding
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${baseUrl}/profile`,
      return_url: `${baseUrl}/profile`,
    });

    return reply.send({ ok: true, url: link.url, accountId });
  } catch (e) {
    request.log.error(e, "Stripe connect onboarding failed");
    return reply.code(500).send({ ok: false, error: e.message || "Errore Stripe Connect" });
  }
});

  // ---------- STREAM TOKEN ----------
  // Il frontend chiama /stream/token dopo login e ottiene apiKey + token.
  app.get("/stream/token", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!stream) return reply.code(500).send({ ok: false, error: "Stream non configurato" });

    const user = request.user;
    const userId = user.id;
    const name = safeNameForStream(user);

    try {
      await stream.upsertUser({ id: userId, name });
      const token = stream.createToken(userId);
      return reply.send({ ok: true, apiKey: STREAM_API_KEY, token });
    } catch (e) {
      return reply.code(500).send({ ok: false, error: "Errore Stream" });
    }
  });

  // ---------- AUTH: EMAIL REGISTER ----------
  app.post("/auth/email/register", async (request, reply) => {
    const { email, password } = request.body || {};
    if (!email || !password) return reply.code(400).send({ ok: false, error: "Email e password obbligatori." });

    const cleanEmail = String(email).trim().toLowerCase();
    if (!cleanEmail.includes("@")) return reply.code(400).send({ ok: false, error: "Email non valida." });
    if (String(password).length < 8) return reply.code(400).send({ ok: false, error: "Password min 8 caratteri." });

    if (users.find((u) => (u.email || "").toLowerCase() === cleanEmail))
      return reply.code(409).send({ ok: false, error: "Email già registrata." });

    const u = {
      id: String(Date.now()),
      email: cleanEmail,
      phone: null,
      passwordHash: await bcrypt.hash(String(password), 10),
      createdAt: new Date().toISOString(),
stripeAccountId: null,
    };
    users.push(u);

    const token = signToken({ id: u.id });
    return reply.send({ ok: true, token, user: publicUser(u) });
  });

  // ---------- AUTH: EMAIL LOGIN ----------
  app.post("/auth/email/login", async (request, reply) => {
    const { email, password } = request.body || {};
    if (!email || !password) return reply.code(400).send({ ok: false, error: "Email e password obbligatori." });

    const cleanEmail = String(email).trim().toLowerCase();
    const u = users.find((x) => (x.email || "").toLowerCase() === cleanEmail);
    if (!u) return reply.code(401).send({ ok: false, error: "Credenziali errate." });

    const ok = await bcrypt.compare(String(password), u.passwordHash);
    if (!ok) return reply.code(401).send({ ok: false, error: "Credenziali errate." });

    const token = signToken({ id: u.id });
    return reply.send({ ok: true, token, user: publicUser(u) });
  });

 // ---------- AUTH: SMS SEND CODE ----------
app.post("/auth/sms/send", async (request, reply) => {
  const { phone } = request.body || {};
  const cleanPhone = String(phone || "").trim();
  if (!cleanPhone) return reply.code(400).send({ ok: false, error: "Numero richiesto." });

  // ✅ Se Verify è configurato, usa Verify (OTP serio, niente codice in RAM)
  if (twilioClient && TWILIO_VERIFY_SERVICE_SID) {
    try {
      const r = await twilioClient.verify.v2
        .services(TWILIO_VERIFY_SERVICE_SID)
        .verifications.create({ to: cleanPhone, channel: "sms" });

      return reply.send({ ok: true, sent: true, via: "verify", status: r.status });
    } catch (e) {
      request.log.error(e, "Twilio Verify send failed");
      return reply.code(500).send({ ok: false, error: e.message || "Errore invio SMS (Verify)." });
    }
  }

  // 🔁 Fallback: vecchia logica (codice in memoria + SMS normale)
  const code = randomCode();
  smsCodes.set(cleanPhone, { code, expiresAt: Date.now() + 5 * 60 * 1000 });

  if (twilioClient && TWILIO_FROM) {
    try {
      await twilioClient.messages.create({
        to: cleanPhone,
        from: TWILIO_FROM,
        body: `WeTrust codice: ${code}`,
      });
    } catch (e) {
      request.log.error(e, "Twilio SMS send failed");
      return reply.code(500).send({ ok: false, error: e.message || "Errore invio SMS." });
    }
  }

  // per debug/dev: ritorno il codice se Twilio non è configurato
  return reply.send({ ok: true, sent: true, devCode: twilioClient ? undefined : code });
});

  // ---------- AUTH: SMS VERIFY ----------
app.post("/auth/sms/verify", async (request, reply) => {
  const { phone, code } = request.body || {};
  const cleanPhone = String(phone || "").trim();
  const cleanCode = String(code || "").trim();

  if (!cleanPhone) return reply.code(400).send({ ok: false, error: "Numero richiesto." });
  if (!cleanCode) return reply.code(400).send({ ok: false, error: "Codice richiesto." });

  // ✅ Se Verify è configurato, verifica tramite Twilio Verify
  if (twilioClient && TWILIO_VERIFY_SERVICE_SID) {
    try {
      const check = await twilioClient.verify.v2
        .services(TWILIO_VERIFY_SERVICE_SID)
        .verificationChecks.create({ to: cleanPhone, code: cleanCode });

      if (check.status !== "approved") {
        return reply.code(400).send({ ok: false, error: "Codice errato o scaduto." });
      }

      // login/creazione utente come già fai tu
      let u = users.find((x) => x.phone === cleanPhone);
      if (!u) {
        u = {
          id: String(Date.now()),
          email: null,
          phone: cleanPhone,
          passwordHash: null,
          createdAt: new Date().toISOString(),
stripeAccountId: null,
        };
        users.push(u);
      }

      const token = signToken({ id: u.id });
      return reply.send({ ok: true, token, user: publicUser(u) });
    } catch (e) {
      request.log.error(e, "Twilio Verify check failed");
      return reply.code(500).send({ ok: false, error: e.message || "Errore verifica SMS (Verify)." });
    }
  }

  // 🔁 Fallback: vecchia logica in memoria
  const entry = smsCodes.get(cleanPhone);
  if (!entry || entry.expiresAt < Date.now()) return reply.code(400).send({ ok: false, error: "Codice scaduto." });
  if (entry.code !== cleanCode) return reply.code(400).send({ ok: false, error: "Codice errato." });

  smsCodes.delete(cleanPhone);

  let u = users.find((x) => x.phone === cleanPhone);
  if (!u) {
    u = {
      id: String(Date.now()),
      email: null,
      phone: cleanPhone,
      passwordHash: null,
      createdAt: new Date().toISOString(),
    };
    users.push(u);
  }

  const token = signToken({ id: u.id });
  return reply.send({ ok: true, token, user: publicUser(u) });
});

  // ---------- AUTH: EMAIL SEND CODE ----------
  app.post("/auth/email/send", async (request, reply) => {
    const { email } = request.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail.includes("@")) return reply.code(400).send({ ok: false, error: "Email non valida." });

    const code = randomCode();
    emailCodes.set(cleanEmail, { code, expiresAt: Date.now() + 10 * 60 * 1000 });

    if (transporter) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: cleanEmail,
          subject: "WeTrust - Codice di verifica",
          text: `Codice: ${code}`,
        });
      } catch (e) {
        return reply.code(500).send({ ok: false, error: "Errore invio email." });
      }
    }

    return reply.send({ ok: true, sent: true, devCode: transporter ? undefined : code });
  });

  // ---------- AUTH: EMAIL VERIFY ----------
  app.post("/auth/email/verify", async (request, reply) => {
    const { email, code } = request.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanCode = String(code || "").trim();

    const entry = emailCodes.get(cleanEmail);
    if (!entry || entry.expiresAt < Date.now()) return reply.code(400).send({ ok: false, error: "Codice scaduto." });
    if (entry.code !== cleanCode) return reply.code(400).send({ ok: false, error: "Codice errato." });

    emailCodes.delete(cleanEmail);

    let u = users.find((x) => (x.email || "").toLowerCase() === cleanEmail);
    if (!u) {
      u = {
        id: String(Date.now()),
        email: cleanEmail,
        phone: null,
        passwordHash: null,
        createdAt: new Date().toISOString(),
stripeAccountId: null,
      };
      users.push(u);
    }

    const token = signToken({ id: u.id });
    return reply.send({ ok: true, token, user: publicUser(u) });
  });

  // ---------------- REQUESTS ----------------
 app.post("/requests", { preHandler: [requireAuth] }, async (request, reply) => {
  const { title, description, city } = request.body || {};
  if (!title) return reply.code(400).send({ ok: false, error: "Titolo obbligatorio" });

  const cleanCity = typeof city === "string" ? city.trim() : "";

  const r = {
    id: String(Date.now()),
    userId: request.user.id,
    title: String(title),
    description: String(description || ""),
    city: cleanCity || null,
    createdAt: new Date().toISOString(),
    status: "OPEN",
  };
  requests.push(r);
  return reply.send({ ok: true, item: r });
});

  // ---------------- MATCHES ----------------
  app.get("/matches", { preHandler: [requireAuth] }, async (request) => {
    const list = matches.filter((m) => m.userId === request.user.id || m.helperId === request.user.id);
    return { ok: true, items: list };
  });

  app.post("/matches", { preHandler: [requireAuth] }, async (request, reply) => {
    const { requestId, helperId } = request.body || {};
    if (!requestId || !helperId) return reply.code(400).send({ ok: false, error: "requestId e helperId obbligatori" });

    const reqItem = requests.find((x) => x.id === String(requestId));
    if (!reqItem) return reply.code(404).send({ ok: false, error: "Request non trovata" });

if (String(reqItem.userId) === String(helperId)) {
  return reply.code(400).send({ ok: false, error: "Non puoi accettare la tua richiesta" });
}

    const m = {
      id: String(Date.now()),
      requestId: String(requestId),
      userId: reqItem.userId,
      helperId: String(helperId),
      createdAt: new Date().toISOString(),
    };
    matches.push(m);
    return reply.send({ ok: true, item: m });
  });

  // ---------------- PAYMENTS (Stripe) ----------------
  app.post("/payments/create-intent", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!stripe) return reply.code(500).send({ ok: false, error: "Stripe non configurato" });

    const { amount, currency } = request.body || {};
    if (!amount) return reply.code(400).send({ ok: false, error: "amount obbligatorio" });

    try {
      const pi = await stripe.paymentIntents.create({
        amount: Number(amount),
        currency: currency || "eur",
        metadata: { userId: request.user.id },
      });
      return reply.send({ ok: true, paymentIntent: pi });
    } catch (e) {
      return reply.code(500).send({ ok: false, error: "Errore Stripe" });
    }
  });

  // -------- STRIPE WEBHOOK (RAW) --------
  // Incapsulato: parser application/json -> Buffer SOLO per questa route
  app.register(async function (instance) {
    instance.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (req, body, done) => done(null, body)
    );

    instance.post("/webhooks/stripe", async (request, reply) => {
      if (!stripe || !STRIPE_WEBHOOK_SECRET) {
        reply.code(500);
        return { ok: false, error: "Stripe webhook non configurato" };
      }

      const sig = request.headers["stripe-signature"];
      let event;
      try {
        event = stripe.webhooks.constructEvent(request.body, sig, STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        reply.code(400);
        return { ok: false, error: "Webhook signature failed" };
      }

      // Gestisci gli eventi che ti servono
      if (event.type === "payment_intent.succeeded") {
        // ok
      }

      return reply.send({ received: true });
    });
  });

  // -------- CONTACT --------
  app.post("/contact", async (request, reply) => {
    const { name, email, message } = request.body || {};
    if (!message) return reply.code(400).send({ ok: false, error: "Messaggio obbligatorio." });
    if (!transporter) return reply.code(500).send({ ok: false, error: "SMTP non configurato." });

    const to = process.env.CONTACT_TO || process.env.SMTP_USER;
    try {
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to,
        subject: `WeTrust Contact - ${name || "Anonimo"} (${email || "no-email"})`,
        text: String(message),
      });
      return reply.send({ ok: true, sent: true });
    } catch (e) {
      return reply.code(500).send({ ok: false, error: "Errore invio email." });
    }
  });

  // LISTEN (Render: PORT + 0.0.0.0)
  const PORT = Number(process.env.PORT || 10000);
  const address = await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`Server listening at ${address}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
