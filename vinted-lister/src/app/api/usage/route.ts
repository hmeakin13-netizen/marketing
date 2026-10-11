import { ADDON_ACCOUNT_PENCE, checkQuota, PLANS, slotsFor } from "@/lib/plans";
import { json, preflight } from "@/lib/http";
import { getUserId } from "@/lib/session";
import { getUsage } from "@/lib/usage-store";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function GET(req: Request) {
  const usage = await getUsage(getUserId(req));
  return json(req, {
    plan: PLANS[usage.plan].name,
    used: usage.used,
    quota: checkQuota(usage),
    accounts: { linked: usage.accounts ?? [], slots: slotsFor(usage), addonPence: ADDON_ACCOUNT_PENCE, canBuyMore: usage.plan !== "trial" },
  });
}
