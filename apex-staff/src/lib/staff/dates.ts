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
