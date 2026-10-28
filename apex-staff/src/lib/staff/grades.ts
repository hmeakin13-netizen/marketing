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

/** The five things every call is marked on, 0 to 2 each, 10 in total. */
export const RUBRIC: { key: RubricKey; label: string; what: string }[] = [
  { key: "opening", label: "Opening", what: "Named yourself and Apex, said why you were calling, set the agenda." },
  { key: "discovery", label: "Discovery", what: "Asked real questions about their business, their lead flow and what they want." },
  { key: "objections", label: "Objections", what: "Handled price, trust and 'let me think' with questions, not pressure." },
  { key: "next_step", label: "Next step", what: "Ended with a clear next step they agreed to: a time, a decision or a payment." },
  { key: "confirmation", label: "Confirmation", what: "Recapped and confirmed: who does what by when, text or email to follow." },
];

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
export function weakestItem(rows: GradeRow[]): { key: RubricKey; label: string; avg: number } | null {
  if (rows.length === 0) return null;
  const avgs = RUBRIC.map((r) => ({ key: r.key, label: r.label, avg: rows.reduce((s, g) => s + g[r.key], 0) / rows.length }));
  return avgs.sort((a, b) => a.avg - b.avg)[0];
}

export const scoreTone = (n: number | null | undefined): "default" | "good" | "warn" | "bad" =>
  n == null ? "default" : n >= 7.5 ? "good" : n >= 5 ? "warn" : "bad";
