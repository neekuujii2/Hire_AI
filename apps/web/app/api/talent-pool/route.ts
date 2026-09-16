import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/talent-pool — search and filter pre-vetted candidates across all jobs.
 *
 * Query params:
 *   q          — text search on name, email, skills
 *   skill      — filter by competency name
 *   min_score  — minimum AI match score (0-100)
 *   seniority  — filter by seniority level
 *   status     — filter by pipeline status
 *   limit      — max results (default 50)
 *   offset     — pagination offset
 */
export async function GET(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const skill = url.searchParams.get("skill") || "";
  const minScore = parseFloat(url.searchParams.get("min_score") || "0");
  const seniority = url.searchParams.get("seniority") || "";
  const status = url.searchParams.get("status") || "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  // Query candidates with scores via join.
  let query = supabase
    .from("candidates")
    .select(
      `
      id, name, email, pipeline_status, created_at, cv_url,
      jobs!inner ( id, title, org_id, seniority ),
      scorecards ( overall_score, match_score, competency_scores, summary )
    `,
    )
    .eq("jobs.org_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (q) {
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
  }
  if (status) {
    query = query.eq("pipeline_status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Post-filter by match score and skill (since they're in JSON fields).
  let results = (data || []).map((row: any) => {
    const scorecard = row.scorecards?.[0];
    const matchScore = scorecard?.match_score;
    const competencies = scorecard?.competency_scores || [];
    const job = row.jobs;

    return {
      candidate_id: row.id,
      name: row.name,
      email: row.email,
      pipeline_status: row.pipeline_status,
      job_title: job?.title,
      seniority: job?.seniority,
      overall_score: scorecard?.overall_score ?? null,
      match_score: matchScore?.final_score ?? null,
      recommendation: matchScore?.recommendation ?? null,
      skills: competencies.map((c: any) => ({
        name: c.competency,
        score: c.score,
        level: c.level,
      })),
      summary: scorecard?.summary ?? null,
      created_at: row.created_at,
    };
  });

  // Apply skill filter.
  if (skill) {
    results = results.filter((r: any) =>
      r.skills.some((s: any) => s.name.toLowerCase().includes(skill.toLowerCase())),
    );
  }

  // Apply min score filter.
  if (minScore > 0) {
    results = results.filter((r: any) => (r.match_score ?? 0) >= minScore);
  }

  return NextResponse.json({
    ok: true,
    candidates: results,
    total: results.length,
    limit,
    offset,
  });
}
