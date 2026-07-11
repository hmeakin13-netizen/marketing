import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { NotionUpdateEntry } from "./types";

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

// Best-effort cache, same lifetime/limitations as the Notion content cache —
// avoids re-summarizing on every dashboard load when nothing's changed.
const cache = new Map<string, { hash: string; summary: string }>();

function entryHash(entries: NotionUpdateEntry[]): string {
  return entries.map((e) => `${e.id}:${e.lastEditedTime}`).join("|");
}

function plainText(entries: NotionUpdateEntry[]): string {
  return entries
    .map((entry) => {
      const body = entry.blocks
        .flatMap((b) => ("text" in b ? b.text.map((t) => t.text).join("") : ""))
        .join(" ");
      return `${entry.title}: ${body}`;
    })
    .join("\n");
}

/**
 * One upbeat, concrete sentence summarizing recent activity, for the top of
 * the dashboard. Returns null (and the dashboard just omits it) if no API
 * key is configured or the call fails — this is a nice-to-have, never a
 * blocker.
 */
export async function summarizeForDashboard(
  pageId: string,
  businessName: string,
  entries: NotionUpdateEntry[]
): Promise<string | null> {
  if (!anthropic || entries.length === 0) return null;

  const hash = entryHash(entries);
  const cached = cache.get(pageId);
  if (cached && cached.hash === hash) return cached.summary;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: `You write a single short sentence summarizing recent account activity for a client dashboard. Business: ${businessName}. Be concrete and upbeat, no fluff, no greeting, no sign-off — just the one sentence.\n\nRecent updates:\n${plainText(entries)}`,
        },
      ],
    });
    const text = message.content.find((c) => c.type === "text")?.text?.trim();
    if (!text) return null;
    cache.set(pageId, { hash, summary: text });
    return text;
  } catch (error) {
    console.error("Dashboard summary generation failed", error);
    return null;
  }
}

/**
 * A slightly fuller summary (2-3 sentences) for the weekly email digest.
 */
export async function summarizeForDigest(businessName: string, entries: NotionUpdateEntry[]): Promise<string | null> {
  if (!anthropic || entries.length === 0) return null;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `Write a short, friendly 2-3 sentence weekly summary for a landscaping lead-generation client's email digest. Business: ${businessName}. Be concrete, mention specifics from the updates, no greeting or sign-off — just the summary paragraph.\n\nThis week's updates:\n${plainText(entries)}`,
        },
      ],
    });
    return message.content.find((c) => c.type === "text")?.text?.trim() ?? null;
  } catch (error) {
    console.error("Digest summary generation failed", error);
    return null;
  }
}
