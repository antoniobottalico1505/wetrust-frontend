const { nanoid } = require("nanoid");

function nowIso() {
  return new Date().toISOString();
}

function cents(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.round(v);
}

const state = {
  users: [],       // {id, phone, stripe_account_id, wallet_cents, created_at}
  requests: [],    // {id, user_id, title, description, city, status, created_at}
  matches: [],     // {id, request_id, requester_id, helper_id, status, price_cents, fee_cents, voucher_applied_cents, payment_intent_id, payment_status, stream_channel_id, created_at}
  vouchers: [],    // {code, amount_cents, status, created_at, redeemed_by, redeemed_at}
};

function seedIfEmpty() {
  if (state.requests.length) return;
  // create two fake users
  const u1 = { id: nanoid(), phone: "+390000000001", wallet_cents: 0, created_at: nowIso() };
  const u2 = { id: nanoid(), phone: "+390000000002", wallet_cents: 0, created_at: nowIso() };
  state.users.push(u1, u2);

  state.requests.unshift(
    {
      id: nanoid(),
      user_id: u1.id,
      title: "Accompagnare mia madre dal medico",
      description: "Cerco qualcuno di affidabile per accompagnare mia madre di 78 anni alla visita in ospedale domani mattina.",
      city: "Torino",
      status: "open",
      created_at: nowIso(),
    },
    {
      id: nanoid(),
      user_id: u2.id,
      title: "Aiuto con spesa settimanale",
      description: "Mi serve una mano con la spesa al supermercato una volta a settimana.",
      city: "Milano",
      status: "open",
      created_at: nowIso(),
    }
  );
}

seedIfEmpty();

module.exports = {
  kind: "memory",
  async init() {
    return;
  },

  // Users
  async getUserByPhone(phone) {
    return state.users.find(u => u.phone === phone) || null;
  },
  async getUserById(id) {
    return state.users.find(u => u.id === id) || null;
  },
  async createUser(phone) {
    const user = { id: nanoid(), phone, wallet_cents: 0, created_at: nowIso(), stripe_account_id: null };
    state.users.push(user);
    return user;
  },
  async updateUser(id, patch) {
    const u = await this.getUserById(id);
    if (!u) return null;
    Object.assign(u, patch);
    return u;
  },

  // Requests
  async listRequests() {
    return state.requests;
  },
  async getRequest(id) {
    return state.requests.find(r => r.id === id) || null;
  },
  async createRequest({ user_id, description, city }) {
    const clean = (description || "").trim();
    const r = {
      id: nanoid(),
      user_id,
      title: clean.slice(0, 80),
      description: clean,
      city: (city || "").trim() || null,
      status: "open",
      created_at: nowIso()
    };
    state.requests.unshift(r);
    return r;
  },
  async setRequestStatus(id, status) {
    const r = await this.getRequest(id);
    if (!r) return null;
    r.status = status;
    return r;
  },

  // Matches
  async createMatch({ request_id, requester_id, helper_id }) {
    const m = {
      id: nanoid(),
      request_id,
      requester_id,
      helper_id,
      status: "accepted",
      price_cents: 0,
      fee_cents: 0,
      voucher_applied_cents: 0,
      payment_intent_id: null,
      payment_status: "none",
      stream_channel_id: null,
      created_at: nowIso()
    };
    state.matches.unshift(m);
    return m;
  },
  async getMatch(id) {
    return state.matches.find(m => m.id === id) || null;
  },
  async updateMatch(id, patch) {
    const m = await this.getMatch(id);
    if (!m) return null;
    Object.assign(m, patch);
    return m;
  },
  async findMatchByRequest(request_id) {
    return state.matches.find(m => m.request_id === request_id) || null;
  },

  // Wallet
  async addWallet(user_id, amount_cents) {
    const u = await this.getUserById(user_id);
    if (!u) return null;
    u.wallet_cents = cents(u.wallet_cents + cents(amount_cents));
    return u.wallet_cents;
  },
  async deductWallet(user_id, amount_cents) {
    const u = await this.getUserById(user_id);
    if (!u) return null;
    const amt = cents(amount_cents);
    if (u.wallet_cents < amt) return null;
    u.wallet_cents -= amt;
    return u.wallet_cents;
  },

  // Vouchers
  async createVoucher(code, amount_cents) {
    const v = { code, amount_cents: cents(amount_cents), status: "new", created_at: nowIso(), redeemed_by: null, redeemed_at: null };
    state.vouchers.push(v);
    return v;
  },
  async getVoucher(code) {
    return state.vouchers.find(v => v.code === code) || null;
  },
  async redeemVoucher(code, user_id) {
    const v = await this.getVoucher(code);
    if (!v || v.status !== "new") return null;
    v.status = "redeemed";
    v.redeemed_by = user_id;
    v.redeemed_at = nowIso();
    await this.addWallet(user_id, v.amount_cents);
    return v;
  }
};
