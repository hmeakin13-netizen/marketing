"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Section heading the link sits under. */
  group: string;
  indent?: boolean;
  /** Sub-page that only shows while the parent section (this href prefix) is open. */
  under?: string;
}

const STORAGE_KEY = "apex-nav-closed";

export function StaffNav({ items, name, role }: { items: NavItem[]; name: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setClosed(JSON.parse(raw));
    } catch {
      // Browser storage can be unavailable; the groups simply all start open.
    }
  }, []);

  function toggle(group: string) {
    setClosed((prev) => {
      const next = prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  async function logout() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isActive = (i: NavItem) => (i.href === "/" || i.indent ? pathname === i.href : pathname.startsWith(i.href));
  const inAds = pathname.startsWith("/ads") || pathname.startsWith("/ad-maker");
  const groups = Array.from(new Set(items.map((i) => i.group)));

  const links = (
    <nav className="flex flex-col gap-4">
      {groups.map((g) => {
        const rows = items.filter((i) => i.group === g && (!i.under || (i.under === "/ads" && inAds)));
        const hasActive = rows.some(isActive);
        // A group never hides the page you are on.
        const shut = closed.includes(g) && !hasActive;
        return (
          <div key={g}>
            <button
              type="button"
              onClick={() => toggle(g)}
              className="flex w-full items-center justify-between px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 hover:text-zinc-300"
            >
              {g}
              <span className="text-xs">{shut ? "+" : "–"}</span>
            </button>
            {shut ? null : (
              <div className="flex flex-col gap-0.5">
                {rows.map((i) => {
                  const active = isActive(i);
                  return (
                    <Link
                      key={i.href}
                      href={i.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 rounded-xl py-2 text-sm font-medium transition ${i.indent ? "pl-9 pr-3" : "px-3"} ${
                        active ? "bg-emerald-500/15 text-emerald-300" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span className="w-5 text-center text-base">{i.icon}</span>
                      {i.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  const user = (
    <div className="border-t border-white/10 pt-4">
      <p className="truncate text-sm font-medium text-white">{name}</p>
      <p className="text-xs capitalize text-zinc-500">{role}</p>
      <button type="button" onClick={logout} className="mt-3 text-xs font-medium text-zinc-400 hover:text-white">
        Log out
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar: the link list scrolls on its own, the user block stays pinned. */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-white/10 bg-zinc-950 p-5 lg:flex">
        <div className="mb-4 shrink-0">
          <p className="px-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Apex Leads</p>
          <p className="px-3 text-lg font-semibold text-white">Team portal</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">{links}</div>
        <div className="shrink-0 pt-4">{user}</div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 border-b border-white/10 bg-zinc-950/90 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm font-semibold text-white">
            <span className="text-emerald-400">Apex</span> Team
          </p>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-zinc-200"
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
        {open ? (
          <div className="max-h-[80vh] space-y-4 overflow-y-auto px-4 pb-4">
            {links}
            {user}
          </div>
        ) : null}
      </div>
    </>
  );
}
