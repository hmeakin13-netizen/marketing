"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function StaffLogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await createClient().auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-white/5"
    >
      Log out
    </button>
  );
}
