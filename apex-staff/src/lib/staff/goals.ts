import { ukIso } from "./dates";
import type { CloseRow } from "./types";

/** Harry's trip goal. Change the numbers here and the dashboard banner follows. */
export const GOAL = {
  name: "Cape Verde goal",
  /** Total first-sale value (deal value of closed deals) needed, counted from `start`. */
  target: 34500,
  /** Average first-sale value of one close, used to say "that is N closes". */
  perClose: 1500,
  /** Only closes from this UK day onwards count towards the goal. */
  start: "2026-11-01",
  /** The marker that pays for the trip itself. */
  tripPaid: 10000,
  /** Month milestones: the first month the team's closed value reaches each amount. */
  monthMilestones: [10000, 15000, 20000, 25000, 30000],
} as const;

export function goalProgress(closes: CloseRow[], now = new Date()) {
  const value = (c: CloseRow) => Number(c.deal_value) || 0;
  const counted = closes.filter((c) => ukIso(new Date(c.closed_at)) >= GOAL.start);
  const sum = counted.reduce((s, c) => s + value(c), 0);

  // Closed value per UK month, across every close ever.
  const byMonth = new Map<string, { value: number; closes: number }>();
  for (const c of closes) {
    const key = ukIso(new Date(c.closed_at)).slice(0, 7);
    const m = byMonth.get(key) ?? { value: 0, closes: 0 };
    m.value += value(c);
    m.closes += 1;
    byMonth.set(key, m);
  }
  const months = Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b));
  const thisKey = ukIso(now).slice(0, 7);
  const thisMonth = byMonth.get(thisKey) ?? { value: 0, closes: 0 };

  const milestones = GOAL.monthMilestones.map((amount) => {
    const hit = months.find(([, m]) => m.value >= amount);
    return { amount, month: hit ? hit[0] : null };
  });
  const best = months.reduce<{ key: string; value: number } | null>(
    (b, [key, m]) => (!b || m.value > b.value ? { key, value: m.value } : b),
    null
  );

  return {
    sum,
    count: counted.length,
    left: Math.max(0, GOAL.target - sum),
    closesLeft: Math.max(0, Math.ceil((GOAL.target - sum) / GOAL.perClose)),
    pct: Math.min(100, (sum / GOAL.target) * 100),
    thisMonth,
    thisKey,
    milestones,
    best,
  };
}

export const monthLabel = (key: string) =>
  new Date(key + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" });
