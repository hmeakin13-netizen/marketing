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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Supabase Project Settings > API > `anon`/publishable key. Safe to expose — access is enforced by RLS, not by keeping this secret. |
| `NOTION_API_KEY` | server only | Notion integration token for the internal integration named "Apex Portal". Never prefixed with `NEXT_PUBLIC_`, so it's never sent to the browser. |
| `ANTHROPIC_API_KEY` | server only | Optional. Powers the one-line AI summary on the dashboard and the weekly digest email body. Both features silently do nothing without it. |
| `RESEND_API_KEY` | server only | Optional. Needed for the weekly digest cron to send email. Separate from (can reuse the same value as) the SMTP key configured inside Supabase Auth. |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Optional, only needed for the weekly digest cron. Supabase Project Settings > API > `service_role` `secret` key. **This bypasses Row Level Security entirely** — never prefix it with `NEXT_PUBLIC_`, never share it, never put it anywhere but Vercel's env vars. |
| `CRON_SECRET` | server only | Optional, only needed for the weekly digest cron. Any random string you make up — Vercel automatically sends it as a bearer token when it triggers the cron, and the route checks it matches before doing anything. |
| `SITE_URL` | server only | Optional. Your production URL (e.g. `https://portal.apex-leads.co.uk`), used to build the "View your dashboard" link in digest emails. Falls back to a hardcoded default if unset. |
| `DIGEST_FROM_EMAIL` | server only | Optional. Sender address for digest emails, must be on a domain verified in Resend. Defaults to `updates@portal.apex-leads.co.uk`. |

Only the first three are required for the core app (login, dashboard, Notion
feed). The rest are optional — the AI summary and weekly digest features
degrade gracefully (just don't run) if their env vars are missing, so you can
add them whenever you're ready rather than all at once.

## Supabase setup

1. Create the Supabase project (or use an existing one).
2. In the SQL editor, run each migration in `supabase/migrations/` **in order**
   (0001, then 0002, then 0003). 0001 creates the `clients` table and its RLS
   policy; 0002 adds `last_seen_at` (powers the "New" badges); 0003 creates the
   `updates` archive table that mirrors every Notion entry Supabase-side.
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
