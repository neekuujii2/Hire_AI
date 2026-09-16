import { notFound } from "next/navigation";
import { getCachedInvite } from "@/lib/invite-cache";
import { MobileGate } from "@/components/invite/mobile-gate";
import { CandidateNps } from "@/components/invite/candidate-nps";
import { Eyebrow } from "@/components/ui/eyebrow";
import { buttonClasses } from "@/components/ui/button";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * /invite/[token]/complete — post-interview thank you page with NPS feedback.
 */
export default async function InviteCompletePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const { error, payload } = await getCachedInvite(token);
  if (error || !payload) {
    notFound();
  }

  const personaName = payload.job.persona_name ?? "Alex";

  return (
    <MobileGate>
      <div className="mx-auto flex min-h-[70vh] w-full max-w-[640px] flex-col items-center px-6 py-16 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ok/10">
          <svg
            className="h-8 w-8 text-ok"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>

        <Eyebrow className="mt-6">Interview Complete</Eyebrow>

        <h1 className="serif mt-3 text-3xl font-medium tracking-tight text-ink sm:text-4xl">
          Thank you!
        </h1>

        <p className="mt-4 text-[15.5px] leading-relaxed text-muted">
          Your interview with{" "}
          <span className="font-medium text-ink">{personaName}</span> for the{" "}
          <span className="font-medium text-ink">{payload.job.title}</span> position
          at <span className="font-medium text-ink">{payload.org.name}</span> is now
          complete.
        </p>

        <p className="mt-3 text-[14px] text-muted">
          The hiring team will review your interview and get back to you within a few
          business days.
        </p>

        {/* NPS Feedback Form */}
        <div className="mt-8 w-full max-w-md text-left">
          <CandidateNps
            candidateId={payload.candidate.id}
            jobTitle={payload.job.title}
            companyName={payload.org.name}
          />
        </div>

        <Link
          href="/"
          className={buttonClasses({ variant: "out", size: "md" })}
        >
          Return to homepage
        </Link>

        <p className="mt-8 text-[12px] text-faint">
          Interview recorded and evaluated by AI. Results are confidential.
        </p>
      </div>
    </MobileGate>
  );
}
