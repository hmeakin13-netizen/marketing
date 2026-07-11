import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchClientUpdates, getCachedUpdates, normalizeNotionPageId } from "@/lib/notion";
import { archiveEntries } from "@/lib/archive";
import { summarizeForDashboard } from "@/lib/summary";
import type { ClientRow, NotionFetchResult, NotionUpdateEntry } from "@/lib/types";

export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ status: "error" } satisfies NotionFetchResult, { status: 401 });
  }

  // RLS restricts this to the caller's own row — see supabase/migrations/0001_create_clients_table.sql.
  const { data: client } = await supabase
    .from("clients")
    .select("id, business_name, email, notion_page_id, looker_studio_url, created_at, last_seen_at")
    .eq("email", user.email)
    .single<ClientRow>();

  const pageId = client?.notion_page_id ? normalizeNotionPageId(client.notion_page_id) : null;

  if (!pageId) {
    return NextResponse.json({ status: "not_configured" } satisfies NotionFetchResult);
  }

  const lastSeenAt = client?.last_seen_at;
  const markSeen = () =>
    supabase.from("clients").update({ last_seen_at: new Date().toISOString() }).eq("email", user.email!);

  const withNewFlags = (entries: NotionUpdateEntry[]) =>
    entries.map((entry) => ({
      ...entry,
      isNew: lastSeenAt ? entry.lastEditedTime > lastSeenAt : false,
    }));

  try {
    const { entries, fetchedAt } = await fetchClientUpdates(pageId);
    const [, , summary] = await Promise.all([
      markSeen(),
      archiveEntries(supabase, client!.id, entries),
      summarizeForDashboard(pageId, client!.business_name, entries),
    ]);
    return NextResponse.json({
      status: "ok",
      entries: withNewFlags(entries),
      fetchedAt,
      stale: false,
      summary,
    } satisfies NotionFetchResult);
  } catch (error) {
    console.error("Notion fetch failed", error);
    const cached = getCachedUpdates(pageId);
    if (cached) {
      const [, summary] = await Promise.all([
        markSeen(),
        summarizeForDashboard(pageId, client!.business_name, cached.entries),
      ]);
      return NextResponse.json({
        status: "stale",
        entries: withNewFlags(cached.entries),
        fetchedAt: cached.fetchedAt,
        stale: true,
        summary,
      } satisfies NotionFetchResult);
    }
    return NextResponse.json({ status: "error" } satisfies NotionFetchResult);
  }
}
