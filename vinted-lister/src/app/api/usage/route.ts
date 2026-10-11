import { checkQuota, PLANS } from "@/lib/plans";
import { json, preflight } from "@/lib/http";
import { getUserId } from "@/lib/session";
import { getUsage } from "@/lib/usage-store";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function GET(req: Request) {
  const usage = await getUsage(getUserId(req));
  return json(req, { plan: PLANS[usage.plan].name, used: usage.used, quota: checkQuota(usage) });
}
