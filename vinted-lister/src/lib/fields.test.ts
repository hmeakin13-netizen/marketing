import { describe, expect, it } from "vitest";
import { copyAllText, fitWithin, formatPrice, vintedFields } from "./fields";
import type { Listing } from "./listing-types";

const listing: Listing = {
  title: "Zara floral midi dress, size M",
  description: "Lovely dress.\n\n#zara",
  category: "Women > Clothing > Dresses > Midi dresses",
  brand: "Zara",
  size: "M",
  colours: ["Blue", "White"],
  condition: "Very good",
  parcel_size: "Small",
  price_gbp: 12.5,
  price_rationale: "x",
  flaws_noticed: [],
  confirm_with_seller: [],
};

describe("vintedFields", () => {
  it("lists fields in the order Vinted's form asks for them", () => {
    expect(vintedFields(listing).map((f) => f.key)).toEqual(["title", "description", "category", "brand", "size", "condition", "colours", "parcel", "price"]);
  });

  it("marks brand and size missing when the photos didn't show them", () => {
    const f = vintedFields({ ...listing, brand: null, size: null });
    expect(f.find((x) => x.key === "brand")).toMatchObject({ value: "", missing: true });
    expect(f.find((x) => x.key === "size")).toMatchObject({ value: "", missing: true });
    expect(f.find((x) => x.key === "title")?.missing).toBeFalsy();
  });
});

describe("formatPrice", () => {
  it("gives a clean number for Vinted's price box", () => {
    expect(formatPrice(12.5)).toBe("12.5");
    expect(formatPrice(14)).toBe("14");
    expect(formatPrice(9.999)).toBe("10");
    expect(formatPrice(3.456)).toBe("3.46");
  });
});

describe("copyAllText", () => {
  it("includes filled fields and leaves out the missing ones", () => {
    const t = copyAllText({ ...listing, brand: null });
    expect(t).toContain("Title: Zara floral midi dress, size M");
    expect(t).toContain("Price (£): 12.5");
    expect(t).not.toContain("Brand:");
    expect(t).toContain("Size: M");
  });
});

describe("fitWithin", () => {
  it("shrinks big phone photos to the longest edge", () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });
  it("never enlarges and never returns zero", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(10000, 1, 1600)).toEqual({ width: 1600, height: 1 });
  });
});
