/*
 * One same-origin search on Vinted for comparable listings: the search a seller would type by hand, made from
 * their own logged-in tab. Deliberately minimal: a single request per click, no pagination, no background
 * crawling, a 10 minute cache, and it gives up immediately (no retry) if Vinted refuses. Nothing is stored
 * server-side or reused beyond the seller's own pricing decision.
 *
 * The endpoint below is Vinted's internal catalogue API as the site itself uses it. It is undocumented and
 * unverified from here (needs a logged-in session), so treat the response shape as a guess; pricing.js's
 * normaliseItems tolerates several shapes, and a failure is reported to the seller instead of thrown.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.VLComps = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  const TTL_MS = 10 * 60 * 1000;
  const PER_PAGE = 48;
  const memory = new Map();

  function cacheGet(key, now) {
    const hit = memory.get(key);
    return hit && now - hit.at < TTL_MS ? hit.value : null;
  }

  /**
   * @param query     search text
   * @param deps      { fetch, origin, now } injectable for tests
   * @returns {Promise<{ok:true, items:any[], cached:boolean} | {ok:false, reason:string}>}
   */
  async function fetchComps(query, deps = {}) {
    const doFetch = deps.fetch ?? fetch.bind(globalThis);
    const origin = deps.origin ?? location.origin;
    const now = deps.now ?? Date.now();
    const q = (query || "").trim();
    if (!q) return { ok: false, reason: "Nothing to search for." };

    const cached = cacheGet(q, now);
    if (cached) return { ok: true, items: cached, cached: true };

    const url = `${origin}/api/v2/catalog/items?${new URLSearchParams({ search_text: q, per_page: String(PER_PAGE), order: "relevance" })}`;
    let res;
    try {
      res = await doFetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
    } catch {
      return { ok: false, reason: "Couldn't reach Vinted's search." };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, reason: "Vinted wouldn't run the search (are you logged in?). Price left as the estimate." };
    if (res.status === 429) return { ok: false, reason: "Vinted asked us to slow down. Try again in a few minutes." };
    if (!res.ok) return { ok: false, reason: `Vinted search failed (${res.status}).` };

    let body;
    try {
      body = await res.json();
    } catch {
      return { ok: false, reason: "Vinted's search returned something unexpected." };
    }
    const items = Array.isArray(body?.items) ? body.items : null;
    if (!items) return { ok: false, reason: "Vinted's search returned something unexpected." };
    memory.set(q, { at: now, value: items });
    return { ok: true, items, cached: false };
  }

  return { fetchComps, TTL_MS, PER_PAGE, _clear: () => memory.clear() };
});
