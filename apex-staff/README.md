# Apex Leads Team Portal

Internal portal for setters, closers, the manager and the owner. Separate from
the client portal (`apex-portal/`): its own app, its own URL, its own Supabase
project and logins.

**Stack:** Next.js 14 (App Router), TypeScript, Tailwind, Supabase (Postgres + RLS + magic-link auth), Vercel.

## What it does

- **Dashboard** – calls booked, calls taken, show rate, close rate, cash collected, cash forecast, setter handoff quality, results by campaign/source
- **Needs attention** – auto-flags where the ball was dropped: unchased deposits/balances, overdue payments, calls with no outcome, no-shows never followed up, cold follow-ups. Staff log a chase with a note; managers see it by person
- **Calendar** – week view of every booked call, with closer and outcome
- **Settings** (admin) – connect Calendly, set closer shifts
- **Calls** – book calls, log outcomes (closed / follow up / lost / no-show / cancelled), recording links
- **Deals & cash** – deal value, payments received, what's still owed, due dates, overdue flags
- **Leaderboard** – day / week / month, closers and setters
- **Targets** – per-person weekly and monthly KPIs with progress bars
- **Audit trail** – every change to calls, deals and payments (managers + admin)
- **Team** – add / remove people, change roles (admin only)
- **Pay & commission** – admin only: retainer/flat fee, commission (paid on the 1st and/or the 15th), and an override on the setters someone manages
- **Invoices** – admin only: self-billing invoices (PDF) created automatically each pay run and emailed to the business inbox

| | Admin | Manager | Closer | Setter |
|---|---|---|---|---|
| Dashboard, calls, deals, leaderboard, targets | ✅ | ✅ | ✅ | ✅ |
| Edit targets, audit trail | ✅ | ✅ | – | – |
| Team page, Pay & commission | ✅ | – | – | – |

Pay lives in its own table (`staff_pay`) with admin-only row-level security, so
no other role can read it even by calling the API directly.

## Setup

### 1. Supabase (its own project)
1. Create a new Supabase project for the team portal.
2. SQL editor → run `supabase/migrations/0001_staff_portal.sql`, then `0002_chases.sql`.
3. **Authentication → Sign In / Providers → Email**: keep Email on, turn **off** "Allow new users to sign up".
4. **Authentication → URL Configuration**: Site URL = your team URL (e.g. `https://team.apex-leads.co.uk`); add `https://team.apex-leads.co.uk/auth/callback` and `http://localhost:3000/auth/callback` to Redirect URLs.
5. Create your admin. **Authentication → Users → Add user → Create new user**, your email, tick **Auto Confirm User**. Then in the SQL editor:
   ```sql
   insert into public.staff (email, full_name, role)
   values ('you@example.com', 'Your Name', 'admin');
   ```

### 2. Vercel (its own project, same repo)
1. Import this GitHub repo as a **new** Vercel project, with **Root Directory = `apex-staff`**.
2. Environment variables (see `.env.local.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
3. Add the domain (e.g. `team.apex-leads.co.uk`) under Project → Settings → Domains, plus the DNS record Vercel shows.

### 3. Log in and add the team
Open the site, enter your email, click the emailed link. Then **Team → Add a person** for Jish (manager), Kyle (setter), Dan (closer). No passwords: they enter their email and get a link.

## Removing people
Team → Deactivate. Their login is locked and they lose access at once, but all their calls, closes and stats are kept. Reactivate any time.

## How the numbers work
- **Calls booked** – counted on the day the call was *booked*.
- **Show rate** – showed ÷ (showed + no-shows), by the day the call happened. Cancellations are excluded.
- **Close rate** – closed ÷ showed.
- **Cash collected** – payments received in the period; outstanding = deal value − payments.
- A setter is credited for calls they booked; a closer for calls they took.
- Days/weeks/months roll over at **UK** midnight; weeks start Monday.
- **Commission** (admin only) = % × cash collected in the period, on a basis chosen per person.

## Local development
```bash
npm install
cp .env.local.example .env.local   # fill in
npm run dev
```

## Not built yet
GHL sync, daily dials form, Slack/email digest. Campaign/source is a manual field on each booked call for now.

## Calendly
Settings → paste a Calendly personal access token → bookings and cancellations arrive automatically (webhook, Standard plan or above).
- The **closer** is picked from the time of the call using the shifts set under Settings (UK time), so one shared event type works.
- Tag a setter's link with `?utm_content=kyle` to credit them; `utm_campaign` (or `utm_source`) becomes the call's source.
- Webhook endpoint: `/api/calendly/webhook` (public, but only accepts requests signed with the key stored at connect time).
- Migrations: `0003` is applied in the live project as `staff_portal_6/7`; see `supabase/migrations/0003_calendly.sql`.

## Pay runs and self-billing invoices
Set per person under **Pay & commission**:
- **Retainer / flat fee** – fixed £ per month, paid on the 1st.
- **Commission %** on cash collected, either once a month (the 1st) or **twice a month**: sales from the **1st–14th are paid on the 15th**; sales from the **15th–month end are paid on the 1st**.
- **Override %** on sales set by the setters someone manages (set "Reports to" on the Team page), paid on the 1st for the month just ended; calculated on deal value of new sales or on cash collected.

A daily job (`vercel.json` cron → `/api/cron/invoices`) creates one self-billing invoice per person per pay run and emails the PDF to `INVOICE_TO` (default info@apex-leads.co.uk). It's safe to run repeatedly: one invoice per person per run.

Environment variables for invoices: `CRON_SECRET` (protects the job), `RESEND_API_KEY` + `EMAIL_FROM` (to send email), optional `INVOICE_TO`, `COMPANY_NAME`, `COMPANY_ADDRESS`, `COMPANY_VAT`.
