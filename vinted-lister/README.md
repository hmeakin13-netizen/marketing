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

### Vinted accounts (one per subscription, extras £20/month)

Every subscription includes **1 Vinted account**. Each extra account is **£20/month** on top of the plan (not available on the free trial). Examples: Starter + 1 extra = £30/month; Unlimited + 2 extras = £70/month.

- **Each account gets the plan's full allowance** (Starter with 2 accounts = 60 listings/month). To share one pool across accounts instead, change `checkQuota` in `src/lib/plans.ts`.
- **A listing names its Vinted account** (`vintedAccount`). The first listing for an account claims a slot; once slots are full, a new account gets `403 account_not_linked` and an offer to add one.
- **Slot swapping is limited:** a slot can be unlinked once per 30 days, otherwise the limit is trivial to dodge by unlinking and relinking.
- **How the account is known:** the extension reads the logged-in Vinted user (`extension/account.js`; one same-origin request, unverified endpoint) and falls back to asking for the username. The phone web app can't see Vinted, so the username there is self-declared. It stops casual sharing but a determined user can type any name. Real enforcement only exists where the extension can verify the logged-in account.
- **Add-ons can't be bought yet.** `extraAccounts` is set by the billing integration, which doesn't exist yet (Stripe: add-on = a quantity on a second price).

## Run

```bash
cp .env.example .env.local   # add ANTHROPIC_API_KEY
npm install
npm run dev
npm test
```

`LISTING_MODEL` overrides the model (default `claude-opus-5-5`). A listing is roughly 3 photos in and about 500 tokens out, so cost per listing is a few pence; check real `usage` numbers before fixing prices.

## On a phone

The web app is the main product for phone sellers (the extension only works in desktop Chrome):

1. **Take photo / From gallery:** up to 5, shrunk on the phone to ~1600px before upload (phone photos are often 5-10MB).
2. **Your listing:** one card per field in the order Vinted's form asks, each with a big **Copy** button, plus **Copy everything** and **Open Vinted**. Title, description and price are editable. Fields the photos didn't show (usually brand/size) say so instead of guessing.
3. **Save to phone:** photos taken in the browser may not be in the camera roll, so this hands them to the share sheet.
4. **Install:** Add to Home Screen gives a full-screen app (manifest + icons in `public/`; no service worker, so it needs a connection).

Not verified on a real phone: the camera button (`capture`), the share sheet, and whether "Open Vinted" opens the Vinted app or the website. Test on both iPhone and Android. Syncing phone photos to the laptop extension needs real accounts + photo storage first and isn't built.

## Install the extension

1. `npm run dev` (needs `ANTHROPIC_API_KEY` in `.env.local`).
2. Open `http://localhost:3000`, press **Show my extension key**.
3. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → pick the `extension/` folder.
4. The settings page opens from the panel (or the extension's Options): paste the key, keep the address `http://localhost:3000`, Save, and accept the permission prompt.
5. Go to `vinted.co.uk` → Sell an item. The panel appears bottom-right.

Only `vinted.co.uk` is matched so far. Adding another country means adding its domain to `manifest.json` and checking the option text (dropdown labels are matched by text, so they're language-specific).

## Market pricing ("sold data")

**Vinted publishes no sold-price data**, so this is not true sold data. The panel's **Check market price** button runs one search on Vinted from the seller's own logged-in tab (brand + item type, e.g. "Zara Midi dresses"), and `extension/pricing.js` turns the results into a recommendation: outliers trimmed, median and range worked out, and a suggested price.

- **Asking vs sold:** comps are other sellers' asking prices, which overstate what items sell for, so the recommendation is discounted by `ASKING_TO_SOLD` (0.9) and adjusted by condition (`CONDITION_FACTOR`). **Both are starting assumptions, not measured values.** Calibrate them with real sold prices.
- If enough returned items are flagged sold, those are used instead, with no discount. Whether Vinted's response flags that is unverified.
- Fewer than 5 comparables means no recommendation; the model's estimate stays.
- Guard rails: one request per click, never automatic, 10 minute cache, no pagination or crawling, gives up on 401/403/429 without retrying. The endpoint is Vinted's undocumented internal API and its response shape is unverified (needs a logged-in session). Failures show up in the panel instead of breaking anything.
- Real sold data would come from recording outcomes: when a user marks an item sold, store the ask and sold price. Not built yet; it is the way to calibrate the two constants above.

## The Vinted selectors are unverified

`extension/selectors.js` holds every Vinted-specific selector. They are best guesses: Vinted needs a logged-in session so they could not be checked against the live site. After "Fill Vinted form" the panel lists every field it filled and every field it couldn't. Fix a failing field by editing `selectors.js` (open DevTools on the Vinted field, copy its `data-testid`). The fill logic itself is covered by jsdom tests in `extension/test/`.

By design the extension never presses Vinted's Upload button, and it only acts when the seller clicks. There's no background posting, no multi-account handling and no bot-detection evasion.

## Vercel

Own project: `marketing-vinted-lister` (root directory `vinted-lister`, linked to this repo). Vercel Auth is on, so only your Vercel team can open it while there are no real logins. Add `ANTHROPIC_API_KEY` under Project Settings → Environment Variables (Production + Preview), then redeploy. **Extension against the Vercel URL:** Vercel Auth also blocks the extension, which can't log in. Protection Bypass for Automation is enabled on the project and its secret is exposed to the app as `VERCEL_AUTOMATION_BYPASS_SECRET`, so the web page (once you're logged in) shows it under the extension key. Paste both into the extension settings; **Save & test connection** reports what's wrong if it still fails. On Vercel, usage is stored in the temp dir, which is ephemeral: plan limits can reset. That's fine for testing and not for charging.

## What's a prototype

- **Identity** is an anonymous cookie (`src/lib/session.ts`) and **usage** is a JSON file (`src/lib/usage-store.ts`). Anyone can reset their trial by clearing cookies. Replace both with Supabase auth + `supabase/migrations/0001_usage.sql` before charging.
- **No payments yet.** Stripe Checkout + webhook should set `profiles.plan` and `period_start`.
- **Extension key = user id.** The extension authenticates with the same id the cookie holds, so it's effectively a password and can't be revoked. Move to Supabase auth with revocable per-device tokens before charging.
- **Vinted's terms.** Vinted has no public seller API and its terms restrict automation. Filling the form inside the seller's own browser is the lowest-risk approach, but it's still a grey area and Vinted can change its markup or its rules at any time.
- **Prices are estimates.** The model has no live sold-listing data.
