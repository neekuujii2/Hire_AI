import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isClerkConfigured } from "@/lib/env";

/**
 * Public routes that don't require authentication or an organization.
 * - /invite/* — candidate-facing invite pipeline (token is the capability gate)
 * - /api/webhooks/* — Clerk webhook receiver (verifies via Svix, not Clerk session)
 * - /login, /signup, /auth/* — authentication flows
 * - /onboarding — org creation flow (authenticated but no org yet)
 * - / (landing), /setup — public pages
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/login",
  "/signup",
  "/auth/(.*)",
  "/invite/(.*)",
  "/api/webhooks/(.*)",
  "/onboarding",
  "/api/health",
]);

/**
 * Dashboard routes that require BOTH authentication AND an active organization.
 */
const isDashboardRoute = createRouteMatcher([
  "/dashboard(.*)",
]);

/**
 * Routes that require authentication but NOT an organization.
 * (e.g. onboarding — user just signed up, needs to create an org)
 */
const isAuthOnlyRoute = createRouteMatcher([
  "/onboarding",
]);

export default clerkMiddleware(async (auth, req) => {
  // When Clerk is not configured, pass through (dev/offline mode).
  if (!isClerkConfigured()) {
    return NextResponse.next();
  }

  const { userId, orgId } = await auth();

  // Public routes: always allow.
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // Not authenticated → redirect to sign-in.
  if (!userId) {
    const signInUrl = new URL("/login", req.url);
    signInUrl.searchParams.set("redirect_url", req.url);
    return NextResponse.redirect(signInUrl);
  }

  // Auth-only routes (onboarding): allow if authenticated, regardless of org.
  if (isAuthOnlyRoute(req)) {
    return NextResponse.next();
  }

  // Dashboard routes: require org.
  if (isDashboardRoute(req)) {
    if (!orgId) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }
    return NextResponse.next();
  }

  // All other routes: allow.
  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
