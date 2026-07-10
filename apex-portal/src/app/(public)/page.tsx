import Link from "next/link";

const features = [
  {
    title: "Live updates",
    body: "See what your account manager is doing on your campaigns, the moment it happens — no waiting for an email.",
  },
  {
    title: "Weekly reports",
    body: "Your Looker Studio report, embedded right in your dashboard. Leads, spend and performance at a glance.",
  },
  {
    title: "One place, always on",
    body: "No more digging through inboxes. Log in any time to see exactly where things stand.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-forest-500">
          Apex Leads
        </p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight text-forest-900 sm:text-6xl">
          Client Portal
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-forest-700">
          Log in here to see your live updates and weekly reports, in one
          clean dashboard built just for you.
        </p>
        <div className="mt-10 flex justify-center">
          <Link
            href="/login"
            className="rounded-full bg-forest-700 px-8 py-3.5 text-base font-semibold text-white shadow-card transition hover:bg-forest-800 hover:shadow-card-hover"
          >
            Client Login
          </Link>
        </div>
      </section>

      <section className="border-y border-stone-200 bg-stone-100">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-8 sm:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card"
              >
                <h2 className="text-lg font-semibold text-forest-900">
                  {f.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-forest-700">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-forest-900">
          Built for landscapers, by people who get the trade.
        </h2>
        <p className="mt-4 text-forest-700">
          Apex Leads runs lead generation for landscaping businesses across
          the UK. This portal is where our clients keep track of it —
          straightforward, honest and always up to date.
        </p>
      </section>
    </>
  );
}
