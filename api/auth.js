const jwt = require("jsonwebtoken");

function sign(user) {
  return jwt.sign(
    { sub: user.id, phone: user.phone },
    process.env.JWT_SECRET || "change_me",
    { expiresIn: "30d" }
  );
}

function verify(token) {
  return jwt.verify(token, process.env.JWT_SECRET || "change_me");
}

function getBearer(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function authHook(db) {
  return async function (req, reply) {
    const token = getBearer(req);
    if (!token) return;
    try {
      const payload = verify(token);
      const user = await db.getUserById(payload.sub);
      if (user) req.user = user;
    } catch {
      // ignore
    }
  };
}

function requireAuth(req, reply) {
  if (!req.user) {
    reply.code(401);
    throw new Error("Non autenticato");
  }
}

module.exports = { sign, verify, authHook, requireAuth };
