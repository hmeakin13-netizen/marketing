import { describe, expect, it, vi } from "vitest";
import { createRequire } from "module";

const A = createRequire(import.meta.url)("../account.js");
const ok = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });

describe("VLAccount", () => {
  it("reads the login (or id) from the response shapes Vinted might use", async () => {
    expect(A.pickId({ user: { login: "Jane_Sells", id: 123 } })).toBe("jane_sells");
    expect(A.pickId({ user: { id: 4567 } })).toBe("4567");
    expect(A.pickId({ login: "@bob.s" })).toBe("bob.s");
  });

  it("rejects junk and missing ids", () => {
    expect(A.pickId({})).toBeNull();
    expect(A.pickId({ user: { login: "<img src=x>" } })).toBeNull();
    expect(A.pickId(null)).toBeNull();
  });

  it("makes one request and returns null on any failure instead of throwing", async () => {
    const f = vi.fn().mockResolvedValue(ok({ user: { login: "amy_k" } }));
    expect(await A.detect({ fetch: f, origin: "https://www.vinted.co.uk" })).toBe("amy_k");
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe("https://www.vinted.co.uk/api/v2/users/current");
    expect(await A.detect({ fetch: vi.fn().mockResolvedValue(ok({}, 401)), origin: "o" })).toBeNull();
    expect(await A.detect({ fetch: vi.fn().mockRejectedValue(new Error("x")), origin: "o" })).toBeNull();
    expect(await A.detect({ fetch: vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error("bad json"); } }), origin: "o" })).toBeNull();
  });
});
