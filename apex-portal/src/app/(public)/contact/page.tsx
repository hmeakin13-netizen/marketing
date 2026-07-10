export default function ContactPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-forest-900">
        Get in touch
      </h1>
      <p className="mt-4 text-forest-700">
        For account queries, dashboard access, or anything else, email us and
        we&apos;ll get back to you.
      </p>
      <a
        href="mailto:info@apex-leads.co.uk"
        className="mt-8 inline-block rounded-full bg-forest-700 px-8 py-3.5 text-base font-semibold text-white shadow-card transition hover:bg-forest-800 hover:shadow-card-hover"
      >
        info@apex-leads.co.uk
      </a>
    </section>
  );
}
