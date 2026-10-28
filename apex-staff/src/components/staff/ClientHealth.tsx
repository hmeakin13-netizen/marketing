import type { SupabaseClient } from "@supabase/supabase-js";
import { Badge, Card, SectionTitle } from "@/components/staff/ui";
import { bandTone, COMPONENT_LABEL, loadClientHealth } from "@/lib/staff/health";

function ago(iso: string) {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 36e5);
  if (h < 1) return "just now";
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** One traffic light per client with the single reason that matters, scored by the client care desk three times a day. */
export async function ClientHealth({ supabase }: { supabase: SupabaseClient }) {
  const rows = await loadClientHealth(supabase);
  const reds = rows.filter((r) => r.latest.band === "red").length;
  return (
    <Card className={`mb-6 ${reds ? "border-rose-500/40" : "border-white/10"}`}>
      <SectionTitle>Client health {reds ? `(${reds} red)` : ""}</SectionTitle>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-400">No scores yet. The client care desk scores every client at 09:00, 14:00 and 18:00.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-3">
          {rows.map((r) => {
            const band = r.latest.band;
            const dot = band === "green" ? "bg-emerald-400" : band === "amber" ? "bg-amber-400" : band === "red" ? "bg-rose-500" : "bg-zinc-500";
            const delta = r.weekAgo !== null && r.latest.score !== null ? r.latest.score - r.weekAgo : null;
            const comps = Object.entries(r.latest.components ?? {});
            return (
              <li key={r.client} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 font-semibold text-zinc-100">
                    <span className={`inline-block h-3 w-3 rounded-full ${dot}`} aria-hidden />
                    {r.client}
                  </p>
                  <Badge tone={bandTone(band)}>
                    {r.latest.score ?? "?"}/100
                    {delta !== null && delta !== 0 ? ` ${delta > 0 ? "↑" : "↓"}${Math.abs(delta)}` : ""}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-zinc-300">{r.latest.reason ?? "No reason given."}</p>
                {comps.length ? (
                  <ul className="mt-3 space-y-1 text-xs text-zinc-500">
                    {comps.map(([k, v]) => (
                      <li key={k} className="flex justify-between gap-2">
                        <span>{COMPONENT_LABEL[k] ?? k}</span>
                        <span className="tabular-nums text-zinc-400">
                          {v.score}/{v.max}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-2 text-xs text-zinc-600">scored {ago(r.latest.computed_at)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
