/*
 * The Vinted Lister panel. Appears on Vinted's "Sell an item" page (and follows SPA navigation).
 * Flow: pick photos -> Generate -> review/edit -> "Fill Vinted form" -> seller checks and clicks Vinted's Upload.
 * All text from the model is inserted with textContent/value, never innerHTML.
 */
(function () {
  const HOST_ID = "vinted-lister-host";
  const MAX_PHOTOS = 5;
  const send = (msg) => chrome.runtime.sendMessage(msg);

  const state = { files: [], notes: "", listing: null, report: null, busy: false, error: null, quota: null, plan: "" };
  let root = null; // shadow root

  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else if (v === true) el.setAttribute(k, "");
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }

  const CSS = `
    :host { all: initial; }
    .wrap { position: fixed; right: 16px; bottom: 16px; width: 340px; max-height: 80vh; overflow: auto; z-index: 2147483647;
      font: 13px/1.4 system-ui, sans-serif; color: #0f172a; background: #fff; border: 1px solid #cbd5e1; border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,.18); }
    header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #0d9488; color: #fff;
      border-radius: 12px 12px 0 0; font-weight: 600; }
    header button { background: none; border: 0; color: #fff; cursor: pointer; font-size: 16px; }
    .body { padding: 12px; display: grid; gap: 10px; }
    .muted { color: #64748b; font-size: 12px; }
    input[type=text], input[type=number], textarea { width: 100%; box-sizing: border-box; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; font: inherit; }
    textarea { resize: vertical; }
    button.primary { padding: 8px 12px; border: 0; border-radius: 6px; background: #0d9488; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
    button.primary:disabled { opacity: .5; cursor: default; }
    button.link { background: none; border: 0; color: #0d9488; cursor: pointer; padding: 0; font: inherit; text-decoration: underline; }
    .err { color: #b91c1c; } .ok { color: #047857; } .warn { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; padding: 8px; }
    ul { margin: 4px 0 0; padding-left: 18px; }
    .thumbs { display: flex; gap: 6px; flex-wrap: wrap; } .thumbs img { width: 52px; height: 52px; object-fit: cover; border-radius: 6px; }
  `;

  // ---- photos ---------------------------------------------------------------------------------------------

  /** Downscale for the API (cheaper + faster); the originals still go to Vinted untouched. */
  async function toApiPhoto(file) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { mediaType: "image/jpeg", data: dataUrl.split(",")[1] };
  }

  // ---- actions --------------------------------------------------------------------------------------------

  async function refreshUsage() {
    const res = await send({ type: "usage" });
    if (res?.status === 200) {
      state.quota = res.body.quota;
      state.plan = res.body.plan;
    }
    render();
  }

  async function generate() {
    state.busy = true;
    state.error = null;
    state.listing = null;
    state.report = null;
    render();
    try {
      const photos = await Promise.all(state.files.map(toApiPhoto));
      const res = await send({ type: "generate", photos, notes: state.notes });
      if (res.status === 200) {
        state.listing = res.body.listing;
        state.quota = res.body.quota;
        state.plan = res.body.plan;
      } else if (res.status === 402) {
        state.quota = res.body.quota;
        state.error = "You've used all your listings on this plan. Upgrade in the web app to keep going.";
      } else if (res.status === 401 || res.body?.error === "no_key") {
        state.error = "Add your extension key in settings first.";
      } else if (res.status === 0) {
        state.error = "Can't reach the Vinted Lister app. Is it running, and is the address right in settings?";
      } else {
        state.error = res.body?.error || "Something went wrong.";
      }
    } catch (e) {
      state.error = "Couldn't read one of those photos.";
    }
    state.busy = false;
    render();
  }

  async function fillForm() {
    state.busy = true;
    state.report = null;
    render();
    state.report = await VLFill.fillListing(state.listing, state.files, VLSelectors);
    state.busy = false;
    render();
  }

  // ---- view -----------------------------------------------------------------------------------------------

  function quotaLine() {
    if (!state.quota) return null;
    if (!state.quota.allowed) return h("span", { class: "err" }, "No listings left");
    return h("span", {}, state.quota.remaining === null ? "Unlimited" : `${state.quota.remaining} left`);
  }

  function view() {
    const blocked = state.quota && !state.quota.allowed;
    const body = h("div", { class: "body" });

    body.append(
      h("div", { class: "muted" }, state.plan || "", " · ", quotaLine() || ""),
      h("input", {
        type: "file",
        accept: "image/jpeg,image/png,image/webp",
        multiple: true,
        onchange: (e) => {
          state.files = [...e.target.files].slice(0, MAX_PHOTOS);
          render();
        },
      }),
    );
    if (state.files.length) {
      body.append(h("div", { class: "thumbs" }, state.files.map((f) => h("img", { src: URL.createObjectURL(f), alt: "" }))));
    }
    body.append(
      h("textarea", {
        rows: 2,
        maxlength: 500,
        placeholder: "Notes (size M, worn twice…)",
        value: state.notes,
        oninput: (e) => (state.notes = e.target.value),
      }),
      h(
        "button",
        { class: "primary", disabled: !state.files.length || state.busy || blocked, onclick: generate },
        state.busy && !state.listing ? "Working…" : "Generate listing",
      ),
    );

    if (state.error) {
      body.append(
        h("div", { class: "err" }, state.error, " ", h("button", { class: "link", onclick: () => send({ type: "openOptions" }) }, "Settings")),
      );
    }

    const l = state.listing;
    if (l) {
      body.append(
        h("label", {}, "Title", h("input", { type: "text", value: l.title, oninput: (e) => (l.title = e.target.value) })),
        h(
          "label",
          {},
          "Description",
          h("textarea", { rows: 6, value: l.description, oninput: (e) => (l.description = e.target.value) }),
        ),
        h(
          "label",
          {},
          "Price (£)",
          h("input", { type: "number", step: "0.01", value: l.price_gbp, oninput: (e) => (l.price_gbp = Number(e.target.value) || 0) }),
        ),
        h("div", { class: "muted" }, l.price_rationale),
        h(
          "div",
          { class: "muted" },
          [l.category, l.brand, l.size && `size ${l.size}`, l.condition, l.colours.join("/"), `${l.parcel_size} parcel`].filter(Boolean).join(" · "),
        ),
      );
      if (l.confirm_with_seller.length) {
        body.append(h("div", { class: "warn" }, h("b", {}, "Check before you post"), h("ul", {}, l.confirm_with_seller.map((c) => h("li", {}, c)))));
      }
      body.append(h("button", { class: "primary", disabled: state.busy, onclick: fillForm }, state.busy ? "Filling…" : "Fill Vinted form"));
    }

    if (state.report) {
      const failed = state.report.filter((r) => !r.ok);
      body.append(
        h(
          "div",
          {},
          h("div", { class: failed.length ? "" : "ok" }, failed.length ? `Filled ${state.report.length - failed.length} of ${state.report.length}. Finish these yourself:` : "All filled. Check it over, then press Vinted's Upload button."),
          failed.length ? h("ul", {}, failed.map((r) => h("li", {}, h("b", {}, r.field), ": ", r.note || "not set"))) : null,
        ),
      );
    }
    return body;
  }

  function render() {
    if (!root) return;
    const wrap = root.querySelector(".wrap");
    wrap.querySelector(".body")?.remove();
    wrap.append(view());
  }

  // ---- mounting (Vinted is a single-page app, so watch the URL) ------------------------------------------

  function mount() {
    if (document.getElementById(HOST_ID)) return;
    const host = h("div", { id: HOST_ID });
    root = host.attachShadow({ mode: "open" });
    const close = h("button", { title: "Hide", onclick: () => { hiddenByUser = true; unmount(); } }, "×");
    root.append(h("style", {}, CSS), h("div", { class: "wrap" }, h("header", {}, "Vinted Lister", close)));
    document.documentElement.append(host);
    render();
    refreshUsage();
  }

  function unmount() {
    document.getElementById(HOST_ID)?.remove();
    root = null;
  }

  let hiddenByUser = false;
  setInterval(() => {
    const onSellPage = VLSelectors.sellPagePattern.test(location.pathname);
    if (onSellPage && !root && !hiddenByUser) mount();
    if (!onSellPage) {
      unmount();
      hiddenByUser = false;
    }
  }, 700);
})();
