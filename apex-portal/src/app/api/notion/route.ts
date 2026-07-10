import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchClientUpdates, getCachedUpdates } from "@/lib/notion";
import type { ClientRow, NotionFetchResult } from "@/lib/types";

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
    .select("id, business_name, email, notion_page_id, looker_studio_url, created_at")
    .eq("email", user.email)
    .single<ClientRow>();

  if (!client?.notion_page_id) {
    return NextResponse.json({ status: "not_configured" } satisfies NotionFetchResult);
  }

  try {
    const { entries, fetchedAt } = await fetchClientUpdates(client.notion_page_id);
    return NextResponse.json({ status: "ok", entries, fetchedAt, stale: false } satisfies NotionFetchResult);
  } catch (error) {
    console.error("Notion fetch failed", error);
    const cached = getCachedUpdates(client.notion_page_id);
    if (cached) {
      return NextResponse.json({
        status: "stale",
        entries: cached.entries,
        fetchedAt: cached.fetchedAt,
        stale: true,
      } satisfies NotionFetchResult);
    }
    return NextResponse.json({ status: "error" } satisfies NotionFetchResult);
  }
}
