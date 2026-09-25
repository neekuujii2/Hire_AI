import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs";
import { updateSession } from "@/lib/supabase/session";
import { hasPermission } from "@/lib/auth/roles";

// Public routes (no auth needed)
const isPublicRoute = createRouteMatcher([
  "/careers(.*)",
  "/invite/:token(.*)",
  "/api/health",
]);

// Route matchers for role-based access
const analyticsRoute = createRouteMatcher(["/dashboard/analytics(.*)"]);
const teamRoute = createRouteMatcher(["/dashboard/settings/team(.*)"]);
const billingRoute = createRouteMatcher(["/dashboard/settings/billing(.*)"]);

export async function proxy(request: NextRequest) {
  // Run Supabase session update first
  const response = await updateSession(request);

  // Public routes pass through without RBAC
  if (isPublicRoute(request)) {
    return response;
  }

  // Check auth
  const { userId } = request.cookies.get(" ClerkSession")?.value || {};
  if (!userId) {
    const signInUrl = new URL("/login", request.url);
    return NextResponse.redirect(signInUrl);
  }

  // Get user role from cookies/session
  // In production, this comes from Clerk JWT claims
  const role = (request.cookies.get(" ClerkSession")?.value as any)?.role || "candidate";

  // Block analytics routes for non-HR/Admin
  if (analyticsRoute(request) && !hasPermission(role, "analytics:view")) {
    return NextResponse.rewrite(new URL("/dashboard", request.url));
  }

  // Block team settings for non-Admin
  if (teamRoute(request) && role !== "admin") {
    return NextResponse.rewrite(new URL("/dashboard", request.url));
  }

  // Block billing for non-Admin
  if (billingRoute(request) && role !== "admin") {
    return NextResponse.rewrite(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run the Supabase session refresh on PAGES and apply RBAC.
     * Skip:
     * - _next/static (build assets)
     * - _next/image (image optimizer)
     * - favicon.ico
     * - API routes where proxy is pure waste
     */
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/session|api/coach|api/upload).*)",
  ],
};