import { requireRole } from "@/lib/staff/auth";
import { loadActivity } from "@/lib/staff/admaker";
import { Badge, Card, PageHeader } from "@/components/staff/ui";

export const metadata = { title: "Ad maker activity | Apex Team" };

const TONE: Record<string, "default" | "good" | "warn" | "bad" | "info"> = {
  rules: "info",
  read: "default",
  draft: "warn",
  live: "good",
  pause: "bad",
};

export default async function AdMakerActivityPage() {
  const { supabase } = await requireRole("admin", "manager");
  const items = await loadActivity(supabase);

  return (
    <>
      <PageHeader title="Ad maker activity" subtitle="Everything it has done or read, newest first, with the reason." />
      {items.length === 0 ? (
        <Card className="text-center">
          <p className="text-sm text-zinc-400">Nothing yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONE[a.kind] ?? "default"}>{a.kind}</Badge>
                {a.client_name ? <span className="text-sm font-medium text-white">{a.client_name}</span> : null}
                <span className="ml-auto text-xs text-zinc-500">
                  {new Date(a.created_at).toLocaleString("en-GB", {
                    timeZone: "Europe/London",
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-200">{a.summary}</p>
              {a.reason ? <p className="mt-1 text-xs text-zinc-500">Why: {a.reason}</p> : null}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
