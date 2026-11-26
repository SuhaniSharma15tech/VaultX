import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env";

let cachedClient: SupabaseClient | null = null;

/**
 * Returns a Supabase client communicating over HTTPS (port 443).
 * Works even on restricted networks where PostgreSQL port 5432 is blocked.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env"
    );
  }
  if (!cachedClient) {
    cachedClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedClient;
}
