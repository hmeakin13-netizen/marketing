import { requireRole } from "@/lib/staff/auth";
import { AutoRefresh } from "@/components/staff/AutoRefresh";
import { CopyButton } from "@/components/staff/CopyButton";
import { Badge, Card, Notice, PageHeader, SectionTitle, btnGhost, btnPrimary } from "@/components/staff/ui";
import { setSalesDraft } from "./actions";

export const metadata = { title: "Sales recovery | Apex Team" };
export const dynamic = "force-dynamic";

type Draft = { id: number; contact_label: string | null; stage: string | null; kind: string; body: string; status: string; written_by: string | null; note: string | null; created_at: string; sent_at: string | null };
type Move = { id: number; contact_label: string | null; from_stage: string | null; to_stage: string; reason: string; moved_by: string | null; result: string; created_at: string };

const KIND: Record<string, string> = { rebook: "Rebook after no-show", followup: "Follow-up", confirm: "Confirmation", other: "Message" };

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export default async function SalesPage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const { supabase } = await requireRole("admin", "manager");
  const [{ data: drafts }, { data: moves }] = await Promise.all([
    supabase.from("sales_drafts").select("*").order("created_at", { ascending: false }).limit(80).returns<Draft[]>(),
    supabase.from("sales_moves").select("*").order("created_at", { ascending: false }).limit(30).returns<Move[]>(),
  ]);
  const waiting = (drafts ?? []).filter((d) => d.status === "draft");
  const approved = (drafts ?? []).filter((d) => d.status === "approved");
  const done = (drafts ?? []).filter((d) => ["sent", "skipped", "failed"].includes(d.status)).slice(0, 10);

  return (
    <>
      <AutoRefresh seconds={60} />
      <PageHeader
        title="Sales recovery"
        subtitle="Texts the Sales team has drafted for no-shows and quiet prospects, and every opportunity it moved in GoHighLevel. Approve a text and it goes out on the next run."
      />
      <Notice ok={searchParams.ok} error={searchParams.error} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><p className="text-xs uppercase tracking-wider text-zinc-500">Texts waiting for you</p><p className="mt-1 text-2xl font-semibold text-white">{waiting.length}</p></Card>
        <Card><p className="text-xs uppercase tracking-wider text-zinc-500">Approved, going out</p><p className="mt-1 text-2xl font-semibold text-white">{approved.length}</p></Card>
        <Card><p className="text-xs uppercase tracking-wider text-zinc-500">Stage moves logged</p><p className="mt-1 text-2xl font-semibold text-white">{(moves ?? []).length}</p></Card>
        <Card><p className="text-xs uppercase tracking-wider text-zinc-500">Sent lately</p><p className="mt-1 text-2xl font-semibold text-white">{done.filter((d) => d.status === "sent").length}</p></Card>
      </div>

      <SectionTitle>Waiting for your approval</SectionTitle>
      {waiting.length === 0 ? (
        <Card><p className="text-sm text-zinc-500">Nothing waiting. The No-show Matcher and Follow-up Chaser draft new ones three times a day.</p></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {waiting.map((d) => (
            <Card key={d.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone="warn">{KIND[d.kind] ?? d.kind}</Badge>
                <span className="text-sm font-medium text-white">{d.contact_label ?? "Prospect"}</span>
                {d.stage ? <span className="text-xs text-zinc-500">in {d.stage}</span> : null}
                <span className="ml-auto text-xs text-zinc-500">{ago(d.created_at)}</span>
              </div>
              <pre className="whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-sm text-zinc-200">{d.body}</pre>
              {d.note ? <p className="mt-2 text-xs text-zinc-500">Why: {d.note}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={setSalesDraft}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="status" value="approved" />
                  <button className={btnPrimary}>Approve and send</button>
                </form>
                <form action={setSalesDraft}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="status" value="skipped" />
                  <button className={btnGhost}>Skip</button>
                </form>
                <CopyButton text={d.body} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {approved.length > 0 ? (
        <>
          <SectionTitle>Approved, going out on the next run</SectionTitle>
          <div className="grid gap-3 lg:grid-cols-2">
            {approved.map((d) => (
              <Card key={d.id}>
                <p className="text-sm font-medium text-white">{d.contact_label ?? "Prospect"} <span className="text-xs text-zinc-500">· {KIND[d.kind] ?? d.kind}</span></p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-400">{d.body}</p>
                <form action={setSalesDraft} className="mt-2">
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="status" value="draft" />
                  <button className={btnGhost}>Take back</button>
                </form>
              </Card>
            ))}
          </div>
        </>
      ) : null}

      <SectionTitle>Opportunities the team moved in GoHighLevel</SectionTitle>
      <Card>
        {(moves ?? []).length === 0 ? (
          <p className="text-sm text-zinc-500">None yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {(moves ?? []).map((m) => (
              <li key={m.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={m.result === "moved" ? "good" : m.result === "failed" ? "bad" : "info"}>{m.result}</Badge>
                  <span className="font-medium text-white">{m.contact_label ?? "Prospect"}</span>
                  <span className="text-zinc-400">{m.from_stage ?? "?"} → {m.to_stage}</span>
                  <span className="ml-auto text-xs text-zinc-500">{ago(m.created_at)}</span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">{m.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {done.length > 0 ? (
        <>
          <SectionTitle>Recently handled</SectionTitle>
          <Card>
            <ul className="divide-y divide-white/5">
              {done.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <Badge tone={d.status === "sent" ? "good" : d.status === "failed" ? "bad" : "default"}>{d.status}</Badge>
                  <span className="text-white">{d.contact_label ?? "Prospect"}</span>
                  <span className="text-xs text-zinc-500">{KIND[d.kind] ?? d.kind} · {ago(d.sent_at ?? d.created_at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}
    </>
  );
}
