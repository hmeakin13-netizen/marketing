import { NextResponse } from "next/server";
import { getUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The key the user pastes into the extension's settings. Cookie-authenticated, same-origin only. */
export async function GET() {
  return NextResponse.json({ key: getUserId() });
}
