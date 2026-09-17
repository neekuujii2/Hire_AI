import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  try {
    const { data: job, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !job) {
      return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, job });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to load job." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  // Only allow updating safe fields.
  const allowed = ["title", "seniority", "status", "jd"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: "No valid fields to update." }, { status: 400 });
  }

  try {
    const { error } = await (supabase.from("jobs") as any)
      .update(updates)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to update job." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  try {
    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to delete job." }, { status: 500 });
  }
}
