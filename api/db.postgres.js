const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

let pool = null;

function cents(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.round(v);
}

async function migrateIfNeeded() {
  if (process.env.MIGRATE_ON_START !== "true") return;
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  await pool.query(sql);
}

module.exports = {
  kind: "postgres",
  async init() {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined });
    await pool.query("select 1");
    await migrateIfNeeded();
  },

  // Users
  async getUserByPhone(phone) {
    const { rows } = await pool.query("select * from users where phone=$1 limit 1", [phone]);
    return rows[0] || null;
  },
  async getUserById(id) {
    const { rows } = await pool.query("select * from users where id=$1 limit 1", [id]);
    return rows[0] || null;
  },
  async createUser(phone) {
    const { rows } = await pool.query("insert into users(phone) values($1) returning *", [phone]);
    return rows[0];
  },
  async updateUser(id, patch) {
    const fields = [];
    const values = [];
    let i = 1;
    for (const [k, v] of Object.entries(patch)) {
      fields.push(`${k}=$${i++}`);
      values.push(v);
    }
    if (!fields.length) return this.getUserById(id);
    values.push(id);
    const { rows } = await pool.query(`update users set ${fields.join(", ")} where id=$${i} returning *`, values);
    return rows[0] || null;
  },

  // Requests
  async listRequests() {
    const { rows } = await pool.query("select * from requests order by created_at desc");
    return rows;
  },
  async getRequest(id) {
    const { rows } = await pool.query("select * from requests where id=$1 limit 1", [id]);
    return rows[0] || null;
  },
  async createRequest({ user_id, description, city }) {
    const clean = (description || "").trim();
    const title = clean.slice(0, 80);
    const { rows } = await pool.query(
      "insert into requests(user_id,title,description,city,status) values($1,$2,$3,$4,'open') returning *",
      [user_id, title, clean, (city || "").trim() || null]
    );
    return rows[0];
  },
  async setRequestStatus(id, status) {
    const { rows } = await pool.query("update requests set status=$2 where id=$1 returning *", [id, status]);
    return rows[0] || null;
  },

  // Matches
  async createMatch({ request_id, requester_id, helper_id }) {
    const { rows } = await pool.query(
      "insert into matches(request_id, requester_id, helper_id, status) values($1,$2,$3,'accepted') returning *",
      [request_id, requester_id, helper_id]
    );
    return rows[0];
  },
  async getMatch(id) {
    const { rows } = await pool.query("select * from matches where id=$1 limit 1", [id]);
    return rows[0] || null;
  },
  async updateMatch(id, patch) {
    const fields = [];
    const values = [];
    let i = 1;
    for (const [k, v] of Object.entries(patch)) {
      fields.push(`${k}=$${i++}`);
      values.push(v);
    }
    if (!fields.length) return this.getMatch(id);
    values.push(id);
    const { rows } = await pool.query(`update matches set ${fields.join(", ")} where id=$${i} returning *`, values);
    return rows[0] || null;
  },
  async findMatchByRequest(request_id) {
    const { rows } = await pool.query("select * from matches where request_id=$1 limit 1", [request_id]);
    return rows[0] || null;
  },

  // Wallet
  async addWallet(user_id, amount_cents) {
    const { rows } = await pool.query("update users set wallet_cents = wallet_cents + $2 where id=$1 returning wallet_cents", [user_id, cents(amount_cents)]);
    return rows[0]?.wallet_cents ?? null;
  },
  async deductWallet(user_id, amount_cents) {
    const amt = cents(amount_cents);
    const { rows } = await pool.query(
      "update users set wallet_cents = wallet_cents - $2 where id=$1 and wallet_cents >= $2 returning wallet_cents",
      [user_id, amt]
    );
    return rows[0]?.wallet_cents ?? null;
  },

  // Vouchers
  async createVoucher(code, amount_cents) {
    const { rows } = await pool.query(
      "insert into vouchers(code, amount_cents, status) values($1,$2,'new') returning *",
      [code, cents(amount_cents)]
    );
    return rows[0];
  },
  async getVoucher(code) {
    const { rows } = await pool.query("select * from vouchers where code=$1 limit 1", [code]);
    return rows[0] || null;
  },
  async redeemVoucher(code, user_id) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows: vr } = await client.query("select * from vouchers where code=$1 for update", [code]);
      const v = vr[0];
      if (!v || v.status !== "new") {
        await client.query("rollback");
        return null;
      }
      await client.query("update vouchers set status='redeemed', redeemed_by=$2, redeemed_at=now() where code=$1", [code, user_id]);
      await client.query("update users set wallet_cents = wallet_cents + $2 where id=$1", [user_id, v.amount_cents]);
      await client.query("commit");
      return { ...v, status: "redeemed", redeemed_by: user_id };
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }
};
