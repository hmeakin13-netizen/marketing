import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { companyFromEnv, buildInvoicePdf, invoiceNumber } from "./invoicePdf";
import { emailConfigured, sendEmail } from "./email";
import { computeDealPayouts, computeRunPay, dealPayableOn } from "./staff/pay";
import { todayIso } from "./staff/dates";
import type { PayRun } from "./staff/dates";
import type { CloseRow, InvoiceLine, InvoiceRow, PayRow, RetainerClient, StaffRow } from "./staff/types";

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Build and store one self-billing invoice for a periodic pay run (retainer + client shares). */
export async function createInvoice(
  admin: SupabaseClient,
  staffId: string,
  run: PayRun
): Promise<{ invoice?: InvoiceRow; skipped?: "nothing_owed" | "exists" }> {
  const [{ data: allStaff }, { data: cfg }, { data: clients }, { data: closes }] = await Promise.all([
    admin.from("staff").select("*"),
    admin.from("staff_pay").select("*").eq("staff_id", staffId).maybeSingle(),
    admin.from("retainer_clients").select("*"),
    admin.from("closes").select("*, payments(*), calls(lead_name)").limit(2000),
  ]);
  const staffList = (allStaff ?? []) as StaffRow[];
  const s = staffList.find((x) => x.id === staffId);
  if (!s) throw new Error("Staff member not found");

  const pay = computeRunPay(
    s,
    (cfg ?? undefined) as PayRow | undefined,
    run,
    (clients ?? []) as RetainerClient[],
    (closes ?? []) as CloseRow[],
    staffList
  );
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

/**
 * Same-day sale payouts. For every sale that is fully paid AND has its contract signed, create
 * (and email) one self-billing invoice per person owed something. Safe to call repeatedly: a
 * person is only ever invoiced once per sale, even if the invoice was later voided.
 */
export async function issueDealInvoices(
  admin: SupabaseClient,
  closeId?: string,
  opts: { force?: boolean } = {}
): Promise<number> {
  let q = admin.from("closes").select("*, payments(*), calls(lead_name)").limit(2000);
  if (closeId) q = q.eq("id", closeId);
  const [{ data: closes }, { data: staffData }, { data: payData }, { data: existing }] = await Promise.all([
    q,
    admin.from("staff").select("*"),
    admin.from("staff_pay").select("*"),
    admin.from("invoices").select("staff_id, close_id").not("close_id", "is", null),
  ]);
  const staff = (staffData ?? []) as StaffRow[];
  const pays = new Map(((payData ?? []) as PayRow[]).map((p) => [p.staff_id, p]));
  const done = new Set((existing ?? []).map((e) => `${e.staff_id}:${e.close_id}`));

  let created = 0;
  for (const c of (closes ?? []) as CloseRow[]) {
    // "force" lets the admin pay out today even if the full payment or contract isn't in yet.
    const payableOn = dealPayableOn(c) ?? (opts.force ? todayIso() : null);
    if (!payableOn) continue;
    const payouts = computeDealPayouts(c, staff, pays);
    for (const [staffId, lines] of Array.from(payouts.entries())) {
      if (done.has(`${staffId}:${c.id}`)) continue;
      const subtotal = round2(lines.reduce((t, l) => t + l.amount, 0));
      const vat = pays.get(staffId)?.vat_number ? round2(subtotal * 0.2) : 0;
      const lead = c.calls?.lead_name ?? "Sale";
      const { data, error } = await admin
        .from("invoices")
        .insert({
          staff_id: staffId,
          close_id: c.id,
          // closed_at makes each sale's invoice distinct for the same person.
          period_start: c.closed_at,
          period_end: new Date(`${payableOn}T12:00:00Z`).toISOString(),
          period_label: `Sale: ${lead} (${payableOn})`,
          lines,
          subtotal,
          vat,
          total: round2(subtotal + vat),
        })
        .select("*")
        .single();
      if (error) {
        if (/duplicate|unique/i.test(error.message)) continue;
        throw new Error(error.message);
      }
      created++;
      if (emailConfigured()) await emailInvoice(admin, data as InvoiceRow);
    }
  }
  return created;
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
