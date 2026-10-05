import { requireRole } from "@/lib/staff/auth";
import { monthToDateRun } from "@/lib/staff/dates";
import { money } from "@/lib/staff/metrics";
import { computeRunPay } from "@/lib/staff/pay";
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
    supabase.from("closes").select("*, payments(*)").limit(2000),
    supabase.from("staff_pay").select("*"),
    supabase.from("retainer_clients").select("*"),
  ]);
  const clients = (clientData ?? []) as RetainerClient[];
  const staff = (staffData ?? []) as StaffRow[];
  const closes = (closeData ?? []) as CloseRow[];
  const pay = new Map(((payData ?? []) as PayRow[]).map((p) => [p.staff_id, p]));
  const people = staff.filter((s) => s.role !== "admin");

  const rows = people.map((p) => {
    const cfg = pay.get(p.id);
    return { p, cfg, r: computeRunPay(p, cfg, closes, staff, run, clients) };
  });
  const sum = (k: "retainer" | "clientShare" | "commission" | "override" | "total") => rows.reduce((t, x) => t + x.r[k], 0);

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
        <Stat label={`Total — ${run.label}`} value={money(sum("total"))} tone="warn" />
        <Stat label="Client retainer shares" value={money(sum("clientShare") + sum("retainer"))} />
        <Stat label="Commission" value={money(sum("commission"))} />
        <Stat label="Overrides" value={money(sum("override"))} />
      </div>
      <p className="mb-6 text-xs text-zinc-500">
        This is the whole month combined. Actual payments are invoiced in two runs for anyone paid twice a month: sales
        from the 1st to the 14th on the 15th, then sales from the 15th to month end (plus retainer and override) on the 1st.
      </p>

      <div className="space-y-4">
        {rows.length === 0 ? <p className="text-sm text-zinc-500">No staff yet. Add people on the Team page.</p> : null}
        {rows.map(({ p, cfg, r }) => (
          <Card key={p.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-white">{p.full_name}</h2>
                  <Badge>{p.role}</Badge>
                  <Badge tone="info">{cfg?.pay_schedule === "semi_monthly" ? "paid 1st & 15th" : "paid on the 1st"}</Badge>
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-zinc-500">
                  {r.lines.length === 0 ? <li>Nothing owed yet this month.</li> : null}
                  {r.lines.map((l, i) => (
                    <li key={i}>
                      {l.description} = {money(l.amount)}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-2xl font-semibold tabular-nums text-emerald-400">{money(r.total)}</p>
            </div>
            <details className="mt-4 rounded-xl border border-white/10 p-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-300">Edit pay &amp; invoice details</summary>
              <form action={savePay} className="mt-3 grid gap-3 sm:grid-cols-4">
                <input type="hidden" name="staff_id" value={p.id} />
                <Field label="Share of each client's monthly retainer (%)">
                  <input name="retainer_share_pct" inputMode="decimal" defaultValue={cfg?.retainer_share_pct ?? 0} className={inputCls} />
                </Field>
                <Field label="Flat monthly fee (£), if on a flat fee">
                  <input name="retainer_monthly" inputMode="decimal" defaultValue={cfg?.retainer_monthly ?? 0} className={inputCls} />
                </Field>
                <Field label="Commission %">
                  <input name="commission_pct" inputMode="decimal" defaultValue={cfg?.commission_pct ?? 0} className={inputCls} />
                </Field>
                <Field label="Commission on">
                  <select name="basis" defaultValue={cfg?.basis ?? "own_closes"} className={inputCls}>
                    {Object.entries(BASIS_OPTIONS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Commission paid">
                  <select name="pay_schedule" defaultValue={cfg?.pay_schedule ?? "monthly"} className={inputCls}>
                    <option value="monthly">Once a month (the 1st)</option>
                    <option value="semi_monthly">Twice a month (15th and 1st)</option>
                  </select>
                </Field>
                <Field label="Override % (on setters they manage)">
                  <input name="override_pct" inputMode="decimal" defaultValue={cfg?.override_pct ?? 0} className={inputCls} />
                </Field>
                <Field label="Override calculated on">
                  <select name="override_basis" defaultValue={cfg?.override_basis ?? "client_fee"} className={inputCls}>
                    <option value="client_fee">Setup fee of new clients (from the Clients list, automatic)</option>
                    <option value="deal_value">Deal value of sales logged on Calls</option>
                    <option value="cash">Cash collected on those sales</option>
                  </select>
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
