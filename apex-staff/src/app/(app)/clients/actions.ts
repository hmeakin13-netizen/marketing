"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/staff/auth";
import { geocodePostcode } from "@/lib/staff/geo";

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
  const setup = money(formData, "setup_fee");
  if ((fee && !(Number(fee) >= 0)) || (setup && !(Number(setup) >= 0))) back(path, "error", "The fees have to be numbers.");
  const billingDay = str(formData, "billing_day");
  if (billingDay && !(Number(billingDay) >= 1 && Number(billingDay) <= 31)) back(path, "error", "The billing day has to be between 1 and 31.");

  // Check the postcode before anything is saved, so a typo does not leave a half-added client.
  const postcode = str(formData, "postcode");
  const geo = postcode ? await geocodePostcode(postcode) : null;
  if (postcode && !geo) back(path, "error", `Couldn't find the postcode "${postcode}". Check it, or leave it blank and add it later.`);

  const { data: retainerId, error } = await supabase.rpc("add_client", {
    p: {
      name,
      trade: str(formData, "trade"),
      area: str(formData, "area"),
      services: str(formData, "services"),
      notes: str(formData, "notes"),
      meta_ad_account_id: str(formData, "meta_ad_account_id"),
      meta_page_id: str(formData, "meta_page_id"),
      meta_form_id: str(formData, "meta_form_id"),
      monthly_fee: fee,
      setup_fee: setup,
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
  if (geo && retainerId) {
    const radius = Number(str(formData, "radius_km"));
    const { error: mapError } = await supabase.from("territories").insert({
      client_id: retainerId,
      name,
      postcode: geo.postcode,
      lat: geo.lat,
      lng: geo.lng,
      radius_km: radius > 0 ? radius : 15,
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
