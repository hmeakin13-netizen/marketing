import { requireStaff, isManager } from "@/lib/staff/auth";
import { loadCore } from "@/lib/staff/data";
import { parseRange, rangeBounds, fmtDate } from "@/lib/staff/dates";
import { computeStats, pct } from "@/lib/staff/metrics";
import { loadGrades, scoreTone } from "@/lib/staff/grades";
import { fmtSpeed, loadSetterDays, sumSetterDays, type SetterDay } from "@/lib/staff/setters";
import { Badge, Card, PageHeader, RangeTabs, SectionTitle } from "@/components/staff/ui";

export const metadata = { title: "Setters | Apex Team" };
export const dynamic = "force-dynamic";

const ukDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/London" }); // YYYY-MM-DD
const n0 = (n: number) => n.toLocaleString("en-GB");
const ratio = (a: number, b: number) => (b > 0 ? pct((a / b) * 100) : "–");

export default async function SettersPage({ searchParams }: { searchParams: { range?: string } }) {
  const { supabase, me } = await requireStaff();
  const manager = isManager(me.role);
  const range = parseRange(searchParams.range);
  const { from, to } = rangeBounds(range);
  const sinceDay = ukDay(from);

  const { staff, calls, closes } = await loadCore(supabase, from);
  const setters = staff.filter((s) => s.active && s.role === "setter" && (manager || s.id === me.id));

  if (!manager && me.role !== "setter") {
    return (
      <>
        <PageHeader title="Setters" subtitle="This page compares the setters. It is for setters and managers." />
        <Card><p className="text-sm text-zinc-400">Nothing to show for your role.</p></Card>
      </>
    );
  }

  const [days, grades] = await Promise.all([
    loadSetterDays(supabase, { staffId: manager ? undefined : me.id, sinceDay }),
    loadGrades(supabase, { staffId: manager ? undefined : me.id, days: 60 }),
  ]);

  const cols = setters.map((s) => {
    const mine = days.filter((d) => d.staff_id === s.id && d.day < ukDay(to));
    const t = sumSetterDays(mine);
    const st = computeStats(calls, closes, from, to, { staffId: s.id, role: "setter", name: s.full_name });
    const g = grades.filter((x) => x.staff_id === s.id && new Date(x.call_at) >= from && new Date(x.call_at) < to);
    const avg = g.length ? g.reduce((a, x) => a + x.total, 0) / g.length : null;
    return { s, t, st, grade: avg, graded: g.length, rows: mine };
  });

  const rows: { label: string; hint?: string; cell: (c: (typeof cols)[number]) => string; tone?: (c: (typeof cols)[number]) => "default" | "good" | "warn" | "bad" }[] = [
    { label: "Calls booked", hint: "from the portal, by the day they were booked", cell: (c) => String(c.st.booked) },
    { label: "Show rate", hint: "of their booked calls that took place", cell: (c) => pct(c.st.showRate), tone: (c) => (c.st.showRate == null ? "default" : c.st.showRate >= 60 ? "good" : c.st.showRate >= 45 ? "warn" : "bad") },
    { label: "Closed from their bookings", cell: (c) => String(c.st.closed) },
    { label: "Dials", hint: "outbound calls in GoHighLevel", cell: (c) => n0(c.t.dials) },
    { label: "Conversations", hint: "calls over 90 seconds", cell: (c) => n0(c.t.conversations) },
    { label: "Conversation rate", cell: (c) => ratio(c.t.conversations, c.t.dials) },
    { label: "Talk time", cell: (c) => `${Math.round(c.t.talkMinutes)} min` },
    { label: "Texts sent", cell: (c) => n0(c.t.textsSent) },
    { label: "Replies received", cell: (c) => n0(c.t.replies) },
    { label: "Reply rate", cell: (c) => ratio(c.t.replies, c.t.textsSent) },
    { label: "New leads first touched", hint: "new form leads they rang or texted first", cell: (c) => n0(c.t.newLeads) },
    { label: "Speed to lead", hint: "median time from the form to the first call or text", cell: (c) => fmtSpeed(c.t.speedMedianMin), tone: (c) => (c.t.speedMedianMin == null ? "default" : c.t.speedMedianMin <= 15 ? "good" : c.t.speedMedianMin <= 60 ? "warn" : "bad") },
    { label: "Leads left untouched", hint: "new leads with no call or text by anyone that day", cell: (c) => n0(c.t.untouched), tone: (c) => (c.t.untouched === 0 ? "default" : "bad") },
    { label: "Overdue follow-ups", hint: "open GoHighLevel tasks past due, latest count", cell: (c) => (c.t.overdueLatest == null ? "–" : n0(c.t.overdueLatest)), tone: (c) => (c.t.overdueLatest ? (c.t.overdueLatest > 5 ? "bad" : "warn") : "default") },
    { label: "Call grade", hint: "average score out of 10 on graded calls", cell: (c) => (c.grade == null ? "–" : `${c.grade.toFixed(1)} / 10 (${c.graded})`), tone: (c) => scoreTone(c.grade) },
  ];

  const toneCls = { default: "text-zinc-100", good: "text-emerald-300", warn: "text-amber-300", bad: "text-rose-300" };
  const latestUpdate = cols.map((c) => c.t.updatedAt).filter(Boolean).sort().pop();

  return (
    <>
      <PageHeader
        title={manager ? "Setters, side by side" : "My setter numbers"}
        subtitle={`${range === "today" ? "Today" : range === "week" ? "This week" : "This month"}: ${fmtDate(from.toISOString())}${range === "today" ? "" : ` to ${fmtDate(new Date(to.getTime() - 1).toISOString())}`}. Bookings and show rate come from the portal; dials, texts, speed to lead and follow-ups come from GoHighLevel, counted three times a day (09:02, 14:02, 18:02).`}
        action={<RangeTabs base="/setters" range={range} />}
      />

      {setters.length === 0 ? (
        <Card><p className="text-sm text-zinc-400">No active setters yet. Add them on the Team page with their GoHighLevel user id.</p></Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Measure</th>
                {cols.map((c) => (
                  <th key={c.s.id} className="py-3 pr-5 text-right font-medium text-zinc-200">
                    {c.s.full_name}
                    {c.s.id === me.id ? <Badge tone="good">you</Badge> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="px-5 py-2.5">
                    <span className="text-zinc-200">{r.label}</span>
                    {r.hint ? <span className="block text-xs text-zinc-500">{r.hint}</span> : null}
                  </td>
                  {cols.map((c) => (
                    <td key={c.s.id} className={`py-2.5 pr-5 text-right tabular-nums font-medium ${toneCls[r.tone ? r.tone(c) : "default"]}`}>
                      {r.cell(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="mt-2 text-xs text-zinc-600">
        {latestUpdate ? `GoHighLevel numbers last counted ${new Date(latestUpdate).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : "GoHighLevel numbers have not been counted yet for this period."}
        {" "}Green, amber and red: show rate 60/45 per cent, speed to lead 15/60 minutes, call grade 7.5/5.
      </p>

      {cols.map((c) => (
        <DayTable key={c.s.id} name={manager ? c.s.full_name : "Day by day"} rows={c.rows} />
      ))}
    </>
  );
}

function DayTable({ name, rows }: { name: string; rows: SetterDay[] }) {
  if (rows.length === 0) return null;
  return (
    <Card className="mt-6">
      <SectionTitle>{name}, day by day</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="pb-2 font-medium">Day</th>
              <th className="pb-2 text-right font-medium">Dials</th>
              <th className="pb-2 text-right font-medium">Convos</th>
              <th className="pb-2 text-right font-medium">Talk</th>
              <th className="pb-2 text-right font-medium">Texts</th>
              <th className="pb-2 text-right font-medium">Replies</th>
              <th className="pb-2 text-right font-medium">New leads</th>
              <th className="pb-2 text-right font-medium">Speed</th>
              <th className="pb-2 text-right font-medium">Untouched</th>
              <th className="pb-2 text-right font-medium">Overdue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((d) => (
              <tr key={d.day}>
                <td className="py-2 text-zinc-200">{new Date(d.day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</td>
                <td className="py-2 text-right tabular-nums">{d.dials}</td>
                <td className="py-2 text-right tabular-nums">{d.conversations}</td>
                <td className="py-2 text-right tabular-nums">{d.talk_minutes == null ? "–" : `${Math.round(Number(d.talk_minutes))} min`}</td>
                <td className="py-2 text-right tabular-nums">{d.texts_sent}</td>
                <td className="py-2 text-right tabular-nums">{d.replies}</td>
                <td className="py-2 text-right tabular-nums">{d.new_leads}</td>
                <td className="py-2 text-right tabular-nums">{fmtSpeed(d.first_touch_median_min == null ? null : Number(d.first_touch_median_min))}</td>
                <td className="py-2 text-right tabular-nums">{d.untouched_leads}</td>
                <td className="py-2 text-right tabular-nums">{d.overdue_tasks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
