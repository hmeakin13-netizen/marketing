import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses Row Level Security entirely. Only ever use
 * this for background jobs that need to see every client's row at once (like
 * the weekly digest cron), never in a request handler that serves a specific
 * logged-in user — those must keep using lib/supabase/server.ts so RLS stays
 * in force.
 */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
