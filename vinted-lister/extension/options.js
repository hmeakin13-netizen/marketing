const $ = (id) => document.getElementById(id);

chrome.storage.local.get(["apiBase", "key", "accessSecret"]).then(({ apiBase, key, accessSecret }) => {
  $("apiBase").value = apiBase || "http://localhost:3000";
  $("key").value = key || "";
  $("accessSecret").value = accessSecret || "";
});

/** Turn a /api/usage result into a sentence a person can act on. */
function explain(res) {
  if (res.status === 200) {
    const q = res.body.quota;
    const left = q?.allowed ? (q.remaining === null ? "unlimited listings" : `${q.remaining} listings left`) : "no listings left";
    return { ok: true, text: `Connected. ${res.body.plan}, ${left}.` };
  }
  if (res.body?.error === "no_key") return { ok: false, text: "Paste your extension key first." };
  if (res.body?.error === "vercel_protected") return { ok: false, text: "The app is behind Vercel login. Paste the access secret from the web app (shown under the key)." };
  if (res.status === 0) return { ok: false, text: "Can't reach that address. Check it's right and the app is running." };
  return { ok: false, text: `The app answered with an error (${res.status}).` };
}

$("save").addEventListener("click", async () => {
  const apiBase = $("apiBase").value.trim().replace(/\/+$/, "");
  const key = $("key").value.trim();
  const accessSecret = $("accessSecret").value.trim();
  let origin;
  try {
    origin = new URL(apiBase).origin;
  } catch {
    $("msg").textContent = "That doesn't look like a web address.";
    return;
  }
  // The extension may only talk to the one server the user configured.
  const granted = await chrome.permissions.request({ origins: [origin + "/*"] });
  if (!granted) {
    $("msg").textContent = "Permission to reach that address was declined.";
    return;
  }
  await chrome.storage.local.set({ apiBase, key, accessSecret });
  $("msg").textContent = "Saved. Testing…";
  const r = explain(await chrome.runtime.sendMessage({ type: "usage" }));
  $("msg").textContent = r.text + (r.ok ? " Reload your Vinted tab." : "");
});
