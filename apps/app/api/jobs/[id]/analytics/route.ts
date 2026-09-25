import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const jobId = params.id;
  if (!jobId) {
    return NextResponse.json({ error: "Job ID required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
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

  // Fetch job info
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, title, department, status, created_at, total_applications, total_hired, interview_duration_min")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Fetch applications for this job
  const { data: applications, error: appError } = await supabase
    .from("applications")
    .select(`
      id,
      status,
      ai_score,
      ai_recommendation,
      ai_screening_result,
      applied_at,
      source,
      candidate_profile_id,
      session_id,
      candidate_profiles (id, email, name, skills)
    `)
    .eq("job_id", jobId);

  if (appError) {
    return NextResponse.json({ error: appError.message }, { status: 500 });
  }

  const apps = applications || [];
  const totalApps = apps.length;

  // Funnel stages for this job
  const stages = ["applied", "ai_screening", "ai_interview", "hr_review", "shortlisted", "hired"];
  const funnel = stages.map(stage => ({
    stage,
    count: apps.filter(a => a.status === stage).length,
  }));

  // Score leaderboard (top 10 by AI score)
  const withScores = apps
    .filter(a => a.ai_score !== null)
    .sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0))
    .slice(0, 10);

  const leaderboard = withScores.map(a => ({
    name: a.candidate_profiles?.name || "Unknown",
    email: a.candidate_profiles?.email || "",
    score: a.ai_score,
    status: a.status,
    applied_at: a.applied_at,
  }));

  // Timeline: applications per day
  const timeline: Record<string, number> = {};
  for (const app of apps) {
    const day = app.applied_at?.split("T")[0] || "unknown";
    timeline[day] = (timeline[day] || 0) + 1;
  }
  const timelineData = Object.entries(timeline)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  // Screening insights: matched/missing skills
  const allMatched: string[] = [];
  const allMissing: string[] = [];
  for (const app of apps) {
    const result = app.ai_screening_result as any;
    if (result) {
      if (result.matched_skills) allMatched.push(...result.matched_skills);
      if (result.missing_skills) allMissing.push(...result.missing_skills);
    }
  }

  const matchedSkillCounts: Record<string, number> = {};
  for (const s of allMatched) {
    matchedSkillCounts[s] = (matchedSkillCounts[s] || 0) + 1;
  }
  const missingSkillCounts: Record<string, number> = {};
  for (const s of allMissing) {
    missingSkillCounts[s] = (missingSkillCounts[s] || 0) + 1;
  }

  const commonMatchedSkills = Object.entries(matchedSkillCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([skill, count]) => ({ skill, count }));

  const commonMissingSkills = Object.entries(missingSkillCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([skill, count]) => ({ skill, count }));

  // Interview completion rate
  const invitedToInterview = apps.filter(a =>
    ["ai_screening", "ai_interview", "hr_review", "shortlisted", "hired"].includes(a.status)
  ).length;
  const completedInterview = apps.filter(a => a.session_id !== null).length;
  const completionRate = invitedToInterview > 0
    ? Math.round((completedInterview / invitedToInterview) * 100)
    : 0;

  return NextResponse.json({
    job: {
      id: job.id,
      title: job.title,
      department: job.department,
      status: job.status,
      daysSincePosted: Math.floor(
        (Date.now() - new Date(job.created_at).getTime()) / (1000 * 60 * 60 * 24)
      ),
      total_applications: job.total_applications,
      total_hired: job.total_hired,
    },
    funnel,
    leaderboard,
    timeline: timelineData,
    screening_insights: {
      common_matched_skills: commonMatchedSkills,
      common_missing_skills: commonMissingSkills,
    },
    interview_completion: {
      invited: invitedToInterview,
      completed: completedInterview,
      rate: completionRate,
    },
  });
}