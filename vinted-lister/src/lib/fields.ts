import type { Listing } from "./listing-types";

export interface FieldRow {
  key: string;
  label: string;
  value: string;
  /** true when the model couldn't read it from the photos; the seller has to fill it in */
  missing?: boolean;
  multiline?: boolean;
}

/** The listing's fields in roughly the order Vinted's "Sell an item" form asks for them. */
export function vintedFields(l: Listing): FieldRow[] {
  return [
    { key: "title", label: "Title", value: l.title },
    { key: "description", label: "Description", value: l.description, multiline: true },
    { key: "category", label: "Category", value: l.category },
    { key: "brand", label: "Brand", value: l.brand ?? "", missing: !l.brand },
    { key: "size", label: "Size", value: l.size ?? "", missing: !l.size },
    { key: "condition", label: "Condition", value: l.condition },
    { key: "colours", label: "Colour", value: l.colours.join(", ") },
    { key: "parcel", label: "Parcel size", value: l.parcel_size },
    { key: "price", label: "Price (£)", value: formatPrice(l.price_gbp) },
  ];
}

/** "12.5", not "12.50" or "£12.50": ready to paste into Vinted's number box. */
export function formatPrice(p: number): string {
  return String(Number(p.toFixed(2)));
}

/** One block of text with every field, for a single "Copy all". */
export function copyAllText(l: Listing): string {
  return vintedFields(l)
    .filter((f) => !f.missing && f.value)
    .map((f) => `${f.label}: ${f.value}`)
    .join("\n\n");
}

/** Target size for shrinking a photo so its longest edge is at most `max`, never enlarging. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
