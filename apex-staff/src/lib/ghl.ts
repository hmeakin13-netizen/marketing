import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pickCloser } from "./calendly";
import type { ShiftRow, StaffRow } from "./staff/types";

const API = "https://services.leadconnectorhq.com";

export interface GhlConfig {
  token: string;
  location_id: string;
  calendar_id: string;
  webhook_key: string;
  connected_at: string;
  last_sync_at?: string;
  last_sync_count?: number;
  last_error?: string | null;
  last_push_at?: string;
  last_push_error?: string | null;
}

export interface GhlEvent {
  id: string;
  calendarId?: string;
  contactId?: string;
  title?: string;
  startTime: string;
  endTime?: string;
  appointmentStatus?: string;
  assignedUserId?: string;
  dateAdded?: string;
  deleted?: boolean;
  createdBy?: { source?: string; userId?: string | null };
}

interface GhlContact {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  attributionSource?: { utmContent?: string | null; utmCampaign?: string | null; utmSource?: string | null; campaign?: string | null; medium?: string | null } | null;
}

export async function getGhlConfig(admin: SupabaseClient): Promise<GhlConfig | null> {
  const { data } = await admin.from("integrations").select("config").eq("provider", "ghl").maybeSingle();
  const c = data?.config as Partial<GhlConfig> | undefined;
  return c?.token && c.location_id && c.calendar_id ? (c as GhlConfig) : null;
}

export async function saveGhlConfig(admin: SupabaseClient, config: GhlConfig) {
  await admin.from("integrations").upsert({ provider: "ghl", config, updated_at: new Date().toISOString() }, { onConflict: "provider" });
}

export async function ghl<T>(token: string, path: string): Promise<T> {
  const res = await fetch(API + path, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, Version: "2021-04-15", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GoHighLevel ${res.status}: ${(await res.text()).slice(0, 240)}`);
  return (await res.json()) as T;
}

export async function fetchEvents(config: GhlConfig, fromMs: number, toMs: number): Promise<GhlEvent[]> {
  const q = new URLSearchParams({
    locationId: config.location_id,
    calendarId: config.calendar_id,
    startTime: String(fromMs),
    endTime: String(toMs),
  });
  const r = await ghl<{ events?: GhlEvent[] }>(config.token, `/calendars/events?${q}`);
  return r.events ?? [];
}

export async function fetchEvent(config: GhlConfig, id: string): Promise<GhlEvent | null> {
  try {
    const r = await ghl<{ appointment?: GhlEvent; event?: GhlEvent }>(config.token, `/calendars/events/appointments/${encodeURIComponent(id)}`);
    return r.appointment ?? r.event ?? null;
  } catch {
    return null;
  }
}

const matchTag = (tag: string | null | undefined, staff: StaffRow[]) => {
  const t = (tag ?? "").trim().toLowerCase();
  if (!t) return null;
  return (
    staff.find((x) => x.active && (x.email === t || x.full_name.toLowerCase() === t || x.full_name.split(" ")[0].toLowerCase() === t))?.id ?? null
  );
};

/**
 * One GHL appointment -> one portal call.
 * - Same appointment id moving to a new time is a reschedule: the call is kept, set to "needs confirming" again.
 * - Cancelled appointments cancel the call if nobody has logged an outcome yet.
 * - Closer = the GHL user the round-robin assigned; setter = whoever created the booking in GHL.
 */
export async function upsertEvent(
  admin: SupabaseClient,
  ev: GhlEvent,
  ctx: { config: GhlConfig; staff: StaffRow[]; shifts: ShiftRow[]; contacts: Map<string, GhlContact | null> },
  opts: { existingOnly?: boolean } = {}
) {
  if (ev.calendarId && ev.calendarId !== ctx.config.calendar_id) return "skipped";
  const { staff, shifts } = ctx;
  const cancelled = ev.deleted || ev.appointmentStatus === "cancelled" || ev.appointmentStatus === "invalid";

  let { data: existing } = await admin
    .from("calls")
    .select("id, outcome, closer_id, call_at, ghl_event_id")
    .eq("ghl_event_id", ev.id)
    .maybeSingle();

  // Bookings made while Calendly was still in use have no GHL id yet: adopt them by lead + time.
  const contact = ev.contactId ? await loadContact(ctx, ev.contactId) : null;
  const email = contact?.email?.toLowerCase() ?? null;
  const leadName = contact?.name || [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") || ev.title?.replace(/\s*-\s*Sales call$/i, "") || "Unknown lead";
  if (!existing) {
    const t = new Date(ev.startTime).getTime();
    const { data: near } = await admin
      .from("calls")
      .select("id, outcome, closer_id, call_at, ghl_event_id, lead_name, lead_email")
      .is("ghl_event_id", null)
      .gte("call_at", new Date(t - 90000).toISOString())
      .lte("call_at", new Date(t + 90000).toISOString());
    const hit = (near ?? []).find(
      (c) => (email && c.lead_email?.toLowerCase() === email) || c.lead_name?.trim().toLowerCase() === leadName.trim().toLowerCase()
    );
    if (hit) {
      await admin.from("calls").update({ ghl_event_id: ev.id }).eq("id", hit.id);
      existing = hit;
    }
  }

  if (cancelled) {
    if (existing && existing.outcome === "scheduled") {
      await admin.from("calls").update({ outcome: "cancelled", outcome_logged_at: new Date().toISOString() }).eq("id", existing.id);
      return "cancelled";
    }
    return "ignored";
  }

  const closerFromGhl = ev.assignedUserId ? staff.find((x) => x.active && x.ghl_user_id === ev.assignedUserId)?.id ?? null : null;
  const closerId = closerFromGhl ?? pickCloser(ev.startTime, shifts, staff, null);

  const creator = ev.createdBy?.userId ? staff.find((x) => x.active && x.ghl_user_id === ev.createdBy?.userId) : undefined;
  const attr = contact?.attributionSource;
  let setterId: string | null = creator && creator.role === "setter" ? creator.id : null;
  if (!setterId) setterId = matchTag(attr?.utmContent, staff);
  const source = attr?.utmCampaign || attr?.campaign || attr?.utmSource || contact?.source || (setterId ? staff.find((x) => x.id === setterId)?.full_name.split(" ")[0] ?? null : null);

  const row = {
    lead_name: leadName,
    lead_email: contact?.email ?? null,
    lead_phone: contact?.phone ?? null,
    call_at: ev.startTime,
    ...(ev.dateAdded ? { booked_at: ev.dateAdded } : {}),
  };

  if (existing) {
    if (existing.outcome === "scheduled") {
      const timeChanged = new Date(existing.call_at).getTime() !== new Date(ev.startTime).getTime();
      const update: Record<string, unknown> = { ...row, ghl_event_id: ev.id };
      if (timeChanged) {
        update.rescheduled_at = new Date().toISOString();
        update.confirmation = "unconfirmed";
        update.confirmation_note = null;
        update.confirmation_at = null;
        update.confirmation_by = null;
        update.same_day_confirmation = "unconfirmed";
        update.same_day_note = null;
        update.same_day_at = null;
        update.same_day_by = null;
      }
      // Keep the booking date and source of an existing call; closer follows GHL if it was reassigned there.
      delete update.booked_at;
      if (closerFromGhl && closerFromGhl !== existing.closer_id) update.closer_id = closerFromGhl;
      await admin.from("calls").update(update).eq("id", existing.id);
      return timeChanged ? "rescheduled" : "updated";
    }
    return "kept";
  }
  if (opts.existingOnly) return "skipped";

  await admin.from("calls").insert({
    ...row,
    ghl_event_id: ev.id,
    source,
    setter_id: setterId,
    closer_id: closerId,
  });
  return "created";
}

async function loadContact(ctx: { config: GhlConfig; contacts: Map<string, GhlContact | null> }, id: string) {
  if (ctx.contacts.has(id)) return ctx.contacts.get(id) ?? null;
  let c: GhlContact | null = null;
  try {
    c = (await ghl<{ contact?: GhlContact }>(ctx.config.token, `/contacts/${encodeURIComponent(id)}`)).contact ?? null;
  } catch {
    c = null;
  }
  ctx.contacts.set(id, c);
  return c;
}

async function context(admin: SupabaseClient, config: GhlConfig) {
  const [{ data: staffData }, { data: shiftData }] = await Promise.all([admin.from("staff").select("*"), admin.from("closer_shifts").select("*")]);
  return { config, staff: (staffData ?? []) as StaffRow[], shifts: (shiftData ?? []) as ShiftRow[], contacts: new Map<string, GhlContact | null>() };
}

/** Pull the Apex Sales Call calendar from 2 days back to 60 days ahead (covers cancels and reschedules). */
export async function syncGhl(admin: SupabaseClient, config: GhlConfig) {
  const ctx = await context(admin, config);
  let count = 0;
  try {
    const events = await fetchEvents(config, Date.now() - 2 * 86400000, Date.now() + 60 * 86400000);
    for (const ev of events) {
      const isPast = new Date(ev.startTime).getTime() < Date.now() - 3600000;
      await upsertEvent(admin, ev, ctx, { existingOnly: isPast });
      count++;
    }
    await saveGhlConfig(admin, { ...config, last_sync_at: new Date().toISOString(), last_sync_count: count, last_error: null });
  } catch (e) {
    await saveGhlConfig(admin, { ...config, last_error: e instanceof Error ? e.message : "unknown error" });
    throw e;
  }
  return count;
}

export async function syncGhlOne(admin: SupabaseClient, config: GhlConfig, eventId: string) {
  const ev = await fetchEvent(config, eventId);
  if (!ev) return "not found";
  return upsertEvent(admin, ev, await context(admin, config));
}

/** Refresh in the background-ish way: at most every 5 minutes, never throws. */
export async function syncGhlIfStale(admin: SupabaseClient) {
  try {
    const config = await getGhlConfig(admin);
    if (!config) return;
    if (config.last_sync_at && Date.now() - new Date(config.last_sync_at).getTime() < 5 * 60 * 1000) return;
    await syncGhl(admin, config);
  } catch {
    /* shown on the Settings page */
  }
}

// ------------------------------------------------------------------ write-back: call outcome -> GHL pipeline stage

/** Marketing Pipeline in the Apex leads sub-account, and the stage each logged outcome moves the lead to. */
const PIPELINE_ID = "W2ilSmqPa9y2flbkz6B0";
const OUTCOME_STAGE: Record<string, { stageId: string; stage: string; status?: "won" }> = {
  no_show: { stageId: "e99ddd40-a6ff-4448-b897-218ed3939c26", stage: "No show (rebook)" },
  lost: { stageId: "d3aa0927-a523-453c-bed3-1eb2bd08ea74", stage: "No close" },
  follow_up: { stageId: "048d4211-418f-41b8-90c9-496ac474c66a", stage: "Follow up" },
  closed: { stageId: "2f2faf14-7d26-4124-875d-198cdf628252", stage: "Closed - won", status: "won" },
  // "cancelled" and "scheduled" are left alone on purpose.
};

async function ghlSend<T>(token: string, path: string, method: "GET" | "PUT", body?: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "2021-07-28",
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GoHighLevel ${res.status}: ${(await res.text()).slice(0, 240)}`);
  return (await res.json()) as T;
}

async function findContactId(
  config: GhlConfig,
  call: { ghl_event_id: string | null; lead_email: string | null; lead_phone: string | null }
): Promise<string | null> {
  if (call.ghl_event_id) {
    const ev = await fetchEvent(config, call.ghl_event_id);
    if (ev?.contactId) return ev.contactId;
  }
  const tries: Record<string, string>[] = [];
  if (call.lead_email) tries.push({ email: call.lead_email });
  if (call.lead_phone) tries.push({ number: call.lead_phone });
  for (const t of tries) {
    try {
      const q = new URLSearchParams({ locationId: config.location_id, ...t });
      const r = await ghlSend<{ contact?: { id?: string } | null }>(config.token, `/contacts/search/duplicate?${q}`, "GET");
      if (r.contact?.id) return r.contact.id;
    } catch {
      /* try the next way */
    }
  }
  return null;
}

/**
 * After a closer logs an outcome in the portal, move the lead's opportunity in the GHL Marketing Pipeline.
 * Never throws: the outcome is already saved in the portal; a failure is kept on the Settings page.
 */
export async function pushOutcomeToGhl(admin: SupabaseClient, callId: string, outcome: string): Promise<string> {
  const target = OUTCOME_STAGE[outcome];
  if (!target) return "no change";
  try {
    const config = await getGhlConfig(admin);
    if (!config) return "not connected";
    const { data: call } = await admin
      .from("calls")
      .select("lead_name, ghl_event_id, lead_email, lead_phone")
      .eq("id", callId)
      .maybeSingle();
    if (!call) return "call not found";
    const contactId = await findContactId(config, call);
    if (!contactId) throw new Error(`no GHL contact found for ${call.lead_name}`);

    const q = new URLSearchParams({ location_id: config.location_id, contact_id: contactId, pipeline_id: PIPELINE_ID });
    const r = await ghlSend<{ opportunities?: { id: string; pipelineStageId?: string; updatedAt?: string }[] }>(
      config.token,
      `/opportunities/search?${q}`,
      "GET"
    );
    const opps = (r.opportunities ?? []).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    const opp = opps[0];
    if (!opp) throw new Error(`${call.lead_name} has no lead in the Marketing Pipeline`);

    await ghlSend(config.token, `/opportunities/${encodeURIComponent(opp.id)}`, "PUT", {
      pipelineId: PIPELINE_ID,
      pipelineStageId: target.stageId,
      ...(target.status ? { status: target.status } : {}),
    });
    await saveGhlConfig(admin, { ...config, last_push_at: new Date().toISOString(), last_push_error: null });
    return `moved to ${target.stage}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    try {
      const config = await getGhlConfig(admin);
      if (config) await saveGhlConfig(admin, { ...config, last_push_error: `${new Date().toISOString().slice(0, 16)} ${msg}` });
    } catch {
      /* ignore */
    }
    return `not moved: ${msg}`;
  }
}
