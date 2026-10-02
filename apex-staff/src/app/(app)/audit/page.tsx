import { requireRole } from "@/lib/staff/auth";
import { fmtDateTime } from "@/lib/staff/dates";
import type { AuditRow } from "@/lib/staff/types";
import { Badge, Card, PageHeader } from "@/components/staff/ui";

export const metadata = { title: "Audit trail | Apex Team" };

const SKIP = new Set(["id", "created_at"]);
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "–" : String(v));

function summarise(r: AuditRow): string {
  if (r.action === "UPDATE" && r.old_data && r.new_data) {
    const changes = Object.keys(r.new_data)
      .filter((k) => !SKIP.has(k) && JSON.stringify(r.old_data![k]) !== JSON.stringify(r.new_data![k]))
      .map((k) => `${k}: ${show(r.old_data![k])} → ${show(r.new_data![k])}`);
    return changes.join(" · ") || "No visible change";
  }
  const d = r.new_data ?? r.old_data ?? {};
  const keys =
    r.table_name === "payments"
      ? ["amount", "note", "paid_at"]
      : r.table_name === "closes"
        ? ["deal_value", "payment_type", "next_payment_due"]
        : ["lead_name", "outcome", "call_at"];
  return keys.filter((k) => k in d).map((k) => `${k}: ${show(d[k])}`).join(" · ");
}

export default async function AuditPage() {
  const { supabase } = await requireRole("admin", "manager");
  const { data } = await supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(200);
  const rows = (data ?? []) as AuditRow[];

  return (
    <>
      <PageHeader title="Audit trail" subtitle="Every change to calls, deals and payments — who, when, and what changed. Last 200 entries." />
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="px-5 py-3 font-medium">When</th>
              <th className="py-3 font-medium">Who</th>
              <th className="py-3 font-medium">What</th>
              <th className="px-5 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-4 text-zinc-500">Nothing logged yet.</td></tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-5 py-3 text-zinc-400">{fmtDateTime(r.at)}</td>
                <td className="py-3 text-zinc-300">{r.actor_email ?? "system"}</td>
                <td className="py-3">
                  <Badge tone={r.action === "DELETE" ? "bad" : r.action === "UPDATE" ? "warn" : "good"}>
                    {r.action.toLowerCase()} {r.table_name === "closes" ? "deal" : r.table_name.replace(/s$/, "")}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-xs text-zinc-400">{summarise(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
