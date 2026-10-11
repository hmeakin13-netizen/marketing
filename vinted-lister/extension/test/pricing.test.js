import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const P = createRequire(import.meta.url)("../pricing.js");
const asking = (...prices) => prices.map((price) => ({ price, sold: false }));

describe("normaliseItems", () => {
  it("handles the price shapes Vinted has used and drops junk", () => {
    const out = P.normaliseItems([
      { price: "12.50" },
      { price: { amount: "8.0", currency_code: "GBP" } },
      { price: 20 },
      { price: "£5" },
      { price: null },
      { price: "free" },
      { price: 0 },
      { price: 9, is_closed: true },
    ]);
    expect(out.map((c) => c.price)).toEqual([12.5, 8, 20, 5, 9]);
    expect(out.at(-1).sold).toBe(true);
  });

  it("copes with a non-array response", () => {
    expect(P.normaliseItems(undefined)).toEqual([]);
    expect(P.normaliseItems({ error: "x" })).toEqual([]);
  });
});

describe("summarise", () => {
  it("trims a wild outlier once there are enough comps", () => {
    const s = P.summarise(asking(10, 11, 12, 12, 13, 14, 15, 16, 400));
    expect(s.max).toBeLessThan(100);
    expect(s.n).toBe(8);
    expect(s.median).toBeCloseTo(12.5, 1);
  });

  it("uses sold prices only when there are enough of them", () => {
    const few = [...asking(20, 22, 24, 26, 28, 30), { price: 8, sold: true }, { price: 9, sold: true }];
    expect(P.summarise(few).basis).toBe("asking");
    const many = [...asking(20, 22, 24), ...[8, 9, 10, 11, 12].map((price) => ({ price, sold: true }))];
    const s = P.summarise(many);
    expect(s.basis).toBe("sold");
    expect(s.median).toBe(10);
  });
});

describe("recommend", () => {
  const comps = asking(10, 12, 14, 15, 16, 18, 20);
  const summary = P.summarise(comps);

  it("discounts asking prices and applies condition", () => {
    const veryGood = P.recommend(summary, "Very good");
    expect(veryGood.price).toBe(Math.round(15 * P.ASKING_TO_SOLD)); // median 15 -> 14 (13.5 rounds to 14)
    expect(veryGood.low).toBeLessThanOrEqual(veryGood.price);
    expect(veryGood.high).toBeGreaterThanOrEqual(veryGood.price);
    expect(P.recommend(summary, "Satisfactory").price).toBeLessThan(veryGood.price);
    expect(P.recommend(summary, "New with tags").price).toBeGreaterThan(veryGood.price);
    expect(veryGood.text).toMatch(/asking prices, so discounted 10%/);
  });

  it("doesn't discount genuine sold prices", () => {
    const sold = P.summarise([8, 9, 10, 11, 12].map((price) => ({ price, sold: true })));
    const r = P.recommend(sold, "Very good");
    expect(r.price).toBe(10);
    expect(r.text).not.toMatch(/discounted/);
  });

  it("refuses to price from too few comps", () => {
    const r = P.recommend(P.summarise(asking(10, 12)), "Good");
    expect(r.price).toBeNull();
    expect(r.text).toMatch(/too few/);
  });

  it("rounds cheap items to 50p and others to whole pounds, never below 50p", () => {
    expect(P.recommend(P.summarise(asking(3, 3, 3.4, 3.6, 4)), "Very good").price % 0.5).toBe(0);
    expect(P.recommend(P.summarise(asking(0.1, 0.1, 0.1, 0.1, 0.1)), "Satisfactory").price).toBeGreaterThanOrEqual(0.5);
  });
});

describe("buildQuery", () => {
  it("uses brand + item type from the category", () => {
    expect(P.buildQuery({ brand: "Zara", category: "Women > Clothing > Dresses > Midi dresses", title: "x" })).toBe("Zara Midi dresses");
  });
  it("falls back to the item type, then the title", () => {
    expect(P.buildQuery({ brand: null, category: "Men > Shoes > Trainers", title: "x" })).toBe("Trainers");
    expect(P.buildQuery({ brand: null, category: "", title: "Vintage lamp" })).toBe("Vintage lamp");
  });
});
