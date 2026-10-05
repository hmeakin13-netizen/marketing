import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInvoice, emailInvoice, issueDealInvoices } from "@/lib/invoices";
import { dueRuns } from "@/lib/staff/dates";
import type { PayRow, StaffRow } from "@/lib/staff/types";

export const dynamic = "force-dynamic";

// Runs daily (see vercel.json). Creates + emails a self-billing invoice for each
// person whose pay period (last full week or month) has just ended. Safe to run
// repeatedly: one invoice per person per period.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const admin = createAdminClient();
  const [{ data: staff }, { data: pays }] = await Promise.all([
    admin.from("staff").select("*").eq("active", true),
    admin.from("staff_pay").select("*"),
  ]);
  const payBy = new Map(((pays ?? []) as PayRow[]).map((p) => [p.staff_id, p]));

  const results: Record<string, string> = {};
  for (const s of (staff ?? []) as StaffRow[]) {
    if (s.role === "admin") continue;
    const cfg = payBy.get(s.id);
    if (!cfg) continue;
    for (const run of dueRuns(cfg.pay_schedule)) {
      const key = `${s.full_name} (${run.label})`;
      try {
        const r = await createInvoice(admin, s.id, run);
        if (r.invoice) {
          const err = await emailInvoice(admin, r.invoice);
          results[key] = err ? `created, not emailed: ${err}` : "created + emailed";
        } else {
          results[key] = r.skipped ?? "skipped";
        }
      } catch (e) {
        results[key] = `error: ${e instanceof Error ? e.message : "unknown"}`;
      }
    }
  }
  // Safety net for sale payouts (normally issued the moment the sale becomes payable).
  try {
    results["sale payouts"] = `${await issueDealInvoices(admin)} new invoice(s)`;
  } catch (e) {
    results["sale payouts"] = `error: ${e instanceof Error ? e.message : "unknown"}`;
  }
  return NextResponse.json({ ok: true, results });
}
