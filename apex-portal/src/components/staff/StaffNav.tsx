"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export function StaffNav({
  items,
  name,
  role,
}: {
  items: NavItem[];
  name: string;
  role: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await createClient().auth.signOut();
    router.push("/staff/login");
    router.refresh();
  }

  const links = (
    <nav className="flex flex-col gap-1">
      {items.map((i) => {
        const active = i.href === "/staff" ? pathname === "/staff" : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-emerald-500/15 text-emerald-300"
                : "text-zinc-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className="w-5 text-center text-base">{i.icon}</span>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );

  const user = (
    <div className="border-t border-white/10 pt-4">
      <p className="truncate text-sm font-medium text-white">{name}</p>
      <p className="text-xs capitalize text-zinc-500">{role}</p>
      <button
        type="button"
        onClick={logout}
        className="mt-3 text-xs font-medium text-zinc-400 hover:text-white"
      >
        Log out
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col justify-between border-r border-white/10 bg-zinc-950 p-5 lg:flex">
        <div>
          <p className="px-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Apex Leads
          </p>
          <p className="mb-6 px-3 text-lg font-semibold text-white">Team portal</p>
          {links}
        </div>
        {user}
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
          <div className="space-y-4 px-4 pb-4">
            {links}
            {user}
          </div>
        ) : null}
      </div>
    </>
  );
}
