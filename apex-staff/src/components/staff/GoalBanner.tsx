import { Card } from "@/components/staff/ui";
import { money } from "@/lib/staff/metrics";
import { GOAL, goalProgress, monthLabel } from "@/lib/staff/goals";
import type { CloseRow } from "@/lib/staff/types";

const closesOf = (n: number) => (Math.round((n / GOAL.perClose) * 10) / 10).toString();

/** The owner's goal at the top of the dashboard: progress bar, the "trip paid" marker and month milestones. */
export function GoalBanner({ closes }: { closes: CloseRow[] }) {
  const g = goalProgress(closes);
  const tripPct = (GOAL.tripPaid / GOAL.target) * 100;
  const tripPaidDone = g.sum >= GOAL.tripPaid;
  const nextMilestone = g.milestones.find((m) => !m.month);

  return (
    <Card className="mb-6 border-emerald-500/30">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-300">{GOAL.name}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">
            {money(g.sum)} <span className="text-base font-normal text-zinc-400">of {money(GOAL.target)}</span>
          </p>
        </div>
        <p className="text-right text-sm text-zinc-300">
          {g.left > 0 ? (
            <>
              <span className="font-medium tabular-nums">{money(g.left)}</span> to go ·{" "}
              <span className="font-medium tabular-nums">{g.closesLeft}</span> more close{g.closesLeft === 1 ? "" : "s"}
            </>
          ) : (
            "Goal reached"
          )}
          <span className="block text-xs text-zinc-500">
            {money(GOAL.target)} = {Math.round(GOAL.target / GOAL.perClose)} closes at {money(GOAL.perClose)}. Counted from{" "}
            {new Date(GOAL.start + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            : {g.count} close{g.count === 1 ? "" : "s"} so far.
          </span>
        </p>
      </div>

      <div className="relative mt-4 h-3 rounded-full bg-white/10">
        <div className="h-3 rounded-full bg-emerald-500" style={{ width: `${g.pct}%` }} />
        <div className="absolute -top-1 h-5 w-0.5 bg-amber-300" style={{ left: `${tripPct}%` }} />
      </div>
      <div className="relative mt-1 h-8 text-xs text-zinc-400">
        <span className="absolute -translate-x-1/2 whitespace-nowrap text-amber-300" style={{ left: `${Math.min(Math.max(tripPct, 12), 88)}%` }}>
          {money(GOAL.tripPaid)} = {closesOf(GOAL.tripPaid)} closes · trip paid {tripPaidDone ? "✓" : `(${money(Math.max(0, GOAL.tripPaid - g.sum))} away)`}
        </span>
      </div>

      <div className="mt-3 border-t border-white/5 pt-3">
        <p className="mb-2 text-xs font-medium text-zinc-400">
          Milestones · this month so far {money(g.thisMonth.value)} from {g.thisMonth.closes} close{g.thisMonth.closes === 1 ? "" : "s"}
          {g.best ? ` · best month ${money(g.best.value)} (${monthLabel(g.best.key)})` : ""}
        </p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {g.milestones.map((m) => {
            const done = !!m.month;
            const isNext = nextMilestone?.amount === m.amount;
            return (
              <li
                key={m.amount}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  done ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : isNext ? "border-amber-400/40 text-amber-200" : "border-white/10 text-zinc-500"
                }`}
              >
                <span className="font-medium">First {money(m.amount / 1000)}k month</span>
                <span className="block text-xs">
                  {done
                    ? `${monthLabel(m.month!)} ✓`
                    : isNext
                    ? `${money(Math.max(0, m.amount - g.thisMonth.value))} to go this month`
                    : `${closesOf(m.amount)} closes`}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
