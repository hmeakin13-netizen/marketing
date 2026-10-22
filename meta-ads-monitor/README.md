# Meta Ads Monitor

Read-only daily check on the Apex-Leads Meta ad accounts. Produces one short morning message:
guarantee progress per client, ad health, and what to look at first. It never changes anything in
Meta: the API client only issues GET requests (and a test enforces it).

```
python -m monitor demo            # message from made-up data (mirrors the brief)
python -m monitor check-config    # what's still missing in config/clients.json
python -m monitor run             # pull from Meta, print the message
python -m monitor run --send slack|email
python -m unittest discover -s tests -t .
```

Python 3.11+, standard library only.

## Setup

1. **Settings**: edit `config/clients.json`. Replace every `act_REPLACE_ME`, confirm the go-live dates
   (FG and Dreamy are inferred from "day 10" / "day 3" on 22 Oct), set Elite's `free_trial_from` and
   `leads_owed` (leads owed *as at* `free_trial_from`; leads delivered since are subtracted automatically).
2. **Token**: in Business Settings > Users > System Users, create a system user, assign the 5 ad accounts
   (read access), and generate a token. Put it in `META_ACCESS_TOKEN` (env var or CI secret). Never commit it.
   Needs `ads_read`. Pulling individual leads needs lead-retrieval permissions on top (`leads_retrieval`, plus
   page permissions); **I couldn't confirm the current exact list from Meta's docs, so check before generating the token.**
3. **API version**: defaults to `v26.0` (latest at time of writing); override with `META_API_VERSION`.
   Meta is deprecating older and unversioned calls on 27 Oct 2026, so don't pin lower.
4. **Delivery**: `--send stdout` (default), `slack` (`SLACK_WEBHOOK_URL`), or `email`
   (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `EMAIL_TO`). WhatsApp isn't built.

## Marking a lead as "doesn't count"

Every lead counts by default. The lead log is `data/leads.csv` (gitignored: it holds names). From a terminal:

```
python -m monitor leads list --client "Dreamy Landscapes"
python -m monitor leads exclude <lead_id> --note "wrong number"
python -m monitor leads include <lead_id>
```

That is not phone-friendly. The log is isolated behind `LeadStore` (`monitor/leads.py`), so the intended
next step is a Google Sheet (counts checkbox) or a Supabase table, which also lets a scheduled job keep
state between runs. Re-syncing never resets an exclusion.

## How the numbers work

- Everything runs to the end of **yesterday**; "day N" = full days of data since go-live.
- Pace line = required ÷ window × day. Recent rate = counted leads in the last 5 days ÷ 5 (under 5 days
  live: all-time rate, labelled "Too early to call"). Projected = counted + recent rate × days left.
- AHEAD / ON PACE / AT RISK (75–99%) / WILL MISS (<75%) as in the brief. Only counted leads count.
- Window over and short of the target: the client is switched to free trial automatically, with leads
  owed = shortfall and spend since the window ended. No stored state; it's recomputed from the lead log each run.
- Max CPL = daily budget × window ÷ leads required (£40 for 30-in-60, £24 for 25-in-30 at £20/day);
  target = 75% of max. Both overridable per client. CPL uses the last 5 days (or since go-live).
- Flags: zero leads (amber at 1× max CPL spent, red at 2×), test rule (£100 then keep/kill),
  frequency (3 / 4), CTR down >20% week on week, delivery (rejected ads, account limits/payment failure,
  active campaign not spending yesterday), and a "lead log is short of Meta's count" sync check.

## Known gaps / things to check on real data

- Meta's `actions` list can report leads under several action types; `collect.py` counts `lead` only.
- The "lead log short of Meta" check can false-alarm for accounts that also record pixel leads.
- No scheduler yet. It needs somewhere to keep the lead log between runs (see above), then a daily
  cron / GitHub Action calling `python -m monitor run --send ...`.
- An ad is "new" if it has spent under £100; there's no ad-creation-date logic.
