import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Opens a signed contract. The bucket is private: this checks who is asking, then hands back a
// link that works for one minute.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { me } = await requireStaff();
  if (me.role !== "admin" && me.role !== "closer") return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const db = createAdminClient();
  const { data: c } = await db.from("contracts").select("closer_id, file_path").eq("id", params.id).maybeSingle();
  if (!c || !c.file_path || (me.role !== "admin" && c.closer_id !== me.id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data, error } = await db.storage.from("contracts").createSignedUrl(c.file_path, 60);
  if (error || !data) return NextResponse.json({ error: "could not open the file" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
