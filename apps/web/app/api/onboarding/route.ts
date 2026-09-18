import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isClerkConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding — create an organization for the current Clerk user.
 *
 * Called from the onboarding form after the user provides company details.
 * Creates the organization + default config in Supabase, then links the
 * user as the org admin.
 */
export async function POST(request: Request) {
  if (!isClerkConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Clerk is not configured." },
      { status: 503 },
    );
  }

  const { userId, orgId: clerkOrgId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Authentication required." },
      { status: 401 },
    );
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured." },
      { status: 503 },
    );
  }

  let body: { name: string; industry?: string; team_size?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  if (!body.name?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Company name is required." },
      { status: 400 },
    );
  }

  // The org should already exist from the Clerk webhook (organization.created).
  // If not, create it. If it does exist, update it with the extra fields.
  if (clerkOrgId) {
    // Upsert org with additional fields.
    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .upsert(
        {
          clerk_org_id: clerkOrgId,
          name: body.name.trim(),
          slug,
        },
        { onConflict: "clerk_org_id" },
      )
      .select("id")
      .maybeSingle();

    if (orgErr || !org) {
      return NextResponse.json(
        { ok: false, error: `Failed to create organization: ${orgErr?.message}` },
        { status: 500 },
      );
    }

    // Ensure default config exists.
    await supabase
      .from("org_configs")
      .upsert({ org_id: org.id }, { onConflict: "org_id" });

    // Ensure user row exists with admin role.
    await supabase.from("users").upsert(
      {
        clerk_user_id: userId,
        org_id: org.id,
        email: "", // Will be filled by webhook on next membership event
        role: "admin",
      },
      { onConflict: "clerk_user_id" },
    );
  }

  return NextResponse.json({ ok: true });
}
