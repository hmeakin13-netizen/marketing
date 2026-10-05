import { Card } from "@/components/staff/ui";
import { money } from "@/lib/staff/metrics";
import type { CloseRow } from "@/lib/staff/types";

// Team incentive: hit the cash target by the deadline and the team goes to Cape Verde.
const GOAL = 40000;
const FROM = Date.UTC(2026, 8, 30, 23, 0); // 1 Oct 2026 00:00 UK (BST)
const DEADLINE = Date.UTC(2026, 10, 1, 0, 0); // end of 31 Oct 2026 UK

export function CashGoal({ closes }: { closes: CloseRow[] }) {
  let cash = 0;
  for (const c of closes) {
    for (const p of c.payments) {
      const t = new Date(p.paid_at).getTime();
      if (t >= FROM && t < DEADLINE) cash += Number(p.amount);
    }
  }
  const now = Date.now();
  const daysLeft = Math.max(0, Math.ceil((DEADLINE - now) / 86400000));
  const pctDone = Math.min(100, (cash / GOAL) * 100);
  const hit = cash >= GOAL;
  const left = Math.max(0, GOAL - cash);

  return (
    <Card className="mt-6 border-emerald-500/30 bg-emerald-500/5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-emerald-300">
          {hit ? "🌴 Cape Verde unlocked!" : "🌴 Cape Verde challenge"}
        </p>
        <p className="text-xs text-zinc-400">
          {daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left · ends 31 Oct` : "Deadline passed"}
        </p>
      </div>
      <p className="mt-1 text-sm text-zinc-400">
        Hit {money(GOAL)} of new cash collected by 31 October and the team goes to Cape Verde.
      </p>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pctDone}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-sm">
        <span className="font-semibold tabular-nums text-white">
          {money(cash)} <span className="font-normal text-zinc-500">({pctDone.toFixed(0)}%)</span>
        </span>
        <span className="tabular-nums text-zinc-400">{hit ? "Target hit" : `${money(left)} to go`}</span>
      </div>
    </Card>
  );
}
