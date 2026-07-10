const sections = [
  {
    heading: "1. Who we are",
    body: `Apex Leads ("we", "us", "our") is a lead generation company for landscaping businesses, registered in England and Wales under company number [00000000], with registered office at [Apex Leads registered address, UK]. We are the data controller for the personal data processed through this Client Portal.`,
  },
  {
    heading: "2. What data we collect",
    body: `To provide the Client Portal, we collect and process: your business name, your email address, authentication records (login timestamps), and the content of the updates and reports linked to your account. We do not collect payment card details through this portal.`,
  },
  {
    heading: "3. How we use your data",
    body: `We use your data to: authenticate you and give you secure access to your own dashboard; display your live updates and weekly reports; communicate with you about your account; and meet our legal and regulatory obligations. We do not sell your personal data, and we do not use it for advertising.`,
  },
  {
    heading: "4. Legal basis for processing",
    body: `We process your data under the "performance of a contract" legal basis (Article 6(1)(b) UK GDPR), because processing is necessary to provide the services you've engaged us for, and under "legitimate interests" (Article 6(1)(f)) for account security and service communications.`,
  },
  {
    heading: "5. Who we share data with",
    body: `We share data with the infrastructure providers who help us run the portal: Supabase (authentication and database hosting), Notion (content storage for your updates), Google (Looker Studio report embedding), and Vercel (application hosting). Each acts as a data processor under contract and does not use your data for their own purposes.`,
  },
  {
    heading: "6. International transfers",
    body: `Some of our processors may store or process data outside the UK. Where this happens, we rely on Standard Contractual Clauses or an equivalent adequacy mechanism to ensure your data remains protected to UK GDPR standards.`,
  },
  {
    heading: "7. How long we keep your data",
    body: `We retain your account data for as long as you remain an active client, and for up to 6 years afterwards to meet our legal and accounting obligations, after which it is securely deleted.`,
  },
  {
    heading: "8. Your rights",
    body: `Under UK GDPR you have the right to: access the personal data we hold about you; request correction of inaccurate data; request erasure; object to or restrict certain processing; and request data portability. To exercise any of these rights, email info@apex-leads.co.uk.`,
  },
  {
    heading: "9. Security",
    body: `Access to your dashboard is protected by passwordless email authentication and row-level security at the database level, meaning your account can only ever access your own data. We use industry-standard encryption in transit and at rest across our infrastructure providers.`,
  },
  {
    heading: "10. Cookies",
    body: `This portal uses only essential cookies required to keep you securely logged in. We do not use tracking or advertising cookies.`,
  },
  {
    heading: "11. Complaints",
    body: `If you have concerns about how we handle your data, please contact us first at info@apex-leads.co.uk. You also have the right to lodge a complaint with the Information Commissioner's Office (ICO) at ico.org.uk.`,
  },
  {
    heading: "12. Changes to this policy",
    body: `We may update this policy from time to time. Any changes will be posted on this page with an updated effective date.`,
  },
];

export default function PrivacyPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-semibold tracking-tight text-forest-900">
        Privacy Policy
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
