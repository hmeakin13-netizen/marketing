# Apex Leads Client Portal

Next.js 14 (App Router) client portal for Apex Leads. Public marketing pages
+ a passwordless-login client dashboard showing live updates (from Notion)
and a weekly Looker Studio report.

## Stack

- **Next.js 14** App Router, TypeScript, Tailwind CSS
- **Supabase** — Postgres (`clients` table with RLS) + Auth (magic link)
- **Notion API** — fetched server-side only, never exposed to the browser
- **Vercel** — deployment target

## Environment variables

Set these in Vercel (Project Settings > Environment Variables) and locally in
`.env.local` (copy `.env.local.example`):

| Variable | Where it's used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase Project Settings > API > Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Supabase Project Settings > API > `anon` `public` key. Safe to expose — access is enforced by RLS, not by keeping this secret. |
| `NOTION_API_KEY` | server only | Notion integration token for the internal integration named "Apex Portal". Never prefixed with `NEXT_PUBLIC_`, so it's never sent to the browser. |

| `SUPABASE_SERVICE_ROLE_KEY` | server only | **Staff portal only.** Used by the admin-only "Add person" / "Deactivate" actions to create or lock a Supabase Auth login. Never prefixed `NEXT_PUBLIC_`, only imported from `src/lib/supabase/admin.ts`, and only reachable after the caller passes the `admin` role check. The client portal never uses it. |

## Supabase setup

1. Create the Supabase project (or use an existing one).
2. In the SQL editor, run `supabase/migrations/0001_create_clients_table.sql`.
   This creates the `clients` table and the RLS policy that restricts each
   logged-in user to their own row (`auth.jwt() ->> 'email' = email`).
3. **Authentication > Providers > Email**: turn **off** "Allow new users to
   sign up". This is what enforces "no public signup" — accounts must be
   created by an admin (see below). Magic link sign-in stays on.
4. **Authentication > URL Configuration**: set the Site URL to your
   production URL (e.g. `https://portal.apex-leads.co.uk`) and add
   `http://localhost:3000/auth/callback` and
   `https://<your-domain>/auth/callback` to the Redirect URLs allow list.

## Notion setup

1. Create a Notion **internal integration** named "Apex Portal" at
   https://www.notion.so/my-integrations and copy its token into
   `NOTION_API_KEY`.
2. For each client's Notion page, open it and click **Share > Connections >
   Apex Portal** to give the integration access. Without this step the API
   call for that client returns a permission error, and the dashboard will
   show the friendly "being set up" message.

## New client creation (exact click path)

No custom admin UI exists for this by design — v1 creates clients by hand:

1. **Supabase Dashboard > Table Editor > `clients`** → **Insert row**.
   Fill in `business_name`, `email` (must exactly match the email you'll
   invite below), `notion_page_id` (the client's Notion page ID — the
   32-character string in the page URL), and optionally `looker_studio_url`
   (the client's Looker Studio **embed** URL, from Looker Studio's
   File > Embed report). Save.
2. **Supabase Dashboard > Authentication > Users** → **Invite user** → enter
   the *same* email address → **Send invitation**. Supabase emails that
   address a magic link automatically.
3. The client clicks the emailed link, which lands on `/auth/callback` and
   signs them straight into `/dashboard`. From then on they log in anytime
   via the normal `/login` page with that same email.

That's the whole flow — no code changes or redeploys needed per client.

## How the Live Updates feed works

Each client's Notion page is fetched fresh on every dashboard load. The
page's top-level blocks are split into "entries" at each heading block
(Heading 1/2/3); the heading text is used as the entry title, and the app
tries to parse a date out of it (`10 July 2026`, `10/07/2026`,
`2026-07-10`, etc.) to sort entries newest-first. Give each update its own
heading with a date in it (e.g. `## 10 July 2026 — New landing page live`)
and the feed will order itself correctly. Entries without a parseable date
fall back to the page's own top-to-bottom order, reversed, and are shown
after the dated ones.

## Error handling

- Missing/invalid `notion_page_id`, no `clients` row, or a Notion API error
  with nothing cached yet → "Your dashboard is being set up, check back
  shortly."
- Notion API error when a previous successful fetch exists → the last-good
  content is shown with a small "showing the last update we could load"
  note. This cache is in-memory per serverless function instance (not a
  database), so it's best-effort — a cold start just falls back to the
  friendly message rather than an error.
- Missing `looker_studio_url` → the Weekly Report card shows the same
  friendly "being set up" message instead of a broken iframe.

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in the three variables above
npm run dev
```

## Deploying to Vercel

1. Push this repo to GitHub (already done if you're reading this from the
   branch) and import it into Vercel.
2. Set the three environment variables above in the Vercel project.
3. Deploy. Root directory is `apex-portal/` if the repo contains other
   projects alongside it.
4. Add the deployed URL to Supabase's Redirect URLs allow list (see
   Supabase setup step 4).

## End-to-end test checklist

Before calling this done, verify with one dummy client row:

- [ ] Insert a dummy row into `clients` with your own email and a real
      Notion page ID (shared with the "Apex Portal" integration).
- [ ] Invite that same email via Authentication > Users > Invite user.
- [ ] Visit `/login`, enter the email, click the emailed link.
- [ ] Confirm you land on `/dashboard` showing your business name.
- [ ] Confirm Live Updates shows content from the Notion page.
- [ ] Add a `looker_studio_url` and confirm the iframe renders.
- [ ] Log out and confirm `/dashboard` redirects to `/login`.
- [ ] Try visiting `/dashboard` in a private window while logged out and
      confirm the redirect to `/login` happens.
- [ ] Temporarily clear `notion_page_id` on the dummy row and confirm the
      dashboard shows the friendly "being set up" message instead of an
      error.

> **Note on this build:** the sandbox this app was built in has no outbound
> network access to Supabase, Notion, or apex-leads.co.uk, so the checklist
> above has not been run against a real project yet — `npm run build` and
> `tsc --noEmit` both pass cleanly, and all public pages were smoke-tested
> locally, but you'll need to run this checklist yourself once real
> credentials are in place.

## Branding note

The real apex-leads.co.uk site wasn't reachable from this build
environment, so the palette (deep green `forest-*` / stone-beige `stone-*`
in `tailwind.config.ts`) and the logo mark at `public/logo.svg` are a
best-effort match from your description rather than pulled directly from
the live site. Swap `public/logo.svg` for the real logo asset and adjust
the hex values in `tailwind.config.ts` if they're off.


---

# Staff portal (`/staff`)

An internal, dark-themed area in the same app for setters, closers, the
manager and the owner. Same Supabase project, same magic-link login, but a
separate login page (`/staff/login`) and separate tables.

## Who sees what

| | Admin | Manager | Closer | Setter |
|---|---|---|---|---|
| Dashboard, calls, deals, leaderboard, targets | ✅ | ✅ | ✅ | ✅ |
| Log own call outcomes / cash | ✅ | ✅ (anyone's) | ✅ | ✅ (calls they set) |
| Edit targets | ✅ | ✅ | – | – |
| Audit trail | ✅ | ✅ | – | – |
| **Team page** (add / remove / roles) | ✅ | – | – | – |
| **Pay & commission** | ✅ | – | – | – |

Pay lives in its own table (`staff_pay`) whose RLS policy only allows
`admin`, so nobody else can read it even by calling the API directly. Everyone
can see each other's performance numbers (leaderboard), by design.

## One-time setup

1. Run `supabase/migrations/0002_staff_portal.sql` in the Supabase SQL editor.
2. Add `SUPABASE_SERVICE_ROLE_KEY` (Project Settings > API > `service_role`)
   to Vercel and `.env.local`.
3. Create **your** admin row (use your real login email), and also create that
   user in Authentication > Users > Add user (tick "Auto confirm"):
   ```sql
   insert into public.staff (email, full_name, role)
   values ('you@example.com', 'Your Name', 'admin');
   ```
4. Visit `/staff/login`, sign in with the emailed link. From here, add
   everyone else on the **Team** page — no more SQL.

## Adding / removing people

- **Add:** Team > Add a person (name, email, role). The app creates their
  login; they go to `/staff/login` and enter their email. No passwords.
- **Remove:** Team > Deactivate. Their login is locked and they lose access at
  once, but all their calls, closes and stats are kept. You can reactivate.
- Change a role or name any time from the same page.

## How the numbers are calculated

- **Calls booked** – calls counted on the day they were *booked*.
- **Show rate** – showed ÷ (showed + no-shows), by the day the call happened.
  "Showed" = outcome is *follow up*, *lost* or *closed*. Cancellations are excluded.
- **Close rate** – closed ÷ showed.
- **Cash collected** – sum of payments received in the period. A close is
  logged with the deal value + cash taken today; later payments are added on
  the Deals page. Outstanding = deal value − payments.
- A setter's cash/close credit comes from calls they booked; a closer's from
  calls they took. Days/weeks/months roll over at **UK** midnight, weeks start Monday.
- **Commission** (admin only) = % × cash collected in the period, on a basis
  you choose per person (their closes, the calls they set, or all team cash).

## Audit trail

Database triggers record every insert / edit / delete on calls, deals and
payments (who, when, old → new values). Managers and admin can read it at
`/staff/audit`; nobody can edit it.

## Not built yet (next phases)

Flags for "dropped the ball" (unchased deposits, missing outcomes), Calendly
sync + calendar view, GHL appointment sync, daily dials form, and the
Slack/email digest. Campaign/source is a manual field on each booked call for
now; it can be filled automatically from Calendly UTMs in the Calendly phase.
