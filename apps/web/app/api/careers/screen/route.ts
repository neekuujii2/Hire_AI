import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

export async function POST(req: NextRequest) {
  let body: { applicationId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { applicationId } = body;
  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  let supabase;
  try {
    const cookieStore = await cookies();
    supabase = createServerClient(
      serverEnv.supabaseUrl as string,
      serverEnv.supabaseAnonKey as string,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              for (const cookie of cookiesToSet) {
                cookieStore.set(cookie.name, cookie.value, cookie.options);
              }
            } catch {}
          },
        },
      }
    );
  } catch {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  // Fetch application with candidate profile and job
  const { data: application, error: appError } = await supabase
    .from("applications")
    .select(`
      id,
      org_id,
      job_id,
      candidate_profile_id,
      status,
      ai_score,
      ai_recommendation,
      candidate_profiles (id, email, name, cv_text, cv_url, skills, total_experience_years),
      jobs (id, title, job_description, requirements, skills_required, is_published)
    `)
    .eq("id", applicationId)
    .single();

  if (appError || !application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  if (!application.jobs?.is_published) {
    return NextResponse.json({ error: "Job not accepting applications" }, { status: 400 });
  }

  // Call the AI screening agent
  let screeningResult: any;
  try {
    const agentRes = await fetch(`${serverEnv.agentApiUrl}/agent/screen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cv_text: application.candidate_profiles?.cv_text || "",
        cv_url: application.candidate_profiles?.cv_url || "",
        job_title: application.jobs?.title || "",
        job_description: application.jobs?.job_description || "",
        requirements: application.jobs?.requirements || "",
        skills_required: application.jobs?.skills_required || [],
        org_id: application.org_id,
      }),
    });

    if (!agentRes.ok) {
      return NextResponse.json(
        { error: "AI screening failed" },
        { status: 502 }
      );
    }

    screeningResult = await agentRes.json();
  } catch (err) {
    console.error("[careers/screen] Agent call failed:", err);
    return NextResponse.json({ error: "AI screening unavailable" }, { status: 502 });
  }

  const score = screeningResult.overall_score || 0;
  const recommendation = screeningResult.recommendation || "maybe";

  // Update application with screening results
  const { error: updateError } = await supabase
    .from("applications")
    .update({
      ai_score: score,
      ai_recommendation: recommendation,
      ai_screening_result: screeningResult,
      ai_screening_at: new Date().toISOString(),
      status: score >= 60 ? "ai_interview" : "rejected",
      status_changed_at: new Date().toISOString(),
    })
    .eq("id", applicationId);

  if (updateError) {
    console.error("[careers/screen] Update failed:", updateError);
    return NextResponse.json({ error: "Failed to update application" }, { status: 500 });
  }

  // Insert status history
  await supabase.from("application_status_history").insert({
    application_id: applicationId,
    from_status: application.status,
    to_status: score >= 60 ? "ai_interview" : "rejected",
    changed_by: null,
    reason: score >= 60
      ? `AI screening passed (score: ${score})`
      : `AI screening failed (score: ${score})`,
  });

  return NextResponse.json({
    applicationId,
    score,
    recommendation,
    status: score >= 60 ? "ai_interview" : "rejected",
  });
}