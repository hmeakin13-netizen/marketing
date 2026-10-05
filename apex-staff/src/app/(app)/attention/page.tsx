import Link from "next/link";
import { requireStaff, isManager } from "@/lib/staff/auth";
import { loadFlags } from "@/lib/staff/data";
import { FLAG_LABEL, RULES, type Flag } from "@/lib/staff/flags";
import { nameOf } from "@/lib/staff/metrics";
import { addRecording, addCallNotes, logChase, markFollowUpLost } from "../../actions";
import { SubmitButton } from "@/components/staff/SubmitButton";
import { Badge, Card, Field, Notice, PageHeader, SectionTitle, Stat, inputCls } from "@/components/staff/ui";

export const metadata = { title: "Needs attention | Apex Team" };

const tone = { high: "bad", medium: "warn", low: "default" } as const;

export default async function AttentionPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string; who?: string };
}) {
  const { supabase, me } = await requireStaff();
  const { staff, flags } = await loadFlags(supabase);
  const manager = isManager(me.role);

  // Everyone sees their own flags; managers/admin can look at anyone's.
  const selected = manager ? searchParams.who ?? "all" : me.id;
  const visible = flags.filter((f) => selected === "all" || f.ownerId === selected || (selected === "unassigned" && !f.ownerId));
  const owners = staff.filter((s) => s.active && (s.role === "closer" || s.role === "setter" || s.role === "manager"));
  const countFor = (id: string | null) => flags.filter((f) => f.ownerId === id);
  const high = visible.filter((f) => f.severity === "high").length;

  return (
    <>
      <PageHeader
        title="Needs attention"
        subtitle="Where the ball's been dropped: unchased balances, missing outcomes, cold follow-ups."
      />
      <Notice ok={searchParams.ok} error={searchParams.error} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Open flags" value={String(visible.length)} tone={visible.length === 0 ? "good" : "default"} />
        <Stat label="High priority" value={String(high)} tone={high > 0 ? "bad" : "good"} />
        <Stat
          label={manager ? "Team flags" : "Team flags (all)"}
          value={String(flags.length)}
          hint={manager ? undefined : "You see your own list below"}
        />
      </div>

      {manager ? (
        <Card className="mb-6">
          <SectionTitle>By person</SectionTitle>
          <div className="flex flex-wrap gap-2">
            <Pill href="/attention" active={selected === "all"} label={`Everyone (${flags.length})`} />
            {owners.map((o) => {
              const n = countFor(o.id);
              const hi = n.filter((f) => f.severity === "high").length;
              return (
                <Pill
                  key={o.id}
                  href={`/attention?who=${o.id}`}
                  active={selected === o.id}
                  label={`${o.full_name} (${n.length}${hi ? ` · ${hi} high` : ""})`}
                  danger={hi > 0}
                />
              );
            })}
            {countFor(null).length > 0 ? (
              <Pill href="/attention?who=unassigned" active={selected === "unassigned"} label={`Unassigned (${countFor(null).length})`} />
            ) : null}
          </div>
        </Card>
      ) : null}

      {visible.length === 0 ? (
        <Card className="text-center">
          <p className="text-2xl">🎉</p>
          <p className="mt-2 font-semibold text-white">Nothing dropped.</p>
          <p className="mt-1 text-sm text-zinc-400">Everything that needs chasing has been chased.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((f) => (
            <FlagCard key={f.id} f={f} owner={nameOf(staff, f.ownerId)} showOwner={manager && selected === "all"} />
          ))}
        </div>
      )}

      <p className="mt-8 text-xs text-zinc-600">
        Rules: balances chased every {RULES.balanceChaseEveryDays} days (daily once overdue); outcomes expected within{" "}
        {RULES.missingOutcomeAfterHours}h of a call; no-shows followed up within {RULES.noShowChaseWithinHours}h; follow-ups
        every {RULES.followUpEveryDays} days.
      </p>
    </>
  );
}

function Pill({ href, label, active, danger }: { href: string; label: string; active: boolean; danger?: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        active
          ? "border-emerald-400 bg-emerald-500/15 text-emerald-300"
          : danger
            ? "border-rose-500/30 text-rose-300 hover:bg-white/5"
            : "border-white/10 text-zinc-300 hover:bg-white/5"
      }`}
    >
      {label}
    </Link>
  );
}

function FlagCard({ f, owner, showOwner }: { f: Flag; owner: string; showOwner: boolean }) {
  const chaseable = f.kind !== "no_due_date" && f.kind !== "missing_outcome" && f.kind !== "missing_recording" && f.kind !== "missing_notes" && f.kind !== "unconfirmed_call" && f.kind !== "contract_unsigned";
  return (
    <Card className={f.severity === "high" ? "border-rose-500/30" : f.severity === "medium" ? "border-amber-500/20" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-white">{f.title}</p>
          <p className="mt-1 text-sm text-zinc-400">{f.detail}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={tone[f.severity]}>{FLAG_LABEL[f.kind]}</Badge>
          {showOwner ? <span className="text-xs text-zinc-500">Owner: {owner}</span> : null}
        </div>
      </div>

      {f.kind === "missing_recording" && f.callId ? (
        <form action={addRecording} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="call_id" value={f.callId} />
          <Field label="Fathom recording link" className="min-w-[16rem] flex-1">
            <input name="recording_url" type="url" required placeholder="https://fathom.video/share/…" className={inputCls} />
          </Field>
          <SubmitButton>Add recording</SubmitButton>
        </form>
      ) : null}

      {f.kind === "missing_notes" && f.callId ? (
        <form action={addCallNotes} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="call_id" value={f.callId} />
          <Field label="Call notes" className="min-w-[16rem] flex-1">
            <textarea name="notes" required rows={3} placeholder="What was discussed, what they decided, next step…" className={inputCls} />
          </Field>
          <SubmitButton>Save notes</SubmitButton>
        </form>
      ) : null}

      {chaseable ? (
        <details className="mt-3 rounded-xl border border-white/10 p-3">
          <summary className="cursor-pointer text-sm font-medium text-emerald-400">✓ Log a chase</summary>
          <form action={logChase} className="mt-3 grid gap-3 sm:grid-cols-4">
            {f.closeId ? <input type="hidden" name="close_id" value={f.closeId} /> : null}
            {f.callId ? <input type="hidden" name="call_id" value={f.callId} /> : null}
            <Field label="What did you do?" className="sm:col-span-2">
              <input name="note" required placeholder="Called — says paying Friday" className={inputCls} />
            </Field>
            {f.closeId ? (
              <Field label="New payment date (optional)">
                <input name="next_payment_due" type="date" className={inputCls} />
              </Field>
            ) : null}
            <div className="flex items-end">
              <SubmitButton>Log chase</SubmitButton>
            </div>
          </form>
          {f.kind === "follow_up_stale" && f.callId ? (
            <form action={markFollowUpLost} className="mt-3">
              <input type="hidden" name="call_id" value={f.callId} />
              <button className="text-xs font-medium text-zinc-400 hover:text-white">Stop chasing — mark as lost</button>
            </form>
          ) : null}
        </details>
      ) : (
        <div className="mt-3">
          <Link
            href={f.kind === "missing_outcome" || f.kind === "unconfirmed_call" ? "/calls" : "/deals"}
            className="text-sm font-medium text-emerald-400 hover:text-emerald-300"
          >
            {f.kind === "unconfirmed_call" ? "Confirm the call →" : f.kind === "missing_outcome" ? "Log the outcome →" : f.kind === "contract_unsigned" ? "Mark contract signed →" : "Set the due date →"}
          </Link>
        </div>
      )}
    </Card>
  );
}
