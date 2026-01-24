const Stripe = require("stripe");
const twilio = require("twilio");
const { StreamChat } = require("stream-chat");
const crypto = require("crypto");

function moneyToCentsEUR(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function calcFee(priceCents) {
  const bps = Number(process.env.PLATFORM_FEE_BPS || 1500); // 15%
  const fixed = Number(process.env.PLATFORM_FEE_FIXED_CENTS || 49);
  return Math.round((priceCents * bps) / 10000) + fixed;
}

function isMock(name) {
  return String(process.env[name] || "").toLowerCase() === "true";
}

// --- SMS (Twilio Verify) ---
function smsService() {
  const mock = isMock("MOCK_SMS");
  if (mock) {
    return {
      async sendOtp(phone) { return { ok: true, mock: true }; },
      async verifyOtp(phone, code) { return { ok: code === "000000" }; },
    };
  }
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  return {
    async sendOtp(phone) {
      await client.verify.v2.services(serviceSid).verifications.create({ to: phone, channel: "sms" });
      return { ok: true };
    },
    async verifyOtp(phone, code) {
      const res = await client.verify.v2.services(serviceSid).verificationChecks.create({ to: phone, code });
      return { ok: res.status === "approved" };
    }
  };
}

// --- Stripe ---
function stripeService() {
  const mock = isMock("MOCK_STRIPE");
  if (mock) {
    return {
      mock: true,
      async createExpressAccount() {
        return { id: "acct_mock_" + crypto.randomBytes(6).toString("hex") };
      },
      async createAccountLink({ account, refresh_url, return_url }) {
        return { url: return_url };
      },
      async createPaymentIntent({ amount, currency, metadata }) {
        // client_secret mock for frontend
        return { id: "pi_mock_" + crypto.randomBytes(6).toString("hex"), client_secret: "cs_test_mock_" + crypto.randomBytes(10).toString("hex"), status: "requires_capture" };
      },
      async capturePaymentIntent(id) {
        return { id, status: "succeeded" };
      },
      async transfer({ amount, currency, destination }) {
        return { id: "tr_mock_" + crypto.randomBytes(6).toString("hex") };
      }
    };
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  return {
    stripe,
    mock: false,
    calcFee,

    async createExpressAccount() {
      const account = await stripe.accounts.create({
        type: "express",
        country: process.env.STRIPE_ACCOUNT_COUNTRY || "IT",
        capabilities: { transfers: { requested: true } }
      });
      return account;
    },

    async createAccountLink({ account, refresh_url, return_url }) {
      const link = await stripe.accountLinks.create({
        account,
        refresh_url,
        return_url,
        type: "account_onboarding"
      });
      return link;
    },

    async createPaymentIntent({ amount, currency, metadata }) {
      // manual capture => hold, then capture on release (max window depends on card network, usually 7 days)
      const pi = await stripe.paymentIntents.create({
        amount,
        currency,
        capture_method: "manual",
        automatic_payment_methods: { enabled: true },
        metadata
      });
      return pi;
    },

    async capturePaymentIntent(id) {
      const pi = await stripe.paymentIntents.capture(id);
      return pi;
    },

    async transfer({ amount, currency, destination }) {
      const tr = await stripe.transfers.create({
        amount,
        currency,
        destination
      });
      return tr;
    }
  };
}

// --- Stream Chat ---
function streamService() {
  const mock = isMock("MOCK_STREAM");
  if (mock) {
    return {
      mock: true,
      apiKey: "mock",
      async ensureChannel({ channelId }) { return { channelId, created: true }; },
      async userToken() { return "mock-token"; }
    };
  }
  const apiKey = process.env.STREAM_API_KEY;
  const apiSecret = process.env.STREAM_API_SECRET;
  const serverClient = StreamChat.getInstance(apiKey, apiSecret);
  return {
    mock: false,
    apiKey,
    serverClient,
    async ensureUser(user) {
      await serverClient.upsertUser({ id: user.id, name: user.phone });
    },
    async ensureChannel({ channelId, members, data }) {
      const channel = serverClient.channel("messaging", channelId, { members, ...data });
      await channel.create();
      return { channelId };
    },
    async userToken(userId) {
      return serverClient.createToken(userId);
    }
  };
}

module.exports = { smsService, stripeService, streamService, moneyToCentsEUR, calcFee };
