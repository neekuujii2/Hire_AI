import { AlertTriangle, Clock, Lock, ServerOff, XCircle } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";

const COPY: Record<
  string,
  { eyebrow: string; title: string; body: string; icon: typeof AlertTriangle }
> = {
  invalid: {
    eyebrow: "Invalid link",
    title: "This invite link is not valid",
    body: "The link may have been typed incorrectly or is no longer active. Request a new invite from the team at the company you applied to.",
    icon: XCircle,
  },
  expired: {
    eyebrow: "Link expired",
    title: "This invite has expired",
    body: "Invite links are valid for a limited time. Please request a new interview link from the hiring team.",
    icon: Clock,
  },
  completed: {
    eyebrow: "Already completed",
    title: "You've already completed this interview",
    body: "The team is reviewing your responses. You can check back with them for next steps — there's nothing left to do here.",
    icon: Lock,
  },
  terminated: {
    eyebrow: "Interview terminated",
    title: "This interview was terminated",
    body: "The interview ended early. If you have questions, reach out to the hiring team directly.",
    icon: XCircle,
  },
  unavailable: {
    eyebrow: "Unavailable",
    title: "We couldn't load this invite",
    body: "The service is temporarily unavailable. Please try again in a few minutes, or contact the hiring team if the problem persists.",
    icon: ServerOff,
  },
};

export function InviteErrorView({
  error,
  token,
  supabaseConfigured,
}: {
  error: string;
  token: string;
  supabaseConfigured: boolean;
}) {
  const copy = COPY[error] ?? COPY.invalid;
  const Icon = copy.icon;

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-[640px] px-6 py-16">
      <div className="w-full">
        <Eyebrow>{copy.eyebrow}</Eyebrow>
        <h1 className="serif mt-3 text-4xl font-medium tracking-tight text-ink sm:text-5xl">
          {copy.title}
        </h1>
        <p className="mt-4 text-[15.5px] leading-relaxed text-muted">
          {copy.body}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="/"
            className={buttonClasses({ variant: "ink", size: "md" })}
          >
            Go to homepage
          </a>
          <a
            href="mailto:hello@hireai.example"
            className={buttonClasses({ variant: "out", size: "md" })}
          >
            Contact support
          </a>
        </div>
        <p className="mt-8 text-[12px] text-faint">
          Token: <span className="font-mono">{token}</span>
          {!supabaseConfigured ? " · database not configured" : ""}
        </p>
      </div>
    </main>
  );
}