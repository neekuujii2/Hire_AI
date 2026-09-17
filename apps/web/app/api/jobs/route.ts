import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: true, jobs: [] });
  }

  try {
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("id, title, seniority, status, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, jobs: jobs ?? [] });
  } catch {
    return NextResponse.json({ ok: true, jobs: [] });
  }
}

export async function POST(request: Request) {
  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured." },
      { status: 503 },
    );
  }

  let body: {
    title: string;
    seniority?: string;
    jd?: string;
    status?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  if (!body.title?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Title is required." },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await (supabase.from("jobs") as any)
      .insert({
        title: body.title.trim(),
        seniority: body.seniority ?? "mid",
        jd: body.jd ?? null,
        status: body.status ?? "draft",
      })
      .select("id, title, status")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, job: data });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to create job." },
      { status: 500 },
    );
  }
}
