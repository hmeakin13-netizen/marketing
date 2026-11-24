"use server";

import { headers } from "next/headers";
import { emailConfigured } from "@/lib/email";
import { emailSignInLink } from "@/lib/staff/login-link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type LoginLinkResult = { ok: true } | { ok: false; error: string };

const NOT_ON_TEAM = "That email isn't on the team yet. Ask Harry to add you.";

/** The login page: emails a one-time sign-in link to a team member. */
export async function requestLoginLink(rawEmail: string): Promise<LoginLinkResult> {
  const email = String(rawEmail ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, error: "Enter your work email." };

  // Not signed in yet, so look them up as the service role (RLS would hide the row).
  let person: { full_name: string; active: boolean; login_enabled: boolean } | null = null;
  try {
    const { data } = await createAdminClient()
      .from("staff")
      .select("full_name, active, login_enabled")
      .eq("email", email)
      .maybeSingle();
    person = data;
  } catch {
    person = null; // no service key: fall through to Supabase's own mailer below
  }
  if (person && (!person.active || !person.login_enabled)) return { ok: false, error: NOT_ON_TEAM };

  const h = headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  if (person && emailConfigured()) {
    const failed = await emailSignInLink(email, person.full_name, origin);
    if (!failed) return { ok: true };
    console.error("login link via Resend failed, falling back to Supabase mail:", failed);
  }

  // Fallback: Supabase's built-in mailer (rate-limited, often in spam). Never creates accounts.
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: false },
  });
  if (error) {
    return { ok: false, error: /signup|not allowed|not found/i.test(error.message) ? NOT_ON_TEAM : error.message };
  }
  return { ok: true };
}
