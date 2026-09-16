import Link from "next/link";
import {
  Briefcase,
  Calendar,
  BarChart3,
  CheckCircle2,
  Plus,
  ArrowUpRight,
  Clock,
  UserCheck,
  UserX,
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

export const dynamic = "force-dynamic";

interface Stats {
  activeJobs: number;
  weekInterviews: number;
  avgScore: number;
  completionRate: number;
}

interface Activity {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

async function loadStats(): Promise<Stats> {
  const supabase = createServiceClient();
  if (!supabase) {
    return { activeJobs: 0, weekInterviews: 0, avgScore: 0, completionRate: 0 };
  }

  try {
    const [jobsRes, sessionsRes, scoreRes] = await Promise.all([
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .gte(
          "created_at",
          new Date(Date.now() - 7 * 86400000).toISOString(),
        ),
      supabase.from("scorecards").select("overall_score"),
    ]);

    const activeJobs = jobsRes.count ?? 0;
    const weekInterviews = sessionsRes.count ?? 0;
    const scores = (scoreRes.data ?? []).map(
      (r: { overall_score: number }) => r.overall_score,
    );
    const avgScore =
      scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0;

    const { count: completed } = await supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed");
    const { count: total } = await supabase
      .from("sessions")
      .select("id", { count: "exact", head: true });

    return {
      activeJobs,
      weekInterviews,
      avgScore: Math.round(avgScore * 10) / 10,
      completionRate:
        (total ?? 0) > 0 ? Math.round(((completed ?? 0) / (total ?? 1)) * 100) : 0,
    };
  } catch {
    return { activeJobs: 0, weekInterviews: 0, avgScore: 0, completionRate: 0 };
  }
}

async function loadActivity(): Promise<Activity[]> {
  const supabase = createServiceClient();
  if (!supabase) return [];

  try {
    const { data } = await supabase
      .from("sessions")
      .select("id, status, candidate_id, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    return (data ?? []).map(
      (s: {
        id: string;
        status: string;
        candidate_id: string | null;
        created_at: string;
      }) => ({
        id: s.id,
        type: s.status,
        message: describeEvent(s.status),
        timestamp: s.created_at,
      }),
    );
  } catch {
    return [];
  }
}

function describeEvent(status: string): string {
  switch (status) {
    case "completed":
      return "Interview completed";
    case "in_progress":
      return "Interview in progress";
    case "terminated_proctor":
      return "Interview terminated (proctoring)";
    case "terminated_timeout":
      return "Interview terminated (timeout)";
    case "prep_running":
      return "Prep pipeline running";
    case "ready":
      return "Session ready to start";
    default:
      return `Session ${status}`;
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

const STAT_CARDS = [
  {
    key: "activeJobs" as const,
    label: "Active Jobs",
    icon: Briefcase,
    format: (v: number) => String(v),
  },
  {
    key: "weekInterviews" as const,
    label: "This Week's Interviews",
    icon: Calendar,
    format: (v: number) => String(v),
  },
  {
    key: "avgScore" as const,
    label: "Avg Score",
    icon: BarChart3,
    format: (v: number) => `${v}/5`,
  },
  {
    key: "completionRate" as const,
    label: "Completion Rate",
    icon: CheckCircle2,
    format: (v: number) => `${v}%`,
  },
];

export default async function DashboardPage() {
  const [stats, activity] = await Promise.all([loadStats(), loadActivity()]);

  return (
    <div>
      <header className="flex items-center justify-between">
        <div>
          <Eyebrow>Dashboard</Eyebrow>
          <h1 className="mt-2 font-serif text-3xl text-ink">
            Hiring overview
          </h1>
        </div>
        <Link href="/dashboard/jobs" className={buttonClasses()}>
          <Plus className="mr-1.5 inline h-4 w-4" />
          Create New Job
        </Link>
      </header>

      {/* Stats */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map((card) => (
          <Card key={card.key}>
            <CardContent className="flex items-start justify-between py-5">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
                  {card.label}
                </p>
                <p className="mt-2 font-serif text-3xl text-ink">
                  {card.format(stats[card.key])}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-accent-soft">
                <card.icon className="h-4 w-4 text-accent" aria-hidden />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Activity */}
      <section className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Last 10 events across all jobs.</CardDescription>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                No activity yet. Create a job and invite candidates to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {activity.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between rounded-[8px] border border-line px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <StatusIcon status={event.type} />
                      <span className="text-[13px] text-ink">
                        {event.message}
                      </span>
                    </div>
                    <span className="text-[12px] text-muted">
                      {formatTime(event.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed")
    return <CheckCircle2 className="h-4 w-4 text-ok" aria-hidden />;
  if (status.startsWith("terminated"))
    return <UserX className="h-4 w-4 text-accent" aria-hidden />;
  if (status === "in_progress")
    return <Clock className="h-4 w-4 text-accent" aria-hidden />;
  return <UserCheck className="h-4 w-4 text-faint" aria-hidden />;
}
