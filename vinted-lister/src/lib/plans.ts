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
  /** Vinted accounts this subscription has claimed a slot for (normalised ids). */
  accounts?: string[];
  /** paid add-on accounts on top of the 1 included (always 0 on the trial) */
  extraAccounts?: number;
  /** when an account was last unlinked, to stop slot-swapping between people */
  lastUnlinkAt?: string;
}

/** Each extra Vinted account on a paid plan costs this per month. */
export const ADDON_ACCOUNT_PENCE = 2000;
export const MAX_EXTRA_ACCOUNTS = 9;
export const UNLINK_COOLDOWN_DAYS = 30;

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

/** Vinted accounts a subscription may use: 1 included, plus paid add-ons (not on the trial). */
export function slotsFor(usage: Usage): number {
  return usage.plan === "trial" ? 1 : 1 + Math.min(usage.extraAccounts ?? 0, MAX_EXTRA_ACCOUNTS);
}

export function monthlyPricePence(plan: PlanId, extraAccounts = 0): number {
  return plan === "trial" ? 0 : PLANS[plan].pricePence + extraAccounts * ADDON_ACCOUNT_PENCE;
}

/** Accepts "@Name", " name ", ids; rejects anything that isn't a plausible Vinted handle/id. */
export function normaliseAccountId(raw: string): string | null {
  const id = (raw ?? "").trim().toLowerCase().replace(/^@/, "");
  return /^[a-z0-9_.-]{2,64}$/.test(id) ? id : null;
}

export type LinkResult =
  | { ok: true; usage: Usage; alreadyLinked: boolean }
  | { ok: false; reason: "invalid_id" }
  | { ok: false; reason: "slots_full"; slots: number; canBuyMore: boolean; addonPence: number };

/** Claim a slot for a Vinted account. Idempotent for an account that's already linked. */
export function linkAccount(usage: Usage, rawId: string): LinkResult {
  const id = normaliseAccountId(rawId);
  if (!id) return { ok: false, reason: "invalid_id" };
  const accounts = usage.accounts ?? [];
  if (accounts.includes(id)) return { ok: true, usage, alreadyLinked: true };
  const slots = slotsFor(usage);
  if (accounts.length >= slots) {
    return {
      ok: false,
      reason: "slots_full",
      slots,
      canBuyMore: usage.plan !== "trial" && (usage.extraAccounts ?? 0) < MAX_EXTRA_ACCOUNTS,
      addonPence: ADDON_ACCOUNT_PENCE,
    };
  }
  return { ok: true, usage: { ...usage, accounts: [...accounts, id] }, alreadyLinked: false };
}

export type UnlinkResult =
  | { ok: true; usage: Usage }
  | { ok: false; reason: "not_linked" }
  | { ok: false; reason: "cooldown"; retryAt: string };

/** Free a slot. Limited to once per 30 days so a slot can't be passed around between people. */
export function unlinkAccount(usage: Usage, rawId: string, now: Date = new Date()): UnlinkResult {
  const id = normaliseAccountId(rawId);
  const accounts = usage.accounts ?? [];
  if (!id || !accounts.includes(id)) return { ok: false, reason: "not_linked" };
  if (usage.lastUnlinkAt) {
    const retry = new Date(usage.lastUnlinkAt);
    retry.setUTCDate(retry.getUTCDate() + UNLINK_COOLDOWN_DAYS);
    if (now < retry) return { ok: false, reason: "cooldown", retryAt: retry.toISOString() };
  }
  return { ok: true, usage: { ...usage, accounts: accounts.filter((a) => a !== id), lastUnlinkAt: now.toISOString() } };
}

export function checkQuota(usage: Usage, now: Date = new Date()): QuotaResult {
  const current = normaliseUsage(usage, now);
  const plan = PLANS[current.plan];
  // Every Vinted account on the subscription gets the plan's full allowance.
  const perPeriod = Number.isFinite(plan.limit) ? plan.limit * slotsFor(current) : FAIR_USE_CAP * slotsFor(current);
  const cap = perPeriod;
  if (current.used >= cap) {
    return Number.isFinite(plan.limit)
      ? { allowed: false, reason: "limit_reached", upgradeTo: nextPlan(plan.id) }
      : { allowed: false, reason: "fair_use", upgradeTo: null };
  }
  return { allowed: true, remaining: Number.isFinite(plan.limit) ? cap - current.used : null };
}

export function formatPrice(pence: number): string {
  return pence === 0 ? "Free" : `£${pence / 100}`;
}
