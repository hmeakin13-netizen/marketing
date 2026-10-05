import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Sign-in via a one-time token (the admin's "sign-in link"). Unlike the emailed link this works in
// any browser or device, because it doesn't depend on a cookie set when the link was requested.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  if (tokenHash && searchParams.get("type") === "magiclink") {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (!error) return NextResponse.redirect(`${origin}/`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
