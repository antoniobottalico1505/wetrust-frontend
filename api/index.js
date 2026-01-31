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
// ---------------- PAY CONFIG ----------------
const PLATFORM_FEE_BPS = Number(process.env.PLATFORM_FEE_BPS || 1500); // 1500 = 15%
const PLATFORM_FEE_FIXED_CENTS = Number(process.env.PLATFORM_FEE_FIXED_CENTS || 49); // 49 = Ôé¼0,49
const VOUCHERS_RAW = process.env.VOUCHERS || "TEST10:1000,TEST25:2500"; // CODE:cents,...
const voucherMap = new Map(
  VOUCHERS_RAW.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [code, cents] = pair.split(":").map((x) => String(x || "").trim());
      return [code.toUpperCase(), Number(cents || 0)];
    })
);
const redeemedVouchers = new Set();

function calcFeeCents(priceCents) {
  const p = Number(priceCents || 0);
  if (!p || p <= 0) return 0;

  const percent = Math.round((p * PLATFORM_FEE_BPS) / 10000);
  const fixed = Math.max(0, Number(PLATFORM_FEE_FIXED_CENTS || 0));

  return Math.max(0, percent + fixed);
}

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

// ---------- CHAT MESSAGES (in-memory demo) ----------
const messagesByMatch = new Map(); // matchId -> [{id, matchId, userId, text, createdAt}]

app.get("/matches/:id/messages", { preHandler: [requireAuth] }, async (request, reply) => {
  const { id } = request.params;
  const m = ensureMatchAccess(request, reply, String(id));
  if (!m) return;

  const messages = messagesByMatch.get(String(m.id)) || [];
  return reply.send({ ok: true, messages });
});

app.post("/matches/:id/messages", { preHandler: [requireAuth] }, async (request, reply) => {
  const { id } = request.params;
  const m = ensureMatchAccess(request, reply, String(id));
  if (!m) return;

  const text = String(request.body?.text || "").trim();
  if (!text) return reply.code(400).send({ ok: false, error: "Testo mancante" });

  const msg = {
    id: String(Date.now()),
    matchId: String(m.id),
    userId: String(request.user.id),
    text,
    createdAt: new Date().toISOString(),
  };

  const arr = messagesByMatch.get(String(m.id)) || [];
  arr.push(msg);
  messagesByMatch.set(String(m.id), arr);

  return reply.send({ ok: true, message: msg, messages: arr });
});

  // ---------------- ROUTES ----------------
  // UNICA route /health (niente duplicati!)
  app.get("/health", async () => ({ ok: true, status: "ok" }));

  app.get("/me", { preHandler: [requireAuth] }, async (request) => {
    return { ok: true, user: publicUser(request.user) };
  });

// ---------- WALLET ----------
app.get("/wallet", { preHandler: [requireAuth] }, async (request) => {
  if (typeof request.user.walletCents !== "number") request.user.walletCents = 0;
  return { ok: true, wallet_cents: request.user.walletCents };
});

// ---------- VOUCHERS ----------
app.post("/vouchers/redeem", { preHandler: [requireAuth] }, async (request, reply) => {
  const codeRaw = String(request.body?.code || "").trim();
  if (!codeRaw) return reply.code(400).send({ ok: false, error: "Codice obbligatorio" });

  const code = codeRaw.toUpperCase();
  const cents = voucherMap.get(code);

  if (!cents || cents <= 0) return reply.code(400).send({ ok: false, error: "Voucher non valido" });
  if (redeemedVouchers.has(code)) return reply.code(400).send({ ok: false, error: "Voucher gi├á usato" });

  redeemedVouchers.add(code);

  if (typeof request.user.walletCents !== "number") request.user.walletCents = 0;
  request.user.walletCents += cents;

  return reply.send({ ok: true, added_cents: cents, wallet_cents: request.user.walletCents });
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
    // 1) se lÔÇÖutente ha gi├á un account Stripe, riusalo
    let accountId = request.user.stripeAccountId;

    // 2) altrimenti crealo
    if (!accountId) {
      const acct = await stripe.accounts.create({
        type: "express",
        email: request.user.email || undefined,
        capabilities: { transfers: { requested: true } },
      });
      accountId = acct.id;
      request.user.stripeAccountId = accountId; // <- salva sul profilo utente (qui ├¿ in-memory)
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

// GET variant (comodo per redirect / link esterni): stesso comportamento del POST
app.get("/stripe/connect/onboard", { preHandler: [requireAuth] }, async (request, reply) => {
  try {
    if (!stripe) return reply.code(500).send({ ok: false, error: "Stripe non configurato" });

    const baseUrl =
      (request.query && (request.query.baseUrl || request.query.base_url)) ||
      process.env.FRONTEND_BASE_URL ||
      "https://wetrust.club";

    const user = users.find((u) => u.id === request.user.id);
    if (!user) return reply.code(401).send({ ok: false, error: "Utente non trovato" });

    let accountId = user.stripeAccountId;

    if (!accountId) {
      const acc = await stripe.accounts.create({
        type: "express",
        email: user.email || undefined,
        capabilities: { transfers: { requested: true } },
      });
      accountId = acc.id;
      user.stripeAccountId = accountId;
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/profile`,
      return_url: `${baseUrl}/profile`,
      type: "account_onboarding",
    });

    return reply.send({ ok: true, url: link.url, accountId });
  } catch (e) {
    request.log.error(e);
    return reply.code(500).send({ ok: false, error: "Errore onboarding Stripe" });
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
      return reply.code(409).send({ ok: false, error: "Email gi├á registrata." });

    const u = {
      id: String(Date.now()),
      email: cleanEmail,
      phone: null,
      passwordHash: await bcrypt.hash(String(password), 10),
      createdAt: new Date().toISOString(),
stripeAccountId: null,
walletCents: 0,
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

  // Ô£à Se Verify ├¿ configurato, usa Verify (OTP serio, niente codice in RAM)
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

  // ­ƒöü Fallback: vecchia logica (codice in memoria + SMS normale)
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

  // per debug/dev: ritorno il codice se Twilio non ├¿ configurato
  return reply.send({ ok: true, sent: true, devCode: twilioClient ? undefined : code });
});

  // ---------- AUTH: SMS VERIFY ----------
app.post("/auth/sms/verify", async (request, reply) => {
  const { phone, code } = request.body || {};
  const cleanPhone = String(phone || "").trim();
  const cleanCode = String(code || "").trim();

  if (!cleanPhone) return reply.code(400).send({ ok: false, error: "Numero richiesto." });
  if (!cleanCode) return reply.code(400).send({ ok: false, error: "Codice richiesto." });

  // Ô£à Se Verify ├¿ configurato, verifica tramite Twilio Verify
  if (twilioClient && TWILIO_VERIFY_SERVICE_SID) {
    try {
      const check = await twilioClient.verify.v2
        .services(TWILIO_VERIFY_SERVICE_SID)
        .verificationChecks.create({ to: cleanPhone, code: cleanCode });

      if (check.status !== "approved") {
        return reply.code(400).send({ ok: false, error: "Codice errato o scaduto." });
      }

      // login/creazione utente come gi├á fai tu
      let u = users.find((x) => x.phone === cleanPhone);
      if (!u) {
        u = {
          id: String(Date.now()),
          email: null,
          phone: cleanPhone,
          passwordHash: null,
          createdAt: new Date().toISOString(),
stripeAccountId: null,
walletCents: 0,
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

  // ­ƒöü Fallback: vecchia logica in memoria
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
stripeAccountId: null,
  walletCents: 0,
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
walletCents: 0,
      };
      users.push(u);
    }

    const token = signToken({ id: u.id });
    return reply.send({ ok: true, token, user: publicUser(u) });
  });

  // ---------------- REQUESTS ----------------
app.get("/requests", async (request, reply) => {
  // Mostra pubblicamente solo richieste ancora disponibili
  const list = requests.filter((r) => r.status === "OPEN");
  return reply.send({ ok: true, items: list, requests: list });
});

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

app.get("/requests/feed", { preHandler: [requireAuth] }, async (request, reply) => {
  const uid = String(request.user.id);

  // requestId che l'utente "vede" perché è coinvolto (ha accettato come helper o è il requester)
  const visibleIds = new Set(
    matches
      .filter((m) => String(m.helperId) === uid || String(m.userId) === uid)
      .map((m) => String(m.requestId))
  );

  const items = requests
    .filter((r) => r.status === "OPEN" || visibleIds.has(String(r.id)))
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return reply.send({ ok: true, items });
});

app.get("/requests/:id", { preHandler: [requireAuth] }, async (request, reply) => {
  const { id } = request.params;

  const reqItem = requests.find((x) => x.id === String(id));
  if (!reqItem) return reply.code(404).send({ ok: false, error: "Request non trovata" });

  const match = matches.find((m) => String(m.requestId) === String(reqItem.id)) || null;
// ­ƒöÆ Se la richiesta non ├¿ OPEN, non deve essere visibile ad altri utenti
const isOwner = String(reqItem.userId) === String(request.user.id);
const isHelper = !!(match && String(match.helperId) === String(request.user.id));

if (reqItem.status !== "OPEN" && !isOwner && !isHelper) {
  // 404 per non ÔÇ£leakareÔÇØ lÔÇÖesistenza della richiesta
  return reply.code(404).send({ ok: false, error: "Request non trovata" });
}

  // aggiorna status payment da Stripe (se presente)
  if (match && stripe && match.payment_intent_id) {
    try {
      const pi = await stripe.paymentIntents.retrieve(match.payment_intent_id);
      match.payment_status = pi.status;
      if (typeof match.amount_cents !== "number") match.amount_cents = pi.amount;
    } catch {
      // ignore
    }
  }

  return reply.send({ ok: true, request: reqItem, match });
});


app.post("/requests/:id/accept", { preHandler: [requireAuth] }, async (request, reply) => {
  const { id } = request.params;

  const reqItem = requests.find((x) => x.id === String(id));
  if (!reqItem) return reply.code(404).send({ ok: false, error: "Request non trovata" });

  // non puoi accettare la tua richiesta
  if (String(reqItem.userId) === String(request.user.id)) {
    return reply.code(400).send({ ok: false, error: "Non puoi accettare la tua richiesta" });
  }

 // evita duplicati: se esiste gi├á un match per questa request
let existing = matches.find((m) => String(m.requestId) === String(reqItem.id));
if (existing) {
  // se non sei lÔÇÖhelper di quel match ÔåÆ la richiesta ├¿ gi├á presa
  if (String(existing.helperId) !== String(request.user.id)) {
    return reply.code(409).send({ ok: false, error: "Richiesta gi├á accettata" });
  }
  return reply.send({ ok: true, match: existing });
}

  const m = {
    id: String(Date.now()),
    requestId: String(reqItem.id),
    userId: reqItem.userId,              // requester
    helperId: String(request.user.id),   // chi accetta
    createdAt: new Date().toISOString(),
 stripeAccountId: null,
  walletCents: 0,

status: "ACCEPTED",
  price_cents: null,
  fee_cents: null,
  amount_cents: null,
  payment_intent_id: null,
  payment_status: null,
  paid_with_wallet: false,
  transfer_id: null,
  releasedAt: null,
  };

  matches.push(m);

  // opzionale: aggiorna status request
  reqItem.status = "ACCEPTED";

  return reply.send({ ok: true, match: m });
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
 stripeAccountId: null,
  walletCents: 0,

status: "ACCEPTED",
  price_cents: null,
  fee_cents: null,
  amount_cents: null,
  payment_intent_id: null,
  payment_status: null,
  paid_with_wallet: false,
  transfer_id: null,
  releasedAt: null,
    };
    matches.push(m);
    return reply.send({ ok: true, item: m });
  });

// ---------- MATCH: SET PRICE ----------
app.post("/matches/:id/price", { preHandler: [requireAuth] }, async (request, reply) => {
  const { id } = request.params;
  const m = ensureMatchAccess(request, reply, String(id));
  if (!m) return;

  // solo helper pu├▓ impostare prezzo
  if (String(m.helperId) !== String(request.user.id)) {
    return reply.code(403).send({ ok: false, error: "Solo lÔÇÖhelper pu├▓ impostare il prezzo" });
  }

  const priceCents = Number(request.body?.price_cents || 0);
  if (!priceCents || priceCents <= 0) return reply.code(400).send({ ok: false, error: "Prezzo non valido" });

  const feeCents = calcFeeCents(priceCents);

  m.price_cents = priceCents;
  m.fee_cents = feeCents;
  m.amount_cents = priceCents + feeCents;
  m.status = "PRICED";

  return reply.send({ ok: true, match: m });
});

// ---------- MATCH: PAY (CARD or WALLET) ----------
app.post("/matches/:id/pay", { preHandler: [requireAuth] }, async (request, reply) => {
  const { id } = request.params;
  const m = ensureMatchAccess(request, reply, String(id));
  if (!m) return;

  // solo requester pu├▓ pagare
  if (String(m.userId) !== String(request.user.id)) {
    return reply.code(403).send({ ok: false, error: "Solo il richiedente pu├▓ pagare" });
  }

  const useWallet = !!request.body?.use_wallet;

  const priceCents = Number(m.price_cents || 0);
  if (!priceCents || priceCents <= 0) return reply.code(400).send({ ok: false, error: "Prezzo non impostato" });

  const feeCents = typeof m.fee_cents === "number" ? m.fee_cents : calcFeeCents(priceCents);
  const amountCents = priceCents + feeCents;

  m.fee_cents = feeCents;
  m.amount_cents = amountCents;

  const helper = users.find((u) => String(u.id) === String(m.helperId)) || null;
  if (!helper) return reply.code(400).send({ ok: false, error: "Helper non trovato" });

  // WALLET (voucher)
  if (useWallet) {
    if (typeof request.user.walletCents !== "number") request.user.walletCents = 0;
    if (request.user.walletCents < amountCents) {
      return reply.code(400).send({ ok: false, error: "Wallet insufficiente" });
    }

    request.user.walletCents -= amountCents;

    m.paid_with_wallet = true;
    m.payment_status = "wallet_held";
    m.status = "HELD";
    m.paidAt = new Date().toISOString();

    return reply.send({
      ok: true,
      wallet_used: true,
      amount_cents: amountCents,
      match: m,
      wallet_cents: request.user.walletCents,
    });
  }

  // CARD (Stripe)
  if (!stripe) return reply.code(500).send({ ok: false, error: "Stripe non configurato" });
  if (!helper.stripeAccountId) {
    return reply.code(400).send({ ok: false, error: "Helper non ha Stripe Connect attivo" });
  }

  try {
const pi = await stripe.paymentIntents.create({
  amount: amountCents,
  currency: "eur",

  // ­ƒöÑ MOSTRA TUTTI I METODI COMPATIBILI
  automatic_payment_methods: { enabled: true },
  ...(process.env.STRIPE_PMC_ID ? { payment_method_configuration: process.env.STRIPE_PMC_ID } : {}),

  // ­ƒöÉ FONDI TRATTENUTI SULLA PIATTAFORMA
  transfer_group: `match_${String(m.id)}`,

  metadata: {
    matchId: String(m.id),
    requestId: String(m.requestId),
    userId: String(m.userId),
    helperId: String(m.helperId),
    price_cents: String(priceCents),
    fee_cents: String(feeCents),
    amount_cents: String(amountCents),
  },
});

    m.payment_intent_id = pi.id;
    m.payment_status = pi.status;
    m.status = "PAYMENT_CREATED";

    return reply.send({
      ok: true,
      clientSecret: pi.client_secret,
      amount_cents: amountCents,
      match: m,
    });
  } catch (e) {
    request.log.error(e, "Stripe create payment intent failed");
    return reply.code(500).send({ ok: false, error: e.message || "Errore Stripe" });
  }
});

// ---------- MATCH: RELEASE (CAPTURE) ----------
app.post("/matches/:id/release", { preHandler: [requireAuth] }, async (request, reply) => {
  const { id } = request.params;
  const m = ensureMatchAccess(request, reply, String(id));
  if (!m) return;

  // solo requester rilascia
  if (String(m.userId) !== String(request.user.id)) {
    return reply.code(403).send({ ok: false, error: "Solo il richiedente pu├▓ rilasciare" });
  }

  const helper = users.find((u) => String(u.id) === String(m.helperId)) || null;
  if (!helper) return reply.code(400).send({ ok: false, error: "Helper non trovato" });

  // WALLET release => prova transfer a Connect (serve balance Stripe sulla piattaforma)
  if (m.paid_with_wallet) {
    m.status = "RELEASING";

    if (stripe && helper.stripeAccountId) {
      try {
        const tr = await stripe.transfers.create({
          amount: Number(m.price_cents || 0),
          currency: "eur",
          destination: helper.stripeAccountId,
          metadata: { matchId: String(m.id), requestId: String(m.requestId) },
        });
        m.transfer_id = tr.id;
      } catch (e) {
        request.log.error(e, "Stripe transfer failed (wallet release)");
        // Se fallisce il transfer, almeno non blocchiamo UX: segnaliamo errore chiaro
        return reply.code(500).send({
          ok: false,
          error: "Transfer Stripe fallito (wallet). Serve saldo Stripe sulla piattaforma.",
        });
      }
    }

    m.payment_status = "released";
    m.status = "RELEASED";
    m.releasedAt = new Date().toISOString();
    return reply.send({ ok: true, match: m });
  }

  // CARD release => capture PaymentIntent
  if (!stripe) return reply.code(500).send({ ok: false, error: "Stripe non configurato" });
  if (!m.payment_intent_id) return reply.code(400).send({ ok: false, error: "Pagamento non avviato" });

   try {
    const pi = await stripe.paymentIntents.retrieve(m.payment_intent_id);

    if (pi.status !== "succeeded") {
      return reply.code(400).send({
        ok: false,
        error: `Pagamento non completato (status: ${pi.status})`,
      });
    }

    if (!helper.stripeAccountId) {
      return reply.code(400).send({ ok: false, error: "Helper non ha Stripe Connect attivo" });
    }

    // ­ƒÆ© trasferisci SOLO il prezzo allÔÇÖhelper (la fee resta alla piattaforma)
    const tr = await stripe.transfers.create({
      amount: Number(m.price_cents || 0),
      currency: "eur",
      destination: helper.stripeAccountId,
      transfer_group: `match_${String(m.id)}`,
source_transaction: pi.latest_charge,
      metadata: { matchId: String(m.id), requestId: String(m.requestId) },
    });

    m.transfer_id = tr.id;
    m.status = "RELEASED";
    m.payment_status = "released";
    m.releasedAt = new Date().toISOString();

    return reply.send({ ok: true, match: m });
  } catch (e) {
    request.log.error(e, "Stripe release failed");
    return reply.code(500).send({ ok: false, error: e.message || "Errore rilascio pagamento" });
  }
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
