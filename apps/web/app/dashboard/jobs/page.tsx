import Link from "next/link";
import { Plus, Users, Clock, BarChart3 } from "lucide-react";
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
import { JobsFilter } from "@/components/dashboard/jobs-filter";

export const dynamic = "force-dynamic";

interface Job {
  id: string;
  title: string;
  seniority: string;
  status: string;
  created_at: string;
  candidate_count: number;
  completed_count: number;
}

async function loadJobs(): Promise<Job[]> {
  const supabase = createServiceClient();
  if (!supabase) return [];

  try {
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("id, title, seniority, status, created_at")
      .order("created_at", { ascending: false });

    if (error || !jobs) return [];

    const jobsWithCounts = await Promise.all(
      jobs.map(async (job: { id: string; title: string; seniority: string; status: string; created_at: string }) => {
        const { count: candidate_count } = await supabase
          .from("candidates")
          .select("id", { count: "exact", head: true })
          .eq("job_id", job.id);

        const { count: completed_count } = await supabase
          .from("candidates")
          .select("id", { count: "exact", head: true })
          .eq("job_id", job.id)
          .eq("pipeline_status", "interview_completed");

        return {
          ...job,
          candidate_count: candidate_count ?? 0,
          completed_count: completed_count ?? 0,
        };
      }),
    );

    return jobsWithCounts;
  } catch {
    return [];
  }
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-ok/10 text-ok",
  draft: "bg-faint/10 text-faint",
  paused: "bg-accent/10 text-accent",
  closed: "bg-muted/10 text-muted",
};

export default async function JobsPage() {
  const jobs = await loadJobs();

  return (
    <div>
      <header className="flex items-center justify-between">
        <div>
          <Eyebrow>Jobs</Eyebrow>
          <h1 className="mt-2 font-serif text-3xl text-ink">All jobs</h1>
        </div>
        <Link href="/dashboard/jobs" className={buttonClasses()}>
          <Plus className="mr-1.5 inline h-4 w-4" />
          Create Job
        </Link>
      </header>

      <JobsFilter />

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted">
                No jobs yet. Create your first job to start interviewing candidates.
              </p>
            </CardContent>
          </Card>
        ) : (
          jobs.map((job) => (
            <Link
              key={job.id}
              href={`/dashboard/jobs/${job.id}`}
              className="group no-underline"
            >
              <Card className="transition-shadow group-hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-[15px] font-medium text-ink group-hover:text-accent">
                      {job.title}
                    </CardTitle>
                    <Badge
                      className={`text-[10px] ${STATUS_STYLES[job.status] ?? STATUS_STYLES.draft}`}
                    >
                      {job.status}
                    </Badge>
                  </div>
                  <CardDescription className="text-[12px] capitalize">
                    {job.seniority}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-[12px] text-muted">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" aria-hidden />
                      {job.candidate_count} candidates
                    </span>
                    <span className="flex items-center gap-1">
                      <BarChart3 className="h-3.5 w-3.5" aria-hidden />
                      {job.completed_count} completed
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
