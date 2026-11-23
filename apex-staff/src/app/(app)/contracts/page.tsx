import Link from "next/link";
import { requireRole } from "@/lib/staff/auth";
import { fmtDate, todayIso } from "@/lib/staff/dates";
import { statusTone, tierSummary, type ContractRow, type OfferTier } from "@/lib/staff/contracts";
import { SubmitButton } from "@/components/staff/SubmitButton";
import { Badge, Card, Field, Notice, PageHeader, SectionTitle, inputCls } from "@/components/staff/ui";
import { createContract, saveTemplate } from "./actions";

export const metadata = { title: "Contracts | Apex Team" };

type Template = { id: number; tier: string; version: number; body: string; created_at: string };

/** Harry sees every contract; a closer sees the templates and their own clients' contracts (the database enforces it). */
export default async function ContractsPage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const { supabase, me } = await requireRole("admin", "closer");
  const admin = me.role === "admin";
  const [tiersRes, templatesRes, contractsRes, clientsRes, retainersRes] = await Promise.all([
    supabase.from("offer_tiers").select("*").order("sort"),
    supabase.from("contract_templates").select("*").order("version", { ascending: false }),
    supabase.from("contracts").select("*").order("created_at", { ascending: false }),
    supabase.from("ad_client_profiles").select("client_name, tier, status").neq("trade", "agency").neq("status", "left").order("client_name"),
    supabase.from("retainer_clients").select("client_name, closer_id").is("end_date", null),
  ]);
  if (tiersRes.error) {
    return (
      <>
        <PageHeader title="Contracts" />
        <Notice error="Contracts are not switched on yet: the database update for tiers and contracts has not been applied." />
      </>
    );
  }
  const tiers = (tiersRes.data ?? []) as OfferTier[];
  const tierName = new Map(tiers.map((t) => [t.key, t.name]));
  const latest = new Map<string, Template>();
  for (const t of (templatesRes.data ?? []) as Template[]) if (!latest.has(t.tier)) latest.set(t.tier, t);
  const contracts = (contractsRes.data ?? []) as ContractRow[];
  const closerOf = new Map((retainersRes.data ?? []).map((r) => [r.client_name as string, r.closer_id as string | null]));
  // A closer only gets their own clients in the picker (the admin's own client list is not readable to them anyway).
  const clients = (clientsRes.data ?? []).filter((c) => admin || closerOf.get(c.client_name) === me.id);
  const hasContract = new Set(contracts.filter((c) => c.status !== "ended").map((c) => c.client_name));

  return (
    <>
      <PageHeader title="Contracts" subtitle={admin ? "Create a contract from a tier template, send the signing link, and keep the signed copy here." : "Your clients' contracts and the tier templates."} />
      <Notice ok={searchParams.ok} error={searchParams.error} />

      <Card className="mb-6">
        <SectionTitle>New contract</SectionTitle>
        {clients.length === 0 ? (
          <p className="text-sm text-zinc-500">No clients to write a contract for yet. Add the client on the Clients page first.</p>
        ) : (
          <form action={createContract} className="grid gap-3 sm:grid-cols-4">
            <Field label="Client *" className="sm:col-span-2">
              <select name="client_name" required className={inputCls} defaultValue="">
                <option value="" disabled>
                  — pick —
                </option>
                {clients.map((c) => (
                  <option key={c.client_name} value={c.client_name}>
                    {c.client_name}
                    {hasContract.has(c.client_name) ? " (has a contract)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tier *" className="sm:col-span-2">
              <select name="tier" required className={inputCls} defaultValue="pro">
                {tiers.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name}: {tierSummary(t)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Business name on the contract (blank = client name)" className="sm:col-span-2">
              <input name="business_name" className={inputCls} placeholder="Oakwood Tree Care Ltd" />
            </Field>
            <Field label="Signer's name (blank = contact on file)" className="sm:col-span-2">
              <input name="contact_name" className={inputCls} />
            </Field>
            <Field label="Area (blank = the client's area on file)" className="sm:col-span-2">
              <input name="area" className={inputCls} />
            </Field>
            <Field label="Start date (blank = date signed up)">
              <input name="start_date" type="date" className={inputCls} />
            </Field>
            <Field label="Monthly fee (blank = tier price)">
              <input name="monthly_fee" inputMode="decimal" className={inputCls} />
            </Field>
            <div className="sm:col-span-4">
              <SubmitButton pendingText="Creating…">Create contract</SubmitButton>
            </div>
          </form>
        )}
      </Card>

      <SectionTitle>Contracts ({contracts.length})</SectionTitle>
      <div className="mb-8 space-y-2">
        {contracts.length === 0 ? <p className="text-sm text-zinc-500">No contracts yet.</p> : null}
        {contracts.map((c) => (
          <Link key={c.id} href={`/contracts/${c.id}`} className="block">
            <Card className="flex flex-wrap items-center justify-between gap-3 hover:border-white/20">
              <div>
                <p className="text-sm font-semibold text-white">{c.client_name}</p>
                <p className="text-xs text-zinc-500">
                  {tierName.get(c.tier) ?? c.tier} · created {fmtDate(c.created_at)}
                  {c.signed_at ? ` · signed ${fmtDate(c.signed_at)}${c.signer_name ? ` by ${c.signer_name}` : ""}` : ""}
                </p>
              </div>
              <Badge tone={statusTone(c.status)}>{c.status}</Badge>
            </Card>
          </Link>
        ))}
      </div>

      <SectionTitle>Templates</SectionTitle>
      <p className="-mt-2 mb-3 text-xs text-zinc-500">
        Words in double curly brackets, like {"{{business_name}}"} or {"{{guarantee}}"}, are filled in for each client from their details and the tier&apos;s terms.
        {admin ? " Saving makes a new version; contracts already created keep their wording." : ""}
      </p>
      <div className="space-y-3">
        {tiers.map((t) => {
          const tpl = latest.get(t.key);
          return (
            <details key={t.key} className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
              <summary className="cursor-pointer text-sm font-semibold text-white">
                {t.name} <span className="font-normal text-zinc-500">· {tierSummary(t)}{tpl ? ` · version ${tpl.version}, ${fmtDate(tpl.created_at)}` : " · no template yet"}</span>
              </summary>
              {tpl ? (
                <p className="mt-3 flex flex-wrap gap-4 text-sm">
                  <a href={`/api/contracts/preview/${t.key}`} target="_blank" rel="noreferrer" className="font-medium text-emerald-400 hover:text-emerald-300">
                    Open blank example →
                  </a>
                  <a href={`/api/contracts/preview/${t.key}?download=1`} className="font-medium text-emerald-400 hover:text-emerald-300">
                    Download as PDF
                  </a>
                  <span className="text-xs text-zinc-500">The client&apos;s details are left as blank lines, to show a prospect what they would sign.</span>
                </p>
              ) : null}
              {admin ? (
                <form action={saveTemplate} className="mt-3 space-y-3">
                  <input type="hidden" name="tier" value={t.key} />
                  <textarea name="body" rows={22} defaultValue={tpl?.body ?? ""} className={`${inputCls} font-mono text-xs`} />
                  <SubmitButton>Save new version</SubmitButton>
                </form>
              ) : (
                <pre className="mt-3 whitespace-pre-wrap text-xs text-zinc-300">{tpl?.body ?? "No template yet."}</pre>
              )}
            </details>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-zinc-600">Today is {fmtDate(`${todayIso()}T12:00:00Z`)}. Signed copies are stored privately; a link to one works for a minute and only for you.</p>
    </>
  );
}
