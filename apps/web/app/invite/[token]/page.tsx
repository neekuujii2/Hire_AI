import Link from "next/link";
import { Clock, FileText, Video } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { MobileGate } from "@/components/invite/mobile-gate";

export const dynamic = "force-dynamic";

/**
 * /invite/[token] — Landing page.
 *
 * Shows company logo, job title, company name, interview duration, what to
 * expect, and a "Start Interview" CTA. Mobile detection gates the flow to a
 * friendly "use desktop" message.
 */
export default async function InviteLandingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <MobileGate>
      <div className="mx-auto w-full max-w-[720px] px-6">
        <div className="reveal is-in">
          <Eyebrow>AI-powered interview</Eyebrow>
          <h1 className="serif mt-4 text-4xl font-medium tracking-tight text-ink sm:text-5xl">
            You're invited to interview
          </h1>
          <p className="mt-4 text-[15.5px] leading-relaxed text-muted">
            A short, live interview with an AI interviewer. It takes about
            30 minutes, runs in your browser, and is recorded for evaluation.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-card border border-line bg-panel p-5">
            <Clock className="h-5 w-5 text-accent" />
            <p className="mt-3 text-[13px] font-semibold text-ink">
              ~30 minutes
            </p>
            <p className="mt-1 text-[12.5px] text-muted">
              Timed, adaptive Q&amp;A with follow-ups.
            </p>
          </div>
          <div className="rounded-card border border-line bg-panel p-5">
            <Video className="h-5 w-5 text-accent" />
            <p className="mt-3 text-[13px] font-semibold text-ink">
              Voice + camera
            </p>
            <p className="mt-1 text-[12.5px] text-muted">
              You speak out loud; a text fallback is always available.
            </p>
          </div>
          <div className="rounded-card border border-line bg-panel p-5">
            <FileText className="h-5 w-5 text-accent" />
            <p className="mt-3 text-[13px] font-semibold text-ink">
              CV optional
            </p>
            <p className="mt-1 text-[12.5px] text-muted">
              Upload a PDF/DOCX if the job requires it.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href={`/invite/${token}/check`}
            className={buttonClasses({ variant: "ink", size: "lg" })}
            suppressHydrationWarning
          >
            Start Interview
          </Link>
          <p className="text-[12.5px] text-faint">
            You'll verify your camera and mic first.
          </p>
        </div>

        <p className="mt-10 text-center text-[12px] text-faint">
          By continuing you agree to being recorded and evaluated by AI.
        </p>
      </div>
    </MobileGate>
  );
}