import { z } from "zod/v4";

/** Vinted's condition options (UK). */
const CONDITIONS = ["New with tags", "New without tags", "Very good", "Good", "Satisfactory"] as const;

export const ListingSchema = z.object({
  title: z.string().describe("Vinted title, max 100 chars. Brand, item type, key detail, size if known."),
  description: z.string().describe("Vinted description, max 2000 chars. Plain text, short paragraphs, no markdown."),
  category: z.string().describe("Vinted category path, e.g. 'Women > Clothing > Dresses > Midi dresses'."),
  brand: z.string().nullable().describe("Brand if visible on a label/logo, otherwise null."),
  size: z.string().nullable().describe("Size only if a label is legible in the photos, otherwise null."),
  colours: z.array(z.string()).max(2),
  condition: z.enum(CONDITIONS),
  parcel_size: z.enum(["Small", "Medium", "Large"]),
  price_gbp: z.number().describe("Suggested asking price in GBP for a quick but fair sale on Vinted."),
  price_rationale: z.string().describe("One sentence on why this price. This is an estimate, not market data."),
  flaws_noticed: z.array(z.string()).describe("Visible marks, wear, damage, missing items. Empty if none."),
  confirm_with_seller: z
    .array(z.string())
    .describe("Things the photos can't confirm that the seller must check before posting (size, material, measurements, brand)."),
});

export type Listing = z.infer<typeof ListingSchema>;
