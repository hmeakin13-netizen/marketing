import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGhlConfig, syncGhl, syncGhlOne } from "@/lib/ghl";

export const dynamic = "force-dynamic";

// A GoHighLevel workflow ("Appointment" trigger -> Webhook action) calls this when a booking is made,
// changed or cancelled. It is public, so it only works with the secret key from the Settings page.
export async function POST(request: Request) {
  const admin = createAdminClient();
  const config = await getGhlConfig(admin);
  if (!config) return NextResponse.json({ error: "not connected" }, { status: 503 });
  if (new URL(request.url).searchParams.get("key") !== config.webhook_key) {
    return NextResponse.json({ error: "bad key" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* empty body: just resync */
  }
  const appt = (body.appointment ?? body.calendar ?? {}) as Record<string, unknown>;
  const id = String(appt.id ?? appt.appointmentId ?? body.appointmentId ?? body.id ?? "");
  try {
    if (id && id !== "undefined") {
      const result = await syncGhlOne(admin, config, id);
      return NextResponse.json({ ok: true, result });
    }
    const count = await syncGhl(admin, config);
    return NextResponse.json({ ok: true, synced: count });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
