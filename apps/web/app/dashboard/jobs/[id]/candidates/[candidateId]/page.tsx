import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Mail, Calendar, Clock } from "lucide-react";
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
import { CompetencyChart } from "@/components/report/competency-chart";
import { StrengthsGaps } from "@/components/report/strengths-gaps";
import { CandidateActions } from "@/components/dashboard/candidate-actions";
import { ProctoringTimeline } from "@/components/dashboard/proctoring-timeline";

export const dynamic = "force-dynamic";

interface CandidateDetail {
  id: string;
  name: string;
  email: string;
  pipeline_status: string;
  created_at: string;
  job_id: string;
  job_title: string;
  session_id: string | null;
}

interface Scorecard {
  overall_score: number;
  competency_scores: Array<{
    competency: string;
    score: number;
    evidence: string;
    level: string;
  }>;
  strengths: string[];
  weaknesses: string[];
  summary: string;
  language_report: {
    fluency_score: number;
    filler_word_count: number;
    clarity_score: number;
    summary: string;
  };
}

interface Transcript {
  turns: Array<{
    role: string;
    text: string;
  }>;
}

interface ProctorEvent {
  id: string;
  event_type: string;
  warning_number: number;
  severity: string;
  occurred_at: string;
}

async function loadCandidate(
  jobId: string,
  candidateId: string,
): Promise<CandidateDetail | null> {
  const supabase = createServiceClient();
  if (!supabase) return null;

  try {
    const { data: candidate, error } = await supabase
      .from("candidates")
      .select("id, name, email, pipeline_status, created_at, job_id, session_id")
      .eq("id", candidateId)
      .eq("job_id", jobId)
      .single();

    if (error || !candidate) return null;

    const { data: job } = await supabase
      .from("jobs")
      .select("title")
      .eq("id", jobId)
      .single();

    return {
      ...candidate,
      job_title: job?.title ?? "Unknown",
    };
  } catch {
    return null;
  }
}

async function loadScorecard(
  sessionId: string,
): Promise<Scorecard | null> {
  const supabase = createServiceClient();
  if (!supabase) return null;

  try {
    const { data } = await supabase
      .from("scorecards")
      .select(
        "overall_score, competency_scores, strengths, weaknesses, summary, language_report",
      )
      .eq("session_id", sessionId)
      .maybeSingle();

    return data as Scorecard | null;
  } catch {
    return null;
  }
}

async function loadTranscript(sessionId: string): Promise<Transcript | null> {
  const supabase = createServiceClient();
  if (!supabase) return null;

  try {
    const { data } = await supabase
      .from("transcripts")
      .select("turns")
      .eq("session_id", sessionId)
      .maybeSingle();

    return data as Transcript | null;
  } catch {
    return null;
  }
}

async function loadProctoringEvents(
  sessionId: string,
): Promise<ProctorEvent[]> {
  const supabase = createServiceClient();
  if (!supabase) return [];

  try {
    const { data } = await supabase
      .from("proctoring_events")
      .select("id, event_type, warning_number, severity, occurred_at")
      .eq("session_id", sessionId)
      .order("occurred_at", { ascending: true });

    return (data ?? []) as ProctorEvent[];
  } catch {
    return [];
  }
}

const PIPELINE_STYLES: Record<string, string> = {
  invited: "bg-faint/10 text-faint",
  link_opened: "bg-accent/10 text-accent",
  interview_started: "bg-accent/10 text-accent",
  interview_completed: "bg-ok/10 text-ok",
  interview_terminated: "bg-accent/10 text-accent",
  shortlisted: "bg-ok/10 text-ok",
  rejected: "bg-muted/10 text-muted",
  on_hold: "bg-accent/10 text-accent",
  hired: "bg-ok/10 text-ok",
};

function scoreGrade(score: number): string {
  if (score >= 4.5) return "A+";
  if (score >= 4.0) return "A";
  if (score >= 3.5) return "B+";
  if (score >= 3.0) return "B";
  if (score >= 2.5) return "C+";
  if (score >= 2.0) return "C";
  return "D";
}

function recommendationLabel(score: number): string {
  if (score >= 4.0) return "Strong Yes";
  if (score >= 3.0) return "Yes";
  if (score >= 2.0) return "Maybe";
  return "No";
}

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string; candidateId: string }>;
}) {
  const { id: jobId, candidateId } = await params;
  const candidate = await loadCandidate(jobId, candidateId);

  if (!candidate) notFound();

  const [scorecard, transcript, proctorEvents] = await Promise.all([
    candidate.session_id
      ? loadScorecard(candidate.session_id)
      : Promise.resolve(null),
    candidate.session_id
      ? loadTranscript(candidate.session_id)
      : Promise.resolve(null),
    candidate.session_id
      ? loadProctoringEvents(candidate.session_id)
      : Promise.resolve([]),
  ]);

  return (
    <div>
      {/* Header */}
      <header>
        <Link
          href={`/dashboard/jobs/${jobId}`}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted no-underline hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to {candidate.job_title}
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-serif text-3xl text-ink">{candidate.name}</h1>
            <div className="mt-2 flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-[13px] text-muted">
                <Mail className="h-3.5 w-3.5" aria-hidden />
                {candidate.email}
              </span>
              <Badge
                className={`text-[10px] capitalize ${PIPELINE_STYLES[candidate.pipeline_status] ?? ""}`}
              >
                {candidate.pipeline_status.replace(/_/g, " ")}
              </Badge>
            </div>
          </div>

          <CandidateActions
            candidateId={candidate.id}
            jobId={jobId}
            status={candidate.pipeline_status}
          />
        </div>
      </header>

      {/* Content grid */}
      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        {/* Left: Scorecard (3 cols) */}
        <div className="space-y-6 lg:col-span-3">
          {scorecard ? (
            <>
              {/* Hero score */}
              <Card>
                <CardContent className="flex items-center gap-6 py-6">
                  <div className="flex h-24 w-24 items-center justify-center rounded-card border border-line bg-panel">
                    <div className="text-center">
                      <p className="font-serif text-4xl text-ink">
                        {scorecard.overall_score.toFixed(1)}
                      </p>
                      <p className="text-[11px] text-muted">/5</p>
                    </div>
                  </div>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
                      Grade
                    </p>
                    <p className="font-serif text-2xl text-ink">
                      {scoreGrade(scorecard.overall_score)}
                    </p>
                    <Badge className="mt-1 text-[10px]">
                      {recommendationLabel(scorecard.overall_score)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* AI Summary */}
              <Card>
                <CardHeader>
                  <CardTitle>AI Assessment</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[14px] leading-relaxed text-ink-soft">
                    {scorecard.summary}
                  </p>
                </CardContent>
              </Card>

              {/* Competencies */}
              <Card>
                <CardHeader>
                  <CardTitle>Competencies</CardTitle>
                  <CardDescription>
                    Scored 0-5 across the rubric.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-6">
                  <CompetencyChart
                    competencies={scorecard.competency_scores}
                  />
                </CardContent>
              </Card>

              {/* Strengths & Gaps */}
              <StrengthsGaps scorecard={scorecard} />
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted">
                  No scorecard available. The interview may not have been
                  completed or scored yet.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Recording + Transcript (2 cols) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Recording placeholder */}
          <Card>
            <CardHeader>
              <CardTitle>Recording</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-48 items-center justify-center rounded-[8px] bg-paper text-sm text-muted">
                Recording player coming soon
              </div>
            </CardContent>
          </Card>

          {/* Transcript */}
          {transcript && transcript.turns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Transcript</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 space-y-3 overflow-y-auto">
                  {transcript.turns.map((turn, i) => (
                    <div key={i}>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-faint">
                        {turn.role === "user" ? "Candidate" : "Interviewer"}
                      </p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">
                        {turn.text}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Proctoring events */}
          <ProctoringTimeline events={proctorEvents} />
        </div>
      </div>
    </div>
  );
}
