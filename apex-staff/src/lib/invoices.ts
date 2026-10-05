import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { companyFromEnv, buildInvoicePdf, invoiceNumber } from "./invoicePdf";
import { emailConfigured, sendEmail } from "./email";
import { computeRunPay } from "./staff/pay";
import type { PayRun } from "./staff/dates";
import type { CloseRow, InvoiceLine, InvoiceRow, PayRow, RetainerClient, StaffRow } from "./staff/types";

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Build and store one self-billing invoice for a pay run. Returns the row, or why nothing was created. */
export async function createInvoice(
  admin: SupabaseClient,
  staffId: string,
  run: PayRun
): Promise<{ invoice?: InvoiceRow; skipped?: "nothing_owed" | "exists" }> {
  const [{ data: allStaff }, { data: cfg }, { data: closes }, { data: clients }] = await Promise.all([
    admin.from("staff").select("*"),
    admin.from("staff_pay").select("*").eq("staff_id", staffId).maybeSingle(),
    admin.from("closes").select("*, payments(*)").limit(2000),
    admin.from("retainer_clients").select("*"),
  ]);
  const staffList = (allStaff ?? []) as StaffRow[];
  const s = staffList.find((x) => x.id === staffId);
  if (!s) throw new Error("Staff member not found");

  const pay = computeRunPay(s, (cfg ?? undefined) as PayRow | undefined, (closes ?? []) as CloseRow[], staffList, run, (clients ?? []) as RetainerClient[]);
  if (pay.total <= 0) return { skipped: "nothing_owed" };

  const lines: InvoiceLine[] = pay.lines;
  const subtotal = round2(lines.reduce((t, l) => t + l.amount, 0));
  const vat = (cfg as PayRow | null)?.vat_number ? round2(subtotal * 0.2) : 0;
  const { data, error } = await admin
    .from("invoices")
    .insert({
      staff_id: s.id,
      period_start: run.from.toISOString(),
      period_end: run.to.toISOString(),
      period_label: run.label,
      lines,
      subtotal,
      vat,
      total: round2(subtotal + vat),
    })
    .select("*")
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return { skipped: "exists" };
    throw new Error(error.message);
  }
  return { invoice: data as InvoiceRow };
}

export async function renderInvoicePdf(admin: SupabaseClient, inv: InvoiceRow) {
  const [{ data: staff }, { data: cfg }] = await Promise.all([
    admin.from("staff").select("*").eq("id", inv.staff_id).single(),
    admin.from("staff_pay").select("*").eq("staff_id", inv.staff_id).maybeSingle(),
  ]);
  const s = staff as StaffRow;
  const c = cfg as PayRow | null;
  const bytes = await buildInvoicePdf(
    inv,
    {
      name: c?.payee_name || s.full_name,
      address: null,
      vatNumber: c?.vat_number ?? null,
      agreementDate: c?.agreement_date ?? null,
    },
    companyFromEnv()
  );
  return { bytes, payeeName: c?.payee_name || s.full_name, filename: `${invoiceNumber(inv.seq)}-${s.full_name.replace(/\s+/g, "-")}.pdf` };
}

/** Email the invoice PDF to the business inbox. Returns an error string or null. */
export async function emailInvoice(admin: SupabaseClient, inv: InvoiceRow): Promise<string | null> {
  if (!emailConfigured()) return "Email isn't set up yet (add RESEND_API_KEY).";
  const { bytes, payeeName, filename } = await renderInvoicePdf(admin, inv);
  const err = await sendEmail({
    subject: `Self-billing invoice ${invoiceNumber(inv.seq)} — ${payeeName} — ${inv.period_label}`,
    html: `<p>Self-billed invoice <b>${invoiceNumber(inv.seq)}</b> for <b>${payeeName}</b>, ${inv.period_label}.</p>
<p>Total due: <b>${gbp(Number(inv.total))}</b></p>
<ul>${inv.lines.map((l) => `<li>${l.description}: ${gbp(Number(l.amount))}</li>`).join("")}</ul>
<p>PDF attached. Raised under the self-billing agreement.</p>`,
    attachments: [{ filename, content: bytes }],
  });
  await admin
    .from("invoices")
    .update({ emailed_at: err ? null : new Date().toISOString(), email_error: err })
    .eq("id", inv.id);
  return err;
}
