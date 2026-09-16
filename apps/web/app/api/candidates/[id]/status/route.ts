import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured." },
      { status: 503 },
    );
  }

  let body: { status: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid body." },
      { status: 400 },
    );
  }

  const VALID_STATUSES = [
    "invited",
    "link_opened",
    "interview_started",
    "interview_completed",
    "interview_terminated",
    "shortlisted",
    "rejected",
    "on_hold",
    "hired",
  ];

  if (!VALID_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { ok: false, error: `Invalid status: ${body.status}` },
      { status: 400 },
    );
  }

  try {
    const { error } = await supabase
      .from("candidates")
      .update({ pipeline_status: body.status })
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to update candidate status." },
      { status: 500 },
    );
  }
}
