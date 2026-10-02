import { requireRole } from "@/lib/staff/auth";
import { loadCore } from "@/lib/staff/data";
import { parseRange, rangeBounds, inRange } from "@/lib/staff/dates";
import { money } from "@/lib/staff/metrics";
import type { PayRow } from "@/lib/staff/types";
import { savePay } from "../../actions";
import { SubmitButton } from "@/components/staff/SubmitButton";
import { Badge, Card, Field, Notice, PageHeader, RangeTabs, Stat, inputCls } from "@/components/staff/ui";

export const metadata = { title: "Pay & commission | Apex Team" };

const BASIS_LABEL = {
  own_closes: "Cash from deals they closed",
  own_bookings: "Cash from calls they set",
  team_cash: "All team cash",
} as const;

export default async function PayPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string; range?: string };
}) {
  // Admin only. Pay lives in its own table with admin-only RLS as well.
  const { supabase } = await requireRole("admin");
  const range = parseRange(searchParams.range) === "today" ? "week" : parseRange(searchParams.range);
  const { from, to } = rangeBounds(range);
  const { staff, closes } = await loadCore(supabase, from);
  const { data: payData } = await supabase.from("staff_pay").select("*");
  const pay = new Map(((payData ?? []) as PayRow[]).map((p) => [p.staff_id, p]));

  const people = staff.filter((s) => s.active && s.role !== "admin");
  const baseFactor = range === "week" ? 1 : 52 / 12;

  const rows = people.map((p) => {
    const cfg = pay.get(p.id);
    const pctRate = Number(cfg?.commission_pct ?? 0);
    const basis = cfg?.basis ?? (p.role === "closer" ? "own_closes" : p.role === "setter" ? "own_bookings" : "team_cash");
    let cashBase = 0;
    for (const c of closes) {
      const credited =
        basis === "team_cash" ||
        (basis === "own_closes" && c.closer_id === p.id) ||
        (basis === "own_bookings" && c.setter_id === p.id);
      if (!credited) continue;
      for (const pm of c.payments) if (inRange(pm.paid_at, from, to)) cashBase += Number(pm.amount);
    }
    const commission = (cashBase * pctRate) / 100;
    const base = Number(cfg?.base_pay_weekly ?? 0) * baseFactor;
    return { p, cfg, basis, pctRate, cashBase, commission, base, total: commission + base };
  });
  const totalOwed = rows.reduce((s, r) => s + r.total, 0);

  return (
    <>
      <PageHeader
        title="Pay & commission"
        subtitle="Only you can see this page — nobody else has access to pay data."
        action={<RangeTabs base="/pay" range={range} />}
      />
      <Notice ok={searchParams.ok} error={searchParams.error} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label={`Total owed (${range === "week" ? "this week" : "this month"})`} value={money(totalOwed)} tone="warn" />
        <Stat label="Commission" value={money(rows.reduce((s, r) => s + r.commission, 0))} />
        <Stat label="Base pay" value={money(rows.reduce((s, r) => s + r.base, 0))} hint={range === "month" ? "weekly × 52/12" : undefined} />
      </div>

      <div className="space-y-4">
        {rows.length === 0 ? <p className="text-sm text-zinc-500">No staff yet — add people on the Team page.</p> : null}
        {rows.map(({ p, cfg, basis, pctRate, cashBase, commission, base, total }) => (
          <Card key={p.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-white">{p.full_name}</h2>
                  <Badge>{p.role}</Badge>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {pctRate}% of {BASIS_LABEL[basis as keyof typeof BASIS_LABEL].toLowerCase()} ({money(cashBase)}) = {money(commission)}
                  {base > 0 ? ` + ${money(base)} base` : ""}
                </p>
              </div>
              <p className="text-2xl font-semibold tabular-nums text-emerald-400">{money(total)}</p>
            </div>
            <details className="mt-4 rounded-xl border border-white/10 p-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-300">Edit pay settings</summary>
              <form action={savePay} className="mt-3 grid gap-3 sm:grid-cols-4">
                <input type="hidden" name="staff_id" value={p.id} />
                <Field label="Commission %">
                  <input name="commission_pct" inputMode="decimal" defaultValue={cfg?.commission_pct ?? 0} className={inputCls} />
                </Field>
                <Field label="Commission on">
                  <select name="basis" defaultValue={basis} className={inputCls}>
                    {Object.entries(BASIS_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Base pay per week (£)">
                  <input name="base_pay_weekly" inputMode="decimal" defaultValue={cfg?.base_pay_weekly ?? 0} className={inputCls} />
                </Field>
                <div className="flex items-end">
                  <SubmitButton>Save</SubmitButton>
                </div>
              </form>
            </details>
          </Card>
        ))}
      </div>
    </>
  );
}
