import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/jobs/[id]/questions/generate — trigger AI question generation from JD.
 *
 * Fetches the job's description, calls the agent's question planner endpoint,
 * and returns generated questions for preview before saving.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  // Fetch job details.
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, title, job_description, org_id")
    .eq("id", id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
  }

  // Fetch org config for company name.
  const { data: org } = await (supabase.from("organizations") as any)
    .select("name")
    .eq("id", job.org_id)
    .single();

  const companyName = org?.name ?? "the company";
  const jdText = job.job_description ?? job.title;

  // Call the agent's prep endpoint to generate questions.
  try {
    const agentUrl = process.env.AGENT_URL || "http://localhost:8000";
    const res = await fetch(`${agentUrl}/api/prep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cv_url: "",
        jd_text: jdText,
        company: companyName,
        language_mode: { primary: "en", mixed: false },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "Agent generation failed." },
        { status: 502 },
      );
    }

    const data = await res.json();
    // Extract questions from the generated plan.
    const questions = data.questions ?? data.plan?.questions ?? [];

    return NextResponse.json({ ok: true, questions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
