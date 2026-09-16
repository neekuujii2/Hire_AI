"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Check, Loader2 } from "lucide-react";

export type StepId = "landing" | "check" | "consent" | "waiting" | "interview" | "complete";

const STEPS: { id: StepId; label: string }[] = [
  { id: "landing", label: "Start" },
  { id: "check", label: "Device" },
  { id: "consent", label: "Consent" },
  { id: "waiting", label: "Prepare" },
  { id: "interview", label: "Interview" },
  { id: "complete", label: "Done" },
];

/**
 * Horizontal step progress bar shown in the invite header area. Reads the
 * current step from the URL so it stays in sync on reload.
 */
export function InviteProgress({ step }: { step: StepId }) {
  const currentIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="mt-6 flex items-center gap-2">
      {STEPS.map((s, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <React.Fragment key={s.id}>
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold",
                done && "bg-ok text-white",
                current && "bg-accent text-white",
                !done && !current && "bg-line-2 text-faint",
              )}
            >
              {done ? (
                <Check className="h-4 w-4" />
              ) : current ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                i + 1
              )}
            </div>
            <span
              className={cn(
                "hidden text-[12px] sm:inline",
                (done || current) ? "text-ink" : "text-faint",
              )}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-8 rounded-full",
                  done ? "bg-ok" : "bg-line-2",
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}