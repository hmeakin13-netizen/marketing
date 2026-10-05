import { requireRole } from "@/lib/staff/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfig, getStored } from "@/lib/calendly";
import { fmtDateTime } from "@/lib/staff/dates";
import type { ShiftRow, StaffRow } from "@/lib/staff/types";
import { connectCalendly, saveShift, syncCalendly } from "../../actions";
import { SubmitButton } from "@/components/staff/SubmitButton";
import { Badge, Card, Field, Notice, PageHeader, SectionTitle, inputCls } from "@/components/staff/ui";

export const metadata = { title: "Settings | Apex Team" };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function SettingsPage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const { supabase } = await requireRole("admin");
  const admin = createAdminClient();
  const config = await getConfig(admin);
  const hasSavedToken = Boolean((await getStored(admin))?.token);
  const [{ data: staffData }, { data: shiftData }] = await Promise.all([
    supabase.from("staff").select("*").eq("active", true).order("full_name"),
    supabase.from("closer_shifts").select("*"),
  ]);
  const closers = ((staffData ?? []) as StaffRow[]).filter((s) => s.role === "closer" || s.role === "manager" || s.role === "admin");
  const shifts = new Map(((shiftData ?? []) as ShiftRow[]).map((s) => [s.staff_id, s]));

  return (
    <>
      <PageHeader title="Settings" subtitle="Connect Calendly and set who takes calls when." />
      <Notice ok={searchParams.ok} error={searchParams.error} />

      <SectionTitle>Calendly</SectionTitle>
      <Card className="mb-8">
        {config ? (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Badge tone="good">Connected</Badge>
            <span className="text-sm text-zinc-400">
              since {fmtDateTime(config.connected_at)}
              {config.last_sync_at ? ` · last sync ${fmtDateTime(config.last_sync_at)} (${config.last_sync_count ?? 0} bookings)` : ""}
            </span>
            <form action={syncCalendly} className="ml-auto">
              <SubmitButton pendingText="Syncing…">Sync now</SubmitButton>
            </form>
          </div>
        ) : (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Badge tone="warn">Not connected</Badge>
            {hasSavedToken ? (
              <>
                <span className="text-sm text-zinc-400">A Calendly token is saved — one click to finish.</span>
                <form action={connectCalendly} className="ml-auto">
                  <SubmitButton pendingText="Connecting…">Connect Calendly</SubmitButton>
                </form>
              </>
            ) : null}
          </div>
        )}
        <p className="mb-4 text-sm text-zinc-400">
          Once connected, every booking and cancellation on your Calendly arrives here automatically, with the lead,
          the time, the source and the closer filled in. Requires a Calendly Standard plan or above.
        </p>
        <details className="rounded-xl border border-white/10 p-3" open={!config}>
          <summary className="cursor-pointer text-sm font-medium text-emerald-400">
            {config ? "Reconnect Calendly" : "Connect Calendly"}
          </summary>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-400">
            <li>
              In Calendly go to <b className="text-zinc-200">Integrations → API &amp; Webhooks</b> and click{" "}
              <b className="text-zinc-200">Generate new token</b>.
            </li>
            <li>Name it &ldquo;Apex portal&rdquo; and copy the token (it&apos;s only shown once).</li>
            <li>Paste it below. It&apos;s stored securely on the server and never shown again.</li>
          </ol>
          <form action={connectCalendly} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Calendly personal access token">
              <input name="token" type="password" required autoComplete="off" className={inputCls} placeholder="eyJraWQiOi…" />
            </Field>
            <SubmitButton pendingText="Connecting…">Connect</SubmitButton>
          </form>
        </details>
      </Card>

      <SectionTitle>Who takes calls when</SectionTitle>
      <p className="-mt-1 mb-3 text-sm text-zinc-400">
        Everyone books the same Calendly event, so the closer is picked from the time of the call (UK time). Set each
        closer&apos;s shift here.
      </p>
      <div className="space-y-3">
        {closers.length === 0 ? <p className="text-sm text-zinc-500">Add your closers on the Team page first.</p> : null}
        {closers.map((c) => {
          const s = shifts.get(c.id);
          return (
            <Card key={c.id}>
              <form action={saveShift} className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end">
                <input type="hidden" name="staff_id" value={c.id} />
                <div>
                  <p className="font-semibold text-white">{c.full_name}</p>
                  <p className="text-xs capitalize text-zinc-500">{c.role}</p>
                </div>
                <Field label="From">
                  <input name="start_time" type="time" defaultValue={s?.start_time.slice(0, 5) ?? ""} className={inputCls} />
                </Field>
                <Field label="Until">
                  <input name="end_time" type="time" defaultValue={s?.end_time.slice(0, 5) ?? ""} className={inputCls} />
                </Field>
                <SubmitButton>Save</SubmitButton>
                <div className="flex flex-wrap gap-3 sm:col-span-4">
                  {DAYS.map((d, i) => (
                    <label key={d} className="flex items-center gap-1.5 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        name={`d${i + 1}`}
                        defaultChecked={s ? s.days.includes(i + 1) : i < 5}
                        className="accent-emerald-500"
                      />
                      {d}
                    </label>
                  ))}
                </div>
              </form>
              {s ? (
                <form action={saveShift} className="mt-2">
                  <input type="hidden" name="staff_id" value={c.id} />
                  <input type="hidden" name="clear" value="1" />
                  <button className="text-xs text-zinc-500 hover:text-zinc-300">Clear shift</button>
                </form>
              ) : null}
            </Card>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-zinc-600">
        Tip: tag a setter&apos;s booking link with <code>?utm_content=kyle</code> and the booking is credited to them
        automatically. Add <code>utm_campaign</code> to track which ad it came from.
      </p>
    </>
  );
}
