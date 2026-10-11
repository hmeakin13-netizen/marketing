import { NextResponse } from "next/server";
import { checkQuota, PLANS } from "@/lib/plans";
import { getOrCreateUserId } from "@/lib/session";
import { getUsage } from "@/lib/usage-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const usage = await getUsage(getOrCreateUserId());
  const quota = checkQuota(usage);
  return NextResponse.json({ plan: PLANS[usage.plan].name, used: usage.used, quota });
}
