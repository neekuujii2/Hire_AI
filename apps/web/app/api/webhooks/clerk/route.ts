import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

interface ClerkWebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * POST /api/webhooks/clerk — receives Clerk webhook events and syncs to Supabase.
 *
 * Events handled:
 *   - organization.created → create organizations row + org_configs row
 *   - organization.updated → update organizations row
 *   - organizationMembership.created → create/update users row
 *   - organizationMembership.deleted → soft-delete user
 *
 * Verification: Svix signature verification using CLERK_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured." },
      { status: 503 },
    );
  }

  const webhookSecret = serverEnv.clerkWebhookSecret;
  if (!webhookSecret) {
    return NextResponse.json(
      { ok: false, error: "Webhook secret not configured." },
      { status: 500 },
    );
  }

  // Verify the webhook signature.
  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { ok: false, error: "Missing Svix headers." },
      { status: 400 },
    );
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to read request body." },
      { status: 400 },
    );
  }

  const wh = new Webhook(webhookSecret);
  let event: ClerkWebhookEvent;
  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: `Webhook verification failed: ${message}` },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "organization.created":
        await handleOrganizationCreated(supabase, event.data);
        break;
      case "organization.updated":
        await handleOrganizationUpdated(supabase, event.data);
        break;
      case "organizationMembership.created":
        await handleMembershipCreated(supabase, event.data);
        break;
      case "organizationMembership.deleted":
        await handleMembershipDeleted(supabase, event.data);
        break;
      default:
        // Unhandled event type — acknowledge silently.
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: `Event handling failed: ${message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleOrganizationCreated(
  supabase: ReturnType<typeof createServiceClient> & object,
  data: Record<string, unknown>,
) {
  const clerkOrgId = data.id as string;
  const name = (data.name as string) || "Untitled";
  const slug =
    (data.slug as string) ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  // Upsert org (idempotent: webhook may retry).
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .upsert(
      { clerk_org_id: clerkOrgId, name, slug },
      { onConflict: "clerk_org_id" },
    )
    .select("id")
    .single();

  if (orgErr || !org) {
    throw new Error(`Failed to create organization: ${orgErr?.message}`);
  }

  // Create default org config (idempotent).
  await supabase
    .from("org_configs")
    .upsert({ org_id: org.id }, { onConflict: "org_id" });
}

async function handleOrganizationUpdated(
  supabase: ReturnType<typeof createServiceClient> & object,
  data: Record<string, unknown>,
) {
  const clerkOrgId = data.id as string;
  const updates: Record<string, unknown> = {};

  if (data.name !== undefined) updates.name = data.name;
  if (data.slug !== undefined) updates.slug = data.slug;
  if (data.logo_url !== undefined) updates.logo_url = data.logo_url;

  if (Object.keys(updates).length === 0) return;

  await supabase
    .from("organizations")
    .update(updates as any)
    .eq("clerk_org_id", clerkOrgId);
}

async function handleMembershipCreated(
  supabase: ReturnType<typeof createServiceClient> & object,
  data: Record<string, unknown>,
) {
  const clerkUserId = data.user?.id as string;
  const clerkOrgId = data.organization?.id as string;
  const email = (data.user?.email_addresses as Array<{ email_address: string }>)?.[0]
    ?.email_address as string;
  const name = (data.user?.first_name as string)
    ? `${data.user.first_name}${data.user.last_name ? ` ${data.user.last_name}` : ""}`
    : null;
  const role = mapRole(data.role as string);

  if (!clerkUserId || !clerkOrgId || !email) {
    throw new Error("Missing required fields in membership event");
  }

  // Resolve the org's internal ID.
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (!org) {
    throw new Error(`Organization not found for clerk_org_id: ${clerkOrgId}`);
  }

  // Upsert user (idempotent).
  await supabase.from("users").upsert(
    {
      clerk_user_id: clerkUserId,
      org_id: org.id,
      email,
      name,
      role,
    },
    { onConflict: "clerk_user_id" },
  );
}

async function handleMembershipDeleted(
  supabase: ReturnType<typeof createServiceClient> & object,
  data: Record<string, unknown>,
) {
  const clerkUserId = data.user?.id as string;
  if (!clerkUserId) return;

  // Soft-delete: set role to 'member' and leave the row (audit trail).
  // A hard delete would cascade to unrelated data; the RLS policy already
  // prevents access if the user's org doesn't match the JWT.
  await supabase
    .from("users")
    .update({ role: "member" } as any)
    .eq("clerk_user_id", clerkUserId);
}

function mapRole(clerkRole: string): string {
  switch (clerkRole) {
    case "org:admin":
      return "admin";
    case "org:member":
      return "member";
    default:
      return "member";
  }
}
