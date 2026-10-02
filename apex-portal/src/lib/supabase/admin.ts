import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client. Used ONLY by the admin-gated "add / deactivate person"
// server actions, to create or ban the Supabase Auth user. Never import this
// from a component or anything a non-admin can reach without the role check.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
