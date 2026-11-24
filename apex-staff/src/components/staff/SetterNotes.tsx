import { saveSetterNotes } from "@/app/actions";
import type { CallRow } from "@/lib/staff/types";
import { SubmitButton } from "./SubmitButton";
import { inputCls } from "./ui";

/** The few things a setter finds out before the closer rings. Same prompts for everyone. */
export const SETTER_NOTE_PROMPTS = [
  { key: "what_they_do", label: "What do they do?", hint: "Trade, team size, services, area" },
  { key: "how_they_get_work", label: "How do they get work now?", hint: "Word of mouth, MyBuilder, ads, nothing much" },
  { key: "what_they_want", label: "What do they want, and what's going wrong?", hint: "More jobs, quiet spells, poor leads, price shoppers" },
  { key: "budget_and_decision", label: "Budget and who decides?", hint: "Can they start now? Partner or accountant involved?" },
  { key: "closer_should_know", label: "Anything the closer should know?", hint: "Tone, objections, best time to ring" },
] as const;

export function SetterNotes({ call, canEdit }: { call: CallRow; canEdit: boolean }) {
  const saved = call.setter_notes ?? {};
  const filled = SETTER_NOTE_PROMPTS.filter((p) => saved[p.key]);
  if (!canEdit && filled.length === 0) return null;

  return (
    <div className="mt-2 text-left">
      {filled.length > 0 ? (
        <dl className="mb-1 space-y-0.5 text-xs text-zinc-400">
          {filled.map((p) => (
            <div key={p.key}>
              <dt className="inline font-medium text-zinc-300">{p.label} </dt>
              <dd className="inline">{saved[p.key]}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {canEdit ? (
        <details className="inline-block">
          <summary className="cursor-pointer text-xs font-medium text-emerald-400 hover:text-emerald-300">
            {filled.length > 0 ? "Edit setter notes" : "Add setter notes"}
          </summary>
          <form action={saveSetterNotes} className="mt-2 grid max-w-xl gap-2">
            <input type="hidden" name="call_id" value={call.id} />
            {SETTER_NOTE_PROMPTS.map((p) => (
              <label key={p.key} className="text-xs text-zinc-500">
                <span className="font-medium text-zinc-300">{p.label}</span> <span>{p.hint}</span>
                <textarea
                  name={p.key}
                  rows={2}
                  maxLength={1000}
                  defaultValue={saved[p.key] ?? ""}
                  className={`${inputCls} mt-1 w-full`}
                />
              </label>
            ))}
            <div>
              <SubmitButton>Save notes</SubmitButton>
            </div>
          </form>
        </details>
      ) : null}
    </div>
  );
}
