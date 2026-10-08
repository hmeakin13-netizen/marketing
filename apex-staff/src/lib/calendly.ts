import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ukParts } from "./staff/dates";
import type { ShiftRow, StaffRow } from "./staff/types";

const API = "https://api.calendly.com";

export interface CalendlyConfig {
  token: string;
  signing_key: string;
  organization: string;
  user: string;
  webhook_uri?: string;
  connected_at: string;
  last_sync_at?: string;
  last_sync_count?: number;
}

/** Whatever is stored, even a token with no webhook yet. */
export async function getStored(admin: SupabaseClient): Promise<Partial<CalendlyConfig> | null> {
  const { data } = await admin.from("integrations").select("config").eq("provider", "calendly").maybeSingle();
  return (data?.config as Partial<CalendlyConfig> | undefined) ?? null;
}

/** Only a fully connected setup (token + webhook + signing key). */
export async function getConfig(admin: SupabaseClient): Promise<CalendlyConfig | null> {
  const c = await getStored(admin);
  return c?.token && c.signing_key && c.webhook_uri ? (c as CalendlyConfig) : null;
}

export async function saveConfig(admin: SupabaseClient, config: CalendlyConfig) {
  await admin
    .from("integrations")
    .upsert({ provider: "calendly", config, updated_at: new Date().toISOString() }, { onConflict: "provider" });
}

export async function cal<T>(token: string, pathOrUrl: string, init?: RequestInit): Promise<T> {
  const res = await fetch(pathOrUrl.startsWith("http") ? pathOrUrl : API + pathOrUrl, {
    ...init,
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`Calendly ${res.status}: ${(await res.text()).slice(0, 240)}`);
  return (res.status === 204 ? {} : await res.json()) as T;
}

/** Calendly signs `${timestamp}.${rawBody}` with the key we gave it when creating the webhook. */
export function verifySignature(header: string | null, rawBody: string, key: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.trim().split("=") as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() - Number(t) * 1000) > 5 * 60 * 1000) return false;
  const expected = crypto.createHmac("sha256", key).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface Invitee {
  uri: string;
  created_at?: string | null; // when the booking was made
  email?: string | null;
  name?: string | null;
  status?: string;
  text_reminder_number?: string | null;
  reschedule_url?: string | null;
  rescheduled?: boolean;
  old_invitee?: string | null; // set on the NEW invitee when someone reschedules
  new_invitee?: string | null; // set on the OLD invitee when someone reschedules
  tracking?: Record<string, string | null> | null;
  scheduled_event: {
    uri: string;
    start_time: string;
    status?: string;
    event_memberships?: { user_email?: string | null }[];
  };
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Who takes this call? By the closer's shift (UK time), then by the Calendly host email. */
export function pickCloser(startIso: string, shifts: ShiftRow[], staff: StaffRow[], hostEmail?: string | null) {
  const p = ukParts(new Date(startIso));
  const mins = p.hour * 60 + p.minute;
  for (const s of shifts) {
    if (!s.days.includes(p.isoDow)) continue;
    if (mins >= toMinutes(s.start_time) && mins < toMinutes(s.end_time)) {
      if (staff.some((x) => x.id === s.staff_id && x.active)) return s.staff_id;
    }
  }
  if (hostEmail) {
    const h = hostEmail.toLowerCase();
    const m = staff.find((x) => x.active && (x.email === h || x.calendly_email?.toLowerCase() === h));
    if (m) return m.id;
  }
  return null;
}

/** A setter can tag a booking link with ?utm_content=kyle (or their email / full name). */
export function pickSetter(tracking: Invitee["tracking"], staff: StaffRow[]) {
  const tag = (tracking?.utm_content || tracking?.utm_term || "").trim().toLowerCase();
  if (!tag) return null;
  const m = staff.find(
    (x) =>
      x.active &&
      (x.email === tag || x.full_name.toLowerCase() === tag || x.full_name.split(" ")[0].toLowerCase() === tag)
  );
  return m?.id ?? null;
}

export async function upsertInvitee(admin: SupabaseClient, inv: Invitee, opts: { existingOnly?: boolean } = {}) {
  const [{ data: staffData }, { data: shiftData }] = await Promise.all([
    admin.from("staff").select("*"),
    admin.from("closer_shifts").select("*"),
  ]);
  const staff = (staffData ?? []) as StaffRow[];
  const shifts = (shiftData ?? []) as ShiftRow[];
  const start = inv.scheduled_event.start_time;

  let { data: existing } = await admin
    .from("calls")
    .select("id, outcome, closer_id, call_at")
    .eq("calendly_invitee_uri", inv.uri)
    .maybeSingle();

  // A reschedule arrives as a cancel of the old booking plus a new booking that points back at it.
  // Treat it as the SAME call moving: keep its notes, source, setter and original booking date.
  let moved = false;
  if (!existing && inv.old_invitee) {
    const { data: old } = await admin
      .from("calls")
      .select("id, outcome, closer_id, call_at")
      .eq("calendly_invitee_uri", inv.old_invitee)
      .maybeSingle();
    if (old) {
      await admin.from("calls").update({ calendly_invitee_uri: inv.uri }).eq("id", old.id);
      existing = old;
      moved = true;
    }
  }

  if (inv.rescheduled && (inv.status === "canceled" || inv.scheduled_event.status === "canceled")) {
    // The new booking carries the call forward, so don't mark this one cancelled.
    return "rescheduled";
  }

  if (inv.status === "canceled" || inv.scheduled_event.status === "canceled") {
    if (existing && existing.outcome === "scheduled") {
      await admin.from("calls").update({ outcome: "cancelled", outcome_logged_at: new Date().toISOString() }).eq("id", existing.id);
    }
    return "cancelled";
  }

  const host = inv.scheduled_event.event_memberships?.[0]?.user_email ?? null;
  let source: string | null = inv.tracking?.utm_campaign || inv.tracking?.utm_source || null;
  let setterId = pickSetter(inv.tracking, staff);
  // With a single setter, they set every call. A booking with no campaign tag at all is one they
  // booked by hand, so its source is their name (that's what counts towards their "calls booked").
  const setters = staff.filter((x) => x.active && x.role === "setter");
  if (!setterId && setters.length === 1) setterId = setters[0].id;
  if (!source && setterId) {
    const who = staff.find((x) => x.id === setterId);
    if (who) source = who.full_name.split(" ")[0];
  }

  const row = {
    lead_name: inv.name || inv.email || "Unknown lead",
    lead_email: inv.email ?? null,
    lead_phone: inv.text_reminder_number ?? null,
    source,
    call_at: start,
    // "Calls booked" counts from the day the booking was made, not the day of the call.
    ...(inv.created_at ? { booked_at: inv.created_at } : {}),
  };

  if (existing) {
    // Only touch calls nobody has worked on yet (e.g. a reschedule).
    if (existing.outcome === "scheduled") {
      const timeChanged = new Date(existing.call_at).getTime() !== new Date(start).getTime();
      const update: Record<string, unknown> = {
        ...row,
        source: undefined,
        reschedule_url: inv.reschedule_url ?? null,
        ...(inv.created_at && !moved ? { booked_at: inv.created_at } : { booked_at: undefined }),
      };
      if (timeChanged) {
        // New time: it needs confirming again, and the closer on shift may be different.
        update.rescheduled_at = new Date().toISOString();
        update.confirmation = "unconfirmed";
        update.confirmation_note = null;
        update.confirmation_at = null;
        update.confirmation_by = null;
        update.same_day_confirmation = "unconfirmed";
        update.same_day_note = null;
        update.same_day_at = null;
        update.same_day_by = null;
        const pick = pickCloser(start, shifts, staff, host);
        if (pick) update.closer_id = pick;
      }
      await admin.from("calls").update(update).eq("id", existing.id);
    }
    return moved ? "rescheduled" : "updated";
  }
  if (opts.existingOnly) return "skipped";

  await admin.from("calls").insert({
    ...row,
    calendly_invitee_uri: inv.uri,
    reschedule_url: inv.reschedule_url ?? null,
    setter_id: setterId,
    closer_id: pickCloser(start, shifts, staff, host),
  });
  return "created";
}

interface Paged<T> {
  collection: T[];
  pagination?: { next_page?: string | null };
}

/** Pull every upcoming active booking (covers anything made before the webhook existed). */
export async function syncUpcoming(admin: SupabaseClient, config: CalendlyConfig) {
  const base = `/scheduled_events?organization=${encodeURIComponent(config.organization)}&status=active&count=100&sort=start_time:asc&min_start_time=${encodeURIComponent(new Date(Date.now() - 2 * 86400000).toISOString())}`;
  let url: string | null = base;
  let pages = 0;
  let count = 0;
  while (url && pages < 5) {
    const page: Paged<Invitee["scheduled_event"] & { uri: string }> = await cal(config.token, url);
    for (const ev of page.collection) {
      const inv: Paged<Invitee> = await cal(config.token, `${ev.uri}/invitees?count=100&status=active`);
      for (const i of inv.collection) {
        // Recent past calls are only refreshed (e.g. their true booking date), never newly imported.
        const isPast = new Date(ev.start_time).getTime() < Date.now();
        await upsertInvitee(admin, { ...i, scheduled_event: ev }, { existingOnly: isPast });
        count++;
      }
    }
    url = page.pagination?.next_page ?? null;
    pages++;
  }
  await saveConfig(admin, { ...config, last_sync_at: new Date().toISOString(), last_sync_count: count });
  return count;
}
