import { requireRole } from "@/lib/staff/auth";
import { ROLE_LABEL, type StaffRow } from "@/lib/staff/types";
import { addPerson, giveAccess, updatePerson } from "../../actions";
import { SubmitButton } from "@/components/staff/SubmitButton";
import { Badge, Card, Field, Notice, PageHeader, SectionTitle, inputCls } from "@/components/staff/ui";

export const metadata = { title: "Team | Apex Team" };

export default async function TeamPage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const { supabase, me } = await requireRole("admin");
  const { data } = await supabase.from("staff").select("*").order("active", { ascending: false }).order("full_name");
  const staff = (data ?? []) as StaffRow[];
  const active = staff.filter((s) => s.active);
  const gone = staff.filter((s) => !s.active);

  return (
    <>
      <PageHeader title="Team" subtitle="Add people, change roles, and deactivate leavers. History is always kept." />
      <Notice ok={searchParams.ok} error={searchParams.error} />

      <Card className="mb-8">
        <SectionTitle>Add a person</SectionTitle>
        <form action={addPerson} className="grid gap-3 sm:grid-cols-4">
          <Field label="Full name">
            <input name="full_name" required className={inputCls} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" required className={inputCls} />
          </Field>
          <Field label="Role">
            <select name="role" defaultValue="setter" className={inputCls}>
              <option value="setter">Setter</option>
              <option value="closer">Closer</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <div className="flex items-end">
            <SubmitButton pendingText="Adding…">Add person</SubmitButton>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300 sm:col-span-4">
            <input type="checkbox" name="give_login" defaultChecked className="accent-emerald-500" />
            Give login now (untick to add them without access — you can switch it on later)
          </label>
        </form>
        <p className="mt-3 text-xs text-zinc-500">
          They log in on the team login page with that email — no password, just an emailed link.
        </p>
      </Card>

      <SectionTitle>Active ({active.length})</SectionTitle>
      <div className="mb-8 space-y-3">
        {active.map((s) => (
          <Card key={s.id}>
            <form action={updatePerson} className="grid gap-3 sm:grid-cols-[1.2fr_1.4fr_1fr_1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="staff_id" value={s.id} />
              <Field label="Name">
                <input name="full_name" defaultValue={s.full_name} className={inputCls} />
              </Field>
              <Field label="Email (login)">
                <input value={s.email} disabled className={`${inputCls} opacity-60`} readOnly />
              </Field>
              <Field label="Role">
                <select name="role" defaultValue={s.role} disabled={s.id === me.id} className={inputCls}>
                  {(["setter", "closer", "manager", "admin"] as const).map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
                {s.id === me.id ? <input type="hidden" name="role" value={s.role} /> : null}
              </Field>
              <Field label="Reports to">
                <select name="manager_id" defaultValue={s.manager_id ?? ""} className={inputCls}>
                  <option value="">— nobody —</option>
                  {active
                    .filter((m) => m.id !== s.id && (m.role === "manager" || m.role === "admin"))
                    .map((m) => (
                      <option key={m.id} value={m.id}>{m.full_name}</option>
                    ))}
                </select>
              </Field>
              <Field label="Calendly email">
                <input name="calendly_email" defaultValue={s.calendly_email ?? ""} placeholder="for later sync" className={inputCls} />
              </Field>
              <div className="flex gap-2">
                <SubmitButton>Save</SubmitButton>
              </div>
            </form>
            {!s.login_enabled ? (
              <form action={giveAccess} className="mt-3 flex items-center gap-3">
                <input type="hidden" name="staff_id" value={s.id} />
                <Badge tone="warn">No login yet</Badge>
                <button className="text-xs font-medium text-emerald-400 hover:text-emerald-300">Give access</button>
              </form>
            ) : null}
            {s.id !== me.id ? (
              <form action={updatePerson} className="mt-3">
                <input type="hidden" name="staff_id" value={s.id} />
                <input type="hidden" name="intent" value="deactivate" />
                <button className="text-xs font-medium text-rose-400 hover:text-rose-300">
                  Deactivate {s.full_name.split(" ")[0]} (keeps their history)
                </button>
              </form>
            ) : (
              <Badge tone="info">That&apos;s you</Badge>
            )}
          </Card>
        ))}
      </div>

      {gone.length > 0 ? (
        <>
          <SectionTitle>Deactivated ({gone.length})</SectionTitle>
          <div className="space-y-2">
            {gone.map((s) => (
              <Card key={s.id} className="flex flex-wrap items-center justify-between gap-3 opacity-70">
                <div>
                  <p className="text-sm font-medium text-white">{s.full_name}</p>
                  <p className="text-xs text-zinc-500">{ROLE_LABEL[s.role]} · {s.email}</p>
                </div>
                <form action={updatePerson}>
                  <input type="hidden" name="staff_id" value={s.id} />
                  <input type="hidden" name="intent" value="reactivate" />
                  <button className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-zinc-200 hover:bg-white/5">Reactivate</button>
                </form>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
