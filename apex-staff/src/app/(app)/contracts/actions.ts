"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/staff/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fillTemplate, type ContractDetails, type OfferTier } from "@/lib/staff/contracts";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (path: string, kind: "ok" | "error", message: string): never => redirect(`${path}?${kind}=${encodeURIComponent(message)}`);

/** Harry edits a tier's wording. Each save is a new version, so signed contracts keep what they were signed on. */
export async function saveTemplate(formData: FormData) {
  const { me } = await requireRole("admin");
  const db = createAdminClient();
  const tier = str(formData, "tier");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) back("/contracts", "error", "The template can't be empty.");
  const { data: last } = await db.from("contract_templates").select("version, body").eq("tier", tier).order("version", { ascending: false }).limit(1).maybeSingle();
  if (last?.body === body) back("/contracts", "ok", "No changes to save.");
  const { error } = await db.from("contract_templates").insert({ tier, version: (last?.version ?? 0) + 1, body, created_by: me.id });
  if (error) back("/contracts", "error", error.message);
  revalidatePath("/contracts");
  back("/contracts", "ok", `Template saved as version ${(last?.version ?? 0) + 1}. Contracts already created keep their wording.`);
}

/** Create a contract for a client from their tier's latest template. Closers can only do this for their own clients. */
export async function createContract(formData: FormData) {
  const { me } = await requireRole("admin", "closer");
  const db = createAdminClient();
  const clientName = str(formData, "client_name");
  const tierKey = str(formData, "tier");
  const [{ data: profile }, { data: retainer }, { data: contact }, { data: tier }, { data: template }] = await Promise.all([
    db.from("ad_client_profiles").select("client_name, area").eq("client_name", clientName).maybeSingle(),
    db.from("retainer_clients").select("closer_id, start_date, monthly_fee").eq("client_name", clientName).is("end_date", null).limit(1).maybeSingle(),
    db.from("care_contacts").select("contact_name").eq("client_name", clientName).maybeSingle(),
    db.from("offer_tiers").select("*").eq("key", tierKey).maybeSingle<OfferTier>(),
    db.from("contract_templates").select("id, body").eq("tier", tierKey).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!profile) back("/contracts", "error", "Pick a client.");
  if (!tier || !template) back("/contracts", "error", "Pick a tier that has a template.");
  if (me.role !== "admin" && retainer?.closer_id !== me.id) back("/contracts", "error", "You can only create contracts for clients you closed.");
  const fee = Number(str(formData, "monthly_fee").replace(/[£,\s]/g, ""));
  const details: ContractDetails = {
    business_name: str(formData, "business_name") || clientName,
    contact_name: str(formData, "contact_name") || contact?.contact_name || "",
    area: str(formData, "area") || profile!.area || "",
    start_date: str(formData, "start_date") || retainer?.start_date || new Date().toISOString().slice(0, 10),
    monthly_fee: fee > 0 ? fee : Number(tier!.monthly_fee),
  };
  const { data: created, error } = await db
    .from("contracts")
    .insert({
      client_name: clientName,
      tier: tierKey,
      template_id: template!.id,
      details,
      body: fillTemplate(template!.body, tier!, details),
      sign_token: crypto.randomBytes(24).toString("base64url"),
      closer_id: retainer?.closer_id ?? (me.role === "closer" ? me.id : null),
      created_by: me.id,
    })
    .select("id")
    .single();
  if (error) back("/contracts", "error", error.message);
  revalidatePath("/contracts");
  redirect(`/contracts/${created!.id}?ok=${encodeURIComponent("Contract created. Check the wording, then copy the signing link to the client.")}`);
}

async function ownContract(id: string) {
  const { me } = await requireRole("admin", "closer");
  const db = createAdminClient();
  const { data: c } = await db.from("contracts").select("id, status, closer_id, client_name").eq("id", id).maybeSingle();
  if (!c || (me.role !== "admin" && c.closer_id !== me.id)) back("/contracts", "error", "Contract not found.");
  return { db, me, c: c! };
}

/** Records that the signing link has gone to the client. The portal never messages the client itself. */
export async function markSent(formData: FormData) {
  const { db, c } = await ownContract(str(formData, "id"));
  if (c.status !== "draft") back(`/contracts/${c.id}`, "error", "Only a draft can be marked as sent.");
  const { error } = await db.from("contracts").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", c.id);
  if (error) back(`/contracts/${c.id}`, "error", error.message);
  revalidatePath("/contracts");
  back(`/contracts/${c.id}`, "ok", "Marked as sent.");
}

/** Store a contract that was signed somewhere else (paper, DocuSign, an older agreement). PDF only. */
export async function uploadSigned(formData: FormData) {
  const { db, c } = await ownContract(str(formData, "id"));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) back(`/contracts/${c.id}`, "error", "Choose the signed PDF first.");
  const f = file as File;
  if (f.type !== "application/pdf") back(`/contracts/${c.id}`, "error", "The signed contract has to be a PDF.");
  if (f.size > 10 * 1024 * 1024) back(`/contracts/${c.id}`, "error", "That file is over 10 MB.");
  const path = `${c.id}/signed-upload.pdf`;
  const up = await db.storage.from("contracts").upload(path, Buffer.from(await f.arrayBuffer()), { contentType: "application/pdf", upsert: true });
  if (up.error) back(`/contracts/${c.id}`, "error", up.error.message);
  const { error } = await db
    .from("contracts")
    .update({ status: "signed", signed_at: str(formData, "signed_on") ? `${str(formData, "signed_on")}T12:00:00Z` : new Date().toISOString(), signer_name: str(formData, "signer_name") || null, file_path: path })
    .eq("id", c.id);
  if (error) back(`/contracts/${c.id}`, "error", error.message);
  revalidatePath("/contracts");
  back(`/contracts/${c.id}`, "ok", "Signed copy stored.");
}

/** A draft that was made by mistake. Sent and signed contracts are kept. */
export async function deleteDraft(formData: FormData) {
  const { db, c } = await ownContract(str(formData, "id"));
  if (c.status !== "draft") back(`/contracts/${c.id}`, "error", "Only a draft can be deleted.");
  const { error } = await db.from("contracts").delete().eq("id", c.id).eq("status", "draft");
  if (error) back(`/contracts/${c.id}`, "error", error.message);
  revalidatePath("/contracts");
  back("/contracts", "ok", "Draft deleted.");
}
