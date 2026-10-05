import Link from "next/link";
import { requireStaff } from "@/lib/staff/auth";
import { fmtDateTime, rangeBounds, ukParts, ukWallClockToUtc } from "@/lib/staff/dates";
import { nameOf } from "@/lib/staff/metrics";
import { OUTCOME_LABEL, type CallRow, type StaffRow } from "@/lib/staff/types";
import { Badge, Card, PageHeader } from "@/components/staff/ui";

export const metadata = { title: "Calendar | Apex Team" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function CalendarPage({ searchParams }: { searchParams: { w?: string } }) {
  const { supabase } = await requireStaff();
  const offset = Math.max(-26, Math.min(26, parseInt(searchParams.w ?? "0", 10) || 0));

  const monday = rangeBounds("week").from;
  const anchor = new Date(monday.getTime() + 12 * 3600e3 + offset * 7 * 864e5);
  const p = ukParts(anchor);
  const dayStarts = Array.from({ length: 8 }, (_, i) => ukWallClockToUtc(p.year, p.month, p.day + i));

  const [{ data: callData }, { data: staffData }] = await Promise.all([
    supabase
      .from("calls")
      .select("*")
      .gte("call_at", dayStarts[0].toISOString())
      .lt("call_at", dayStarts[7].toISOString())
      .order("call_at"),
    supabase.from("staff").select("*"),
  ]);
  const calls = (callData ?? []) as CallRow[];
  const staff = (staffData ?? []) as StaffRow[];
  const todayStart = rangeBounds("today").from.getTime();

  const label = (d: Date) =>
    d.toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" });
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle={`${label(dayStarts[0])} – ${label(new Date(dayStarts[7].getTime() - 3600e3))} · all times UK`}
        action={
          <div className="flex gap-2">
            <Link href={`/calendar?w=${offset - 1}`} className="rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5">
              ← Prev
            </Link>
            <Link href="/calendar" className="rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5">
              This week
            </Link>
            <Link href={`/calendar?w=${offset + 1}`} className="rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5">
              Next →
            </Link>
          </div>
        }
      />
      <div className="grid gap-3 md:grid-cols-7">
        {WEEKDAYS.map((name, i) => {
          const start = dayStarts[i].getTime();
          const end = dayStarts[i + 1].getTime();
          const day = calls.filter((c) => {
            const t = new Date(c.call_at).getTime();
            return t >= start && t < end;
          });
          const isToday = start === todayStart;
          return (
            <Card key={name} className={`min-h-[8rem] p-3 ${isToday ? "border-emerald-400/50" : ""}`}>
              <p className={`mb-2 text-xs font-semibold uppercase tracking-wider ${isToday ? "text-emerald-400" : "text-zinc-500"}`}>
                {name} {label(dayStarts[i])}
              </p>
              {day.length === 0 ? <p className="text-xs text-zinc-600">–</p> : null}
              <div className="space-y-2">
                {day.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-lg border p-2 text-xs ${
                      c.outcome === "cancelled" ? "border-white/5 opacity-50" : "border-white/10 bg-white/5"
                    }`}
                    title={fmtDateTime(c.call_at)}
                  >
                    <p className="font-semibold tabular-nums text-white">{time(c.call_at)}</p>
                    <p className="truncate text-zinc-200">{c.lead_name}</p>
                    <p className="truncate text-zinc-500">{nameOf(staff, c.closer_id)}</p>
                    {c.outcome !== "scheduled" ? (
                      <div className="mt-1">
                        <Badge tone={c.outcome === "closed" ? "good" : c.outcome === "no_show" ? "bad" : "default"}>
                          {OUTCOME_LABEL[c.outcome]}
                        </Badge>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
