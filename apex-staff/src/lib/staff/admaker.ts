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
  early_kill_spend: number;
  keep_kill_spend: number;
  frequency_limit: number;
  max_budget_step_pct: number;
  budget_step_hours: number;
  suggest_mode: "when_wrong" | "weekly" | "on_request";
  active: boolean;
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
    .eq("active", true)
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

export interface ClientProfile {
  client_name: string;
  trade: string;
  area: string | null;
  status: "live" | "onboarding" | "left";
  summary: string | null;
  services: string | null;
  job_value: string | null;
  trust_angles: string | null;
  constraints: string | null;
  targets: string | null;
  notes: string | null;
}

export interface Learning {
  id: number;
  scope: "all" | "trade" | "client";
  trade: string | null;
  client_name: string | null;
  category: string;
  lesson: string;
  evidence: string | null;
  confidence: "low" | "medium" | "high";
  source: string | null;
}

export interface AdTest {
  id: number;
  client_name: string;
  ad_name: string;
  idea: string | null;
  spend: number | null;
  leads: number | null;
  verdict: "keep" | "kill" | "testing" | "no_verdict";
  notes: string | null;
  as_of: string;
}

export async function loadBrain(supabase: SupabaseClient) {
  const [profiles, learnings, tests] = await Promise.all([
    supabase.from("ad_client_profiles").select("*").order("status").order("client_name").returns<ClientProfile[]>(),
    supabase.from("ad_learnings").select("*").order("id").returns<Learning[]>(),
    supabase.from("ad_tests").select("*").order("client_name").order("spend", { ascending: false }).returns<AdTest[]>(),
  ]);
  return { profiles: profiles.data ?? [], learnings: learnings.data ?? [], tests: tests.data ?? [] };
}

export interface TrackedAd {
  ad_id: string;
  client_name: string;
  ad_name: string | null;
  status: string | null;
  spend: number;
  impressions: number;
  link_clicks: number;
  leads: number;
  first_day: string;
  last_day: string;
  days: number;
  cpl: number | null;
  ctr_pct: number | null;
  suggested_verdict: "keep" | "kill" | "testing";
}

export async function loadTracked(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("ad_tracker")
    .select("*")
    .order("client_name")
    .order("spend", { ascending: false })
    .returns<TrackedAd[]>();
  return data ?? [];
}

export interface TeamAgent {
  key: string;
  name: string;
  role: "manager" | "worker" | "reviewer";
  manager_key: string | null;
  job: string | null;
  schedule: string | null;
  connectors: string | null;
  status: "idle" | "working" | "error" | "waiting";
  current_task: string | null;
  last_run_at: string | null;
  last_summary: string | null;
  sort: number;
}
export interface TeamEvent {
  id: number;
  created_at: string;
  agent_key: string;
  to_agent_key: string | null;
  kind: "started" | "finished" | "finding" | "handoff" | "review" | "flag" | "question" | "error";
  summary: string;
  ref: string | null;
}
export interface QueueItem {
  id: number;
  created_at: string;
  question: string;
  why: string | null;
  asked_by: string | null;
  assigned_to: string | null;
  status: "open" | "in_progress" | "done" | "dropped";
  answer: string | null;
}

/** The research team: who is on it, what they have been doing, and the questions waiting to be looked into. */
export async function loadTeam(supabase: SupabaseClient) {
  const [agents, events, queue, snap, learnings] = await Promise.all([
    supabase.from("ad_agents").select("*").order("sort").returns<TeamAgent[]>(),
    supabase.from("ad_agent_events").select("*").order("created_at", { ascending: false }).limit(60).returns<TeamEvent[]>(),
    supabase.from("ad_research_queue").select("*").order("created_at", { ascending: false }).limit(40).returns<QueueItem[]>(),
    supabase.from("ads_snapshots").select("created_at").order("created_at", { ascending: false }).limit(1),
    supabase.from("ad_learnings").select("id", { count: "exact", head: true }),
  ]);
  const list = agents.data ?? [];
  // The monitor is a script, not a chat agent: its "last run" is when it last published numbers.
  const lastSnap = snap.data?.[0]?.created_at as string | undefined;
  for (const a of list) {
    if (a.key === "numbers" && lastSnap) a.last_run_at = lastSnap;
  }
  return { agents: list, events: events.data ?? [], queue: queue.data ?? [], learnings: learnings.count ?? 0 };
}
