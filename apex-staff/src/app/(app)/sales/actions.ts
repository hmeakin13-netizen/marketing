"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/staff/auth";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (kind: "ok" | "error", message: string): never => redirect(`/sales?${kind}=${encodeURIComponent(message)}`);

/** Approve or skip a drafted sales text. Approving does not send it: the Follow-up Chaser sends approved texts on its next run. */
export async function setSalesDraft(formData: FormData) {
  const { supabase } = await requireRole("admin", "manager");
  const id = Number(str(formData, "id"));
  const status = str(formData, "status");
  if (!Number.isFinite(id) || !["approved", "skipped", "draft"].includes(status)) back("error", "Something went wrong with that draft.");
  const { error } = await supabase
    .from("sales_drafts")
    .update({ status, approved_at: status === "approved" ? new Date().toISOString() : null })
    .eq("id", id)
    .in("status", ["draft", "approved", "skipped"]);
  if (error) back("error", error.message);
  revalidatePath("/sales");
  back("ok", status === "approved" ? "Approved. It goes out on the next Sales run." : status === "skipped" ? "Skipped." : "Back to draft.");
}
