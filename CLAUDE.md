# Apex-Leads: handover for every Claude chat

Read this first. It tells a new chat what the business is, where everything lives and how Harry wants to work. The live source of truth for facts is the database (below); this file says where to look.

## The business (19 Nov 2026)
- Apex-Leads (Apex Leadgen Ltd): UK lead generation for outdoor trades (tree surgeons first, then roofers and landscapers). Owner: Harry. US (Florida) launch planned.
- Offer: £1,500 first payment (£1,000 month one + £500 setup) then £1,000 a month, same for everyone. Client pays their own ad spend (minimum £20 a day) direct to Meta and owns the Page, ad account and data. Guarantee: 30 qualified leads in 60 days, free work until met. Rolling monthly, 7 days' notice. One client per trade per 10 to 15 km area.
- Live clients: Sovereign Roofing and Building (Kent; Rob and Bobby Friend), Efficient Roofing (North London; James O'Leary), Eco Ground Solutions (West Midlands landscaper; Jim Parry and Serron Harewood; ads blocked by a Meta payment problem), JRP Landscape and Gardening (Jamie; setup not finished). Starting: Nathan Hughes (2 Dec), Mateusz Brudecki (4 Jan). Gone: Dreamy Landscapes, Elite Roofing (Sam Mccan), FG Landscaping (Florin). Unknown: Kian Fouche, Michael Bond.
- Team (commission): setters Saagar and Kyle, closer Dan Ries, Harry closes too.
- Full facts: Supabase table `team_playbooks`, key `business_facts`. Current rules and orders: key `standing_rules` (newest lines win).

## Where everything lives
- **Supabase** project `dwzjonbidydufmeymhri`: clients (`ad_client_profiles`, `retainer_clients`, `care_contacts`), ads (`ad_proposals`, `ad_tests`, `ad_daily`, `ad_activity`), desks (`ad_agents`, `ad_agent_events`, `ad_research_queue`), Harry's orders and answers (`harry_orders`), client care (`care_drafts`, `client_health`, `client_outcomes`), sales (`calls`, `sales_drafts`, `sales_moves`, `setter_daily`), staff (`staff`).
- **Team portal**: `apex-staff/` (Next.js on Vercel project `marketing-apex-staff`). Pages read the tables above. Questions for Harry show on the portal home.
- **Meta ads monitor**: `meta-ads-monitor/` (hourly GitHub Action). Client list in `meta-ads-monitor/config/clients.json`.
- **AI desks**: about 26 scheduled tasks (claude-code-remote triggers) running about 58 roles. Each prompt starts with a CURRENT CLIENTS paragraph that makes it read clients from the database. The Ops Auditor and Portal Checker runs at 06:25 and 13:25 London and flags drift.
- **GoHighLevel** location `f9Ds82Vhe1EWVVl65VOk`; Marketing Pipeline `W2ilSmqPa9y2flbkz6B0`. Client lead alerts are GHL workflows Harry builds.
- **Meta ad accounts**: Sovereign 2051994528838795, Efficient 1726310475597012, Eco Ground 2545632992580003, Apex own 27050808927935172, ParCases (Harry's old account) 4568991166708743.
- **Production branch**: `claude/init-marketing-repo-wEaa9` (default). Push there only with Harry's yes.

## How Harry works
- He voice-dictates, is busy and direct. Reply short, plain UK English, lead with the answer, no waffle. Act on clear instructions instead of asking again.
- Never message clients or prospects without his approval. Never remove the SMS or email opt-out (legal requirement).
- Client ads: real photos only (no AI images), no prices, no made-up claims, no absolute words (never, every, all, nobody).
- When he gives facts or decisions, write them into the database (business_facts or standing_rules) so the desks pick them up. Do not leave them only in chat.

## Which chat does what
- **Apex HQ** (Claude Code): day-to-day running, desks, data fixes, ads launches and client onboarding.
- **Apex Portal dev** (Claude Code): building portal features (next: an Add client form that fills every table in one go, and a simpler dashboard).
- claude.ai Projects for thinking and writing: Business plan and money, Sales and hiring, Ad copy and creative.
