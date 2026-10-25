import { requireRole } from "@/lib/staff/auth";
import { AutoRefresh } from "@/components/staff/AutoRefresh";
import { CopyButton } from "@/components/staff/CopyButton";
import { Badge, Card, Field, Notice, PageHeader, SectionTitle, btnGhost, btnPrimary, inputCls } from "@/components/staff/ui";
import { addIdea, setPostStatus } from "./actions";

export const metadata = { title: "Marketing | Apex Team" };
export const dynamic = "force-dynamic";

type Post = {
  id: number;
  platform: string;
  format: string;
  topic: string;
  hook: string | null;
  caption: string | null;
  hashtags: string | null;
  script: string | null;
  visual_brief: string | null;
  planned_for: string | null;
  status: string;
  written_by: string | null;
  evidence: string | null;
  note: string | null;
  metrics: string | null;
  pillar: string | null;
  image_prompt: string | null;
  image_url: string | null;
  video_prompt: string | null;
  video_url: string | null;
  ai_label: boolean | null;
  created_at: string;
};

const PILLAR: Record<string, string> = { reach: "Reach (everyone)", niche: "Niche (trades)", info: "Informational" };

const TONE: Record<string, "default" | "info" | "warn" | "good" | "bad"> = { idea: "default", drafted: "warn", approved: "info", ready: "good", posted: "good", skipped: "default" };

function day(d: string | null) {
  if (!d) return "No date yet";
  return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function PostCard({ p, actions }: { p: Post; actions: ("approved" | "ready" | "posted" | "skipped" | "drafted")[] }) {
  const full = [p.hook, p.caption, p.hashtags].filter(Boolean).join("\n\n");
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone={TONE[p.status]}>{p.status}</Badge>
        <Badge>{p.format}</Badge>
        {p.pillar ? <Badge tone="info">{PILLAR[p.pillar] ?? p.pillar}</Badge> : null}
        {p.ai_label ? <Badge tone="warn">AI visual: add the AI label</Badge> : null}
        <span className="text-xs text-zinc-500">{p.platform} · {day(p.planned_for)}</span>
        {p.written_by ? <span className="ml-auto text-xs text-zinc-600">by {p.written_by}</span> : null}
      </div>
      <p className="text-sm font-medium text-white">{p.topic}</p>
      {p.hook ? <p className="mt-2 text-sm text-emerald-300">Hook: {p.hook}</p> : null}
      {p.caption ? <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-sm text-zinc-200">{p.caption}</pre> : null}
      {p.hashtags ? <p className="mt-2 text-xs text-sky-300">{p.hashtags}</p> : null}
      {p.script ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-zinc-400">Reel script</summary>
          <pre className="mt-1 whitespace-pre-wrap text-xs text-zinc-300">{p.script}</pre>
        </details>
      ) : null}
      {p.image_url ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {p.image_url.split("\n").map((u) => u.trim()).filter(Boolean).map((u) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt={p.topic} className={`rounded-lg border border-white/10 ${p.format === "story" ? "max-h-96" : p.format === "carousel" ? "max-h-48" : "max-h-72"}`} />
          ))}
        </div>
      ) : null}
      {p.video_url ? <video src={p.video_url} controls playsInline className="mt-2 max-h-80 rounded-lg border border-white/10" /> : null}
      {p.video_prompt && !p.video_url ? <p className="mt-1 text-xs text-zinc-500">Video brief (waiting to be generated): {p.video_prompt}</p> : null}
      {p.visual_brief ? <p className="mt-2 text-xs text-zinc-400">What to film or show: {p.visual_brief}</p> : null}
      {p.image_prompt && !p.image_url ? <p className="mt-1 text-xs text-zinc-500">Image brief (waiting to be generated): {p.image_prompt}</p> : null}
      {p.evidence ? <p className="mt-1 text-xs text-zinc-600">Based on: {p.evidence}</p> : null}
      {p.note ? <p className="mt-1 text-xs text-amber-300">{p.note}</p> : null}
      {p.metrics ? <p className="mt-1 text-xs text-zinc-400">Result: {p.metrics}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((a) => (
          <form key={a} action={setPostStatus}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="status" value={a} />
            <button className={a === "approved" || a === "posted" ? btnPrimary : btnGhost}>
              {a === "approved" ? "Approve" : a === "posted" ? "I posted it" : a === "skipped" ? "Skip" : a === "ready" ? "Ready to post" : "Back to draft"}
            </button>
          </form>
        ))}
        {full ? <CopyButton text={full} /> : null}
      </div>
    </Card>
  );
}

const FORMATS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "reel", label: "Reels" },
  { key: "carousel", label: "Carousels" },
  { key: "story", label: "Stories" },
  { key: "post", label: "Posts" },
];

export default async function MarketingPage({ searchParams }: { searchParams: { ok?: string; error?: string; f?: string } }) {
  const { supabase } = await requireRole("admin", "manager");
  const { data } = await supabase
    .from("marketing_posts")
    .select("*")
    .order("planned_for", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(400)
    .returns<Post[]>();
  const allPosts = data ?? [];
  const f = FORMATS.some((x) => x.key === searchParams.f) ? (searchParams.f as string) : "all";
  const posts = f === "all" ? allPosts : allPosts.filter((p) => p.format === f);
  const hasText = (p: Post) => Boolean(p.caption && p.caption.trim());
  // Anything with a caption is ready for a yes or no, even before the Publisher has promoted it.
  const drafted = posts.filter((p) => p.status === "drafted" || (p.status === "idea" && hasText(p)));
  const ready = posts.filter((p) => p.status === "approved" || p.status === "ready");
  const ideas = posts.filter((p) => p.status === "idea" && !hasText(p));
  const count = (k: string) => allPosts.filter((p) => (k === "all" || p.format === k) && (p.status === "drafted" || (p.status === "idea" && Boolean(p.caption && p.caption.trim())))).length;
  const done = posts.filter((p) => p.status === "posted").slice(-8).reverse();

  return (
    <>
      <AutoRefresh seconds={60} />
      <PageHeader
        title="Marketing"
        subtitle="Posts and reels the Marketing team has planned and written for Apex-Leads. Nothing is posted for you: approve, copy, post it yourself, then tick it off."
      />
      <Notice ok={searchParams.ok} error={searchParams.error} />

      <div className="mb-4 flex flex-wrap gap-2">
        {FORMATS.map((x) => (
          <a key={x.key} href={x.key === "all" ? "/marketing" : `/marketing?f=${x.key}`} className={x.key === f ? btnPrimary : btnGhost}>
            {x.label} ({count(x.key)})
          </a>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><p className="text-xs uppercase tracking-wider text-zinc-500">Waiting for you</p><p className="mt-1 text-2xl font-semibold text-white">{drafted.length}</p></Card>
        <Card><p className="text-xs uppercase tracking-wider text-zinc-500">Ready to post</p><p className="mt-1 text-2xl font-semibold text-white">{ready.length}</p></Card>
        <Card><p className="text-xs uppercase tracking-wider text-zinc-500">Still being written</p><p className="mt-1 text-2xl font-semibold text-white">{ideas.length}</p></Card>
        <Card><p className="text-xs uppercase tracking-wider text-zinc-500">Posted</p><p className="mt-1 text-2xl font-semibold text-white">{posts.filter((p) => p.status === "posted").length}</p></Card>
      </div>

      <SectionTitle>Waiting for your approval</SectionTitle>
      {drafted.length === 0 ? (
        <Card><p className="text-sm text-zinc-500">Nothing waiting for this filter. The team writes new posts through the day.</p></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {drafted.map((p) => <PostCard key={p.id} p={p} actions={["approved", "skipped"]} />)}
        </div>
      )}

      <SectionTitle>Approved and ready to post</SectionTitle>
      {ready.length === 0 ? (
        <Card><p className="text-sm text-zinc-500">Nothing approved yet.</p></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {ready.map((p) => <PostCard key={p.id} p={p} actions={["posted", "drafted", "skipped"]} />)}
        </div>
      )}

      <SectionTitle>Ideas still being written</SectionTitle>
      {ideas.length === 0 ? (
        <Card><p className="text-sm text-zinc-500">Nothing still being written for this filter.</p></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {ideas.map((p) => <PostCard key={p.id} p={p} actions={["skipped"]} />)}
        </div>
      )}

      <SectionTitle>Add your own idea</SectionTitle>
      <Card>
        <form action={addIdea} className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Field label="Idea">
              <input name="topic" required placeholder="e.g. What a no-show actually costs a landscaper" className={inputCls} />
            </Field>
          </div>
          <Field label="Format">
            <select name="format" className={inputCls} defaultValue="reel">
              <option value="reel">Reel</option>
              <option value="post">Post</option>
              <option value="carousel">Carousel</option>
              <option value="story">Story</option>
            </select>
          </Field>
          <Field label="Planned for">
            <input name="planned_for" type="date" className={inputCls} />
          </Field>
          <div className="sm:col-span-3">
            <Field label="Anything the writers should know (optional)">
              <input name="note" className={inputCls} />
            </Field>
          </div>
          <div className="flex items-end">
            <button className={btnPrimary}>Add idea</button>
          </div>
        </form>
      </Card>

      {done.length > 0 ? (
        <>
          <SectionTitle>Posted lately</SectionTitle>
          <Card>
            <ul className="divide-y divide-white/5">
              {done.map((p) => (
                <li key={p.id} className="py-2 text-sm">
                  <span className="text-white">{p.topic}</span>
                  <span className="ml-2 text-xs text-zinc-500">{p.format} · {day(p.planned_for)}</span>
                  {p.metrics ? <span className="ml-2 text-xs text-emerald-300">{p.metrics}</span> : null}
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}
    </>
  );
}
