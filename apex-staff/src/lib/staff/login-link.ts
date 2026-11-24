import "server-only";

import { emailConfigured, sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

// One-time sign-in links. Supabase's own mailer is capped at a few emails an hour and lands in spam,
// so when Resend is set up (RESEND_API_KEY + EMAIL_FROM) we make the link ourselves and email it.
// The link goes through /auth/confirm, which works in any browser or device.

/** Makes a one-time sign-in link for someone who already has a login. */
export async function makeSignInLink(email: string, origin: string): Promise<{ link: string } | { error: string }> {
  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email });
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) return { error: error?.message ?? "no token returned" };
  return { link: `${origin}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=magiclink` };
}

/** Emails a sign-in link through Resend. Returns an error string, or null when it was sent. */
export async function emailSignInLink(email: string, name: string | null, origin: string): Promise<string | null> {
  if (!emailConfigured()) return "Email isn't set up yet (RESEND_API_KEY missing).";
  const made = await makeSignInLink(email, origin);
  if ("error" in made) return made.error;
  const first = (name ?? "").trim().split(" ")[0] || "there";
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#18181b">
      <p style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#059669;margin:0 0 8px">Apex Leads</p>
      <h1 style="font-size:20px;margin:0 0 16px">Your team portal sign-in link</h1>
      <p style="margin:0 0 16px">Hi ${escapeHtml(first)}, tap the button to sign in. No password needed.</p>
      <p style="margin:0 0 24px">
        <a href="${made.link}" style="display:inline-block;background:#10b981;color:#09090b;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:999px">Sign in to the portal</a>
      </p>
      <p style="font-size:13px;color:#52525b;margin:0 0 8px">The link works once and expires in an hour. If it has expired, go to ${escapeHtml(origin)}/login and ask for a new one.</p>
      <p style="font-size:13px;color:#52525b;margin:0">If you didn't ask for this, you can ignore it.</p>
    </div>`;
  return sendEmail({ to: email, subject: "Your Apex Leads sign-in link", html });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
