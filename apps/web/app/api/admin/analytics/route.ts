import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/analytics — aggregated analytics for the hiring dashboard.
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

  // Fetch all sessions for this org's jobs.
  const { data: sessions } = await supabase
    .from("sessions")
    .select(
      `
      id, status, created_at, duration_sec,
      jobs!inner ( org_id ),
      scorecards ( overall_score, match_score, competency_scores, candidate_feedback )
    `,
    )
    .eq("jobs.org_id", orgId)
    .is("deleted_at", null);

  const allSessions = sessions ?? [];
  const completed: any[] = allSessions.filter((s: any) => s.status === "complete");
  const totalInterviews = allSessions.length;
  const completedCount = completed.length;

  // Score metrics.
  const scores = completed
    .map((s: any) => s.scorecards?.[0]?.overall_score)
    .filter((v: any) => typeof v === "number");
  const matchScores = completed
    .map((s: any) => s.scorecards?.[0]?.match_score?.final_score)
    .filter((v: any) => typeof v === "number");

  const avgScore = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
  const avgMatchScore = matchScores.length > 0 ? matchScores.reduce((a: number, b: number) => a + b, 0) / matchScores.length : 0;

  // Completion rate.
  const completionRate = totalInterviews > 0 ? (completedCount / totalInterviews) * 100 : 0;

  // Hire rate.
  const hired = completed.filter((s: any) => {
    const rec = s.scorecards?.[0]?.match_score?.recommendation;
    return rec === "strong_hire" || rec === "hire";
  }).length;
  const hireRate = completedCount > 0 ? (hired / completedCount) * 100 : 0;

  // Proctor alerts (sessions terminated for proctoring).
  const terminated = allSessions.filter((s: any) => s.status === "interview_terminated").length;
  const proctorAlertRate = totalInterviews > 0 ? (terminated / totalInterviews) * 100 : 0;

  // Average duration.
  const durations = completed
    .map((s: any) => s.duration_sec)
    .filter((v: any) => typeof v === "number");
  const avgDurationMin =
    durations.length > 0
      ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length / 60
      : 0;

  // Score distribution.
  const ranges = ["0-1", "1-2", "2-3", "3-4", "4-5"];
  const scoreDistribution = ranges.map((range) => {
    const [lo, hi] = range.split("-").map(Number);
    const count = scores.filter((s: number) => s >= lo! && s < hi!).length;
    return { range, count };
  });

  // Top skills.
  const skillMap: Record<string, { total: number; count: number }> = {};
  for (const s of completed) {
    const competencies = s.scorecards?.[0]?.competency_scores ?? [];
    for (const c of competencies) {
      if (!skillMap[c.competency]) skillMap[c.competency] = { total: 0, count: 0 };
      skillMap[c.competency].total += c.score;
      skillMap[c.competency].count += 1;
    }
  }
  const topSkills = Object.entries(skillMap)
    .map(([name, v]) => ({ name, avgScore: v.total / v.count, count: v.count }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 10);

  // Recommendation breakdown.
  const recommendationBreakdown: Record<string, number> = {};
  for (const s of completed) {
    const rec = s.scorecards?.[0]?.match_score?.recommendation ?? "maybe";
    recommendationBreakdown[rec] = (recommendationBreakdown[rec] ?? 0) + 1;
  }

  // Recent trend (last 7 days).
  const now = new Date();
  const recentTrend = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const daySessions = allSessions.filter((s: any) => s.created_at?.startsWith(dateStr));
    const dayCompleted = daySessions.filter((s: any) => s.status === "complete");
    const dayScores = dayCompleted
      .map((s: any) => s.scorecards?.[0]?.match_score?.final_score)
      .filter((v: any) => typeof v === "number");
    const avgDayScore = dayScores.length > 0 ? dayScores.reduce((a: number, b: number) => a + b, 0) / dayScores.length : 0;
    return { date: dateStr.slice(5), count: daySessions.length, avgScore: avgDayScore };
  });

  return NextResponse.json({
    ok: true,
    data: {
      totalInterviews,
      completedInterviews: completedCount,
      avgScore,
      avgMatchScore,
      completionRate,
      hireRate,
      proctorAlertRate,
      avgDurationMin,
      scoreDistribution,
      topSkills,
      recentTrend,
      recommendationBreakdown,
    },
  });
}
