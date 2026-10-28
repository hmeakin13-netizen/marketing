import type { SupabaseClient } from "@supabase/supabase-js";

/** One graded sales call. Written by the Call Grader desk; people only read. */
export interface GradeRow {
  id: number;
  source: "fathom" | "ghl";
  source_ref: string;
  call_url: string | null;
  staff_id: string | null;
  staff_name: string;
  role: "setter" | "closer" | "unknown";
  prospect_label: string | null;
  call_at: string;
  duration_s: number | null;
  opening: number;
  discovery: number;
  objections: number;
  next_step: number;
  confirmation: number;
  total: number;
  outcome: string | null;
  summary: string;
  strengths: string | null;
  tips: string | null;
  graded_at: string;
}

export interface WeeklyRow {
  staff_id: string | null;
  staff_name: string;
  role: string;
  week_start: string;
  calls: number;
  avg_total: number | null;
  avg_opening: number | null;
  avg_discovery: number | null;
  avg_objections: number | null;
  avg_next_step: number | null;
  avg_confirmation: number | null;
  wins: number;
}

export type RubricKey = "opening" | "discovery" | "objections" | "next_step" | "confirmation";
export type RubricItem = { key: RubricKey; label: string; what: string };

/**
 * The five things every call is marked on, 0 to 2 each, 10 in total. The same five columns mean
 * slightly different things for a setter (qualify and book the call with the closer; the price is
 * for the closer's call) and a closer (discovery, then pitch and price once, then close).
 */
export const RUBRIC_SETTER: RubricItem[] = [
  { key: "opening", label: "Opening", what: "Named yourself and Apex, said why you were calling (we texted earlier), asked if now is a good time." },
  { key: "discovery", label: "Qualifying", what: "Asked what they do, how busy they are, where work comes from, who decides, and whether the investment is realistic for them." },
  { key: "objections", label: "Holding the line", what: "Kept the price and the detail for the closer's call without bluffing, and answered 'just send info' or 'not now' with a question." },
  { key: "next_step", label: "Booking", what: "Booked a real slot from the calendar (never a time you had not checked), agreed with the prospect." },
  { key: "confirmation", label: "Confirmation", what: "Said it is a Zoom with the closer by name, how long, that the link comes by text, and got a yes back." },
];

export const RUBRIC_CLOSER: RubricItem[] = [
  { key: "opening", label: "Opening", what: "Agenda set, permission asked, a little rapport, apologies where owed." },
  { key: "discovery", label: "Discovery", what: "Drew out their numbers, lead flow, goals, team and how they decide, before pitching anything." },
  { key: "objections", label: "Pitch and price", what: "Presented the offer after the value, gave the price once, clearly, with the plan options explained once, and handled think-it-over, price and trust with questions, not goading." },
  { key: "next_step", label: "Close", what: "Ended with a decision, a deposit or a payment, or a booked follow-up with a date and time." },
  { key: "confirmation", label: "Confirmation", what: "Recapped what was agreed, who does what by when, and what will be sent (deck, calculator, invite)." },
];

/** Generic labels used where the role is mixed. */
export const RUBRIC: RubricItem[] = [
  { key: "opening", label: "Opening", what: "Named yourself and Apex, said why you were calling, set the agenda." },
  { key: "discovery", label: "Discovery", what: "Asked real questions about their business, their lead flow and what they want." },
  { key: "objections", label: "Objections", what: "Setter: held the price for the closer's call. Closer: pitched after the value and gave the price once, clearly." },
  { key: "next_step", label: "Next step", what: "A real booking from the calendar, a decision, a deposit or a dated follow-up." },
  { key: "confirmation", label: "Confirmation", what: "Recapped and confirmed: who does what by when, how the link or details arrive, a yes back." },
];

export const rubricFor = (role: string): RubricItem[] => (role === "setter" ? RUBRIC_SETTER : role === "closer" ? RUBRIC_CLOSER : RUBRIC);

export const WIN_OUTCOMES = ["booked", "rebooked", "closed"];

export async function loadGrades(supabase: SupabaseClient, opts: { staffId?: string; days?: number } = {}) {
  const since = new Date(Date.now() - (opts.days ?? 28) * 86400000).toISOString();
  let q = supabase.from("call_grades").select("*").gte("call_at", since).order("call_at", { ascending: false }).limit(300);
  if (opts.staffId) q = q.eq("staff_id", opts.staffId);
  const { data } = await q.returns<GradeRow[]>();
  return data ?? [];
}

export async function loadWeekly(supabase: SupabaseClient, opts: { staffId?: string; weeks?: number } = {}) {
  const since = new Date(Date.now() - (opts.weeks ?? 6) * 7 * 86400000).toISOString().slice(0, 10);
  let q = supabase.from("call_grade_weekly").select("*").gte("week_start", since).order("week_start", { ascending: false });
  if (opts.staffId) q = q.eq("staff_id", opts.staffId);
  const { data } = await q.returns<WeeklyRow[]>();
  return data ?? [];
}

/** Monday (UK) of the week containing `d`, as YYYY-MM-DD. */
export function weekStartOf(d: Date) {
  const uk = new Date(d.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const day = (uk.getDay() + 6) % 7;
  uk.setDate(uk.getDate() - day);
  return `${uk.getFullYear()}-${String(uk.getMonth() + 1).padStart(2, "0")}-${String(uk.getDate()).padStart(2, "0")}`;
}

/** The rubric item a person scores lowest on, averaged over the given calls. */
export function weakestItem(rows: GradeRow[], rubric: RubricItem[] = RUBRIC): { key: RubricKey; label: string; avg: number } | null {
  if (rows.length === 0) return null;
  const avgs = rubric.map((r) => ({ key: r.key, label: r.label, avg: rows.reduce((s, g) => s + g[r.key], 0) / rows.length }));
  return avgs.sort((a, b) => a.avg - b.avg)[0];
}

export const scoreTone = (n: number | null | undefined): "default" | "good" | "warn" | "bad" =>
  n == null ? "default" : n >= 7.5 ? "good" : n >= 5 ? "warn" : "bad";
