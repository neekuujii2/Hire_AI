import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/service";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/org/api-keys — list API keys for this org.
 * POST /api/org/api-keys — create a new API key.
 * DELETE /api/org/api-keys?id=xxx — revoke an API key.
 */
export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, created_at, last_used_at, active")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, keys: data ?? [] });
}

export async function POST(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  let body: { name: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400 });
  }

  // Generate API key: hv_live_<48 hex chars>
  const rawKey = `hv_live_${randomBytes(24).toString("hex")}`;
  const keyPrefix = rawKey.slice(0, 12);

  // Hash the key for storage (only the prefix is stored in plaintext).
  const encoder = new TextEncoder();
  const keyData = encoder.encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", keyData);
  const keyHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { error } = await (supabase.from("api_keys") as any).insert({
    org_id: orgId,
    name: body.name.trim(),
    key_prefix: keyPrefix,
    key_hash: keyHash,
    created_by: userId,
    active: true,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Return the raw key ONCE — it can't be retrieved later.
  return NextResponse.json({ ok: true, key: rawKey, key_prefix: keyPrefix });
}

export async function DELETE(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const keyId = url.searchParams.get("id");
  if (!keyId) {
    return NextResponse.json({ ok: false, error: "Key id is required." }, { status: 400 });
  }

  const { error } = await (supabase.from("api_keys") as any)
    .update({ active: false })
    .eq("id", keyId)
    .eq("org_id", orgId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
