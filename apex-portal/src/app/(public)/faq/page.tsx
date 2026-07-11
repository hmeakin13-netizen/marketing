import { Accordion } from "@/components/Accordion";

const faqs = [
  {
    question: "How often is my dashboard updated?",
    answer:
      "Your Live Updates feed pulls directly from your account manager's notes every time you open the dashboard, so you're always seeing the latest activity. A short weekly summary also lands in your inbox once a week.",
  },
  {
    question: "How do I contact my account manager?",
    answer:
      "Every client has a named account manager. If you're not sure who yours is or need to get in touch, email info@apex-leads.co.uk and we'll put you straight through to them.",
  },
  {
    question: "How do I cancel?",
    answer:
      "Just email info@apex-leads.co.uk and let us know. We'll confirm your notice period and cancellation date in writing — no hoops to jump through.",
  },
  {
    question: "Is my data private?",
    answer:
      "Yes. Your dashboard only ever shows your own data. Every client account is restricted at the database level, so it's not possible for one client to see another client's information. See our Privacy Policy for full details.",
  },
];

export default function FaqPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-semibold tracking-tight text-forest-900">
        Frequently asked questions
      </h1>
      <p className="mt-3 text-forest-700">
        Everything you need to know about using the Apex Leads Client
        Portal.
      </p>
      <div className="mt-10">
        <Accordion items={faqs} />
      </div>
    </section>
  );
}
