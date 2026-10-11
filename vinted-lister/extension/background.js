// Service worker: all network calls to the Vinted Lister backend happen here, because content scripts are
// bound by Vinted's origin and can't call our API directly.
const DEFAULT_API = "http://localhost:3000";

async function settings() {
  const { apiBase = DEFAULT_API, key = "" } = await chrome.storage.local.get(["apiBase", "key"]);
  return { apiBase: apiBase.replace(/\/+$/, ""), key };
}

function b64ToBlob(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function call(path, init) {
  const { apiBase, key } = await settings();
  if (!key) return { status: 401, body: { error: "no_key" } };
  try {
    const res = await fetch(apiBase + path, { ...init, headers: { Authorization: `Bearer ${key}` } });
    return { status: res.status, body: await res.json().catch(() => ({})), apiBase };
  } catch {
    return { status: 0, body: { error: "unreachable" }, apiBase };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === "usage") return sendResponse(await call("/api/usage"));
    if (msg.type === "generate") {
      const form = new FormData();
      msg.photos.forEach((p, i) => form.append("photos", b64ToBlob(p.data, p.mediaType), `photo-${i}.jpg`));
      form.append("notes", msg.notes || "");
      form.append("vintedAccount", msg.account || "");
      return sendResponse(await call("/api/generate", { method: "POST", body: form }));
    }
    if (msg.type === "openOptions") {
      chrome.runtime.openOptionsPage();
      return sendResponse({});
    }
    sendResponse({});
  })();
  return true; // async response
});
