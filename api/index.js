"use strict";

require("dotenv").config();
const { randomUUID, randomBytes, createHash } = require("crypto");

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

const { Pool } = require("pg");

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      // Se ti esplode con "SSL/TLS required", lascia questo:
      ssl: { rejectUnauthorized: false },
    })
  : null;

async function db(text, params) {
  if (!pool) throw new Error("DATABASE_URL mancante");
  return pool.query(text, params);
}

async function initDb() {
  // USERS
  await db(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      phone TEXT,
      password_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      stripe_account_id TEXT,
      wallet_cents INTEGER NOT NULL DEFAULT 0,
      trust_points NUMERIC(12,2) NOT NULL DEFAULT 0,
email_verified BOOLEAN NOT NULL DEFAULT false,
email_verify_token TEXT,
email_verify_expires TIMESTAMPTZ
    );
  `);

  // MIGRATION: colonne nuove (safe su DB già esistenti)
  await db(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trust_points NUMERIC(12,2) NOT NULL DEFAULT 0;`);
// MIGRATION: consenti decimali sui trust points
await db(`ALTER TABLE users ALTER COLUMN trust_points TYPE NUMERIC(12,2) USING trust_points::numeric;`);
  await db(`ALTER TABLE users ADD COLUMN IF NOT EXISTS work_points INTEGER NOT NULL DEFAULT 0;`);
await db(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;`);
await db(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token TEXT;`);
await db(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_expires TIMESTAMPTZ;`);
await db(`CREATE INDEX IF NOT EXISTS users_email_verify_token_idx ON users (email_verify_token) WHERE email_verify_token IS NOT NULL;`);

  // Email unique (case-insensitive) – semplice: indice su lower(email)
  await db(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uniq ON users (lower(email)) WHERE email IS NOT NULL;`);
  await db(`CREATE UNIQUE INDEX IF NOT EXISTS users_phone_uniq ON users (phone) WHERE phone IS NOT NULL;`);

  // REQUESTS
  await db(`
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      city TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      status TEXT NOT NULL DEFAULT 'OPEN'
    );
  `);
  await db(`CREATE INDEX IF NOT EXISTS requests_status_created_idx ON requests (status, created_at DESC);`);

  // MATCHES (1 match per request)
  await db(`
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      helper_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

      status TEXT NOT NULL DEFAULT 'ACCEPTED',
      price_cents INTEGER,
      fee_cents INTEGER,
      amount_cents INTEGER,
      payment_intent_id TEXT,
      payment_status TEXT,
      paid_with_wallet BOOLEAN NOT NULL DEFAULT false,
      paid_at TIMESTAMPTZ,
      transfer_id TEXT,
      released_at TIMESTAMPTZ,
      voucher_code TEXT,
      voucher_cents INTEGER NOT NULL DEFAULT 0,
      helper_payout_mode TEXT NOT NULL DEFAULT 'cash'
    );
  `);

  // MIGRATION: colonne nuove (safe su DB già esistenti)
  await db(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS voucher_code TEXT;`);
  await db(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS voucher_cents INTEGER NOT NULL DEFAULT 0;`);
// prima: DEFAULT 'cash'
await db(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS helper_payout_mode TEXT NOT NULL DEFAULT 'unset';`);
await db(`ALTER TABLE matches ALTER COLUMN helper_payout_mode SET DEFAULT 'unset';`);

  await db(`CREATE UNIQUE INDEX IF NOT EXISTS matches_request_uniq ON matches (request_id);`);
  await db(`CREATE INDEX IF NOT EXISTS matches_user_idx ON matches (user_id);`);
  await db(`CREATE INDEX IF NOT EXISTS matches_helper_idx ON matches (helper_id);`);

  // VOUCHERS (anagrafica codici: puoi crearli da DB via /admin/vouchers/*)
  await db(`
    CREATE TABLE IF NOT EXISTS vouchers (
      code TEXT PRIMARY KEY,
      cents INTEGER NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      assigned_phone TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at TIMESTAMPTZ
    );
  `);

  // MIGRATION safe
  await db(`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;`);
  await db(`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS assigned_phone TEXT;`);
  await db(`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;`);
  await db(`CREATE INDEX IF NOT EXISTS vouchers_assigned_phone_idx ON vouchers (assigned_phone) WHERE assigned_phone IS NOT NULL;`);

  // Seed opzionale: porta dentro i voucher definiti in ENV (VOUCHERS=CODE:cents,...) se mancano
  // Nota: questi sono codici singoli (non "riutilizzabili"): crea codici univoci se vuoi regalarli a più persone.
  for (const [code, cents] of voucherMap.entries()) {
    const c = Number(cents || 0);
    if (c > 0) {
      await db(
        `INSERT INTO vouchers (code, cents, is_active)
         VALUES ($1, $2, true)
         ON CONFLICT (code) DO UPDATE SET cents=EXCLUDED.cents`,
        [String(code).toUpperCase(), c]
      );
    }
  }

  // VOUCHER REDEMPTIONS (reservation + single-use)
  await db(`
    CREATE TABLE IF NOT EXISTS voucher_redemptions (
      code TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
      cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'reserved',
      reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      redeemed_at TIMESTAMPTZ
    );
  `);

  // MIGRATION safe (DB già in prod)
  await db(`ALTER TABLE voucher_redemptions ADD COLUMN IF NOT EXISTS match_id TEXT;`);
  await db(`ALTER TABLE voucher_redemptions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'reserved';`);
  await db(`ALTER TABLE voucher_redemptions ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ NOT NULL DEFAULT now();`);
  await db(`ALTER TABLE voucher_redemptions ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ;`);
  await db(`ALTER TABLE voucher_redemptions ALTER COLUMN redeemed_at DROP NOT NULL;`);
  await db(`ALTER TABLE voucher_redemptions ALTER COLUMN redeemed_at DROP DEFAULT;`);

  await db(`CREATE INDEX IF NOT EXISTS voucher_redemptions_match_idx ON voucher_redemptions (match_id) WHERE match_id IS NOT NULL;`);
  await db(`CREATE INDEX IF NOT EXISTS voucher_redemptions_user_idx ON voucher_redemptions (user_id);`);

  // MESSAGES
  await db(`
    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db(`CREATE INDEX IF NOT EXISTS messages_match_created_idx ON messages (match_id, created_at);`);
}

// ---------------- TWILIO ENV (COMPAT) ----------------
// Supporta sia i nomi "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN"
// sia i nomi "TWILIO_SID / TWILIO_TOKEN"
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_TOKEN || "";
const TWILIO_FROM = process.env.TWILIO_FROM || "";
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID || "";

// ---------------- IN-MEMORY STORE (DEMO) ----------------
// In produzione: sostituisci con DB vero (Postgres/Mongo ecc.)
const smsCodes = new Map(); // phone -> { code, expiresAt }
const emailCodes = new Map(); // email -> { code, expiresAt }

// ---------------- ENV ----------------
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const STREAM_API_KEY = process.env.STREAM_API_KEY || "";
const STREAM_API_SECRET = process.env.STREAM_API_SECRET || "";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "";
const VOUCHER_RESERVATION_MINUTES = Number(process.env.VOUCHER_RESERVATION_MINUTES || 60);

// ---------------- PAY CONFIG ----------------
const PLATFORM_FEE_BPS = Number(process.env.PLATFORM_FEE_BPS || 1500); // 1500 = 15%
const PLATFORM_FEE_FIXED_CENTS = Number(process.env.PLATFORM_FEE_FIXED_CENTS || 49); // 49 = Ôé¼0,49
const VOUCHERS_RAW = process.env.VOUCHERS || "WELCOME10:1000,PROMO25:2500"; // CODE:cents,...
const voucherMap = new Map(
  VOUCHERS_RAW.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [code, cents] = pair.split(":").map((x) => String(x || "").trim());
      return [code.toUpperCase(), Number(cents || 0)];
    })
);

function calcFeeCents(priceCents) {
  const p = Number(priceCents || 0);
  if (!p || p <= 0) return 0;

  const percent = Math.round((p * PLATFORM_FEE_BPS) / 10000);
  const fixed = Math.max(0, Number(PLATFORM_FEE_FIXED_CENTS || 0));

  return Math.max(0, percent + fixed);
}

// ---------------- HELPERS ----------------
async function computeHelperPoints(helperId) {
  // se DB non c'è, non blocco login
  if (!pool) {
    return { work_points: 0, voucher_points: 0, trust_points_total: 0 };
  }

  const hid = String(helperId || "");

  const { rows } = await db(
    `
    SELECT
      COALESCE(SUM(price_cents / 1000), 0)::int AS work_points,
      COALESCE(SUM(
        CASE
          WHEN lower(COALESCE(helper_payout_mode,'cash')) = 'trust'
          THEN ROUND(COALESCE(voucher_cents,0) / 100.0)
          ELSE 0
        END
      ), 0)::int AS voucher_points
    FROM matches
    WHERE helper_id = $1
      AND upper(status) = 'RELEASED'
    `,
    [hid]
  );

  const work = Number(rows[0]?.work_points || 0);
  const voucher = Number(rows[0]?.voucher_points || 0);

  return { work_points: work, voucher_points: voucher, trust_points_total: work + voucher };
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email || null,
    phone: u.phone || null,
    createdAt: u.createdAt || u.created_at || null,
    stripe_account_id: u.stripeAccountId || u.stripe_account_id || null,
    trust_points: Number(u.trustPoints ?? u.trust_points ?? 0),
  };
}

async function requireAuth(request, reply) {
  const auth = String(request.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return reply.code(401).send({ ok: false, error: "Token mancante" });

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return reply.code(401).send({ ok: false, error: "Token non valido" });
  }

  if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });

  const { rows } = await db(
    "SELECT id,email,phone,created_at,stripe_account_id,wallet_cents,trust_points,work_points FROM users WHERE id=$1 LIMIT 1",
    [payload.id]
  );

  const u = rows[0];
  if (!u) return reply.code(401).send({ ok: false, error: "Utente non valido" });

  request.user = {
    id: u.id,
    email: u.email,
    phone: u.phone,
    createdAt: u.created_at,
    stripeAccountId: u.stripe_account_id,
    walletCents: Number(u.wallet_cents || 0),
    trustPoints: Number(u.trust_points || 0),
    workPoints: Number(u.work_points || 0),
  };
}

function requireAdmin(request, reply) {
  const secret = String(request.headers["x-admin-secret"] || "").trim();
  if (!ADMIN_SECRET || secret !== String(ADMIN_SECRET)) {
    reply.code(401).send({ ok: false, error: "Admin non autorizzato" });
    return false;
  }
  return true;
}

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizePhone(input) {
  let p = String(input || "").trim();
  if (!p) return "";

  // leva spazi, trattini, parentesi ecc.
  p = p.replace(/[^\d+]/g, "");

  // 00xx -> +xx
  if (p.startsWith("00")) p = "+" + p.slice(2);

  // se ha +, tieni solo + e cifre
  if (p.startsWith("+")) return "+" + p.slice(1).replace(/\D/g, "");

  const digits = p.replace(/\D/g, "");
  if (!digits) return "";

  // default IT (se inseriscono 10 cifre nude)
  if (digits.length === 10) return "+39" + digits;

  // se mettono 39xxxxxxxxxx senza +
  if (digits.startsWith("39") && digits.length === 12) return "+" + digits;

  return "+" + digits;
}

async function ensureMatchAccess(request, reply, matchId) {
  if (!pool) {
    reply.code(500).send({ ok: false, error: "Database non configurato." });
    return null;
  }

  const { rows } = await db("SELECT * FROM matches WHERE id=$1 LIMIT 1", [String(matchId)]);
  const row = rows[0];

  if (!row) {
    reply.code(404).send({ ok: false, error: "Match non trovato" });
    return null;
  }

  const isUser = String(row.user_id) === String(request.user.id);
  const isHelper = String(row.helper_id) === String(request.user.id);

  if (!isUser && !isHelper) {
    reply.code(403).send({ ok: false, error: "Accesso negato" });
    return null;
  }

  // normalizzo in camelCase per il resto del codice
  return {
    id: row.id,
    requestId: row.request_id,
    userId: row.user_id,
    helperId: row.helper_id,
    createdAt: row.created_at,
    status: row.status,
    price_cents: row.price_cents,
    fee_cents: row.fee_cents,
    amount_cents: row.amount_cents,
    payment_intent_id: row.payment_intent_id,
    payment_status: row.payment_status,
    paid_with_wallet: row.paid_with_wallet,
    paidAt: row.paid_at,
    transfer_id: row.transfer_id,
    releasedAt: row.released_at,
  };
}

function safeNameForStream(user) {
  if (user.email) return user.email.split("@")[0];
  if (user.phone) return user.phone.replace(/\D/g, "").slice(-6);
  return "user";
}

async function start() {
  const app = fastify({ logger: true });

// DB init (se DATABASE_URL è presente)
if (pool) {
  await initDb();
  app.log.info("DB ready");
}

 const ALLOWED_ORIGINS = new Set([
  "https://www.wetrust.club",
  "https://wetrust.club",
  "https://wetrust-frontend.onrender.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

await app.register(cors, {
  origin: (origin, cb) => {
    try {
      // chiamate server-to-server / curl non hanno Origin
      if (!origin) return cb(null, true);

      if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);

      // consenti automaticamente i deploy Vercel (*.vercel.app)
      const host = new URL(origin).hostname;
      if (host.endsWith(".vercel.app")) return cb(null, true);

      return cb(null, false);
    } catch {
      return cb(null, false);
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-admin-secret"],
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

const WEB_BASE_URL = process.env.WEB_BASE_URL || "http://wetrust.club";

function hashToken(t) {
  return createHash("sha256").update(String(t)).digest("hex");
}

function newVerifyToken() {
  return randomBytes(32).toString("hex");
}

async function sendVerifyEmail(toEmail, tokenPlain) {
  if (!transporter) throw new Error("SMTP non configurato: impossibile inviare email di verifica.");

  const link = `${WEB_BASE_URL}/login?verify=${encodeURIComponent(tokenPlain)}`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: "WeTrust — Verify your email",
    html: `
      <div style="font-family:system-ui,Segoe UI,Roboto,Arial;">
        <h2>Verifica la tua email</h2>
        <p>Per completare la registrazione, clicca il pulsante qui sotto:</p>
        <p>
          <a href="${link}"
             style="display:inline-block;padding:12px 18px;border-radius:10px;
                    background:#00b4ff;color:#020617;text-decoration:none;font-weight:800;">
            VERIFY NOW
          </a>
        </p>
        <p style="opacity:.7;font-size:12px;">Se non hai richiesto tu, ignora questa email.</p>
      </div>
    `,
  });
}

// Twilio (opzionale)
const twilioClient = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

  // Stripe (opzionale)
  const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

  // Stream (opzionale)
  const stream =
    STREAM_API_KEY && STREAM_API_SECRET ? StreamChat.getInstance(STREAM_API_KEY, STREAM_API_SECRET) : null;

// ---------- CHAT MESSAGES (in-memory demo) ----------
app.get("/matches/:id/messages", { preHandler: [requireAuth] }, async (request, reply) => {
  const { id } = request.params;

  const m = await ensureMatchAccess(request, reply, String(id));
  if (!m) return;

  const { rows } = await db(
    `SELECT id, match_id, user_id, text, created_at
     FROM messages
     WHERE match_id=$1
     ORDER BY created_at ASC`,
    [String(m.id)]
  );

  const messages = rows.map((r) => ({
    id: String(r.id),
    matchId: r.match_id,
    userId: r.user_id,
    text: r.text,
    createdAt: r.created_at,
  }));

  return reply.send({ ok: true, messages });
});

app.post("/matches/:id/messages", { preHandler: [requireAuth] }, async (request, reply) => {
  const { id } = request.params;

  const m = await ensureMatchAccess(request, reply, String(id));
  if (!m) return;

  const text = String(request.body?.text || "").trim();
  if (!text) return reply.code(400).send({ ok: false, error: "Testo mancante" });

  const ins = await db(
    `INSERT INTO messages (match_id, user_id, text)
     VALUES ($1,$2,$3)
     RETURNING id, match_id, user_id, text, created_at`,
    [String(m.id), String(request.user.id), text]
  );

  const r = ins.rows[0];

  return reply.send({
    ok: true,
    message: {
      id: String(r.id),
      matchId: r.match_id,
      userId: r.user_id,
      text: r.text,
      createdAt: r.created_at,
    },
  });
});

  // ---------------- ROUTES ----------------
  // UNICA route /health (niente duplicati!)
  app.get("/health", async () => ({ ok: true, status: "ok" }));

app.get("/me", { preHandler: [requireAuth] }, async (request) => {
  // Nel profilo servono solo trust_points e wallet_cents (no più work/total)
  return { ok: true, user: publicUser(request.user) };
});

// ---------- WALLET ----------
app.get("/wallet", { preHandler: [requireAuth] }, async (request) => {
  const { rows } = await db("SELECT wallet_cents FROM users WHERE id=$1", [request.user.id]);
  return { ok: true, wallet_cents: Number(rows[0]?.wallet_cents || 0) };
});

// ---------- VOUCHERS ----------
// ---------- ADMIN: VOUCHERS (crea / disattiva / riattiva) ----------
// Protezione: header x-admin-secret: <ADMIN_SECRET>
app.post("/admin/vouchers/create", async (request, reply) => {
  if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });
  if (!requireAdmin(request, reply)) return;

  const codeRaw = String(request.body?.code || "").trim();
  const cents = Number(request.body?.cents || 0);
  const assignedPhoneRaw = String(request.body?.assigned_phone || request.body?.assignedPhone || "").trim();

  if (!codeRaw) return reply.code(400).send({ ok: false, error: "code obbligatorio" });
  if (!Number.isFinite(cents) || cents <= 0) return reply.code(400).send({ ok: false, error: "cents non valido" });

  const code = codeRaw.toUpperCase();
  const assigned_phone = assignedPhoneRaw || null;

  const { rows } = await db(
    `INSERT INTO vouchers (code, cents, is_active, assigned_phone)
     VALUES ($1, $2, true, $3)
     ON CONFLICT (code) DO UPDATE
       SET cents=EXCLUDED.cents,
           is_active=true,
           assigned_phone=EXCLUDED.assigned_phone,
           revoked_at=NULL
     RETURNING code, cents, is_active, assigned_phone, created_at, revoked_at`,
    [code, cents, assigned_phone]
  );

  return reply.send({ ok: true, voucher: rows[0] });
});

app.post("/admin/vouchers/revoke", async (request, reply) => {
  if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });
  if (!requireAdmin(request, reply)) return;

  const codeRaw = String(request.body?.code || "").trim();
  if (!codeRaw) return reply.code(400).send({ ok: false, error: "code obbligatorio" });

  const code = codeRaw.toUpperCase();
  const { rows } = await db(
    `UPDATE vouchers
     SET is_active=false, revoked_at=now()
     WHERE code=$1
     RETURNING code, cents, is_active, assigned_phone, created_at, revoked_at`,
    [code]
  );

  if (!rows[0]) return reply.code(404).send({ ok: false, error: "Voucher non trovato" });
  return reply.send({ ok: true, voucher: rows[0] });
});

app.post("/admin/vouchers/activate", async (request, reply) => {
  if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });
  if (!requireAdmin(request, reply)) return;

  const codeRaw = String(request.body?.code || "").trim();
  if (!codeRaw) return reply.code(400).send({ ok: false, error: "code obbligatorio" });

  const code = codeRaw.toUpperCase();
  const { rows } = await db(
    `UPDATE vouchers
     SET is_active=true, revoked_at=NULL
     WHERE code=$1
     RETURNING code, cents, is_active, assigned_phone, created_at, revoked_at`,
    [code]
  );

  if (!rows[0]) return reply.code(404).send({ ok: false, error: "Voucher non trovato" });
  return reply.send({ ok: true, voucher: rows[0] });
});

app.post("/vouchers/redeem", { preHandler: [requireAuth] }, async (request, reply) => {
  const codeRaw = String(request.body?.code || "").trim();
  if (!codeRaw) return reply.code(400).send({ ok: false, error: "Codice obbligatorio" });

  if (!pool) {
    return reply.code(500).send({ ok: false, error: "Database non configurato." });
  }

  const code = codeRaw.toUpperCase();
  const userPhone = String(request.user.phone || "").trim();

  // (anti-abuso) per usare un voucher devi avere un telefono verificato (account unico per phone)
  if (!userPhone) {
    return reply.code(400).send({ ok: false, error: "Per usare un voucher devi verificare il telefono (login SMS)." });
  }
  // Valore voucher: prima DB (vouchers), fallback ENV (voucherMap)
  let cents = 0;
  const vdb = await db("SELECT cents, is_active, assigned_phone FROM vouchers WHERE code=$1 LIMIT 1", [code]);
  if (vdb.rows[0]) {
    const v = vdb.rows[0];
    if (v.is_active === false) return reply.code(400).send({ ok: false, error: "Voucher disattivato" });
    if (v.assigned_phone && String(v.assigned_phone).trim() !== userPhone) {
      return reply.code(403).send({ ok: false, error: "Voucher non valido per questo numero" });
    }
    cents = Number(v.cents || 0);
  } else {
    cents = Number(voucherMap.get(code) || 0);
  }

  if (!cents || cents <= 0) {
    return reply.code(400).send({ ok: false, error: "Voucher non valido" });
  }

  try {
    await db("BEGIN");

    // 1) registra uso voucher (1 sola volta per codice) -> qui è subito REDEEMED perché stai accreditando wallet
    const ins = await db(
      `INSERT INTO voucher_redemptions (code, user_id, match_id, cents, status, reserved_at, redeemed_at)
       VALUES ($1, $2, NULL, $3, 'redeemed', now(), now())
       ON CONFLICT (code) DO NOTHING
       RETURNING code`,
      [code, request.user.id, cents]
    );

    if (ins.rowCount === 0) {
      await db("ROLLBACK");
      return reply.code(400).send({ ok: false, error: "Voucher già usato o in uso" });
    }

    // 2) incrementa wallet dell'utente in modo atomico
    const up = await db(
      `UPDATE users
       SET wallet_cents = wallet_cents + $1
       WHERE id = $2
       RETURNING wallet_cents`,
      [cents, request.user.id]
    );

    await db("COMMIT");

    return reply.send({
      ok: true,
      added_cents: cents,
      wallet_cents: Number(up.rows[0]?.wallet_cents || 0),
    });
  } catch (e) {
    try {
      await db("ROLLBACK");
    } catch {}
    return reply.code(500).send({ ok: false, error: "Errore voucher" });
  }
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
    // 1) se l'utente ha giá un account Stripe, riusalo
    let accountId = request.user.stripeAccountId;

    // 2) altrimenti crealo
    if (!accountId) {
      const acct = await stripe.accounts.create({
        type: "express",
        email: request.user.email || undefined,
        capabilities: { transfers: { requested: true } },
      });
      accountId = acct.id;
      await db("UPDATE users SET stripe_account_id=$1 WHERE id=$2", [accountId, request.user.id]);
request.user.stripeAccountId = accountId; // ok tenerla per la risposta
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

   const { rows } = await db("SELECT id,email,stripe_account_id FROM users WHERE id=$1", [request.user.id]);
const user = rows[0];
if (!user) return reply.code(401).send({ ok: false, error: "Utente non trovato" });

let accountId = user.stripe_account_id;

    if (!accountId) {
      const acc = await stripe.accounts.create({
        type: "express",
        email: user.email || undefined,
        capabilities: { transfers: { requested: true } },
      });
      accountId = acc.id;
      await db("UPDATE users SET stripe_account_id=$1 WHERE id=$2", [accountId, request.user.id]);
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
  try {
    if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });

    const email = String(request.body?.email || "").trim().toLowerCase();
    const password = String(request.body?.password || "");

    if (!email || !password) {
      return reply.code(400).send({ ok: false, error: "Email e password richieste." });
    }

    if (!transporter) {
      return reply.code(500).send({ ok: false, error: "SMTP non configurato: impossibile inviare email di verifica." });
    }

    const ex = await db(
      "SELECT id, email, email_verified, password_hash, created_at FROM users WHERE lower(email)=lower($1) LIMIT 1",
      [email]
    );

    // ESISTE GIÀ
    if (ex.rows[0]) {
      const u = ex.rows[0];

      if (u.email_verified === true) {
        return reply.code(409).send({ ok: false, error: "Email già registrata." });
      }

      // NON verificata: reinvio SOLO se password corretta
      if (!u.password_hash) {
        return reply.code(400).send({ ok: false, error: "Account incompleto. Contatta il supporto." });
      }

      const ok = await bcrypt.compare(String(password), String(u.password_hash));
      if (!ok) return reply.code(401).send({ ok: false, error: "Credenziali errate." });

      const tokenPlain = newVerifyToken();
      const tokenHash = hashToken(tokenPlain);

      await db(
        `UPDATE users
         SET email_verify_token=$1,
             email_verify_expires=now() + interval '24 hours'
         WHERE id=$2`,
        [tokenHash, String(u.id)]
      );

      await sendVerifyEmail(email, tokenPlain);

      return reply.send({
        ok: true,
        needs_verification: true,
        resent: true,
        user: { id: u.id, email: u.email, createdAt: u.created_at },
      });
    }

    // NUOVO UTENTE
    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    const tokenPlain = newVerifyToken();
    const tokenHash = hashToken(tokenPlain);

    const q = await db(
      `INSERT INTO users (id, email, password_hash, email_verified, email_verify_token, email_verify_expires)
       VALUES ($1,$2,$3,false,$4, now() + interval '24 hours')
       RETURNING id, email, created_at`,
      [id, email, passwordHash, tokenHash]
    );

    await sendVerifyEmail(email, tokenPlain);

    return reply.send({
      ok: true,
      needs_verification: true,
      user: { id: q.rows[0].id, email: q.rows[0].email, createdAt: q.rows[0].created_at },
    });
  } catch (e) {
    request.log.error(e, "email register failed");
    return reply.code(500).send({ ok: false, error: e?.message || "Errore registrazione" });
  }
});

  // ---------- AUTH: EMAIL LOGIN ----------
 app.post("/auth/email/login", async (request, reply) => {
  const { email, password } = request.body || {};
  if (!email || !password) return reply.code(400).send({ ok: false, error: "Email e password obbligatori." });

  const cleanEmail = String(email).trim().toLowerCase();
  if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });

  const { rows } = await db(
    "SELECT id,email,password_hash,phone,created_at,stripe_account_id,wallet_cents,email_verified FROM users WHERE lower(email)=lower($1) LIMIT 1",
    [cleanEmail]
  );

  const u = rows[0];
  if (!u || !u.password_hash) return reply.code(401).send({ ok: false, error: "Credenziali errate." });

  const ok = await bcrypt.compare(String(password), String(u.password_hash));
  if (!ok) return reply.code(401).send({ ok: false, error: "Credenziali errate." });

  if (u.email_verified === false) {
    return reply.code(403).send({
      ok: false,
      code: "EMAIL_NOT_VERIFIED",
      error: "Email non verificata. Vai su Registrati per reinviare la mail di verifica.",
    });
  }

  const token = signToken({ id: u.id });

  return reply.send({
    ok: true,
    token,
    user: {
      id: u.id,
      email: u.email,
      phone: u.phone,
      createdAt: u.created_at,
      stripeAccountId: u.stripe_account_id,
      wallet_cents: u.wallet_cents,
      email_verified: u.email_verified,
    },
  });
});

// ---------- AUTH: EMAIL VERIFY LINK ----------
app.post("/auth/email/verify-link", async (request, reply) => {
  try {
    if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });

    const tokenPlain = String(request.body?.token || "").trim();
    if (!tokenPlain) return reply.code(400).send({ ok: false, error: "Token mancante." });

    const tokenHash = hashToken(tokenPlain);

    const { rows } = await db(
      `UPDATE users
       SET email_verified=true,
           email_verify_token=NULL,
           email_verify_expires=NULL
       WHERE email_verify_token=$1
         AND (email_verify_expires IS NULL OR email_verify_expires > now())
       RETURNING id, email, phone, created_at, stripe_account_id, wallet_cents, email_verified`,
      [tokenHash]
    );

    if (!rows[0]) {
      return reply.code(400).send({ ok: false, error: "Link non valido o scaduto." });
    }

    const u = rows[0];
    const token = signToken({ id: u.id });

    return reply.send({
      ok: true,
      verified: true,
      token,
      user: {
        id: u.id,
        email: u.email,
        phone: u.phone,
        createdAt: u.created_at,
        stripeAccountId: u.stripe_account_id,
        wallet_cents: u.wallet_cents,
        email_verified: u.email_verified,
      },
    });
  } catch (e) {
    request.log.error(e, "verify link failed");
    return reply.code(500).send({ ok: false, error: e?.message || "Errore verifica email" });
  }
});

 // ---------- AUTH: SMS SEND CODE ----------
app.post("/auth/sms/send", async (request, reply) => {
  const { phone } = request.body || {};
 const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) return reply.code(400).send({ ok: false, error: "Numero richiesto." });

  // Se Verify è configurato, usa Verify (OTP serio, niente codice in RAM)
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

  // per debug/dev: ritorno il codice se Twilio non è configurato
  return reply.send({ ok: true, sent: true, devCode: twilioClient ? undefined : code });
});

  // ---------- AUTH: SMS VERIFY ----------
app.post("/auth/sms/verify", async (request, reply) => {
  const { phone, code } = request.body || {};
  const cleanPhone = normalizePhone(phone);
  const cleanCode = String(code || "").trim();

  if (!cleanPhone) return reply.code(400).send({ ok: false, error: "Numero richiesto." });
  if (!cleanCode) return reply.code(400).send({ ok: false, error: "Codice richiesto." });
  if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });

  // Se Verify è configurato, verifica tramite Twilio Verify
  if (twilioClient && TWILIO_VERIFY_SERVICE_SID) {
    try {
      const check = await twilioClient.verify.v2
        .services(TWILIO_VERIFY_SERVICE_SID)
        .verificationChecks.create({ to: cleanPhone, code: cleanCode });

      if (check.status !== "approved") {
        return reply.code(400).send({ ok: false, error: "Codice errato o scaduto." });
      }

      // upsert user su DB
      let u;
      const sel = await db(
        "SELECT id,email,phone,created_at,stripe_account_id,wallet_cents FROM users WHERE phone=$1 LIMIT 1",
        [cleanPhone]
      );
      u = sel.rows[0];

      if (!u) {
       const id = randomUUID();
        try {
          const ins = await db(
            `INSERT INTO users (id, phone)
             VALUES ($1, $2)
             RETURNING id,email,phone,created_at,stripe_account_id,wallet_cents`,
            [id, cleanPhone]
          );
          u = ins.rows[0];
        } catch (e) {
          // se due request in parallelo: reselect
          const again = await db(
            "SELECT id,email,phone,created_at,stripe_account_id,wallet_cents FROM users WHERE phone=$1 LIMIT 1",
            [cleanPhone]
          );
          u = again.rows[0];
        }
      }

      const token = signToken({ id: u.id });
      return reply.send({
        ok: true,
        token,
        user: { id: u.id, email: u.email, phone: u.phone, createdAt: u.created_at, stripe_account_id: u.stripe_account_id || null },
      });
    } catch (e) {
      request.log.error(e, "Twilio Verify check failed");
      return reply.code(500).send({ ok: false, error: e.message || "Errore verifica SMS (Verify)." });
    }
  }

  // Fallback: vecchia logica in memoria (verifica codice), ma SALVATAGGIO utente su DB
  const entry = smsCodes.get(cleanPhone);
  if (!entry || entry.expiresAt < Date.now()) return reply.code(400).send({ ok: false, error: "Codice scaduto." });
  if (entry.code !== cleanCode) return reply.code(400).send({ ok: false, error: "Codice errato." });

  smsCodes.delete(cleanPhone);

  let u;
  const sel = await db(
    "SELECT id,email,phone,created_at,stripe_account_id,wallet_cents FROM users WHERE phone=$1 LIMIT 1",
    [cleanPhone]
  );
  u = sel.rows[0];

  if (!u) {
    const id = randomUUID();
    try {
      const ins = await db(
        `INSERT INTO users (id, phone)
         VALUES ($1, $2)
         RETURNING id,email,phone,created_at,stripe_account_id,wallet_cents`,
        [id, cleanPhone]
      );
      u = ins.rows[0];
    } catch (e) {
      const again = await db(
        "SELECT id,email,phone,created_at,stripe_account_id,wallet_cents FROM users WHERE phone=$1 LIMIT 1",
        [cleanPhone]
      );
      u = again.rows[0];
    }
  }

  const token = signToken({ id: u.id });
  return reply.send({
    ok: true,
    token,
    user: { id: u.id, email: u.email, phone: u.phone, createdAt: u.created_at, stripe_account_id: u.stripe_account_id || null },
  });
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

  if (!cleanEmail.includes("@")) return reply.code(400).send({ ok: false, error: "Email non valida." });
  if (!cleanCode) return reply.code(400).send({ ok: false, error: "Codice richiesto." });
  if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });

  const entry = emailCodes.get(cleanEmail);
  if (!entry || entry.expiresAt < Date.now()) return reply.code(400).send({ ok: false, error: "Codice scaduto." });
  if (entry.code !== cleanCode) return reply.code(400).send({ ok: false, error: "Codice errato." });

  emailCodes.delete(cleanEmail);

  // trova o crea utente su DB
  let u;
  const sel = await db(
    "SELECT id,email,phone,created_at,stripe_account_id,wallet_cents FROM users WHERE lower(email)=lower($1) LIMIT 1",
    [cleanEmail]
  );
  u = sel.rows[0];

  if (!u) {
    const id = randomUUID();
    try {
      const ins = await db(
        `INSERT INTO users (id, email)
         VALUES ($1, $2)
         RETURNING id,email,phone,created_at,stripe_account_id,wallet_cents`,
        [id, cleanEmail]
      );
      u = ins.rows[0];
    } catch (e) {
      // se già inserita in parallelo
      const again = await db(
        "SELECT id,email,phone,created_at,stripe_account_id,wallet_cents FROM users WHERE lower(email)=lower($1) LIMIT 1",
        [cleanEmail]
      );
      u = again.rows[0];
    }
  }

  const token = signToken({ id: u.id });
  return reply.send({
    ok: true,
    token,
    user: { id: u.id, email: u.email, phone: u.phone, createdAt: u.created_at, stripe_account_id: u.stripe_account_id || null },
  });
});

 // ---------------- REQUESTS ----------------

// FEED protetto (usato dalla pagina /requests del frontend)
app.get("/requests/feed", { preHandler: [requireAuth] }, async (request, reply) => {
  if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });

  const { rows } = await db(
    "SELECT id,user_id,title,description,city,created_at,status FROM requests WHERE COALESCE(UPPER(status),'') <> 'RELEASED' ORDER BY created_at DESC"
  );

  const list = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    title: r.title,
    description: r.description,
    city: r.city,
    createdAt: r.created_at,
    status: r.status,
  }));

  return reply.send({ ok: true, items: list, requests: list });
});

// Pubblico: solo OPEN (se ti serve ancora da qualche parte)
app.get("/requests", async (request, reply) => {
  if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });

  const { rows } = await db(
    "SELECT id,user_id,title,description,city,created_at,status FROM requests WHERE UPPER(status) <> 'RELEASED' ORDER BY created_at DESC"
  );

  const list = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    title: r.title,
    description: r.description,
    city: r.city,
    createdAt: r.created_at,
    status: r.status,
  }));

  return reply.send({ ok: true, items: list, requests: list });
});

// CREA richiesta (bottone "I need" fa POST /requests)
app.post("/requests", { preHandler: [requireAuth] }, async (request, reply) => {
  if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });

  const title = String(request.body?.title || "").trim();
  const description = String(request.body?.description || "").trim();
  const city = String(request.body?.city || "").trim();

  if (!title) return reply.code(400).send({ ok: false, error: "Titolo obbligatorio" });
  if (!description) return reply.code(400).send({ ok: false, error: "Descrizione obbligatoria" });

  const id = randomUUID();
  const uid = String(request.user.id);

  const ins = await db(
    `INSERT INTO requests (id, user_id, title, description, city, status)
     VALUES ($1,$2,$3,$4,$5,'OPEN')
     RETURNING id,user_id,title,description,city,created_at,status`,
    [id, uid, title, description, city || null]
  );

  const r = ins.rows[0];
  return reply.send({
    ok: true,
    request: {
      id: r.id,
      userId: r.user_id,
      title: r.title,
      description: r.description,
      city: r.city,
      createdAt: r.created_at,
      status: r.status,
    },
  });
});

// ACCEPT (la pagina /requests fa POST /requests/:id/accept)
app.post("/requests/:id/accept", { preHandler: [requireAuth] }, async (request, reply) => {
  if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });

  const requestId = String(request.params.id);
  const helperId = String(request.user.id);

  try {
    await db("BEGIN");

    // blocca la richiesta per evitare race
    const rq = await db("SELECT * FROM requests WHERE id=$1 FOR UPDATE", [requestId]);
    const r = rq.rows[0];

    if (!r) {
      await db("ROLLBACK");
      return reply.code(404).send({ ok: false, error: "Richiesta non trovata" });
    }

    if (String(r.status).toUpperCase() !== "OPEN") {
      await db("ROLLBACK");
      return reply.code(409).send({ ok: false, error: "Richiesta non disponibile" });
    }

    if (String(r.user_id) === helperId) {
      await db("ROLLBACK");
      return reply.code(400).send({ ok: false, error: "Non puoi accettare la tua richiesta" });
    }

    // idempotenza: se un match esiste già, ritorna quello
    const existing = await db("SELECT * FROM matches WHERE request_id=$1 LIMIT 1", [requestId]);
    if (existing.rows[0]) {
      await db("COMMIT");
      return reply.send({ ok: true, match: { id: existing.rows[0].id } });
    }

    const matchId = randomUUID();

    const ins = await db(
      `INSERT INTO matches (id, request_id, user_id, helper_id, status)
       VALUES ($1,$2,$3,$4,'ACCEPTED')
       RETURNING id, request_id, user_id, helper_id, created_at, status`,
      [matchId, requestId, String(r.user_id), helperId]
    );

    await db("UPDATE requests SET status='ACCEPTED' WHERE id=$1", [requestId]);

    await db("COMMIT");

    const m = ins.rows[0];
    return reply.send({
      ok: true,
      match: {
        id: m.id,
        requestId: m.request_id,
        userId: m.user_id,
        helperId: m.helper_id,
        createdAt: m.created_at,
        status: m.status,
      },
    });
  } catch (e) {
    try {
      await db("ROLLBACK");
    } catch {}
    return reply.code(500).send({ ok: false, error: e.message || "Errore accept" });
  }
});

// DETTAGLIO richiesta (lascia la tua logica di visibilità come già hai)
app.get("/requests/:id", { preHandler: [requireAuth] }, async (request, reply) => {
  if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });

  const id = String(request.params.id);

  const rq = await db(
    "SELECT id,user_id,title,description,city,created_at,status FROM requests WHERE id=$1 LIMIT 1",
    [id]
  );
  const r = rq.rows[0];
  if (!r) {
    return reply.code(404).send({
      ok: false,
      error: "Questa richiesta non è disponibile: potrebbe essere stata rimossa o non è più accessibile.",
    });
  }

  const mq = await db("SELECT * FROM matches WHERE request_id=$1 LIMIT 1", [id]);
  const mrow = mq.rows[0] || null;

  const isOwner = String(r.user_id) === String(request.user.id);
  const isHelper = !!(mrow && String(mrow.helper_id) === String(request.user.id));

  if (r.status !== "OPEN" && !isOwner && !isHelper) {
    return reply.code(404).send({
      ok: false,
      error: "Questa richiesta non è disponibile: potrebbe essere stata rimossa o non è più accessibile.",
    });
  }

  const reqObj = {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    description: r.description,
    city: r.city,
    createdAt: r.created_at,
    status: r.status,
  };

  const matchObj = mrow
    ? {
        id: mrow.id,
        requestId: mrow.request_id,
        userId: mrow.user_id,
        helperId: mrow.helper_id,
        createdAt: mrow.created_at,
        status: mrow.status,
        price_cents: mrow.price_cents,
        fee_cents: mrow.fee_cents,
        amount_cents: mrow.amount_cents,
        voucher_code: mrow.voucher_code,
        voucher_cents: mrow.voucher_cents,
        helper_payout_mode: mrow.helper_payout_mode,
        payment_intent_id: mrow.payment_intent_id,
        payment_status: mrow.payment_status,
        paid_with_wallet: mrow.paid_with_wallet,
        paidAt: mrow.paid_at,
        transfer_id: mrow.transfer_id,
        releasedAt: mrow.released_at,
      }
    : null;

 if (matchObj) {
  const mode = String(matchObj.helper_payout_mode || "").trim().toLowerCase();
  const modeSet = mode && mode !== "unset";

  // L’helper deve poter sapere se il richiedente può pagare col wallet (solo boolean)
  if (isHelper) {
    const amountCents = Number(matchObj.amount_cents || 0);
    if (amountCents > 0) {
      const wr = await db("SELECT wallet_cents FROM users WHERE id=$1", [String(matchObj.userId)]);
      const walletCents = Number(wr.rows[0]?.wallet_cents || 0);
      matchObj.requester_wallet_ok = walletCents >= amountCents;
    } else {
      matchObj.requester_wallet_ok = null; // prezzo non ancora impostato
    }
  } else {
    // Richiedente: vede la scelta SOLO dopo che l’helper l’ha fatta
    if (isOwner) {
      if (!modeSet) delete matchObj.helper_payout_mode;
    } else {
      // Altri utenti: mai
      delete matchObj.helper_payout_mode;
    }
  }
}

  if (matchObj && stripe && matchObj.payment_intent_id) {
    try {
      const pi = await stripe.paymentIntents.retrieve(matchObj.payment_intent_id);
      await db("UPDATE matches SET payment_status=$1 WHERE id=$2", [pi.status, matchObj.id]);
      matchObj.payment_status = pi.status;
    } catch {}
  }

  let helper = null;
  if (matchObj?.helperId) {
    const hq = await db("SELECT trust_points FROM users WHERE id=$1", [matchObj.helperId]);
    helper = { id: matchObj.helperId, trust_points: Number(hq.rows[0]?.trust_points || 0) };
  }

  return reply.send({ ok: true, request: reqObj, match: matchObj, helper });
});

  // ---------------- MATCHES ----------------
  app.get("/matches", { preHandler: [requireAuth] }, async (request, reply) => {
  if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });

  const uid = String(request.user.id);

  const { rows } = await db(
    "SELECT * FROM matches WHERE user_id=$1 OR helper_id=$1 ORDER BY created_at DESC",
    [uid]
  );

  const items = rows.map((m) => ({
    id: m.id,
    requestId: m.request_id,
    userId: m.user_id,
    helperId: m.helper_id,
    createdAt: m.created_at,
    status: m.status,
    price_cents: m.price_cents,
    fee_cents: m.fee_cents,
    amount_cents: m.amount_cents,
    payment_intent_id: m.payment_intent_id,
    payment_status: m.payment_status,
    paid_with_wallet: m.paid_with_wallet,
    paidAt: m.paid_at,
    transfer_id: m.transfer_id,
    releasedAt: m.released_at,
  }));

  return reply.send({ ok: true, items });
});

// ---------- MATCH: SET PRICE ----------
app.post("/matches/:id/price", { preHandler: [requireAuth] }, async (request, reply) => {
  if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });

  const id = String(request.params.id);

  try {
    await db("BEGIN");

    // 1) Prendo e BLOCCO la riga match (evita race con /pay)
    const mq = await db("SELECT * FROM matches WHERE id=$1 FOR UPDATE", [id]);
    const row = mq.rows[0];

    if (!row) {
      await db("ROLLBACK");
      return reply.code(404).send({ ok: false, error: "Match non trovato" });
    }

    // 2) Accesso: solo user o helper
    const isUser = String(row.user_id) === String(request.user.id);
    const isHelper = String(row.helper_id) === String(request.user.id);
    if (!isUser && !isHelper) {
      await db("ROLLBACK");
      return reply.code(403).send({ ok: false, error: "Accesso negato" });
    }

    // 3) Solo helper può impostare prezzo
    if (String(row.helper_id) !== String(request.user.id)) {
      await db("ROLLBACK");
      return reply.code(403).send({ ok: false, error: "Solo l'helper può impostare il prezzo" });
    }

    // 4) Blocca modifica se pagamento già avviato o completato
    if (
      row.paid_with_wallet === true ||
      !!row.payment_intent_id ||
      ["HELD", "PAYMENT_CREATED", "RELEASING", "RELEASED"].includes(String(row.status))
    ) {
      await db("ROLLBACK");
      return reply.code(409).send({
        ok: false,
        error: "Prezzo bloccato: pagamento già avviato o completato.",
      });
    }

    // 5) Validazione input
    const priceCents = Number(request.body?.price_cents || 0);
    if (!Number.isFinite(priceCents) || priceCents <= 0) {
      await db("ROLLBACK");
      return reply.code(400).send({ ok: false, error: "Prezzo non valido" });
    }

    // 6) Calcolo fee + amount
    const feeCents = calcFeeCents(priceCents);
    const amountCents = priceCents + feeCents;

    // 7) Salvo SU DB
    const up = await db(
      `UPDATE matches
       SET price_cents=$1, fee_cents=$2, amount_cents=$3, status='PRICED'
       WHERE id=$4
       RETURNING *`,
      [priceCents, feeCents, amountCents, id]
    );

    await db("COMMIT");

    const m = up.rows[0];

    // 8) Risposta nel formato che usa il frontend
    return reply.send({
      ok: true,
      match: {
        id: m.id,
        requestId: m.request_id,
        userId: m.user_id,
        helperId: m.helper_id,
        createdAt: m.created_at,
        status: m.status,
        price_cents: m.price_cents,
        fee_cents: m.fee_cents,
        amount_cents: m.amount_cents,
        payment_intent_id: m.payment_intent_id,
        payment_status: m.payment_status,
        paid_with_wallet: m.paid_with_wallet,
        paidAt: m.paid_at,
        transfer_id: m.transfer_id,
        releasedAt: m.released_at,
      },
    });
  } catch (e) {
    try {
      await db("ROLLBACK");
    } catch {}
    request.log.error(e);
    return reply.code(500).send({ ok: false, error: "Errore set prezzo" });
  }
});

// ---------- MATCH: PAY (CARD or WALLET) ----------
app.post("/matches/:id/pay", { preHandler: [requireAuth] }, async (request, reply) => {
  if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });

  const id = String(request.params.id);
  if (!stripe) return reply.code(500).send({ ok: false, error: "Stripe non configurato" });

  const matchId = String(request.params.id);
  const useWallet = !!request.body?.use_wallet;
  const voucherRaw = String(request.body?.voucher_code || "").trim();
  const voucherCode = voucherRaw ? voucherRaw.toUpperCase() : "";

  // carica match + controlli accesso
  const { rows: mrows } = await db("SELECT * FROM matches WHERE id=$1 LIMIT 1", [matchId]);
  const m = mrows[0];
  if (!m) return reply.code(404).send({ ok: false, error: "Match non trovato" });
  if (String(m.user_id) !== String(request.user.id)) {
    return reply.code(403).send({ ok: false, error: "Solo il richiedente può pagare" });
  }

  const voucherCodeRaw = String(request.body?.voucher_code || request.body?.voucher || "").trim();
// Voucher non più applicabili al checkout: vanno riscattati nel wallet (profilo)
if (voucherCodeRaw) {
  return reply
    .code(400)
    .send({ ok: false, error: "I voucher vanno riscattati nel wallet. Usa 'Paga con wallet'." });
}

  try {
    await db("BEGIN");

    // 1) Prendo e BLOCCO il match (evita race / doppio pay)
    const mq = await db("SELECT * FROM matches WHERE id=$1 FOR UPDATE", [id]);
    const row = mq.rows[0];

    if (!row) {
      await db("ROLLBACK");
      return reply.code(404).send({ ok: false, error: "Match non trovato" });
    }

// ✅ Impone che il richiedente paghi SOLO nel metodo scelto dall'helper
const useWallet = !!request.body?.use_wallet;

let mode = String(row.helper_payout_mode || "").trim().toLowerCase();
if (mode === "trust") mode = "cash"; // legacy
if (!mode || mode === "unset") {
  await db("ROLLBACK");
  return reply.code(400).send({ ok: false, error: "Attendi che l’helper scelga Cash o Wallet." });
}

if (mode === "wallet" && !useWallet) {
  await db("ROLLBACK");
  return reply.code(400).send({ ok: false, error: "Questo match richiede pagamento con Wallet." });
}

if (mode === "cash" && useWallet) {
  await db("ROLLBACK");
  return reply.code(400).send({ ok: false, error: "Questo match richiede pagamento con Carta." });
}

    // 2) Accesso: solo user o helper
    const isUser = String(row.user_id) === String(request.user.id);
    const isHelper = String(row.helper_id) === String(request.user.id);
    if (!isUser && !isHelper) {
      await db("ROLLBACK");
      return reply.code(403).send({ ok: false, error: "Accesso negato" });
    }

    // 3) Solo requester può pagare
    if (String(row.user_id) !== String(request.user.id)) {
      await db("ROLLBACK");
      return reply.code(403).send({ ok: false, error: "Solo il richiedente può pagare" });
    }

    // 4) Deve essere PRICED (o almeno avere price)
    if (!row.price_cents) {
      await db("ROLLBACK");
      return reply.code(400).send({ ok: false, error: "Prezzo non impostato" });
    }

    // 5) Già pagato / fondi bloccati?
const matchStatus = String(row.status || "").toUpperCase();
const payStatus = String(row.payment_status || "").toLowerCase();

const alreadyHeld =
  row.paid_with_wallet === true ||
  matchStatus === "HELD" ||
  payStatus === "succeeded" ||
  payStatus === "requires_capture";

if (alreadyHeld) {
  await db("ROLLBACK");
  return reply.code(409).send({ ok: false, error: "Pagamento già completato (fondi bloccati)." });
}

// ✅ RESUME: se c’è già un PaymentIntent non completato, restituisci il suo clientSecret
if (row.payment_intent_id) {
  const pi = await stripe.paymentIntents.retrieve(String(row.payment_intent_id));
  const piStatus = String(pi.status || "");

  await db("UPDATE matches SET payment_status=$1 WHERE id=$2", [piStatus, id]);

  if (piStatus === "succeeded") {
    await db("UPDATE matches SET status='HELD', paid_at=COALESCE(paid_at, now()) WHERE id=$1", [id]);
    const { rows: m2 } = await db("SELECT * FROM matches WHERE id=$1 LIMIT 1", [id]);
    await db("COMMIT");
    const mm = m2[0];

    return reply.send({
      ok: true,
      clientSecret: null,
      amount_cents: Number(mm.amount_cents || 0),
      payable_cents: Number(mm.amount_cents || 0),
      voucher_code: null,
      voucher_cents: 0,
      match: {
        id: mm.id,
        requestId: mm.request_id,
        userId: mm.user_id,
        helperId: mm.helper_id,
        createdAt: mm.created_at,
        status: mm.status,
        price_cents: mm.price_cents,
        fee_cents: mm.fee_cents,
        amount_cents: mm.amount_cents,
        voucher_code: mm.voucher_code,
        voucher_cents: mm.voucher_cents,
        helper_payout_mode: mm.helper_payout_mode,
        payment_intent_id: mm.payment_intent_id,
        payment_status: mm.payment_status,
        paid_with_wallet: mm.paid_with_wallet,
        paidAt: mm.paid_at,
        transfer_id: mm.transfer_id,
        releasedAt: mm.released_at,
      },
    });
  }

  if (piStatus !== "canceled") {
    const priceCents = Number(row.price_cents);
    const feeCents = calcFeeCents(priceCents);
    const amountCents = priceCents + feeCents;

    const { rows: m2 } = await db("SELECT * FROM matches WHERE id=$1 LIMIT 1", [id]);
    await db("COMMIT");
    const mm = m2[0];

    return reply.send({
      ok: true,
      clientSecret: pi.client_secret,
      amount_cents: Number(mm.amount_cents || amountCents),
      payable_cents: Number(mm.amount_cents || amountCents),
      voucher_code: null,
      voucher_cents: 0,
      match: {
        id: mm.id,
        requestId: mm.request_id,
        userId: mm.user_id,
        helperId: mm.helper_id,
        createdAt: mm.created_at,
        status: mm.status,
        price_cents: mm.price_cents,
        fee_cents: mm.fee_cents,
        amount_cents: mm.amount_cents,
        voucher_code: mm.voucher_code,
        voucher_cents: mm.voucher_cents,
        helper_payout_mode: mm.helper_payout_mode,
        payment_intent_id: mm.payment_intent_id,
        payment_status: mm.payment_status,
        paid_with_wallet: mm.paid_with_wallet,
        paidAt: mm.paid_at,
        transfer_id: mm.transfer_id,
        releasedAt: mm.released_at,
      },
    });
  }

  // canceled: permetti di crearne uno nuovo
  await db("UPDATE matches SET payment_intent_id=NULL, payment_status=NULL, status='PRICED' WHERE id=$1", [id]);
}

    // 6) Calcolo fee + amount
    const priceCents = Number(row.price_cents);
    const feeCents = calcFeeCents(priceCents);
    const amountCents = priceCents + feeCents;
// Checkout voucher disabilitato: si paga sempre l'importo pieno (price + fee)
const voucherCode = null;
const voucherCents = 0;
const payableCents = amountCents;

// Salvo fee/amount (e azzero eventuali voucher legacy)
await db(
  "UPDATE matches SET fee_cents=$1, amount_cents=$2, voucher_code=NULL, voucher_cents=0 WHERE id=$3",
  [feeCents, amountCents, id]
);

    // ---------------- WALLET ----------------
    if (useWallet) {
      // 7) Rileggo wallet
     const wr = await db("SELECT wallet_cents FROM users WHERE id=$1 FOR UPDATE", [request.user.id]);
      const walletCents = Number(wr.rows[0]?.wallet_cents || 0);

      if (walletCents < payableCents) {
        await db("ROLLBACK");
        return reply.code(400).send({ ok: false, error: "Wallet insufficiente" });
      }

      // 8) Scala wallet (paga SOLO payableCents)
      const upWallet = await db(
  "UPDATE users SET wallet_cents = wallet_cents - $1 WHERE id=$2 AND wallet_cents >= $1 RETURNING wallet_cents",
  [payableCents, request.user.id]
);

if (upWallet.rowCount === 0) {
  await db("ROLLBACK");
  return reply.code(400).send({ ok: false, error: "Wallet insufficiente" });
}

      // 9) Aggiorna match su DB
      const upMatch = await db(
        `UPDATE matches
         SET paid_with_wallet=true,
             payment_status='wallet_held',
             status='HELD',
             paid_at=now()
         WHERE id=$1
         RETURNING *`,
        [id]
      );

      // se ho usato un voucher, ora che il pagamento wallet è COMPLETATO lo segno come REDEEMED
      if (voucherCode) {
        await db(
          `UPDATE voucher_redemptions
           SET status='redeemed', redeemed_at=now()
           WHERE code=$1 AND match_id=$2 AND user_id=$3 AND status='reserved'`,
          [voucherCode, id, request.user.id]
        );
      }

      await db("COMMIT");

      const m = upMatch.rows[0];
      return reply.send({
        ok: true,
        wallet_used: true,
        amount_cents: amountCents,
        payable_cents: payableCents,
        voucher_code: voucherCode,
        voucher_cents: voucherCents,
        wallet_cents: Number(upWallet.rows[0]?.wallet_cents || 0),
        match: {
          id: m.id,
          requestId: m.request_id,
          userId: m.user_id,
          helperId: m.helper_id,
          createdAt: m.created_at,
          status: m.status,
          price_cents: m.price_cents,
          fee_cents: m.fee_cents,
          amount_cents: m.amount_cents,
          voucher_code: m.voucher_code,
          voucher_cents: m.voucher_cents,
          helper_payout_mode: m.helper_payout_mode,
          payment_intent_id: m.payment_intent_id,
          payment_status: m.payment_status,
          paid_with_wallet: m.paid_with_wallet,
          paidAt: m.paid_at,
          transfer_id: m.transfer_id,
          releasedAt: m.released_at,
        },
      });
    }

    // ---------------- CARD (STRIPE) ----------------
    if (!stripe) {
      await db("ROLLBACK");
      return reply.code(500).send({ ok: false, error: "Stripe non configurato" });
    }

    // 10) Prendo lo Stripe account dell'helper da DB
    const hr = await db("SELECT stripe_account_id FROM users WHERE id=$1", [String(row.helper_id)]);
    const helperStripeAccountId = hr.rows[0]?.stripe_account_id || null;

    if (!helperStripeAccountId) {
      await db("ROLLBACK");
      return reply.code(400).send({ ok: false, error: "Helper non ha Stripe Connect attivo" });
    }

    // 11) Crea PaymentIntent (fondi trattenuti sulla piattaforma)
    const pi = await stripe.paymentIntents.create({
      amount: payableCents,
      currency: "eur",
      automatic_payment_methods: { enabled: true },
      ...(process.env.STRIPE_PMC_ID ? { payment_method_configuration: process.env.STRIPE_PMC_ID } : {}),
      transfer_group: `match_${String(row.id)}`,
      metadata: {
        matchId: String(row.id),
        requestId: String(row.request_id),
        userId: String(row.user_id),
        helperId: String(row.helper_id),
        price_cents: String(priceCents),
        fee_cents: String(feeCents),
        amount_cents: String(amountCents),
        payable_cents: String(payableCents),
        voucher_code: voucherCode ? String(voucherCode) : "",
        voucher_cents: String(voucherCents),
      },
    });

    // 12) Salva PI su DB
    const upMatch = await db(
      `UPDATE matches
       SET payment_intent_id=$1,
           payment_status=$2,
           status='PAYMENT_CREATED'
       WHERE id=$3
       RETURNING *`,
      [pi.id, pi.status, id]
    );

    await db("COMMIT");

    const m = upMatch.rows[0];
    return reply.send({
      ok: true,
      clientSecret: pi.client_secret,
      amount_cents: amountCents,
      payable_cents: payableCents,
      voucher_code: voucherCode,
      voucher_cents: voucherCents,
      match: {
        id: m.id,
        requestId: m.request_id,
        userId: m.user_id,
        helperId: m.helper_id,
        createdAt: m.created_at,
        status: m.status,
        price_cents: m.price_cents,
        fee_cents: m.fee_cents,
        amount_cents: m.amount_cents,
        voucher_code: m.voucher_code,
        voucher_cents: m.voucher_cents,
        helper_payout_mode: m.helper_payout_mode,
        payment_intent_id: m.payment_intent_id,
        payment_status: m.payment_status,
        paid_with_wallet: m.paid_with_wallet,
        paidAt: m.paid_at,
        transfer_id: m.transfer_id,
        releasedAt: m.released_at,
      },
    });
  } catch (e) {
    try {
      await db("ROLLBACK");
    } catch {}
    request.log.error(e, "pay failed");
    return reply.code(500).send({ ok: false, error: "Errore pagamento" });
  }
});

// ---------- MATCH: RELEASE (CAPTURE) ----------
app.post("/matches/:id/payout-mode", { preHandler: [requireAuth] }, async (request, reply) => {
  if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });

  const id = String(request.params.id);
  const modeRaw = String(request.body?.mode || "").trim().toLowerCase();
  const mode = modeRaw === "cash" ? "cash" : modeRaw === "wallet" ? "wallet" : "";

  if (!mode) {
    return reply.code(400).send({ ok: false, error: "Modalità non valida. Usa 'cash' o 'wallet'." });
  }

  try {
    await db("BEGIN");

    const mq = await db("SELECT * FROM matches WHERE id=$1 FOR UPDATE", [id]);
    const row = mq.rows[0];

    if (!row) {
      await db("ROLLBACK");
      return reply.code(404).send({ ok: false, error: "Match non trovato" });
    }

    // solo l'helper può scegliere
    if (String(row.helper_id) !== String(request.user.id)) {
      await db("ROLLBACK");
      return reply.code(403).send({ ok: false, error: "Non autorizzato" });
    }

    const status = String(row.status || "").toUpperCase();
    if (status === "RELEASED" || status === "RELEASING") {
      await db("ROLLBACK");
      return reply.code(400).send({ ok: false, error: "Match già rilasciato" });
    }

    // Non cambiare dopo il pagamento
    const paid =
      row.paid_with_wallet === true ||
      status === "HELD" ||
      ["succeeded", "requires_capture"].includes(String(row.payment_status || "").toLowerCase());

    if (paid) {
      await db("ROLLBACK");
      return reply.code(400).send({ ok: false, error: "Non puoi cambiare modalità dopo il pagamento" });
    }

    const amountCents = Number(row.amount_cents || 0);
    if (!amountCents || amountCents <= 0) {
      await db("ROLLBACK");
      return reply.code(400).send({ ok: false, error: "Imposta prima il prezzo (amount_cents mancante)" });
    }

    // Se vuole wallet: il richiedente deve avere saldo sufficiente
    if (mode === "wallet") {
      const wr = await db("SELECT wallet_cents FROM users WHERE id=$1", [String(row.user_id)]);
      const walletCents = Number(wr.rows[0]?.wallet_cents || 0);
      if (walletCents < amountCents) {
        await db("ROLLBACK");
        return reply.code(400).send({
          ok: false,
          error: "Il richiedente non ha saldo wallet sufficiente per pagare con wallet.",
        });
      }
    }

if (mode === "cash") {
  const hr = await db("SELECT stripe_account_id FROM users WHERE id=$1", [String(row.helper_id)]);
  const helperStripeAccountId = hr.rows[0]?.stripe_account_id || null;
  if (!helperStripeAccountId) {
    await db("ROLLBACK");
    return reply.code(400).send({ ok: false, error: "Helper non ha Stripe Connect attivo (scegli Wallet o attiva Stripe)." });
  }
}

    const up = await db(
      "UPDATE matches SET helper_payout_mode=$1 WHERE id=$2 RETURNING *",
      [mode, id]
    );

    await db("COMMIT");

    const m = up.rows[0];
    return reply.send({
      ok: true,
      match: {
        id: m.id,
        requestId: m.request_id,
        userId: m.user_id,
        helperId: m.helper_id,
        createdAt: m.created_at,
        status: m.status,
        price_cents: m.price_cents,
        fee_cents: m.fee_cents,
        amount_cents: m.amount_cents,
        voucher_code: m.voucher_code,
        voucher_cents: m.voucher_cents,
        helper_payout_mode: m.helper_payout_mode,
        payment_intent_id: m.payment_intent_id,
        payment_status: m.payment_status,
        paid_with_wallet: m.paid_with_wallet,
        paidAt: m.paid_at,
        transfer_id: m.transfer_id,
        releasedAt: m.released_at,
      },
    });
  } catch (e) {
    try { await db("ROLLBACK"); } catch {}
    return reply.code(500).send({ ok: false, error: e.message || "Errore payout mode" });
  }
});

// ---------- MATCH: RELEASE ----------
app.post("/matches/:id/release", { preHandler: [requireAuth] }, async (request, reply) => {
  if (!pool) return reply.code(500).send({ ok: false, error: "Database non configurato." });

  const id = String(request.params.id);

  try {
    await db("BEGIN");

    const mq = await db("SELECT * FROM matches WHERE id=$1 FOR UPDATE", [id]);
    const row = mq.rows[0];

    if (!row) {
      await db("ROLLBACK");
      return reply.code(404).send({ ok: false, error: "Match non trovato" });
    }

    const requestId = String(row.request_id);

    // solo requester rilascia
    if (String(row.user_id) !== String(request.user.id)) {
      await db("ROLLBACK");
      return reply.code(403).send({ ok: false, error: "Solo il richiedente può rilasciare" });
    }

    if (["RELEASING", "RELEASED"].includes(String(row.status || "").toUpperCase())) {
      await db("ROLLBACK");
      return reply.code(409).send({ ok: false, error: "Rilascio già avviato o completato." });
    }

    const priceCents = Number(row.price_cents || 0);
    if (!Number.isFinite(priceCents) || priceCents <= 0) {
      await db("ROLLBACK");
      return reply.code(400).send({ ok: false, error: "Prezzo non valido" });
    }

    // payout mode: cash | wallet (legacy trust -> cash)
    let payoutMode = String(row.helper_payout_mode || "").trim().toLowerCase();
    if (payoutMode === "trust") payoutMode = "cash"; // legacy
    if (!payoutMode || payoutMode === "unset") {
      await db("ROLLBACK");
      return reply.code(400).send({ ok: false, error: "L’helper non ha ancora scelto Cash/Wallet." });
    }
    if (payoutMode !== "cash" && payoutMode !== "wallet") {
      await db("ROLLBACK");
      return reply.code(400).send({ ok: false, error: "Modalità payout non valida." });
    }

    // evita release prima del pagamento
    const paid =
      row.paid_with_wallet === true ||
      String(row.status || "").toUpperCase() === "HELD" ||
      String(row.payment_status || "").toLowerCase() === "succeeded";

    if (!paid) {
      await db("ROLLBACK");
      return reply.code(400).send({ ok: false, error: "Devi prima completare il pagamento prima di rilasciare." });
    }

    const payoutCents = priceCents;      // l’helper riceve il prezzo del lavoro
    const trustPointsAwarded = 3;        // ✅ +3 per lavoro rilasciato

    // ---------------- WALLET PAYOUT: accredito wallet helper, NO Stripe ----------------
    if (payoutMode === "wallet") {
      // deve essere un pagamento wallet “held”
      if (!row.paid_with_wallet || String(row.status || "").toUpperCase() !== "HELD") {
        await db("ROLLBACK");
        return reply.code(400).send({ ok: false, error: "Pagamento wallet non in stato HELD." });
      }

      await db(
        "UPDATE users SET wallet_cents = COALESCE(wallet_cents,0) + $1, trust_points = COALESCE(trust_points,0) + $2 WHERE id=$3",
        [payoutCents, trustPointsAwarded, String(row.helper_id)]
      );

      const up = await db(
        `UPDATE matches
         SET transfer_id=NULL,
             payment_status='released_wallet',
             status='RELEASED',
             released_at=now()
         WHERE id=$1
         RETURNING *`,
        [id]
      );

      await db("UPDATE requests SET status='RELEASED' WHERE id=$1", [requestId]);

      await db("COMMIT");

      const m = up.rows[0];
      return reply.send({
        ok: true,
        payout_cents: payoutCents,
        trust_points_awarded: trustPointsAwarded,
        match: {
          id: m.id,
          requestId: m.request_id,
          userId: m.user_id,
          helperId: m.helper_id,
          createdAt: m.created_at,
          status: m.status,
          price_cents: m.price_cents,
          fee_cents: m.fee_cents,
          amount_cents: m.amount_cents,
          voucher_code: m.voucher_code,
          voucher_cents: m.voucher_cents,
          helper_payout_mode: m.helper_payout_mode,
          payment_intent_id: m.payment_intent_id,
          payment_status: m.payment_status,
          paid_with_wallet: m.paid_with_wallet,
          paidAt: m.paid_at,
          transfer_id: m.transfer_id,
          releasedAt: m.released_at,
        },
      });
    }

    // ---------------- CASH PAYOUT: Stripe transfer ----------------
    if (!stripe) {
      await db("ROLLBACK");
      return reply.code(500).send({ ok: false, error: "Stripe non configurato" });
    }

    const hr = await db("SELECT stripe_account_id FROM users WHERE id=$1", [String(row.helper_id)]);
    const helperStripeAccountId = hr.rows[0]?.stripe_account_id || null;

    if (!helperStripeAccountId) {
      await db("ROLLBACK");
      return reply.code(400).send({ ok: false, error: "Helper non ha Stripe Connect attivo" });
    }

    await db("UPDATE matches SET status='RELEASING' WHERE id=$1", [id]);

    // Se il pagamento è stato fatto con wallet: transfer da saldo piattaforma
    if (row.paid_with_wallet === true) {
      const tr = await stripe.transfers.create({
        amount: payoutCents,
        currency: "eur",
        destination: helperStripeAccountId,
        transfer_group: `match_${String(row.id)}`,
        metadata: { matchId: String(row.id), requestId, payout_mode: payoutMode },
      });

      const up = await db(
        `UPDATE matches
         SET transfer_id=$1,
             payment_status='released',
             status='RELEASED',
             released_at=now()
         WHERE id=$2
         RETURNING *`,
        [tr.id, id]
      );

      await db("UPDATE users SET trust_points = COALESCE(trust_points,0) + $1 WHERE id=$2", [trustPointsAwarded, String(row.helper_id)]);
      await db("UPDATE requests SET status='RELEASED' WHERE id=$1", [requestId]);

      await db("COMMIT");

      const m = up.rows[0];
      return reply.send({
        ok: true,
        payout_cents: payoutCents,
        trust_points_awarded: trustPointsAwarded,
        match: {
          id: m.id,
          requestId: m.request_id,
          userId: m.user_id,
          helperId: m.helper_id,
          createdAt: m.created_at,
          status: m.status,
          price_cents: m.price_cents,
          fee_cents: m.fee_cents,
          amount_cents: m.amount_cents,
          voucher_code: m.voucher_code,
          voucher_cents: m.voucher_cents,
          helper_payout_mode: m.helper_payout_mode,
          payment_intent_id: m.payment_intent_id,
          payment_status: m.payment_status,
          paid_with_wallet: m.paid_with_wallet,
          paidAt: m.paid_at,
          transfer_id: m.transfer_id,
          releasedAt: m.released_at,
        },
      });
    }

    // Pagamento con carta: transfer legato alla charge
    if (!row.payment_intent_id) {
      await db("ROLLBACK");
      return reply.code(400).send({ ok: false, error: "payment_intent_id mancante" });
    }

    const pi = await stripe.paymentIntents.retrieve(row.payment_intent_id);
    if (pi.status !== "succeeded") {
      await db("ROLLBACK");
      return reply.code(400).send({ ok: false, error: `PaymentIntent non succeeded (status=${pi.status})` });
    }

    const transferParams = {
      amount: payoutCents,
      currency: "eur",
      destination: helperStripeAccountId,
      transfer_group: `match_${String(row.id)}`,
      metadata: { matchId: String(row.id), requestId, payout_mode: payoutMode },
    };

    if (pi.latest_charge && payoutCents <= Number(pi.amount || 0)) {
      transferParams.source_transaction = pi.latest_charge;
    }

    const tr = await stripe.transfers.create(transferParams);

    const up = await db(
      `UPDATE matches
       SET transfer_id=$1,
           payment_status='released',
           status='RELEASED',
           released_at=now()
       WHERE id=$2
       RETURNING *`,
      [tr.id, id]
    );

    await db("UPDATE users SET trust_points = COALESCE(trust_points,0) + $1 WHERE id=$2", [trustPointsAwarded, String(row.helper_id)]);
    await db("UPDATE requests SET status='RELEASED' WHERE id=$1", [requestId]);

    await db("COMMIT");

    const m = up.rows[0];
    return reply.send({
      ok: true,
      payout_cents: payoutCents,
      trust_points_awarded: trustPointsAwarded,
      match: {
        id: m.id,
        requestId: m.request_id,
        userId: m.user_id,
        helperId: m.helper_id,
        createdAt: m.created_at,
        status: m.status,
        price_cents: m.price_cents,
        fee_cents: m.fee_cents,
        amount_cents: m.amount_cents,
        voucher_code: m.voucher_code,
        voucher_cents: m.voucher_cents,
        helper_payout_mode: m.helper_payout_mode,
        payment_intent_id: m.payment_intent_id,
        payment_status: m.payment_status,
        paid_with_wallet: m.paid_with_wallet,
        paidAt: m.paid_at,
        transfer_id: m.transfer_id,
        releasedAt: m.released_at,
      },
    });
  } catch (e) {
    try { await db("ROLLBACK"); } catch {}
    request.log.error(e, "release failed");
    const msg = e?.raw?.message || e?.message || "Errore rilascio";
    return reply.code(400).send({ ok: false, error: msg });
  }
});

// -------- STRIPE WEBHOOK (RAW) --------
// parser application/json -> Buffer SOLO per questa route
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
    const type = String(event.type || "");
    const obj = event.data?.object || null;

    // NB: qui facciamo "best effort": se DB è giù, il webhook comunque risponde 200 (così Stripe non ti martella)
    if (pool && obj && (type === "payment_intent.succeeded" || type === "payment_intent.payment_failed" || type === "payment_intent.canceled")) {
      const pi = obj;
      const matchId = pi?.metadata?.matchId ? String(pi.metadata.matchId) : null;

      if (matchId) {
        try {
          await db("BEGIN");

          const mq = await db("SELECT * FROM matches WHERE id=$1 FOR UPDATE", [matchId]);
          const mrow = mq.rows[0];

          // sicurezza: applica solo se PI combacia
          if (mrow && String(mrow.payment_intent_id || "") === String(pi.id)) {
            // aggiorna stato pagamento
            await db("UPDATE matches SET payment_status=$1 WHERE id=$2", [String(pi.status), matchId]);

            if (type === "payment_intent.succeeded") {
              // segna HELD + paid_at (serve per avere uno stato coerente anche senza polling lato client)
              await db(
                "UPDATE matches SET status='HELD', paid_at=COALESCE(paid_at, now()) WHERE id=$1",
                [matchId]
              );

              // se c'è un voucher riservato per questo match, ora è davvero usato
              if (mrow.voucher_code) {
                await db(
                  `UPDATE voucher_redemptions
                   SET status='redeemed', redeemed_at=now()
                   WHERE code=$1 AND match_id=$2 AND user_id=$3 AND status='reserved'`,
                  [String(mrow.voucher_code), matchId, String(mrow.user_id)]
                );
              }
            } else {
              // payment_failed / canceled -> libera eventuale reservation voucher
              if (mrow.voucher_code) {
                await db(
                  "DELETE FROM voucher_redemptions WHERE code=$1 AND match_id=$2 AND status='reserved'",
                  [String(mrow.voucher_code), matchId]
                );
              }
            }
          }

          await db("COMMIT");
        } catch (e) {
          try { await db("ROLLBACK"); } catch {}
          request.log.error(e, "stripe webhook db update failed");
        }
      }
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
