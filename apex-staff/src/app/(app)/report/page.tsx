import { requireStaff, isManager } from "@/lib/staff/auth";
import { fmtDate, rangeBounds, todayIso } from "@/lib/staff/dates";
import { REPORT_DUE_HOUR } from "@/lib/staff/flags";
import { nameOf } from "@/lib/staff/metrics";
import type { CallRow, DailyReport, StaffRow } from "@/lib/staff/types";
import { submitReport } from "../../actions";
import { SubmitButton } from "@/components/staff/SubmitButton";
import { ActivityChart, PerHourChart, RateChart, type DayPoint } from "@/components/staff/ReportCharts";
import { Badge, Card, Field, Notice, PageHeader, SectionTitle, Stat, inputCls } from "@/components/staff/ui";

export const metadata = { title: "End of day report | Apex Team" };

export default async function ReportPage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const { supabase, me } = await requireStaff();
  const today = todayIso();
  const { from, to } = rangeBounds("today");
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [{ data: staffData }, { data: repData }, { data: callData }] = await Promise.all([
    supabase.from("staff").select("*").eq("active", true),
    supabase.from("daily_reports").select("*").gte("report_date", since).order("report_date", { ascending: false }).order("submitted_at", { ascending: false }),
    supabase.from("calls").select("*").gte("call_at", new Date(Date.now() - 31 * 86400000).toISOString()).limit(1500),
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
  const { count: bookedCount } = await supabase
    .from("calls")
    .select("id", { count: "exact", head: true })
    .gte("booked_at", from.toISOString())
    .lt("booked_at", to.toISOString())
    .ilike("source", first);
  const bookedToday = bookedCount ?? 0;
  const showed = todays.filter((c) => ["follow_up", "lost", "closed"].includes(c.outcome)).length;
  const noShow = todays.filter((c) => c.outcome === "no_show").length;
  const closed = todays.filter((c) => c.outcome === "closed").length;
  const cancelled = todays.filter((c) => c.outcome === "cancelled").length;
  const confirmedToday = todays.filter((c) => c.same_day_confirmation === "confirmed").length;
  const active = todays.filter((c) => c.outcome !== "cancelled").length;

  // ----- charts: whose numbers? a setter sees their own; the owner sees the first setter's
  const chartId = me.role === "setter" ? me.id : setters[0]?.id ?? me.id;
  const myReports = reports.filter((r) => r.staff_id === chartId);
  const dayIso = (back: number) => todayIso(new Date(Date.now() - back * 86400000));
  const hoursOf = (r: DailyReport) => {
    if (!r.start_time || !r.end_time) return null;
    const [sh, sm] = r.start_time.split(":").map(Number);
    const [eh, em] = r.end_time.split(":").map(Number);
    const h = (eh * 60 + em - (sh * 60 + sm)) / 60;
    return h > 0 ? h : null;
  };
  const days: DayPoint[] = Array.from({ length: 14 }, (_, k) => {
    const iso = dayIso(13 - k);
    const rep = myReports.find((r) => r.report_date === iso);
    const dayCalls = calls.filter((c) => c.outcome !== "cancelled" && todayIso(new Date(c.call_at)) === iso && c.setter_id === chartId);
    const showedN = dayCalls.filter((c) => ["follow_up", "lost", "closed"].includes(c.outcome)).length;
    const noShowN = dayCalls.filter((c) => c.outcome === "no_show").length;
    const hrs = rep ? hoursOf(rep) : null;
    const dt = new Date(`${iso}T12:00:00Z`);
    return {
      date: iso,
      label: dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" }),
      dials: rep ? rep.dials : null,
      conversations: rep ? rep.conversations : null,
      booked: rep ? rep.calls_booked : null,
      calls: dayCalls.length,
      showed: showedN,
      noShow: noShowN,
      showRate: showedN + noShowN > 0 ? (showedN / (showedN + noShowN)) * 100 : null,
      dialsPerHour: rep && hrs ? rep.dials / hrs : null,
    };
  });
  const sum = (arr: (number | null)[]) => arr.reduce<number>((t, v) => t + (v ?? 0), 0);
  const thisWk = days.slice(7);
  const lastWk = days.slice(0, 7);
  const rateOf = (a: DayPoint[]) => {
    const sh = sum(a.map((d) => d.showed));
    const ns = sum(a.map((d) => d.noShow));
    return sh + ns > 0 ? Math.round((sh / (sh + ns)) * 100) : null;
  };
  const deltas = [
    { label: "Dials", now: sum(thisWk.map((d) => d.dials)), before: sum(lastWk.map((d) => d.dials)), fmt: (n: number) => String(n) },
    { label: "Conversations", now: sum(thisWk.map((d) => d.conversations)), before: sum(lastWk.map((d) => d.conversations)), fmt: (n: number) => String(n) },
    { label: "Calls booked", now: sum(thisWk.map((d) => d.booked)), before: sum(lastWk.map((d) => d.booked)), fmt: (n: number) => String(n) },
    { label: "Show rate", now: rateOf(thisWk) ?? 0, before: rateOf(lastWk) ?? 0, fmt: (n: number) => `${n}%` },
  ];

  // streak = consecutive working days (Mon–Sat) with a report, counting back from today/yesterday
  let streak = 0;
  for (let back = 0; back < 30; back++) {
    const iso = dayIso(back);
    const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
    if (dow === 0) continue;
    if (myReports.some((r) => r.report_date === iso)) streak++;
    else if (back === 0) continue;
    else break;
  }
  const best = (f: (d: DayPoint) => number | null) => {
    let b: { v: number; d: DayPoint } | null = null;
    for (const d of days) {
      const v = f(d);
      if (v !== null && (b === null || v > b.v)) b = { v, d };
    }
    return b;
  };
  const bestBooked = best((d) => d.booked);
  const bestRate = best((d) => d.showRate);
  const bestPerHour = best((d) => d.dialsPerHour);

  // what's working: show rate when re-confirmed on the day vs not, and by lead source (last 30 days)
  const mineCalls = calls.filter((c) => c.setter_id === chartId && ["follow_up", "lost", "closed", "no_show"].includes(c.outcome));
  const rate = (arr: CallRow[]) => (arr.length ? Math.round((arr.filter((c) => c.outcome !== "no_show").length / arr.length) * 100) : null);
  const conf = mineCalls.filter((c) => c.same_day_confirmation === "confirmed");
  const unconf = mineCalls.filter((c) => c.same_day_confirmation !== "confirmed");
  const bySource = new Map<string, CallRow[]>();
  for (const c of mineCalls) {
    const key = (c.source ?? "unknown").trim() || "unknown";
    bySource.set(key, [...(bySource.get(key) ?? []), c]);
  }
  const convRate = (() => {
    const d = sum(days.map((x) => x.dials));
    const c = sum(days.map((x) => x.conversations));
    const b = sum(days.map((x) => x.booked));
    return { c: d ? Math.round((c / d) * 100) : null, b: c ? Math.round((b / c) * 100) : null };
  })();

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
            <Field label="Started at *">
              <input name="start_time" type="time" required defaultValue={mine?.start_time?.slice(0, 5) ?? ""} className={inputCls} />
            </Field>
            <Field label="Finished at *">
              <input name="end_time" type="time" required defaultValue={mine?.end_time?.slice(0, 5) ?? ""} className={inputCls} />
            </Field>
            <div />
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

      <SectionTitle>{me.role === "setter" ? "Your numbers" : `${nameOf(staff, chartId)}'s numbers`} — last 14 days</SectionTitle>
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {deltas.map((d) => {
          const diff = d.now - d.before;
          return (
            <Card key={d.label}>
              <p className="text-xs text-zinc-400">{d.label} — this week</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{d.fmt(d.now)}</p>
              <p className={`mt-1 text-xs ${diff > 0 ? "text-emerald-400" : diff < 0 ? "text-rose-400" : "text-zinc-500"}`}>
                {diff > 0 ? "▲" : diff < 0 ? "▼" : "•"} {diff === 0 ? "same as" : d.fmt(Math.abs(diff)) + (diff > 0 ? " more than" : " fewer than")} last week ({d.fmt(d.before)})
              </p>
            </Card>
          );
        })}
      </div>
      <Card className="mb-4">
        <SectionTitle>Calls made each day</SectionTitle>
        <ActivityChart days={days} keys={["dials"]} title="Calls made each day" />
      </Card>
      <Card className="mb-4">
        <SectionTitle>Conversations, bookings and how the calls went</SectionTitle>
        <ActivityChart days={days} keys={["conversations", "booked", "calls", "showed", "noShow"]} title="Conversations, bookings, calls, shows and no-shows by day" />
      </Card>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Show rate by day</SectionTitle>
          <RateChart days={days} />
        </Card>
        <Card>
          <SectionTitle>Dials per hour worked</SectionTitle>
          <PerHourChart days={days} />
        </Card>
      </div>
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionTitle>Streak &amp; personal bests</SectionTitle>
          <p className="text-3xl font-semibold text-white">🔥 {streak}</p>
          <p className="mb-3 text-xs text-zinc-500">working days in a row with a report filed</p>
          <ul className="space-y-1 text-sm text-zinc-300">
            <li>Most booked in a day: <b>{bestBooked ? `${bestBooked.v} (${bestBooked.d.label})` : "–"}</b></li>
            <li>Best show rate: <b>{bestRate ? `${Math.round(bestRate.v)}% (${bestRate.d.label})` : "–"}</b></li>
            <li>Most dials an hour: <b>{bestPerHour ? `${bestPerHour.v.toFixed(1)} (${bestPerHour.d.label})` : "–"}</b></li>
          </ul>
        </Card>
        <Card>
          <SectionTitle>What helps them show</SectionTitle>
          <ul className="space-y-2 text-sm text-zinc-300">
            <li>
              Re-confirmed on the day:{" "}
              <b className="text-emerald-400">{conf.length >= 3 ? `${rate(conf)}% showed` : "need a few more calls"}</b>
              <span className="text-zinc-500"> ({conf.length} calls)</span>
            </li>
            <li>
              Not re-confirmed:{" "}
              <b className="text-rose-400">{unconf.length >= 3 ? `${rate(unconf)}% showed` : "need a few more calls"}</b>
              <span className="text-zinc-500"> ({unconf.length} calls)</span>
            </li>
            <li className="text-xs text-zinc-500">Last 30 days. If the first number is bigger, confirming on the day is working.</li>
          </ul>
        </Card>
        <Card>
          <SectionTitle>Which leads show up</SectionTitle>
          <ul className="space-y-1 text-sm text-zinc-300">
            {Array.from(bySource.entries())
              .filter(([, v]) => v.length >= 3)
              .sort((a, b) => (rate(b[1]) ?? 0) - (rate(a[1]) ?? 0))
              .slice(0, 4)
              .map(([k, v]) => (
                <li key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span>
                    <b>{rate(v)}%</b> <span className="text-zinc-500">of {v.length}</span>
                  </span>
                </li>
              ))}
            {Array.from(bySource.values()).every((v) => v.length < 3) ? <li className="text-zinc-500">Not enough calls yet.</li> : null}
            <li className="pt-2 text-xs text-zinc-500">
              Conversations per dial: <b>{convRate.c === null ? "–" : `${convRate.c}%`}</b> · Booked per conversation:{" "}
              <b>{convRate.b === null ? "–" : `${convRate.b}%`}</b>
            </li>
          </ul>
        </Card>
      </div>

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
        {reports.slice(0, 14).map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-white">
                {nameOf(staff, r.staff_id)} · {fmtDate(r.report_date)}
              </p>
              <p className="text-xs text-zinc-500">
                {r.start_time && r.end_time ? `${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)} · ` : ""}
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
