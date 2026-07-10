import "server-only";
import { Client } from "@notionhq/client";
import type {
  BlockObjectResponse,
  PartialBlockObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";
import type { NotionBlockData, NotionUpdateEntry, RichTextSegment } from "./types";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

/**
 * Notion page IDs are often pasted messily — the whole browser URL, with a
 * title slug before the ID and a `?pvs=4`-style suffix after it, with or
 * without dashes. Pull out the last 32 hex characters and re-format as a
 * dashed UUID so admin data-entry mistakes don't need a support round trip.
 */
export function normalizeNotionPageId(raw: string): string | null {
  const withoutQuery = raw.trim().split(/[?#]/)[0];
  const hexOnly = withoutQuery.replace(/[^a-fA-F0-9]/g, "");
  if (hexOnly.length < 32) return null;
  const id = hexOnly.slice(-32);
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

// Best-effort cache so a transient Notion API failure can fall back to the
// last-successful fetch instead of showing an error. Lives for the lifetime
// of the serverless function instance — not persisted, which is fine since
// a cold start just means the friendly "check back shortly" fallback shows.
const cache = new Map<string, { entries: NotionUpdateEntry[]; fetchedAt: string }>();

function toRichTextSegments(items: RichTextItemResponse[]): RichTextSegment[] {
  return items.map((item) => ({
    text: item.plain_text,
    bold: item.annotations.bold,
    italic: item.annotations.italic,
    strikethrough: item.annotations.strikethrough,
    underline: item.annotations.underline,
    code: item.annotations.code,
    href: item.href,
  }));
}

async function listChildren(blockId: string): Promise<BlockObjectResponse[]> {
  const blocks: BlockObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const block of response.results) {
      if (isFullBlock(block)) blocks.push(block);
    }
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return blocks;
}

function isFullBlock(
  block: BlockObjectResponse | PartialBlockObjectResponse
): block is BlockObjectResponse {
  return "type" in block;
}

async function convertBlock(block: BlockObjectResponse): Promise<NotionBlockData> {
  switch (block.type) {
    case "paragraph":
      return { id: block.id, type: "paragraph", text: toRichTextSegments(block.paragraph.rich_text) };
    case "heading_1":
      return { id: block.id, type: "heading_1", text: toRichTextSegments(block.heading_1.rich_text) };
    case "heading_2":
      return { id: block.id, type: "heading_2", text: toRichTextSegments(block.heading_2.rich_text) };
    case "heading_3":
      return { id: block.id, type: "heading_3", text: toRichTextSegments(block.heading_3.rich_text) };
    case "bulleted_list_item":
      return {
        id: block.id,
        type: "bulleted_list_item",
        text: toRichTextSegments(block.bulleted_list_item.rich_text),
        children: block.has_children ? await convertBlocks(await listChildren(block.id)) : [],
      };
    case "numbered_list_item":
      return {
        id: block.id,
        type: "numbered_list_item",
        text: toRichTextSegments(block.numbered_list_item.rich_text),
        children: block.has_children ? await convertBlocks(await listChildren(block.id)) : [],
      };
    case "to_do":
      return {
        id: block.id,
        type: "to_do",
        text: toRichTextSegments(block.to_do.rich_text),
        checked: block.to_do.checked,
      };
    case "quote":
      return { id: block.id, type: "quote", text: toRichTextSegments(block.quote.rich_text) };
    case "callout":
      return {
        id: block.id,
        type: "callout",
        text: toRichTextSegments(block.callout.rich_text),
        icon: block.callout.icon?.type === "emoji" ? block.callout.icon.emoji : null,
      };
    case "divider":
      return { id: block.id, type: "divider" };
    case "image": {
      const url = block.image.type === "external" ? block.image.external.url : block.image.file.url;
      const caption = block.image.caption.map((c) => c.plain_text).join("");
      return { id: block.id, type: "image", url, caption };
    }
    case "code":
      return {
        id: block.id,
        type: "code",
        text: toRichTextSegments(block.code.rich_text),
        language: block.code.language,
      };
    default:
      return { id: block.id, type: "unsupported" };
  }
}

async function convertBlocks(blocks: BlockObjectResponse[]): Promise<NotionBlockData[]> {
  return Promise.all(blocks.map(convertBlock));
}

const DATE_PATTERNS = [
  /\d{4}-\d{2}-\d{2}/, // 2026-07-10
  /\d{1,2}\/\d{1,2}\/\d{4}/, // 10/07/2026
  /\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/i, // 10 July 2026
  /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}/i, // July 10, 2026
];

function extractDate(text: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const parsed = new Date(match[0]);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }
  return null;
}

function plainText(text: RichTextSegment[]): string {
  return text.map((t) => t.text).join("");
}

/**
 * Groups the page's top-level blocks into dated entries, split on headings.
 * Entries with a parseable date sort newest-first; undated entries (e.g. an
 * intro block before the first heading) keep the page's original order,
 * reversed, and are placed after the dated ones.
 */
function groupIntoEntries(blocks: NotionBlockData[]): NotionUpdateEntry[] {
  const entries: NotionUpdateEntry[] = [];
  let current: NotionUpdateEntry | null = null;

  for (const block of blocks) {
    const isHeading = block.type === "heading_1" || block.type === "heading_2" || block.type === "heading_3";
    if (isHeading) {
      if (current) entries.push(current);
      const title = plainText(block.text);
      current = { id: block.id, title, date: extractDate(title), blocks: [] };
    } else {
      if (!current) current = { id: block.id, title: "Update", date: null, blocks: [] };
      current.blocks.push(block);
    }
  }
  if (current) entries.push(current);

  const dated = entries.filter((e) => e.date).sort((a, b) => (a.date! < b.date! ? 1 : -1));
  const undated = entries.filter((e) => !e.date).reverse();
  return [...dated, ...undated];
}

export async function fetchClientUpdates(
  pageId: string
): Promise<{ entries: NotionUpdateEntry[]; fetchedAt: string }> {
  const blocks = await listChildren(pageId);
  const converted = await convertBlocks(blocks);
  const entries = groupIntoEntries(converted);
  const fetchedAt = new Date().toISOString();
  cache.set(pageId, { entries, fetchedAt });
  return { entries, fetchedAt };
}

export function getCachedUpdates(pageId: string) {
  return cache.get(pageId) ?? null;
}
