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
    <div className="space-y-4">
      {result.status === "stale" ? (
        <p className="text-xs text-stone-500">
          Showing the last update we could load — we&apos;ll refresh automatically once things
          reconnect.
        </p>
      ) : null}
      {entries.map((entry) => (
        <article
          key={entry.id}
          className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold text-forest-900">{entry.title}</h3>
            {entry.date ? (
              <span className="text-xs font-medium uppercase tracking-wide text-forest-500">
                {formatDate(entry.date)}
              </span>
            ) : null}
          </div>
          <div className="mt-3">
            <NotionBlocks blocks={entry.blocks} />
          </div>
        </article>
      ))}
    </div>
  );
}
