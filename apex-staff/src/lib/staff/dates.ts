// All staff-portal days/weeks/months are UK days — a "today" total should
// roll over at UK midnight, not UTC midnight.
const TZ = "Europe/London";

export type Range = "today" | "week" | "month";

export const RANGES: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

export function parseRange(value: string | string[] | undefined): Range {
  return value === "today" || value === "month" ? value : "week";
}

function parts(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(d)) {
    if (p.type !== "literal") o[p.type] = Number(p.value);
  }
  return o;
}

function offsetMs(d: Date): number {
  const p = parts(d);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** The UTC instant at which the given UK wall-clock time occurs. */
export function ukWallClockToUtc(
  y: number,
  mo: number,
  d: number,
  h = 0,
  mi = 0
): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - offsetMs(new Date(guess));
  return new Date(guess - offsetMs(new Date(first)));
}

/** Parses a <input type="datetime-local"> value ("2026-10-02T14:30") as UK time. */
export function parseUkLocal(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return ukWallClockToUtc(+m[1], +m[2], +m[3], +m[4], +m[5]);
}

export function rangeBounds(range: Range, now = new Date()) {
  const p = parts(now);
  const todayStart = ukWallClockToUtc(p.year, p.month, p.day);
  let from: Date;
  let to: Date;
  if (range === "today") {
    from = todayStart;
    to = ukWallClockToUtc(p.year, p.month, p.day + 1);
  } else if (range === "week") {
    const dow = (new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() + 6) % 7; // Mon=0
    from = ukWallClockToUtc(p.year, p.month, p.day - dow);
    to = ukWallClockToUtc(p.year, p.month, p.day - dow + 7);
  } else {
    from = ukWallClockToUtc(p.year, p.month, 1);
    to = ukWallClockToUtc(p.year, p.month + 1, 1);
  }
  return { from, to };
}

export function inRange(iso: string | null, from: Date, to: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t < to.getTime();
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Value for a datetime-local input, in UK time. */
export function toUkLocalInput(d: Date): string {
  const p = parts(d);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}

export function todayIso(now = new Date()): string {
  const p = parts(now);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${z(p.month)}-${z(p.day)}`;
}

/** UK wall-clock parts of an instant, plus ISO weekday (1 = Monday … 7 = Sunday). */
export function ukParts(d: Date) {
  const p = parts(d);
  const isoDow = ((new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() + 6) % 7) + 1;
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, isoDow };
}

const monthName = (d: Date) =>
  d.toLocaleDateString("en-GB", { timeZone: "Europe/London", month: "long", year: "numeric" });

export type RunKind = "month_end" | "mid_month";
export type PaySchedule = "monthly" | "semi_monthly";

/**
 * One pay run = one invoice. Paid on the 1st (month_end) or the 15th (mid_month).
 *  - commission is worked out on cash collected in [commissionFrom, commissionTo)
 *  - retainer and the managed-setter override cover the whole month [monthFrom, monthTo),
 *    and are only included on the month_end run
 */
export interface PayRun {
  kind: RunKind;
  from: Date; // identifies the invoice (unique per person)
  to: Date;
  label: string;
  commissionFrom: Date;
  commissionTo: Date;
  commissionLabel: string;
  monthFrom: Date;
  monthTo: Date;
  monthLabel: string;
  includeMonthly: boolean;
}

/** The run paid on the 1st: covers the month that just ended. */
export function monthEndRun(schedule: PaySchedule, now = new Date()): PayRun {
  const p = ukParts(now);
  const monthFrom = ukWallClockToUtc(p.year, p.month - 1, 1);
  const monthTo = ukWallClockToUtc(p.year, p.month, 1);
  const mid = ukWallClockToUtc(p.year, p.month - 1, 15);
  const monthLabel = monthName(new Date(monthFrom.getTime() + 12 * 3600e3));
  const semi = schedule === "semi_monthly";
  const commissionFrom = semi ? mid : monthFrom;
  return {
    kind: "month_end",
    from: monthFrom,
    to: monthTo,
    label: monthLabel,
    commissionFrom,
    commissionTo: monthTo,
    commissionLabel: semi
      ? `sales 15 ${monthName(new Date(monthFrom.getTime() + 12 * 3600e3))} to month end`
      : `sales in ${monthLabel}`,
    monthFrom,
    monthTo,
    monthLabel,
    includeMonthly: true,
  };
}

/** The run paid on the 15th: commission on sales from the 1st to the 14th of this month. */
export function midMonthRun(now = new Date()): PayRun {
  const p = ukParts(now);
  const from = ukWallClockToUtc(p.year, p.month, 1);
  const to = ukWallClockToUtc(p.year, p.month, 15);
  const monthTo = ukWallClockToUtc(p.year, p.month + 1, 1);
  const label = `1–14 ${monthName(new Date(from.getTime() + 12 * 3600e3))}`;
  return {
    kind: "mid_month",
    from,
    to,
    label,
    commissionFrom: from,
    commissionTo: to,
    commissionLabel: `sales ${label}`,
    monthFrom: from,
    monthTo,
    monthLabel: monthName(new Date(from.getTime() + 12 * 3600e3)),
    includeMonthly: false,
  };
}

/** Runs that are due to be invoiced right now for someone on this schedule. */
export function dueRuns(schedule: PaySchedule, now = new Date()): PayRun[] {
  const runs = [monthEndRun(schedule, now)];
  if (schedule === "semi_monthly" && ukParts(now).day >= 15) runs.push(midMonthRun(now));
  return runs;
}

/** The month so far, as a single "projection" run (for the Pay overview). */
export function monthToDateRun(now = new Date(), previous = false): PayRun {
  const p = ukParts(now);
  const off = previous ? -1 : 0;
  const from = ukWallClockToUtc(p.year, p.month + off, 1);
  const to = ukWallClockToUtc(p.year, p.month + off + 1, 1);
  const label = monthName(new Date(from.getTime() + 12 * 3600e3));
  return {
    kind: "month_end",
    from,
    to,
    label,
    commissionFrom: from,
    commissionTo: to,
    commissionLabel: `sales in ${label}`,
    monthFrom: from,
    monthTo: to,
    monthLabel: label,
    includeMonthly: true,
  };
}
