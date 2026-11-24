import { requireStaff, isManager } from "@/lib/staff/auth";
import { fmtDateTime } from "@/lib/staff/dates";
import { RUBRIC_CLOSER, RUBRIC_SETTER, WIN_OUTCOMES, loadGrades, loadWeekly, rubricFor, scoreTone, weakestItem, weekStartOf, type GradeRow, type WeeklyRow } from "@/lib/staff/grades";
import { Badge, Card, PageHeader, SectionTitle, Stat } from "@/components/staff/ui";

export const metadata = { title: "Call grades | Apex Team" };
export const dynamic = "force-dynamic";

const mins = (s: number | null) => (s == null ? "" : `${Math.max(1, Math.round(s / 60))} min`);
const fmt1 = (n: number | null | undefined) => (n == null ? "–" : Number(n).toFixed(1));
const lines = (t: string | null) => (t ?? "").split(/\n+/).map((l) => l.replace(/^[-•\d.)\s]+/, "").trim()).filter(Boolean);

export default async function CallGradesPage() {
  const { supabase, me } = await requireStaff();
  const manager = isManager(me.role);
  const mine = manager ? undefined : me.id;
  const [grades, weekly] = await Promise.all([loadGrades(supabase, { staffId: mine, days: 28 }), loadWeekly(supabase, { staffId: mine, weeks: 6 })]);

  const thisWeek = weekStartOf(new Date());
  const lastWeek = weekStartOf(new Date(Date.now() - 7 * 86400000));
  const people = Array.from(new Map(grades.map((g) => [g.staff_name, { name: g.staff_name, id: g.staff_id, role: g.role }])).values());

  const summaryFor = (name: string) => {
    const rows = grades.filter((g) => g.staff_name === name);
    const tw = weekly.find((w) => w.staff_name === name && w.week_start === thisWeek);
    const lw = weekly.find((w) => w.staff_name === name && w.week_start === lastWeek);
    const recent = rows.slice(0, 10);
    const role = rows[0]?.role ?? "unknown";
    return { rows, tw, lw, weak: weakestItem(recent, rubricFor(role)), tips: recent.flatMap((g) => lines(g.tips)).slice(0, 4) };
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={manager ? "Call grades" : "My call grades"}
        subtitle="Every recorded sales call is marked out of 10 on the same five things, with tips. Closers' calls come from Fathom, setters' calls from GoHighLevel. Graded three times a day (07:13, 13:13 and 18:13)."
      />

      {(manager ? (["setter", "closer"] as const) : ([me.role === "closer" ? "closer" : "setter"] as const)).map((r) => (
        <Card key={r}>
          <SectionTitle>How a {r === "setter" ? "setter" : "closer"} call is marked</SectionTitle>
          <p className="-mt-2 mb-3 text-xs text-zinc-500">
            {r === "setter"
              ? "A setter's job is to qualify and book the call with the closer. The price is for the closer's call, so holding it back scores well here."
              : "A closer's job is discovery first, then the pitch and the price once, clearly, then the close."}
          </p>
          <ul className="grid gap-2 text-sm text-zinc-300 sm:grid-cols-2 lg:grid-cols-5">
            {(r === "setter" ? RUBRIC_SETTER : RUBRIC_CLOSER).map((it) => (
              <li key={it.key} className="rounded-lg bg-white/5 p-3">
                <p className="font-semibold text-white">{it.label} <span className="text-xs font-normal text-zinc-500">0 to 2</span></p>
                <p className="mt-1 text-xs text-zinc-400">{it.what}</p>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {grades.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-400">
            {manager ? "No calls graded yet." : "None of your calls have been graded yet."} The Call Grader reads the last two daysThe Call Grader reads the previous day&apos;s recordings every evening;apos; recordings three times a day; a call needs to be at least a minute and a half long to be marked.
          </p>
        </Card>
      ) : null}

      {people.map((p) => {
        const s = summaryFor(p.name);
        const avg = s.tw?.avg_total ?? null;
        const delta = avg != null && s.lw?.avg_total != null ? Number(avg) - Number(s.lw.avg_total) : null;
        return (
          <section key={p.name} className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">{manager ? p.name : "This week"}</h2>
              <Badge tone={p.role === "closer" ? "info" : "default"}>{p.role}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Score this week" value={avg == null ? "–" : `${fmt1(avg)} / 10`} tone={scoreTone(avg == null ? null : Number(avg))} hint={delta == null ? "no calls last week to compare" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} on last week`} />
              <Stat label="Calls graded this week" value={String(s.tw?.calls ?? 0)} hint={`${s.rows.length} in the last 28 days`} />
              <Stat label="Won this week" value={String(s.tw?.wins ?? 0)} hint="booked, rebooked or closed" tone={(s.tw?.wins ?? 0) > 0 ? "good" : "default"} />
              <Stat label="Weakest area" value={s.weak ? s.weak.label : "–"} hint={s.weak ? `${fmt1(s.weak.avg)} of 2 over the last ${Math.min(10, s.rows.length)} calls` : ""} tone={s.weak && s.weak.avg < 1 ? "bad" : s.weak && s.weak.avg < 1.5 ? "warn" : "default"} />
            </div>
            {s.tips.length > 0 ? (
              <Card className="border-sky-500/30 bg-sky-500/5">
                <SectionTitle>{manager ? `What ${p.name.split(" ")[0]} should work on` : "What to work on next call"}</SectionTitle>
                <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-200">
                  {s.tips.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </Card>
            ) : null}
            <WeeklyTable rows={weekly.filter((w) => w.staff_name === p.name)} role={p.role} />
          </section>
        );
      })}

      {grades.length > 0 ? (
        <section>
          <SectionTitle>Recent calls ({grades.length})</SectionTitle>
          <div className="grid gap-3">
            {grades.slice(0, 60).map((g) => (
              <GradeCard key={g.id} g={g} showName={manager} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function WeeklyTable({ rows, role }: { rows: WeeklyRow[]; role: string }) {
  if (rows.length === 0) return null;
  const rubric = rubricFor(role);
  return (
    <Card>
      <SectionTitle>By week</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="pb-2 font-medium">Week of</th>
              <th className="pb-2 text-right font-medium">Calls</th>
              <th className="pb-2 text-right font-medium">Score</th>
              {rubric.map((r) => (
                <th key={r.key} className="pb-2 text-right font-medium">{r.label}</th>
              ))}
              <th className="pb-2 text-right font-medium">Won</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((w) => (
              <tr key={w.week_start}>
                <td className="py-2 text-zinc-200">{new Date(w.week_start + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                <td className="py-2 text-right tabular-nums">{w.calls}</td>
                <td className="py-2 text-right tabular-nums font-semibold text-white">{fmt1(w.avg_total)}</td>
                <td className="py-2 text-right tabular-nums">{fmt1(w.avg_opening)}</td>
                <td className="py-2 text-right tabular-nums">{fmt1(w.avg_discovery)}</td>
                <td className="py-2 text-right tabular-nums">{fmt1(w.avg_objections)}</td>
                <td className="py-2 text-right tabular-nums">{fmt1(w.avg_next_step)}</td>
                <td className="py-2 text-right tabular-nums">{fmt1(w.avg_confirmation)}</td>
                <td className="py-2 text-right tabular-nums">{w.wins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function GradeCard({ g, showName }: { g: GradeRow; showName: boolean }) {
  const rubric = rubricFor(g.role);
  const win = g.outcome ? WIN_OUTCOMES.includes(g.outcome) : false;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xl font-semibold tabular-nums text-white">{g.total}<span className="text-sm text-zinc-500">/10</span></span>
        {showName ? <span className="font-medium text-zinc-100">{g.staff_name}</span> : null}
        {g.prospect_label ? <span className="text-sm text-zinc-400">with {g.prospect_label}</span> : null}
        <span className="text-xs text-zinc-500">{fmtDateTime(g.call_at)}{g.duration_s ? ` · ${mins(g.duration_s)}` : ""}</span>
        {g.outcome ? <Badge tone={win ? "good" : g.outcome === "not interested" || g.outcome === "lost" ? "bad" : "default"}>{g.outcome}</Badge> : null}
        <Badge tone={g.source === "fathom" ? "info" : "default"}>{g.source === "fathom" ? "Fathom" : "GoHighLevel"}</Badge>
        {g.call_url ? (
          <a href={g.call_url} target="_blank" rel="noreferrer" className="text-xs text-emerald-400 hover:text-emerald-300">Recording →</a>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {rubric.map((r) => (
          <span key={r.key} className={`rounded-full px-2.5 py-0.5 text-xs ${g[r.key] === 2 ? "bg-emerald-500/15 text-emerald-300" : g[r.key] === 1 ? "bg-amber-500/15 text-amber-300" : "bg-rose-500/15 text-rose-300"}`}>
            {r.label} {g[r.key]}/2
          </span>
        ))}
      </div>
      <p className="mt-3 text-sm text-zinc-200">{g.summary}</p>
      {g.strengths ? <p className="mt-2 text-xs text-zinc-400"><span className="font-semibold text-emerald-300">Good:</span> {lines(g.strengths).join(" · ")}</p> : null}
      {g.tips ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-zinc-300">
          {lines(g.tips).map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
