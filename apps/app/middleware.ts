import { NextRequest, NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs";
import { hasPermission } from "@/lib/auth/roles";

// Public routes (no auth needed)
const isPublicRoute = createRouteMatcher([
  "/careers(.*)",
  "/invite/:token(.*)",
  "/api/health",
]);

// Route matchers
const analyticsRoute = createRouteMatcher(["/dashboard/analytics(.*)"]);
const teamRoute = createRouteMatcher(["/dashboard/settings/team(.*)"]);
const billingRoute = createRouteMatcher(["/dashboard/settings/billing(.*)"]);

export default clerkMiddleware((auth, req) => {
  // Public routes pass through
  if (isPublicRoute(req)) return;

  const { userId } = auth;
  if (!userId) {
    // Redirect to sign-in for protected routes
    const signInUrl = new URL("/login", req.url);
    return NextResponse.redirect(signInUrl);
  }

  // Fetch user role from Supabase (server-side)
  // The role is cached in the Clerk JWT custom claims for performance
  const role = (auth as any).claims?.role || "candidate";
  const canAccess = hasPermission(role as string, "analytics:view");

  // Block analytics routes for non-HR/Admin
  if (analyticsRoute(req) && !hasPermission(role, "analytics:view")) {
    return NextResponse.rewrite(new URL("/dashboard", req.url));
  }

  // Block team settings for non-Admin
  if (teamRoute(req) && role !== "admin") {
    return NextResponse.rewrite(new URL("/dashboard", req.url));
  }

  // Block billing for non-Admin
  if (billingRoute(req) && role !== "admin") {
    return NextResponse.rewrite(new URL("/dashboard", req.url));
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html|css|js|jpg|jpeg|png|gif|svg|ico|woff|woff2)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    "/dashboard(.*)",
  ],
};