import { inRange, ukIso, ukParts, ukWallClockToUtc, type PayRun } from "./dates";
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
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function defaultBasis(role: StaffRole): PayRow["basis"] {
  return role === "closer" ? "own_closes" : role === "setter" ? "own_bookings" : "team_cash";
}

/**
 * Periodic pay (the 15th / 1st): a flat monthly fee and the share of each active client's
 * monthly retainer. Sale payouts (commission, setter pay, overrides) are NOT here; they are paid
 * the same day the full payment is in and the contract is signed (see computeDealPayouts).
 */
export function computeRunPay(
  person: Pick<StaffRow, "id" | "role">,
  cfg: PayRow | undefined,
  run: PayRun,
  clients: RetainerClient[] = []
): PayResult {
  const lines: PayLine[] = [];

  // Flat monthly fee
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

  return { lines, retainer, clientShare, total: round2(retainer + clientShare) };
}

// ------------------------------------------------------------------ sale payouts (same day)

const sum2 = (nums: number[]) => round2(nums.reduce((t, n) => t + n, 0));

/** The day a sale's commission becomes payable: full payment in AND contract signed (the later of the two). */
export function dealPayableOn(c: CloseRow): string | null {
  if (!c.contract_signed_at) return null;
  const paid = sum2(c.payments.map((p) => Number(p.amount)));
  if (paid + 0.005 < Number(c.deal_value)) return null;
  const lastPaid = c.payments.map((p) => ukIso(new Date(p.paid_at))).sort().pop() ?? c.contract_signed_at;
  return lastPaid > c.contract_signed_at ? lastPaid : c.contract_signed_at;
}

/**
 * Everything owed because of ONE sale, per person, once it's payable:
 *  - the closer's commission % of the sale value
 *  - the setter's one-time % (and/or flat £) for setting it
 *  - a manager's override % when the setter reports to them
 */
export function computeDealPayouts(
  c: CloseRow,
  staff: StaffRow[],
  pays: Map<string, PayRow>
): Map<string, PayLine[]> {
  const out = new Map<string, PayLine[]>();
  const value = Number(c.deal_value);
  const lead = c.calls?.lead_name ?? "sale";

  for (const s of staff) {
    if (!s.active) continue;
    const cfg = pays.get(s.id);
    if (!cfg) continue;
    const lines: PayLine[] = [];

    const basis = cfg.basis ?? defaultBasis(s.role);
    const pct = Number(cfg.commission_pct ?? 0);
    if (
      pct > 0 &&
      (basis === "team_cash" || (basis === "own_closes" && c.closer_id === s.id) || (basis === "own_bookings" && c.setter_id === s.id))
    ) {
      lines.push({
        description: `${pct}% commission on ${lead}'s ${gbp(value)} sale (paid in full, contract signed)`,
        amount: round2((value * pct) / 100),
      });
    }

    const setPct = Number(cfg.setup_commission_pct ?? 0);
    const setFlat = Number(cfg.setup_commission_flat ?? 0);
    if (c.setter_id === s.id && (setPct > 0 || setFlat > 0)) {
      const parts = [setPct > 0 ? `${setPct}% of the ${gbp(value)} first payment` : "", setFlat > 0 ? `${gbp(setFlat)} flat` : ""].filter(Boolean);
      lines.push({
        description: `One-time payment for setting ${lead}: ${parts.join(" + ")}`,
        amount: round2((value * setPct) / 100 + setFlat),
      });
    }

    const ovr = Number(cfg.override_pct ?? 0);
    if (ovr > 0 && c.setter_id) {
      const setter = staff.find((x) => x.id === c.setter_id);
      if (setter?.manager_id === s.id) {
        lines.push({
          description: `${ovr}% override on ${lead}'s ${gbp(value)} sale set by ${setter.full_name}`,
          amount: round2((value * ovr) / 100),
        });
      }
    }

    const filtered = lines.filter((l) => l.amount > 0);
    if (filtered.length) out.set(s.id, filtered);
  }
  return out;
}

/** Sale payouts that fell due in [fromIso, toIso) (UK dates), per person. For the Pay overview. */
export function dealPayoutsInRange(
  closes: CloseRow[],
  staff: StaffRow[],
  pays: Map<string, PayRow>,
  fromIso: string,
  toIso: string
): Map<string, PayLine[]> {
  const out = new Map<string, PayLine[]>();
  for (const c of closes) {
    const on = dealPayableOn(c);
    if (!on || on < fromIso || on >= toIso) continue;
    computeDealPayouts(c, staff, pays).forEach((lines, id) => {
      out.set(id, [...(out.get(id) ?? []), ...lines]);
    });
  }
  return out;
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
