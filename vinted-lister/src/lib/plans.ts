export type PlanId = "trial" | "starter" | "unlimited";

export interface Plan {
  id: PlanId;
  name: string;
  pricePence: number;
  /** Listings allowed per period. Infinity = no plan limit (fair-use cap still applies). */
  limit: number;
  /** trial allowance is lifetime; paid plans reset every month */
  period: "lifetime" | "month";
}

/** Hard safety cap so "unlimited" can't be abused to run up API costs. */
export const FAIR_USE_CAP = 1000;

export const PLANS: Record<PlanId, Plan> = {
  trial: { id: "trial", name: "Free trial", pricePence: 0, limit: 5, period: "lifetime" },
  starter: { id: "starter", name: "Starter", pricePence: 1000, limit: 30, period: "month" },
  unlimited: { id: "unlimited", name: "Unlimited", pricePence: 3000, limit: Infinity, period: "month" },
};

export interface Usage {
  plan: PlanId;
  /** listings generated in the current period */
  used: number;
  /** start of the current billing period (ISO). Ignored for lifetime plans. */
  periodStart: string;
}

export type QuotaResult =
  | { allowed: true; remaining: number | null }
  | { allowed: false; reason: "limit_reached" | "fair_use"; upgradeTo: PlanId | null };

function nextPlan(plan: PlanId): PlanId | null {
  if (plan === "trial") return "starter";
  if (plan === "starter") return "unlimited";
  return null;
}

/** Roll a paid plan's counter over once a month has passed. */
export function normaliseUsage(usage: Usage, now: Date = new Date()): Usage {
  const plan = PLANS[usage.plan];
  if (plan.period === "lifetime") return usage;
  const start = new Date(usage.periodStart);
  const renewal = new Date(start);
  renewal.setUTCMonth(renewal.getUTCMonth() + 1);
  if (now >= renewal) return { ...usage, used: 0, periodStart: now.toISOString() };
  return usage;
}

export function checkQuota(usage: Usage, now: Date = new Date()): QuotaResult {
  const current = normaliseUsage(usage, now);
  const plan = PLANS[current.plan];
  const cap = Number.isFinite(plan.limit) ? plan.limit : FAIR_USE_CAP;
  if (current.used >= cap) {
    return Number.isFinite(plan.limit)
      ? { allowed: false, reason: "limit_reached", upgradeTo: nextPlan(plan.id) }
      : { allowed: false, reason: "fair_use", upgradeTo: null };
  }
  return { allowed: true, remaining: Number.isFinite(plan.limit) ? plan.limit - current.used : null };
}

export function formatPrice(pence: number): string {
  return pence === 0 ? "Free" : `£${pence / 100}`;
}
