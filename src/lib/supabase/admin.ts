import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv, supabaseUrl } from "@/lib/env/server";

/** Service-role client. Server-only, used solely to read an explicitly shared scan. */
export function supabaseAdmin(): SupabaseClient | null {
  const url = supabaseUrl();
  const key = getServerEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
