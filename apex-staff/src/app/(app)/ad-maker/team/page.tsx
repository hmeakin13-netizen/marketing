import { requireRole } from "@/lib/staff/auth";
import { loadTeam, type TeamAgent, type TeamEvent } from "@/lib/staff/admaker";
import { AutoRefresh } from "@/components/staff/AutoRefresh";
import { TeamFloorView } from "@/components/staff/TeamFloorView";
import { Badge, Card, PageHeader } from "@/components/staff/ui";

export const metadata = { title: "Research team | Apex Team" };
export const dynamic = "force-dynamic";

const ROLE_RING: Record<TeamAgent["role"], string> = {
  manager: "border-emerald-400/60 bg-emerald-500/10",
  worker: "border-sky-400/30 bg-sky-500/5",
  reviewer: "border-amber-400/40 bg-amber-500/5",
};
const ROLE_TAG: Record<TeamAgent["role"], "good" | "info" | "warn"> = { manager: "good", worker: "info", reviewer: "warn" };
const KIND_TONE: Record<TeamEvent["kind"], "default" | "good" | "warn" | "bad" | "info"> = {
  started: "default",
  finished: "good",
  finding: "info",
  handoff: "warn",
  review: "good",
  flag: "warn",
  question: "info",
  error: "bad",
};

function ago(iso: string | null) {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
}

function stateOf(a: TeamAgent) {
  // "Working" only counts while it is recent: a run that never reported back is not still going.
  const fresh = a.last_run_at && Date.now() - new Date(a.last_run_at).getTime() < 45 * 60000;
  if (a.status === "working" && fresh) return { label: "Working", dot: "bg-emerald-400 animate-pulse" };
  if (a.status === "error") return { label: "Needs a look", dot: "bg-rose-500" };
  if (a.status === "waiting") return { label: "Waiting", dot: "bg-amber-400" };
  return { label: "Idle", dot: "bg-zinc-500" };
}

function AgentCard({ a, names }: { a: TeamAgent; names: Record<string, string> }) {
  const s = stateOf(a);
  return (
    <div className={`rounded-2xl border p-4 ${ROLE_RING[a.role]}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
          <h3 className="font-semibold text-white">{a.name}</h3>
        </div>
        <Badge tone={ROLE_TAG[a.role]}>{a.role}</Badge>
      </div>
      <p className="mt-2 text-sm text-zinc-300">{a.job}</p>
      {a.current_task ? <p className="mt-2 text-sm text-emerald-300">Now: {a.current_task}</p> : null}
      <dl className="mt-3 space-y-1 text-xs text-zinc-500">
        <div className="flex justify-between gap-3"><dt>Status</dt><dd className="text-zinc-300">{s.label}</dd></div>
        <div className="flex justify-between gap-3"><dt>Last ran</dt><dd className="text-zinc-300">{ago(a.last_run_at)}</dd></div>
        <div className="flex justify-between gap-3"><dt>Runs</dt><dd className="text-zinc-300">{a.schedule}</dd></div>
        <div className="flex justify-between gap-3"><dt>Uses</dt><dd className="text-right text-zinc-300">{a.connectors}</dd></div>
        {a.manager_key ? <div className="flex justify-between gap-3"><dt>Reports to</dt><dd className="text-zinc-300">{names[a.manager_key]}</dd></div> : null}
      </dl>
      {a.last_summary ? <p className="mt-3 border-t border-white/10 pt-2 text-xs text-zinc-400">{a.last_summary}</p> : null}
    </div>
  );
}

export default async function ResearchTeamPage() {
  const { supabase } = await requireRole("admin", "manager");
  const { agents, events, queue, learnings, photos, proposals, impact } = await loadTeam(supabase);
  const names = Object.fromEntries(agents.map((a) => [a.key, a.name]));
  const lead = agents.find((a) => a.role === "manager");
  const rest = agents.filter((a) => a.role !== "manager");
  const open = queue.filter((q) => q.status === "open" || q.status === "in_progress");
  const done = queue.filter((q) => q.status === "done").slice(0, 5);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const today = events.filter((e) => new Date(e.created_at) >= todayStart);

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader
        title="Research team"
        subtitle="Who is working on what, what they hand to each other, and the questions waiting. Updates by itself every 30 seconds."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><p className="text-xs uppercase tracking-wider text-zinc-500">Agents</p><p className="mt-1 text-2xl font-semibold text-white">{agents.length}</p></Card>
        <Card><p className="text-xs uppercase tracking-wider text-zinc-500">Events today</p><p className="mt-1 text-2xl font-semibold text-white">{today.length}</p></Card>
        <Card><p className="text-xs uppercase tracking-wider text-zinc-500">Questions waiting</p><p className="mt-1 text-2xl font-semibold text-white">{open.length}</p></Card>
        <Card><p className="text-xs uppercase tracking-wider text-zinc-500">Findings in the brain</p><p className="mt-1 text-2xl font-semibold text-white">{learnings}</p></Card>
      </div>

      <TeamFloorView agents={agents} events={events} learnings={learnings} />

      {lead ? (
        <div className="mx-auto max-w-md">
          <AgentCard a={lead} names={names} />
        </div>
      ) : null}
      <div className="mx-auto h-8 w-px bg-gradient-to-b from-emerald-400/60 to-sky-400/30" />
      <div className="relative">
        <div className="absolute inset-x-[8%] top-0 hidden h-px bg-sky-400/30 lg:block" />
        <div className="grid grid-cols-1 gap-4 pt-0 sm:grid-cols-2 xl:grid-cols-4">
          {rest.map((a) => (
            <AgentCard key={a.key} a={a} names={names} />
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold text-white">Live feed: what is being passed around</h2>
          {events.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {events.map((e) => (
                <li key={e.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={KIND_TONE[e.kind]}>{e.kind}</Badge>
                    <span className="font-medium text-white">{names[e.agent_key] ?? e.agent_key}</span>
                    {e.to_agent_key ? (
                      <>
                        <span className="text-emerald-400">→</span>
                        <span className="font-medium text-white">{names[e.to_agent_key] ?? e.to_agent_key}</span>
                      </>
                    ) : null}
                    <span className="ml-auto text-xs text-zinc-500">{ago(e.created_at)}</span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-300">{e.summary}</p>
                  {e.ref ? <p className="mt-0.5 text-xs text-zinc-500">{e.ref}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-lg font-semibold text-white">Questions waiting</h2>
            {open.length === 0 ? (
              <p className="text-sm text-zinc-500">None. The Research Lead sets new ones each morning.</p>
            ) : (
              <ul className="space-y-3">
                {open.map((q) => (
                  <li key={q.id} className="text-sm">
                    <p className="text-zinc-200">{q.question}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      For {q.assigned_to ? names[q.assigned_to] : "anyone"}
                      {q.asked_by ? ` · asked by ${names[q.asked_by]}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-3 text-lg font-semibold text-white">Answered lately</h2>
            {done.length === 0 ? (
              <p className="text-sm text-zinc-500">Nothing answered yet.</p>
            ) : (
              <ul className="space-y-3">
                {done.map((q) => (
                  <li key={q.id} className="text-sm">
                    <p className="text-zinc-200">{q.question}</p>
                    {q.answer ? <p className="mt-0.5 text-xs text-emerald-300">{q.answer}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-white">Proposals waiting for you</h2>
          <p className="mb-3 text-xs text-zinc-500">The Copywriter drafts these. Nothing launches until you say yes in the chat (&ldquo;approve #3&rdquo;).</p>
          {proposals.length === 0 ? (
            <p className="text-sm text-zinc-500">None yet. The Copywriter drafts them each morning from the best findings.</p>
          ) : (
            <ul className="space-y-4">
              {proposals.map((p) => (
                <li key={p.id} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={p.status === "proposed" ? "warn" : "good"}>#{p.id} {p.status}</Badge>
                    <span className="font-medium text-white">{p.client_name}</span>
                    <span className="text-xs text-zinc-500">£{p.daily_budget}/day</span>
                  </div>
                  <p className="mt-1 text-zinc-200">{p.angle}</p>
                  {p.headline ? <p className="text-xs text-zinc-400">Headline: {p.headline}</p> : null}
                  <p className="mt-1 whitespace-pre-line text-xs text-zinc-400">{p.primary_text}</p>
                  {p.learning_id ? <p className="mt-1 text-xs text-emerald-400">From finding #{p.learning_id}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-semibold text-white">Best photos by client</h2>
          <p className="mb-3 text-xs text-zinc-500">Ranked by the Photo Ranker from each client&apos;s Drive folder.</p>
          {photos.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing ranked yet. The Photo Ranker reads new Drive photos each morning.</p>
          ) : (
            <ul className="space-y-3">
              {photos.map((p) => (
                <li key={p.id} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={p.status === "used" ? "default" : "good"}>#{p.rank ?? "–"}</Badge>
                    <span className="font-medium text-white">{p.client_name}</span>
                    <a
                      href={`https://drive.google.com/file/d/${p.drive_file_id}/view`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-xs text-emerald-400 hover:text-emerald-300"
                    >
                      Open
                    </a>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-400">{p.shows}</p>
                  {p.use_for ? <p className="text-xs text-zinc-500">Good for: {p.use_for}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-semibold text-white">Did the research help?</h2>
          <p className="mb-3 text-xs text-zinc-500">Every test is linked to the finding that inspired it. The Test Judge scores it and credits the agent.</p>
          {impact.length === 0 ? (
            <p className="text-sm text-zinc-500">No tests linked yet.</p>
          ) : (
            <ul className="space-y-3">
              {impact.map((t) => (
                <li key={t.id} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={t.verdict === "keep" ? "good" : t.verdict === "kill" ? "bad" : "default"}>{t.verdict}</Badge>
                    <span className="font-medium text-white">{t.client_name}</span>
                  </div>
                  <p className="mt-0.5 text-zinc-200">{t.ad_name}</p>
                  <p className="text-xs text-zinc-500">
                    From finding #{t.learning_id}
                    {t.credited_agent ? ` · found by ${names[t.credited_agent] ?? t.credited_agent}` : ""}
                  </p>
                  <p className="text-xs text-zinc-400">{t.outcome ?? "Still running. Too early to judge."}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
