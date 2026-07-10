const sections = [
  {
    heading: "1. Introduction",
    body: `These Terms & Conditions ("Terms") govern your use of the Apex Leads Client Portal (the "Portal"), provided by Apex Leads, company number [00000000], registered office at [Apex Leads registered address, UK] ("Apex Leads", "we", "us"). By logging in, you agree to these Terms.`,
  },
  {
    heading: "2. Access to the Portal",
    body: `Access to the Portal is provided only to active Apex Leads clients. Accounts are created by us and access is granted via a passwordless email link sent to the email address on your account. You must keep access to that email address secure — you are responsible for all activity under your account.`,
  },
  {
    heading: "3. Acceptable use",
    body: `You agree to use the Portal only for its intended purpose of reviewing your own campaign updates and reports. You must not attempt to access another client's data, interfere with the Portal's operation, or use the Portal for any unlawful purpose.`,
  },
  {
    heading: "4. Service availability",
    body: `We aim to keep the Portal available at all times but do not guarantee uninterrupted access. The Portal depends on third-party infrastructure (including Supabase, Notion, Google Looker Studio and Vercel) and we are not liable for downtime caused by those providers.`,
  },
  {
    heading: "5. Content accuracy",
    body: `We aim to keep the updates and reports shown in the Portal accurate and current, but figures shown (including in embedded Looker Studio reports) may be subject to reporting delays from third-party ad platforms and should be treated as indicative.`,
  },
  {
    heading: "6. Intellectual property",
    body: `All content, branding and design within the Portal remains the property of Apex Leads. You may not copy, resell or redistribute Portal content outside of your own internal business use.`,
  },
  {
    heading: "7. Fees and cancellation",
    body: `Access to the Portal is provided as part of your wider engagement with Apex Leads and is governed by your separate services agreement. To cancel, email info@apex-leads.co.uk; we will confirm your notice period and the date your Portal access ends.`,
  },
  {
    heading: "8. Limitation of liability",
    body: `To the fullest extent permitted by law, Apex Leads shall not be liable for any indirect or consequential loss arising from your use of, or inability to use, the Portal. Nothing in these Terms limits liability that cannot lawfully be limited, including for death, personal injury, or fraud.`,
  },
  {
    heading: "9. Termination",
    body: `We may suspend or terminate your access to the Portal if we reasonably believe these Terms have been breached, or if your engagement with Apex Leads ends.`,
  },
  {
    heading: "10. Governing law",
    body: `These Terms are governed by the laws of England and Wales, and any disputes will be subject to the exclusive jurisdiction of the courts of England and Wales.`,
  },
  {
    heading: "11. Changes to these Terms",
    body: `We may update these Terms from time to time. Continued use of the Portal after changes are posted constitutes acceptance of the updated Terms.`,
  },
  {
    heading: "12. Contact",
    body: `Questions about these Terms can be sent to info@apex-leads.co.uk.`,
  },
];

export default function TermsPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-semibold tracking-tight text-forest-900">
        Terms &amp; Conditions
      </h1>
      <p className="mt-3 text-sm text-forest-500">
        Effective date: [DD Month YYYY] &middot; Placeholder template — replace
        bracketed details before publishing.
      </p>
      <div className="mt-10 space-y-8">
        {sections.map((s) => (
          <div key={s.heading}>
            <h2 className="text-lg font-semibold text-forest-900">
              {s.heading}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-forest-700">
              {s.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
