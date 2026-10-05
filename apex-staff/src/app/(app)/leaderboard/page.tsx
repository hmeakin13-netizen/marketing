import { requireStaff } from "@/lib/staff/auth";
import { loadCore } from "@/lib/staff/data";
import { parseRange, rangeBounds } from "@/lib/staff/dates";
import { computeStats, money, pct } from "@/lib/staff/metrics";
import { Card, PageHeader, RangeTabs, SectionTitle } from "@/components/staff/ui";

export const metadata = { title: "Leaderboard | Apex Team" };

const medal = ["🥇", "🥈", "🥉"];

export default async function LeaderboardPage({ searchParams }: { searchParams: { range?: string } }) {
  const { supabase, me } = await requireStaff();
  const range = parseRange(searchParams.range);
  const { from, to } = rangeBounds(range);
  const { staff, calls, closes } = await loadCore(supabase, from);

  const closers = staff
    .filter((s) => s.active && s.role === "closer")
    .map((p) => ({ p, s: computeStats(calls, closes, from, to, { staffId: p.id, role: "closer" }) }))
    .sort((a, b) => b.s.cash - a.s.cash || b.s.closed - a.s.closed);
  const setters = staff
    .filter((s) => s.active && s.role === "setter")
    .map((p) => ({ p, s: computeStats(calls, closes, from, to, { staffId: p.id, role: "setter", name: p.full_name }) }))
    .sort((a, b) => b.s.booked - a.s.booked || b.s.cash - a.s.cash);

  const rowCls = (id: string) => (id === me.id ? "bg-emerald-500/10" : "");

  return (
    <>
      <PageHeader title="Leaderboard" subtitle="Healthy competition." action={<RangeTabs base="/leaderboard" range={range} />} />

      <SectionTitle>Closers — ranked by cash collected</SectionTitle>
      <Card className="mb-8 overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="px-5 py-3 font-medium">#</th>
              <th className="py-3 font-medium">Closer</th>
              <th className="py-3 text-right font-medium">Calls taken</th>
              <th className="py-3 text-right font-medium">Show %</th>
              <th className="py-3 text-right font-medium">Closes</th>
              <th className="py-3 text-right font-medium">Close %</th>
              <th className="px-5 py-3 text-right font-medium">Cash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {closers.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-4 text-zinc-500">No closers yet.</td></tr>
            ) : null}
            {closers.map(({ p, s }, i) => (
              <tr key={p.id} className={rowCls(p.id)}>
                <td className="px-5 py-3 text-lg">{medal[i] ?? i + 1}</td>
                <td className="py-3 font-medium text-white">{p.full_name}</td>
                <td className="py-3 text-right tabular-nums">{s.taken}</td>
                <td className="py-3 text-right tabular-nums">{pct(s.showRate)}</td>
                <td className="py-3 text-right tabular-nums">{s.closed}</td>
                <td className="py-3 text-right tabular-nums">{pct(s.closeRate)}</td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums text-emerald-400">{money(s.cash)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <SectionTitle>Setters — ranked by calls booked</SectionTitle>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="px-5 py-3 font-medium">#</th>
              <th className="py-3 font-medium">Setter</th>
              <th className="py-3 text-right font-medium">Booked</th>
              <th className="py-3 text-right font-medium">Show %</th>
              <th className="py-3 text-right font-medium">Closes</th>
              <th className="px-5 py-3 text-right font-medium">Cash from their calls</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {setters.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-4 text-zinc-500">No setters yet.</td></tr>
            ) : null}
            {setters.map(({ p, s }, i) => (
              <tr key={p.id} className={rowCls(p.id)}>
                <td className="px-5 py-3 text-lg">{medal[i] ?? i + 1}</td>
                <td className="py-3 font-medium text-white">{p.full_name}</td>
                <td className="py-3 text-right tabular-nums">{s.booked}</td>
                <td className="py-3 text-right tabular-nums">{pct(s.showRate)}</td>
                <td className="py-3 text-right tabular-nums">{s.closed}</td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums text-emerald-400">{money(s.cash)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
