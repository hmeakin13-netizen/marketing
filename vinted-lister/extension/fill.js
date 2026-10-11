/*
 * Fills Vinted's "Sell an item" form from a generated listing. Best-effort by design: every field reports
 * ok / not-ok so the seller can finish anything that failed by hand. Never clicks Vinted's final Upload button.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.VLFill = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();

  function findFirst(selectors, root = document) {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function findAll(selectors, root = document) {
    const seen = new Set();
    for (const sel of selectors) root.querySelectorAll(sel).forEach((el) => seen.add(el));
    return [...seen];
  }

  const visible = (el) => el.getClientRects().length > 0;

  /** React/Vue-controlled inputs ignore plain `.value =`; go through the native setter and fire events. */
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillText(selectors, value, field) {
    const el = findFirst(selectors);
    if (!el) return { field, ok: false, note: "field not found on page" };
    setNativeValue(el, String(value));
    return { field, ok: true };
  }

  async function waitFor(fn, timeout = 3000, step = 100) {
    const end = Date.now() + timeout;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() >= end) return null;
      await sleep(step);
    }
  }

  /** exact match beats prefix beats substring */
  function bestMatch(els, text) {
    const t = norm(text);
    const labelled = els.map((el) => ({ el, label: norm(el.textContent) })).filter((x) => x.label);
    return (
      labelled.find((x) => x.label === t) ||
      labelled.find((x) => x.label.startsWith(t)) ||
      labelled.find((x) => x.label.includes(t)) ||
      null
    )?.el;
  }

  /** Pick `text` from the options currently on screen (the dropdown must already be open). */
  async function pickOption(optionSelectors, text, { requireVisible = true, timeout = 3000 } = {}) {
    const el = await waitFor(() => {
      const els = findAll(optionSelectors).filter((e) => !requireVisible || visible(e));
      return bestMatch(els, text);
    }, timeout);
    if (!el) return false;
    el.click();
    return true;
  }

  async function chooseOption(triggerSelectors, optionSelectors, text, field, opts = {}) {
    const trigger = findFirst(triggerSelectors);
    if (!trigger) return { field, ok: false, note: "dropdown not found on page" };
    trigger.click();
    const ok = await pickOption(optionSelectors, text, opts);
    return ok ? { field, ok: true } : { field, ok: false, note: `couldn't find "${text}" in the list` };
  }

  /** "Women > Clothing > Dresses": open once, then click each level in turn. */
  async function chooseCategory(triggerSelectors, optionSelectors, path, opts = {}) {
    const field = "category";
    const trigger = findFirst(triggerSelectors);
    if (!trigger) return { field, ok: false, note: "dropdown not found on page" };
    trigger.click();
    const parts = path.split(">").map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      const ok = await pickOption(optionSelectors, part, opts);
      if (!ok) return { field, ok: false, note: `got as far as the level before "${part}", choose the rest by hand` };
      await sleep(opts.settle ?? 250);
    }
    return { field, ok: true };
  }

  async function clickByText(selectors, text, field, opts = {}) {
    const el = await waitFor(() => {
      const els = findAll(selectors).filter((e) => !opts.requireVisible || visible(e));
      return bestMatch(els, text);
    }, opts.timeout ?? 1500);
    if (!el) return { field, ok: false, note: `couldn't find "${text}"` };
    el.click();
    return { field, ok: true };
  }

  function attachPhotos(selectors, files) {
    const input = findFirst(selectors);
    if (!input) return { field: "photos", ok: false, note: "upload box not found on page" };
    if (typeof DataTransfer === "undefined") return { field: "photos", ok: false, note: "browser can't attach files" };
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return { field: "photos", ok: true };
  }

  /**
   * @param listing  the generated listing (see src/lib/listing-types.ts)
   * @param files    the seller's original photo Files
   * @param sel      VLSelectors
   * @returns array of { field, ok, note? }
   */
  async function fillListing(listing, files, sel, opts = {}) {
    const report = [];
    const settle = opts.settle ?? 400;

    report.push(attachPhotos(sel.photoInput, files));
    await sleep(settle);
    report.push(fillText(sel.title, listing.title, "title"));
    report.push(fillText(sel.description, listing.description, "description"));

    // Category first: size and brand options depend on it.
    report.push(await chooseCategory(sel.category, sel.option, listing.category, opts));
    await sleep(settle);

    if (listing.brand) report.push(await chooseOption(sel.brand, sel.option, listing.brand, "brand", opts));
    else report.push({ field: "brand", ok: false, note: "not visible in photos, set it yourself" });

    if (listing.size) report.push(await chooseOption(sel.size, sel.option, listing.size, "size", opts));
    else report.push({ field: "size", ok: false, note: "not visible in photos, set it yourself" });

    report.push(await chooseOption(sel.condition, sel.option, listing.condition, "condition", opts));

    if (listing.colours?.length) {
      const trigger = findFirst(sel.colour);
      if (!trigger) report.push({ field: "colour", ok: false, note: "dropdown not found on page" });
      else {
        trigger.click();
        let picked = 0;
        for (const c of listing.colours) if (await pickOption(sel.option, c, opts)) picked++;
        report.push(
          picked === listing.colours.length
            ? { field: "colour", ok: true }
            : { field: "colour", ok: false, note: `picked ${picked} of ${listing.colours.length}` },
        );
      }
    }

    report.push(await clickByText(sel.radio, listing.parcel_size, "parcel size", opts));
    report.push(fillText(sel.price, Number(listing.price_gbp.toFixed(2)), "price"));
    return report;
  }

  return { setNativeValue, fillText, chooseOption, chooseCategory, clickByText, attachPhotos, fillListing, norm, bestMatch };
});
