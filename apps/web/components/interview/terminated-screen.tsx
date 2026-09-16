"use client";

import { cn } from "@/lib/cn";
import { XCircle } from "lucide-react";

interface TerminatedScreenProps {
  reason?: string;
}

const REASON_MESSAGES: Record<string, string> = {
  tab_switch: "Repeated tab switching can compromise interview integrity.",
  no_face_visible: "Your face was not visible in the camera for an extended period.",
  multiple_faces: "Multiple people were detected in the camera frame.",
  copy_paste: "Copy-paste use was detected during the interview.",
  screen_share_attempt: "Screen sharing attempts are not permitted.",
  unknown: "A policy violation was detected.",
};

/**
 * Full-screen termination overlay shown when the interview is ended by the
 * proctor. Honest, calm messaging — explains what happened and gives a support
 * contact. No score or feedback is shown (the session was invalidated).
 */
export function TerminatedScreen({ reason }: TerminatedScreenProps) {
  const label = REASON_MESSAGES[reason ?? "unknown"] ?? REASON_MESSAGES.unknown;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper/95 backdrop-blur">
      <div className="mx-auto w-full max-w-[560px] px-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
          <XCircle className="h-8 w-8 text-accent" />
        </div>

        <h1 className="serif mt-6 text-3xl font-medium tracking-tight text-ink sm:text-4xl">
          Interview terminated
        </h1>

        <p className="mt-4 text-[15.5px] leading-relaxed text-muted">
          This interview has ended early due to a policy violation.
        </p>

        <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
          {label}
        </p>

        <div className="mt-6 rounded-[10px] border border-line bg-panel px-4 py-3 text-[13px] text-muted">
          If you believe this was a mistake, contact the hiring team at{" "}
          <a
            href="mailto:hello@hireai.example"
            className="text-accent hover:underline"
          >
            hello@hireai.example
          </a>
          .
        </div>
      </div>
    </div>
  );
}
