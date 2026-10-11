"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { copyAllText, formatPrice, vintedFields } from "@/lib/fields";
import { copyText, savePhotos, shrinkPhoto } from "@/lib/client-utils";
import type { Listing } from "@/lib/listing-types";

const MAX_PHOTOS = 5;
const VINTED_SELL_URL = "https://www.vinted.co.uk/items/new";

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
  { name: "Starter", price: "£10/mo", detail: "30 listings a month" },
  { name: "Unlimited", price: "£30/mo", detail: "Unlimited listings" },
];

const BTN = "inline-flex min-h-11 items-center justify-center rounded-full px-5 text-base font-semibold transition";
const BTN_PRIMARY = `${BTN} bg-brand text-white hover:bg-brand-dark disabled:opacity-40`;
const BTN_SOFT = `${BTN} border border-brand/40 bg-panel text-brand hover:bg-tint`;
const INPUT = "w-full rounded-xl border border-line bg-panel p-3 text-base"; // 16px stops iPhones zooming in on focus

function CopyButton({ text, label = "Copy", disabled }: { text: string; label?: string; disabled?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
      className="min-h-11 min-w-20 rounded-full border border-brand/40 px-4 text-sm font-semibold text-brand hover:bg-tint disabled:opacity-40"
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

export default function Home() {
  const [photos, setPhotos] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Listing | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [plan, setPlan] = useState("Free trial");
  const [extKey, setExtKey] = useState<string | null>(null);
  const [account, setAccount] = useState("");
  const [accounts, setAccounts] = useState<AccountsInfo | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [genId, setGenId] = useState(0);
  const resultRef = useRef<HTMLElement>(null);

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

  // Object URLs for thumbnails, released when the photo set changes.
  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  async function addPhotos(list: FileList | null) {
    if (!list?.length) return;
    const room = MAX_PHOTOS - photos.length;
    const shrunk = await Promise.all(Array.from(list).slice(0, room).map((f) => shrinkPhoto(f)));
    setPhotos((cur) => [...cur, ...shrunk].slice(0, MAX_PHOTOS));
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setDraft(null);
    setSaveMsg(null);
    const body = new FormData();
    photos.forEach((f) => body.append("photos", f));
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
        setError(data.error ?? data.message ?? "Something went wrong.");
      } else {
        setDraft(data.listing);
        setGenId((n) => n + 1);
        setQuota(data.quota);
        setPlan(data.plan);
        fetch("/api/usage")
          .then((r) => r.json())
          .then((d) => setAccounts(d.accounts))
          .catch(() => {});
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function edit(key: string, value: string) {
    setDraft((d) => {
      if (!d) return d;
      if (key === "title") return { ...d, title: value };
      if (key === "description") return { ...d, description: value };
      if (key === "price") return { ...d, price_gbp: Number(value) || 0 };
      return d;
    });
  }

  const blocked = quota?.allowed === false;
  const canGenerate = photos.length > 0 && account.trim().length >= 2 && !loading && !blocked;

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-6">
      <h1 className="text-3xl font-bold tracking-tight text-brand">Vinted Lister</h1>
      <p className="mt-1 text-mute">Snap your photos and get a ready-to-post listing in seconds.</p>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-full bg-tint px-3 py-1 font-medium text-brand-dark">{plan}</span>
        {quota?.allowed && quota.remaining !== null && <span>{quota.remaining} listings left</span>}
        {quota?.allowed && quota.remaining === null && <span>Unlimited listings</span>}
      </div>

      {/* 1. photos */}
      <section className="mt-5 rounded-2xl border border-line bg-panel p-4 shadow-card">
        <h2 className="text-lg font-semibold">1. Add photos</h2>
        <p className="text-sm text-mute">Front, back and the brand/size tag give the best result.</p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className={`${BTN_PRIMARY} cursor-pointer ${photos.length >= MAX_PHOTOS ? "pointer-events-none opacity-40" : ""}`}>
            Take photo
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
          </label>
          <label className={`${BTN_SOFT} cursor-pointer ${photos.length >= MAX_PHOTOS ? "pointer-events-none opacity-40" : ""}`}>
            From gallery
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
          </label>
        </div>

        {photos.length > 0 && (
          <>
            <p className="mt-3 text-sm text-mute">
              {photos.length} of {MAX_PHOTOS} photos
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {previews.map((src, i) => (
                <div key={src} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Photo ${i + 1}`} className="h-20 w-20 rounded-xl border border-line object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => setPhotos((cur) => cur.filter((_, j) => j !== i))}
                    className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-body text-sm text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <label className="mt-4 block text-sm font-medium" htmlFor="notes">
          Anything to add? (optional)
        </label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} placeholder="Size M, worn twice, smoke-free home…" className={`mt-1 ${INPUT}`} />

        <label className="mt-4 block text-sm font-medium" htmlFor="acct">
          Your Vinted username
        </label>
        <input id="acct" type="text" value={account} onChange={(e) => setAccount(e.target.value)} maxLength={64} placeholder="e.g. jane_sells" autoCapitalize="none" autoCorrect="off" autoComplete="username" className={`mt-1 ${INPUT}`} />
        {accounts && (
          <p className="mt-1 text-xs text-mute">
            {accounts.linked.length} of {accounts.slots} Vinted account{accounts.slots > 1 ? "s" : ""} used
            {accounts.canBuyMore && ` · extra accounts £${accounts.addonPence / 100}/month each`}
          </p>
        )}

        <button type="button" disabled={!canGenerate} onClick={generate} className={`${BTN_PRIMARY} mt-5 w-full`}>
          {loading ? "Writing your listing…" : "Generate listing"}
        </button>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}
      </section>

      {blocked && (
        <section className="mt-5 rounded-2xl border border-brand/30 bg-tint p-4">
          <h2 className="text-lg font-semibold">Keep listing</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {PLAN_CARDS.map((p) => (
              <div key={p.name} className="rounded-xl border border-line bg-page p-3 text-sm">
                <div className="font-medium">{p.name}</div>
                <div className="text-lg">{p.price}</div>
                <div className="text-mute">{p.detail}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm">
            Each plan includes <b>1 Vinted account</b>. Add another account for <b>£20/month</b> each.
          </p>
          <p className="mt-2 text-xs text-mute">Checkout isn&apos;t connected yet (Stripe is the next step).</p>
        </section>
      )}

      {/* 2. result */}
      {draft && (
        <section ref={resultRef} className="mt-5 rounded-2xl border border-line bg-panel p-4 shadow-card">
          <h2 className="text-lg font-semibold">2. Your listing</h2>
          <p className="text-sm text-mute">Open Vinted, tap Sell, then copy each box below into the matching one.</p>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <a href={VINTED_SELL_URL} target="_blank" rel="noopener noreferrer" className={BTN_PRIMARY}>
              Open Vinted
            </a>
            <CopyButton text={copyAllText(draft)} label="Copy everything" />
          </div>

          {draft.confirm_with_seller.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="font-semibold">Check before you post</div>
              <ul className="mt-1 list-disc pl-5">
                {draft.confirm_with_seller.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {/* photos first, as on Vinted's form */}
          <div className="mt-4 rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">Photos</span>
              <button
                type="button"
                className="min-h-11 rounded-full border border-brand/40 px-4 text-sm font-semibold text-brand hover:bg-tint"
                onClick={async () => {
                  const r = await savePhotos(photos);
                  setSaveMsg(r === "shared" ? "Choose “Save Image” to keep them in your gallery." : r === "downloaded" ? "Saved to your downloads." : null);
                }}
              >
                Save to phone
              </button>
            </div>
            <p className="mt-1 text-xs text-mute">Photos taken here may not be in your camera roll yet. Save them, then add them in Vinted.</p>
            {saveMsg && <p className="mt-1 text-xs text-brand-dark">{saveMsg}</p>}
          </div>

          <div className="mt-3 space-y-3">
            {vintedFields(draft).map((f) => {
              const editable = f.key === "title" || f.key === "description" || f.key === "price";
              return (
                <div key={f.key} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor={`f-${f.key}`} className="font-medium">
                      {f.label}
                    </label>
                    <CopyButton text={f.value} disabled={f.missing || !f.value} />
                  </div>
                  {editable ? (
                    f.multiline ? (
                      <textarea id={`f-${f.key}`} value={f.value} rows={7} onChange={(e) => edit(f.key, e.target.value)} className={`mt-2 ${INPUT} whitespace-pre-wrap`} />
                    ) : (
                      f.key === "price" ? (
                        // uncontrolled so typing "12." isn't reformatted under the user's thumb
                        <input key={genId} id="f-price" type="text" inputMode="decimal" defaultValue={f.value} onChange={(e) => edit("price", e.target.value)} className={`mt-2 ${INPUT}`} />
                      ) : (
                        <input id={`f-${f.key}`} type="text" value={f.value} onChange={(e) => edit(f.key, e.target.value)} className={`mt-2 ${INPUT}`} />
                      )
                    )
                  ) : f.missing ? (
                    <p className="mt-2 text-sm text-amber-800">Couldn&apos;t see this in your photos. Check the tag and add it yourself.</p>
                  ) : (
                    <p id={`f-${f.key}`} className="mt-2 rounded-xl bg-page p-3 text-base">
                      {f.value}
                    </p>
                  )}
                  {f.key === "price" && <p className="mt-2 text-xs text-mute">{draft.price_rationale}</p>}
                </div>
              );
            })}
          </div>

          {draft.flaws_noticed.length > 0 && (
            <div className="mt-4 text-sm">
              <div className="font-medium">Flaws spotted (already in the description)</div>
              <ul className="list-disc pl-5">
                {draft.flaws_noticed.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <details className="mt-5 rounded-2xl border border-line bg-panel p-4 shadow-card">
        <summary className="min-h-6 cursor-pointer font-semibold">On a laptop? Use the Chrome extension</summary>
        <p className="mt-2 text-sm text-mute">
          The extension adds a panel to Vinted&apos;s &quot;Sell an item&quot; page and fills the whole form for you. It only works in Chrome on a computer. Paste this key into its settings.
        </p>
        {extKey ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="break-all rounded-lg bg-page px-2 py-1 text-sm">{extKey}</code>
            <CopyButton text={extKey} label="Copy key" />
          </div>
        ) : (
          <button
            type="button"
            className={`${BTN_SOFT} mt-3`}
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
      </details>
    </main>
  );
}
