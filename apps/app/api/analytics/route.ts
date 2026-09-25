import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

async function fetchWithRedisCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const Redis = (await import("ioredis")).default;
    const redis = new Redis(REDIS_URL);
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as T;
    const data = await fetcher();
    await redis.setex(key, 300, JSON.stringify(data));
    await redis.quit();
    return data;
  } catch {
    return fetcher();
  }
}

export async function GET(req: NextRequest) {
  const range = req.nextUrl.searchParams.get("range") || "30d";
  const days = range === "90d" ? 90 : range === "12m" ? 365 : 30;
  const cacheKey = `analytics:${range}:${await getCurrentOrgId()}`;

  const data = await fetchWithRedisCache(cacheKey, () => buildAnalytics(days));
  return NextResponse.json(data);
}

async function getCurrentOrgId(): Promise<string> {
  try {
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
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || "unknown";
  } catch {
    return "unknown";
  }
}

async function buildAnalytics(days: number) {
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

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = since.toISOString();

  const { count: totalApps } = await supabase
    .from("applications")
    .select("*", { count: "exact", head: true })
    .gte("applied_at", sinceISO);

  const { count: interviewsCompleted } = await supabase
    .from("applications")
    .select("*", { count: "exact", head: true })
    .eq("status", "ai_interview")
    .gte("applied_at", sinceISO);

  const { data: avgScoreData } = await supabase
    .from("applications")
    .select("ai_score")
    .gte("applied_at", sinceISO)
    .not("ai_score", "is", null);

  const avgScore = avgScoreData?.length
    ? avgScoreData.reduce((s, r) => s + (r.ai_score || 0), 0) / avgScoreData.length
    : 0;

  const stages = ["applied", "ai_screening", "ai_interview", "hr_review", "shortlisted", "hired"];
  const funnel = await Promise.all(
    stages.map(async (status) => {
      const { count } = await supabase
        .from("applications")
        .select("*", { count: "exact", head: true })
        .eq("status", status)
        .gte("applied_at", sinceISO);
      return { stage: status, count: count || 0 };
    })
  );

  const { data: appsOverTime } = await supabase
    .from("applications")
    .select("applied_at")
    .gte("applied_at", sinceISO);

  const { data: scoreData } = await supabase
    .from("applications")
    .select("ai_score")
    .gte("applied_at", sinceISO)
    .not("ai_score", "is", null);

  const { data: jobsPerf } = await supabase
    .from("jobs")
    .select("id, title, total_applications, total_hired")
    .gte("created_at", sinceISO);

  const { data: sourceData } = await supabase
    .from("applications")
    .select("source")
    .gte("applied_at", sinceISO);

  return {
    kpis: {
      total_applications: totalApps || 0,
      interviews_completed: interviewsCompleted || 0,
      avg_score: Math.round(avgScore * 10) / 10,
      avg_time_to_hire: 0,
    },
    funnel,
    applications_over_time: appsOverTime || [],
    score_distribution: buildScoreDistribution(scoreData || []),
    jobs_performance: jobsPerf || [],
    source_breakdown: buildSourceBreakdown(sourceData || []),
  };
}

function buildScoreDistribution(scores: { ai_score: number }[]) {
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    bucket: `${i * 10}-${(i + 1) * 10}`,
    count: 0,
  }));
  for (const s of scores) {
    const idx = Math.min(Math.floor(s.ai_score / 10), 9);
    buckets[idx].count++;
  }
  return buckets;
}

function buildSourceBreakdown(sources: { source: string }[]) {
  const counts: Record<string, number> = {};
  for (const s of sources) {
    counts[s.source] = (counts[s.source] || 0) + 1;
  }
  const total = sources.length;
  return Object.entries(counts).map(([source, count]) => ({
    source,
    count,
    percentage: total ? Math.round((count / total) * 100) : 0,
  }));
}