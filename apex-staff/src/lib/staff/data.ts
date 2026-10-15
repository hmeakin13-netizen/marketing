import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeFlags, missingReportFlags } from "./flags";
import type { CallRow, CloseRow, ChaseRow, DailyReport, StaffRow, TargetRow } from "./types";

/** Everything the dashboards need. Volumes are small, so we fetch and aggregate in TS. */
export async function loadCore(supabase: SupabaseClient, since: Date) {
  const iso = since.toISOString();
  const [staff, calls, closes, targets] = await Promise.all([
    supabase.from("staff").select("*").order("full_name"),
    supabase
      .from("calls")
      .select("*")
      .or(`call_at.gte.${iso},booked_at.gte.${iso}`)
      .order("call_at", { ascending: false })
      .limit(1000),
    supabase
      .from("closes")
      .select("*, payments(*), calls(lead_name, source, recording_url)")
      .order("closed_at", { ascending: false })
      .limit(1000),
    supabase.from("targets").select("*"),
  ]);
  return {
    staff: (staff.data ?? []) as StaffRow[],
    calls: (calls.data ?? []) as CallRow[],
    closes: (closes.data ?? []) as CloseRow[],
    targets: (targets.data ?? []) as TargetRow[],
  };
}

/** Earliest instant we need calls from, to cover today / this week / this month. */
export function earliest(...dates: Date[]) {
  return new Date(Math.min(...dates.map((d) => d.getTime())));
}

/** Everything needed to work out who has dropped the ball. */
export async function loadFlags(supabase: SupabaseClient) {
  const since = new Date(Date.now() - 45 * 86400000).toISOString();
  const [staff, calls, closes, chases, reports] = await Promise.all([
    supabase.from("staff").select("*").order("full_name"),
    supabase
      .from("calls")
      .select("*")
      .in("outcome", ["scheduled", "no_show", "follow_up", "closed", "lost"])
      .gte("call_at", since)
      .order("call_at", { ascending: false })
      .limit(1000),
    supabase
      .from("closes")
      .select("*, payments(*), calls(lead_name, source, recording_url)")
      .limit(1000),
    supabase.from("chases").select("*").order("chased_at", { ascending: false }).limit(2000),
    supabase.from("daily_reports").select("*").gte("report_date", new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)),
  ]);
  const s = (staff.data ?? []) as StaffRow[];
  const baseFlags = computeFlags(
    (calls.data ?? []) as CallRow[],
    (closes.data ?? []) as CloseRow[],
    (chases.data ?? []) as ChaseRow[],
    s
  );
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const flags = [...baseFlags, ...missingReportFlags(s, (reports.data ?? []) as DailyReport[])].sort(
    (a, b) => rank[a.severity] - rank[b.severity] || b.daysLate - a.daysLate
  );
  return { staff: s, flags, chases: (chases.data ?? []) as ChaseRow[] };
}
