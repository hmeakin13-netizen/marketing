import { requireRole } from "@/lib/staff/auth";
import { loadRules, type AdRules } from "@/lib/staff/admaker";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/staff/ui";

export const metadata = { title: "Ad maker rules | Apex Team" };

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;

const APPROVAL = {
  always: "Always needs your Approve tap",
  auto_small: "Small tests go live on their own; everything else needs your tap",
  auto_all: "Fully automatic",
} as const;
const SUGGEST = {
  when_wrong: "Only when something is wrong (tired ad, CPL over max, behind on guarantee)",
  weekly: "Every week, plus when something is wrong",
  on_request: "Only when you ask",
} as const;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-t border-white/5 py-2 text-sm first:border-t-0">
      <span className="text-zinc-400">{label}</span>
      <span className="text-right font-medium text-white">{value}</span>
    </div>
  );
}

function RulesCard({ r }: { r: AdRules }) {
  const testBudget = (r.daily_budget * r.test_budget_pct) / 100;
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">{r.client_name}</h2>
        {r.pilot ? <Badge tone="info">Pilot</Badge> : null}
      </div>
      <Row label="Approval" value={APPROVAL[r.approval_mode]} />
      <Row label="Daily budget" value={gbp(r.daily_budget)} />
      <Row label="Test budget" value={`${r.test_budget_pct}% (${gbp(testBudget)}/day)`} />
      <Row label="Auto-approve up to" value={`${gbp(r.auto_approve_max_daily)}/day per test`} />
      <Row label="Live tests at once" value={`${r.max_live_tests} max`} />
      <Row label="New ad sets" value="Left alone for the first 48 hours" />
      <Row label="Early kill" value={`${r.early_kill_multiple}× max CPL spent with no leads and a weak click rate`} />
      <Row label="Keep or kill at" value={`${gbp(r.keep_kill_spend)} spend, against max CPL`} />
      <Row label="Frequency " value={`${r.frequency_limit}+ means line up a replacement. The ad stays live while its CPL is under target`} />
      <Row label="Winner scale-up" value={`+${r.max_budget_step_pct}% at most every ${r.budget_step_hours}h`} />
      <Row label="New ad suggestions" value={SUGGEST[r.suggest_mode]} />
    </Card>
  );
}

export default async function AdMakerRulesPage() {
  const { supabase } = await requireRole("admin", "manager");
  const rules = await loadRules(supabase);

  return (
    <>
      <PageHeader title="Ad maker rules" subtitle="The limits the ad maker works inside. Nothing is created yet: research first, FG is the pilot." />
      <Card className="mb-5">
        <SectionTitle>Always true</SectionTitle>
        <ul className="space-y-1.5 text-sm text-zinc-300">
          <li>• One change per test. Same audience and budget, only the image, headline or offer differs.</li>
          <li>• A live ad is never edited. Changes go in as new ads.</li>
          <li>• It never goes over a client&apos;s daily budget, never deletes anything, never changes audiences beyond cloning.</li>
          <li>• Every new ad states its idea and where the idea came from (our best ad, or competitors in the Ad Library).</li>
          <li>• Every action is written to the Activity log with the reason.</li>
        </ul>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {rules.map((r) => (
          <RulesCard key={r.client_name} r={r} />
        ))}
      </div>
      <p className="mt-5 text-xs text-zinc-500">To change a rule, tell Claude. Editing from this page comes next.</p>
    </>
  );
}
