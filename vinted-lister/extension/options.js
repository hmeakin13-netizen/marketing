const $ = (id) => document.getElementById(id);

chrome.storage.local.get(["apiBase", "key"]).then(({ apiBase, key }) => {
  $("apiBase").value = apiBase || "http://localhost:3000";
  $("key").value = key || "";
});

$("save").addEventListener("click", async () => {
  const apiBase = $("apiBase").value.trim().replace(/\/+$/, "");
  const key = $("key").value.trim();
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
  await chrome.storage.local.set({ apiBase, key });
  $("msg").textContent = "Saved. Reload your Vinted tab.";
});
