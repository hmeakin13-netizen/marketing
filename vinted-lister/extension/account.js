/*
 * Works out which Vinted account the seller is logged into, so the subscription's account slot can be
 * claimed without typing. One same-origin request to Vinted's "current user" endpoint (internal, undocumented,
 * unverified from here); if it fails the panel asks for the username instead. Never retried.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.VLAccount = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  function pickId(body) {
    const u = body?.user ?? body;
    const id = u?.login ?? u?.id;
    return id != null && /^[A-Za-z0-9_.@-]{2,64}$/.test(String(id)) ? String(id).toLowerCase().replace(/^@/, "") : null;
  }

  /** @returns {Promise<string|null>} */
  async function detect(deps = {}) {
    const doFetch = deps.fetch ?? fetch.bind(globalThis);
    const origin = deps.origin ?? location.origin;
    try {
      const res = await doFetch(`${origin}/api/v2/users/current`, { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      return pickId(await res.json());
    } catch {
      return null;
    }
  }

  return { detect, pickId };
});
