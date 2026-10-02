import { requireStaff, isManager } from "@/lib/staff/auth";
import { loadCore } from "@/lib/staff/data";
import { rangeBounds, fmtDate, todayIso, parseRange } from "@/lib/staff/dates";
import { money, nameOf, outstanding, owed, paidTotal, computeStats } from "@/lib/staff/metrics";
import { PAYMENT_TYPE_LABEL, type CloseRow, type StaffRow } from "@/lib/staff/types";
import { addPayment, updateDeal, deletePayment } from "../../actions";
import { SubmitButton } from "@/components/staff/SubmitButton";
import { Badge, Card, Field, Notice, PageHeader, RangeTabs, SectionTitle, Stat, inputCls } from "@/components/staff/ui";

export const metadata = { title: "Deals & cash | Apex Team" };

export default async function DealsPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string; range?: string };
}) {
  const { supabase, me } = await requireStaff();
  const range = parseRange(searchParams.range);
  const { from, to } = rangeBounds(range);
  const { staff, calls, closes } = await loadCore(supabase, from);
  const stats = computeStats(calls, closes, from, to);
  const owing = outstanding(closes);
  const today = todayIso();

  const open = closes.filter((c) => owed(c) > 0.001);
  const paid = closes.filter((c) => owed(c) <= 0.001);
  const manager = isManager(me.role);

  return (
    <>
      <PageHeader
        title="Deals & cash"
        subtitle="Every close, what's been paid and what's still owed."
        action={<RangeTabs base="/staff/deals" range={range} />}
      />
      <Notice ok={searchParams.ok} error={searchParams.error} />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Cash collected" value={money(stats.cash)} tone="good" hint="in this period" />
        <Stat label="Still owed" value={money(owing.total)} />
        <Stat label="Overdue" value={money(owing.overdue)} tone={owing.overdue > 0 ? "bad" : "default"} />
        <Stat label="Due in 7 days" value={money(owing.dueThisWeek)} tone="warn" />
      </div>

      <SectionTitle>Money still owed ({open.length})</SectionTitle>
      {open.length === 0 ? <p className="mb-8 text-sm text-zinc-500">Nothing outstanding.</p> : null}
      <div className="mb-8 space-y-3">
        {open
          .sort((a, b) => (a.next_payment_due ?? "9999").localeCompare(b.next_payment_due ?? "9999"))
          .map((c) => {
            const overdue = c.next_payment_due && c.next_payment_due < today;
            return (
              <Card key={c.id} className={overdue ? "border-rose-500/30" : ""}>
                <DealHeader c={c} staff={staff} />
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone="warn">{money(owed(c))} owed</Badge>
                  {c.next_payment_due ? (
                    <Badge tone={overdue ? "bad" : "default"}>
                      {overdue ? "Overdue since " : "Due "}
                      {fmtDate(c.next_payment_due)}
                    </Badge>
                  ) : (
                    <Badge tone="bad">No due date set</Badge>
                  )}
                </div>
                <DealActions c={c} manager={manager} canEdit={manager || c.closer_id === me.id} />
              </Card>
            );
          })}
      </div>

      <SectionTitle>Paid in full ({paid.length})</SectionTitle>
      <div className="space-y-3">
        {paid.slice(0, 30).map((c) => (
          <Card key={c.id}>
            <DealHeader c={c} staff={staff} />
            <div className="mt-3">
              <Badge tone="good">Paid in full</Badge>
            </div>
            <DealActions c={c} manager={manager} canEdit={manager || c.closer_id === me.id} hidePay />
          </Card>
        ))}
      </div>
    </>
  );
}


function DealHeader({ c, staff }: { c: CloseRow; staff: StaffRow[] }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="font-semibold text-white">{c.calls?.lead_name ?? "Deal"}</p>
        <p className="text-xs text-zinc-400">
          Closer: {nameOf(staff, c.closer_id)} · Setter: {nameOf(staff, c.setter_id)} ·{" "}
          {PAYMENT_TYPE_LABEL[c.payment_type]} · closed {fmtDate(c.closed_at)}
          {c.calls?.source ? ` · ${c.calls.source}` : ""}
        </p>
      </div>
      <p className="text-right text-sm tabular-nums text-zinc-300">
        <span className="font-semibold text-emerald-400">{money(paidTotal(c))}</span> / {money(Number(c.deal_value))}
      </p>
    </div>
  );
}

function DealActions({
  c,
  manager,
  canEdit,
  hidePay,
}: {
  c: CloseRow;
  manager: boolean;
  canEdit: boolean;
  hidePay?: boolean;
}) {
  return (
    <div className="mt-3 space-y-2">
      {!hidePay && canEdit ? (
        <details className="rounded-xl border border-white/10 p-3">
          <summary className="cursor-pointer text-sm font-medium text-emerald-400">＋ Record a payment</summary>
          <form action={addPayment} className="mt-3 grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="close_id" value={c.id} />
            <Field label="Amount received (£)">
              <input name="amount" inputMode="decimal" required className={inputCls} placeholder={String(Math.round(owed(c)))} />
            </Field>
            <Field label="Next payment due">
              <input name="next_payment_due" type="date" defaultValue={c.next_payment_due ?? ""} className={inputCls} />
            </Field>
            <Field label="Note">
              <input name="note" className={inputCls} placeholder="Stripe, bank transfer…" />
            </Field>
            <div className="flex items-end">
              <SubmitButton>Save payment</SubmitButton>
            </div>
          </form>
        </details>
      ) : null}

      <details className="rounded-xl border border-white/10 p-3">
        <summary className="cursor-pointer text-sm font-medium text-zinc-300">Payments & edit</summary>
        <ul className="mt-3 space-y-1 text-sm">
          {c.payments.length === 0 ? <li className="text-zinc-500">No payments yet.</li> : null}
          {c.payments
            .slice()
            .sort((a, b) => a.paid_at.localeCompare(b.paid_at))
            .map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="text-zinc-300">
                  {money(Number(p.amount))} · {fmtDate(p.paid_at)}
                  {p.note ? ` · ${p.note}` : ""}
                </span>
                {manager ? (
                  <form action={deletePayment}>
                    <input type="hidden" name="payment_id" value={p.id} />
                    <button className="text-xs text-rose-400 hover:text-rose-300">remove</button>
                  </form>
                ) : null}
              </li>
            ))}
        </ul>
        {canEdit ? (
          <form action={updateDeal} className="mt-4 grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="close_id" value={c.id} />
            <Field label="Deal value (£)">
              <input name="deal_value" inputMode="decimal" defaultValue={String(c.deal_value)} className={inputCls} />
            </Field>
            <Field label="Payment type">
              <select name="payment_type" defaultValue={c.payment_type} className={inputCls}>
                <option value="paid_in_full">Paid in full</option>
                <option value="deposit">Deposit</option>
                <option value="payment_plan">Payment plan</option>
              </select>
            </Field>
            <Field label="Next payment due">
              <input name="next_payment_due" type="date" defaultValue={c.next_payment_due ?? ""} className={inputCls} />
            </Field>
            <Field label="Notes">
              <input name="notes" defaultValue={c.notes ?? ""} className={inputCls} />
            </Field>
            <div className="sm:col-span-4">
              <SubmitButton>Save changes</SubmitButton>
              <span className="ml-3 text-xs text-zinc-500">Every edit is recorded in the audit trail.</span>
            </div>
          </form>
        ) : null}
      </details>
    </div>
  );
}
