import type { SupabaseClient } from "@supabase/supabase-js";
import { ukIso, ukWallClockToUtc } from "./dates";
import { computeStats } from "./metrics";
import type { SetterDay } from "./setters";
import type { CallRow, StaffRow } from "./types";

/** Harry's setter targets (24 Nov 2026). Monday to Saturday all carry the same daily numbers. */
export const TARGETS = { dials: 60, conversations: 10, booked: 2, overdue: 0, showRate: 50, speedMin: 5, score: 70 };
/** A miss the setter has not fixed after this many working days goes to Harry. */
export const FIX_WINDOW_DAYS = 2;
/** The same KPI missed this many working days running goes to Harry. */
export const STREAK_DAYS = 3;

export type KpiKey = "dials" | "conversations" | "booked" | "overdue";
export const KPI_LABEL: Record<KpiKey, string> = { dials: "Dials", conversations: "Conversations", booked: "Calls booked", overdue: "Overdue tasks" };

export const STEP_LABEL: Record<string, string> = {
  // Text A was dropped on 24 Nov (the automatic first text covers Day 0), and text B moved to Day 1.
  // The desk still writes the step name text_b_day2 for B.
  text_b_day2: "Text B (Day 1)",
  text_c_day7: "Text C on day 7",
  text_d_booked: "Text D straight after booking",
  confirm_call_morning: "Morning-of confirm call (09:00 to 10:30)",
  text_e_no_answer: "Text E after no answer on the confirm call",
  text_f_1h_before: "Text F one hour before the call",
  no_show_call_2min: "Ring a no-show within 2 minutes",
  text_g_no_show: "Text G to a no-show",
  text_h_no_show: "Text H to a no-show",
  too_many_texts: "More than 3 personal texts in 7 days",
  dropped_under_10_dials: "Dropped before 10 dials over 7 days",
  no_owner: "Lead has no owner",
  no_stage: "Lead has no stage",
  no_next_task: "Lead has no next task",
};

export interface SetterDayPlus extends SetterDay {
  first_touch_inhours_median_min?: number | null;
  overnight_leads_total?: number | null;
  overnight_leads_rung_by_0930?: number | null;
}

export interface PlaybookMiss {
  id: number;
  staff_id: string;
  day: string;
  contact_id: string;
  lead_label: string;
  step: string;
  detail: string | null;
  found_at: string;
  fixed_at: string | null;
}

export interface DayCard {
  day: string;
  /** hit = every KPI met; excused = missed but nothing left to do; miss = missed with work left; none = no numbers recorded. */
  status: "hit" | "excused" | "miss" | "none";
  values: Record<KpiKey, number> | null;
  hits: Record<KpiKey, boolean> | null;
  speedMin: number | null;
  overnight: { rung: number; total: number } | null;
  updatedAt: string | null;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = Sunday
export const isWorkingDay = (iso: string) => dow(iso) !== 0;
/** The Monday of the week a day falls in. */
export const weekStart = (iso: string) => addDays(iso, -((dow(iso) + 6) % 7));
/** The last `n` working days up to and including `today`, newest first. */
export function workingDaysBack(today: string, n: number): string[] {
  const out: string[] = [];
  for (let d = today; out.length < n; d = addDays(d, -1)) if (isWorkingDay(d)) out.push(d);
  return out;
}
/** How many working days lie strictly between a day and today (0 = yesterday or today). */
export function workingDaysSince(day: string, today: string): number {
  let n = 0;
  for (let d = addDays(day, 1); d < today; d = addDays(d, 1)) if (isWorkingDay(d)) n++;
  return n;
}

function dayBounds(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { from: ukWallClockToUtc(y, m, d), to: ukWallClockToUtc(y, m, d + 1) };
}

/** One setter's card for one day. Bookings are counted on the day the setter made the booking. */
export function buildDayCard(day: string, row: SetterDayPlus | undefined, setter: StaffRow, calls: CallRow[]): DayCard {
  if (!row) return { day, status: "none", values: null, hits: null, speedMin: null, overnight: null, updatedAt: null };
  const { from, to } = dayBounds(day);
  const booked = computeStats(calls, [], from, to, { staffId: setter.id, role: "setter", name: setter.full_name }).booked;
  const values = { dials: row.dials, conversations: row.conversations, booked, overdue: row.overdue_tasks };
  const hits = {
    dials: values.dials >= TARGETS.dials,
    conversations: values.conversations >= TARGETS.conversations,
    booked: values.booked >= TARGETS.booked,
    overdue: values.overdue <= TARGETS.overdue,
  };
  const all = hits.dials && hits.conversations && hits.booked && hits.overdue;
  // Excused: the numbers were missed, but there were no open tasks and no leads left to call.
  const excused = !all && row.overdue_tasks === 0 && row.untouched_leads === 0;
  return {
    day,
    status: all ? "hit" : excused ? "excused" : "miss",
    values,
    hits,
    speedMin: row.first_touch_inhours_median_min ?? row.first_touch_median_min ?? null,
    overnight: row.overnight_leads_total != null ? { rung: row.overnight_leads_rung_by_0930 ?? 0, total: row.overnight_leads_total } : null,
    updatedAt: row.updated_at,
  };
}

export interface WeekScore {
  weekStart: string;
  /** Percentage of checks passed, or null when there is nothing to score. */
  score: number | null;
  passed: number;
  total: number;
  scoredDays: number;
  excusedDays: number;
  showRate: number | null;
  showed: number;
  due: number;
}

/**
 * A setter's score for one Monday-to-Saturday week: KPI checks hit plus playbook steps done.
 * Excused days are left out entirely. A playbook miss counts as passed only if it was fixed
 * inside the fix window.
 */
export function buildWeekScore(week: string, cards: DayCard[], misses: PlaybookMiss[], setter: StaffRow, calls: CallRow[], today: string): WeekScore {
  const end = addDays(week, 7);
  let passed = 0;
  let total = 0;
  let scoredDays = 0;
  let excusedDays = 0;
  for (const c of cards) {
    if (c.day < week || c.day >= end || c.status === "none") continue;
    if (c.status === "excused") {
      excusedDays++;
      continue;
    }
    scoredDays++;
    for (const k of Object.keys(c.hits!) as KpiKey[]) {
      total++;
      if (c.hits![k]) passed++;
    }
    if (c.speedMin != null) {
      total++;
      if (c.speedMin <= TARGETS.speedMin) passed++;
    }
  }
  // Show rate for the week: calls that happened out of calls that were due, cancellations included.
  const { from } = dayBounds(week);
  const { from: to } = dayBounds(end);
  const now = Date.now();
  const dueCalls = calls.filter((c) => c.setter_id === setter.id && new Date(c.call_at) >= from && new Date(c.call_at) < to && new Date(c.call_at).getTime() < now && c.outcome !== "scheduled");
  const showed = dueCalls.filter((c) => ["follow_up", "lost", "closed"].includes(c.outcome)).length;
  const showRate = dueCalls.length ? (showed / dueCalls.length) * 100 : null;
  if (showRate != null && dueCalls.length >= 3) {
    total++;
    if (showRate >= TARGETS.showRate) passed++;
  }
  for (const m of misses) {
    if (m.day < week || m.day >= end) continue;
    const fixedInTime = m.fixed_at != null && workingDaysSince(m.day, ukIso(new Date(m.fixed_at))) <= FIX_WINDOW_DAYS;
    const stillInWindow = m.fixed_at == null && workingDaysSince(m.day, today) < FIX_WINDOW_DAYS;
    if (stillInWindow) continue; // not judged yet
    total++;
    if (fixedInTime) passed++;
  }
  return { weekStart: week, score: total ? Math.round((passed / total) * 100) : null, passed, total, scoredDays, excusedDays, showRate, showed, due: dueCalls.length };
}

export interface SetterReport {
  setter: StaffRow;
  cards: DayCard[]; // newest first, working days only
  thisWeek: WeekScore;
  lastWeek: WeekScore;
  weekBefore: WeekScore;
  openMisses: PlaybookMiss[];
  overdueMisses: PlaybookMiss[]; // open and past the fix window
  /** KPIs missed on the last STREAK_DAYS scored days running, with the numbers. */
  streaks: { kpi: KpiKey; values: number[]; days: string[] }[];
  /** Set when Harry should think about replacing this setter, with the evidence. */
  replace: string | null;
  missesAvailable: boolean;
}

export async function loadSetterReports(supabase: SupabaseClient, setters: StaffRow[], calls: CallRow[], today: string): Promise<SetterReport[]> {
  const since = addDays(weekStart(today), -14);
  const ids = setters.map((s) => s.id);
  if (ids.length === 0) return [];
  const [daysRes, missRes] = await Promise.all([
    supabase.from("setter_daily").select("*").in("staff_id", ids).gte("day", since).returns<SetterDayPlus[]>(),
    supabase.from("setter_playbook_misses").select("*").in("staff_id", ids).gte("day", since).order("day", { ascending: false }).returns<PlaybookMiss[]>(),
  ]);
  const rows = daysRes.data ?? [];
  // text_a_day0 is no longer a step: any old rows are ignored everywhere (lists and scores).
  const allMisses = (missRes.data ?? []).filter((m) => m.step !== "text_a_day0");
  const week = weekStart(today);
  return setters.map((setter) => {
    const mine = rows.filter((r) => r.staff_id === setter.id);
    const byDay = new Map(mine.map((r) => [r.day, r]));
    const days: string[] = [];
    for (let d = today; d >= since; d = addDays(d, -1)) if (isWorkingDay(d)) days.push(d);
    const cards = days.map((d) => buildDayCard(d, byDay.get(d), setter, calls));
    const misses = allMisses.filter((m) => m.staff_id === setter.id);
    const thisWeek = buildWeekScore(week, cards, misses, setter, calls, today);
    const lastWeek = buildWeekScore(addDays(week, -7), cards, misses, setter, calls, today);
    const weekBefore = buildWeekScore(addDays(week, -14), cards, misses, setter, calls, today);
    const openMisses = misses.filter((m) => !m.fixed_at);
    const overdueMisses = openMisses.filter((m) => workingDaysSince(m.day, today) >= FIX_WINDOW_DAYS);

    // Days that count for a streak: numbers recorded and not excused. Today only counts once it is over.
    const judged = cards.filter((c) => c.day < today && (c.status === "miss" || c.status === "hit")).slice(0, STREAK_DAYS);
    const streaks =
      judged.length === STREAK_DAYS
        ? (Object.keys(KPI_LABEL) as KpiKey[])
            .filter((k) => judged.every((c) => !c.hits![k]))
            .map((kpi) => ({ kpi, values: judged.map((c) => c.values![kpi]).reverse(), days: judged.map((c) => c.day).reverse() }))
        : [];

    const twoBad = [lastWeek, weekBefore].every((w) => w.score != null && w.scoredDays >= 3 && w.score < TARGETS.score);
    const replace = twoBad
      ? `scored ${weekBefore.score}% then ${lastWeek.score}% in the last two full weeks (target ${TARGETS.score}%)`
      : overdueMisses.length >= 5
        ? `${overdueMisses.length} missed playbook steps still not fixed after ${FIX_WINDOW_DAYS} working days`
        : null;
    return { setter, cards, thisWeek, lastWeek, weekBefore, openMisses, overdueMisses, streaks, replace, missesAvailable: !missRes.error };
  });
}
