"use client";

import { useAuth as useClerkAuth, useOrganization as useClerkOrg } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/env";

interface AuthContext {
  /** Clerk user ID (null when Clerk is unconfigured). */
  userId: string | null;
  /** Clerk organization ID (null when user has no org). */
  orgId: string | null;
  /** Organization slug for URL-friendly display. */
  orgSlug: string | null;
  /** User's role within the organization: "admin" | "manager" | "member". */
  userRole: string | null;
  /** True when auth is loading. */
  isLoaded: boolean;
  /** True when user is authenticated. */
  isSignedIn: boolean;
  /** True when user has an active organization. */
  hasOrg: boolean;
}

/**
 * Auth context hook wrapping Clerk's useAuth + useOrganization.
 *
 * Returns a simplified, typed interface consumed by dashboard components.
 * When Clerk is not configured (dev/offline mode), returns nulls so the
 * app stays functional — API routes use their own service-role client.
 */
export function useAuth(): AuthContext {
  if (!isClerkConfigured()) {
    return {
      userId: null,
      orgId: null,
      orgSlug: null,
      userRole: null,
      isLoaded: true,
      isSignedIn: false,
      hasOrg: false,
    };
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { userId, isLoaded, isSignedIn } = useClerkAuth();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { organization } = useClerkOrg();

  return {
    userId: userId ?? null,
    orgId: organization?.id ?? null,
    orgSlug: organization?.slug ?? null,
    userRole: (organization as any)?.membership?.role ?? null,
    isLoaded,
    isSignedIn: Boolean(isSignedIn),
    hasOrg: Boolean(organization),
  };
}
