import Link from "next/link";
import { requireStaff, isManager } from "@/lib/staff/auth";
import { loadCore, loadFlags, earliest } from "@/lib/staff/data";
import { parseRange, rangeBounds, fmtDate, fmtDateTime } from "@/lib/staff/dates";
import { computeStats, money, nameOf, outstanding, pct } from "@/lib/staff/metrics";
import { CONFIRMATION_LABEL } from "@/lib/staff/types";
import { Card, PageHeader, RangeTabs, SectionTitle, Stat, Badge } from "@/components/staff/ui";
import { CashGoal } from "@/components/staff/CashGoal";
import { TargetBars } from "@/components/staff/TargetBars";

export const metadata = { title: "Dashboard | Apex Team" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  const { supabase, me } = await requireStaff();
  const range = parseRange(searchParams.range);
  const { from, to } = rangeBounds(range);
  const week = rangeBounds("week");
  const month = rangeBounds("month");

  const { staff, calls, closes, targets } = await loadCore(
    supabase,
    earliest(from, week.from, month.from)
  );

  const { flags } = await loadFlags(supabase);
  const myFlags = flags.filter((f) => f.ownerId === me.id);
  const highFlags = myFlags.filter((f) => f.severity === "high").length;
  const team = computeStats(calls, closes, from, to);
  const owing = outstanding(closes);
  const people = staff.filter((s) => s.active && (s.role === "closer" || s.role === "setter"));

  const myRole = me.role === "closer" || me.role === "setter" ? me.role : null;
  const myTargets = targets.filter((t) => t.staff_id === me.id);
  const myWeek = myRole ? computeStats(calls, closes, week.from, week.to, { staffId: me.id, role: myRole, name: me.full_name }) : null;
  const myMonth = myRole ? computeStats(calls, closes, month.from, month.to, { staffId: me.id, role: myRole, name: me.full_name }) : null;

  // Calls that already happened but nobody has logged what happened. The closer on the call owns
  // the outcome (the setter only if there's no closer yet); admin and managers see everyone's.
  const now = Date.now();
  const needsOutcome = calls
    .filter(
      (c) =>
        c.outcome === "scheduled" &&
        new Date(c.call_at).getTime() < now &&
        (isManager(me.role) || c.closer_id === me.id || (!c.closer_id && me.role === "closer"))
    )
    .sort((a, b) => a.call_at.localeCompare(b.call_at));

  // Next calls coming up (a closer sees their own), with whether the setter has confirmed them.
  const nextCalls = calls
    .filter((c) => c.outcome === "scheduled" && new Date(c.call_at).getTime() >= now && (me.role !== "closer" || c.closer_id === me.id))
    .sort((a, b) => a.call_at.localeCompare(b.call_at))
    .slice(0, 6);

  // Recent changes to upcoming calls (confirmed, no answer, moved to a new time) so the closer
  // on the call sees them without having to go looking. Shows for 48 hours.
  const cutoff = now - 48 * 3600000;
  const callUpdates = calls
    .filter((c) => c.outcome === "scheduled" && new Date(c.call_at).getTime() >= now && (me.role !== "closer" || c.closer_id === me.id))
    .map((c) => {
      const moved = c.rescheduled_at && new Date(c.rescheduled_at).getTime() >= cutoff ? c.rescheduled_at : null;
      const conf = c.confirmation !== "unconfirmed" && c.confirmation_at && new Date(c.confirmation_at).getTime() >= cutoff ? c.confirmation_at : null;
      const at = [moved, conf].filter(Boolean).sort().pop() ?? null;
      return { c, moved: !!moved, conf: !!conf, at };
    })
    .filter((x) => x.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 8);

  // Campaign / source performance for the selected range.
  const sources = new Map<string, { calls: number; showed: number; closed: number }>();
  for (const c of calls) {
    // By the day the call was BOOKED, so a setter's work counts on the day they did it.
    const t = new Date(c.booked_at).getTime();
    if (t < from.getTime() || t >= to.getTime()) continue;
    const key = c.source?.trim() || "Unknown";
    const row = sources.get(key) ?? { calls: 0, showed: 0, closed: 0 };
    row.calls++;
    if (["follow_up", "lost", "closed"].includes(c.outcome)) row.showed++;
    if (c.outcome === "closed") row.closed++;
    sources.set(key, row);
  }

  const showTone = team.showRate === null ? "default" : team.showRate >= 70 ? "good" : team.showRate >= 50 ? "warn" : "bad";
  const closeTone = team.closeRate === null ? "default" : team.closeRate >= 25 ? "good" : team.closeRate >= 15 ? "warn" : "bad";

  return (
    <>
      <PageHeader
        title={`Hey ${me.full_name.split(" ")[0]} 👋`}
        subtitle={`Showing ${range === "today" ? "today" : range === "week" ? "this week" : "this month"}: ${fmtDate(from.toISOString())}${range === "today" ? "" : ` to ${fmtDate(new Date(to.getTime() - 1).toISOString())}`}`}
        action={<RangeTabs base="/" range={range} />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Calls booked" value={String(team.booked)} />
        <Stat label="Calls taken" value={String(team.taken)} hint={`${team.noShow} no-show${team.noShow === 1 ? "" : "s"}`} />
        <Stat label="Show rate" value={pct(team.showRate)} tone={showTone} />
        <Stat label="Close rate" value={pct(team.closeRate)} tone={closeTone} hint={`${team.closed} closed`} />
        <Stat label="Cash collected" value={money(team.cash)} tone="good" />
        <Stat label="Deal value closed" value={money(team.revenue)} />
      </div>

      <CashGoal closes={closes} />

      {myFlags.length > 0 ? (
        <Card className={`mt-6 ${highFlags > 0 ? "border-rose-500/30 bg-rose-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={`font-semibold ${highFlags > 0 ? "text-rose-300" : "text-amber-300"}`}>
                ⚑ {myFlags.length} thing{myFlags.length === 1 ? "" : "s"} need{myFlags.length === 1 ? "s" : ""} chasing
                {highFlags > 0 ? ` — ${highFlags} high priority` : ""}
              </p>
              <p className="mt-1 text-sm text-zinc-400">{myFlags[0].title}</p>
            </div>
            <Link href="/attention" className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20">
              See what&apos;s been dropped
            </Link>
          </div>
        </Card>
      ) : null}

      {needsOutcome.length > 0 ? (
        <Card className="mt-6 border-amber-500/30 bg-amber-500/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-amber-300">
                {needsOutcome.length} call{needsOutcome.length === 1 ? "" : "s"} waiting for an outcome and notes
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                {needsOutcome
                  .slice(0, 3)
                  .map((c) => `${c.lead_name} (${fmtDateTime(c.call_at)})`)
                  .join(" · ")}
                {needsOutcome.length > 3 ? ` · +${needsOutcome.length - 3} more` : ""}
              </p>
            </div>
            <Link href="/calls" className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300">
              Log outcomes
            </Link>
          </div>
        </Card>
      ) : null}

      {callUpdates.length > 0 ? (
        <Card className="mt-6 border-sky-500/30 bg-sky-500/5">
          <SectionTitle>Updates on {me.role === "closer" ? "your" : "upcoming"} calls</SectionTitle>
          <ul className="space-y-2 text-sm">
            {callUpdates.map(({ c, moved, conf }) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-zinc-100">
                  {c.lead_name} <span className="text-xs text-zinc-500">· {fmtDateTime(c.call_at)} · {nameOf(staff, c.closer_id)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {moved ? <Badge tone="warn">Moved to a new time</Badge> : null}
                  {conf ? (
                    <Badge tone={c.confirmation === "confirmed" ? "good" : c.confirmation === "no_answer" ? "bad" : "warn"}>
                      {CONFIRMATION_LABEL[c.confirmation]}
                      {c.confirmation_note ? ` — ${c.confirmation_note}` : ""}
                    </Badge>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {nextCalls.length > 0 ? (
        <Card className="mt-6">
          <SectionTitle>{me.role === "closer" ? "Your next calls" : "Next calls"}</SectionTitle>
          <ul className="divide-y divide-white/5 text-sm">
            {nextCalls.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-zinc-100">
                  {c.lead_name} <span className="text-xs text-zinc-500">· {fmtDateTime(c.call_at)} · {nameOf(staff, c.closer_id)}</span>
                </span>
                <Badge tone={c.confirmation === "confirmed" ? "good" : c.confirmation === "no_answer" ? "bad" : "warn"}>
                  {CONFIRMATION_LABEL[c.confirmation]}
                </Badge>
              </li>
            ))}
          </ul>
          <Link href="/calls" className="mt-3 inline-block text-sm font-medium text-emerald-400 hover:text-emerald-300">
            All calls →
          </Link>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle>Team performance</SectionTitle>
          <PeopleTable
            rows={people.map((p) => ({
              p,
              s: computeStats(calls, closes, from, to, { staffId: p.id, role: p.role as "setter" | "closer", name: p.full_name }),
            }))}
          />
        </Card>

        <Card>
          <SectionTitle>Cash forecast</SectionTitle>
          <p className="text-3xl font-semibold tabular-nums text-white">{money(owing.total)}</p>
          <p className="text-xs text-zinc-500">still owed across all deals</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-400">Overdue</dt>
              <dd className={`tabular-nums ${owing.overdue > 0 ? "text-rose-400" : "text-zinc-300"}`}>{money(owing.overdue)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-400">Due in next 7 days</dt>
              <dd className="tabular-nums text-amber-300">{money(owing.dueThisWeek)}</dd>
            </div>
          </dl>
          <Link href="/deals" className="mt-4 inline-block text-sm font-medium text-emerald-400 hover:text-emerald-300">
            View deals →
          </Link>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Setter handoff quality</SectionTitle>
          <p className="-mt-2 mb-3 text-xs text-zinc-500">How well each setter&apos;s booked calls turn into shows and closes.</p>
          <SetterTable
            rows={people
              .filter((p) => p.role === "setter")
              .map((p) => ({ p, s: computeStats(calls, closes, from, to, { staffId: p.id, role: "setter", name: p.full_name }) }))}
          />
        </Card>

        <Card>
          <SectionTitle>Campaign / source</SectionTitle>
          <p className="-mt-2 mb-3 text-xs text-zinc-500">Calls counted on the day they were booked. Which sources turn into closes.</p>
          {sources.size === 0 ? (
            <p className="text-sm text-zinc-500">No calls in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr>
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 text-right font-medium">Calls</th>
                  <th className="pb-2 text-right font-medium">Showed</th>
                  <th className="pb-2 text-right font-medium">Closed</th>
                  <th className="pb-2 text-right font-medium">Close %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {Array.from(sources.entries())
                  .sort((a, b) => b[1].closed - a[1].closed || b[1].calls - a[1].calls)
                  .map(([name, r]) => (
                    <tr key={name}>
                      <td className="py-2 text-zinc-200">{name}</td>
                      <td className="py-2 text-right tabular-nums">{r.calls}</td>
                      <td className="py-2 text-right tabular-nums">{r.showed}</td>
                      <td className="py-2 text-right tabular-nums">{r.closed}</td>
                      <td className="py-2 text-right tabular-nums">{r.showed ? pct((r.closed / r.showed) * 100) : "–"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {myRole && myWeek && myMonth ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <SectionTitle>My targets — this week</SectionTitle>
            <TargetBars title="weekly" stats={myWeek} targets={myTargets.filter((t) => t.period === "week")} />
          </Card>
          <Card>
            <SectionTitle>My targets — this month</SectionTitle>
            <TargetBars title="monthly" stats={myMonth} targets={myTargets.filter((t) => t.period === "month")} />
          </Card>
        </div>
      ) : null}

      <p className="mt-8 text-xs text-zinc-600">
        Calls booked counts when the call was booked; show and close rates count calls by the day
        they took place.
      </p>
    </>
  );
}

type Row = { p: { id: string; full_name: string; role: string }; s: ReturnType<typeof computeStats> };

function PeopleTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className="text-sm text-zinc-500">No setters or closers yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="text-left text-xs text-zinc-500">
          <tr>
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2 text-right font-medium">Booked</th>
            <th className="pb-2 text-right font-medium">Taken</th>
            <th className="pb-2 text-right font-medium">Show %</th>
            <th className="pb-2 text-right font-medium">Close %</th>
            <th className="pb-2 text-right font-medium">Cash</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map(({ p, s }) => (
            <tr key={p.id}>
              <td className="py-2.5">
                <span className="text-zinc-100">{p.full_name}</span>{" "}
                <Badge tone={p.role === "closer" ? "info" : "default"}>{p.role}</Badge>
              </td>
              <td className="py-2.5 text-right tabular-nums">{p.role === "setter" ? s.booked : "–"}</td>
              <td className="py-2.5 text-right tabular-nums">{s.taken}</td>
              <td className="py-2.5 text-right tabular-nums">{pct(s.showRate)}</td>
              <td className="py-2.5 text-right tabular-nums">{p.role === "closer" ? pct(s.closeRate) : "–"}</td>
              <td className="py-2.5 text-right font-medium tabular-nums text-emerald-400">{money(s.cash)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SetterTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className="text-sm text-zinc-500">No setters yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-zinc-500">
        <tr>
          <th className="pb-2 font-medium">Setter</th>
          <th className="pb-2 text-right font-medium">Booked</th>
          <th className="pb-2 text-right font-medium">Show %</th>
          <th className="pb-2 text-right font-medium">Closed</th>
          <th className="pb-2 text-right font-medium">Close %</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-white/5">
        {rows.map(({ p, s }) => (
          <tr key={p.id}>
            <td className="py-2 text-zinc-200">{p.full_name}</td>
            <td className="py-2 text-right tabular-nums">{s.booked}</td>
            <td className="py-2 text-right tabular-nums">{pct(s.showRate)}</td>
            <td className="py-2 text-right tabular-nums">{s.closed}</td>
            <td className="py-2 text-right tabular-nums">{pct(s.closeRate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
