import type { SupabaseClient } from "@supabase/supabase-js";

/** One setter's GoHighLevel activity for one day, written by the Setter Stats desk. */
export interface SetterDay {
  staff_id: string;
  day: string;
  dials: number;
  conversations: number;
  talk_minutes: number | null;
  texts_sent: number;
  replies: number;
  new_leads: number;
  first_touch_median_min: number | null;
  untouched_leads: number;
  overdue_tasks: number;
  note: string | null;
  updated_at: string;
}

export async function loadSetterDays(supabase: SupabaseClient, opts: { staffId?: string; sinceDay: string }) {
  let q = supabase.from("setter_daily").select("*").gte("day", opts.sinceDay).order("day", { ascending: false });
  if (opts.staffId) q = q.eq("staff_id", opts.staffId);
  const { data } = await q.returns<SetterDay[]>();
  return data ?? [];
}

export interface SetterTotals {
  days: number;
  dials: number;
  conversations: number;
  talkMinutes: number;
  textsSent: number;
  replies: number;
  newLeads: number;
  untouched: number;
  speedMedianMin: number | null; // median of the daily medians, weighted by leads
  overdueLatest: number | null;
  updatedAt: string | null;
}

export function sumSetterDays(rows: SetterDay[]): SetterTotals {
  const t: SetterTotals = { days: rows.length, dials: 0, conversations: 0, talkMinutes: 0, textsSent: 0, replies: 0, newLeads: 0, untouched: 0, speedMedianMin: null, overdueLatest: null, updatedAt: null };
  const speeds: number[] = [];
  for (const r of rows) {
    t.dials += r.dials;
    t.conversations += r.conversations;
    t.talkMinutes += Number(r.talk_minutes ?? 0);
    t.textsSent += r.texts_sent;
    t.replies += r.replies;
    t.newLeads += r.new_leads;
    t.untouched += r.untouched_leads;
    if (r.first_touch_median_min != null) for (let i = 0; i < Math.max(1, r.new_leads); i++) speeds.push(Number(r.first_touch_median_min));
    if (!t.updatedAt || r.updated_at > t.updatedAt) t.updatedAt = r.updated_at;
  }
  if (rows.length > 0) t.overdueLatest = rows[0].overdue_tasks; // rows are newest first
  if (speeds.length > 0) {
    speeds.sort((a, b) => a - b);
    const mid = Math.floor(speeds.length / 2);
    t.speedMedianMin = speeds.length % 2 ? speeds[mid] : (speeds[mid - 1] + speeds[mid]) / 2;
  }
  return t;
}

export function fmtSpeed(min: number | null): string {
  if (min == null) return "–";
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 48 * 60) return `${(min / 60).toFixed(1)} h`;
  return `${Math.round(min / 1440)} days`;
}
