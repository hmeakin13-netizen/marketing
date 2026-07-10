export interface ClientRow {
  id: string;
  business_name: string;
  email: string;
  notion_page_id: string | null;
  looker_studio_url: string | null;
  created_at: string;
  last_seen_at: string | null;
}

export interface RichTextSegment {
  text: string;
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  underline: boolean;
  code: boolean;
  href: string | null;
}

export type NotionBlockData =
  | { id: string; type: "paragraph"; text: RichTextSegment[] }
  | { id: string; type: "heading_1" | "heading_2" | "heading_3"; text: RichTextSegment[] }
  | {
      id: string;
      type: "bulleted_list_item" | "numbered_list_item";
      text: RichTextSegment[];
      children: NotionBlockData[];
    }
  | {
      id: string;
      type: "to_do";
      text: RichTextSegment[];
      checked: boolean;
    }
  | { id: string; type: "quote"; text: RichTextSegment[] }
  | { id: string; type: "callout"; text: RichTextSegment[]; icon: string | null }
  | { id: string; type: "divider" }
  | { id: string; type: "image"; url: string; caption: string }
  | { id: string; type: "code"; text: RichTextSegment[]; language: string }
  | { id: string; type: "unsupported" };

export interface NotionUpdateEntry {
  id: string;
  title: string;
  date: string | null;
  lastEditedTime: string;
  isNew: boolean;
  blocks: NotionBlockData[];
}

export type NotionFetchResult =
  | { status: "ok"; entries: NotionUpdateEntry[]; fetchedAt: string; stale: false }
  | { status: "stale"; entries: NotionUpdateEntry[]; fetchedAt: string; stale: true }
  | { status: "not_configured" }
  | { status: "error" };
