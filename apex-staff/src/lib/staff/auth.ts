import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { StaffRole, StaffRow } from "./types";

/** Signed-in staff member + a Supabase client acting as them (RLS applies). */
export const requireStaff = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const { data: me } = await supabase
    .from("staff")
    .select("*")
    .eq("email", user.email.toLowerCase())
    .eq("active", true)
    .maybeSingle<StaffRow>();
  if (!me) redirect("/no-access");

  return { supabase, me };
});

export async function requireRole(...roles: StaffRole[]) {
  const ctx = await requireStaff();
  if (!roles.includes(ctx.me.role)) redirect("/");
  return ctx;
}

export const isManager = (role: StaffRole) => role === "admin" || role === "manager";
