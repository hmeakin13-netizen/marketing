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

import { ADDON_ACCOUNT_PENCE, linkAccount, monthlyPricePence, normaliseAccountId, slotsFor, unlinkAccount, type Usage } from "./plans";

const paid = (extra = 0, accounts: string[] = []): Usage => ({ plan: "starter", used: 0, periodStart: start, extraAccounts: extra, accounts });

describe("accounts and add-ons (£20 per extra Vinted account)", () => {
  it("includes 1 account, +1 per paid add-on, never more than 1 on the trial", () => {
    expect(slotsFor(paid(0))).toBe(1);
    expect(slotsFor(paid(2))).toBe(3);
    expect(slotsFor({ plan: "trial", used: 0, periodStart: start, extraAccounts: 5 })).toBe(1);
  });

  it("prices add-ons at £20 each on top of the plan", () => {
    expect(ADDON_ACCOUNT_PENCE).toBe(2000);
    expect(monthlyPricePence("starter", 0)).toBe(1000);
    expect(monthlyPricePence("starter", 1)).toBe(3000);
    expect(monthlyPricePence("unlimited", 2)).toBe(7000);
    expect(monthlyPricePence("trial", 3)).toBe(0);
  });

  it("gives every account the plan's full allowance", () => {
    const now = new Date("2026-10-15");
    expect(checkQuota({ ...paid(1), used: 59 }, now)).toEqual({ allowed: true, remaining: 1 });
    expect(checkQuota({ ...paid(1), used: 60 }, now)).toMatchObject({ allowed: false, reason: "limit_reached" });
    expect(checkQuota({ ...paid(0), used: 30 }, now)).toMatchObject({ allowed: false });
  });

  it("links one account, is idempotent, and blocks a second until an add-on is bought", () => {
    const a = linkAccount(paid(0), "@Jane_Sells");
    expect(a).toMatchObject({ ok: true, alreadyLinked: false });
    if (!a.ok) throw new Error();
    expect(a.usage.accounts).toEqual(["jane_sells"]);
    expect(linkAccount(a.usage, "jane_sells")).toMatchObject({ ok: true, alreadyLinked: true });
    expect(linkAccount(a.usage, "someone_else")).toEqual({ ok: false, reason: "slots_full", slots: 1, canBuyMore: true, addonPence: 2000 });
    const b = linkAccount({ ...a.usage, extraAccounts: 1 }, "someone_else");
    expect(b).toMatchObject({ ok: true });
  });

  it("doesn't offer add-ons on the trial", () => {
    const t: Usage = { plan: "trial", used: 0, periodStart: start, accounts: ["me_1"] };
    expect(linkAccount(t, "other_2")).toMatchObject({ ok: false, reason: "slots_full", canBuyMore: false });
  });

  it("rejects junk ids", () => {
    for (const bad of ["", " ", "a", "has space", "<script>", "x".repeat(65)]) expect(normaliseAccountId(bad)).toBeNull();
    expect(linkAccount(paid(), "!!")).toEqual({ ok: false, reason: "invalid_id" });
    expect(normaliseAccountId("  @Jane.Doe-9 ")).toBe("jane.doe-9");
  });

  it("allows one unlink per 30 days so a slot can't be passed around", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    const u = paid(1, ["a1", "b2"]);
    const first = unlinkAccount(u, "a1", now);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error();
    expect(first.usage.accounts).toEqual(["b2"]);
    const second = unlinkAccount(first.usage, "b2", new Date("2026-10-20T00:00:00Z"));
    expect(second).toMatchObject({ ok: false, reason: "cooldown" });
    expect(unlinkAccount(first.usage, "b2", new Date("2026-11-01T00:00:00Z")).ok).toBe(true);
    expect(unlinkAccount(u, "nobody", now)).toEqual({ ok: false, reason: "not_linked" });
  });
});
