# WeTrust (complete web + api)

This is a complete, working prototype:
- Web: Next.js (pages router) with your design, responsive for PC/mobile
- API: Fastify with SMS login, requests/matches, escrow-like payments (Stripe manual capture), Connect Express, vouchers, Stream chat, contact emails

## Local quick start (no external accounts)
API:
- copy `api/.env.example` -> `api/.env`
- set `JWT_SECRET`
- keep `MOCK_SMS=true`, `MOCK_STRIPE=true`, `MOCK_STREAM=true`
- `cd api && npm install && npm run dev`

WEB:
- copy `web/.env.example` -> `web/.env.local`
- set `NEXT_PUBLIC_API_URL=http://localhost:4000`
- `cd web && npm install && npm run dev`

## Production
Set real keys for Twilio/Stripe/Stream and (recommended) set `DATABASE_URL`.
