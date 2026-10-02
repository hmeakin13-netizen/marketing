import { inRange } from "./dates";
import type { CallRow, CloseRow, StaffRow } from "./types";

export const money = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);

export const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n)}%`);

const SHOWED = new Set(["follow_up", "lost", "closed"]);

export interface Stats {
  booked: number; // calls booked (by when they were booked)
  taken: number; // calls that happened or no-showed (by call date)
  showed: number;
  noShow: number;
  closed: number;
  showRate: number | null;
  closeRate: number | null;
  cash: number; // cash collected in the period
  revenue: number; // deal value closed in the period
}

export function paidTotal(c: CloseRow): number {
  return c.payments.reduce((s, p) => s + Number(p.amount), 0);
}

export function owed(c: CloseRow): number {
  return Math.max(0, Number(c.deal_value) - paidTotal(c));
}

/**
 * Stats for a slice of the team. `by` picks whose numbers these are:
 *  - a setter's credit comes from calls they booked / deals on those calls
 *  - a closer's credit comes from calls they took / deals they closed
 *  - undefined = the whole team
 */
export function computeStats(
  calls: CallRow[],
  closes: CloseRow[],
  from: Date,
  to: Date,
  by?: { staffId: string; role: "setter" | "closer" }
): Stats {
  const mine = (c: { setter_id: string | null; closer_id: string | null }) =>
    !by || (by.role === "setter" ? c.setter_id === by.staffId : c.closer_id === by.staffId);

  const booked = calls.filter((c) => mine(c) && inRange(c.booked_at, from, to)).length;
  const dueCalls = calls.filter((c) => mine(c) && inRange(c.call_at, from, to));
  const showed = dueCalls.filter((c) => SHOWED.has(c.outcome)).length;
  const noShow = dueCalls.filter((c) => c.outcome === "no_show").length;
  const closed = dueCalls.filter((c) => c.outcome === "closed").length;

  let cash = 0;
  let revenue = 0;
  for (const cl of closes) {
    if (!mine(cl)) continue;
    if (inRange(cl.closed_at, from, to)) revenue += Number(cl.deal_value);
    for (const p of cl.payments) {
      if (inRange(p.paid_at, from, to)) cash += Number(p.amount);
    }
  }

  return {
    booked,
    taken: showed + noShow,
    showed,
    noShow,
    closed,
    showRate: showed + noShow > 0 ? (showed / (showed + noShow)) * 100 : null,
    closeRate: showed > 0 ? (closed / showed) * 100 : null,
    cash,
    revenue,
  };
}

export function nameOf(staff: StaffRow[], id: string | null): string {
  if (!id) return "–";
  return staff.find((s) => s.id === id)?.full_name ?? "–";
}

/** Outstanding money across all deals. */
export function outstanding(closes: CloseRow[]) {
  const today = new Date().toISOString().slice(0, 10);
  let total = 0;
  let overdue = 0;
  let dueThisWeek = 0;
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  for (const c of closes) {
    const o = owed(c);
    if (o <= 0) continue;
    total += o;
    if (c.next_payment_due) {
      if (c.next_payment_due < today) overdue += o;
      else if (c.next_payment_due <= in7) dueThisWeek += o;
    }
  }
  return { total, overdue, dueThisWeek };
}
