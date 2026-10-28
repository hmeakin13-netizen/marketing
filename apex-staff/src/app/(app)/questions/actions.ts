"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/staff/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (kind: "ok" | "error", message: string): never => redirect(`/?${kind}=${encodeURIComponent(message)}`);

type Kind = "queue" | "activity" | "order";
const kindOf = (v: string): Kind | null => (v === "queue" || v === "activity" || v === "order" ? v : null);

/**
 * Harry answers a question an agent asked him. The answer is written back where the agent looks
 * (the research queue row, the activity row, or the order) AND becomes a new order, so the Task
 * Setter routes it to whichever desk needs it on its next run.
 */
export async function answerQuestion(formData: FormData) {
  await requireRole("admin");
  const db = createAdminClient();
  const kind = kindOf(str(formData, "kind"));
  const id = Number(str(formData, "id"));
  const answer = str(formData, "answer");
  if (!kind || !Number.isFinite(id)) back("error", "Something went wrong with that question.");
  if (!answer) back("error", "Type an answer first.");

  let question = "";
  if (kind === "queue") {
    const { data } = await db.from("ad_research_queue").select("question").eq("id", id).maybeSingle();
    question = String(data?.question ?? "");
    const { error } = await db.from("ad_research_queue").update({ answer: `Harry: ${answer}`, status: "done", answered_at: new Date().toISOString() }).eq("id", id);
    if (error) back("error", error.message);
  } else if (kind === "activity") {
    const { data } = await db.from("ad_activity").select("summary").eq("id", id).maybeSingle();
    question = String(data?.summary ?? "");
    const { error } = await db.from("ad_activity").update({ harry_reply: answer, handled_at: new Date().toISOString() }).eq("id", id);
    if (error) back("error", error.message);
  } else {
    const { data } = await db.from("harry_orders").select("said").eq("id", id).maybeSingle();
    question = String(data?.said ?? "");
    const { error } = await db
      .from("harry_orders")
      .update({ said: `${question}\n\nHarry's answer: ${answer}`, status: "open", routed_to: null, result: null })
      .eq("id", id);
    if (error) back("error", error.message);
    revalidatePath("/");
    back("ok", "Answer saved. The Task Setter picks the order up again on its next run.");
  }
  const { error } = await db.from("harry_orders").insert({
    said: `Answer to the team's question "${question.slice(0, 300)}": ${answer}`,
    source: "portal",
    status: "open",
  });
  if (error) back("error", error.message);
  revalidatePath("/");
  back("ok", "Answer saved. The team reads it on their next run.");
}

/** Harry has dealt with it himself, or it no longer matters. */
export async function markQuestionDone(formData: FormData) {
  await requireRole("admin");
  const db = createAdminClient();
  const kind = kindOf(str(formData, "kind"));
  const id = Number(str(formData, "id"));
  if (!kind || !Number.isFinite(id)) back("error", "Something went wrong with that question.");
  const now = new Date().toISOString();
  const r =
    kind === "queue"
      ? await db.from("ad_research_queue").update({ answer: "Done (Harry)", status: "done", answered_at: now }).eq("id", id)
      : kind === "activity"
        ? await db.from("ad_activity").update({ harry_reply: "Done", handled_at: now }).eq("id", id)
        : await db.from("harry_orders").update({ status: "done", done_at: now, result: "Done (Harry)" }).eq("id", id);
  if (r.error) back("error", r.error.message);
  revalidatePath("/");
  back("ok", "Marked done.");
}
