import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Shape written by meta-ads-monitor/monitor/snapshot.py. */
export interface AdsFlag {
  sev: number; // 1 amber, 2 red
  text: string;
}

export interface AdsClient {
  name: string;
  own: boolean;
  severity: 0 | 1 | 2;
  state: "NONE" | "NOT_LIVE" | "ACTIVE" | "HIT" | "FREE_TRIAL" | "ERROR";
  error: string | null;
  lines: string[];
  deadline: string | null;
  deadline_days: number | null;
  flags: AdsFlag[];
  testing_ads: number;
  yesterday_leads: number;
  yesterday_spend: number | null;
  guarantee: {
    terms: string;
    go_live: string | null;
    day: number;
    window: number | null;
    required: number | null;
    counted: number;
    total: number;
    excluded: number;
    today_leads?: number;
    pace: number | null;
    recent_rate: number | null;
    projected: number | null;
    status: string;
    too_early: boolean;
    owed_remaining: number | null;
    spend_since: number | null;
    auto_switched: boolean;
  } | null;
  cpl: {
    days: number;
    all: number | null;
    counted: number | null;
    target: number | null;
    max: number | null;
    sev: number | null;
    spend: number | null;
  } | null;
}

export interface AdsSnapshot {
  generated_at: string;
  date: string;
  look_at_first: string;
  warnings: string[];
  message: string;
  clients: AdsClient[];
}

export async function loadLatestAds(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("ads_snapshots")
    .select("created_at, payload")
    .order("created_at", { ascending: false })
    .limit(48)
    .returns<{ created_at: string; payload: AdsSnapshot }[]>();
  // Newest row that looks like a real snapshot. A run where Meta refused every account (expired or
  // blocked token) is skipped in favour of the last good one, so the page shows real numbers with a
  // "this is old" warning instead of a wall of errors.
  const real = (data ?? []).filter((r) => Array.isArray(r.payload?.clients));
  return real.find((r) => r.payload.clients.some((c) => c.state !== "ERROR")) ?? real[0] ?? null;
}
