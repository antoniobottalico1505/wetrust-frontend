# WeTrust Web (v2)

## Run local
1. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_URL`
2. Install + run
```bash
npm install
npm run dev
```

Open http://localhost:3000

## Notes
- Payments UI (Stripe) requires a publishable key in `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Chat UI (Stream) requires `NEXT_PUBLIC_STREAM_API_KEY` AND Stream keys on API.
