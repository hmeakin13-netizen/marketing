# Vinted Lister

Two parts:

1. **Chrome extension** (`extension/`): adds a panel to Vinted's "Sell an item" page. Drop in photos, Claude writes the listing, one click fills Vinted's whole form (photos, title, description, category, brand, size, condition, colour, parcel size, price). The seller reviews and presses Vinted's own Upload button.
2. **Web app** (this Next.js project): the API the extension calls, plus plans, quota and the extension key. It also works standalone as a copy-and-paste listing writer.

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

## Install the extension

1. `npm run dev` (needs `ANTHROPIC_API_KEY` in `.env.local`).
2. Open `http://localhost:3000`, press **Show my extension key**.
3. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → pick the `extension/` folder.
4. The settings page opens from the panel (or the extension's Options): paste the key, keep the address `http://localhost:3000`, Save, and accept the permission prompt.
5. Go to `vinted.co.uk` → Sell an item. The panel appears bottom-right.

Only `vinted.co.uk` is matched so far. Adding another country means adding its domain to `manifest.json` and checking the option text (dropdown labels are matched by text, so they're language-specific).

## The Vinted selectors are unverified

`extension/selectors.js` holds every Vinted-specific selector. They are best guesses: Vinted needs a logged-in session so they could not be checked against the live site. After "Fill Vinted form" the panel lists every field it filled and every field it couldn't. Fix a failing field by editing `selectors.js` (open DevTools on the Vinted field, copy its `data-testid`). The fill logic itself is covered by jsdom tests in `extension/test/`.

By design the extension never presses Vinted's Upload button, and it only acts when the seller clicks. There's no background posting, no multi-account handling and no bot-detection evasion.

## What's a prototype

- **Identity** is an anonymous cookie (`src/lib/session.ts`) and **usage** is a JSON file (`src/lib/usage-store.ts`). Anyone can reset their trial by clearing cookies. Replace both with Supabase auth + `supabase/migrations/0001_usage.sql` before charging.
- **No payments yet.** Stripe Checkout + webhook should set `profiles.plan` and `period_start`.
- **Extension key = user id.** The extension authenticates with the same id the cookie holds, so it's effectively a password and can't be revoked. Move to Supabase auth with revocable per-device tokens before charging.
- **Vinted's terms.** Vinted has no public seller API and its terms restrict automation. Filling the form inside the seller's own browser is the lowest-risk approach, but it's still a grey area and Vinted can change its markup or its rules at any time.
- **Prices are estimates.** The model has no live sold-listing data.
