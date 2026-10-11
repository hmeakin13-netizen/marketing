import { describe, expect, it } from "vitest";
import { checkQuota, normaliseUsage, PLANS, FAIR_USE_CAP } from "./plans";

const start = "2026-10-01T00:00:00.000Z";

describe("trial", () => {
  it("allows 5 listings then blocks and points to Starter", () => {
    expect(checkQuota({ plan: "trial", used: 4, periodStart: start })).toEqual({ allowed: true, remaining: 1 });
    expect(checkQuota({ plan: "trial", used: 5, periodStart: start })).toEqual({
      allowed: false,
      reason: "limit_reached",
      upgradeTo: "starter",
    });
  });

  it("never resets, however long ago it started", () => {
    const later = new Date("2027-06-01T00:00:00.000Z");
    expect(checkQuota({ plan: "trial", used: 5, periodStart: start }, later).allowed).toBe(false);
  });
});

describe("starter (£10 / 30 per month)", () => {
  it("costs £10 and allows 30", () => {
    expect(PLANS.starter.pricePence).toBe(1000);
    expect(PLANS.starter.limit).toBe(30);
  });

  it("blocks at 30 and points to Unlimited", () => {
    expect(checkQuota({ plan: "starter", used: 30, periodStart: start }, new Date("2026-10-15"))).toEqual({
      allowed: false,
      reason: "limit_reached",
      upgradeTo: "unlimited",
    });
  });

  it("resets after a month", () => {
    const now = new Date("2026-11-02T00:00:00.000Z");
    expect(normaliseUsage({ plan: "starter", used: 30, periodStart: start }, now).used).toBe(0);
    expect(checkQuota({ plan: "starter", used: 30, periodStart: start }, now)).toEqual({ allowed: true, remaining: 30 });
  });
});

describe("unlimited (£30)", () => {
  it("has no remaining count and is blocked only by the fair-use cap", () => {
    const now = new Date("2026-10-15");
    expect(checkQuota({ plan: "unlimited", used: 500, periodStart: start }, now)).toEqual({ allowed: true, remaining: null });
    expect(checkQuota({ plan: "unlimited", used: FAIR_USE_CAP, periodStart: start }, now)).toEqual({
      allowed: false,
      reason: "fair_use",
      upgradeTo: null,
    });
  });
});
