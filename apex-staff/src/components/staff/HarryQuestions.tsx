import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, SectionTitle, btnGhost, btnPrimary, inputCls } from "@/components/staff/ui";
import { answerQuestion, markQuestionDone } from "@/app/(app)/questions/actions";

type Q = { kind: "queue" | "activity" | "order"; id: number; text: string; why: string | null; from: string; at: string };

function ago(iso: string) {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 36e5);
  if (h < 1) return "just now";
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Everything the agents have asked Harry personally and are still waiting on. Answers go back to the team. */
export async function loadQuestions(supabase: SupabaseClient): Promise<Q[]> {
  const since = new Date(Date.now() - 21 * 86400000).toISOString();
  const [queue, suggestions, flags, orders] = await Promise.all([
    supabase.from("ad_research_queue").select("id, question, why, asked_by, created_at").eq("status", "open").is("assigned_to", null).order("created_at", { ascending: false }).limit(20),
    supabase.from("ad_activity").select("id, kind, summary, reason, created_at").is("handled_at", null).gte("created_at", since).eq("kind", "suggestion").ilike("summary", "Question for Harry%").order("created_at", { ascending: false }).limit(20),
    supabase.from("ad_activity").select("id, kind, summary, reason, created_at").is("handled_at", null).gte("created_at", since).eq("kind", "flag").ilike("summary", "%Harry%").order("created_at", { ascending: false }).limit(20),
    supabase.from("harry_orders").select("id, said, result, created_at").eq("status", "needs_harry").order("created_at", { ascending: false }).limit(20),
  ]);
  const activity = { data: [...(suggestions.data ?? []), ...(flags.data ?? [])] };
  const out: Q[] = [];
  for (const r of queue.data ?? []) out.push({ kind: "queue", id: r.id, text: r.question, why: r.why, from: r.asked_by ?? "team", at: r.created_at });
  for (const r of activity.data ?? []) out.push({ kind: "activity", id: r.id, text: String(r.summary).replace(/^Question for Harry:\s*/i, ""), why: r.reason, from: r.kind === "flag" ? "flag" : "suggestion", at: r.created_at });
  for (const r of orders.data ?? []) out.push({ kind: "order", id: r.id, text: r.said, why: r.result, from: "your order", at: r.created_at });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export async function HarryQuestions({ supabase }: { supabase: SupabaseClient }) {
  const qs = await loadQuestions(supabase);
  return (
    <Card className={`mb-6 ${qs.length ? "border-sky-500/40" : "border-emerald-500/30"}`}>
      <SectionTitle>Questions for you ({qs.length})</SectionTitle>
      {qs.length === 0 ? (
        <p className="text-sm text-zinc-400">Nothing waiting on you. When a desk needs a decision only you can make, it lands here.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {qs.map((q) => (
            <li key={`${q.kind}-${q.id}`} className="py-3">
              <p className="text-sm text-zinc-100">{q.text}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {q.from} · {ago(q.at)}
                {q.why ? ` · ${q.why}` : ""}
              </p>
              <form action={answerQuestion} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
                <input type="hidden" name="kind" value={q.kind} />
                <input type="hidden" name="id" value={q.id} />
                <textarea name="answer" rows={2} placeholder="Type your answer. The team reads it on their next run." className={`${inputCls} sm:flex-1`} />
                <div className="flex gap-2">
                  <button className={btnPrimary}>Answer</button>
                  <button formAction={markQuestionDone} formNoValidate className={btnGhost}>Done</button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
