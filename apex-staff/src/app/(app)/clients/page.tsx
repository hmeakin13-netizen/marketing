import Link from "next/link";
import { requireRole } from "@/lib/staff/auth";
import { fmtDate, todayIso } from "@/lib/staff/dates";
import { money } from "@/lib/staff/metrics";
import { isPaused } from "@/lib/staff/pay";
import type { RetainerClient } from "@/lib/staff/types";
import { minimumTermEnd, type OfferTier } from "@/lib/staff/contracts";
import { SubmitButton } from "@/components/staff/SubmitButton";
import { Badge, Card, Field, Notice, PageHeader, SectionTitle, Stat, btnPrimary, inputCls } from "@/components/staff/ui";
import { markClientLeft, setClientLive, updateClientRecord } from "./actions";

export const metadata = { title: "Clients | Apex Team" };

type Profile = {
  client_name: string;
  trade: string;
  area: string | null;
  status: "live" | "onboarding" | "left";
  services: string | null;
  notes: string | null;
  meta_ad_account_id: string | null;
  meta_page_id: string | null;
  meta_form_id: string | null;
  left_on: string | null;
  tier?: string | null;
};
type Contact = { client_name: string; contact_name: string | null; ghl_contact_id: string | null };
type Retainer = RetainerClient & { client_name: string | null };

const ordinal = (d: number) => `${d}${[1, 21, 31].includes(d) ? "st" : [2, 22].includes(d) ? "nd" : [3, 23].includes(d) ? "rd" : "th"}`;

/** One card per client. The money detail (commission, pauses, payment dates) lives on Billing details. */
export default async function ClientsPage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const { supabase } = await requireRole("admin");
  const [{ data: profileData }, { data: retainerData }, { data: contactData }, { data: tierData }, { data: contractData }] = await Promise.all([
    supabase.from("ad_client_profiles").select("*").neq("trade", "agency").order("client_name"),
    supabase.from("retainer_clients").select("*"),
    supabase.from("care_contacts").select("client_name, contact_name, ghl_contact_id"),
    supabase.from("offer_tiers").select("*").order("sort"),
    supabase.from("contracts").select("client_name, status").neq("status", "ended"),
  ]);
  const tiers = (tierData ?? []) as OfferTier[];
  const tierOf = new Map(tiers.map((t) => [t.key, t]));
  const signed = new Set((contractData ?? []).filter((c) => c.status === "signed").map((c) => c.client_name as string));
  const profiles = (profileData ?? []) as Profile[];
  const today = todayIso();
  const retainerOf = new Map<string, Retainer>();
  for (const r of (retainerData ?? []) as Retainer[]) {
    if (!r.client_name) continue;
    const had = retainerOf.get(r.client_name);
    // If a client has more than one retainer row, the one still running wins.
    if (!had || (had.end_date && !r.end_date)) retainerOf.set(r.client_name, r);
  }
  const contactOf = new Map(((contactData ?? []) as Contact[]).map((c) => [c.client_name, c]));

  const live = profiles.filter((p) => p.status === "live");
  const setup = profiles.filter((p) => p.status === "onboarding");
  const left = profiles.filter((p) => p.status === "left");
  const fee = (p: Profile) => {
    const r = retainerOf.get(p.client_name);
    return r && (!r.end_date || r.end_date >= today) && !isPaused(r, today) ? Number(r.monthly_fee) : 0;
  };
  const liveIncome = live.reduce((t, p) => t + fee(p), 0);
  const setupIncome = setup.reduce((t, p) => t + fee(p), 0);

  const card = (p: Profile) => {
    const r = retainerOf.get(p.client_name);
    const c = contactOf.get(p.client_name);
    const paused = r ? isPaused(r, today) : false;
    const checks: [string, boolean][] = [
      ["Ad account", Boolean(p.meta_ad_account_id)],
      ["Page", Boolean(p.meta_page_id)],
      ["Instant form", Boolean(p.meta_form_id)],
      ["Contact", Boolean(c?.contact_name)],
      ["GoHighLevel contact", Boolean(c?.ghl_contact_id)],
      ["Retainer", Boolean(r)],
      ...(tiers.length ? ([["Contract signed", signed.has(p.client_name)]] as [string, boolean][]) : []),
    ];
    const tier = p.tier ? tierOf.get(p.tier) : undefined;
    const termEnd = tier && r ? minimumTermEnd(tier, r.start_date) : null;
    const inMinimum = Boolean(termEnd && termEnd > today);
    const missing = checks.filter(([, ok]) => !ok).length;
    return (
      <Card key={p.client_name}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-semibold text-white">
              {p.client_name}
              <Badge tone={p.status === "live" ? "good" : "info"}>{p.status === "live" ? "live" : "setting up"}</Badge>
              {tier ? <Badge>{tier.name}</Badge> : null}
              {paused ? <Badge tone="warn">payments paused</Badge> : null}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {p.trade}
              {c?.contact_name ? ` · ${c.contact_name}` : ""}
              {r ? ` · signed ${fmtDate(r.start_date)} · pays on the ${ordinal(r.billing_day)}` : ""}
              {inMinimum ? ` · minimum term until ${fmtDate(termEnd!)}` : ""}
            </p>
          </div>
          <p className="text-right text-lg font-semibold tabular-nums text-white">
            {r ? money(Number(r.monthly_fee)) : "–"}
            <span className="text-xs font-normal text-zinc-500"> /mo</span>
          </p>
        </div>

        {p.status === "onboarding" || missing > 0 ? (
          <p className="mt-3 flex flex-wrap gap-1.5">
            {checks.map(([label, ok]) => (
              <Badge key={label} tone={ok ? "good" : "warn"}>
                {ok ? "✓" : "✗"} {label}
              </Badge>
            ))}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-start gap-3">
          {p.status === "onboarding" ? (
            <form action={setClientLive}>
              <input type="hidden" name="client_name" value={p.client_name} />
              <SubmitButton pendingText="Going live…">Go live</SubmitButton>
            </form>
          ) : null}
          <details className="min-w-0 flex-1 basis-64">
            <summary className="inline-block cursor-pointer rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-white/5">Edit</summary>
            <form action={updateClientRecord} className="mt-3 grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="client_name" value={p.client_name} />
              <Field label="Trade">
                <input name="trade" defaultValue={p.trade} className={inputCls} />
              </Field>
              {tiers.length ? (
                <Field label="Tier (does not change their fee)" className="sm:col-span-2">
                  <select name="tier" defaultValue={p.tier ?? ""} className={inputCls}>
                    <option value="">— not set —</option>
                    {tiers.map((t) => (
                      <option key={t.key} value={t.key}>{t.name}</option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <Field label="Contact name">
                <input name="contact_name" defaultValue={c?.contact_name ?? ""} className={inputCls} />
              </Field>
              <Field label="GoHighLevel contact ID">
                <input name="ghl_contact_id" defaultValue={c?.ghl_contact_id ?? ""} className={inputCls} />
              </Field>
              <Field label="Ad account ID">
                <input name="meta_ad_account_id" inputMode="numeric" defaultValue={p.meta_ad_account_id ?? ""} className={inputCls} />
              </Field>
              <Field label="Page ID">
                <input name="meta_page_id" inputMode="numeric" defaultValue={p.meta_page_id ?? ""} className={inputCls} />
              </Field>
              <Field label="Instant form ID">
                <input name="meta_form_id" inputMode="numeric" defaultValue={p.meta_form_id ?? ""} className={inputCls} />
              </Field>
              <Field label="Area they cover" className="sm:col-span-3">
                <textarea name="area" rows={2} defaultValue={p.area ?? ""} className={inputCls} />
              </Field>
              <Field label="Services" className="sm:col-span-3">
                <textarea name="services" rows={2} defaultValue={p.services ?? ""} className={inputCls} />
              </Field>
              <Field label="Notes" className="sm:col-span-3">
                <textarea name="notes" rows={2} defaultValue={p.notes ?? ""} className={inputCls} />
              </Field>
              <div className="sm:col-span-3">
                <SubmitButton>Save</SubmitButton>
              </div>
            </form>
          </details>
          <details>
            <summary className="inline-block cursor-pointer rounded-full border border-rose-500/40 px-4 py-2 text-sm font-medium text-rose-300 hover:bg-rose-500/10">Mark as left</summary>
            {inMinimum ? <p className="mt-3 text-xs text-amber-300">Still inside the minimum term, which runs until {fmtDate(termEnd!)}.</p> : null}
            <form action={markClientLeft} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="client_name" value={p.client_name} />
              <Field label="Left on">
                <input name="left_on" type="date" defaultValue={today} className={inputCls} />
              </Field>
              <button className="rounded-full border border-rose-500/40 px-4 py-2 text-sm font-medium text-rose-300 hover:bg-rose-500/10">Confirm: {p.client_name} has left</button>
            </form>
          </details>
        </div>
      </Card>
    );
  };

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="One card per client. Add, edit, go live or mark as left from here."
        action={
          <Link href="/clients/new" className={btnPrimary}>
            + Add a client
          </Link>
        }
      />
      <Notice ok={searchParams.ok} error={searchParams.error} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Live now" value={money(liveIncome)} tone="good" hint={`${live.length} live client${live.length === 1 ? "" : "s"}, per month`} />
        <Stat label="Setting up" value={money(setupIncome)} hint={`${setup.length} client${setup.length === 1 ? "" : "s"}, per month once live`} />
        <Stat label="When all are live" value={money(liveIncome + setupIncome)} hint="per month" />
      </div>

      <SectionTitle>Live ({live.length})</SectionTitle>
      <div className="mb-8 space-y-3">
        {live.length === 0 ? <p className="text-sm text-zinc-500">No live clients yet.</p> : live.map(card)}
      </div>

      <SectionTitle>Setting up ({setup.length})</SectionTitle>
      <div className="mb-8 space-y-3">
        {setup.length === 0 ? <p className="text-sm text-zinc-500">Nobody in setup.</p> : setup.map(card)}
      </div>

      {left.length ? (
        <details className="mb-8">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wider text-zinc-400">Left ({left.length})</summary>
          <ul className="mt-3 space-y-1 text-sm text-zinc-500">
            {left.map((p) => (
              <li key={p.client_name}>
                {p.client_name} · {p.trade}
                {p.left_on ? ` · left ${fmtDate(p.left_on)}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Link href="/clients/billing" className="text-sm font-medium text-emerald-400 hover:text-emerald-300">
        Billing details: commission, pauses, payment dates and the territory map →
      </Link>
    </>
  );
}
