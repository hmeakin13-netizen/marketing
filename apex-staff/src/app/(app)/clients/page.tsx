import { requireRole } from "@/lib/staff/auth";
import { fmtDate, todayIso } from "@/lib/staff/dates";
import { money, nameOf } from "@/lib/staff/metrics";
import { fmtIsoDay, nextRetainerDate, payoutDateFor } from "@/lib/staff/pay";
import type { Territory } from "@/lib/staff/geo";
import type { CloseRow, PayRow, RetainerClient, StaffRow } from "@/lib/staff/types";
import { addClient, endClient, saveClientLocation, reinstateClient, updateClient } from "../../actions";
import { SubmitButton } from "@/components/staff/SubmitButton";
import { Badge, Card, Field, Notice, PageHeader, SectionTitle, Stat, inputCls } from "@/components/staff/ui";

export const metadata = { title: "Clients | Apex Team" };

export default async function ClientsPage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const { supabase } = await requireRole("admin");
  const [{ data: clientData }, { data: staffData }, { data: payData }, { data: dealData }, { data: terrData }] = await Promise.all([
    supabase.from("retainer_clients").select("*").order("created_at", { ascending: false }),
    supabase.from("staff").select("*").eq("active", true).order("full_name"),
    supabase.from("staff_pay").select("*"),
    supabase.from("closes").select("id, closed_at, calls(lead_name)").order("closed_at", { ascending: false }).limit(100),
    supabase.from("territories").select("*"),
  ]);
  const territories = new Map(((terrData ?? []) as Territory[]).map((t) => [t.client_id, t]));
  const clients = (clientData ?? []) as RetainerClient[];
  const staff = (staffData ?? []) as StaffRow[];
  const pay = new Map(((payData ?? []) as PayRow[]).map((p) => [p.staff_id, p]));
  const deals = (dealData ?? []) as unknown as (Pick<CloseRow, "id" | "closed_at"> & { calls: { lead_name: string } | null })[];

  const today = todayIso();
  const isActive = (c: RetainerClient) => !c.end_date || c.end_date >= today;
  const active = clients.filter(isActive);
  const left = clients.filter((c) => !isActive(c));
  const closers = staff.filter((s) => s.role !== "setter");
  const setters = staff.filter((s) => s.role === "setter" || s.role === "manager");

  const sharePctOf = (c: RetainerClient) => (c.closer_share_pct != null ? Number(c.closer_share_pct) : Number(pay.get(c.closer_id ?? "")?.retainer_share_pct ?? 0));
  const shareOf = (c: RetainerClient) => (Number(c.monthly_fee) * sharePctOf(c)) / 100;
  const mrr = active.reduce((t, c) => t + Number(c.monthly_fee), 0);
  const owedPerMonth = active.reduce((t, c) => t + shareOf(c), 0);

  // Per-closer summary
  const byCloser = new Map<string, { n: number; fee: number; share: number }>();
  for (const c of active) {
    const k = c.closer_id ?? "none";
    const row = byCloser.get(k) ?? { n: 0, fee: 0, share: 0 };
    row.n++;
    row.fee += Number(c.monthly_fee);
    row.share += shareOf(c);
    byCloser.set(k, row);
  }

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Everyone on a monthly retainer, who signed them, and what that earns. End a client when they leave and their closer's share stops."
      />
      <Notice ok={searchParams.ok} error={searchParams.error} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active clients" value={String(active.length)} />
        <Stat label="Monthly retainer income" value={money(mrr)} tone="good" />
        <Stat label="Owed to closers / month" value={money(owedPerMonth)} tone="warn" />
        <Stat label="Left" value={String(left.length)} />
      </div>

      {byCloser.size > 0 ? (
        <Card className="mb-8">
          <SectionTitle>By closer</SectionTitle>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="pb-2 font-medium">Closer</th>
                <th className="pb-2 text-right font-medium">Active clients</th>
                <th className="pb-2 text-right font-medium">Their retainers</th>
                <th className="pb-2 text-right font-medium">Earns / month</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {Array.from(byCloser.entries()).map(([id, r]) => (
                <tr key={id}>
                  <td className="py-2 text-zinc-200">{id === "none" ? "Unassigned" : nameOf(staff, id)}</td>
                  <td className="py-2 text-right tabular-nums">{r.n}</td>
                  <td className="py-2 text-right tabular-nums">{money(r.fee)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums text-emerald-400">{money(r.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      <Card className="mb-8">
        <SectionTitle>Add a client</SectionTitle>
        <form action={addClient} className="grid gap-3 sm:grid-cols-4">
          <Field label="From a closed deal (optional — fills in the rest)" className="sm:col-span-2">
            <select name="close_id" className={inputCls} defaultValue="">
              <option value="">— none —</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.calls?.lead_name ?? "Deal"} · {fmtDate(d.closed_at)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Client name">
            <input name="name" className={inputCls} placeholder="Sam McCann" />
          </Field>
          <Field label="Setup fee (£, one-time)">
            <input name="setup_fee" inputMode="decimal" className={inputCls} placeholder="1500" />
          </Field>
          <Field label="Monthly retainer (£) *">
            <input name="monthly_fee" inputMode="decimal" required className={inputCls} placeholder="1000" />
          </Field>
          <Field label="Closed by">
            <select name="closer_id" className={inputCls} defaultValue="">
              <option value="">— pick —</option>
              {closers.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Set by">
            <select name="setter_id" className={inputCls} defaultValue="">
              <option value="">— none —</option>
              {setters.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Date signed">
            <input name="start_date" type="date" className={inputCls} />
          </Field>
          <Field label="Pays on day of month (blank = signing day)">
            <input name="billing_day" inputMode="numeric" className={inputCls} placeholder="9" />
          </Field>
          <Field label="Client postcode (puts them on the territory map)">
            <input name="postcode" className={inputCls} placeholder="NG1 5FS" />
          </Field>
          <Field label="Exclusive radius (km)">
            <input name="radius_km" inputMode="decimal" className={inputCls} placeholder="15" />
          </Field>
          <div className="flex items-end sm:col-span-4">
            <SubmitButton>Add client</SubmitButton>
          </div>
        </form>
      </Card>

      <SectionTitle>Active ({active.length})</SectionTitle>
      <div className="mb-8 space-y-3">
        {active.length === 0 ? <p className="text-sm text-zinc-500">No clients yet. Add your first above.</p> : null}
        {active.map((c) => {
          const cfg = pay.get(c.closer_id ?? "");
          const next = nextRetainerDate(c);
          return (
            <Card key={c.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{c.name}</p>
                  <p className="text-xs text-zinc-400">
                    Closed by {nameOf(staff, c.closer_id)} · set by {nameOf(staff, c.setter_id)} · signed {fmtDate(c.start_date)} ·
                    pays on the {c.billing_day}
                    {[1, 21, 31].includes(c.billing_day) ? "st" : [2, 22].includes(c.billing_day) ? "nd" : [3, 23].includes(c.billing_day) ? "rd" : "th"}
                  </p>
                  <p className="mt-1 text-sm text-zinc-300">
                    {nameOf(staff, c.closer_id)} earns{" "}
                    <b className="text-emerald-400">{money(shareOf(c))}</b> a month ({sharePctOf(c)}%{c.closer_share_pct != null ? " — set for this client" : ""} of {money(Number(c.monthly_fee))})
                    {next ? (
                      <>
                        {" "}— next due {fmtIsoDay(next)}, paid on{" "}
                        <b className="text-zinc-100">{fmtIsoDay(payoutDateFor(next, cfg?.pay_schedule ?? "monthly"))}</b>
                      </>
                    ) : null}
                  </p>
                  {sharePctOf(c) === 0 ? (
                    <p className="mt-1 text-xs text-amber-300">
                      No retainer share set for {nameOf(staff, c.closer_id)} yet. Set it on the Pay page.
                    </p>
                  ) : null}
                </div>
                <p className="text-right text-lg font-semibold tabular-nums text-white">
                  {money(Number(c.monthly_fee))}
                  <span className="text-xs font-normal text-zinc-500"> /mo</span>
                  {Number(c.setup_fee) > 0 ? (
                    <span className="block text-xs font-normal text-zinc-500">+ {money(Number(c.setup_fee))} setup (one-time)</span>
                  ) : null}
                </p>
              </div>
              <details className="mt-3 rounded-xl border border-white/10 p-3">
                <summary className="cursor-pointer text-sm font-medium text-zinc-300">Edit or end this client</summary>
                <form action={updateClient} className="mt-3 grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
                  <input type="hidden" name="client_id" value={c.id} />
                  <Field label="Setup fee (£)">
                    <input name="setup_fee" inputMode="decimal" defaultValue={String(c.setup_fee)} className={inputCls} />
                  </Field>
                  <Field label="Monthly retainer (£)">
                    <input name="monthly_fee" inputMode="decimal" defaultValue={String(c.monthly_fee)} className={inputCls} />
                  </Field>
                  <Field label="Pays on day">
                    <input name="billing_day" inputMode="numeric" defaultValue={String(c.billing_day)} className={inputCls} />
                  </Field>
                  <Field label="Closer's share % (blank = usual)">
                    <input name="closer_share_pct" inputMode="decimal" defaultValue={c.closer_share_pct != null ? String(c.closer_share_pct) : ""} className={inputCls} placeholder={String(cfg?.retainer_share_pct ?? 0)} />
                  </Field>
                  <Field label="Closed by">
                    <select name="closer_id" defaultValue={c.closer_id ?? ""} className={inputCls}>
                      <option value="">—</option>
                      {closers.map((s) => (
                        <option key={s.id} value={s.id}>{s.full_name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Set by">
                    <select name="setter_id" defaultValue={c.setter_id ?? ""} className={inputCls}>
                      <option value="">—</option>
                      {setters.map((s) => (
                        <option key={s.id} value={s.id}>{s.full_name}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="flex items-end">
                    <SubmitButton>Save</SubmitButton>
                  </div>
                </form>
                <form action={saveClientLocation} className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/10 pt-3">
                  <input type="hidden" name="client_id" value={c.id} />
                  <Field label="Client postcode (blocks the area on the territory map)">
                    <input name="postcode" defaultValue={territories.get(c.id)?.postcode ?? ""} className={inputCls} placeholder="NG1 5FS" />
                  </Field>
                  <Field label="Exclusive radius (km)">
                    <input name="radius_km" inputMode="decimal" defaultValue={String(territories.get(c.id)?.radius_km ?? 15)} className={inputCls} />
                  </Field>
                  <SubmitButton>Save location</SubmitButton>
                </form>
                <form action={endClient} className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/10 pt-3">
                  <input type="hidden" name="client_id" value={c.id} />
                  <Field label="Client left on">
                    <input name="end_date" type="date" defaultValue={today} className={inputCls} />
                  </Field>
                  <button className="rounded-full border border-rose-500/40 px-4 py-2 text-sm font-medium text-rose-300 hover:bg-rose-500/10">
                    {c.name} has left — stop their retainer
                  </button>
                </form>
              </details>
            </Card>
          );
        })}
      </div>

      {left.length > 0 ? (
        <>
          <SectionTitle>Left ({left.length})</SectionTitle>
          <div className="space-y-2">
            {left.map((c) => (
              <Card key={c.id} className="flex flex-wrap items-center justify-between gap-3 opacity-70">
                <div>
                  <p className="text-sm font-medium text-white">{c.name}</p>
                  <p className="text-xs text-zinc-500">
                    {nameOf(staff, c.closer_id)} · {money(Number(c.monthly_fee))}/mo · signed {fmtDate(c.start_date)} · left{" "}
                    {fmtDate(c.end_date!)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge>left</Badge>
                  <form action={reinstateClient}>
                    <input type="hidden" name="client_id" value={c.id} />
                    <button className="text-xs text-zinc-400 hover:text-white">Reinstate</button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
