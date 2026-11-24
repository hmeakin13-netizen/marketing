"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/staff/auth";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const intOrNull = (f: FormData, k: string) => {
  const raw = str(f, k).replace(/[£,\s]/g, "");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
};
const back = (kind: "ok" | "error", message: string): never => redirect(`/care?${kind}=${encodeURIComponent(message)}`);

/** Mark a drafted message as sent (by a person), approved (the care team sends it by SMS on its next run) or skipped. Nothing is sent from here. */
export async function setDraftStatus(formData: FormData) {
  const { supabase } = await requireRole("admin", "manager");
  const id = Number(str(formData, "id"));
  const status = str(formData, "status");
  if (!Number.isFinite(id) || !["sent", "approved", "skipped", "draft"].includes(status)) back("error", "Something went wrong with that draft.");
  const { error } = await supabase
    .from("care_drafts")
    .update({ status, sent_at: status === "sent" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) back("error", error.message);
  revalidatePath("/care");
  back("ok", status === "sent" ? "Marked as sent." : status === "approved" ? "Approved. The care team sends it by SMS on its next run (Mon to Sat, 9 to 7)." : status === "skipped" ? "Skipped." : "Back to draft.");
}

/** Log how many of a week's leads booked or were won. This is the number the agents and Test Judge learn from. */
export async function logOutcome(formData: FormData) {
  const { supabase } = await requireRole("admin", "manager");
  const client = str(formData, "client_name");
  const week = str(formData, "week_start");
  if (!client) back("error", "Pick a client.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) back("error", "Pick the Monday the week started.");
  const { error } = await supabase.from("client_outcomes").insert({
    client_name: client,
    week_start: week,
    leads_received: intOrNull(formData, "leads_received"),
    booked: intOrNull(formData, "booked"),
    won: intOrNull(formData, "won"),
    won_value: intOrNull(formData, "won_value"),
    notes: str(formData, "notes") || null,
    source: str(formData, "source") === "client" ? "client" : "harry",
  });
  if (error) back("error", error.message);
  revalidatePath("/care");
  back("ok", "Outcome saved. The team will use it.");
}

export async function saveContact(formData: FormData) {
  const { supabase } = await requireRole("admin", "manager");
  const client = str(formData, "client_name");
  if (!client) back("error", "Missing client.");
  const digits = str(formData, "whatsapp").replace(/\D/g, "");
  // UK numbers typed as 07... become 447...
  const whatsapp = digits.startsWith("0") ? `44${digits.slice(1)}` : digits;
  const { error } = await supabase.from("care_contacts").upsert({
    client_name: client,
    contact_name: str(formData, "contact_name") || null,
    whatsapp: whatsapp || null,
    ghl_contact_id: str(formData, "ghl_contact_id") || null,
    updated_at: new Date().toISOString(),
  });
  if (error) back("error", error.message);
  revalidatePath("/care");
  back("ok", `${client} contact saved.`);
}
