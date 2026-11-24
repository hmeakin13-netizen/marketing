-- Contract wording version 2 for every tier, taken from Harry's own service agreement (23 Nov 2026)
-- and adapted to the tiers: no setup fee, the tier's fee, ad spend, guarantee, exclusive area and minimum term.
-- Version 1 is kept. Needs the portal code that understands {{services_extra}} to be live first.
insert into public.contract_templates (tier, version, body)
select t.key, 2, $tpl$APEX-LEADS
SERVICE AGREEMENT

This Agreement is made between:
Apex Leadgen LTD, trading as Apex Leads (“Agency”), and
{{business_name}} (“Client”).
Effective Date: {{start_date}}
Plan: {{tier_name}}

1. Services
- Facebook & Instagram ad campaigns, built and run inside Client's own ad account.
- Ongoing optimisation of targeting, creative and budget.
- Qualified enquiries delivered to Client, visible in the Apex Leads client portal.
- Direct support via a WhatsApp group with Agency.
{{services_extra}}

2. Fees
- Monthly fee: {{monthly_fee}} a month. The first month is due on signing, before work begins. Billed automatically each month after that.
- Setup fee: None.
- Ad spend: Separate — Client pays Meta directly, minimum {{ad_spend}}/day. Agency never holds or refunds ad spend.
- Refunds: Non-refundable once work has commenced.

3. Lead Guarantee
{{guarantee}}

4. Client Responsibilities
- Onboarding call within 48 hours of payment.
- Grant Agency full access, not partial, to your Facebook Page, ad account and any connected assets (including Partner access with full control), so Agency can build and run the campaign and complete the automation. You keep ownership of your data.
- Provide the business info, logo and photos needed to build the campaign.
- Respond to enquiries promptly — converting them is your responsibility.

5. Term and Cancellation
{{term}}

6. Confidentiality
Both parties will keep confidential any business, financial or performance information shared during this engagement.

Signatures
This Agreement may be signed electronically. Typing your full name on the Apex Leads signing page and ticking the box to agree constitutes a valid electronic signature and acceptance of these terms.

Client name: {{contact_name}}
Client signature: ______________________________
Date: ______________________________

Agency representative (Apex Leads): Harry Meakin
Signature: Hmeakin
Date: ______________________________

Apex Leads · info@apex-leads.co.uk · 07886 068962$tpl$
from public.offer_tiers t
where not exists (select 1 from public.contract_templates c where c.tier = t.key and c.version >= 2);
