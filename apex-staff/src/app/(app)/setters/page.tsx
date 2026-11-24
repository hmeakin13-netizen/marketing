import Link from "next/link";
import { requireRole } from "@/lib/staff/auth";
import { loadCore } from "@/lib/staff/data";
import { fmtDate, fmtDateTime, todayIso } from "@/lib/staff/dates";
import { pct } from "@/lib/staff/metrics";
import { fmtSpeed } from "@/lib/staff/setters";
import { FIX_WINDOW_DAYS, KPI_LABEL, STEP_LABEL, TARGETS, loadSetterReports, weekStart, type DayCard, type KpiKey, type WeekScore } from "@/lib/staff/setterKpis";
import { Badge, Card, PageHeader, SectionTitle, Stat } from "@/components/staff/ui";

export const metadata = { title: "Setter KPIs | Apex Team" };
export const dynamic = "force-dynamic";

const dayName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const scoreTone = (s: number | null) => (s == null ? "default" : s >= TARGETS.score ? "good" : s >= TARGETS.score - 15 ? "warn" : "bad");
const KPIS = Object.keys(KPI_LABEL) as KpiKey[];
const target = (k: KpiKey) => (k === "overdue" ? "0" : `${TARGETS[k]}+`);

function StatusBadge({ c }: { c: DayCard }) {
  if (c.status === "hit") return <Badge tone="good">hit</Badge>;
  if (c.status === "excused") return <Badge tone="info">ran out of leads</Badge>;
  if (c.status === "miss") return <Badge tone="bad">missed</Badge>;
  return <Badge>no numbers</Badge>;
}

function weekLine(w: WeekScore) {
  if (w.score == null) return "nothing to score";
  return `${w.passed} of ${w.total} checks${w.excusedDays ? `, ${w.excusedDays} day${w.excusedDays === 1 ? "" : "s"} ran out of leads` : ""}`;
}

/** Harry's scorecard: each setter against their own targets and the playbook. Only the admin can open it. */
export default async function SetterKpisPage() {
  const { supabase } = await requireRole("admin");
  const today = todayIso();
  const since = new Date(`${weekStart(today)}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 15);
  const { staff, calls } = await loadCore(supabase, since);
  const setters = staff.filter((s) => s.active && s.role === "setter");
  const reports = await loadSetterReports(supabase, setters, calls, today);
  const anyMisses = reports.some((r) => r.missesAvailable);

  return (
    <>
      <PageHeader
        title="Setter KPIs"
        subtitle={`Each setter against their own targets, Monday to Saturday: ${TARGETS.dials} dials, ${TARGETS.conversations} conversations, ${TARGETS.booked} calls booked, no overdue tasks. Only you can see this page.`}
        action={
          <Link href="/setters/activity" className="text-sm font-medium text-emerald-400 hover:text-emerald-300">
            Raw activity →
          </Link>
        }
      />
      {reports.length === 0 ? <Card><p className="text-sm text-zinc-400">No active setters.</p></Card> : null}
      {!anyMisses && reports.length ? (
        <p className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Playbook checks are not switched on yet (the database update has not been applied), so scores below are from the daily numbers only.
        </p>
      ) : null}

      {reports.map((r) => {
        const todayCard = r.cards[0];
        const recent = r.cards.slice(0, 12);
        return (
          <div key={r.setter.id} className="mb-10">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">{r.setter.full_name}</h2>
              {r.replace ? <Badge tone="bad">Consider replacing: {r.replace}</Badge> : null}
            </div>

            <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Score this week" value={r.thisWeek.score == null ? "–" : `${r.thisWeek.score}%`} tone={scoreTone(r.thisWeek.score)} hint={weekLine(r.thisWeek)} />
              <Stat label="Score last week" value={r.lastWeek.score == null ? "–" : `${r.lastWeek.score}%`} tone={scoreTone(r.lastWeek.score)} hint={weekLine(r.lastWeek)} />
              <Stat
                label="Show rate this week"
                value={pct(r.thisWeek.showRate)}
                tone={r.thisWeek.showRate == null ? "default" : r.thisWeek.showRate >= TARGETS.showRate ? "good" : "bad"}
                hint={`${r.thisWeek.showed} showed of ${r.thisWeek.due} due · target ${TARGETS.showRate}%`}
              />
              <Stat
                label="Playbook steps to fix"
                value={r.missesAvailable ? String(r.openMisses.length) : "–"}
                tone={r.overdueMisses.length ? "bad" : r.openMisses.length ? "warn" : "good"}
                hint={r.missesAvailable ? `${r.overdueMisses.length} older than ${FIX_WINDOW_DAYS} working days` : "not switched on yet"}
              />
            </div>

            <Card className="mb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionTitle>Today</SectionTitle>
                <StatusBadge c={todayCard} />
              </div>
              {todayCard.values ? (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {KPIS.map((k) => (
                      <div key={k} className={`rounded-xl border p-3 ${todayCard.hits![k] ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"}`}>
                        <p className="text-xs text-zinc-400">{KPI_LABEL[k]}</p>
                        <p className={`mt-1 text-2xl font-semibold tabular-nums ${todayCard.hits![k] ? "text-emerald-300" : "text-rose-300"}`}>{todayCard.values![k]}</p>
                        <p className="text-xs text-zinc-500">target {target(k)}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-zinc-500">
                    Speed to lead: {fmtSpeed(todayCard.speedMin)} (target {TARGETS.speedMin} min)
                    {todayCard.overnight ? ` · overnight leads rung by 09:30: ${todayCard.overnight.rung} of ${todayCard.overnight.total}` : " · overnight leads: not measured yet"}
                    {todayCard.updatedAt ? ` · numbers as of ${fmtDateTime(todayCard.updatedAt)}` : ""}
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-500">No numbers recorded for today yet. The Setter Stats desk fills them in.</p>
              )}
            </Card>

            <Card className="mb-4">
              <SectionTitle>Last two weeks</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-left text-xs text-zinc-500">
                    <tr>
                      <th className="pb-2 font-medium">Day</th>
                      {KPIS.map((k) => (
                        <th key={k} className="pb-2 text-right font-medium">{KPI_LABEL[k]}</th>
                      ))}
                      <th className="pb-2 text-right font-medium">Speed</th>
                      <th className="pb-2 text-right font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {recent.map((c) => (
                      <tr key={c.day}>
                        <td className="py-2 text-zinc-300">{dayName(c.day)}</td>
                        {KPIS.map((k) => (
                          <td key={k} className={`py-2 text-right tabular-nums ${c.values ? (c.hits![k] ? "text-emerald-300" : "text-rose-300") : "text-zinc-600"}`}>
                            {c.values ? c.values[k] : "–"}
                          </td>
                        ))}
                        <td className={`py-2 text-right tabular-nums ${c.speedMin == null ? "text-zinc-600" : c.speedMin <= TARGETS.speedMin ? "text-emerald-300" : "text-rose-300"}`}>{fmtSpeed(c.speedMin)}</td>
                        <td className="py-2 text-right"><StatusBadge c={c} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {r.missesAvailable ? (
              <Card>
                <SectionTitle>Playbook steps missed ({r.openMisses.length} to fix)</SectionTitle>
                {r.openMisses.length === 0 ? (
                  <p className="text-sm text-zinc-500">Nothing open.</p>
                ) : (
                  <ul className="divide-y divide-white/5 text-sm">
                    {r.openMisses.slice(0, 40).map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="text-zinc-200">
                          <b>{m.lead_label}</b>: {STEP_LABEL[m.step] ?? m.step}
                          {m.detail ? <span className="text-zinc-500"> · {m.detail}</span> : null}
                        </span>
                        <span className="text-xs text-zinc-500">due {fmtDate(`${m.day}T12:00:00Z`)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
