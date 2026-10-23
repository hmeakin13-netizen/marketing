import { requireRole } from "@/lib/staff/auth";
import { loadBrain, loadTracked, type AdTest, type ClientProfile, type Learning, type TrackedAd } from "@/lib/staff/admaker";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/staff/ui";

export const metadata = { title: "Ad maker learnings | Apex Team" };

const gbp = (n: number | null) => (n == null ? "–" : `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`);
const CONF = { low: "warn", medium: "info", high: "good" } as const;
const VERDICT = { keep: "good", kill: "bad", testing: "info", no_verdict: "default" } as const;
const VERDICT_LABEL = { keep: "Keep", kill: "Kill", testing: "Testing", no_verdict: "No verdict" } as const;
const TRADE_LABEL: Record<string, string> = { agency: "Apex-Leads (own agency)", roofing: "Roofing", landscaping: "Landscaping" };

function LessonCard({ l }: { l: Learning }) {
  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Badge>{l.category}</Badge>
        <Badge tone={CONF[l.confidence]}>{l.confidence} confidence</Badge>
      </div>
      <p className="text-sm text-zinc-100">{l.lesson}</p>
      {l.evidence ? <p className="mt-2 text-xs text-zinc-400">Evidence: {l.evidence}</p> : null}
      {l.source ? <p className="mt-1 text-xs text-zinc-600">Source: {l.source}</p> : null}
    </Card>
  );
}

function TestRow({ t }: { t: AdTest }) {
  const cpl = t.leads && t.spend ? t.spend / t.leads : null;
  return (
    <div className="border-t border-white/5 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-white">{t.ad_name}</span>
        <Badge tone={VERDICT[t.verdict]}>{VERDICT_LABEL[t.verdict]}</Badge>
      </div>
      <p className="mt-1 text-xs text-zinc-400 tabular-nums">
        {gbp(t.spend)} spent · {t.leads ?? 0} lead{t.leads === 1 ? "" : "s"}
        {cpl ? ` · ${gbp(cpl)} each` : ""}
      </p>
      {t.idea ? <p className="mt-1 text-xs text-zinc-500">{t.idea}</p> : null}
      {t.notes ? <p className="mt-1 text-xs text-zinc-500">{t.notes}</p> : null}
    </div>
  );
}

function ProfileCard({ p, tests }: { p: ClientProfile; tests: AdTest[] }) {
  const rows: [string, string | null][] = [
    ["Area", p.area],
    ["Services", p.services],
    ["Job values", p.job_value],
    ["Trust angles", p.trust_angles],
    ["Constraints", p.constraints],
    ["Targets", p.targets],
    ["Notes", p.notes],
  ];
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold text-white">{p.client_name}</h3>
        <Badge tone={p.status === "live" ? "good" : p.status === "onboarding" ? "info" : "default"}>{p.status}</Badge>
        <Badge>{TRADE_LABEL[p.trade] ?? p.trade}</Badge>
      </div>
      {p.summary ? <p className="mb-3 text-sm text-zinc-300">{p.summary}</p> : null}
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="border-t border-white/5 py-2 text-sm">
            <span className="text-zinc-500">{k}: </span>
            <span className="text-zinc-200">{v}</span>
          </div>
        ))}
      {tests.length > 0 ? (
        <div className="mt-3">
          <SectionTitle>Tests so far</SectionTitle>
          {tests.map((t) => (
            <TestRow key={t.id} t={t} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function TrackedRow({ t }: { t: TrackedAd }) {
  const tone = t.suggested_verdict === "keep" ? "good" : t.suggested_verdict === "kill" ? "bad" : "info";
  return (
    <div className="border-t border-white/5 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-white">{t.ad_name ?? t.ad_id}</span>
        <Badge tone={tone}>{t.suggested_verdict}</Badge>
        {t.status && t.status !== "ACTIVE" ? <Badge>{t.status.toLowerCase().replace("_", " ")}</Badge> : null}
      </div>
      <p className="mt-1 text-xs text-zinc-400 tabular-nums">
        {gbp(t.spend)} · {t.leads} lead{t.leads === 1 ? "" : "s"}
        {t.cpl ? ` · ${gbp(t.cpl)} each` : ""}
        {t.ctr_pct != null ? ` · ${t.ctr_pct}% click rate` : ""} · {t.days} day{t.days === 1 ? "" : "s"} tracked
      </p>
    </div>
  );
}

export default async function LearningsPage() {
  const { supabase } = await requireRole("admin", "manager");
  const { profiles, learnings, tests } = await loadBrain(supabase);
  const tracked = await loadTracked(supabase);
  const trackedClients = Array.from(new Set(tracked.map((t) => t.client_name)));
  const general = learnings.filter((l) => l.scope === "all");
  const trades = Array.from(new Set(learnings.filter((l) => l.scope === "trade").map((l) => l.trade ?? ""))).filter(Boolean);

  return (
    <>
      <PageHeader
        title="Ad maker learnings"
        subtitle="What we have learned from every test, with how sure we are. Read before any new ad is written. Sample sizes are small, so treat everything as provisional."
      />

      <SectionTitle>Rules we follow</SectionTitle>
      <div className="mb-8 grid gap-3 lg:grid-cols-2">
        {general.map((l) => (
          <LessonCard key={l.id} l={l} />
        ))}
      </div>

      {trades.map((trade) => (
        <div key={trade} className="mb-8">
          <SectionTitle>{TRADE_LABEL[trade] ?? trade}</SectionTitle>
          <div className="grid gap-3 lg:grid-cols-2">
            {learnings
              .filter((l) => l.scope === "trade" && l.trade === trade)
              .map((l) => (
                <LessonCard key={l.id} l={l} />
              ))}
            {learnings
              .filter((l) => l.scope === "client" && profiles.find((p) => p.client_name === l.client_name)?.trade === trade)
              .map((l) => (
                <LessonCard key={l.id} l={l} />
              ))}
          </div>
        </div>
      ))}

      {tracked.length > 0 ? (
        <div className="mb-8">
          <SectionTitle>Tracked automatically (every 3 hours)</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            {trackedClients.map((c) => (
              <Card key={c}>
                <h3 className="mb-2 text-lg font-semibold text-white">{c}</h3>
                {tracked
                  .filter((t) => t.client_name === c)
                  .map((t) => (
                    <TrackedRow key={t.ad_id} t={t} />
                  ))}
              </Card>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            The verdict is a suggestion from each client&apos;s rules (zero leads at the early-kill spend, keep or kill at the keep/kill spend against max CPL). Nothing is paused automatically.
          </p>
        </div>
      ) : null}

      <SectionTitle>Clients and their tests</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        {profiles.map((p) => (
          <ProfileCard key={p.client_name} p={p} tests={tests.filter((t) => t.client_name === p.client_name)} />
        ))}
      </div>
      <p className="mt-6 text-xs text-zinc-600">
        Numbers on this page are snapshots as of the date each test was logged (mostly 23 Oct 2026). The Ads page shows live figures.
      </p>
    </>
  );
}
