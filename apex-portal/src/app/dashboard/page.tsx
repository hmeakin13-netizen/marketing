import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardHeader } from "@/components/DashboardHeader";
import { LiveUpdatesFeed } from "@/components/LiveUpdatesFeed";
import type { ClientRow } from "@/lib/types";

export const metadata = {
  title: "Dashboard | Apex Leads",
};

export default async function DashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/login");
  }

  // RLS scopes this to the caller's own row — see supabase/migrations/0001_create_clients_table.sql.
  const { data: client } = await supabase
    .from("clients")
    .select("id, business_name, email, notion_page_id, created_at")
    .eq("email", user.email)
    .single<ClientRow>();

  const businessName = client?.business_name ?? "Your dashboard";

  return (
    <div className="min-h-screen bg-stone-50">
      <DashboardHeader businessName={businessName} />

      <main className="mx-auto max-w-6xl px-6 py-10">
        {!client ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-card">
            <p className="text-sm text-forest-600">
              Your dashboard is being set up, check back shortly.
            </p>
          </div>
        ) : (
          <section className="mx-auto max-w-3xl">
            <h2 className="text-lg font-semibold text-forest-900">Live Updates</h2>
            <p className="mt-1 text-sm text-forest-600">
              The latest from your account manager, pulled in real time.
            </p>
            <div className="mt-5">
              <LiveUpdatesFeed />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
