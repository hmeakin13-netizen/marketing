/*
 * Every Vinted-specific selector lives here. They are best guesses from Vinted's current markup and have NOT
 * been verified against the live site (it needs a logged-in session). When Vinted changes its markup, or a field
 * shows as "not found" in the panel report, this is the only file that needs editing.
 * Each entry is a list tried in order; the first match wins.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.VLSelectors = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  return {
    /** Pages the panel appears on (pathname). */
    sellPagePattern: /^\/items\/new\/?$/,

    photoInput: ['input[type="file"][accept*="image"]', 'input[type="file"]'],

    title: ['[data-testid="title--input"]', 'input[name="title"]', "#title"],
    description: ['[data-testid="description--input"]', 'textarea[name="description"]', "#description"],
    price: ['[data-testid="price-input--input"]', 'input[name="price"]', "#price"],

    /** Click targets that open a dropdown / picker. */
    category: ['[data-testid="category-select-dropdown-input"]', "#category"],
    brand: ['[data-testid="brand-select-dropdown-input"]', "#brand"],
    size: ['[data-testid="size-select-dropdown-input"]', "#size"],
    condition: ['[data-testid="condition-select-dropdown-input"]', "#status"],
    colour: ['[data-testid="color-select-dropdown-input"]', "#color"],

    /** Items inside an open dropdown. */
    option: ['[role="option"]', '[data-testid$="--cell"]', '[data-testid*="cell"]', "li[role]"],
    /** Radio-style cards (parcel size). */
    radio: ['[role="radio"]', 'label', 'input[type="radio"]'],
  };
});
