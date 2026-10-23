import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadLatestAds, type AdsClient } from "@/lib/staff/ads";
import { loadActivity } from "@/lib/staff/admaker";
import { Card } from "@/components/staff/ui";

const gbp = (n: number | null | undefined) => (n == null ? "–" : `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`);

type Verdict = { dot: string; text: string };

/** One plain-English line per client: what's going on and whether it needs a look. */
function verdict(c: AdsClient): Verdict {
  const g = c.guarantee;
  const red = "bg-rose-500";
  const amber = "bg-amber-400";
  const green = "bg-emerald-400";
  const grey = "bg-zinc-600";
  if (c.state === "ERROR") return { dot: amber, text: "Couldn't read Meta. Check the monitor." };
  if (c.state === "NOT_LIVE") return { dot: grey, text: "Not live yet." };
  const problem = c.flags.find((f) => f.sev === 2) ?? c.flags.find((f) => f.sev === 1);
  if (c.state === "HIT") return { dot: green, text: `Guarantee hit: ${g?.counted} of ${g?.required} leads delivered.` };
  if (c.state === "FREE_TRIAL")
    return g?.owed_remaining === 0
      ? { dot: green, text: "Free trial: all owed leads delivered." }
      : { dot: red, text: `Free trial: ${g?.owed_remaining ?? "?"} leads still owed.` };
  if (c.own) {
    const cpl = c.cpl;
    const base = `${c.yesterday_leads} lead${c.yesterday_leads === 1 ? "" : "s"} yesterday${c.yesterday_spend ? ` on ${gbp(c.yesterday_spend)}` : ""}.`;
    return { dot: problem ? (problem.sev === 2 ? red : amber) : cpl?.sev === 2 ? red : cpl?.sev === 1 ? amber : green, text: problem ? `${base} ${problem.text}` : base };
  }
  if (g && c.state === "ACTIVE") {
    const count = `${g.counted} of ${g.required} leads, day ${g.day} of ${g.window}`;
    if (g.too_early) return { dot: grey, text: `${count}. Too early to call.` };
    const tail = problem ? ` ${problem.text}` : "";
    if (g.status === "WILL MISS") return { dot: red, text: `${count}. At this rate it will miss the guarantee (heading for about ${g.projected?.toFixed(0)}).${tail}` };
    if (g.status === "AT RISK") return { dot: amber, text: `${count}. Slightly behind. Needs watching.${tail}` };
    return { dot: problem ? amber : green, text: `${count}. ${g.status === "AHEAD" ? "Ahead of pace." : "On pace."}${tail}` };
  }
  return { dot: grey, text: "No guarantee tracking." };
}

export async function AdsHealth({ supabase }: { supabase: SupabaseClient }) {
  const [snap, activity] = await Promise.all([loadLatestAds(supabase), loadActivity(supabase, 3)]);
  if (!snap) return null;

  const hoursOld = (Date.now() - new Date(snap.created_at).getTime()) / 36e5;
  const rows = snap.payload.clients
    .map((c) => ({ c, v: verdict(c) }))
    .sort((a, b) => Number(b.v.dot === "bg-rose-500") - Number(a.v.dot === "bg-rose-500") || a.c.name.localeCompare(b.c.name));
  const bad = rows.filter((r) => r.v.dot === "bg-rose-500").length;
  const warn = rows.filter((r) => r.v.dot === "bg-amber-400").length;
  const headline = bad
    ? `${bad} client${bad === 1 ? "" : "s"} need${bad === 1 ? "s" : ""} action`
    : warn
      ? `${warn} to keep an eye on`
      : "All good";
  const border = bad ? "border-rose-500/40" : warn ? "border-amber-500/40" : "border-emerald-500/30";

  return (
    <Card className={`mb-6 ${border}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">
          Ads health: <span className={bad ? "text-rose-300" : warn ? "text-amber-300" : "text-emerald-300"}>{headline}</span>
        </h2>
        <Link href="/ads" className="text-sm text-emerald-400 hover:text-emerald-300">
          Full ads page →
        </Link>
      </div>
      {hoursOld > 3 ? (
        <p className="mt-2 text-sm text-amber-300">The ads numbers are {Math.round(hoursOld)} hours old. The monitor may have stopped updating.</p>
      ) : null}
      <ul className="mt-3 divide-y divide-white/5 text-sm">
        {rows.map(({ c, v }) => (
          <li key={c.name} className="flex gap-3 py-2">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${v.dot}`} />
            <span className="text-zinc-300">
              <span className="font-medium text-white">{c.name}{c.own ? " (own)" : ""}:</span> {v.text}
            </span>
          </li>
        ))}
      </ul>
      {activity.length > 0 ? (
        <div className="mt-3 border-t border-white/10 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What the ad maker did lately</p>
          <ul className="mt-1 space-y-1 text-sm text-zinc-400">
            {activity.map((a) => (
              <li key={a.id}>
                {a.client_name ? `${a.client_name}: ` : ""}
                {a.summary}
              </li>
            ))}
          </ul>
          <Link href="/ad-maker/activity" className="mt-1 inline-block text-xs text-emerald-400 hover:text-emerald-300">
            See everything it has done →
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
