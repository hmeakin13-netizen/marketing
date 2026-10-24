"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-reads the page's data every so often so a live board stays live without a manual refresh. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
