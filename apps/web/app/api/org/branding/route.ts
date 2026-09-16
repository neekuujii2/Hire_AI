import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/org/branding — fetch org branding config.
 * PATCH /api/org/branding — update org branding.
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

  const { data } = await supabase
    .from("org_configs")
    .select("brand_color, welcome_message, thank_you_message")
    .eq("org_id", orgId)
    .single();

  return NextResponse.json({
    ok: true,
    branding: data ?? {
      brand_color: "#4338ca",
      welcome_message: "",
      thank_you_message: "",
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

  let body: { brand_color?: string; welcome_message?: string; thank_you_message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.brand_color !== undefined) update.brand_color = body.brand_color;
  if (body.welcome_message !== undefined) update.welcome_message = body.welcome_message;
  if (body.thank_you_message !== undefined) update.thank_you_message = body.thank_you_message;

  const { error } = await supabase
    .from("org_configs")
    .upsert({ org_id: orgId, ...update }, { onConflict: "org_id" });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
