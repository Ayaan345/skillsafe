import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env/server";

export async function supabaseServer(): Promise<SupabaseClient | null> {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return null;

  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          /* called from a Server Component render; the proxy refreshes the session */
        }
      },
    },
  });
}

export async function currentUser() {
  const client = await supabaseServer();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}
