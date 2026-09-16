import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, publicEnv, serverEnv } from "@/lib/env";

let cached: ReturnType<typeof createSupabaseClient> | null = null;

/**
 * Service-role Supabase client — bypasses RLS via the service_role key.
 *
 * Used ONLY by public invite endpoints where the invite TOKEN is the sole
 * capability gate (no Clerk session). RLS still defends the authenticated
 * hiring-dashboard paths (which use the anon client); here the unguessable
 * 48-char hex token is the capability, so bypassing RLS is safe and required.
 *
 * Returns null when Supabase is unconfigured so callers can fall back to a
 * graceful state. Cached for the lifetime of the process — the service-role
 * key is a shared secret, not per-request.
 */
export function createServiceClient() {
  if (!isSupabaseConfigured() || !serverEnv.supabaseServiceRoleKey) return null;
  if (cached) return cached;
  cached = createSupabaseClient(
    publicEnv.supabaseUrl as string,
    serverEnv.supabaseServiceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
  return cached;
}
