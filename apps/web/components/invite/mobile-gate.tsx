"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

/**
 * Mobile gate — the interview runs on a desktop-class browser with a
 * stable connection. On mobile we show a friendly "use desktop" message
 * instead of starting a voice interview on a phone.
 *
 * Detection is cheap and client-side only (no navigator in SSR), so we
 * render a neutral placeholder during the first paint and switch after
 * mount to avoid hydration drift.
 */
export function MobileGate({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const isTouch = "ontouchstart" in window || (navigator as any).maxPoints > 0;
    const isSmall = window.innerWidth < 768;
    const isMobileUA =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      );
    setIsMobile(isTouch && (isSmall || isMobileUA));
  }, []);

  if (isMobile) {
    return (
      <main className="mx-auto flex min-h-[70vh] w-full max-w-[640px] px-6 py-16">
        <div className="w-full text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
            <AlertTriangle className="h-7 w-7 text-accent" />
          </div>
          <h1 className="serif mt-5 text-3xl font-medium tracking-tight text-ink">
            Please use a desktop computer
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            This interview is designed for a desktop browser with a camera and
            microphone. Please open this link on a laptop or desktop to
            continue.
          </p>
          <a
            href="/"
            className={buttonClasses({ variant: "ink", size: "md" })}
          >
            Go to homepage
          </a>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}