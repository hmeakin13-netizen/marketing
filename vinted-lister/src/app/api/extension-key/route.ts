import { NextResponse } from "next/server";
import { getUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * What the user pastes into the extension's settings. Same-origin and cookie-authenticated: on a Vercel-protected
 * deployment this route is only reachable by signed-in team members, which is why it can hand out the access
 * secret the extension needs to get past that same protection.
 */
export async function GET() {
  return NextResponse.json({ key: getUserId(), accessSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? null });
}
