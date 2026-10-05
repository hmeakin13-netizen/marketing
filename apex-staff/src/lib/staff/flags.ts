import { owed, money, nameOf, paidTotal } from "./metrics";
import { needsRecording } from "./recording";
import type { CallRow, CloseRow, ChaseRow, StaffRow } from "./types";

// How long before each thing counts as "dropped the ball". Tweak here.
export const RULES = {
  balanceChaseEveryDays: 3, // owed money must be chased at least this often
  overdueChaseEveryDays: 1, // once past the due date, chase daily
  missingOutcomeAfterHours: 1, // call has finished, its owner must log the outcome + notes
  noShowChaseWithinHours: 24, // no-show must be followed up within a day
  followUpEveryDays: 3, // "follow up" calls must be chased this often
  followUpGiveUpAfterDays: 30,
};

export type FlagKind =
  | "overdue_payment"
  | "unchased_balance"
  | "no_due_date"
  | "missing_outcome"
  | "no_show_unchased"
  | "follow_up_stale"
  | "missing_recording"
  | "missing_notes"
  | "unconfirmed_call"
  | "contract_unsigned";

export interface Flag {
  id: string;
  kind: FlagKind;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  ownerId: string | null;
  daysLate: number;
  closeId?: string;
  callId?: string;
}

export const FLAG_LABEL: Record<FlagKind, string> = {
  overdue_payment: "Payment overdue",
  unchased_balance: "Balance not chased",
  no_due_date: "No due date",
  missing_outcome: "No outcome logged",
  no_show_unchased: "No-show not followed up",
  follow_up_stale: "Follow-up gone cold",
  missing_recording: "No Fathom recording",
  missing_notes: "No call notes",
  unconfirmed_call: "Call not confirmed",
  contract_unsigned: "Contract not signed",
};

const DAY = 86400000;
const days = (ms: number) => Math.floor(ms / DAY);

export function computeFlags(
  calls: CallRow[],
  closes: CloseRow[],
  chases: ChaseRow[],
  staff: StaffRow[],
  now = new Date()
): Flag[] {
  const t = now.getTime();
  const today = now.toISOString().slice(0, 10);
  const flags: Flag[] = [];
  // Chasing leads and balances is the setter's job, so those flags land on the
  // setter (Kyle) rather than the closer. Falls back to the closer if no setter.
  const chaser = staff.find((p) => p.active && p.role === "setter")?.id ?? null;

  const lastChase = (key: "close_id" | "call_id", id: string): number | null => {
    let best: number | null = null;
    for (const c of chases) {
      if (c[key] !== id) continue;
      const v = new Date(c.chased_at).getTime();
      if (best === null || v > best) best = v;
    }
    return best;
  };

  // ---- deals with money still owed
  for (const c of closes) {
    const o = owed(c);
    if (o <= 0.001 && !c.contract_signed_at) {
      const lastPay = c.payments.reduce((m, p) => Math.max(m, new Date(p.paid_at).getTime()), new Date(c.closed_at).getTime());
      const late = days(t - lastPay);
      flags.push({
        id: `cu-${c.id}`,
        kind: "contract_unsigned",
        severity: late >= 1 ? "high" : "medium",
        title: `${c.calls?.lead_name ?? "Deal"} — paid in full but contract not marked signed`,
        detail: `Commission is on hold until the contract is signed. Closer: ${nameOf(staff, c.closer_id)}. Mark it signed on the Deals page.`,
        ownerId: c.closer_id,
        daysLate: late,
        closeId: c.id,
      });
    }
    if (o <= 0.001) continue;
    const who = c.calls?.lead_name ?? "Deal";
    const lastPay = c.payments.reduce((m, p) => Math.max(m, new Date(p.paid_at).getTime()), 0);
    const lastTouch = Math.max(new Date(c.closed_at).getTime(), lastPay, lastChase("close_id", c.id) ?? 0);
    const since = days(t - lastTouch);
    const base = `${who}: ${money(o)} still owed of ${money(Number(c.deal_value))} (${money(paidTotal(c))} paid). Closer: ${nameOf(staff, c.closer_id)}.`;

    if (c.next_payment_due && c.next_payment_due < today) {
      const late = days(t - new Date(c.next_payment_due).getTime());
      if (since >= RULES.overdueChaseEveryDays) {
        flags.push({
          id: `od-${c.id}`,
          kind: "overdue_payment",
          severity: "high",
          title: `${who} — payment ${late} day${late === 1 ? "" : "s"} overdue`,
          detail: `${base} Last chased/touched ${since} day${since === 1 ? "" : "s"} ago.`,
          ownerId: chaser ?? c.closer_id,
          daysLate: late,
          closeId: c.id,
        });
      }
    } else if (since >= RULES.balanceChaseEveryDays) {
      flags.push({
        id: `ub-${c.id}`,
        kind: "unchased_balance",
        severity: since >= 7 ? "high" : "medium",
        title: `${who} — balance not chased for ${since} days`,
        detail: base,
        ownerId: chaser ?? c.closer_id,
        daysLate: since,
        closeId: c.id,
      });
    }
    if (!c.next_payment_due) {
      flags.push({
        id: `nd-${c.id}`,
        kind: "no_due_date",
        severity: "low",
        title: `${who} — balance has no due date`,
        detail: `${base} Set a next payment date on the Deals page so it can be tracked.`,
        ownerId: chaser ?? c.closer_id,
        daysLate: 0,
        closeId: c.id,
      });
    }
  }

  // ---- calls
  for (const c of calls) {
    const at = new Date(c.call_at).getTime();
    const owner = c.closer_id; // the closer logs outcomes; unassigned calls are shown as unassigned
    const base = `Setter: ${nameOf(staff, c.setter_id)} · Closer: ${nameOf(staff, c.closer_id)}${c.source ? ` · ${c.source}` : ""}`;

    if (c.outcome === "scheduled" && at > t && at - t <= 24 * 3600000 && ["unconfirmed", "no_answer", "left_message"].includes(c.confirmation)) {
      const hrs = Math.max(0, Math.floor((at - t) / 3600000));
      flags.push({
        id: `uc-${c.id}`,
        kind: "unconfirmed_call",
        severity: hrs <= 3 ? "high" : "medium",
        title: `${c.lead_name} — call in ${hrs}h, ${c.confirmation === "unconfirmed" ? "not confirmed yet" : c.confirmation === "no_answer" ? "no answer so far" : "only left a message"}`,
        detail: `${base}. Confirm they're coming on Zoom and set the status on the Calls page.`,
        ownerId: chaser ?? owner,
        daysLate: 0,
        callId: c.id,
      });
    }

    if (c.outcome === "scheduled" && t - at >= RULES.missingOutcomeAfterHours * 3600000) {
      const late = days(t - at);
      flags.push({
        id: `mo-${c.id}`,
        kind: "missing_outcome",
        severity: t - at >= 3 * 3600000 ? "high" : "medium",
        title: `${c.lead_name} — call happened, no outcome logged`,
        detail: `${base}. Log the outcome, Fathom link and notes. Until you do, this call is missing from the numbers.`,
        ownerId: owner,
        daysLate: late,
        callId: c.id,
      });
    }

    if (needsRecording(c.outcome) && !c.recording_url && !c.recording_waived && at < t) {
      const late = days(t - at);
      flags.push({
        id: `mr-${c.id}`,
        kind: "missing_recording",
        severity: late >= 2 ? "high" : "medium",
        title: `${c.lead_name} — no Fathom recording on this call`,
        detail: `${base}. Logged as "${c.outcome.replace("_", " ")}" but no recording link was attached.`,
        ownerId: owner,
        daysLate: late,
        callId: c.id,
      });
    }

    if (needsRecording(c.outcome) && !(c.notes ?? "").trim() && at < t) {
      flags.push({
        id: `mn-${c.id}`,
        kind: "missing_notes",
        severity: "medium",
        title: `${c.lead_name} — no call notes written up`,
        detail: `${base}. Logged as "${c.outcome.replace("_", " ")}" but no notes were added.`,
        ownerId: owner,
        daysLate: days(t - at),
        callId: c.id,
      });
    }

    if (c.outcome === "no_show" && lastChase("call_id", c.id) === null) {
      const hrs = Math.floor((t - at) / 3600000);
      flags.push({
        id: `ns-${c.id}`,
        kind: "no_show_unchased",
        severity: hrs >= RULES.noShowChaseWithinHours ? "high" : "medium",
        title: `${c.lead_name} — no-show, no follow-up logged`,
        detail: `${base}. No-showed ${hrs < 48 ? `${hrs}h` : `${days(t - at)}d`} ago.`,
        ownerId: chaser ?? owner,
        daysLate: days(t - at),
        callId: c.id,
      });
    }

    if (c.outcome === "follow_up" && t - at < RULES.followUpGiveUpAfterDays * DAY) {
      const touch = Math.max(at, lastChase("call_id", c.id) ?? 0);
      const since = days(t - touch);
      if (since >= RULES.followUpEveryDays) {
        flags.push({
          id: `fu-${c.id}`,
          kind: "follow_up_stale",
          severity: since >= 7 ? "high" : "medium",
          title: `${c.lead_name} — follow-up gone cold (${since} days)`,
          detail: `${base}. Marked "follow up" but nothing logged since.`,
          ownerId: chaser ?? owner,
          daysLate: since,
          callId: c.id,
        });
      }
    }
  }

  const rank = { high: 0, medium: 1, low: 2 } as const;
  return flags.sort((a, b) => rank[a.severity] - rank[b.severity] || b.daysLate - a.daysLate);
}
