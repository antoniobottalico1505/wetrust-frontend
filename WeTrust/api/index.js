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

  // PORTA PER LOCALE/RENDER
  const PORT = process.env.PORT || process.env.API_PORT || 4000;
  const HOST = "0.0.0.0";

  try {
    const address = await app.listen({ port: PORT, host: HOST });
    app.log.info(`Server listening at ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
