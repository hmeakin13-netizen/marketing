import { inRange, ukParts, ukWallClockToUtc, type PayRun } from "./dates";
import type { CloseRow, PayRow, RetainerClient, StaffRole, StaffRow } from "./types";

export const BASIS_LABEL = {
  own_closes: "cash from deals they closed",
  own_bookings: "cash from calls they set",
  team_cash: "all team cash",
} as const;

export interface PayLine {
  description: string;
  amount: number;
}

export interface PayResult {
  lines: PayLine[];
  retainer: number; // flat monthly fee
  clientShare: number; // share of active clients' monthly fees
  commission: number;
  override: number;
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function defaultBasis(role: StaffRole): PayRow["basis"] {
  return role === "closer" ? "own_closes" : role === "setter" ? "own_bookings" : "team_cash";
}

/**
 * What one person is owed for one pay run:
 *  - retainer: fixed monthly amount (month-end run only)
 *  - commission: % of cash collected in the run's commission window, on their basis
 *  - override: % on sales set by the setters they manage, for the whole month (month-end run only),
 *    on the deal value of new sales ("deal_value") or the cash collected ("cash")
 */
export function computeRunPay(
  person: Pick<StaffRow, "id" | "role">,
  cfg: PayRow | undefined,
  closes: CloseRow[],
  allStaff: StaffRow[],
  run: PayRun,
  clients: RetainerClient[] = []
): PayResult {
  const lines: PayLine[] = [];
  const basis = cfg?.basis ?? defaultBasis(person.role);

  // Retainer / flat fee
  const retainer = run.includeMonthly ? round2(Number(cfg?.retainer_monthly ?? 0)) : 0;
  if (retainer > 0) lines.push({ description: `Retainer — ${run.monthLabel}`, amount: retainer });

  // Share of each active client's monthly fee (the closer who signed them)
  let clientShare = 0;
  const sharePct = Number(cfg?.retainer_share_pct ?? 0);
  if (sharePct > 0) {
    for (const c of clients) {
      if (c.closer_id !== person.id) continue;
      for (const iso of retainerDueDates(c, run.commissionFrom, run.commissionTo)) {
        const amt = round2((Number(c.monthly_fee) * sharePct) / 100);
        if (amt <= 0) continue;
        clientShare += amt;
        lines.push({
          description: `${sharePct}% of ${c.name}'s ${gbp(Number(c.monthly_fee))} monthly retainer (due ${fmtIsoDay(iso)})`,
          amount: amt,
        });
      }
    }
    clientShare = round2(clientShare);
  }

  // Commission
  let cashBase = 0;
  for (const c of closes) {
    for (const pm of c.payments) {
      if (!inRange(pm.paid_at, run.commissionFrom, run.commissionTo)) continue;
      if (
        basis === "team_cash" ||
        (basis === "own_closes" && c.closer_id === person.id) ||
        (basis === "own_bookings" && c.setter_id === person.id)
      ) {
        cashBase += Number(pm.amount);
      }
    }
  }
  const commissionPct = Number(cfg?.commission_pct ?? 0);
  const commission = round2((cashBase * commissionPct) / 100);
  if (commission > 0) {
    lines.push({
      description: `${commissionPct}% commission on ${gbp(cashBase)} ${BASIS_LABEL[basis]} collected (${run.commissionLabel})`,
      amount: commission,
    });
  }

  // Override on the setters this person manages (month-end run only, one-time per sale)
  let override = 0;
  const overridePct = Number(cfg?.override_pct ?? 0);
  if (run.includeMonthly && overridePct > 0) {
    const managed = allStaff.filter((s) => s.manager_id === person.id).map((s) => s.id);
    if (managed.length > 0) {
      const mode = cfg?.override_basis ?? "client_fee";
      const names = allStaff.filter((s) => managed.includes(s.id)).map((s) => s.full_name).join(", ");
      let overBase = 0;
      let what = "";
      if (mode === "client_fee") {
        // Automatic from the Clients list: new clients a managed setter set, signed in this month.
        const fromD = run.monthFrom.toISOString().slice(0, 10);
        const toD = run.monthTo.toISOString().slice(0, 10);
        const newClients = clients.filter(
          (c) => c.setter_id && managed.includes(c.setter_id) && c.start_date >= fromD && c.start_date < toD
        );
        for (const c of newClients) overBase += Number(c.monthly_fee);
        what = `new clients set by ${names}: ${newClients.map((c) => c.name).join(", ")}`;
      } else {
        const byCash = mode === "cash";
        for (const c of closes) {
          if (!c.setter_id || !managed.includes(c.setter_id)) continue;
          if (byCash) {
            for (const pm of c.payments) if (inRange(pm.paid_at, run.monthFrom, run.monthTo)) overBase += Number(pm.amount);
          } else if (inRange(c.closed_at, run.monthFrom, run.monthTo)) {
            overBase += Number(c.deal_value);
          }
        }
        what = `${byCash ? "cash collected from" : "new sales"} set by ${names}`;
      }
      override = round2((overBase * overridePct) / 100);
      if (override > 0) {
        lines.push({
          description: `${overridePct}% one-time override on ${gbp(overBase)} (${what}) — ${run.monthLabel}`,
          amount: override,
        });
      }
    }
  }

  return { lines, retainer, clientShare, commission, override, total: round2(retainer + clientShare + commission + override) };
}

const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * The dates in [from, to) on which this client's monthly fee falls due and the closer is
 * entitled to their share: from the month AFTER sign-up (the first payment is the sale itself,
 * paid as normal commission), up to and including the day the client leaves.
 */
export function retainerDueDates(client: RetainerClient, from: Date, to: Date): string[] {
  const start = new Date(`${client.start_date}T12:00:00Z`);
  const startIndex = start.getUTCFullYear() * 12 + start.getUTCMonth();
  const out: string[] = [];
  const first = ukParts(from);
  const last = ukParts(new Date(to.getTime() - 1));
  for (let idx = first.year * 12 + first.month - 1; idx <= last.year * 12 + last.month - 1; idx++) {
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    if (idx <= startIndex) continue;
    const day = Math.min(client.billing_day, daysInMonth(y, m));
    const iso = `${y}-${pad(m)}-${pad(day)}`;
    if (!inRange(ukWallClockToUtc(y, m, day).toISOString(), from, to)) continue;
    if (client.end_date && iso > client.end_date) continue;
    out.push(iso);
  }
  return out;
}

export function fmtIsoDay(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** The next day the closer's share for this client will be paid out, or null if they've left. */
export function nextRetainerDate(client: RetainerClient, now = new Date()): string | null {
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + 62 * 86400000);
  const from = ukWallClockToUtc(ukParts(now).year, ukParts(now).month, ukParts(now).day);
  return retainerDueDates(client, from, horizon).find((d) => d >= today) ?? null;
}

/** When money collected on `iso` gets paid to the closer: the 15th (for 1st–14th) or the 1st of next month. */
export function payoutDateFor(iso: string, schedule: PayRow["pay_schedule"]): string {
  const [y, m, d] = iso.split("-").map(Number);
  const next = (yy: number, mm: number, dd: number) => `${mm > 12 ? yy + 1 : yy}-${pad(mm > 12 ? 1 : mm)}-${pad(dd)}`;
  if (schedule === "semi_monthly" && d <= 14) return `${y}-${pad(m)}-15`;
  return next(y, m + 1, 1);
}
