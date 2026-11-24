import Link from "next/link";
import { requireRole } from "@/lib/staff/auth";
import { todayIso } from "@/lib/staff/dates";
import type { StaffRow } from "@/lib/staff/types";
import { tierSummary, type OfferTier } from "@/lib/staff/contracts";
import { SubmitButton } from "@/components/staff/SubmitButton";
import { Card, Field, Notice, PageHeader, SectionTitle, inputCls } from "@/components/staff/ui";
import { addClientEverywhere } from "../actions";

export const metadata = { title: "Add a client | Apex Team" };

export default async function NewClientPage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const { supabase } = await requireRole("admin");
  const [{ data }, { data: tierData }] = await Promise.all([
    supabase.from("staff").select("*").eq("active", true).order("full_name"),
    supabase.from("offer_tiers").select("*").order("sort"),
  ]);
  const tiers = (tierData ?? []) as OfferTier[];
  const staff = (data ?? []) as StaffRow[];
  const closers = staff.filter((s) => s.role !== "setter");
  const setters = staff.filter((s) => s.role === "setter" || s.role === "manager");

  return (
    <>
      <PageHeader
        title="Add a client"
        subtitle="Fill this in once. It sets up the client's profile, retainer and care contact, and tells the team."
        action={
          <Link href="/clients" className="text-sm font-medium text-emerald-400 hover:text-emerald-300">
            ← Back to clients
          </Link>
        }
      />
      <Notice ok={searchParams.ok} error={searchParams.error} />

      <form action={addClientEverywhere} className="space-y-6">
        <Card>
          <SectionTitle>The client</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name *">
              <input name="name" required className={inputCls} placeholder="Oakwood Tree Care" />
            </Field>
            <Field label="Trade *">
              <input name="trade" required list="trades" className={inputCls} placeholder="Tree surgeon" />
              <datalist id="trades">
                <option value="Tree surgeon" />
                <option value="Roofing" />
                <option value="Landscaping" />
              </datalist>
            </Field>
            <Field label="Area they cover (towns to include and to leave out)" className="sm:col-span-2">
              <textarea name="area" rows={2} className={inputCls} placeholder="Base LS1, Leeds. Include: Wakefield, Harrogate. Exclude: York." />
            </Field>
            <Field label="Services they want work for" className="sm:col-span-2">
              <textarea name="services" rows={2} className={inputCls} placeholder="Tree felling, crown reduction, stump grinding" />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea name="notes" rows={2} className={inputCls} placeholder="Anything the team should know" />
            </Field>
          </div>
        </Card>

        <Card>
          <SectionTitle>Meta (leave blank if you do not have them yet)</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Ad account ID">
              <input name="meta_ad_account_id" inputMode="numeric" className={inputCls} placeholder="1726310475597012" />
            </Field>
            <Field label="Page ID">
              <input name="meta_page_id" inputMode="numeric" className={inputCls} />
            </Field>
            <Field label="Instant form ID">
              <input name="meta_form_id" inputMode="numeric" className={inputCls} />
            </Field>
          </div>
          <p className="mt-3 text-xs text-zinc-500">With an ad account ID, the ads monitor starts watching the account on its next run.</p>
        </Card>

        <Card>
          <SectionTitle>Tier and retainer</SectionTitle>
          <div className="mb-4 space-y-2">
            {tiers.map((t) => (
              <label key={t.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 p-3 hover:border-white/20">
                <input type="radio" name="tier" value={t.key} defaultChecked={t.key === "pro"} required className="mt-1 accent-emerald-500" />
                <span>
                  <span className="block text-sm font-semibold text-white">{t.name}</span>
                  <span className="block text-xs text-zinc-400">{tierSummary(t)}{t.extras ? ` · ${t.extras}` : ""}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Monthly fee (£, blank = tier price)" className="sm:col-span-2">
              <input name="monthly_fee" inputMode="decimal" className={inputCls} />
            </Field>
            <Field label="Start date">
              <input name="start_date" type="date" defaultValue={todayIso()} className={inputCls} />
            </Field>
            <Field label="Billing day (blank = start day)">
              <input name="billing_day" inputMode="numeric" className={inputCls} placeholder="1 to 31" />
            </Field>
            <Field label="Closed by" className="sm:col-span-2">
              <select name="closer_id" className={inputCls} defaultValue="">
                <option value="">— none —</option>
                {closers.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </Field>
            <Field label="Set by" className="sm:col-span-2">
              <select name="setter_id" className={inputCls} defaultValue="">
                <option value="">— none —</option>
                {setters.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </Field>
            <Field label="Postcode (blocks the area on the territory map)" className="sm:col-span-2">
              <input name="postcode" className={inputCls} placeholder="NG1 5FS" />
            </Field>
            <Field label="Exclusive radius (km, blank = the tier's; Growth has none)" className="sm:col-span-2">
              <input name="radius_km" inputMode="decimal" className={inputCls} />
            </Field>
          </div>
        </Card>

        <Card>
          <SectionTitle>Contact</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contact name">
              <input name="contact_name" className={inputCls} placeholder="Jamie" />
            </Field>
            <Field label="GoHighLevel contact ID">
              <input name="ghl_contact_id" className={inputCls} />
            </Field>
          </div>
        </Card>

        <SubmitButton pendingText="Adding…">Add client everywhere</SubmitButton>
      </form>
    </>
  );
}
