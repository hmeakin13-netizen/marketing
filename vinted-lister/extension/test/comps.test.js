import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "module";

const C = createRequire(import.meta.url)("../comps.js");
const ok = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });

beforeEach(() => C._clear());

describe("fetchComps", () => {
  it("makes exactly one same-origin request with the query", async () => {
    const f = vi.fn().mockResolvedValue(ok({ items: [{ price: "10" }] }));
    const r = await C.fetchComps("Zara Midi dresses", { fetch: f, origin: "https://www.vinted.co.uk", now: 0 });
    expect(r).toMatchObject({ ok: true, cached: false, items: [{ price: "10" }] });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toMatch(/^https:\/\/www\.vinted\.co\.uk\/api\/v2\/catalog\/items\?/);
    expect(new URL(url).searchParams.get("search_text")).toBe("Zara Midi dresses");
    expect(init.credentials).toBe("same-origin");
  });

  it("serves repeat searches from cache for 10 minutes, then asks again", async () => {
    const f = vi.fn().mockResolvedValue(ok({ items: [{ price: 1 }] }));
    await C.fetchComps("q", { fetch: f, origin: "o", now: 0 });
    expect((await C.fetchComps("q", { fetch: f, origin: "o", now: 5 * 60 * 1000 })).cached).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    await C.fetchComps("q", { fetch: f, origin: "o", now: C.TTL_MS + 1 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it.each([
    [401, /logged in/],
    [403, /logged in/],
    [429, /slow down/],
    [500, /500/],
  ])("gives up without retrying on HTTP %i", async (status, msg) => {
    const f = vi.fn().mockResolvedValue(ok({}, status));
    const r = await C.fetchComps("q", { fetch: f, origin: "o", now: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(msg);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("reports network errors and unexpected bodies instead of throwing", async () => {
    expect((await C.fetchComps("q", { fetch: vi.fn().mockRejectedValue(new Error("x")), origin: "o", now: 0 })).ok).toBe(false);
    C._clear();
    const bad = vi.fn().mockResolvedValue(ok({ nope: true }));
    expect((await C.fetchComps("q", { fetch: bad, origin: "o", now: 0 })).reason).toMatch(/unexpected/);
    expect((await C.fetchComps("  ", { fetch: bad, origin: "o", now: 0 })).ok).toBe(false);
  });

  it("doesn't cache failures", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok({}, 429)).mockResolvedValueOnce(ok({ items: [] }));
    await C.fetchComps("q", { fetch: f, origin: "o", now: 0 });
    expect((await C.fetchComps("q", { fetch: f, origin: "o", now: 1 })).ok).toBe(true);
  });
});
