# Vinted Lister

Upload photos of an item, get a Vinted-ready listing (title, description, category, condition, parcel size, suggested price) written by Claude. The seller copies it into Vinted themselves.

## Plans

| Plan | Price | Allowance |
|---|---|---|
| Free trial | Free | 5 listings, lifetime |
| Starter | £10/month | 30 listings per month |
| Unlimited | £30/month | No plan limit (hard fair-use cap of 1,000/month in `src/lib/plans.ts`) |

Quota is checked before the Claude call, and a listing is only counted after one was successfully generated.

## Run

```bash
cp .env.example .env.local   # add ANTHROPIC_API_KEY
npm install
npm run dev
npm test
```

`LISTING_MODEL` overrides the model (default `claude-opus-5-5`). A listing is roughly 3 photos in and about 500 tokens out, so cost per listing is a few pence; check real `usage` numbers before fixing prices.

## What's a prototype

- **Identity** is an anonymous cookie (`src/lib/session.ts`) and **usage** is a JSON file (`src/lib/usage-store.ts`). Anyone can reset their trial by clearing cookies. Replace both with Supabase auth + `supabase/migrations/0001_usage.sql` before charging.
- **No payments yet.** Stripe Checkout + webhook should set `profiles.plan` and `period_start`.
- **No Vinted integration.** Vinted has no public seller API and automating the site is against its terms. The planned next step is a browser extension that fills the upload form in the seller's own logged-in browser; the seller clicks Upload.
- **Prices are estimates.** The model has no live sold-listing data.
