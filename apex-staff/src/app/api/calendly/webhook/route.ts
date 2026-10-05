import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfig, upsertInvitee, verifySignature, type Invitee } from "@/lib/calendly";

export const dynamic = "force-dynamic";

// Calendly calls this when someone books or cancels. The request is public,
// so it's only trusted if the signature matches the key stored at connect time.
export async function POST(request: Request) {
  const raw = await request.text();
  const admin = createAdminClient();
  const config = await getConfig(admin);
  if (!config) return NextResponse.json({ error: "not connected" }, { status: 503 });

  if (!verifySignature(request.headers.get("calendly-webhook-signature"), raw, config.signing_key)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let body: { event?: string; payload?: Invitee };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  if ((body.event === "invitee.created" || body.event === "invitee.canceled") && body.payload) {
    const result = await upsertInvitee(admin, body.payload);
    return NextResponse.json({ ok: true, result });
  }
  return NextResponse.json({ ok: true, ignored: body.event });
}
