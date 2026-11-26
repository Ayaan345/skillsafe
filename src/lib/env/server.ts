import "server-only";
import { serverEnvSchema } from "./schema";

export function getServerEnv() {
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) throw new Error(`Invalid server environment: ${parsed.error.message}`);
  return parsed.data;
}

export function supabaseUrl(): string | undefined {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return value && value.trim() ? value.trim() : undefined;
}

export function supabaseAnonKey(): string | undefined {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return value && value.trim() ? value.trim() : undefined;
}

export function accountsConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}
