import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/candidates/[id]/nps — submit candidate NPS feedback.
 * GET /api/candidates/[id]/nps — get NPS status for a candidate.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const { data } = await supabase
    .from("candidate_nps")
    .select("rating, nps_score, feedback_text, created_at")
    .eq("candidate_id", id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    nps: data ?? null,
    submitted: !!data,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  let body: { rating: number; nps_score?: number; feedback_text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  if (typeof body.rating !== "number" || body.rating < 1 || body.rating > 5) {
    return NextResponse.json({ ok: false, error: "Rating must be 1-5." }, { status: 400 });
  }

  // Check for existing submission.
  const { data: existing } = await supabase
    .from("candidate_nps")
    .select("id")
    .eq("candidate_id", id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: false, error: "Feedback already submitted." }, { status: 409 });
  }

  const { error } = await (supabase.from("candidate_nps") as any).insert({
    candidate_id: id,
    rating: body.rating,
    nps_score: body.nps_score ?? null,
    feedback_text: body.feedback_text ?? null,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
