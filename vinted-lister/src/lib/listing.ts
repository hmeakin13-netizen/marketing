import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ListingSchema, type Listing } from "./listing-types";

export { ListingSchema, type Listing };

export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type PhotoType = (typeof ALLOWED_TYPES)[number];

export interface Photo {
  mediaType: PhotoType;
  /** base64, no data: prefix */
  data: string;
}

const SYSTEM = `You write second-hand listings for Vinted UK from the seller's photos.

Rules:
- Only state what the photos support. Never invent a brand, size, material, measurements or condition. If something can't be seen, set it to null and add it to confirm_with_seller.
- Report visible flaws honestly in the description. Buyers on Vinted open disputes over undisclosed damage.
- Title: searchable and factual (brand + item + key detail + size), under 100 characters, no emoji spam, no ALL CAPS.
- Description: friendly, plain text, short paragraphs. Cover what it is, condition, fit/measurements if known, and a short line about postage or bundles. End with 3-5 relevant hashtags. No markdown.
- Price: realistic UK second-hand price in pounds. You do not have live sold data, so say so in price_rationale.`;

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic();
  return client;
}

export class ListingError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export async function generateListing(photos: Photo[], sellerNotes?: string): Promise<Listing> {
  if (photos.length === 0) throw new ListingError("Add at least one photo.", 400);
  if (photos.length > MAX_PHOTOS) throw new ListingError(`Max ${MAX_PHOTOS} photos.`, 400);

  const content: Anthropic.ContentBlockParam[] = photos.map((p) => ({
    type: "image",
    source: { type: "base64", media_type: p.mediaType, data: p.data },
  }));
  content.push({
    type: "text",
    text: sellerNotes?.trim()
      ? `Write the Vinted listing for this item. Seller's notes (trust these over the photos): ${sellerNotes.trim().slice(0, 500)}`
      : "Write the Vinted listing for this item.",
  });

  const response = await getClient().messages.parse({
    model: process.env.LISTING_MODEL ?? "claude-opus-5-5",
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content }],
    output_config: { effort: "medium", format: zodOutputFormat(ListingSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new ListingError("Couldn't generate a listing for these photos.", 422);
  }
  if (!response.parsed_output) throw new ListingError("Couldn't read the generated listing. Try again.");

  const listing = response.parsed_output;
  return { ...listing, title: listing.title.slice(0, 100), description: listing.description.slice(0, 2000) };
}
