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
    .limit(1)
    .maybeSingle<{ created_at: string; payload: AdsSnapshot }>();
  return data ?? null;
}
