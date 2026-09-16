import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/org/settings — fetch org webhook configuration and settings.
 * PATCH /api/org/settings — update org webhook configuration.
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
    .from("org_configs")
    .select("*")
    .eq("org_id", orgId)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    settings: data ?? {
      webhook_url: "",
      webhook_secret: "",
      webhook_events: [],
      company_values: [],
      enable_ai_insights: false,
    },
  });
}

export async function PATCH(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  const upsert = {
    org_id: orgId,
    ...body,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("org_configs").upsert(upsert, { onConflict: "org_id" });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
