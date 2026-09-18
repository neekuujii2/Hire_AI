"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "@/lib/i18n/client";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/spinner";
import { fetchSessionView, resetSessionPolling, type ClientSessionView } from "@/lib/session";
import { ArrowLeft, AlertTriangle } from "lucide-react";

const POLL_MS = 1500;

/**
 * Polling loader for the invite pipeline's waiting step.
 *
 * Shows a branded "preparing your interview" screen with a progress bar that
 * animates for ~30s of wall-clock time (visual cue) while simultaneously
 * polling the agent's session status. When status becomes `ready`, navigates
 * to the interview room. Handles all terminal states: ready, rejected, error,
 * stalled, not_found, complete, no_answers.
 */
export function PrepLoader({
  sessionId,
  personaName,
  companyName,
}: {
  sessionId: string;
  personaName: string;
  companyName: string;
}) {
  const router = useRouter();
  const messages = useMessages();
  const [view, setView] = useState<ClientSessionView | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [fakeProgress, setFakeProgress] = useState(0);

  const fakeProgressRef = useRef<number | null>(null);

  useEffect(() => {
    resetSessionPolling(sessionId);

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      const next = await fetchSessionView(sessionId);
      if (cancelled) return;
      setView(next);

      if (next.status !== "prep") {
        if (timer) clearTimeout(timer);
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    }

    poll();

    // Fake 30s progress bar — purely visual. Real progress comes from the agent.
    const start = Date.now();
    const PROGRESS_DURATION = 30_000;
    function tick() {
      if (cancelled) return;
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / PROGRESS_DURATION) * 100);
      setFakeProgress(pct);

      const currentView = view;
      if (currentView && currentView.status !== "prep") {
        return; // real prep finished, stop the fake timer
      }
      fakeProgressRef.current = window.setTimeout(tick, 250);
    }
    fakeProgressRef.current = window.setTimeout(tick, 250);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (fakeProgressRef.current != null) {
        clearTimeout(fakeProgressRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, retryKey]);

  // React to status changes — navigate or show error.
  useEffect(() => {
    if (!view) return;

    if (view.status === "ready") {
      router.push(`/invite/${getTokenFromPath()}/interview`);
      return;
    }

    if (view.status === "complete" || view.status === "no_answers") {
      router.push(`/invite/${getTokenFromPath()}/complete`);
      return;
    }

    if (
      view.status === "rejected" ||
      view.status === "error" ||
      view.status === "stalled" ||
      view.status === "not_found"
    ) {
      // Stay on the page — the render below shows the error.
    }
  }, [view, router]);

  function getTokenFromPath(): string {
    // Extract the token from the current path. This is a best-effort read
    // since the page is server-rendered with the token in the URL.
    if (typeof window === "undefined") return "";
    const parts = window.location.pathname.split("/");
    // /invite/[token]/waiting → parts: ["", "invite", token, "waiting"]
    return parts[2] ?? "";
  }

  const status = view?.status ?? "prep";
  const warnings = view?.prep_warnings ?? [];

  const handleRetry = () => {
    setRetryKey((k) => k + 1);
    setView(null);
    setFakeProgress(0);
  };

  const isError =
    status === "rejected" ||
    status === "error" ||
    status === "stalled" ||
    status === "not_found";

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-[720px] flex-col items-center px-6 py-12">
      <div className="w-full text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft">
          <Spinner className="h-6 w-6 text-accent" />
        </div>

        <h1 className="serif mt-6 text-3xl font-medium tracking-tight text-ink sm:text-4xl">
          Prepping your interview
        </h1>
        <p className="mt-4 text-[15.5px] leading-relaxed text-muted">
          <span className="font-medium text-ink">{personaName || "Alex"}</span>{" "}
          is preparing your personalized interview for{" "}
          <span className="font-medium text-ink">{companyName}</span>. This
          takes about 30 seconds.
        </p>

        {/* Fake progress bar (visual only — real progress from agent) */}
        <div className="mt-8">
          <div className="h-1 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
              style={{ width: `${fakeProgress}%` }}
            />
          </div>
          <p className="mt-2 text-[12px] text-faint">
            {Math.round(fakeProgress)}% — preparing questions and researching
            the role
          </p>
        </div>

        {/* Prep warnings */}
        {warnings.length > 0 && (
          <div className="mt-6 rounded-[10px] border border-accent/30 bg-accent-soft px-4 py-3 text-left">
            <div className="flex gap-2 text-[13px] text-ink-soft">
              <AlertTriangle className="h-4 w-4 shrink-0 text-accent" />
              <span>
                Heads up:{" "}
                {warnings.map((w, i) => (
                  <span key={i}>
                    {i > 0 && ", "}
                    {w}
                  </span>
                ))}
              </span>
            </div>
          </div>
        )}

        {/* Terminal states */}
        {status === "prep" && (
          <p className="mt-6 text-[13px] text-ink-soft">
            Step {view?.progress?.length ?? 0} of 5 in progress…
          </p>
        )}

        {isError && (
          <div className="mt-6 rounded-[10px] border border-line bg-panel px-6 py-5">
            <h3 className="serif text-xl text-ink">
              {status === "rejected"
                ? "Couldn't build the interview"
                : status === "stalled"
                  ? "Taking too long"
                  : status === "not_found"
                    ? "Session not found"
                    : "Something went wrong"}
            </h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              {status === "rejected"
                ? "We couldn't read enough of your materials to build a tailored interview. Try again."
                : status === "stalled"
                  ? "We waited several minutes without hearing back. Retry to keep waiting."
                  : status === "not_found"
                    ? "This session doesn't exist or has expired."
                    : "There was a temporary error preparing your interview."}
            </p>
            <button
              onClick={handleRetry}
              className={cn(
                "mt-4 inline-flex items-center gap-2 rounded-full border border-accent bg-accent-soft px-4 py-2 text-[13px] font-medium text-accent transition-colors hover:bg-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
              )}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
