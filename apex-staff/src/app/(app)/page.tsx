import Link from "next/link";
import type { ReactNode } from "react";
import { requireStaff, isManager } from "@/lib/staff/auth";
import { loadCore, loadFlags } from "@/lib/staff/data";
import { rangeBounds, todayIso, ukIso } from "@/lib/staff/dates";
import { computeStats, pct } from "@/lib/staff/metrics";
import { bandTone, loadClientHealth } from "@/lib/staff/health";
import { loadQuestions } from "@/components/staff/HarryQuestions";
import { Badge, Card, Notice, PageHeader, SectionTitle, Stat } from "@/components/staff/ui";

export const metadata = { title: "Dashboard | Apex Team" };

type Todo = { key: string; text: string; detail?: string; href: string; tone: "bad" | "warn" | "info" };

/**
 * The home page is deliberately three things only: Clients, Needs you, Sales.
 * Everything that used to live here is on its own page (Sales numbers, Questions, Client care, Ads ...).
 */
export default async function HomePage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const { supabase, me } = await requireStaff();
  const manager = isManager(me.role);
  const week = rangeBounds("week");

  const [{ calls, closes }, { flags }] = await Promise.all([loadCore(supabase, week.from), loadFlags(supabase)]);
  const sales = computeStats(calls, closes, week.from, week.to);

  // ---------------------------------------------------------------- Needs you
  const todos: Todo[] = [];
  if (me.role === "admin") {
    const questions = await loadQuestions(supabase);
    if (questions.length) {
      todos.push({
        key: "questions",
        text: `${questions.length} question${questions.length === 1 ? "" : "s"} from the team`,
        detail: questions[0].text,
        href: "/questions",
        tone: "info",
      });
    }
  }
  if (manager) {
    const waiting = (table: string, status: string) => supabase.from(table).select("id", { count: "exact", head: true }).eq("status", status);
    const [care, recovery, ads, posts] = await Promise.all([
      waiting("care_drafts", "draft"),
      waiting("sales_drafts", "draft"),
      waiting("ad_proposals", "proposed"),
      waiting("marketing_posts", "drafted"),
    ]);
    const approvals: [number, string, string][] = [
      [care.count ?? 0, "client message", "/care"],
      [recovery.count ?? 0, "sales follow-up", "/sales"],
      [ads.count ?? 0, "ad proposal", "/ads"],
      [posts.count ?? 0, "marketing post", "/marketing"],
    ];
    for (const [n, label, href] of approvals) {
      if (n > 0) todos.push({ key: href, text: `${n} ${label}${n === 1 ? "" : "s"} waiting for your approval`, href, tone: "warn" });
    }
  }
  const myFlags = flags.filter((f) => f.ownerId === me.id);
  if (myFlags.length) {
    const high = myFlags.filter((f) => f.severity === "high").length;
    todos.push({
      key: "flags",
      text: `${myFlags.length} thing${myFlags.length === 1 ? "" : "s"} to chase${high ? ` (${high} high priority)` : ""}`,
      detail: myFlags[0].title,
      href: "/attention",
      tone: high ? "bad" : "warn",
    });
  }
  const now = Date.now();
  const needsOutcome = calls.filter(
    (c) =>
      c.outcome === "scheduled" &&
      new Date(c.call_at).getTime() < now &&
      (manager || c.closer_id === me.id || (!c.closer_id && me.role === "closer"))
  );
  if (needsOutcome.length) {
    todos.push({
      key: "outcomes",
      text: `${needsOutcome.length} call${needsOutcome.length === 1 ? "" : "s"} waiting for an outcome`,
      detail: needsOutcome.slice(0, 3).map((c) => c.lead_name).join(", "),
      href: "/calls",
      tone: "warn",
    });
  }
  if (me.role === "setter") {
    const { data: filed } = await supabase.from("daily_reports").select("staff_id").eq("report_date", todayIso()).eq("staff_id", me.id);
    if (!filed?.length) todos.push({ key: "report", text: "Your end of day report is still to do", href: "/report", tone: "info" });
  }

  return (
    <>
      <PageHeader title={`Hey ${me.full_name.split(" ")[0]} 👋`} subtitle="Clients, what needs you, and sales this week." />
      <Notice ok={searchParams.ok} error={searchParams.error} />

      {manager ? <ClientsSection supabase={supabase} weekStart={ukIso(week.from)} /> : null}

      <Card className={`mb-6 ${todos.length ? "border-amber-500/30" : "border-emerald-500/30"}`}>
        <SectionTitle>Needs you ({todos.length})</SectionTitle>
        {todos.length === 0 ? (
          <p className="text-sm text-zinc-400">Nothing waiting on you.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {todos.map((t) => (
              <li key={t.key}>
                <Link href={t.href} className="flex items-center justify-between gap-3 py-3 hover:bg-white/[0.02]">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${t.tone === "bad" ? "bg-rose-500" : t.tone === "warn" ? "bg-amber-400" : "bg-sky-400"}`} aria-hidden />
                      {t.text}
                    </span>
                    {t.detail ? <span className="mt-0.5 block truncate pl-[1.125rem] text-xs text-zinc-500">{t.detail}</span> : null}
                  </span>
                  <span className="shrink-0 text-sm text-emerald-400">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionHead title="Sales this week" href="/overview" link="All sales numbers →" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Calls booked" value={String(sales.booked)} />
          <Stat
            label="Show rate"
            value={pct(sales.showRate)}
            tone={sales.showRate === null ? "default" : sales.showRate >= 70 ? "good" : sales.showRate >= 50 ? "warn" : "bad"}
            hint={`${sales.showed} showed, ${sales.noShow} no-show${sales.noShow === 1 ? "" : "s"}`}
          />
          <Stat label="Closes" value={String(sales.closed)} tone={sales.closed > 0 ? "good" : "default"} />
        </div>
      </Card>
    </>
  );
}

function SectionHead({ title, href, link }: { title: ReactNode; href: string; link: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <SectionTitle>{title}</SectionTitle>
      <Link href={href} className="text-sm font-medium text-emerald-400 hover:text-emerald-300">
        {link}
      </Link>
    </div>
  );
}

/** Each live client: traffic light, the one reason that matters, and leads so far this week. */
async function ClientsSection({ supabase, weekStart }: { supabase: Awaited<ReturnType<typeof requireStaff>>["supabase"]; weekStart: string }) {
  const [{ data: profiles }, health, { data: adRows }] = await Promise.all([
    supabase.from("ad_client_profiles").select("client_name, status, trade").in("status", ["live", "onboarding"]).neq("trade", "agency").order("client_name"),
    loadClientHealth(supabase),
    supabase.from("ad_daily").select("client_name, leads").gte("day", weekStart).limit(5000),
  ]);
  const leads = new Map<string, number>();
  for (const r of adRows ?? []) leads.set(r.client_name, (leads.get(r.client_name) ?? 0) + Number(r.leads ?? 0));
  const healthOf = new Map(health.map((h) => [h.client, h.latest]));
  const rank = { red: 0, amber: 1, green: 2 } as const;
  const live = (profiles ?? [])
    .filter((p) => p.status === "live")
    .sort((a, b) => (rank[healthOf.get(a.client_name)?.band ?? "amber"] - rank[healthOf.get(b.client_name)?.band ?? "amber"]) || a.client_name.localeCompare(b.client_name));
  const onboarding = (profiles ?? []).filter((p) => p.status === "onboarding");

  return (
    <Card className="mb-6">
      <SectionHead title={`Clients (${live.length} live)`} href="/care" link="Client care →" />
      {live.length === 0 ? (
        <p className="text-sm text-zinc-400">No live clients yet.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {live.map((p) => {
            const h = healthOf.get(p.client_name);
            const dot = h?.band === "green" ? "bg-emerald-400" : h?.band === "amber" ? "bg-amber-400" : h?.band === "red" ? "bg-rose-500" : "bg-zinc-600";
            const n = leads.get(p.client_name) ?? 0;
            return (
              <li key={p.client_name} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                    <span className={`inline-block h-3 w-3 shrink-0 rounded-full ${dot}`} aria-hidden />
                    {p.client_name}
                    {h ? <Badge tone={bandTone(h.band)}>{h.score ?? "?"}/100</Badge> : <Badge>not scored yet</Badge>}
                  </p>
                  {h?.reason ? <p className="mt-1 pl-5 text-xs text-zinc-400">{h.reason}</p> : null}
                </div>
                <p className="text-right">
                  <span className="text-2xl font-semibold tabular-nums text-white">{n}</span>
                  <span className="ml-1.5 text-xs text-zinc-500">lead{n === 1 ? "" : "s"} this week</span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {onboarding.length ? (
        <p className="mt-3 border-t border-white/5 pt-3 text-xs text-zinc-500">
          Setting up: {onboarding.map((p) => p.client_name).join(", ")}
        </p>
      ) : null}
    </Card>
  );
}
