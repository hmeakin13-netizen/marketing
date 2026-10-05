import { NextResponse } from "next/server";
import { requireRole } from "@/lib/staff/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderInvoicePdf } from "@/lib/invoices";
import type { InvoiceRow } from "@/lib/staff/types";

export const dynamic = "force-dynamic";

// Admin only — invoices contain pay information.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireRole("admin");
  const admin = createAdminClient();
  const { data } = await admin.from("invoices").select("*").eq("id", params.id).single();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { bytes, filename } = await renderInvoicePdf(admin, data as InvoiceRow);
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"` },
  });
}
