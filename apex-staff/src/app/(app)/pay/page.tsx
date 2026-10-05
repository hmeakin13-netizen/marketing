import { requireRole } from "@/lib/staff/auth";
import { monthToDateRun, ukIso } from "@/lib/staff/dates";
import { money } from "@/lib/staff/metrics";
import { computeRunPay, dealPayoutsInRange, pendingDealPayouts } from "@/lib/staff/pay";
import type { CloseRow, PayRow, RetainerClient, StaffRow } from "@/lib/staff/types";
import { savePay } from "../../actions";
import { SubmitButton } from "@/components/staff/SubmitButton";
import { Badge, Card, Field, Notice, PageHeader, Stat, inputCls } from "@/components/staff/ui";

export const metadata = { title: "Pay & commission | Apex Team" };

const BASIS_OPTIONS = {
  own_closes: "Cash from deals they closed",
  own_bookings: "Cash from calls they set",
  team_cash: "All team cash",
} as const;

export default async function PayPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string; month?: string };
}) {
  // Admin only. Pay lives in its own tables with admin-only RLS as well.
  const { supabase } = await requireRole("admin");
  const previous = searchParams.month === "last";
  const run = monthToDateRun(new Date(), previous);

  const [{ data: staffData }, { data: closeData }, { data: payData }, { data: clientData }] = await Promise.all([
    supabase.from("staff").select("*").eq("active", true).order("full_name"),
    supabase.from("closes").select("*, payments(*), calls(lead_name)").limit(2000),
    supabase.from("staff_pay").select("*"),
    supabase.from("retainer_clients").select("*"),
  ]);
  const clients = (clientData ?? []) as RetainerClient[];
  const staff = (staffData ?? []) as StaffRow[];
  const closes = (closeData ?? []) as CloseRow[];
  const pay = new Map(((payData ?? []) as PayRow[]).map((p) => [p.staff_id, p]));
  const people = staff.filter((s) => s.role !== "admin");

  const saleLines = dealPayoutsInRange(closes, staff, pay, ukIso(run.monthFrom), ukIso(run.monthTo));
  const pending = pendingDealPayouts(closes, staff, pay);
  const rows = people.map((p) => {
    const cfg = pay.get(p.id);
    const periodic = computeRunPay(p, cfg, run, clients, closes, staff);
    const sales = saleLines.get(p.id) ?? [];
    const salesTotal = sales.reduce((t, l) => t + l.amount, 0);
    return { p, cfg, onHold: pending.get(p.id) ?? [], lines: [...sales, ...periodic.lines], salesTotal, periodic, total: periodic.total + salesTotal };
  });
  const sumOf = (f: (r: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + f(r), 0);

  return (
    <>
      <PageHeader
        title="Pay & commission"
        subtitle="Only you can see this page. Nobody else can see anyone's pay, not even their own."
        action={
          <div className="inline-flex rounded-full border border-white/10 bg-zinc-900 p-1">
            {[
              { v: "this", l: "This month" },
              { v: "last", l: "Last month" },
            ].map((o) => (
              <a
                key={o.v}
                href={`/pay?month=${o.v}`}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                  (o.v === "last") === previous ? "bg-emerald-500 text-zinc-950" : "text-zinc-400 hover:text-white"
                }`}
              >
                {o.l}
              </a>
            ))}
          </div>
        }
      />
      <Notice ok={searchParams.ok} error={searchParams.error} />

      <div className="mb-2 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`Total — ${run.label}`} value={money(sumOf((r) => r.total))} tone="warn" />
        <Stat label="Sale payouts (paid same day)" value={money(sumOf((r) => r.salesTotal))} />
        <Stat label="Client retainer shares" value={money(sumOf((r) => r.periodic.clientShare))} />
        <Stat label="Flat monthly fees" value={money(sumOf((r) => r.periodic.retainer))} />
      </div>
      <p className="mb-6 text-xs text-zinc-500">
        Sale payouts (closer commission and setter pay) are paid and invoiced the same day a sale has its full payment in
        and its contract signed. Manager overrides are paid at month end. Client retainer shares and flat fees are invoiced on the 15th and the 1st.
      </p>

      <div className="space-y-4">
        {rows.length === 0 ? <p className="text-sm text-zinc-500">No staff yet. Add people on the Team page.</p> : null}
        {rows.map(({ p, cfg, lines, total, onHold }) => (
          <Card key={p.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-white">{p.full_name}</h2>
                  <Badge>{p.role}</Badge>
                  <Badge tone="info">{cfg?.pay_schedule === "semi_monthly" ? "paid 1st & 15th" : "paid on the 1st"}</Badge>
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-zinc-500">
                  {lines.length === 0 ? <li>Nothing owed yet this month.</li> : null}
                  {lines.map((l, i) => (
                    <li key={i}>
                      {l.description} = {money(l.amount)}
                    </li>
                  ))}
                  {onHold.map((l, i) => (
                    <li key={`h${i}`} className="text-amber-400/80">
                      On hold: {l.description} = {money(l.amount)} — {l.reason}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-2xl font-semibold tabular-nums text-emerald-400">{money(total)}</p>
            </div>
            <details className="mt-4 rounded-xl border border-white/10 p-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-300">Edit pay &amp; invoice details</summary>
              <form action={savePay} className="mt-3 grid gap-3 sm:grid-cols-4">
                <input type="hidden" name="staff_id" value={p.id} />
                <Field label="One-time % of the first payment on sales they SET (same day)">
                  <input name="setup_commission_pct" inputMode="decimal" defaultValue={cfg?.setup_commission_pct ?? 0} className={inputCls} />
                </Field>
                <Field label="…or a flat £ per sale they set (same day)">
                  <input name="setup_commission_flat" inputMode="decimal" defaultValue={cfg?.setup_commission_flat ?? 0} className={inputCls} />
                </Field>
                <Field label="Share of each client's monthly retainer (%)">
                  <input name="retainer_share_pct" inputMode="decimal" defaultValue={cfg?.retainer_share_pct ?? 0} className={inputCls} />
                </Field>
                <Field label="Flat monthly fee (£), if on a flat fee">
                  <input name="retainer_monthly" inputMode="decimal" defaultValue={cfg?.retainer_monthly ?? 0} className={inputCls} />
                </Field>
                <Field label="Commission % on each sale they CLOSE (paid same day)">
                  <input name="commission_pct" inputMode="decimal" defaultValue={cfg?.commission_pct ?? 0} className={inputCls} />
                </Field>
                <Field label="Commission on">
                  <select name="basis" defaultValue={cfg?.basis ?? "own_closes"} className={inputCls}>
                    {Object.entries(BASIS_OPTIONS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Retainer share paid">
                  <select name="pay_schedule" defaultValue={cfg?.pay_schedule ?? "monthly"} className={inputCls}>
                    <option value="monthly">Once a month (the 1st)</option>
                    <option value="semi_monthly">Twice a month (15th and 1st)</option>
                  </select>
                </Field>
                <Field label="Override % on sales set by setters they manage (same day)">
                  <input name="override_pct" inputMode="decimal" defaultValue={cfg?.override_pct ?? 0} className={inputCls} />
                </Field>
                <Field label="Trading name (shown on their invoice)">
                  <input name="payee_name" defaultValue={cfg?.payee_name ?? ""} placeholder={p.full_name} className={inputCls} />
                </Field>
                <Field label="Self-billing agreement date">
                  <input name="agreement_date" type="date" defaultValue={cfg?.agreement_date ?? ""} className={inputCls} />
                </Field>
                <Field label="VAT number (if registered)">
                  <input name="vat_number" defaultValue={cfg?.vat_number ?? ""} className={inputCls} />
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
