"use client";

import { useEffect, useRef, useState } from "react";
import { XCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

interface WarningToastProps {
  /** null when no toast is active. */
  warning: { reason: string; count: number; max: number } | null;
  onDismiss: () => void;
}

const REASON_LABELS: Record<string, string> = {
  tab_switch: "Tab switch detected",
  no_face_visible: "Face not visible in camera",
  multiple_faces: "Multiple people detected",
  copy_paste: "Copy-paste attempt detected",
  screen_share_attempt: "Screen sharing blocked",
};

/**
 * Warning toast shown at the top center of the interview screen.
 *
 * Appears for 5 seconds on any proctoring event. Shows a human-readable
 * reason + "Warning N of M". On the final warning (count === max - 1),
 * adds a red border + extra emphasis to signal termination is imminent.
 * Smooth slide-in from top, auto-dismiss via setTimeout.
 */
export function WarningToast({ warning, onDismiss }: WarningToastProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (warning) {
      setVisible(true);
      if (timeoutRef.current != null) clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        setVisible(false);
        onDismiss();
      }, 5000);
    } else {
      setVisible(false);
    }

    return () => {
      if (timeoutRef.current != null) clearTimeout(timeoutRef.current);
    };
  }, [warning, onDismiss]);

  if (!warning) return null;

  const isFinal = warning.count >= warning.max - 1;
  const label = REASON_LABELS[warning.reason] ?? warning.reason;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "pointer-events-auto fixed top-6 left-1/2 -translate-x-1/2 z-50",
        "w-full max-w-md rounded-[10px] border px-4 py-3 shadow-lg backdrop-blur-md",
        "transition-all duration-300 ease-out",
        "flex items-start gap-3",
        isFinal
          ? "border-accent bg-accent/10"
          : "border-line bg-panel/90",
        visible ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0",
      )}
    >
      {isFinal ? (
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
      ) : (
        <AlertTriangle
          className="mt-0.5 h-5 w-5 shrink-0 text-accent"
          aria-hidden
        />
      )}
      <div className="flex-1">
        <p className={cn("text-[13px] font-medium", isFinal ? "text-accent" : "text-ink")}>
          {label}
        </p>
        <p className="text-[12px] text-muted">
          Warning {warning.count} of {warning.max}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-1 text-[11px] text-faint hover:text-ink"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
