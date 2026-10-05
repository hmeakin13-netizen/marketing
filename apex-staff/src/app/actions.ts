"use server";

import { geocodePostcode } from "@/lib/staff/geo";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireRole, requireStaff, isManager } from "@/lib/staff/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { midMonthRun, monthEndRun, parseUkLocal, todayIso } from "@/lib/staff/dates";
import { dealWaitingFor } from "@/lib/staff/pay";
import type { CloseRow } from "@/lib/staff/types";
import { cleanFathomUrl, needsRecording, RECORDING_HELP } from "@/lib/staff/recording";
import { createInvoice, emailInvoice, issueDealInvoices } from "@/lib/invoices";
import { emailConfigured } from "@/lib/email";
import { cal, getConfig, getStored, pickCloser, saveConfig, syncUpcoming, type CalendlyConfig } from "@/lib/calendly";
import type { ShiftRow, StaffRow } from "@/lib/staff/types";
import type { StaffRole, PaymentType } from "@/lib/staff/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optStr = (f: FormData, k: string) => str(f, k) || null;
const num = (f: FormData, k: string) => {
  const raw = str(f, k).replace(/[£,\s]/g, "");
  return raw === "" ? NaN : Number(raw);
};

function back(path: string, kind: "error" | "ok", message: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

/** Issue any same-day sale invoices that have just become payable. Never blocks the user's action. */
async function issuePayouts(closeId: string) {
  try {
    await issueDealInvoices(createAdminClient(), closeId);
  } catch {
    // The daily job picks up anything missed.
  }
}

// ------------------------------------------------------------------ calls

export async function bookCall(formData: FormData) {
  const { supabase, me } = await requireStaff();
  const path = "/calls";

  const leadName = str(formData, "lead_name");
  const callAt = parseUkLocal(str(formData, "call_at"));
  if (!leadName) back(path, "error", "Add the lead's name.");
  if (!callAt) back(path, "error", "Pick a date and time for the call.");

  // Setters can only book as themselves; managers/admin can book for anyone.
  const setterId = isManager(me.role)
    ? optStr(formData, "setter_id")
    : me.role === "setter"
      ? me.id
      : optStr(formData, "setter_id");
  const closerId = me.role === "closer" ? me.id : optStr(formData, "closer_id");

  const { error } = await supabase.from("calls").insert({
    lead_name: leadName,
    lead_email: optStr(formData, "lead_email"),
    lead_phone: optStr(formData, "lead_phone"),
    source: optStr(formData, "source"),
    setter_id: setterId,
    closer_id: closerId,
    call_at: callAt!.toISOString(),
    notes: optStr(formData, "notes"),
  });
  if (error) back(path, "error", error.message);

  revalidatePath("/", "layout");
  back(path, "ok", `Call booked for ${leadName}.`);
}

export async function logOutcome(formData: FormData) {
  const { supabase, me } = await requireStaff();
  const path = "/calls";
  const callId = str(formData, "call_id");
  const outcome = str(formData, "outcome");
  if (!["no_show", "cancelled", "follow_up", "lost", "closed", "scheduled"].includes(outcome)) {
    back(path, "error", "Pick an outcome.");
  }

  const { data: call } = await supabase
    .from("calls")
    .select("id, lead_name, setter_id, closer_id, outcome")
    .eq("id", callId)
    .single();
  if (!call) back(path, "error", "Couldn't find that call.");
  if (call!.outcome === "closed") {
    back(path, "error", "That call is already closed — edit the deal on the Deals page.");
  }

  // A call that happened must have its Fathom recording attached. No exceptions.
  let recordingUrl: string | null = optStr(formData, "recording_url");
  if (needsRecording(outcome)) {
    recordingUrl = cleanFathomUrl(recordingUrl ?? "");
    if (!recordingUrl) {
      back(path, "error", `The Fathom recording link is required, and it has to be a Fathom link. ${RECORDING_HELP}`);
    }
  }

  const update: Record<string, unknown> = {
    outcome,
    outcome_logged_at: new Date().toISOString(),
    recording_url: recordingUrl,
    notes: optStr(formData, "notes"),
  };
  // Whoever logs a closer's outcome and there's no closer yet becomes the closer.
  if (!call!.closer_id && me.role === "closer") update.closer_id = me.id;

  if (outcome === "closed") {
    const dealValue = num(formData, "deal_value");
    const paymentType = str(formData, "payment_type") as PaymentType;
    let cash = num(formData, "cash_collected");
    if (!(dealValue > 0)) back(path, "error", "Enter the deal value.");
    if (!["paid_in_full", "deposit", "payment_plan"].includes(paymentType)) {
      back(path, "error", "Choose how it was paid (in full, deposit or plan).");
    }
    if (paymentType === "paid_in_full" && Number.isNaN(cash)) cash = dealValue;
    if (Number.isNaN(cash) || cash < 0) back(path, "error", "Enter the cash collected (0 if none).");
    if (cash > dealValue) back(path, "error", "Cash collected is more than the deal value.");

    const closerId = (update.closer_id as string | undefined) ?? call!.closer_id ?? me.id;
    update.closer_id = closerId;

    const { error: callErr } = await supabase.from("calls").update(update).eq("id", callId);
    if (callErr) back(path, "error", callErr.message);

    const { data: close, error: closeErr } = await supabase
      .from("closes")
      .insert({
        call_id: callId,
        closer_id: closerId,
        setter_id: call!.setter_id,
        deal_value: dealValue,
        payment_type: paymentType,
        next_payment_due: optStr(formData, "next_payment_due"),
        contract_signed_at: formData.get("contract_signed") === "on" ? todayIso() : null,
      })
      .select("id")
      .single();
    if (closeErr || !close) back(path, "error", closeErr?.message ?? "Couldn't save the deal.");

    if (cash > 0) {
      const { error: payErr } = await supabase
        .from("payments")
        .insert({ close_id: close!.id, amount: cash });
      if (payErr) back(path, "error", payErr.message);
    }

    // They're staying on a monthly retainer: add them to the Clients list straight away.
    const monthly = num(formData, "monthly_retainer");
    if (monthly > 0) {
      try {
        const today = todayIso();
        await createAdminClient().from("retainer_clients").insert({
          name: call!.lead_name,
          closer_id: closerId,
          setter_id: call!.setter_id,
          close_id: close!.id,
          setup_fee: dealValue,
          monthly_fee: monthly,
          start_date: today,
          billing_day: Number(today.slice(8, 10)),
        });
      } catch {
        // The deal itself is saved; the client can still be added by hand on the Clients page.
      }
    }

    await issuePayouts(close!.id);
  } else {
    const { error } = await supabase.from("calls").update(update).eq("id", callId);
    if (error) back(path, "error", error.message);
  }

  revalidatePath("/", "layout");
  back(path, "ok", `Saved: ${call!.lead_name}.`);
}

// ------------------------------------------------------------------ deals

export async function addPayment(formData: FormData) {
  const { supabase } = await requireStaff();
  const path = "/deals";
  const amount = num(formData, "amount");
  if (!(amount > 0)) back(path, "error", "Enter the amount received.");

  const closeId = str(formData, "close_id");
  const { data: close } = await supabase
    .from("closes")
    .select("deal_value, payments(amount)")
    .eq("id", closeId)
    .single();
  if (!close) back(path, "error", "Couldn't find that deal.");
  const paid = (close!.payments as { amount: number }[]).reduce((s, p) => s + Number(p.amount), 0);
  if (paid + amount > Number(close!.deal_value) + 0.001) {
    back(path, "error", "That would take the total paid over the deal value.");
  }

  const { error } = await supabase.from("payments").insert({
    close_id: closeId,
    amount,
    note: optStr(formData, "note"),
  });
  if (error) back(path, "error", error.message);

  // Clear the due date once the deal is fully paid; otherwise take the new one.
  const fullyPaid = paid + amount >= Number(close!.deal_value) - 0.001;
  await supabase
    .from("closes")
    .update({ next_payment_due: fullyPaid ? null : optStr(formData, "next_payment_due") })
    .eq("id", closeId);
  await issuePayouts(closeId);

  revalidatePath("/", "layout");
  back(path, "ok", "Payment recorded.");
}

export async function updateDeal(formData: FormData) {
  const { supabase } = await requireStaff();
  const path = "/deals";
  const dealValue = num(formData, "deal_value");
  if (!(dealValue > 0)) back(path, "error", "Enter the deal value.");

  const { error } = await supabase
    .from("closes")
    .update({
      deal_value: dealValue,
      payment_type: str(formData, "payment_type"),
      next_payment_due: optStr(formData, "next_payment_due"),
      notes: optStr(formData, "notes"),
    })
    .eq("id", str(formData, "close_id"));
  if (error) back(path, "error", error.message);

  revalidatePath("/", "layout");
  back(path, "ok", "Deal updated (change logged).");
}

export async function deletePayment(formData: FormData) {
  const { supabase } = await requireRole("admin", "manager");
  const { error } = await supabase.from("payments").delete().eq("id", str(formData, "payment_id"));
  if (error) back("/deals", "error", error.message);
  revalidatePath("/", "layout");
  back("/deals", "ok", "Payment removed (logged in the audit trail).");
}

// ------------------------------------------------------------------ chasing

export async function logChase(formData: FormData) {
  const { supabase, me } = await requireStaff();
  const path = "/attention";
  const closeId = optStr(formData, "close_id");
  const callId = optStr(formData, "call_id");
  const note = optStr(formData, "note");
  if (!closeId && !callId) back(path, "error", "Nothing to chase.");
  if (!note) back(path, "error", "Add a quick note on what you did (called, texted, they said Friday…).");

  const { error } = await supabase
    .from("chases")
    .insert({ close_id: closeId, call_id: callId, note, chased_by: me.id });
  if (error) back(path, "error", error.message);

  // They promised a new date? Keep the deal's due date in step.
  const newDue = optStr(formData, "next_payment_due");
  if (closeId && newDue) await supabase.from("closes").update({ next_payment_due: newDue }).eq("id", closeId);

  revalidatePath("/", "layout");
  back(path, "ok", "Chase logged — nice.");
}

export async function markFollowUpLost(formData: FormData) {
  const { supabase } = await requireStaff();
  const callId = str(formData, "call_id");
  const { error } = await supabase
    .from("calls")
    .update({ outcome: "lost", outcome_logged_at: new Date().toISOString() })
    .eq("id", callId)
    .eq("outcome", "follow_up");
  if (error) back("/attention", "error", error.message);
  revalidatePath("/", "layout");
  back("/attention", "ok", "Marked as lost.");
}

// ------------------------------------------------------------------ targets

export async function saveTargets(formData: FormData) {
  const { supabase } = await requireRole("admin", "manager");
  const path = "/targets";
  const staffId = str(formData, "staff_id");
  const metrics = ["calls_booked", "calls_taken", "show_rate", "close_rate", "closes", "cash_collected"];

  for (const [prefix, period] of [["w_", "week"], ["m_", "month"]] as const) {
    for (const metric of metrics) {
      if (!formData.has(prefix + metric)) continue;
      const value = num(formData, prefix + metric);
      if (Number.isNaN(value) || value < 0) {
        // Blank = clear the target.
        await supabase.from("targets").delete().match({ staff_id: staffId, metric, period });
      } else {
        const { error } = await supabase
          .from("targets")
          .upsert({ staff_id: staffId, metric, period, target: value }, { onConflict: "staff_id,metric,period" });
        if (error) back(path, "error", error.message);
      }
    }
  }
  revalidatePath("/", "layout");
  back(path, "ok", "Targets saved.");
}

// ------------------------------------------------------------------ team (admin)

const DEFAULT_BASIS = {
  closer: "own_closes",
  setter: "own_bookings",
  manager: "team_cash",
  admin: "team_cash",
} as const;

export async function addPerson(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const path = "/team";
  const email = str(formData, "email").toLowerCase();
  const fullName = str(formData, "full_name");
  const role = str(formData, "role") as StaffRole;
  if (!email || !fullName) back(path, "error", "Name and email are both needed.");
  if (!["manager", "closer", "setter", "admin"].includes(role)) back(path, "error", "Pick a role.");

  // Re-adding someone who left? Reactivate instead of duplicating.
  const { data: existing } = await supabase.from("staff").select("id").eq("email", email).maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("staff")
      .update({ full_name: fullName, role, active: true, deactivated_at: null })
      .eq("id", existing.id);
    if (error) back(path, "error", error.message);
  } else {
    const { data: created, error } = await supabase
      .from("staff")
      .insert({ email, full_name: fullName, role })
      .select("id")
      .single();
    if (error || !created) back(path, "error", error?.message ?? "Couldn't add them.");
    await supabase.from("staff_pay").insert({ staff_id: created!.id, basis: DEFAULT_BASIS[role] });
  }

  // Optionally give them a login now (public sign-up is off, so we create it here).
  // Leave "Give login now" unticked to add someone for attribution only.
  const giveLogin = formData.get("give_login") === "on";
  if (giveLogin) {
    const failed = await createLogin(email);
    if (failed) {
      back(path, "error", `${fullName} was added but their login couldn't be created (${failed}). Check SUPABASE_SERVICE_ROLE_KEY.`);
    }
    await supabase.from("staff").update({ login_enabled: true }).eq("email", email);
  } else {
    await supabase.from("staff").update({ login_enabled: false }).eq("email", email);
  }

  revalidatePath("/", "layout");
  back(
    path,
    "ok",
    giveLogin
      ? `${fullName} added. Tell them to open the team login page and use ${email}.`
      : `${fullName} added with no login yet. Click "Give access" when you want them to be able to sign in.`
  );
}

/** Creates (or un-bans) the Supabase Auth user. Returns an error message, or null on success. */
async function createLogin(email: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error && !/already|registered|exists/i.test(error.message)) return error.message;
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const u = data?.users.find((x) => x.email?.toLowerCase() === email);
    if (u) await admin.auth.admin.updateUserById(u.id, { ban_duration: "none" });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "unknown error";
  }
}

export async function giveAccess(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const path = "/team";
  const { data: person } = await supabase.from("staff").select("*").eq("id", str(formData, "staff_id")).single();
  if (!person) back(path, "error", "Couldn't find that person.");
  const failed = await createLogin(person!.email);
  if (failed) back(path, "error", `Couldn't create the login: ${failed}`);
  await supabase.from("staff").update({ login_enabled: true }).eq("id", person!.id);
  revalidatePath("/", "layout");
  back(path, "ok", `${person!.full_name} can now sign in with ${person!.email}.`);
}

export async function updatePerson(formData: FormData) {
  const { supabase, me } = await requireRole("admin");
  const path = "/team";
  const id = str(formData, "staff_id");
  const intent = str(formData, "intent");

  const { data: person } = await supabase.from("staff").select("*").eq("id", id).single();
  if (!person) back(path, "error", "Couldn't find that person.");

  if (intent === "deactivate" || intent === "reactivate") {
    if (person!.id === me.id) back(path, "error", "You can't deactivate yourself.");
    const active = intent === "reactivate";
    const { error } = await supabase
      .from("staff")
      .update({ active, deactivated_at: active ? null : new Date().toISOString() })
      .eq("id", id);
    if (error) back(path, "error", error.message);

    // Also lock/unlock their login so any open session dies immediately.
    try {
      const admin = createAdminClient();
      const { data } = await admin.auth.admin.listUsers();
      const u = data?.users.find((x) => x.email?.toLowerCase() === person!.email);
      if (u) await admin.auth.admin.updateUserById(u.id, { ban_duration: active ? "none" : "876000h" });
    } catch {
      // RLS + the active flag already cut their access; the ban is belt-and-braces.
    }
    revalidatePath("/", "layout");
    back(path, "ok", `${person!.full_name} ${active ? "reactivated" : "deactivated — history kept"}.`);
  }

  const role = str(formData, "role") as StaffRole;
  const fullName = str(formData, "full_name") || person!.full_name;
  if (person!.id === me.id && role !== "admin") back(path, "error", "You can't change your own role.");
  const { error } = await supabase
    .from("staff")
    .update({
      role,
      full_name: fullName,
      calendly_email: optStr(formData, "calendly_email"),
      manager_id: optStr(formData, "manager_id"),
    })
    .eq("id", id);
  if (error) back(path, "error", error.message);
  revalidatePath("/", "layout");
  back(path, "ok", "Saved.");
}

// ------------------------------------------------------------------ pay (admin)

export async function savePay(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const pct = num(formData, "commission_pct");
  const ovr = num(formData, "override_pct");
  const ret = num(formData, "retainer_monthly");
  const share = num(formData, "retainer_share_pct");
  const setupPct = num(formData, "setup_commission_pct");
  const setupFlat = num(formData, "setup_commission_flat");
  const { error } = await supabase.from("staff_pay").upsert(
    {
      staff_id: str(formData, "staff_id"),
      commission_pct: Number.isNaN(pct) ? 0 : pct,
      basis: str(formData, "basis"),
      retainer_monthly: Number.isNaN(ret) ? 0 : ret,
      retainer_share_pct: Number.isNaN(share) ? 0 : share,
      setup_commission_pct: Number.isNaN(setupPct) ? 0 : setupPct,
      setup_commission_flat: Number.isNaN(setupFlat) ? 0 : setupFlat,
      override_pct: Number.isNaN(ovr) ? 0 : ovr,
      override_basis: ["cash", "deal_value"].includes(str(formData, "override_basis")) ? str(formData, "override_basis") : "client_fee",
      pay_schedule: str(formData, "pay_schedule") === "semi_monthly" ? "semi_monthly" : "monthly",
      payee_name: optStr(formData, "payee_name"),
      vat_number: optStr(formData, "vat_number"),
      agreement_date: optStr(formData, "agreement_date"),
    },
    { onConflict: "staff_id" }
  );
  if (error) back("/pay", "error", error.message);
  revalidatePath("/pay");
  back("/pay", "ok", "Pay settings saved.");
}

// ------------------------------------------------------------------ invoices (admin)

export async function generateInvoice(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const path = "/invoices";
  const staffId = str(formData, "staff_id");
  const { data: cfg } = await supabase.from("staff_pay").select("pay_schedule").eq("staff_id", staffId).maybeSingle();
  const schedule = cfg?.pay_schedule === "semi_monthly" ? "semi_monthly" : "monthly";
  const run = str(formData, "which") === "mid_month" ? midMonthRun() : monthEndRun(schedule);

  let message = "";
  let failed: string | null = null;
  try {
    const admin = createAdminClient();
    const res = await createInvoice(admin, staffId, run);
    if (res.skipped === "nothing_owed") message = `Nothing owed for ${run.label}, so no invoice was created.`;
    else if (res.skipped === "exists") message = `An invoice for ${run.label} already exists.`;
    else if (res.invoice) {
      const err = emailConfigured() ? await emailInvoice(admin, res.invoice) : "email not set up yet";
      message = err
        ? `Invoice created for ${run.label}, but it wasn't emailed (${err}). You can download it below.`
        : `Invoice created for ${run.label} and emailed.`;
    }
  } catch (e) {
    failed = e instanceof Error ? e.message : "unknown error";
  }
  if (failed) back(path, "error", failed);
  revalidatePath("/invoices");
  back(path, "ok", message);
}

export async function resendInvoice(formData: FormData) {
  await requireRole("admin");
  const admin = createAdminClient();
  const { data: inv } = await admin.from("invoices").select("*").eq("id", str(formData, "invoice_id")).single();
  if (!inv) back("/invoices", "error", "Couldn't find that invoice.");
  const err = await emailInvoice(admin, inv!);
  revalidatePath("/invoices");
  if (err) back("/invoices", "error", `Not emailed: ${err}`);
  back("/invoices", "ok", "Invoice emailed.");
}

export async function setInvoiceStatus(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const status = str(formData, "status");
  if (!["issued", "paid", "void"].includes(status)) back("/invoices", "error", "Bad status.");
  const { error } = await supabase
    .from("invoices")
    .update({ status, paid_at: status === "paid" ? new Date().toISOString() : null })
    .eq("id", str(formData, "invoice_id"));
  if (error) back("/invoices", "error", error.message);
  revalidatePath("/invoices");
  back("/invoices", "ok", status === "void" ? "Invoice voided — you can generate a new one for that period." : "Updated.");
}

// ------------------------------------------------------------------ calendly (admin)

export async function connectCalendly(formData: FormData) {
  await requireRole("admin");
  const path = "/settings";
  // A pasted token wins; otherwise use the one already saved on the server.
  const token = str(formData, "token") || (await getStored(createAdminClient()))?.token || "";
  if (!token) back(path, "error", "Paste your Calendly personal access token.");

  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const callback = `${proto}://${host}/api/calendly/webhook`;

  let error: string | null = null;
  let count = 0;
  try {
    const me = await cal<{ resource: { uri: string; current_organization: string } }>(token, "/users/me");
    const organization = me.resource.current_organization;
    const user = me.resource.uri;
    const admin = createAdminClient();

    // Replace any older subscription pointing at this site so we always know the signing key.
    const existing = await cal<{ collection: { uri: string; callback_url: string }[] }>(
      token,
      `/webhook_subscriptions?organization=${encodeURIComponent(organization)}&scope=organization&count=100`
    );
    for (const w of existing.collection) {
      if (w.callback_url === callback) await cal(token, w.uri, { method: "DELETE" });
    }

    const signing_key = crypto.randomBytes(32).toString("hex");
    const created = await cal<{ resource: { uri: string } }>(token, "/webhook_subscriptions", {
      method: "POST",
      body: JSON.stringify({
        url: callback,
        events: ["invitee.created", "invitee.canceled"],
        organization,
        scope: "organization",
        signing_key,
      }),
    });

    const config: CalendlyConfig = {
      token,
      signing_key,
      organization,
      user,
      webhook_uri: created.resource.uri,
      connected_at: new Date().toISOString(),
    };
    await saveConfig(admin, config);
    count = await syncUpcoming(admin, config);
  } catch (e) {
    error = e instanceof Error ? e.message : "unknown error";
  }
  if (error) back(path, "error", `Couldn't connect Calendly: ${error}`);
  revalidatePath("/", "layout");
  back(path, "ok", `Calendly connected. New bookings now arrive automatically; ${count} upcoming booking${count === 1 ? "" : "s"} imported.`);
}

export async function syncCalendly() {
  await requireRole("admin", "manager");
  const admin = createAdminClient();
  const config = await getConfig(admin);
  if (!config) back("/settings", "error", "Calendly isn't connected yet.");
  let count = 0;
  let error: string | null = null;
  try {
    count = await syncUpcoming(admin, config!);
  } catch (e) {
    error = e instanceof Error ? e.message : "unknown error";
  }
  if (error) back("/settings", "error", `Sync failed: ${error}`);
  revalidatePath("/", "layout");
  back("/settings", "ok", `Synced ${count} upcoming booking${count === 1 ? "" : "s"}.`);
}

export async function saveShift(formData: FormData) {
  const { supabase } = await requireRole("admin", "manager");
  const staffId = str(formData, "staff_id");
  if (formData.get("clear") === "1") {
    await supabase.from("closer_shifts").delete().eq("staff_id", staffId);
    revalidatePath("/", "layout");
    back("/settings", "ok", "Shift cleared.");
  }
  const start = str(formData, "start_time");
  const end = str(formData, "end_time");
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => formData.get(`d${d}`) === "on");
  if (!start || !end || end <= start) back("/settings", "error", "Pick a start time that's before the end time.");
  if (days.length === 0) back("/settings", "error", "Pick at least one day.");
  const { error } = await supabase
    .from("closer_shifts")
    .upsert({ staff_id: staffId, start_time: start, end_time: end, days }, { onConflict: "staff_id" });
  if (error) back("/settings", "error", error.message);
  revalidatePath("/", "layout");
  back("/settings", "ok", "Shift saved.");
}

// ------------------------------------------------------------------ retainer clients (admin)

export async function addClient(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const path = "/clients";
  const fee = num(formData, "monthly_fee");
  const setup = num(formData, "setup_fee");
  const closeId = optStr(formData, "close_id");

  let name = str(formData, "name");
  let closerId = optStr(formData, "closer_id");
  let setterId = optStr(formData, "setter_id");
  let startDate = optStr(formData, "start_date");

  // Pre-fill anything left blank from the closed deal it came from.
  if (closeId) {
    const { data: deal } = await supabase
      .from("closes")
      .select("closer_id, setter_id, closed_at, calls(lead_name)")
      .eq("id", closeId)
      .single();
    if (deal) {
      name ||= (deal.calls as unknown as { lead_name?: string } | null)?.lead_name ?? "";
      closerId ||= deal.closer_id;
      setterId ||= deal.setter_id;
      startDate ||= String(deal.closed_at).slice(0, 10);
    }
  }
  if (!name) back(path, "error", "Add the client's name.");
  if (!startDate) back(path, "error", "Add the date they signed.");
  if (Number.isNaN(fee) || fee < 0) back(path, "error", "Add their monthly retainer (£).");
  if (!closerId) back(path, "error", "Pick who closed them.");

  const billing = parseInt(str(formData, "billing_day"), 10);
  const billingDay = billing >= 1 && billing <= 31 ? billing : Number(startDate!.slice(8, 10));

  const postcode = str(formData, "postcode");
  const geo = postcode ? await geocodePostcode(postcode) : null;
  if (postcode && !geo) back(path, "error", `Couldn't find the postcode "${postcode}". Check it, or leave it blank and add it later.`);

  const { data: created, error } = await supabase.from("retainer_clients").insert({
    name,
    closer_id: closerId,
    setter_id: setterId,
    close_id: closeId,
    monthly_fee: fee,
    setup_fee: Number.isNaN(setup) || setup < 0 ? 0 : setup,
    start_date: startDate,
    billing_day: billingDay,
    notes: optStr(formData, "notes"),
  }).select("id").single();
  if (error) back(path, "error", error.message);
  if (geo && created) {
    const radius = num(formData, "radius_km");
    await supabase.from("territories").insert({
      client_id: created.id,
      name,
      postcode: geo.postcode,
      lat: geo.lat,
      lng: geo.lng,
      radius_km: Number.isNaN(radius) || radius <= 0 ? 15 : radius,
    });
  }
  revalidatePath("/", "layout");
  back(path, "ok", `${name} added.`);
}

export async function updateClient(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const fee = num(formData, "monthly_fee");
  if (Number.isNaN(fee) || fee < 0) back("/clients", "error", "Enter the monthly retainer.");
  const billing = parseInt(str(formData, "billing_day"), 10);
  const setupFee = num(formData, "setup_fee");
  const { error } = await supabase
    .from("retainer_clients")
    .update({
      monthly_fee: fee,
      setup_fee: Number.isNaN(setupFee) || setupFee < 0 ? 0 : setupFee,
      billing_day: billing >= 1 && billing <= 31 ? billing : 1,
      closer_id: optStr(formData, "closer_id"),
      setter_id: optStr(formData, "setter_id"),
      notes: optStr(formData, "notes"),
    })
    .eq("id", str(formData, "client_id"));
  if (error) back("/clients", "error", error.message);
  revalidatePath("/", "layout");
  back("/clients", "ok", "Client updated.");
}

/** Set where a client is based; blocks `radius_km` around their postcode for new clients. Admin only. */
export async function saveClientLocation(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const clientId = str(formData, "client_id");
  const postcode = str(formData, "postcode");
  const radius = num(formData, "radius_km");
  const { data: client } = await supabase.from("retainer_clients").select("name, end_date").eq("id", clientId).single();
  if (!client) back("/clients", "error", "Client not found.");
  if (!postcode) {
    await supabase.from("territories").delete().eq("client_id", clientId);
    revalidatePath("/", "layout");
    back("/clients", "ok", "Location removed from the map.");
  }
  const geo = await geocodePostcode(postcode);
  if (!geo) back("/clients", "error", `Couldn't find the postcode "${postcode}". Check it and try again.`);
  const { error } = await supabase.from("territories").upsert(
    {
      client_id: clientId,
      name: client!.name,
      postcode: geo!.postcode,
      lat: geo!.lat,
      lng: geo!.lng,
      radius_km: Number.isNaN(radius) || radius <= 0 ? 15 : radius,
      active: !client!.end_date,
    },
    { onConflict: "client_id" }
  );
  if (error) back("/clients", "error", error.message);
  revalidatePath("/", "layout");
  back("/clients", "ok", `${client!.name} is on the map (${geo!.postcode}).`);
}

export async function endClient(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const leftOn = optStr(formData, "end_date") ?? new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("retainer_clients")
    .update({ end_date: leftOn })
    .eq("id", str(formData, "client_id"));
  if (error) back("/clients", "error", error.message);
  await supabase.from("territories").update({ active: false }).eq("client_id", str(formData, "client_id"));
  revalidatePath("/", "layout");
  back("/clients", "ok", "Client ended. Nothing further is owed on them from the next payment onwards.");
}

export async function reinstateClient(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const { error } = await supabase.from("retainer_clients").update({ end_date: null }).eq("id", str(formData, "client_id"));
  if (error) back("/clients", "error", error.message);
  await supabase.from("territories").update({ active: true }).eq("client_id", str(formData, "client_id"));
  revalidatePath("/", "layout");
  back("/clients", "ok", "Client reinstated.");
}

// ------------------------------------------------------------------ call assignment (admin)

export async function assignCall(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const callId = str(formData, "call_id");
  const setterId = optStr(formData, "setter_id");
  const closerId = optStr(formData, "closer_id");

  const { error } = await supabase.from("calls").update({ setter_id: setterId, closer_id: closerId }).eq("id", callId);
  if (error) back("/calls", "error", error.message);

  // If this call was already closed, pay follows the deal, so keep the deal in step.
  await supabase.from("closes").update({ setter_id: setterId, closer_id: closerId }).eq("call_id", callId);

  revalidatePath("/", "layout");
  back("/calls", "ok", "Updated who set and who closed that call.");
}

/** Re-pick the closer on every upcoming, not-yet-worked call from the shifts under Settings. */
export async function reapplyShifts() {
  await requireRole("admin");
  const admin = createAdminClient();
  const [{ data: shiftData }, { data: staffData }, { data: callData }] = await Promise.all([
    admin.from("closer_shifts").select("*"),
    admin.from("staff").select("*"),
    admin.from("calls").select("id, call_at, closer_id").eq("outcome", "scheduled").gte("call_at", new Date().toISOString()),
  ]);
  const shifts = (shiftData ?? []) as ShiftRow[];
  if (shifts.length === 0) back("/settings", "error", "Set at least one closer shift first.");
  const staff = (staffData ?? []) as StaffRow[];
  let changed = 0;
  for (const c of callData ?? []) {
    const pick = pickCloser(c.call_at, shifts, staff, null);
    if (pick && pick !== c.closer_id) {
      await admin.from("calls").update({ closer_id: pick }).eq("id", c.id);
      changed++;
    }
  }
  revalidatePath("/", "layout");
  back("/settings", "ok", `Re-applied shifts: ${changed} upcoming call${changed === 1 ? "" : "s"} reassigned.`);
}

/** Attach (or fix) the Fathom link on a call that's already been logged. */
export async function addRecording(formData: FormData) {
  const { supabase } = await requireStaff();
  const url = cleanFathomUrl(str(formData, "recording_url"));
  if (!url) back("/attention", "error", `That isn't a Fathom link. ${RECORDING_HELP}`);
  const { data, error } = await supabase
    .from("calls")
    .update({ recording_url: url })
    .eq("id", str(formData, "call_id"))
    .select("id");
  if (error) back("/attention", "error", error.message);
  if (!data || data.length === 0) back("/attention", "error", "You can only add a recording to your own calls.");
  revalidatePath("/", "layout");
  back("/attention", "ok", "Recording added.");
}

/** Contract signed: with the full payment in, this is what releases the sale's commission. */
export async function markContractSigned(formData: FormData) {
  const { supabase } = await requireStaff();
  const closeId = str(formData, "close_id");
  const signedOn = optStr(formData, "signed_on") ?? todayIso();
  const { data, error } = await supabase.from("closes").update({ contract_signed_at: signedOn }).eq("id", closeId).select("id");
  if (error) back("/deals", "error", error.message);
  if (!data || data.length === 0) back("/deals", "error", "You can only mark your own deals as signed.");
  await issuePayouts(closeId);
  revalidatePath("/", "layout");
  back("/deals", "ok", "Contract marked signed. If the full payment is in, the commission invoices have been created.");
}

/** Create the same-day invoices for one sale right now (admin). */
export async function createSaleInvoices(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const path = "/invoices";
  const closeId = str(formData, "close_id");
  const force = formData.get("force") === "on";
  if (!closeId) back(path, "error", "Pick a sale.");

  const { data: close } = await supabase.from("closes").select("*, payments(*), calls(lead_name)").eq("id", closeId).single();
  if (!close) back(path, "error", "Couldn't find that sale.");
  const waiting = dealWaitingFor(close as CloseRow);
  if (waiting && !force) {
    back(path, "error", `Not payable yet: still waiting for ${waiting}. Tick "pay out now anyway" if you want to pay it today regardless.`);
  }

  let made = 0;
  let failed: string | null = null;
  try {
    made = await issueDealInvoices(createAdminClient(), closeId, { force });
  } catch (e) {
    failed = e instanceof Error ? e.message : "unknown error";
  }
  if (failed) back(path, "error", failed);
  revalidatePath("/", "layout");
  back(
    path,
    "ok",
    made > 0
      ? `Created ${made} invoice${made === 1 ? "" : "s"} for that sale${emailConfigured() ? " and emailed them" : " (email isn't switched on yet, so download them below)"}.`
      : "Nothing new to create: everyone owed on that sale already has an invoice (or nobody has a pay rate set)."
  );
}
