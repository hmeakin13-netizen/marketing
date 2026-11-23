import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff/auth";
import { blankContract, buildContractPdf, type OfferTier } from "@/lib/staff/contracts";

export const dynamic = "force-dynamic";

// A tier's contract as a PDF with the client's details left blank: an example for a prospect.
// Nothing is saved: no client and no contract record is created.
export async function GET(request: Request, { params }: { params: { tier: string } }) {
  const { supabase, me } = await requireStaff();
  if (me.role !== "admin" && me.role !== "closer") return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const [{ data: tier }, { data: template }] = await Promise.all([
    supabase.from("offer_tiers").select("*").eq("key", params.tier).maybeSingle<OfferTier>(),
    supabase.from("contract_templates").select("body").eq("tier", params.tier).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!tier || !template) return NextResponse.json({ error: "no template for that tier" }, { status: 404 });
  const pdf = await buildContractPdf({ body: blankContract(template.body, tier), client_name: "", signed_at: null, signer_name: null, example: true });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const name = `${tier.name.replace(/[^A-Za-z0-9]+/g, "-")}-example-agreement.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
