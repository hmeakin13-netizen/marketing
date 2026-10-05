"use client";

import { useState } from "react";
import { logOutcome } from "@/app/actions";
import { SubmitButton } from "./SubmitButton";
import { Field, inputCls } from "./ui";

export function OutcomeForm({ callId, existingNotes }: { callId: string; existingNotes: string | null }) {
  const [outcome, setOutcome] = useState("");
  const [paymentType, setPaymentType] = useState("paid_in_full");

  const options = [
    { v: "closed", label: "Closed ✅", cls: "border-emerald-500/40 text-emerald-300" },
    { v: "follow_up", label: "Showed – follow up", cls: "border-sky-500/40 text-sky-300" },
    { v: "lost", label: "Showed – lost", cls: "border-white/20 text-zinc-300" },
    { v: "no_show", label: "No show", cls: "border-rose-500/40 text-rose-300" },
    { v: "cancelled", label: "Cancelled", cls: "border-white/20 text-zinc-400" },
  ];

  return (
    <form action={logOutcome} className="space-y-4">
      <input type="hidden" name="call_id" value={callId} />
      <input type="hidden" name="outcome" value={outcome} />

      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setOutcome(o.v)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${o.cls} ${
              outcome === o.v ? "bg-white/10 ring-2 ring-white/30" : "hover:bg-white/5"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {outcome === "closed" ? (
        <div className="grid gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 sm:grid-cols-2">
          <Field label="Deal value (£)">
            <input name="deal_value" inputMode="decimal" required placeholder="3000" className={inputCls} />
          </Field>
          <Field label="How was it paid?">
            <select
              name="payment_type"
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
              className={inputCls}
            >
              <option value="paid_in_full">Paid in full</option>
              <option value="deposit">Deposit (balance to come)</option>
              <option value="payment_plan">Payment plan</option>
            </select>
          </Field>
          <Field label={paymentType === "paid_in_full" ? "Cash collected (£) — blank = full amount" : "Cash collected today (£)"}>
            <input name="cash_collected" inputMode="decimal" placeholder={paymentType === "paid_in_full" ? "" : "500"} className={inputCls} />
          </Field>
          {paymentType !== "paid_in_full" ? (
            <Field label="Next payment due">
              <input name="next_payment_due" type="date" className={inputCls} />
            </Field>
          ) : null}
          <Field label="Monthly retainer (£), if they're staying on" className="sm:col-span-2">
            <input name="monthly_retainer" inputMode="decimal" className={inputCls} placeholder="1000 — leave blank if it's a one-off" />
          </Field>
        </div>
      ) : null}

      {outcome ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Notes (optional)">
              <input name="notes" defaultValue={existingNotes ?? ""} className={inputCls} placeholder="Objections, next steps…" />
            </Field>
            <Field label="Recording link (optional, e.g. Fathom)">
              <input name="recording_url" type="url" className={inputCls} placeholder="https://fathom.video/…" />
            </Field>
          </div>
          <SubmitButton>Save outcome</SubmitButton>
        </>
      ) : (
        <p className="text-xs text-zinc-500">Pick what happened on the call.</p>
      )}
    </form>
  );
}
