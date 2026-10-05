import { requireRole } from "@/lib/staff/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfigured, INVOICE_TO } from "@/lib/email";
import { invoiceNumber } from "@/lib/invoicePdf";
import { fmtDate } from "@/lib/staff/dates";
import { money, nameOf } from "@/lib/staff/metrics";
import type { CloseRow, InvoiceRow, PayRow, StaffRow } from "@/lib/staff/types";
import { createSaleInvoices, generateInvoice, resendInvoice, setInvoiceStatus } from "../../actions";
import { SubmitButton } from "@/components/staff/SubmitButton";
import { Badge, Card, Notice, PageHeader, SectionTitle } from "@/components/staff/ui";

export const metadata = { title: "Invoices | Apex Team" };

export default async function InvoicesPage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const { supabase } = await requireRole("admin");
  const admin = createAdminClient();
  const [{ data: inv }, { data: staffData }, { data: payData }, { data: closeData }] = await Promise.all([
    admin.from("invoices").select("*").order("seq", { ascending: false }).limit(200),
    supabase.from("staff").select("*").eq("active", true).order("full_name"),
    supabase.from("staff_pay").select("*"),
    supabase.from("closes").select("*, payments(*), calls(lead_name)").order("closed_at", { ascending: false }).limit(100),
  ]);
  const sales = (closeData ?? []) as CloseRow[];
  const invoices = (inv ?? []) as InvoiceRow[];
  const staff = (staffData ?? []) as StaffRow[];
  const pays = new Map(((payData ?? []) as PayRow[]).map((p) => [p.staff_id, p]));
  const people = staff.filter((s) => s.role !== "admin");
  const emailOn = emailConfigured();

  return (
    <>
      <PageHeader
        title="Self-billing invoices"
        subtitle={`Raised by Apex Leads on behalf of each person and sent to ${INVOICE_TO}. Only you can see these.`}
      />
      <Notice ok={searchParams.ok} error={searchParams.error} />

      {!emailOn ? (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
          <p className="text-sm font-semibold text-amber-300">Email isn&apos;t switched on yet</p>
          <p className="mt-1 text-sm text-zinc-400">
            Invoices are still created and you can download each PDF. To have them emailed to {INVOICE_TO}
            automatically, add a <code>RESEND_API_KEY</code> to the project.
          </p>
        </Card>
      ) : null}

      <SectionTitle>Create an invoice</SectionTitle>
      <Card className="mb-8">
        <p className="mb-3 text-sm text-zinc-400">
          Invoices are created automatically: on the 1st for the month just ended (retainer, override and commission),
          and on the 15th for sales from the 1st to the 14th (people paid twice a month). You can also make one yourself:
        </p>
        <div className="space-y-2">
          {people.length === 0 ? <p className="text-sm text-zinc-500">Add people on the Team page first.</p> : null}
          {people.map((p) => (
            <form key={p.id} action={generateInvoice} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="staff_id" value={p.id} />
              <span className="w-40 text-sm text-zinc-200">{p.full_name}</span>
              <Badge tone="info">{pays.get(p.id)?.pay_schedule === "semi_monthly" ? "paid 1st & 15th" : "paid 1st"}</Badge>
              <select name="which" className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white">
                <option value="month_end">Month-end run (paid on the 1st)</option>
                <option value="mid_month">Mid-month run, 1st–14th (paid on the 15th)</option>
              </select>
              <SubmitButton pendingText="Creating…">Create invoice</SubmitButton>
            </form>
          ))}
        </div>
      </Card>

      <SectionTitle>Same-day sale invoice</SectionTitle>
      <Card className="mb-8">
        <p className="mb-3 text-sm text-zinc-400">
          Sale payouts (closer commission and setter pay) are invoiced automatically the day a sale is paid in full and
          its contract is signed. Use this to raise them yourself for a sale. Tick the box to pay out before it is fully
          paid or signed.
        </p>
        <form action={createSaleInvoices} className="flex flex-wrap items-center gap-3">
          <select name="close_id" required className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white">
            <option value="">Choose a sale…</option>
            {sales.map((c) => (
              <option key={c.id} value={c.id}>
                {c.calls?.lead_name ?? "Sale"} — {money(Number(c.deal_value))} ({fmtDate(c.closed_at)})
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" name="force" /> Pay out now anyway
          </label>
          <SubmitButton pendingText="Creating…">Create sale invoices</SubmitButton>
        </form>
      </Card>

      <SectionTitle>All invoices ({invoices.length})</SectionTitle>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="px-5 py-3 font-medium">No.</th>
              <th className="py-3 font-medium">Person</th>
              <th className="py-3 font-medium">Period</th>
              <th className="py-3 text-right font-medium">Total</th>
              <th className="py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {invoices.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-4 text-zinc-500">No invoices yet.</td></tr>
            ) : null}
            {invoices.map((i) => (
              <tr key={i.id} className={i.status === "void" ? "opacity-40" : ""}>
                <td className="px-5 py-3 font-medium text-white">{invoiceNumber(i.seq)}</td>
                <td className="py-3 text-zinc-200">{nameOf(staff, i.staff_id)}</td>
                <td className="py-3 text-zinc-400">
                  {i.period_label}
                  <p className="text-xs text-zinc-600">created {fmtDate(i.created_at)}</p>
                </td>
                <td className="py-3 text-right font-semibold tabular-nums text-emerald-400">{money(Number(i.total))}</td>
                <td className="py-3">
                  <div className="flex flex-col items-start gap-1">
                    <Badge tone={i.status === "paid" ? "good" : i.status === "void" ? "default" : "warn"}>{i.status}</Badge>
                    {i.emailed_at ? <span className="text-xs text-zinc-500">emailed {fmtDate(i.emailed_at)}</span> : null}
                    {i.email_error ? <span className="max-w-[14rem] text-xs text-rose-400">{i.email_error}</span> : null}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap items-center justify-end gap-3 text-xs">
                    <a href={`/api/invoices/${i.id}/pdf`} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-400 hover:text-emerald-300">
                      PDF
                    </a>
                    {i.status !== "void" ? (
                      <>
                        <form action={resendInvoice}>
                          <input type="hidden" name="invoice_id" value={i.id} />
                          <button className="text-zinc-300 hover:text-white">{i.emailed_at ? "Re-send" : "Email"}</button>
                        </form>
                        {i.status === "issued" ? (
                          <form action={setInvoiceStatus}>
                            <input type="hidden" name="invoice_id" value={i.id} />
                            <input type="hidden" name="status" value="paid" />
                            <button className="text-zinc-300 hover:text-white">Mark paid</button>
                          </form>
                        ) : null}
                        <form action={setInvoiceStatus}>
                          <input type="hidden" name="invoice_id" value={i.id} />
                          <input type="hidden" name="status" value="void" />
                          <button className="text-rose-400 hover:text-rose-300">Void</button>
                        </form>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
