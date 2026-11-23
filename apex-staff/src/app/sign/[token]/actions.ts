"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildContractPdf } from "@/lib/staff/contracts";

/**
 * The client signs: no login, the private token in the link is what identifies the contract.
 * Records who signed, when and from where, and stores the signed PDF privately.
 */
export async function signContract(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("signer_name") ?? "").trim();
  const path = `/sign/${encodeURIComponent(token)}`;
  if (token.length < 20) redirect("/sign/invalid");
  if (name.length < 3 || formData.get("agree") !== "on") redirect(`${path}?error=${encodeURIComponent("Type your full name and tick the box to sign.")}`);

  const db = createAdminClient();
  const { data: c } = await db.from("contracts").select("id, client_name, body, status").eq("sign_token", token).maybeSingle();
  if (!c) redirect("/sign/invalid");
  if (c.status !== "draft" && c.status !== "sent") redirect(path);

  const signedAt = new Date().toISOString();
  const ip = (headers().get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  // Claim the contract first so two clicks can't both sign it.
  const { data: claimed, error } = await db
    .from("contracts")
    .update({ status: "signed", signed_at: signedAt, signer_name: name.slice(0, 120), signer_ip: ip })
    .eq("id", c.id)
    .in("status", ["draft", "sent"])
    .select("id");
  if (error || !claimed?.length) redirect(path);

  try {
    const pdf = await buildContractPdf({ body: c.body, client_name: c.client_name, signed_at: signedAt, signer_name: name, signer_ip: ip });
    const file = `${c.id}/signed.pdf`;
    const up = await db.storage.from("contracts").upload(file, Buffer.from(pdf), { contentType: "application/pdf", upsert: true });
    if (!up.error) await db.from("contracts").update({ file_path: file }).eq("id", c.id);
  } catch {
    // The signature itself is recorded; the PDF can be rebuilt from the stored wording.
  }
  redirect(path);
}
