/*
 * Turns a list of comparable Vinted listings into a price recommendation. Pure functions, no DOM, no network.
 *
 * IMPORTANT: Vinted has no public sold-price feed, so comps are normally ASKING prices of live listings.
 * Asking prices overstate what items actually sell for, so asking-based recommendations are discounted by
 * ASKING_TO_SOLD. That ratio and CONDITION_FACTOR are starting assumptions, NOT measured values: calibrate them
 * against real sold prices once users have recorded some.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.VLPricing = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  const ASKING_TO_SOLD = 0.9;
  const MIN_COMPS = 5;
  /** Relative to a typical "Very good" listing, which is what most comps are. */
  const CONDITION_FACTOR = {
    "New with tags": 1.15,
    "New without tags": 1.08,
    "Very good": 1,
    Good: 0.88,
    Satisfactory: 0.7,
  };

  function toNumber(x) {
    if (x == null) return NaN;
    if (typeof x === "number") return x;
    if (typeof x === "string") return parseFloat(x.replace(/[^0-9.]/g, ""));
    if (typeof x === "object") return toNumber(x.amount ?? x.value);
    return NaN;
  }

  /** Accepts Vinted's search-result items in any of the shapes it has used for price. */
  function normaliseItems(items) {
    return (Array.isArray(items) ? items : [])
      .map((i) => ({
        price: toNumber(i?.price ?? i?.total_item_price ?? i?.price_numeric),
        sold: i?.is_closed === true || i?.item_closure_status === "sold" || i?.status === "sold",
      }))
      .filter((c) => Number.isFinite(c.price) && c.price > 0);
  }

  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  /** Drop wild outliers (e.g. a £400 "dress" in a £15 market) once there's enough data to tell. */
  function trimOutliers(prices) {
    const s = [...prices].sort((a, b) => a - b);
    if (s.length < 8) return s;
    const q1 = quantile(s, 0.25);
    const q3 = quantile(s, 0.75);
    const iqr = q3 - q1;
    return s.filter((p) => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr);
  }

  function summarise(comps) {
    const sold = comps.filter((c) => c.sold);
    const basis = sold.length >= MIN_COMPS ? "sold" : "asking";
    const prices = trimOutliers((basis === "sold" ? sold : comps).map((c) => c.price));
    return {
      n: prices.length,
      basis,
      median: quantile(prices, 0.5),
      p25: quantile(prices, 0.25),
      p75: quantile(prices, 0.75),
      min: prices[0],
      max: prices[prices.length - 1],
    };
  }

  function roundPrice(p) {
    return p < 10 ? Math.round(p * 2) / 2 : Math.round(p);
  }

  /** @returns {{price:number, low:number, high:number, text:string} | {price:null, text:string}} */
  function recommend(summary, condition) {
    if (!summary || summary.n < MIN_COMPS) {
      return { price: null, text: `Only ${summary?.n ?? 0} comparable listings found, too few to price from. Keeping the estimate.` };
    }
    const discount = summary.basis === "sold" ? 1 : ASKING_TO_SOLD;
    const cond = CONDITION_FACTOR[condition] ?? 1;
    const adj = (p) => roundPrice(Math.max(0.5, p * discount * cond));
    const price = adj(summary.median);
    const low = Math.min(price, adj(summary.p25));
    const high = Math.max(price, adj(summary.p75));
    const kind = summary.basis === "sold" ? "sold" : "asking";
    const note = summary.basis === "sold" ? "" : ` (asking prices, so discounted ${Math.round((1 - ASKING_TO_SOLD) * 100)}%)`;
    return {
      price,
      low,
      high,
      text: `Median of ${summary.n} similar ${kind} listings is £${summary.median.toFixed(2)}${note}. Suggested £${price}, typical range £${low}-£${high}.`,
    };
  }

  /** The search a person would type: brand + the specific item type, e.g. "Zara Midi dresses". */
  function buildQuery(listing) {
    const itemType = (listing.category || "").split(">").pop().trim();
    return [listing.brand, itemType].filter(Boolean).join(" ").trim() || (listing.title || "").slice(0, 60);
  }

  return { toNumber, normaliseItems, trimOutliers, quantile, summarise, recommend, buildQuery, ASKING_TO_SOLD, MIN_COMPS, CONDITION_FACTOR };
});
