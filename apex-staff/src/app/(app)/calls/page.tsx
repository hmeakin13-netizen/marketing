import { requireStaff, isManager } from "@/lib/staff/auth";
import { fmtDateTime, toUkLocalInput } from "@/lib/staff/dates";
import { nameOf } from "@/lib/staff/metrics";
import { needsRecording } from "@/lib/staff/recording";
import { OUTCOME_LABEL, type CallRow, type CallOutcome, type StaffRow } from "@/lib/staff/types";
import { assignCall, bookCall } from "../../actions";
import { OutcomeForm } from "@/components/staff/OutcomeForm";
import { SubmitButton } from "@/components/staff/SubmitButton";
import { Badge, Card, Field, Notice, PageHeader, SectionTitle, inputCls } from "@/components/staff/ui";

export const metadata = { title: "Calls | Apex Team" };

const toneOf = (o: CallOutcome) =>
  o === "closed" ? "good" : o === "no_show" ? "bad" : o === "follow_up" ? "info" : o === "scheduled" ? "warn" : "default";

export default async function CallsPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const { supabase, me } = await requireStaff();
  const since = new Date(Date.now() - 45 * 86400000).toISOString();

  const [{ data: staffData }, { data: callData }, { data: sourceData }] = await Promise.all([
    supabase.from("staff").select("*").eq("active", true).order("full_name"),
    supabase.from("calls").select("*").or(`call_at.gte.${since},outcome.eq.scheduled`).order("call_at", { ascending: false }).limit(500),
    supabase.from("calls").select("source").not("source", "is", null).limit(500),
  ]);
  const staff = (staffData ?? []) as StaffRow[];
  const calls = (callData ?? []) as (CallRow & {})[];
  const sources = Array.from(new Set((sourceData ?? []).map((s) => String(s.source)))).sort();

  const setters = staff.filter((s) => s.role !== "closer");
  const closers = staff.filter((s) => s.role !== "setter");
  const now = Date.now();
  const canEdit = (c: CallRow) => isManager(me.role) || c.setter_id === me.id || c.closer_id === me.id;

  const needsOutcome = calls.filter((c) => c.outcome === "scheduled" && new Date(c.call_at).getTime() < now && canEdit(c));
  const upcoming = calls
    .filter((c) => c.outcome === "scheduled" && new Date(c.call_at).getTime() >= now)
    .sort((a, b) => a.call_at.localeCompare(b.call_at));
  const done = calls.filter((c) => c.outcome !== "scheduled");
  const stillOpenElsewhere = calls.filter(
    (c) => c.outcome === "scheduled" && new Date(c.call_at).getTime() < now && !canEdit(c)
  ).length;

  return (
    <>
      <PageHeader title="Calls" subtitle="Book calls, then log what happened." />
      <Notice ok={searchParams.ok} error={searchParams.error} />

      <Card className="mb-8">
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-emerald-400">＋ Book a call</summary>
          <form action={bookCall} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Lead name *">
              <input name="lead_name" required className={inputCls} />
            </Field>
            <Field label="Call date & time (UK) *">
              <input name="call_at" type="datetime-local" required defaultValue={toUkLocalInput(new Date(Date.now() + 86400000))} className={inputCls} />
            </Field>
            <Field label="Source / campaign">
              <input name="source" list="sources" placeholder="e.g. Meta – Roofers Oct" className={inputCls} />
              <datalist id="sources">
                {sources.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            {me.role !== "setter" ? (
              <Field label="Setter">
                <select name="setter_id" className={inputCls} defaultValue="">
                  <option value="">— none —</option>
                  {setters.map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
              </Field>
            ) : null}
            {me.role !== "closer" ? (
              <Field label="Closer">
                <select name="closer_id" className={inputCls} defaultValue="">
                  <option value="">— unassigned —</option>
                  {closers.map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="Email">
              <input name="lead_email" type="email" className={inputCls} />
            </Field>
            <Field label="Phone">
              <input name="lead_phone" className={inputCls} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <input name="notes" className={inputCls} />
            </Field>
            <div className="flex items-end">
              <SubmitButton>Book call</SubmitButton>
            </div>
          </form>
        </details>
      </Card>

      <SectionTitle>Waiting for an outcome ({needsOutcome.length})</SectionTitle>
      {needsOutcome.length === 0 ? (
        <p className="mb-8 text-sm text-zinc-500">All caught up 🎉</p>
      ) : (
        <div className="mb-8 space-y-3">
          {needsOutcome
            .sort((a, b) => a.call_at.localeCompare(b.call_at))
            .map((c) => (
              <Card key={c.id} className="border-amber-500/20">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white">{c.lead_name}</p>
                    <p className="text-xs text-zinc-400">
                      {fmtDateTime(c.call_at)} · Setter: {nameOf(staff, c.setter_id)} · Closer: {nameOf(staff, c.closer_id)}
                      {c.source ? ` · ${c.source}` : ""}
                    </p>
                  </div>
                  <Badge tone="warn">Needs outcome</Badge>
                </div>
                {me.role === "admin" ? <div className="mb-3"><AssignForm call={c} staff={staff} /></div> : null}
                <OutcomeForm callId={c.id} existingNotes={c.notes} />
              </Card>
            ))}
        </div>
      )}
      {stillOpenElsewhere > 0 ? (
        <p className="-mt-4 mb-8 text-xs text-zinc-500">
          {stillOpenElsewhere} other past call{stillOpenElsewhere === 1 ? "" : "s"} still waiting on someone else.
        </p>
      ) : null}

      <SectionTitle>Upcoming ({upcoming.length})</SectionTitle>
      <CallList calls={upcoming} staff={staff} empty="Nothing booked yet." admin={me.role === "admin"} />

      <div className="mt-8" />
      <SectionTitle>Recent results</SectionTitle>
      <CallList calls={done} staff={staff} empty="No results logged yet." showOutcome admin={me.role === "admin"} />
    </>
  );
}

function AssignForm({ call, staff }: { call: CallRow; staff: StaffRow[] }) {
  return (
    <details className="inline-block text-left">
      <summary className="cursor-pointer text-xs font-medium text-zinc-400 hover:text-white">Edit setter / closer</summary>
      <form action={assignCall} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="call_id" value={call.id} />
        <label className="text-xs text-zinc-500">
          Setter
          <select name="setter_id" defaultValue={call.setter_id ?? ""} className={`${inputCls} mt-1 w-36`}>
            <option value="">— none —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          Closer
          <select name="closer_id" defaultValue={call.closer_id ?? ""} className={`${inputCls} mt-1 w-36`}>
            <option value="">— none —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        </label>
        <SubmitButton>Save</SubmitButton>
      </form>
    </details>
  );
}

function CallList({
  calls,
  staff,
  empty,
  showOutcome,
  admin,
}: {
  calls: CallRow[];
  staff: StaffRow[];
  empty: string;
  showOutcome?: boolean;
  admin?: boolean;
}) {
  if (calls.length === 0) return <p className="text-sm text-zinc-500">{empty}</p>;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-xs text-zinc-500">
          <tr>
            <th className="px-5 py-3 font-medium">Lead</th>
            <th className="px-3 py-3 font-medium">When</th>
            <th className="px-3 py-3 font-medium">Setter</th>
            <th className="px-3 py-3 font-medium">Closer</th>
            <th className="px-3 py-3 font-medium">Source</th>
            <th className="px-5 py-3 font-medium">{showOutcome ? "Outcome" : ""}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {calls.map((c) => (
            <tr key={c.id}>
              <td className="px-5 py-3 text-zinc-100">
                {c.lead_name}
                {c.notes ? <p className="text-xs text-zinc-500">{c.notes}</p> : null}
              </td>
              <td className="px-3 py-3 text-zinc-300">{fmtDateTime(c.call_at)}</td>
              <td className="px-3 py-3 text-zinc-300">{nameOf(staff, c.setter_id)}</td>
              <td className="px-3 py-3 text-zinc-300">{nameOf(staff, c.closer_id)}</td>
              <td className="px-3 py-3 text-zinc-400">{c.source ?? "–"}</td>
              <td className="px-5 py-3">
                {showOutcome ? <Badge tone={toneOf(c.outcome)}>{OUTCOME_LABEL[c.outcome]}</Badge> : null}
                {showOutcome && needsRecording(c.outcome) && !c.recording_url ? (
                  <span className="ml-2 text-xs font-medium text-rose-400">no recording</span>
                ) : null}
                {c.recording_url ? (
                  <a href={c.recording_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-emerald-400 hover:text-emerald-300">
                    ▶ recording
                  </a>
                ) : null}
                {admin ? <div className="mt-1"><AssignForm call={c} staff={staff} /></div> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
