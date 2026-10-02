import { requireStaff, isManager } from "@/lib/staff/auth";
import { loadCore } from "@/lib/staff/data";
import { rangeBounds } from "@/lib/staff/dates";
import { computeStats } from "@/lib/staff/metrics";
import { METRIC_LABEL, type TargetMetric } from "@/lib/staff/types";
import { saveTargets } from "../../actions";
import { TargetBars } from "@/components/staff/TargetBars";
import { SubmitButton } from "@/components/staff/SubmitButton";
import { Badge, Card, Notice, PageHeader, inputCls } from "@/components/staff/ui";

export const metadata = { title: "Targets | Apex Team" };

const METRICS: Record<"setter" | "closer", TargetMetric[]> = {
  setter: ["calls_booked", "show_rate", "closes", "cash_collected"],
  closer: ["calls_taken", "show_rate", "close_rate", "closes", "cash_collected"],
};

export default async function TargetsPage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const { supabase, me } = await requireStaff();
  const week = rangeBounds("week");
  const month = rangeBounds("month");
  const since = week.from < month.from ? week.from : month.from;
  const { staff, calls, closes, targets } = await loadCore(supabase, since);
  const people = staff.filter((s) => s.active && (s.role === "setter" || s.role === "closer"));
  const manager = isManager(me.role);

  return (
    <>
      <PageHeader title="Targets" subtitle="Everyone's KPIs, and how they're tracking this week and month." />
      <Notice ok={searchParams.ok} error={searchParams.error} />
      {people.length === 0 ? <p className="text-sm text-zinc-500">Add setters and closers on the Team page first.</p> : null}
      <div className="space-y-6">
        {people.map((p) => {
          const role = p.role as "setter" | "closer";
          const mine = targets.filter((t) => t.staff_id === p.id);
          const wk = computeStats(calls, closes, week.from, week.to, { staffId: p.id, role });
          const mo = computeStats(calls, closes, month.from, month.to, { staffId: p.id, role });
          const get = (m: TargetMetric, period: "week" | "month") =>
            mine.find((t) => t.metric === m && t.period === period)?.target;
          return (
            <Card key={p.id}>
              <div className="mb-4 flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">{p.full_name}</h2>
                <Badge tone={role === "closer" ? "info" : "default"}>{role}</Badge>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">This week</p>
                  <TargetBars title="weekly" stats={wk} targets={mine.filter((t) => t.period === "week")} />
                </div>
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">This month</p>
                  <TargetBars title="monthly" stats={mo} targets={mine.filter((t) => t.period === "month")} />
                </div>
              </div>
              {manager ? (
                <details className="mt-5 rounded-xl border border-white/10 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-emerald-400">Edit targets</summary>
                  <form action={saveTargets} className="mt-4 space-y-3">
                    <input type="hidden" name="staff_id" value={p.id} />
                    <div className="grid grid-cols-[1fr_6rem_6rem] items-center gap-3 text-xs text-zinc-500">
                      <span />
                      <span>Weekly</span>
                      <span>Monthly</span>
                    </div>
                    {METRICS[role].map((m) => (
                      <div key={m} className="grid grid-cols-[1fr_6rem_6rem] items-center gap-3">
                        <span className="text-sm text-zinc-300">{METRIC_LABEL[m]}</span>
                        <input name={`w_${m}`} inputMode="decimal" defaultValue={get(m, "week") ?? ""} className={inputCls} />
                        <input name={`m_${m}`} inputMode="decimal" defaultValue={get(m, "month") ?? ""} className={inputCls} />
                      </div>
                    ))}
                    <p className="text-xs text-zinc-500">Leave blank to clear a target.</p>
                    <SubmitButton>Save targets</SubmitButton>
                  </form>
                </details>
              ) : null}
            </Card>
          );
        })}
      </div>
    </>
  );
}
