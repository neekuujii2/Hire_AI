import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isClerkConfigured } from "@/lib/env";

/**
 * Get the current user's organization ID from Clerk, then resolve it to
 * the internal org UUID in Supabase.
 *
 * Returns null when:
 *   - Clerk is not configured (dev mode)
 *   - User is not authenticated
 *   - User has no organization
 *   - Org not found in Supabase
 */
export async function getCurrentOrgId(): Promise<string | null> {
  if (!isClerkConfigured()) return null;

  const { orgId: clerkOrgId } = await auth();
  if (!clerkOrgId) return null;

  const supabase = createServiceClient();
  if (!supabase) return null;

try {
    const { data } = await (supabase
      .from("organizations") as any)
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .maybeSingle();

    return data?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Scoped query builder — ensures every DB query is automatically filtered
 * to the current user's organization. Defense-in-depth on top of RLS.
 *
 * Usage:
 *   const orgId = await requireOrgId();
 *   const jobs = await scopedQuery(supabase, "jobs", orgId).select("*");
 *
 * The `requireOrgId` variant throws if the user has no org, suitable for
 * dashboard routes where org is mandatory.
 */
export async function requireOrgId(): Promise<string> {
  const orgId = await getCurrentOrgId();
  if (!orgId) {
    throw new Error(
      "Organization required. User must belong to an organization to access this resource.",
    );
  }
  return orgId;
}

/**
 * Create a Supabase query scoped to a specific org.
 *
 * This applies a `.eq("org_id", orgId)` filter to the initial query,
 * ensuring the user can never accidentally query another org's data —
 * even if RLS has a bug. The org_id column is the tenant boundary.
 *
 * For tables that use `clerk_org_id` instead of `org_id` (e.g. `organizations`),
 * use `scopedOrgQuery` instead.
 */
export function scopedQuery<T extends string>(
  supabase: ReturnType<typeof createServiceClient>,
  table: T,
  orgId: string,
) {
  if (!supabase) {
    throw new Error("Database not configured.");
  }

  return (supabase.from(table) as any).eq("org_id", orgId) as any;
}

/**
 * For the `organizations` table which uses `clerk_org_id` as the tenant key
 * instead of the internal `org_id` UUID.
 */
export function scopedOrgQuery(
  supabase: ReturnType<typeof createServiceClient>,
  clerkOrgId: string,
) {
  if (!supabase) {
    throw new Error("Database not configured.");
  }

  return (supabase
    .from("organizations") as any)
    .eq("clerk_org_id", clerkOrgId);
}

/**
 * Convenience: get the scoped supabase client + orgId in one call.
 * Returns [supabase, orgId] or throws if unauthenticated / unconfigured.
 */
export async function scopedClient() {
  const supabase = createServiceClient();
  if (!supabase) {
    throw new Error("Database not configured.");
  }

  const orgId = await requireOrgId();
  return { supabase, orgId };
}
