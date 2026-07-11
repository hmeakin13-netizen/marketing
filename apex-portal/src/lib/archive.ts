import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotionUpdateEntry } from "./types";

/**
 * Mirrors freshly-fetched Notion entries into the `updates` table so there's
 * a permanent history independent of what's currently in Notion. Best-effort
 * — a failure here shouldn't break the dashboard, since Notion remains the
 * live source of truth.
 */
export async function archiveEntries(
  supabase: SupabaseClient,
  clientId: string,
  entries: NotionUpdateEntry[]
): Promise<void> {
  if (entries.length === 0) return;

  const rows = entries.map((entry) => ({
    client_id: clientId,
    notion_block_id: entry.id,
    title: entry.title,
    date: entry.date,
    last_edited_time: entry.lastEditedTime,
    content: entry.blocks,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("updates").upsert(rows, { onConflict: "client_id,notion_block_id" });
  if (error) console.error("Archiving updates failed", error);
}
