import { requireStaff, isManager } from "@/lib/staff/auth";
import { fmtDate, rangeBounds, todayIso } from "@/lib/staff/dates";
import { REPORT_DUE_HOUR } from "@/lib/staff/flags";
import { nameOf } from "@/lib/staff/metrics";
import type { CallRow, DailyReport, StaffRow } from "@/lib/staff/types";
import { submitReport } from "../../actions";
import { SubmitButton } from "@/components/staff/SubmitButton";
import { Badge, Card, Field, Notice, PageHeader, SectionTitle, Stat, inputCls } from "@/components/staff/ui";

export const metadata = { title: "End of day report | Apex Team" };

export default async function ReportPage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const { supabase, me } = await requireStaff();
  const today = todayIso();
  const { from, to } = rangeBounds("today");
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);

  const [{ data: staffData }, { data: repData }, { data: callData }] = await Promise.all([
    supabase.from("staff").select("*").eq("active", true),
    supabase.from("daily_reports").select("*").gte("report_date", since).order("report_date", { ascending: false }).order("submitted_at", { ascending: false }),
    supabase.from("calls").select("*").or(`call_at.gte.${from.toISOString()},booked_at.gte.${from.toISOString()}`).limit(500),
  ]);
  const staff = (staffData ?? []) as StaffRow[];
  const reports = (repData ?? []) as DailyReport[];
  const calls = (callData ?? []) as CallRow[];
  const manager = isManager(me.role);
  const mine = reports.find((r) => r.staff_id === me.id && r.report_date === today);
  const setters = staff.filter((s) => s.role === "setter");

  // What the system already knows about today, so the report matches the numbers.
  const inRange = (iso: string) => new Date(iso).getTime() >= from.getTime() && new Date(iso).getTime() < to.getTime();
  const todays = calls.filter((c) => inRange(c.call_at));
  const first = me.full_name.split(" ")[0].toLowerCase();
  const bookedToday = calls.filter((c) => inRange(c.booked_at) && (c.source ?? "").trim().toLowerCase() === first).length;
  const showed = todays.filter((c) => ["follow_up", "lost", "closed"].includes(c.outcome)).length;
  const noShow = todays.filter((c) => c.outcome === "no_show").length;
  const closed = todays.filter((c) => c.outcome === "closed").length;
  const cancelled = todays.filter((c) => c.outcome === "cancelled").length;
  const confirmedToday = todays.filter((c) => c.same_day_confirmation === "confirmed").length;
  const active = todays.filter((c) => c.outcome !== "cancelled").length;

  const showForm = me.role === "setter" || me.role === "admin";

  return (
    <>
      <PageHeader title="End of day report" subtitle={`Every working day, by ${REPORT_DUE_HOUR}:00 UK. How did the calls go?`} />
      <Notice ok={searchParams.ok} error={searchParams.error} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Calls today" value={String(active)} hint={cancelled ? `${cancelled} cancelled` : undefined} />
        <Stat label="Confirmed on the day" value={`${confirmedToday}/${active}`} />
        <Stat label="Showed" value={String(showed)} tone="good" />
        <Stat label="No-shows" value={String(noShow)} tone={noShow ? "bad" : "default"} />
        <Stat label="Closed" value={String(closed)} tone="good" />
      </div>

      {showForm ? (
        <Card className="mb-8">
          <SectionTitle>{mine ? "Today's report (filed — you can edit it)" : "File today's report"}</SectionTitle>
          <form action={submitReport} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="report_date" value={today} />
            <Field label="Dials made *">
              <input name="dials" inputMode="numeric" required defaultValue={mine?.dials ?? ""} className={inputCls} placeholder="0" />
            </Field>
            <Field label="Conversations *">
              <input name="conversations" inputMode="numeric" required defaultValue={mine?.conversations ?? ""} className={inputCls} placeholder="0" />
            </Field>
            <Field label="Calls booked today *">
              <input name="calls_booked" inputMode="numeric" required defaultValue={mine?.calls_booked ?? bookedToday} className={inputCls} />
            </Field>
            <Field label="How did the calls go today? *" className="sm:col-span-3">
              <textarea
                name="summary"
                required
                rows={4}
                defaultValue={mine?.summary ?? ""}
                className={inputCls}
                placeholder="Who showed, who didn't, what the leads were like, anything that stood out…"
              />
            </Field>
            <Field label="Problems or things the closers should know (optional)" className="sm:col-span-3">
              <textarea name="issues" rows={2} defaultValue={mine?.issues ?? ""} className={inputCls} placeholder="Bad leads, a tech problem, someone to chase tomorrow…" />
            </Field>
            <div className="sm:col-span-3">
              <SubmitButton>{mine ? "Update report" : "Submit report"}</SubmitButton>
            </div>
          </form>
        </Card>
      ) : null}

      <SectionTitle>{manager ? "Reports" : "Your recent reports"}</SectionTitle>
      {manager && setters.length > 0 ? (
        <p className="mb-3 text-sm text-zinc-400">
          Today:{" "}
          {setters.map((s) => {
            const done = reports.some((r) => r.staff_id === s.id && r.report_date === today);
            return (
              <span key={s.id} className="mr-3">
                {s.full_name} <Badge tone={done ? "good" : "warn"}>{done ? "filed" : "not yet"}</Badge>
              </span>
            );
          })}
        </p>
      ) : null}
      <div className="space-y-3">
        {reports.length === 0 ? <p className="text-sm text-zinc-500">No reports yet.</p> : null}
        {reports.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-white">
                {nameOf(staff, r.staff_id)} · {fmtDate(r.report_date)}
              </p>
              <p className="text-xs text-zinc-500">
                {r.dials} dials · {r.conversations} conversations · {r.calls_booked} booked
              </p>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{r.summary}</p>
            {r.issues ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-amber-300">
                <span className="font-medium">Problems:</span> {r.issues}
              </p>
            ) : null}
          </Card>
        ))}
      </div>
    </>
  );
}
