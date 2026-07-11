"use client";

import { useEffect, useState } from "react";
import { NotionBlocks } from "./NotionBlocks";
import type { NotionFetchResult, NotionUpdateEntry } from "@/lib/types";

const FRIENDLY_MESSAGE = "Your dashboard is being set up, check back shortly.";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function LiveUpdatesFeed() {
  const [result, setResult] = useState<NotionFetchResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/notion", { cache: "no-store" });
        const data: NotionFetchResult = await res.json();
        if (!cancelled) setResult(data);
      } catch {
        if (!cancelled) setResult({ status: "error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-stone-100" />
        ))}
      </div>
    );
  }

  if (!result || result.status === "not_configured" || result.status === "error") {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-card">
        <p className="text-sm text-forest-600">{FRIENDLY_MESSAGE}</p>
      </div>
    );
  }

  const entries: NotionUpdateEntry[] = result.entries;

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-card">
        <p className="text-sm text-forest-600">{FRIENDLY_MESSAGE}</p>
      </div>
    );
  }

  return (
    <div>
      {result.summary ? (
        <div className="animate-fade-up mb-5 rounded-2xl border border-forest-200 bg-forest-50 p-4 text-sm text-forest-800">
          {result.summary}
        </div>
      ) : null}
      {result.status === "stale" ? (
        <p className="mb-4 text-xs text-stone-500">
          Showing the last update we could load — we&apos;ll refresh automatically once things
          reconnect.
        </p>
      ) : null}
      <div className="relative">
        <div aria-hidden className="absolute bottom-2 left-[17px] top-2 w-px bg-stone-200" />
        <div className="space-y-6">
          {entries.map((entry, i) => (
            <article
              key={entry.id}
              style={{ animationDelay: `${i * 70}ms` }}
              className="animate-fade-up relative pl-9"
            >
              <span
                aria-hidden
                className={`absolute left-3 top-2 h-3 w-3 rounded-full ring-4 ring-stone-50 ${
                  entry.isNew ? "bg-forest-500" : "bg-stone-300"
                }`}
              />
              <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-forest-900">{entry.title}</h3>
                    {entry.isNew ? (
                      <span className="rounded-full bg-forest-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-forest-700">
                        New
                      </span>
                    ) : null}
                  </div>
                  {entry.date ? (
                    <span className="text-xs font-medium uppercase tracking-wide text-forest-500">
                      {formatDate(entry.date)}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3">
                  <NotionBlocks blocks={entry.blocks} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
