import { requireRole } from "@/lib/staff/auth";
import { AutoRefresh } from "@/components/staff/AutoRefresh";
import { CopyButton } from "@/components/staff/CopyButton";
import { Badge, Card, Field, Notice, PageHeader, SectionTitle, btnGhost, btnPrimary, inputCls } from "@/components/staff/ui";
import { logOutcome, saveContact, setDraftStatus } from "./actions";

export const metadata = { title: "Client care | Apex Team" };
export const dynamic = "force-dynamic";

type Draft = { id: number; client_name: string; channel: "whatsapp" | "ghl"; kind: string; body: string; status: string; written_by: string | null; created_at: string; sent_at: string | null };
type Contact = { client_name: string; contact_name: string | null; whatsapp: string | null; ghl_contact_id: string | null };
type Outcome = { id: number; client_name: string; week_start: string; leads_received: number | null; booked: number | null; won: number | null; won_value: number | null; notes: string | null; source: string; created_at: string };

const KIND: Record<string, string> = { checkin: "Weekly check-in", report: "Weekly report", video: "Clip request", other: "Message" };

function lastMonday() {
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day - 7);
  return d.toISOString().slice(0, 10);
}

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export default async function CarePage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const { supabase } = await requireRole("admin", "manager");
  const [{ data: drafts }, { data: contacts }, { data: outcomes }] = await Promise.all([
    supabase.from("care_drafts").select("*").order("created_at", { ascending: false }).limit(60).returns<Draft[]>(),
    supabase.from("care_contacts").select("*").order("client_name").returns<Contact[]>(),
    supabase.from("client_outcomes").select("*").order("week_start", { ascending: false }).order("created_at", { ascending: false }).limit(40).returns<Outcome[]>(),
  ]);
  const byClient = Object.fromEntries((contacts ?? []).map((c) => [c.client_name, c]));
  const waiting = (drafts ?? []).filter((d) => d.status === "draft");
  const queued = (drafts ?? []).filter((d) => d.status === "approved");
  const done = (drafts ?? []).filter((d) => d.status !== "draft" && d.status !== "approved").slice(0, 8);
  const clients = (contacts ?? []).map((c) => c.client_name);

  return (
    <div className="space-y-8">
      <AutoRefresh seconds={60} />
      <PageHeader title="Client care" subtitle="Routine check-ins and clip requests go out by SMS on their own (Mon to Sat, 9 to 7). Weekly reports and anything unusual wait here for you." />
      <Notice ok={searchParams.ok} error={searchParams.error} />

      <section>
        <SectionTitle>Waiting for you ({waiting.length})</SectionTitle>
        {waiting.length === 0 ? (
          <Card><p className="text-sm text-zinc-400">No drafts waiting. The Client Check-in desk drafts the weekly &ldquo;how many booked or won?&rdquo; message each Monday, the Report Writer drafts reports on Fridays, and the Video Requester drafts clip requests when a client has gone quiet.</p></Card>
        ) : (
          <div className="grid gap-3">
            {waiting.map((d) => {
              const c = byClient[d.client_name];
              const wa = c?.whatsapp ? `https://wa.me/${c.whatsapp}?text=${encodeURIComponent(d.body)}` : null;
              return (
                <Card key={d.id}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{d.client_name}</span>
                    <Badge tone="info">{KIND[d.kind] ?? d.kind}</Badge>
                    <Badge tone={d.channel === "whatsapp" ? "good" : "default"}>{d.channel === "whatsapp" ? "WhatsApp" : "GoHighLevel"}</Badge>
                    <span className="text-xs text-zinc-500">drafted {ago(d.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap rounded-lg bg-white/5 p-3 text-sm text-zinc-200">{d.body}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {d.channel === "whatsapp" && wa ? (
                      <a href={wa} target="_blank" rel="noreferrer" className={btnPrimary}>Open in WhatsApp</a>
                    ) : null}
                    {d.channel === "whatsapp" && !wa ? <span className="text-xs text-amber-300">Add {d.client_name}&apos;s WhatsApp number below to get a one-tap button.</span> : null}
                    {d.channel === "ghl" ? (
                      <form action={setDraftStatus}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="status" value="approved" /><button className={btnPrimary}>Approve, team sends</button></form>
                    ) : null}
                    <CopyButton text={d.body} className={btnGhost} />
                    <form action={setDraftStatus}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="status" value="sent" /><button className={btnGhost}>I sent it</button></form>
                    <form action={setDraftStatus}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="status" value="skipped" /><button className={btnGhost}>Skip</button></form>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {queued.length > 0 ? (
        <section>
          <SectionTitle>Approved, going out on the next run ({queued.length})</SectionTitle>
          <div className="grid gap-3">
            {queued.map((d) => (
              <Card key={d.id}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{d.client_name}</span>
                  <Badge tone="good">{KIND[d.kind] ?? d.kind}</Badge>
                  <span className="text-xs text-zinc-500">approved {ago(d.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap rounded-lg bg-white/5 p-3 text-sm text-zinc-200">{d.body}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={setDraftStatus}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="status" value="skipped" /><button className={btnGhost}>Cancel it</button></form>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle>Log booked and won</SectionTitle>
        <Card>
          <p className="mb-3 text-sm text-zinc-400">Type in what a client tells you. This is the number that tells us which ads bring real jobs. The Test Judge and the weekly reports use it.</p>
          <form action={logOutcome} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="Client">
              <select name="client_name" className={inputCls} required defaultValue="">
                <option value="" disabled>Pick</option>
                {clients.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Week starting (Mon)"><input type="date" name="week_start" defaultValue={lastMonday()} className={inputCls} required /></Field>
            <Field label="Leads received"><input name="leads_received" inputMode="numeric" className={inputCls} /></Field>
            <Field label="Booked (quotes or visits)"><input name="booked" inputMode="numeric" className={inputCls} /></Field>
            <Field label="Won jobs"><input name="won" inputMode="numeric" className={inputCls} /></Field>
            <Field label="Won value £"><input name="won_value" inputMode="numeric" className={inputCls} /></Field>
            <Field label="Notes" className="sm:col-span-2 lg:col-span-5"><input name="notes" className={inputCls} placeholder="Optional, e.g. which ad they mentioned" /></Field>
            <div className="flex items-end"><button className={btnPrimary}>Save</button></div>
            <input type="hidden" name="source" value="harry" />
          </form>
        </Card>
        {(outcomes ?? []).length > 0 ? (
          <Card className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-zinc-500"><tr><th className="py-1 pr-4">Week</th><th className="pr-4">Client</th><th className="pr-4">Leads</th><th className="pr-4">Booked</th><th className="pr-4">Won</th><th className="pr-4">Value</th><th>Notes</th></tr></thead>
              <tbody>
                {(outcomes ?? []).map((o) => (
                  <tr key={o.id} className="border-t border-white/5 text-zinc-200">
                    <td className="py-1.5 pr-4">{o.week_start}</td><td className="pr-4">{o.client_name}</td><td className="pr-4">{o.leads_received ?? "–"}</td><td className="pr-4">{o.booked ?? "–"}</td><td className="pr-4">{o.won ?? "–"}</td><td className="pr-4">{o.won_value != null ? `£${o.won_value}` : "–"}</td><td className="text-zinc-400">{o.notes ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : null}
      </section>

      <section>
        <SectionTitle>Client contacts</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          {(contacts ?? []).map((c) => (
            <Card key={c.client_name}>
              <form action={saveContact} className="grid gap-3">
                <input type="hidden" name="client_name" value={c.client_name} />
                <p className="font-semibold text-white">{c.client_name}</p>
                <Field label="Contact name"><input name="contact_name" defaultValue={c.contact_name ?? ""} className={inputCls} /></Field>
                <Field label="WhatsApp number (07… is fine)"><input name="whatsapp" defaultValue={c.whatsapp ?? ""} className={inputCls} inputMode="tel" /></Field>
                <Field label="GoHighLevel contact id (optional)"><input name="ghl_contact_id" defaultValue={c.ghl_contact_id ?? ""} className={inputCls} /></Field>
                <div><button className={btnGhost}>Save</button></div>
              </form>
            </Card>
          ))}
        </div>
      </section>

      {done.length > 0 ? (
        <section>
          <SectionTitle>Recently handled</SectionTitle>
          <Card>
            <ul className="space-y-1 text-sm text-zinc-300">
              {done.map((d) => (
                <li key={d.id}><span className="text-white">{d.client_name}</span> · {KIND[d.kind] ?? d.kind} · {d.status === "sent" ? "sent" : "skipped"} {d.sent_at ? ago(d.sent_at) : ""}</li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
