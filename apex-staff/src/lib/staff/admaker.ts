import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AdRules {
  client_name: string;
  pilot: boolean;
  daily_budget: number;
  test_budget_pct: number;
  approval_mode: "always" | "auto_small" | "auto_all";
  auto_approve_max_daily: number;
  max_live_tests: number;
  early_kill_multiple: number;
  keep_kill_spend: number;
  frequency_limit: number;
  max_budget_step_pct: number;
  budget_step_hours: number;
  suggest_mode: "when_wrong" | "weekly" | "on_request";
}

export interface AdActivity {
  id: number;
  created_at: string;
  client_name: string | null;
  kind: string;
  summary: string;
  reason: string | null;
}

export async function loadRules(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("ad_maker_rules")
    .select("*")
    .order("pilot", { ascending: false })
    .order("client_name")
    .returns<AdRules[]>();
  return data ?? [];
}

export async function loadActivity(supabase: SupabaseClient, limit = 100) {
  const { data } = await supabase
    .from("ad_activity")
    .select("id, created_at, client_name, kind, summary, reason")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<AdActivity[]>();
  return data ?? [];
}
