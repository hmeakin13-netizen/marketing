"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, requireStaff, isManager } from "@/lib/staff/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseUkLocal } from "@/lib/staff/dates";
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

// ------------------------------------------------------------------ calls

export async function bookCall(formData: FormData) {
  const { supabase, me } = await requireStaff();
  const path = "/staff/calls";

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

  revalidatePath("/staff", "layout");
  back(path, "ok", `Call booked for ${leadName}.`);
}

export async function logOutcome(formData: FormData) {
  const { supabase, me } = await requireStaff();
  const path = "/staff/calls";
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

  const update: Record<string, unknown> = {
    outcome,
    outcome_logged_at: new Date().toISOString(),
    recording_url: optStr(formData, "recording_url"),
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
  } else {
    const { error } = await supabase.from("calls").update(update).eq("id", callId);
    if (error) back(path, "error", error.message);
  }

  revalidatePath("/staff", "layout");
  back(path, "ok", `Saved: ${call!.lead_name}.`);
}

// ------------------------------------------------------------------ deals

export async function addPayment(formData: FormData) {
  const { supabase } = await requireStaff();
  const path = "/staff/deals";
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

  revalidatePath("/staff", "layout");
  back(path, "ok", "Payment recorded.");
}

export async function updateDeal(formData: FormData) {
  const { supabase } = await requireStaff();
  const path = "/staff/deals";
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

  revalidatePath("/staff", "layout");
  back(path, "ok", "Deal updated (change logged).");
}

export async function deletePayment(formData: FormData) {
  const { supabase } = await requireRole("admin", "manager");
  const { error } = await supabase.from("payments").delete().eq("id", str(formData, "payment_id"));
  if (error) back("/staff/deals", "error", error.message);
  revalidatePath("/staff", "layout");
  back("/staff/deals", "ok", "Payment removed (logged in the audit trail).");
}

// ------------------------------------------------------------------ targets

export async function saveTargets(formData: FormData) {
  const { supabase } = await requireRole("admin", "manager");
  const path = "/staff/targets";
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
  revalidatePath("/staff", "layout");
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
  const path = "/staff/team";
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

  // Make sure a login exists (public sign-up is off, so we create it here).
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error && !/already|registered|exists/i.test(error.message)) throw error;
    await admin.auth.admin.listUsers().then(async ({ data }) => {
      const u = data?.users.find((x) => x.email?.toLowerCase() === email);
      if (u) await admin.auth.admin.updateUserById(u.id, { ban_duration: "none" });
    });
  } catch (e) {
    back(
      path,
      "error",
      `${fullName} was added but their login couldn't be created (${
        e instanceof Error ? e.message : "unknown error"
      }). Check SUPABASE_SERVICE_ROLE_KEY.`
    );
  }

  revalidatePath("/staff", "layout");
  back(path, "ok", `${fullName} added. Tell them to log in at /staff/login with ${email}.`);
}

export async function updatePerson(formData: FormData) {
  const { supabase, me } = await requireRole("admin");
  const path = "/staff/team";
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
    revalidatePath("/staff", "layout");
    back(path, "ok", `${person!.full_name} ${active ? "reactivated" : "deactivated — history kept"}.`);
  }

  const role = str(formData, "role") as StaffRole;
  const fullName = str(formData, "full_name") || person!.full_name;
  if (person!.id === me.id && role !== "admin") back(path, "error", "You can't change your own role.");
  const { error } = await supabase
    .from("staff")
    .update({ role, full_name: fullName, calendly_email: optStr(formData, "calendly_email") })
    .eq("id", id);
  if (error) back(path, "error", error.message);
  revalidatePath("/staff", "layout");
  back(path, "ok", "Saved.");
}

// ------------------------------------------------------------------ pay (admin)

export async function savePay(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const pct = num(formData, "commission_pct");
  const base = num(formData, "base_pay_weekly");
  const { error } = await supabase.from("staff_pay").upsert(
    {
      staff_id: str(formData, "staff_id"),
      commission_pct: Number.isNaN(pct) ? 0 : pct,
      base_pay_weekly: Number.isNaN(base) ? 0 : base,
      basis: str(formData, "basis"),
    },
    { onConflict: "staff_id" }
  );
  if (error) back("/staff/pay", "error", error.message);
  revalidatePath("/staff/pay");
  back("/staff/pay", "ok", "Pay settings saved.");
}
