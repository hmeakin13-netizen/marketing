"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Keeps the installed (home-screen) app current. A standalone web app keeps the
 * page it had open, so after a deploy it can sit on an old build for days.
 * Whenever the app comes back to the front, and every few minutes while open,
 * this checks the live build: a new build reloads the page, the same build
 * re-reads the server data so boards and the office stay live.
 */
export function FreshApp({ version }: { version: string }) {
  const router = useRouter();
  const busy = useRef(false);

  useEffect(() => {
    let last = Date.now();
    const check = async (force: boolean) => {
      if (busy.current || document.visibilityState !== "visible") return;
      if (!force && Date.now() - last < 4 * 60 * 1000) return;
      busy.current = true;
      last = Date.now();
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const j = (await r.json()) as { version?: string };
        if (j.version && j.version !== version) {
          window.location.reload();
          return;
        }
        router.refresh();
      } catch {
        // offline or sleeping: try again next time
      } finally {
        busy.current = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);
    const id = setInterval(() => void check(false), 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
      clearInterval(id);
    };
  }, [router, version]);

  return null;
}
