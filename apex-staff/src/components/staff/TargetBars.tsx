import { METRIC_LABEL, type TargetMetric, type TargetRow } from "@/lib/staff/types";
import type { Stats } from "@/lib/staff/metrics";

export function metricValue(s: Stats, m: TargetMetric): number {
  switch (m) {
    case "calls_booked":
      return s.booked;
    case "calls_taken":
      return s.taken;
    case "show_rate":
      return s.showRate ?? 0;
    case "close_rate":
      return s.closeRate ?? 0;
    case "closes":
      return s.closed;
    case "cash_collected":
      return s.cash;
  }
}

function fmt(m: TargetMetric, n: number) {
  if (m === "show_rate" || m === "close_rate") return `${Math.round(n)}%`;
  if (m === "cash_collected") return `£${Math.round(n).toLocaleString("en-GB")}`;
  return String(Math.round(n));
}

export function TargetBars({
  targets,
  stats,
  title,
}: {
  targets: TargetRow[];
  stats: Stats;
  title: string;
}) {
  if (targets.length === 0) {
    return <p className="text-sm text-zinc-500">No {title.toLowerCase()} targets set.</p>;
  }
  return (
    <div className="space-y-3">
      {targets.map((t) => {
        const value = metricValue(stats, t.metric);
        const ratio = t.target > 0 ? value / Number(t.target) : 0;
        const bar = ratio >= 1 ? "bg-emerald-400" : ratio >= 0.6 ? "bg-amber-400" : "bg-rose-400";
        return (
          <div key={t.id}>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-300">{METRIC_LABEL[t.metric].replace(" %", "").replace(" £", "")}</span>
              <span className="tabular-nums text-zinc-400">
                {fmt(t.metric, value)} / {fmt(t.metric, Number(t.target))}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
              <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
