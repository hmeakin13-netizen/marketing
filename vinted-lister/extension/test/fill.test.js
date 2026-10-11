// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const VLFill = require("../fill.js");
const VLSelectors = require("../selectors.js");

const listing = {
  title: "Zara floral midi dress, size M",
  description: "Lovely dress.\n\n#zara #dress",
  category: "Women > Clothing > Dresses > Midi dresses",
  brand: "Zara",
  size: "M",
  colours: ["Blue", "White"],
  condition: "Very good",
  parcel_size: "Small",
  price_gbp: 12.5,
};

/** Mimics a custom dropdown: clicking the trigger shows a list; clicking an option closes it. */
function dropdown(testid, options, { onPick } = {}) {
  const trigger = document.createElement("div");
  trigger.setAttribute("data-testid", testid);
  const list = document.createElement("ul");
  document.body.append(trigger, list);
  trigger.addEventListener("click", () => {
    list.replaceChildren(
      ...options.map((o) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.textContent = o;
        li.addEventListener("click", () => {
          onPick?.(o, list);
        });
        return li;
      }),
    );
  });
  return { trigger, list };
}

const opts = { requireVisible: false, timeout: 300, settle: 5 };

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("setNativeValue", () => {
  it("bypasses a React-style value tracker and fires input/change", () => {
    const input = document.createElement("input");
    document.body.append(input);
    // React patches the instance `value` property; assigning through it is swallowed.
    let tracked = "";
    Object.defineProperty(input, "value", { get: () => tracked, set: () => {}, configurable: true });
    const events = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    // real setter must still be reachable via the prototype
    VLFill.setNativeValue(input, "hello");
    expect(proto.get.call(input)).toBe("hello");
    expect(events).toEqual(["input", "change"]);
  });
});

describe("fillText", () => {
  it("uses the first selector that matches and reports missing fields", () => {
    document.body.innerHTML = `<input name="title" />`;
    expect(VLFill.fillText(VLSelectors.title, "Hi", "title")).toEqual({ field: "title", ok: true });
    expect(document.querySelector("input").value).toBe("Hi");
    expect(VLFill.fillText(VLSelectors.price, "1", "price")).toMatchObject({ ok: false });
  });
});

describe("chooseCategory", () => {
  it("walks a multi-level path, re-rendering the list at each level", async () => {
    const trigger = document.createElement("div");
    trigger.setAttribute("data-testid", "category-select-dropdown-input");
    const list = document.createElement("ul");
    document.body.append(trigger, list);
    const tree = {
      "": ["Women", "Men"],
      Women: ["Clothing", "Shoes"],
      Clothing: ["Dresses", "Tops"],
      Dresses: ["Midi dresses", "Maxi dresses"],
    };
    const chosen = [];
    const show = (key) =>
      list.replaceChildren(
        ...tree[key].map((name) => {
          const li = document.createElement("li");
          li.setAttribute("role", "option");
          li.textContent = name;
          li.addEventListener("click", () => {
            chosen.push(name);
            if (tree[name]) show(name);
          });
          return li;
        }),
      );
    trigger.addEventListener("click", () => show(""));

    const res = await VLFill.chooseCategory(VLSelectors.category, VLSelectors.option, listing.category, opts);
    expect(res).toEqual({ field: "category", ok: true });
    expect(chosen).toEqual(["Women", "Clothing", "Dresses", "Midi dresses"]);
  });

  it("reports how far it got when a level is missing", async () => {
    const { trigger } = dropdown("category-select-dropdown-input", ["Men"]);
    const res = await VLFill.chooseCategory(VLSelectors.category, VLSelectors.option, "Women > Clothing", opts);
    expect(res.ok).toBe(false);
    expect(res.note).toMatch(/Women/);
    expect(trigger).toBeTruthy();
  });
});

describe("chooseOption matching", () => {
  it("prefers an exact match over a substring (Good vs Very good)", async () => {
    const picked = [];
    dropdown("condition-select-dropdown-input", ["Very good", "Good", "Satisfactory"], { onPick: (o) => picked.push(o) });
    const res = await VLFill.chooseOption(VLSelectors.condition, VLSelectors.option, "Good", "condition", opts);
    expect(res.ok).toBe(true);
    expect(picked).toEqual(["Good"]);
  });

  it("reports when the option isn't in the list", async () => {
    dropdown("brand-select-dropdown-input", ["Nike", "Adidas"]);
    const res = await VLFill.chooseOption(VLSelectors.brand, VLSelectors.option, "Zara", "brand", opts);
    expect(res).toMatchObject({ field: "brand", ok: false });
  });

  it("reports a missing dropdown instead of throwing", async () => {
    const res = await VLFill.chooseOption(VLSelectors.size, VLSelectors.option, "M", "size", opts);
    expect(res).toMatchObject({ ok: false, note: "dropdown not found on page" });
  });
});

describe("attachPhotos", () => {
  it("sets files on the input and fires change", () => {
    document.body.innerHTML = `<input type="file" accept="image/*" multiple />`;
    const input = document.querySelector("input");
    let changed = 0;
    input.addEventListener("change", () => changed++);
    globalThis.DataTransfer = class {
      constructor() {
        this.items = { add: (f) => (this.files = [...(this.files || []), f]) };
        this.files = [];
      }
    };
    // jsdom's input.files is read-only; emulate the setter the browser provides
    Object.defineProperty(input, "files", { writable: true, value: null });
    const files = [new File(["a"], "a.jpg"), new File(["b"], "b.jpg")];
    expect(VLFill.attachPhotos(VLSelectors.photoInput, files)).toEqual({ field: "photos", ok: true });
    expect(input.files).toHaveLength(2);
    expect(changed).toBe(1);
  });
});

describe("fillListing", () => {
  it("fills what exists, reports what doesn't, and never clicks an Upload button", async () => {
    let uploadClicked = false;
    document.body.innerHTML = `
      <input name="title" /><textarea name="description"></textarea><input name="price" />
      <button data-testid="upload-button">Upload</button>
      <label>Small</label><label>Medium</label>`;
    document.querySelector("[data-testid=upload-button]").addEventListener("click", () => (uploadClicked = true));
    globalThis.DataTransfer = undefined;

    const report = await VLFill.fillListing({ ...listing, brand: null, size: null }, [], VLSelectors, opts);
    const byField = Object.fromEntries(report.map((r) => [r.field, r]));

    expect(document.querySelector("[name=title]").value).toBe(listing.title);
    expect(document.querySelector("[name=description]").value).toBe(listing.description);
    expect(document.querySelector("[name=price]").value).toBe("12.5");
    expect(byField.title.ok && byField.description.ok && byField.price.ok && byField["parcel size"].ok).toBe(true);
    expect(byField.photos.ok).toBe(false); // no upload box on this fixture
    expect(byField.category.ok).toBe(false); // no dropdown on this fixture
    expect(byField.brand.note).toMatch(/not visible/);
    expect(uploadClicked).toBe(false);
  });
});
