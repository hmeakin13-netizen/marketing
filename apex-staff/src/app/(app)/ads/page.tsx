import { requireRole } from "@/lib/staff/auth";
import { loadLatestAds, type AdsClient } from "@/lib/staff/ads";
import { Badge, Card, PageHeader } from "@/components/staff/ui";

export const metadata = { title: "Ads | Apex Team" };

const gbp = (n: number | null | undefined, dp = 2) =>
  n == null ? "–" : `£${n.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

const SEV_BORDER = ["border-emerald-500/30", "border-amber-500/40", "border-rose-500/50"];
const SEV_DOT = ["bg-emerald-400", "bg-amber-400", "bg-rose-500"];

function statusBadge(c: AdsClient) {
  const g = c.guarantee;
  if (c.state === "ERROR") return <Badge tone="warn">Couldn&apos;t read Meta</Badge>;
  if (c.state === "NOT_LIVE") return <Badge>Not live yet</Badge>;
  if (c.state === "FREE_TRIAL")
    return <Badge tone={g?.owed_remaining === 0 ? "good" : "bad"}>{g?.owed_remaining === 0 ? "Free trial: delivered" : "Free trial"}</Badge>;
  if (c.state === "HIT") return <Badge tone="good">Guarantee hit</Badge>;
  if (g && c.state === "ACTIVE") {
    if (g.too_early) return <Badge tone="info">Too early to call</Badge>;
    const tone = g.status === "WILL MISS" ? "bad" : g.status === "AT RISK" ? "warn" : "good";
    return <Badge tone={tone}>{g.status}</Badge>;
  }
  return null;
}

function Progress({ counted, required, pace }: { counted: number; required: number; pace: number | null }) {
  const pct = Math.min(100, (counted / required) * 100);
  const marker = pace == null ? null : Math.min(100, (pace / required) * 100);
  return (
    <div>
      <div className="relative h-3 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
        {marker != null ? <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${marker}%` }} /> : null}
      </div>
      <p className="mt-1 text-xs text-zinc-500">White line = where you should be by today</p>
    </div>
  );
}

function ClientCard({ c }: { c: AdsClient }) {
  const g = c.guarantee;
  const cpl = c.cpl;
  return (
    <Card className={SEV_BORDER[c.severity]}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${c.state === "NOT_LIVE" ? "bg-zinc-600" : SEV_DOT[c.severity]}`} />
          <h2 className="text-lg font-semibold text-white">{c.name}{c.own ? " (own)" : ""}</h2>
        </div>
        {statusBadge(c)}
      </div>

      {c.deadline ? (
        <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300">⏰ {c.deadline}</p>
      ) : null}

      {c.state === "ERROR" ? <p className="mt-3 text-sm text-amber-300">{c.error}</p> : null}

      {c.state === "NOT_LIVE" ? <p className="mt-3 text-sm text-zinc-400">Starts counting on the first day it spends.</p> : null}

      {c.own ? (
        <p className="mt-3 text-sm text-zinc-300">
          {c.yesterday_leads} lead{c.yesterday_leads === 1 ? "" : "s"} yesterday
          {c.yesterday_leads ? `, CPL ${gbp(c.yesterday_spend && c.yesterday_spend / c.yesterday_leads)}` : ""}
          {cpl?.target != null ? ` (target ${gbp(cpl.target, 0)})` : ""}
        </p>
      ) : null}

      {g && c.state === "ACTIVE" && g.required ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-end justify-between">
            <p className="text-3xl font-semibold tabular-nums text-white">
              {g.counted}
              <span className="text-lg text-zinc-500"> of {g.required}</span>
              {g.today_leads ? <span className="ml-2 text-lg text-emerald-400">+{g.today_leads} today</span> : null}
            </p>
            <p className="text-sm text-zinc-400">
              Day {g.day}/{g.window} · {g.terms}
            </p>
          </div>
          <Progress counted={g.counted} required={g.required} pace={g.pace} />
          <p className="text-sm text-zinc-300">
            Pace line {g.pace?.toFixed(1)}.{" "}
            {g.too_early ? "Too early to call." : `Recent rate ${g.recent_rate?.toFixed(1)}/day, projected ~${g.projected?.toFixed(0)}.`}
            {g.excluded ? ` (${g.total} total, ${g.excluded} excluded)` : ""}
          </p>
        </div>
      ) : null}

      {g && c.state === "HIT" ? (
        <p className="mt-3 text-sm text-emerald-300">
          {g.counted} of {g.required} counted. Guarantee delivered.
        </p>
      ) : null}

      {g && c.state === "FREE_TRIAL" ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">Leads still owed</p>
            <p className="text-3xl font-semibold tabular-nums text-white">{g.owed_remaining ?? "–"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">Spend since window ended</p>
            <p className="text-3xl font-semibold tabular-nums text-white">{g.spend_since == null ? "–" : gbp(g.spend_since, 0)}</p>
          </div>
        </div>
      ) : null}

      {cpl && !c.own && cpl.all != null ? (
        <p className="mt-4 text-sm text-zinc-300">
          <span className="text-zinc-500">CPL, last {cpl.days} day{cpl.days === 1 ? "" : "s"}: </span>
          <span className={cpl.sev === 2 ? "font-semibold text-rose-300" : cpl.sev === 1 ? "font-semibold text-amber-300" : "font-semibold text-emerald-300"}>
            {g?.excluded ? `${gbp(cpl.all)} all, ${gbp(cpl.counted)} counted` : gbp(cpl.all)}
          </span>
          <span className="text-zinc-500">
            {" "}
            (target {gbp(cpl.target, 0)}, max {gbp(cpl.max, 0)})
          </span>
        </p>
      ) : null}

      {c.flags.length > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {c.flags.map((f, i) => (
            <li key={i} className={`text-sm ${f.sev >= 2 ? "text-rose-300" : "text-amber-300"}`}>
              ⚠ {f.text}
            </li>
          ))}
        </ul>
      ) : null}
      {c.testing_ads > 0 ? (
        <p className="mt-2 text-xs text-zinc-500">
          {c.testing_ads} ad{c.testing_ads === 1 ? "" : "s"} still testing (under £100 spend)
        </p>
      ) : null}
    </Card>
  );
}

export default async function AdsPage() {
  const { supabase } = await requireRole("admin", "manager");
  const latest = await loadLatestAds(supabase);

  if (!latest) {
    return (
      <>
        <PageHeader title="Ads" subtitle="Client ad accounts: lead guarantees, cost per lead, problems." />
        <Card className="text-center">
          <p className="font-semibold text-white">No data yet.</p>
          <p className="mt-1 text-sm text-zinc-400">
            The first run of the daily Meta Ads Monitor job will fill this in. Run it from GitHub &gt; Actions.
          </p>
        </Card>
      </>
    );
  }

  const snap = latest.payload;
  const updated = new Date(latest.created_at).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const ageHours = (Date.now() - new Date(latest.created_at).getTime()) / 36e5;

  return (
    <>
      <PageHeader title="Ads" subtitle={`Updated ${updated}. Worst first.`} />
      {ageHours > 3 ? (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          This is more than 3 hours old, and it should refresh every hour. The job may have stopped: check GitHub &gt; Actions.
        </p>
      ) : null}
      <p className="mb-5 rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm font-medium text-white">{snap.look_at_first}</p>
      <div className="space-y-4">
        {snap.clients.map((c) => (
          <ClientCard key={c.name} c={c} />
        ))}
      </div>
      {snap.warnings.length > 0 ? (
        <div className="mt-5 space-y-1">
          {snap.warnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-300">
              ⚠ {w}
            </p>
          ))}
        </div>
      ) : null}
    </>
  );
}
