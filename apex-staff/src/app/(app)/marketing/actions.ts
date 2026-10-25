"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/staff/auth";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (kind: "ok" | "error", message: string): never => redirect(`/marketing?${kind}=${encodeURIComponent(message)}`);

const STATUSES = ["idea", "drafted", "approved", "ready", "posted", "skipped"];

/** Move a post along: approve it, mark it posted by hand, skip it, or put it back. Nothing is ever posted from here. */
export async function setPostStatus(formData: FormData) {
  const { supabase } = await requireRole("admin", "manager");
  const id = Number(str(formData, "id"));
  const status = str(formData, "status");
  if (!Number.isFinite(id) || !STATUSES.includes(status)) back("error", "Something went wrong with that post.");
  const patch: Record<string, string | null> = { status };
  if (status === "approved") patch.approved_at = new Date().toISOString();
  if (status === "posted") patch.posted_at = new Date().toISOString();
  const { error } = await supabase.from("marketing_posts").update(patch).eq("id", id);
  if (error) back("error", error.message);
  revalidatePath("/marketing");
  back("ok", status === "approved" ? "Approved." : status === "posted" ? "Marked as posted." : status === "skipped" ? "Skipped." : "Updated.");
}

/** Add your own idea for the team to write up. */
export async function addIdea(formData: FormData) {
  const { supabase } = await requireRole("admin", "manager");
  const topic = str(formData, "topic");
  if (topic.length < 5) back("error", "Give the idea a few words.");
  const { error } = await supabase.from("marketing_posts").insert({
    topic,
    format: ["post", "reel", "carousel", "story"].includes(str(formData, "format")) ? str(formData, "format") : "post",
    planned_for: str(formData, "planned_for") || null,
    status: "idea",
    written_by: "harry",
    note: str(formData, "note") || null,
  });
  if (error) back("error", error.message);
  revalidatePath("/marketing");
  back("ok", "Idea added. The Caption Writer will pick it up on the next run.");
}
