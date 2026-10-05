import { inRange, type PayRun } from "./dates";
import type { CloseRow, PayRow, StaffRole, StaffRow } from "./types";

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
  retainer: number;
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
  run: PayRun
): PayResult {
  const lines: PayLine[] = [];
  const basis = cfg?.basis ?? defaultBasis(person.role);

  // Retainer / flat fee
  const retainer = run.includeMonthly ? round2(Number(cfg?.retainer_monthly ?? 0)) : 0;
  if (retainer > 0) lines.push({ description: `Retainer — ${run.monthLabel}`, amount: retainer });

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

  // Override on managed setters' sales
  let override = 0;
  const overridePct = Number(cfg?.override_pct ?? 0);
  if (run.includeMonthly && overridePct > 0) {
    const managed = allStaff.filter((s) => s.manager_id === person.id).map((s) => s.id);
    if (managed.length > 0) {
      const byCash = cfg?.override_basis === "cash";
      let overBase = 0;
      for (const c of closes) {
        if (!c.setter_id || !managed.includes(c.setter_id)) continue;
        if (byCash) {
          for (const pm of c.payments) if (inRange(pm.paid_at, run.monthFrom, run.monthTo)) overBase += Number(pm.amount);
        } else if (inRange(c.closed_at, run.monthFrom, run.monthTo)) {
          overBase += Number(c.deal_value);
        }
      }
      override = round2((overBase * overridePct) / 100);
      if (override > 0) {
        const names = allStaff.filter((s) => managed.includes(s.id)).map((s) => s.full_name).join(", ");
        lines.push({
          description: `${overridePct}% override on ${gbp(overBase)} ${byCash ? "cash collected from" : "new sales"} set by ${names} (${run.monthLabel})`,
          amount: override,
        });
      }
    }
  }

  return { lines, retainer, commission, override, total: round2(retainer + commission + override) };
}
