"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/staff/auth";
import { geocodePostcode } from "@/lib/staff/geo";
import { createAdminClient } from "@/lib/supabase/admin";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const money = (f: FormData, k: string) => str(f, k).replace(/[£,\s]/g, "");
const back = (path: string, kind: "ok" | "error", message: string): never => redirect(`${path}?${kind}=${encodeURIComponent(message)}`);

/**
 * One submit fills every table a new client needs: the profile the desks read, the retainer,
 * the care contact and a line in the standing rules. The database does it in a single
 * transaction (add_client), so it either all saves or none of it does.
 */
export async function addClientEverywhere(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const path = "/clients/new";
  const name = str(formData, "name");
  if (!name) back(path, "error", "Add the client's name.");
  if (!str(formData, "trade")) back(path, "error", "Add the client's trade.");

  const fee = money(formData, "monthly_fee");
  if (fee && !(Number(fee) >= 0)) back(path, "error", "The monthly fee has to be a number.");
  const tierKey = str(formData, "tier") || "pro";
  const { data: tier } = await supabase.from("offer_tiers").select("exclusive_radius_km").eq("key", tierKey).maybeSingle();
  if (!tier) back(path, "error", "Pick a tier.");
  const billingDay = str(formData, "billing_day");
  if (billingDay && !(Number(billingDay) >= 1 && Number(billingDay) <= 31)) back(path, "error", "The billing day has to be between 1 and 31.");

  // Check the postcode before anything is saved, so a typo does not leave a half-added client.
  const postcode = str(formData, "postcode");
  const geo = postcode ? await geocodePostcode(postcode) : null;
  if (postcode && !geo) back(path, "error", `Couldn't find the postcode "${postcode}". Check it, or leave it blank and add it later.`);

  const { data: retainerId, error } = await supabase.rpc("add_client", {
    p: {
      name,
      tier: tierKey,
      trade: str(formData, "trade"),
      area: str(formData, "area"),
      services: str(formData, "services"),
      notes: str(formData, "notes"),
      meta_ad_account_id: str(formData, "meta_ad_account_id"),
      meta_page_id: str(formData, "meta_page_id"),
      meta_form_id: str(formData, "meta_form_id"),
      monthly_fee: fee,
      start_date: str(formData, "start_date"),
      billing_day: billingDay,
      closer_id: str(formData, "closer_id"),
      setter_id: str(formData, "setter_id"),
      contact_name: str(formData, "contact_name"),
      ghl_contact_id: str(formData, "ghl_contact_id"),
    },
  });
  if (error) back(path, "error", error.message);

  let mapNote = "";
  // The tier decides the exclusive area: none on Growth, otherwise the tier's radius unless one was typed in.
  const radius = Number(str(formData, "radius_km")) || Number(tier!.exclusive_radius_km ?? 0);
  if (geo && retainerId && radius > 0) {
    const { error: mapError } = await supabase.from("territories").insert({
      client_id: retainerId,
      name,
      postcode: geo.postcode,
      lat: geo.lat,
      lng: geo.lng,
      radius_km: radius,
    });
    if (mapError) mapNote = " The territory map did not save: add the postcode on this page.";
  }
  revalidatePath("/", "layout");
  back("/clients", "ok", `${name} added everywhere: profile, retainer, care contact and the team's standing rules.${mapNote}`);
}

/** The client has gone: profile set to left, retainer ended, territory freed, and the desks told. */
export async function markClientLeft(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const name = str(formData, "client_name");
  const { error } = await supabase.rpc("mark_client_left", { p_client_name: name, p_left_on: str(formData, "left_on") || null });
  if (error) back("/clients", "error", error.message);
  revalidatePath("/", "layout");
  back("/clients", "ok", `${name} marked as left. Their retainer is ended and the team has been told.`);
}

/** Setup is finished and ads are running: the client shows as live on the dashboard and the desks are told. */
export async function setClientLive(formData: FormData) {
  await requireRole("admin");
  const db = createAdminClient();
  const name = str(formData, "client_name");
  const { data, error } = await db
    .from("ad_client_profiles")
    .update({ status: "live", updated_at: new Date().toISOString() })
    .eq("client_name", name)
    .eq("status", "onboarding")
    .select("client_name");
  if (error) back("/clients", "error", error.message);
  if (!data?.length) back("/clients", "error", `${name} is not in setup, so nothing changed.`);
  const day = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
  const { data: rules } = await db.from("team_playbooks").select("body").eq("key", "standing_rules").maybeSingle();
  if (rules) {
    await db
      .from("team_playbooks")
      .update({ body: `${rules.body}\n${day} CLIENT LIVE (Harry, portal): ${name} is now live. Treat them as a live client from today.`, updated_at: new Date().toISOString() })
      .eq("key", "standing_rules");
  }
  revalidatePath("/", "layout");
  back("/clients", "ok", `${name} is live. The team has been told.`);
}

/** Edit the details the desks and the ads monitor work from (not the money: that is on Billing details). */
export async function updateClientRecord(formData: FormData) {
  await requireRole("admin");
  const db = createAdminClient();
  const name = str(formData, "client_name");
  const trade = str(formData, "trade");
  if (!trade) back("/clients", "error", "The trade can't be blank.");
  const account = str(formData, "meta_ad_account_id").replace(/\D/g, "") || null;
  const { data: current } = await db.from("ad_client_profiles").select("monitor").eq("client_name", name).maybeSingle();
  if (!current) back("/clients", "error", `No client called ${name}.`);
  const tierKey = str(formData, "tier");
  const { data: tier } = tierKey ? await db.from("offer_tiers").select("key, min_daily_ad_spend, guarantee_leads, guarantee_days").eq("key", tierKey).maybeSingle() : { data: null };
  if (tierKey && !tier) back("/clients", "error", "That tier doesn't exist.");
  const guarantee = tier?.guarantee_leads ? `${tier.guarantee_leads}_in_${tier.guarantee_days}` : "none";
  const { error } = await db
    .from("ad_client_profiles")
    .update({
      trade,
      area: str(formData, "area") || null,
      services: str(formData, "services") || null,
      notes: str(formData, "notes") || null,
      meta_ad_account_id: account,
      meta_page_id: str(formData, "meta_page_id") || null,
      meta_form_id: str(formData, "meta_form_id") || null,
      ...(tier ? { tier: tier.key } : {}),
      // The first time an ad account is added, switch the ads monitor on with the tier's guarantee and ad spend.
      ...(account && !current!.monitor ? { monitor: { guarantee: tier ? guarantee : "30_in_60", go_live: "auto", daily_budget: Number(tier?.min_daily_ad_spend ?? 20) } } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("client_name", name);
  if (error) back("/clients", "error", error.message);
  const { error: contactError } = await db.from("care_contacts").upsert(
    {
      client_name: name,
      contact_name: str(formData, "contact_name") || null,
      ghl_contact_id: str(formData, "ghl_contact_id") || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_name" }
  );
  if (contactError) back("/clients", "error", contactError.message);
  revalidatePath("/", "layout");
  back("/clients", "ok", `${name} saved.`);
}
