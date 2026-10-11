"use client";

import { useEffect, useState } from "react";
import type { Listing } from "@/lib/listing-types";

interface AccountsInfo {
  linked: string[];
  slots: number;
  addonPence: number;
  canBuyMore: boolean;
}

type Quota =
  | { allowed: true; remaining: number | null }
  | { allowed: false; reason: "limit_reached" | "fair_use"; upgradeTo: string | null };

const PLAN_CARDS = [
  { name: "Free trial", price: "Free", detail: "5 listings" },
  { name: "Starter", price: "£10/mo", detail: "30 listings a month" },
  { name: "Unlimited", price: "£30/mo", detail: "Unlimited listings" },
];

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="rounded-full border border-brand/40 px-3 py-1 text-xs font-medium text-brand hover:bg-tint"
    >
      {done ? "Copied" : label}
    </button>
  );
}

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [plan, setPlan] = useState("Free trial");
  const [extKey, setExtKey] = useState<string | null>(null);
  const [account, setAccount] = useState("");
  const [accounts, setAccounts] = useState<AccountsInfo | null>(null);

  useEffect(() => {
    try {
      setAccount(localStorage.getItem("vl_account") ?? "");
    } catch {}
    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => {
        setQuota(d.quota);
        setPlan(d.plan);
        setAccounts(d.accounts);
        setAccount((cur) => cur || d.accounts?.linked?.[0] || "");
      })
      .catch(() => {});
  }, []);

  async function generate() {
    setLoading(true);
    setError(null);
    setListing(null);
    const body = new FormData();
    files.forEach((f) => body.append("photos", f));
    body.append("notes", notes);
    body.append("vintedAccount", account);
    try {
      localStorage.setItem("vl_account", account);
    } catch {}
    try {
      const res = await fetch("/api/generate", { method: "POST", body });
      const data = await res.json();
      if (res.status === 403 && data.error === "account_not_linked") {
        setError(
          data.canBuyMore
            ? `Your plan covers ${data.slots} Vinted account${data.slots > 1 ? "s" : ""} (${data.linked.join(", ")}). Add another for £${data.addonPence / 100}/month.`
            : `The free trial covers one Vinted account (${data.linked.join(", ")}). Upgrade to add more.`,
        );
      } else if (res.status === 402) {
        setQuota(data.quota);
        setError("You've used all your listings on this plan.");
      } else if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setListing(data.listing);
        setQuota(data.quota);
        setPlan(data.plan);
        fetch("/api/usage")
          .then((r) => r.json())
          .then((d) => setAccounts(d.accounts))
          .catch(() => {});
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const blocked = quota?.allowed === false;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-brand">Vinted Lister</h1>
      <p className="mt-1 text-mute">Snap your photos and get a ready-to-post listing in seconds: title, description, price and more.</p>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-full bg-tint px-3 py-1 font-medium text-brand-dark">{plan}</span>
        {quota?.allowed && quota.remaining !== null && <span>{quota.remaining} listings left</span>}
        {quota?.allowed && quota.remaining === null && <span>Unlimited listings</span>}
      </div>

      <section className="mt-6 rounded-xl border border-line bg-panel shadow-card p-5">
        <label className="block text-sm font-medium">Vinted username</label>
        <input
          type="text"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          maxLength={64}
          placeholder="e.g. jane_sells"
          autoCapitalize="none"
          autoCorrect="off"
          className="mt-2 w-full rounded-lg border border-line p-2 text-sm"
        />
        {accounts && (
          <p className="mt-1 text-xs text-mute">
            {accounts.linked.length} of {accounts.slots} Vinted account{accounts.slots > 1 ? "s" : ""} used
            {accounts.canBuyMore && ` · extra accounts £${accounts.addonPence / 100}/month each`}
          </p>
        )}
        <label className="mt-4 block text-sm font-medium">Photos (up to 5)</label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))}
          className="mt-2 block w-full text-sm"
        />
        {files.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {files.map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f.name + f.size} src={URL.createObjectURL(f)} alt="" className="h-20 w-20 rounded-lg object-cover" />
            ))}
          </div>
        )}
        <label className="mt-4 block text-sm font-medium">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Size M, worn twice, smoke-free home…"
          className="mt-2 w-full rounded-lg border border-line p-2 text-sm"
        />
        <button
          type="button"
          disabled={files.length === 0 || !account.trim() || loading || blocked}
          onClick={generate}
          className="mt-4 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40"
        >
          {loading ? "Writing your listing…" : "Generate listing"}
        </button>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      {blocked && (
        <section className="mt-6 rounded-xl border border-brand/30 bg-tint p-5">
          <h2 className="font-medium">Keep listing</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {PLAN_CARDS.slice(1).map((p) => (
              <div key={p.name} className="rounded-lg border border-line bg-page p-3 text-sm">
                <div className="font-medium">{p.name}</div>
                <div className="text-lg">{p.price}</div>
                <div className="text-mute">{p.detail}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm">Each plan includes <b>1 Vinted account</b>. Add another account for <b>£20/month</b> each.</p>
          <p className="mt-2 text-xs text-mute">Checkout isn&apos;t connected yet (Stripe is the next step).</p>
        </section>
      )}

      <section className="mt-6 rounded-xl border border-line bg-panel shadow-card p-5 text-sm">
        <h2 className="font-medium">Chrome extension</h2>
        <p className="mt-1 text-mute">
          The extension adds a panel to Vinted&apos;s &quot;Sell an item&quot; page: drop in photos and it fills the whole form for you. Paste this key into its settings.
        </p>
        {extKey ? (
          <div className="mt-3 flex items-center gap-2">
            <code className="break-all rounded bg-page px-2 py-1">{extKey}</code>
            <CopyButton text={extKey} label="Copy key" />
          </div>
        ) : (
          <button
            type="button"
            className="mt-3 rounded-full border border-brand/40 px-4 py-1.5 font-medium text-brand hover:bg-tint"
            onClick={() =>
              fetch("/api/extension-key")
                .then((r) => r.json())
                .then((d) => setExtKey(d.key))
            }
          >
            Show my extension key
          </button>
        )}
        <p className="mt-2 text-xs text-mute">Treat it like a password.</p>
      </section>

      {listing && (
        <section className="mt-6 space-y-4 rounded-xl border border-line bg-panel shadow-card p-5">
          <Field label="Title" text={listing.title} />
          <Field label="Description" text={listing.description} multiline />
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Meta k="Category" v={listing.category} />
            <Meta k="Brand" v={listing.brand ?? "Not visible"} />
            <Meta k="Size" v={listing.size ?? "Not visible"} />
            <Meta k="Colours" v={listing.colours.join(", ") || "-"} />
            <Meta k="Condition" v={listing.condition} />
            <Meta k="Parcel" v={listing.parcel_size} />
            <Meta k="Suggested price" v={`£${listing.price_gbp.toFixed(2)}`} />
          </dl>
          <p className="text-xs text-mute">{listing.price_rationale}</p>
          {listing.confirm_with_seller.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 p-3 text-sm">
              <div className="font-medium">Check before you post</div>
              <ul className="mt-1 list-disc pl-5">
                {listing.confirm_with_seller.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {listing.flaws_noticed.length > 0 && (
            <div className="text-sm">
              <div className="font-medium">Flaws spotted (included in the description)</div>
              <ul className="list-disc pl-5">
                {listing.flaws_noticed.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function Field({ label, text, multiline }: { label: string; text: string; multiline?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <CopyButton text={text} label="Copy" />
      </div>
      <p className={`mt-1 rounded-lg bg-page p-3 text-sm ${multiline ? "whitespace-pre-wrap" : ""}`}>{text}</p>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-mute">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
