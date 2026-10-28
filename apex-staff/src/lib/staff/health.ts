import type { SupabaseClient } from "@supabase/supabase-js";

export type HealthBand = "red" | "amber" | "green";

export type HealthRow = {
  client_name: string;
  day: string;
  score: number | null;
  band: HealthBand | null;
  reason: string | null;
  components: Record<string, { score: number; max: number; note?: string }> | null;
  computed_at: string;
};

export type ClientHealth = {
  client: string;
  latest: HealthRow;
  /** Score a week earlier, when the desk has been running that long. */
  weekAgo: number | null;
};

/** Latest health score per client, plus the score from a week earlier for the trend arrow. */
export async function loadClientHealth(supabase: SupabaseClient): Promise<ClientHealth[]> {
  const since = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("client_health")
    .select("client_name, day, score, band, reason, components, computed_at")
    .gte("day", since)
    .order("day", { ascending: false });
  const rows = (data ?? []) as HealthRow[];
  const byClient = new Map<string, HealthRow[]>();
  for (const r of rows) {
    const list = byClient.get(r.client_name) ?? [];
    list.push(r);
    byClient.set(r.client_name, list);
  }
  const out: ClientHealth[] = [];
  byClient.forEach((list, client) => {
    const latest = list[0];
    const target = new Date(new Date(latest.day).getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const old = list.find((r: HealthRow) => r.day <= target);
    out.push({ client, latest, weekAgo: old?.score ?? null });
  });
  // Worst first, so the one that needs a phone call is at the top.
  const rank: Record<HealthBand, number> = { red: 0, amber: 1, green: 2 };
  return out.sort((a, b) => rank[a.latest.band ?? "amber"] - rank[b.latest.band ?? "amber"] || a.client.localeCompare(b.client));
}

export function bandTone(band: HealthBand | null): "good" | "warn" | "bad" | "default" {
  if (band === "green") return "good";
  if (band === "amber") return "warn";
  if (band === "red") return "bad";
  return "default";
}

export const COMPONENT_LABEL: Record<string, string> = {
  lead_flow: "Lead flow vs promise",
  lead_cost: "Lead cost trend",
  outcomes: "Booked and won jobs logged",
  responsiveness: "Client replying to us",
  payment: "Payment",
};
