import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Users,
  BarChart3,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";
import { createServiceClient } from "@/lib/supabase/service";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { JobTabs } from "@/components/dashboard/job-tabs";

export const dynamic = "force-dynamic";

interface JobDetail {
  id: string;
  title: string;
  seniority: string;
  status: string;
  created_at: string;
  jd: string | null;
}

interface Candidate {
  id: string;
  name: string;
  email: string;
  pipeline_status: string;
  created_at: string;
  session_id: string | null;
  overall_score: number | null;
}

interface FunnelData {
  invited: number;
  started: number;
  completed: number;
  shortlisted: number;
}

async function loadJob(id: string): Promise<JobDetail | null> {
  const supabase = createServiceClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("jobs")
      .select("id, title, seniority, status, created_at, jd")
      .eq("id", id)
      .single();

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

async function loadCandidates(jobId: string): Promise<Candidate[]> {
  const supabase = createServiceClient();
  if (!supabase) return [];

  try {
    const { data: candidates } = await (supabase
      .from("candidates") as any)
      .select("id, name, email, pipeline_status, created_at, session_id")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (!candidates) return [];

    const enriched = await Promise.all(
      candidates.map(async (c: { id: string; name: string; email: string; pipeline_status: string; created_at: string; session_id: string | null }) => {
        let overall_score: number | null = null;
        if (c.session_id) {
          const { data: sc } = await (supabase
            .from("scorecards") as any)
            .select("overall_score")
            .eq("session_id", c.session_id)
            .maybeSingle();
          overall_score = sc?.overall_score ?? null;
        }
        return { ...c, overall_score };
      }),
    );

    return enriched;
  } catch {
    return [];
  }
}

async function loadFunnel(jobId: string): Promise<FunnelData> {
  const supabase = createServiceClient();
  if (!supabase) return { invited: 0, started: 0, completed: 0, shortlisted: 0 };

  try {
    const [invited, started, completed, shortlisted] = await Promise.all([
      supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId),
      supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .in("pipeline_status", ["interview_started", "interview_completed", "shortlisted"]),
      supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .eq("pipeline_status", "interview_completed"),
      supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .eq("pipeline_status", "shortlisted"),
    ]);

    return {
      invited: invited.count ?? 0,
      started: started.count ?? 0,
      completed: completed.count ?? 0,
      shortlisted: shortlisted.count ?? 0,
    };
  } catch {
    return { invited: 0, started: 0, completed: 0, shortlisted: 0 };
  }
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-ok/10 text-ok",
  draft: "bg-faint/10 text-faint",
  paused: "bg-accent/10 text-accent",
  closed: "bg-muted/10 text-muted",
};

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [job, candidates, funnel] = await Promise.all([
    loadJob(id),
    loadCandidates(id),
    loadFunnel(id),
  ]);

  if (!job) notFound();

  const avgScore =
    candidates.filter((c) => c.overall_score !== null).length > 0
      ? Math.round(
          (candidates
            .filter((c) => c.overall_score !== null)
            .reduce((sum, c) => sum + (c.overall_score ?? 0), 0) /
            candidates.filter((c) => c.overall_score !== null).length) *
            10,
        ) / 10
      : 0;

  return (
    <div>
      {/* Header */}
      <header>
        <Link
          href="/dashboard/jobs"
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted no-underline hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to jobs
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-serif text-3xl text-ink">{job.title}</h1>
            <div className="mt-2 flex items-center gap-3">
              <Badge
                className={`text-[10px] capitalize ${STATUS_STYLES[job.status] ?? ""}`}
              >
                {job.status}
              </Badge>
              <span className="text-[13px] capitalize text-muted">
                {job.seniority}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Overview cards */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
              Invited
            </p>
            <p className="mt-1 font-serif text-2xl text-ink">{funnel.invited}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
              Started
            </p>
            <p className="mt-1 font-serif text-2xl text-ink">{funnel.started}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
              Completed
            </p>
            <p className="mt-1 font-serif text-2xl text-ink">{funnel.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
              Shortlisted
            </p>
            <p className="mt-1 font-serif text-2xl text-ink">{funnel.shortlisted}</p>
          </CardContent>
        </Card>
      </section>

      {/* Tabs */}
      <section className="mt-8">
        <JobTabs
          jobId={job.id}
          candidates={candidates}
          avgScore={avgScore}
        />
      </section>
    </div>
  );
}
