import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

interface ScorecardData {
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

interface CandidateData {
  name: string;
  email: string;
  created_at: string;
  job_id: string;
  session_id: string | null;
}

interface JobData {
  title: string;
}

interface ProctorEvent {
  event_type: string;
  warning_number: number;
  severity: string;
  occurred_at: string;
}

interface TranscriptData {
  turns: Array<{ role: string; text: string }>;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: candidateId } = await params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format");

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured." },
      { status: 503 },
    );
  }

  try {
    // Load candidate
    const { data: candidate, error: candErr } = await supabase
      .from("candidates")
      .select("name, email, created_at, job_id, session_id")
      .eq("id", candidateId)
      .single();

    if (candErr || !candidate) {
      return NextResponse.json(
        { ok: false, error: "Candidate not found." },
        { status: 404 },
      );
    }

    const cand = candidate as CandidateData;

    // Load job title
    const { data: job } = await supabase
      .from("jobs")
      .select("title")
      .eq("id", cand.job_id)
      .single();

    const jobData = job as JobData | null;

    // Load scorecard
    let scorecard: ScorecardData | null = null;
    if (cand.session_id) {
      const { data: sc } = await supabase
        .from("scorecards")
        .select(
          "overall_score, competency_scores, strengths, weaknesses, summary, language_report",
        )
        .eq("session_id", cand.session_id)
        .maybeSingle();
      scorecard = sc as ScorecardData | null;
    }

    // Load transcript
    let transcript: TranscriptData | null = null;
    if (cand.session_id) {
      const { data: tr } = await supabase
        .from("transcripts")
        .select("turns")
        .eq("session_id", cand.session_id)
        .maybeSingle();
      transcript = tr as TranscriptData | null;
    }

    // Load proctoring events
    let proctorEvents: ProctorEvent[] = [];
    if (cand.session_id) {
      const { data: pe } = await supabase
        .from("proctoring_events")
        .select("event_type, warning_number, severity, occurred_at")
        .eq("session_id", cand.session_id)
        .order("occurred_at", { ascending: true });
      proctorEvents = (pe ?? []) as ProctorEvent[];
    }

    // If format=pdf, return JSON for client-side PDF generation
    if (format === "pdf") {
      return NextResponse.json({
        ok: true,
        candidate: {
          name: cand.name,
          email: cand.email,
          interviewDate: cand.created_at,
        },
        job: { title: jobData?.title ?? "Unknown" },
        scorecard,
        transcript: transcript?.turns ?? [],
        proctorEvents,
      });
    }

    return NextResponse.json({
      ok: true,
      candidate: {
        name: cand.name,
        email: cand.email,
        interviewDate: cand.created_at,
      },
      job: { title: jobData?.title ?? "Unknown" },
      scorecard,
      transcript: transcript?.turns ?? [],
      proctorEvents,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to load report data." },
      { status: 500 },
    );
  }
}
