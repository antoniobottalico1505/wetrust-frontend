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

// ---------------- CONFIG ----------------
const PORT = Number(process.env.PORT || 10000);
const HOST = "0.0.0.0";
const FRONTEND_URL = String(process.env.FRONTEND_URL || "http://localhost:3000").trim();
const CURRENCY = String(process.env.CURRENCY || "eur").trim();
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_JWT_SECRET";

// Stripe
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Stream
const STREAM_API_KEY = process.env.STREAM_API_KEY;
const STREAM_API_SECRET = process.env.STREAM_API_SECRET;
const streamServer =
  STREAM_API_KEY && STREAM_API_SECRET ? StreamChat.getInstance(STREAM_API_KEY, STREAM_API_SECRET) : null;

// Twilio
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;
const twilioClient =
  TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

// ---------------- IN-MEMORY DB (demo) ----------------
// ⚠️ Questo è solo demo. In produzione: DB vero.
const users = [];
const requests = [];
const matches = [];
const messagesByMatch = new Map(); // matchId -> [{id, fromUserId, text, createdAt}]
const payments = new Map(); // key -> { sessionId, paymentIntentId, status }

// seed demo (facoltativo)
if (users.length === 0) {
  users.push({
    id: "u1",
    email: "demo1@wetrust.app",
    phone: null,
    passwordHash: bcrypt.hashSync("Password123!", 10),
    createdAt: new Date().toISOString(),
  });
  users.push({
    id: "u2",
    email: "demo2@wetrust.app",
    phone: null,
    passwordHash: bcrypt.hashSync("Password123!", 10),
    createdAt: new Date().toISOString(),
  });

  requests.push({
    id: "r1",
    title: "Accompagnare mia madre dal medico",
    description: "Cerco qualcuno di affidabile per accompagnare mia madre domani mattina.",
    city: "Torino",
    status: "open",
    createdAt: new Date().toISOString(),
    user_id: "u1",
    helper_id: null,
  });
}

// ---------------- HELPERS ----------------
function publicUser(u) {
  return { id: u.id, email: u.email || null, phone: u.phone || null, name: u.name || null };
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
    return users.find((x) => x.id === payload.sub) || null;
  } catch {
    return null;
  }
}

// Fastify preHandler
function requireAuth(request, reply, done) {
  const u = getAuthUser(request);
  if (!u) return reply.code(401).send({ ok: false, error: "Non autorizzato. Effettua l’accesso." });
  request.user = u;
  done();
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
  return user.email || user.phone || `User ${user.id}`;
}

// ---------------- START ----------------
async function start() {
  const app = fastify({ logger: true });

app.get("/", async () => ({ ok: true, service: "wetrust-api" }));

  await app.register(cors, { origin: true });
  await app.register(helmet);
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });

  // Mailer (opzionale)
  const transporter =
    process.env.SMTP_USER && process.env.SMTP_PASS
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === "true",
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        })
      : null;

  // ---------------- ROUTES ----------------
  app.get("/health", async () => ({ ok: true, status: "ok" }));

  app.get("/me", { preHandler: [requireAuth] }, async (request) => {
    return { ok: true, user: publicUser(request.user) };
  });

  // ---------- STREAM TOKEN ----------
  // Il frontend chiama /stream/token dopo login e ottiene apiKey + token.
  app.get("/stream/token", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!streamServer) {
      return reply.code(500).send({ ok: false, error: "Stream non configurato (STREAM_API_KEY/STREAM_API_SECRET)" });
    }

    const userId = String(request.user.id);
    await streamServer.upsertUser({ id: userId, name: safeNameForStream(request.user) });

    const token = streamServer.createToken(userId);
    return reply.send({ ok: true, apiKey: STREAM_API_KEY, userId, token });
  });

  // -------- EMAIL/PASSWORD AUTH --------
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
    };
    users.unshift(u);

    return { ok: true, token: signToken(u), user: publicUser(u) };
  });

  app.post("/auth/email/login", async (request, reply) => {
    const { email, password } = request.body || {};
    if (!email || !password) return reply.code(400).send({ ok: false, error: "Email e password obbligatori." });

    const cleanEmail = String(email).trim().toLowerCase();
    const u = users.find((x) => (x.email || "").toLowerCase() === cleanEmail);
    if (!u || !u.passwordHash) return reply.code(401).send({ ok: false, error: "Credenziali non valide." });

    const ok = await bcrypt.compare(String(password), u.passwordHash);
    if (!ok) return reply.code(401).send({ ok: false, error: "Credenziali non valide." });

    return { ok: true, token: signToken(u), user: publicUser(u) };
  });

  // -------- SMS OTP (Twilio Verify) --------
  app.post("/auth/sms/start", async (request, reply) => {
    const { phone } = request.body || {};
    if (!phone) return reply.code(400).send({ ok: false, error: "Telefono obbligatorio." });
    if (!twilioClient || !TWILIO_VERIFY_SERVICE_SID)
      return reply.code(500).send({ ok: false, error: "Twilio non configurato (TWILIO_* mancanti)." });

    try {
      await twilioClient.verify.services(TWILIO_VERIFY_SERVICE_SID).verifications.create({
        to: String(phone).trim(),
        channel: "sms",
      });
      return { ok: true };
    } catch (e) {
      app.log.error(e);
      return reply.code(500).send({ ok: false, error: "Errore invio SMS." });
    }
  });

  app.post("/auth/sms/verify", async (request, reply) => {
    const { phone, code } = request.body || {};
    if (!phone || !code) return reply.code(400).send({ ok: false, error: "Telefono e codice obbligatori." });
    if (!twilioClient || !TWILIO_VERIFY_SERVICE_SID)
      return reply.code(500).send({ ok: false, error: "Twilio non configurato (TWILIO_* mancanti)." });

    try {
      const check = await twilioClient.verify.services(TWILIO_VERIFY_SERVICE_SID).verificationChecks.create({
        to: String(phone).trim(),
        code: String(code).trim(),
      });

      if (check.status !== "approved") return reply.code(401).send({ ok: false, error: "Codice non valido." });

      const to = String(phone).trim();
      let u = users.find((x) => x.phone === to);
      if (!u) {
        u = { id: String(Date.now()), email: null, phone: to, passwordHash: null, createdAt: new Date().toISOString() };
        users.unshift(u);
      }
      return { ok: true, token: signToken(u), user: publicUser(u) };
    } catch (e) {
      app.log.error(e);
      return reply.code(500).send({ ok: false, error: "Errore verifica codice." });
    }
  });

  // -------- REQUESTS --------
  app.get("/requests", async () => ({ ok: true, requests }));

  app.post("/requests", { preHandler: [requireAuth] }, async (request, reply) => {
    const { description, city, title } = request.body || {};
    if (!description || String(description).trim().length < 3)
      return reply.code(400).send({ ok: false, error: "Descrizione obbligatoria." });

    const r = {
      id: String(Date.now()),
      title: title ? String(title).trim() : "Richiesta",
      description: String(description).trim(),
      city: city ? String(city).trim() : "",
      status: "open",
      createdAt: new Date().toISOString(),
      user_id: request.user.id,
      helper_id: null,
    };
    requests.unshift(r);
    return { ok: true, request: r };
  });

  // ACCEPT: crea match + (se Stream configurato) crea channel e salva channelId
  app.post("/requests/:id/accept", { preHandler: [requireAuth] }, async (request, reply) => {
    const id = String(request.params.id);
    const r = requests.find((x) => x.id === id);
    if (!r) return reply.code(404).send({ ok: false, error: "Richiesta non trovata." });
    if (r.status !== "open") return reply.code(400).send({ ok: false, error: "Richiesta non accettabile." });

    r.status = "matched";
    r.helper_id = request.user.id;

    const m = {
      id: String(Date.now()),
      requestId: r.id,
      userId: r.user_id,
      helperId: r.helper_id,
      createdAt: new Date().toISOString(),
      channelId: null,
    };

    // crea channel Stream (messaging) tra user e helper
    if (streamServer) {
      const userA = String(m.userId);
      const userB = String(m.helperId);

      // upsert utenti su Stream
      const uA = users.find((u) => u.id === m.userId);
      const uB = users.find((u) => u.id === m.helperId);
      if (uA) await streamServer.upsertUser({ id: userA, name: safeNameForStream(uA) });
      if (uB) await streamServer.upsertUser({ id: userB, name: safeNameForStream(uB) });

      const channel = streamServer.channel("messaging", `match_${m.id}`, {
        members: [userA, userB],
      });

      await channel.create();
      m.channelId = channel.id;
    }

    matches.unshift(m);
    messagesByMatch.set(m.id, []);

    return { ok: true, match: m };
  });

  // -------- MATCHES (Chats page) --------
  app.get("/me/matches", { preHandler: [requireAuth] }, async (request) => {
    const myId = request.user.id;
    const list = matches
      .filter((m) => m.userId === myId || m.helperId === myId)
      .map((m) => {
        const r = requests.find((x) => x.id === m.requestId);
        const otherId = m.userId === myId ? m.helperId : m.userId;
        const otherUser = users.find((u) => u.id === otherId);
        return {
          id: m.id,
          requestTitle: r?.title || "Richiesta",
          requestCity: r?.city || "",
          otherUser: otherUser ? publicUser(otherUser) : { id: otherId, email: null, phone: null },
          channelId: m.channelId || null,
        };
      });

    return { ok: true, matches: list };
  });

  // -------- CHAT (fallback interno se non usi Stream nel frontend) --------
  app.get("/matches/:id/messages", { preHandler: [requireAuth] }, async (request, reply) => {
    const matchId = String(request.params.id);
    const m = ensureMatchAccess(request, reply, matchId);
    if (!m) return;
    return { ok: true, messages: messagesByMatch.get(matchId) || [] };
  });

  app.post("/matches/:id/messages", { preHandler: [requireAuth] }, async (request, reply) => {
    const matchId = String(request.params.id);
    const m = ensureMatchAccess(request, reply, matchId);
    if (!m) return;

    const { text } = request.body || {};
    if (!text || String(text).trim().length === 0)
      return reply.code(400).send({ ok: false, error: "Testo obbligatorio." });

    const msg = {
      id: String(Date.now()),
      fromUserId: request.user.id,
      text: String(text).trim(),
      createdAt: new Date().toISOString(),
    };

    const list = messagesByMatch.get(matchId) || [];
    list.push(msg);
    messagesByMatch.set(matchId, list);

    return { ok: true, message: msg };
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
      return { ok: true };
    } catch (e) {
      app.log.error(e);
      return reply.code(500).send({ ok: false, error: "Errore invio email." });
    }
  });

  // -------- STRIPE: HOLD (manual capture) --------
  app.post("/payments/checkout-session", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!stripe) return reply.code(500).send({ ok: false, error: "Stripe non configurato (STRIPE_SECRET_KEY)." });
    if (!process.env.STRIPE_WEBHOOK_SECRET)
      return reply.code(500).send({ ok: false, error: "Stripe webhook secret mancante (STRIPE_WEBHOOK_SECRET)." });

    const { amountCents, requestId, matchId } = request.body || {};
    if (!amountCents) return reply.code(400).send({ ok: false, error: "amountCents obbligatorio." });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: CURRENCY,
            product_data: { name: "WeTrust - pagamento" },
            unit_amount: Number(amountCents),
          },
          quantity: 1,
        },
      ],
      success_url: `${FRONTEND_URL}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/pay/cancel`,
      payment_intent_data: { capture_method: "manual" }, // HOLD
      metadata: {
        requestId: requestId ? String(requestId) : "",
        matchId: matchId ? String(matchId) : "",
        payerUserId: String(request.user.id),
      },
    });

    const key = (matchId && String(matchId)) || (requestId && String(requestId)) || session.id;
    payments.set(key, {
      sessionId: session.id,
      paymentIntentId: session.payment_intent || null,
      status: "CREATED",
    });

    return reply.send({ ok: true, url: session.url, sessionId: session.id });
  });

  app.post("/payments/capture", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!stripe) return reply.code(500).send({ ok: false, error: "Stripe non configurato (STRIPE_SECRET_KEY)." });

    const { paymentIntentId } = request.body || {};
    if (!paymentIntentId) return reply.code(400).send({ ok: false, error: "paymentIntentId obbligatorio." });

    const pi = await stripe.paymentIntents.capture(String(paymentIntentId));
    return reply.send({ ok: true, paymentIntent: pi });
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
      if (!stripe) return reply.code(500).send("Stripe not configured");

      const sig = request.headers["stripe-signature"];
      const buf = request.body; // Buffer raw

      let event;
      try {
        event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
      } catch (e) {
        return reply.code(400).send(`Signature error: ${e.message}`);
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const key = session.metadata?.matchId || session.metadata?.requestId || session.id;
        const prev = payments.get(key) || {};
        payments.set(key, {
          ...prev,
          sessionId: session.id,
          paymentIntentId: session.payment_intent,
          status: "AUTHORIZED",
        });
      }

      return reply.send({ received: true });
    });
  });

  // LISTEN
  const PORT = Number(process.env.PORT || 10000);
  await app.listen({ port: PORT, host: "0.0.0.0" });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
