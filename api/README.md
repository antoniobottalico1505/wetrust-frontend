# WeTrust API (v2)

## Quick start (local)
1. Copy `.env.example` to `.env` and set at least:
   - `JWT_SECRET`
   - `MOCK_SMS=true`
   - `MOCK_STRIPE=true`
   - `MOCK_STREAM=true`
   - SMTP settings (optional for contacts)

2. Install + run
```bash
npm install
npm run dev
```

API runs on `http://localhost:4000`

## Production (recommended)
- Use Postgres (Render Postgres / Supabase) and set `DATABASE_URL`
- Set `MIGRATE_ON_START=true` once to create tables
- Use real Twilio Verify, Stripe and Stream keys
